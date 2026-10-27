import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnline } from "./hooks/useOnline";
import { Settings } from "./components/Settings";
import { roleLine, useProfile } from "./profile/store";
import { useTheme } from "./theme/theme";
import { fmtDate } from "./analytics/dates";
import { finalise, missingNaReasons, newAudit, scoreOf, useAudits, type SavedAudit } from "./audits/store";
import { useTraining } from "./audits/training";
import { BrandHeader } from "./components/BrandHeader";
import { Dashboard } from "./components/dashboard/Dashboard";
import { StatusTag } from "./components/dashboard/status";
import { PhotoStrip } from "./components/PhotoStrip";
import { compressImage } from "./photos/compress";
import { deleteAccountPhoto, getAccountPhoto, putAccountPhoto } from "./photos/blobStore";
import { addPhoto, photosFor, photosWaiting, pruneOrphans, removePhoto } from "./photos/photos";
import { PhotoAccess, usePhotoLoader } from "./photos/PhotoAccess";
import { ScorePanel } from "./components/ScorePanel";
import { Sites } from "./components/Sites";
import { activeRuleSetCode, ruleSet, ruleSets } from "./scoring/catalog";
import { auditTemplate, facilityTypes, templateItemCount } from "./facilities/catalog";
import { FacilitySelection, initialFacilitySelection, type FacilitySelectionValue } from "./facilities/FacilitySelection";
import type { Result } from "./scoring/types";
import { useSites } from "./sites/store";
import { API_URL, pending } from "./sync/sync";
import { AccountProvider, useAccountStore } from "./sync/accountStore";
import { loadRemotePhoto, syncAccount } from "./sync/twoWay";
import { loadSession } from "./auth/session";
import { hasLegacyRecords, importLegacy } from "./sync/legacy";
import { AuthGate } from "./components/auth/AuthGate";
import type { Auth } from "./auth/useAuth";
import { Navigation, type Page } from "./components/Navigation";
import { PageHeading } from "./components/PageHeading";
import { GuidedTours } from "./tour/GuidedTours";
import { BILLING_REQUIRED, BillingProvider, useBilling } from "./billing/BillingProvider";
import { putAccountPhotoWithinQuota } from "./photos/blobStore";
import { StartupReady } from "./components/StartupReady";
import { WorkspaceEntry } from "./components/onboarding/VerificationWelcome";
import { WorkspaceSetup, useSetupProgress } from "./components/onboarding/WorkspaceSetup";

const RESULTS: { value: Result; label: string; icon: string; cls: string }[] = [
  { value: "COMPLIANT", label: "Compliant", icon: "✓", cls: "c" },
  { value: "PARTIALLY_COMPLIANT", label: "Partly", icon: "▲", cls: "p" },
  { value: "NON_COMPLIANT", label: "Non-compliant", icon: "✕", cls: "n" },
  { value: "NA", label: "N/A", icon: "–", cls: "na" },
];
const nice = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const SEV: Record<string, string> = { CRITICAL: "Critical", MAJOR: "Major", MINOR: "Minor" };
const saveLabel = (a: SavedAudit) => a.state === "draft" ? "Draft saved" : a.synced ? "Uploaded" : API_URL ? "Saved, uploads when online" : "Saved on this phone";
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export default function App() {
  return <AuthGate>{(auth) => {
    const account = auth.user?.id ?? "local-only";
    if (BILLING_REQUIRED && !auth.enabled) return <main className="app startup-state"><StartupReady /><h1>Workspace unavailable</h1><p role="alert">The production API URL is missing. AudEx cannot open until this is configured.</p></main>;
    return <AccountProvider key={account} account={account}><BillingProvider key={account} auth={auth}><WorkspaceEntry auth={auth}><Main key={account} auth={auth} /></WorkspaceEntry></BillingProvider></AccountProvider>;
  }}</AuthGate>;
}

function Main({ auth }: { auth: Auth }) {
  const { store, data } = useAccountStore();
  const billing = useBilling();
  const setup = useSetupProgress(store.account, data.audits.length > 0);
  const [tab, setTab] = useState<Page>(() => new URLSearchParams(window.location.search).get("billing") === "return" ? "settings" : "audit");
  const [profile, saveProfile, profileError] = useProfile();
  const [profileSyncError, setProfileSyncError] = useState("");
  const [theme, setTheme] = useTheme();
  const { sites, add, update, archive } = useSites();
  const { audits, save, remove } = useAudits();
  const training = useTraining();
  const [openId, setOpenId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ruleCode, setRuleCode] = useState(activeRuleSetCode);
  const [facilitySelection, setFacilitySelection] = useState<FacilitySelectionValue>(initialFacilitySelection);
  const active = sites.filter((s) => !s.archived);
  const current = audits.find((a) => a.id === openId) ?? null;
  const queued = pending(audits).length;
  const online = useOnline();
  const draft = [...audits].reverse().find((a) => a.state === "draft");
  const finalAudits = audits.filter((a) => a.state === "final");

  // The server stamps each audit with the signed-in person's name, so keep the name on reports in step with it once per sign-in.
  const userId = auth.user?.id;
  useEffect(() => {
    if (auth.user && auth.user.displayName && auth.user.displayName !== profile.name) saveProfile({ ...profile, name: auth.user.displayName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // Changing name or phone in Settings also updates the account when online; the phone copy is always saved.
  const onSaveProfile = (p: typeof profile) => {
    if (!saveProfile(p)) return false;
    setup.update({ profileConfirmed: true });
    const u = auth.user;
    setProfileSyncError("");
    if (u) void auth.api.updateMe({ displayName: p.name.trim(), email: u.email, phone: p.phone.trim() }).then(auth.setUser).catch(() => {
      if (alive.current) setProfileSyncError("Report details are saved on this device, but your account name and phone could not be updated on the server. Reconnect and save your profile again.");
    });
    return true;
  };

  const photosQueued = photosWaiting(audits);
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const runSync = useCallback(async () => {
    if (!API_URL || !auth.user) return;
    const session = loadSession();
    const current = () => alive.current && loadSession()?.token === session?.token && loadSession()?.user.id === store.account;
    setSyncing(true); setSyncError("");
    try {
      await syncAccount(store, API_URL, auth.authFetch, current, billing.writable);
      if (current()) setLastSync(new Date().toLocaleTimeString());
    } catch (e) { if (current()) setSyncError(e instanceof Error ? e.message : "Sync failed. Retry when connected."); }
    finally { if (alive.current) setSyncing(false); }
  }, [store, auth.user?.id, auth.authFetch, billing.writable]);
  const pendingKey = JSON.stringify([data.sites.filter((s) => s.dirty), data.training.filter((s) => s.dirty), queued, photosQueued]);
  useEffect(() => {
    if (online) void runSync();
  }, [online, runSync, pendingKey]);
  const loadPhoto = useCallback(async (auditId: string, photoId: string) => {
    if (!auth.user || !API_URL) return getAccountPhoto(store.account, photoId);
    const session = loadSession();
    return loadRemotePhoto(store.account, auditId, photoId, API_URL, auth.authFetch,
      () => alive.current && loadSession()?.token === session?.token && loadSession()?.user.id === store.account);
  }, [store, auth.user?.id, auth.authFetch]);

  const real = useMemo(() => ({
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
    audits: audits.flatMap((a) => (a.summary ? [a.summary] : [])),
    trainings: training.sessions,
  }), [sites, audits, training.sessions]);

  const start = () => {
    if (!billing.permit()) return;
    const site = active.find((s) => s.id === siteId);
    if (!site) return;
    const a = newAudit(crypto.randomUUID(), site, date, ruleCode, { name: profile.name, role: roleLine(profile) }, facilitySelection);
    save(a); setOpenId(a.id);
  };

  return (
    <PhotoAccess.Provider value={loadPhoto}><main className="app">
      <StartupReady />
      <BrandHeader>
        <GuidedTours auth={auth} page={tab} onNavigate={setTab} busy={!!current || syncing} />
        {current && tab === "audit" && <span className="syncbadge">{saveLabel(current)}</span>}
        <button type="button" className="gear" aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </BrandHeader>
      {!online && <p className="offline" role="status">{billing.writable ? "You are offline. Work is saved on this phone within your current offline entitlement window." : "You are offline. Existing downloaded records remain readable. Reconnect to refresh editing access."}</p>}
      {!billing.legacy && (!billing.writable || billing.error) && <p className="warn" role="status">
        {billing.error || "Editing is paused; your records and drafts are preserved. Open Settings to verify your email, refresh access or choose a plan."}
        {" "}<button className="chip" type="button" onClick={() => setTab("settings")}>Subscription settings</button></p>}
      {API_URL && <p className="small" role="status" data-tour="sync">{syncing ? "Syncing your account…" : lastSync ? `Last synced ${lastSync}` : "Records are saved offline for this account."}{" "}
        <button type="button" className="chip" disabled={syncing || !online} onClick={() => void runSync()}>Sync now</button></p>}
      {(syncError || store.error) && <p className="warn" role="alert">{store.error || syncError} <button type="button" className="chip" onClick={() => void runSync()}>Retry</button></p>}
      {hasLegacyRecords() && <p className="banner">Older device records are unassigned and have not been synced to this account.{" "}
        <button type="button" className="chip" onClick={async () => {
          if (!billing.permit() || !window.confirm("Only import if ALL older records on this device belong to your signed-in account. They will be uploaded to this account and cannot be shared with another account. Confirm ownership and import?")) return;
          try { await importLegacy(store); }
          catch (e) { setSyncError(e instanceof Error ? e.message : "Import failed. Original records have been kept."); }
        }}>Confirm ownership and import</button></p>}

      <Navigation page={tab} onNavigate={setTab} />

      <section className="app-content" data-tour={tab}>
        {setup.error && <p className="warn" role="alert">{setup.error}</p>}
        {(profileError || profileSyncError) && <p className="warn" role="alert">{profileError || profileSyncError}</p>}
        {tab === "audit" && !current && finalAudits.length === 0 && <WorkspaceSetup name={auth.user?.displayName.split(" ")[0] ?? ""} progress={setup.progress}
          hasSites={sites.length > 0} hasAudit={audits.length > 0} writable={billing.writable} onUpdate={setup.update} onNavigate={setTab} />}
        {tab === "audit" && !current && draft && <section className="card continue-audit"><span className="onboarding-eyebrow">RIGHT WHERE YOU LEFT OFF</span>
          <h2>{draft.siteName}</h2><p>Your unfinished audit from {fmtDate(draft.date)} is saved on this device.</p>
          <button className="btn" onClick={() => setOpenId(draft.id)}>{billing.writable ? "Continue your audit" : "View your saved draft"}</button></section>}
        {tab === "audit" && (!current || current.state === "final") && finalAudits.length === 1 && !setup.progress.celebrated && <section className="card first-report" aria-labelledby="first-report-title">
          <span className="onboarding-eyebrow">YOUR FIRST CLEARER PICTURE</span><h2 id="first-report-title">One audit. A useful next step.</h2>
          <p>Your first finalised audit is ready to review and export. Open it to download a PDF; connect first if its photos are not cached on this device.</p>
          <div className="onboarding-footer"><button className="btn" onClick={() => setOpenId(finalAudits[0].id)}>View audit and report</button><button className="chip" onClick={() => setup.update({ celebrated: true })}>Got it</button></div>
        </section>}
        {tab === "audit" && <PageHeading title="Audit" description="Start a housekeeping audit or continue a saved audit." />}
        {tab === "dashboard" && <Dashboard real={real} author={{ name: profile.name, role: roleLine(profile) }} />}
        {tab === "settings" && <Settings profile={profile} onSaveProfile={onSaveProfile} theme={theme} onTheme={setTheme} auth={auth} unsynced={queued} />}
        {tab === "sites" && <Sites sites={sites} onAdd={add} onUpdate={update} onArchive={archive}
          training={training.sessions} onAddTraining={training.add} onRemoveTraining={training.remove} />}
        {tab === "audit" && (current
          ? <AuditScreen audit={current} onChange={save} onClose={() => setOpenId(null)} />
          : <div className="start-page">
            <section className="card startaudit" data-tour="audit-start">
              <h2>Start an audit</h2>
              {active.length === 0 ? <><p className="empty">Add the site you are auditing first.</p>
                <button type="button" className="btn" onClick={() => setTab("sites")}>Add a site</button></> : <>
                <label className="field">Site<select value={siteId} onChange={(e) => {
                  setSiteId(e.target.value);
                  const type = active.find((site) => site.id === e.target.value)?.facilityType;
                  setFacilitySelection({ ...initialFacilitySelection, facilityType: facilityTypes.find((item) => item.code === type)?.code ?? null });
                }}>
                  <option value="">Choose a site…</option>{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="field">Audit date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <FacilitySelection value={facilitySelection} onChange={setFacilitySelection} />
                <button type="button" className="btn" disabled={!siteId || !billing.writable} onClick={start}>Start audit</button>
                <details className="adv"><summary>Scoring rules (advanced)</summary>
                  <select aria-label="Scoring rules" value={ruleCode} onChange={(e) => setRuleCode(e.target.value)}>
                    {ruleSets.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
                  <p className="small">Leave this on the current WPC rules unless you have been told to change it.</p></details></>}
              {!installed() && finalAudits.length > 0 && <p className="tip">Make room for your next audit: add AudEx to your home screen from your browser menu. Load it online before offline use. Installation is not a backup; keep important exports and synced copies.</p>}
            </section>
            <AuditList audits={audits} onOpen={setOpenId} onDelete={(id) => { if (!billing.permit() || !window.confirm("Delete this unfinished audit? This cannot be undone.")) return; audits.find((a) => a.id === id)?.photos?.forEach((ph) => void deleteAccountPhoto(store.account, ph.id).catch(() => undefined)); remove(id); }} />
          </div>)}
      </section>
    </main></PhotoAccess.Provider>
  );
}

function AuditList({ audits, onOpen, onDelete }: { audits: SavedAudit[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  if (!audits.length) return null;
  const sorted = [...audits].sort((a, b) => (b.state === a.state ? b.date.localeCompare(a.date) : a.state === "draft" ? -1 : 1));
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h2>Your audits</h2>
      <ul className="auditlist">{sorted.map((a) => (
        <li key={a.id}>
          <div><strong>{a.siteName}</strong><div className="small">{fmtDate(a.date)} · {a.state === "draft" ? "In progress" : saveLabel(a)}</div>
            {a.summary && <div className="small">{a.summary.percent}% <StatusTag status={a.summary.status} /></div>}</div>
          <div className="sitelist__btns">
            <button type="button" className="chip" onClick={() => onOpen(a.id)}>{a.state === "draft" ? "Continue" : "View"}</button>
            {a.state === "draft" && <button type="button" className="chip" onClick={() => onDelete(a.id)}>Delete</button>}
          </div>
        </li>))}</ul>
    </section>
  );
}

function AuditScreen({ audit, onChange, onClose }: { audit: SavedAudit; onChange: (a: SavedAudit) => void; onClose: () => void }) {
  const { store } = useAccountStore();
  const billing = useBilling();
  const loadPhoto = usePhotoLoader();
  const rules = ruleSet(audit.ruleSetCode);
  const template = useMemo(() => auditTemplate(audit), [audit.templateSnapshot, audit.templateCode, audit.facilityType, audit.facilityAreas]);
  const sections = template.sections;
  const totalItems = templateItemCount(template);
  const score = useMemo(() => scoreOf(audit), [audit]);
  const locked = audit.state === "final" || !billing.writable;
  const missing = useMemo(() => new Set(missingNaReasons(audit)), [audit]);
  const todo = score.unanswered + missing.size;
  const set = (patch: Partial<SavedAudit>) => onChange({ ...audit, ...patch });
  const latest = useRef(audit); latest.current = audit;
  const [photoError, setPhotoError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");

  const attach = async (file: File, itemKey: string | null) => {
    try {
      setPhotoError("");
      if (!billing.permit()) return;
      const id = crypto.randomUUID();
      const blob = await compressImage(file);
      if (!billing.permit()) return;
      const a = billing.access;
      if (!billing.legacy && a && a.plan !== "COMPLIMENTARY") {
        if (!a.usageKnown) throw new Error("Legacy photo storage must be reconciled by the administrator before adding photos.");
        const uploaded = new Set(store.data.audits.flatMap((x) => (x.photos ?? []).filter((p) => p.uploaded).map((p) => p.id)));
        await putAccountPhotoWithinQuota(store.account, id, blob, Math.max(0, a.storageBytes - a.usedBytes), uploaded);
      } else await putAccountPhoto(store.account, id, blob);
      if (!billing.permit()) { await deleteAccountPhoto(store.account, id); return; }
      onChange(addPhoto(latest.current, { id, itemKey, caption: "", takenAt: new Date().toISOString() }));
    } catch (e) { setPhotoError(e instanceof Error ? e.message : "That photo could not be saved. Please try again."); }
  };
  const detach = (id: string) => { if (!billing.permit()) return; onChange(removePhoto(latest.current, id)); void deleteAccountPhoto(store.account, id).catch(() => setPhotoError("Photo metadata was removed but its device file could not be deleted.")); };
  const doFinalise = () => {
    if (!billing.permit()) return;
    const { audit: pruned, removed } = pruneOrphans(audit);
    removed.forEach((id) => void deleteAccountPhoto(store.account, id).catch(() => undefined));
    onChange(finalise(pruned, new Date().toISOString()));
    setConfirming(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Opens the next item that still needs an answer (or an N/A reason) and scrolls to it. */
  const goToNext = () => {
    for (const s of sections) for (const i of s.items) {
      if (audit.answers[i.key] === undefined || missing.has(i.key)) {
        setOpen((o) => new Set(o).add(s.code)); setFlash(i.key);
        setTimeout(() => document.getElementById(`item-${i.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
        setTimeout(() => setFlash(""), 2200);
        return;
      }
    }
  };
  const answered = (code: string) => sections.find((s) => s.code === code)!.items.filter((i) => audit.answers[i.key] !== undefined).length;

  return (
    <div className="audit-page">
      <p className="auditing" data-tour="audit-start"><span><strong>{audit.siteName}</strong><br />{fmtDate(audit.date)}</span>
        <button type="button" className="chip" onClick={onClose}>Back to audits</button></p>
      <details className="audit-scope"><summary>{template.name} · v{template.version} · {template.facilityName}</summary>
        <p className="small">{template.notice}</p>
        <p className="small">Areas recorded: {template.areas.map((area) => area.name).join(", ") || "None recorded"}. {totalItems} checklist items. Scope is fixed for this audit.</p>
      </details>
      <ScorePanel score={score} rules={rules} answered={totalItems - score.unanswered} total={totalItems} />
      {audit.state === "final" && <p className="banner banner--ok">This audit is finalised and saved. Answers can no longer be changed.</p>}
      {audit.state === "draft" && !billing.writable && <p className="banner">This draft has been preserved. Renew or refresh access to edit it again.</p>}
      <section className="card form">
        <label className="field">Unit manager<input value={audit.unitManager} disabled={locked} onChange={(e) => set({ unitManager: e.target.value })} /></label>
        <label className="field">Housekeeping supervisor<input value={audit.supervisor} disabled={locked} onChange={(e) => set({ supervisor: e.target.value })} /></label>
        <PhotoStrip auditId={audit.id} photos={photosFor(audit, null)} locked={locked} label="Add a photo of the site" onAdd={(f) => attach(f, null)} onRemove={detach} />
        {photoError && <p className="warn" role="alert">{photoError}</p>}
        {audit.state === "final" && <button type="button" className="btn" onClick={async () => {
          try { await (await import("./report/auditPdf")).downloadAuditReport(audit, (id) => loadPhoto(audit.id, id)); }
          catch (e) { setPhotoError(e instanceof Error ? e.message : "Report could not be downloaded."); }
        }}>Download audit report (PDF)</button>}
        <button type="button" className="chip" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = `audex-${audit.id}-${audit.state}.json`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Export audit data{audit.state === "draft" ? " (unfinished draft)" : ""}</button>
      </section>
      {!locked && (
        <details className="card howto">
          <summary>How to answer</summary>
          <ul>
            <li><strong>Compliant</strong>: fully meets the standard.</li>
            <li><strong>Partly</strong>: meets some of it. Counts as half marks.</li>
            <li><strong>Non-compliant</strong>: does not meet the standard.</li>
            <li><strong>N/A</strong>: does not exist at this site. You will be asked why.</li>
          </ul>
          <p className="small">Everything you enter is saved automatically. You can close the app and carry on later.</p>
        </details>)}
      {sections.map((s) => {
        const done = answered(s.code), full = done === s.items.length;
        return (
          <details key={s.code} open={open.has(s.code)}
            onToggle={(e) => { const isOpen = (e.currentTarget as HTMLDetailsElement).open; setOpen((o) => { const n = new Set(o); isOpen ? n.add(s.code) : n.delete(s.code); return n; }); }}>
            <summary>
              <span className="sec__name">{nice(s.name)}{s.highRisk && <span className="risk">High risk</span>}</span>
              <span className={`sec__count${full ? " sec__count--done" : ""}`}>{full ? "✓ " : ""}{done}/{s.items.length}</span>
            </summary>
            {s.items.map((i) => (
              <fieldset key={i.key} id={`item-${i.key}`} className={flash === i.key ? "flash" : undefined}>
                <legend>{i.text} <span className={`sev sev--${i.severity.toLowerCase()}`}>{SEV[i.severity]}</span></legend>
                <div className="opts">
                  {RESULTS.map((r) => (
                    <label key={r.value} className={`opt opt--${r.cls}`}>
                      <input type="radio" name={i.key} disabled={locked} checked={audit.answers[i.key] === r.value}
                        onChange={() => set({ answers: { ...audit.answers, [i.key]: r.value } })} />
                      <span aria-hidden>{r.icon}</span> {r.label}
                    </label>))}
                </div>
                {(audit.answers[i.key] === "NON_COMPLIANT" || audit.answers[i.key] === "PARTIALLY_COMPLIANT" || photosFor(audit, i.key).length > 0) && (
                  <PhotoStrip auditId={audit.id} photos={photosFor(audit, i.key)} locked={locked} label="Add photo" onAdd={(f) => attach(f, i.key)} onRemove={detach} />)}
                {audit.answers[i.key] === "NA" && (
                  <label className="field narow">Why is this not applicable? (required)
                    <input value={audit.naReasons?.[i.key] ?? ""} disabled={locked}
                      onChange={(e) => set({ naReasons: { ...audit.naReasons, [i.key]: e.target.value } })} /></label>)}
              </fieldset>))}
          </details>);
      })}
      {!locked && (
        <div className="finalbar">
          {confirming ? (
            <div className="card confirm" role="alertdialog" aria-label="Finalise this audit">
              <strong>Finalise this audit?</strong>
              <p>Result: {score.percent}%. Once finalised you cannot change the answers.</p>
              <div className="filters__row">
                <button type="button" className="btn" onClick={doFinalise}>Yes, finalise</button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>Keep editing</button>
              </div>
            </div>
          ) : todo > 0 ? (
            <button type="button" className="btn btn--wide" onClick={goToNext}>Next item to complete ({todo} left)</button>
          ) : (
            <button type="button" className="btn btn--wide" onClick={() => setConfirming(true)}>Finalise audit</button>)}
        </div>)}
    </div>
  );
}
