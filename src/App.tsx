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
import { auditTemplate, resolveTemplate, templateItemCount, facilityTypes } from "./facilities/catalog";
import { FacilitySelection, initialFacilitySelection, selectionForFacility, type FacilitySelectionValue } from "./facilities/FacilitySelection";
import { AnswerOptions } from "./components/AnswerOptions";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { UnsavedChanges, useNavigationGuard } from "./components/UnsavedChanges";
import { auditSaveLabel, itemComplete, sectionProgress } from "./audits/progress";
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

const nice = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const SEV: Record<string, string> = { CRITICAL: "Critical", MAJOR: "Major", MINOR: "Minor" };
const saveLabel = (a: SavedAudit) => auditSaveLabel(a, !!API_URL);
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export default function App() {
  return <AuthGate>{(auth) => {
    const account = auth.user?.id ?? "local-only";
    if (BILLING_REQUIRED && !auth.enabled) return <main className="app startup-state"><StartupReady /><h1>Workspace unavailable</h1><p role="alert">The production API URL is missing. AudEx cannot open until this is configured.</p></main>;
    return <AccountProvider key={account} account={account}><BillingProvider key={account} auth={auth}><UnsavedChanges><WorkspaceEntry auth={auth}><Main key={account} auth={auth} /></WorkspaceEntry></UnsavedChanges></BillingProvider></AccountProvider>;
  }}</AuthGate>;
}

function Main({ auth }: { auth: Auth }) {
  const { store, data } = useAccountStore();
  const billing = useBilling();
  const setup = useSetupProgress(store.account, data.audits.length > 0);
  const [tab, setTab] = useState<Page>(() => new URLSearchParams(window.location.search).get("billing") === "return" ? "settings" : "audit");
  const guard = useNavigationGuard();
  const navigate = useCallback((page: Page) => { if (page !== tab) guard(() => setTab(page)); }, [guard, tab]);
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
  const selectedTemplate = resolveTemplate(facilitySelection.templateCode, facilitySelection.facilityType, facilitySelection.areas);
  const selectedSite = active.find(site => site.id === siteId);
  const [startError, setStartError] = useState("");

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
    if (!site || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setStartError("Choose a site and a valid audit date before starting."); return; }
    setStartError("");
    const a = newAudit(crypto.randomUUID(), site, date, ruleCode, { name: profile.name, role: roleLine(profile) }, facilitySelection);
    save(a); setOpenId(a.id);
  };

  return (
    <PhotoAccess.Provider value={loadPhoto}><main className="app">
      <StartupReady />
      <BrandHeader>
        <GuidedTours auth={auth} page={tab} onNavigate={navigate} busy={!!current || syncing} />
        <button type="button" className="gear" aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => navigate("settings")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </BrandHeader>
      <div className="workspace-notices">
      {!online && <p className="offline" role="status">{billing.writable ? "You are offline. Work is saved on this device within your current offline entitlement window." : "You are offline. Existing downloaded records remain readable. Reconnect to refresh editing access."}</p>}
      {!billing.legacy && (!billing.writable || billing.error) && <p className="warn" role="status">
        {billing.error || "Editing is paused; your records and drafts are preserved. Open Settings to verify your email, refresh access or choose a plan."}
        {" "}<button className="chip" type="button" onClick={() => navigate("settings")}>Subscription settings</button></p>}
      {API_URL && <div className="workspace-sync" role="status" data-tour="sync"><span>{syncing ? "Syncing your account…" : syncError ? "Sync failed. Your saved device records are preserved." : lastSync ? `Last synced ${lastSync}` : "Records are saved on this device."}
        <small>{queued || photosQueued ? `${queued} audit(s) and ${photosQueued} photo(s) waiting to upload. ` : ""}Draft audits stay on this device only.</small></span>
        <button type="button" className="chip" disabled={syncing || !online} onClick={() => void runSync()}>Sync now</button></div>}
      {store.error && <p className="warn" role="alert">{store.error} <button type="button" className="chip" onClick={() => {
        void store.retryPersistence().catch(error => setSyncError(error instanceof Error ? error.message : "The device save could not be retried. Export your work before leaving."));
      }}>Retry device save</button></p>}
      {syncError && <p className="warn" role="alert">{syncError}{API_URL && <button type="button" className="chip" onClick={() => void runSync()}>Retry sync</button>}</p>}
      {hasLegacyRecords() && <p className="banner">Older device records are unassigned and have not been synced to this account.{" "}
        <button type="button" className="chip" onClick={async () => {
          if (!billing.permit() || !window.confirm("Only import if ALL older records on this device belong to your signed-in account. They will be uploaded to this account and cannot be shared with another account. Confirm ownership and import?")) return;
          try { await importLegacy(store); }
          catch (e) { setSyncError(e instanceof Error ? e.message : "Import failed. Original records have been kept."); }
        }}>Confirm ownership and import</button></p>}

      </div>
      <Navigation page={tab} onNavigate={page => { if (page !== tab) navigate(page); }} />

      <section className="app-content" data-tour={tab}>
        {setup.error && <p className="warn" role="alert">{setup.error}</p>}
        {(profileError || profileSyncError) && <p className="warn" role="alert">{profileError || profileSyncError}</p>}
        {tab === "audit" && <PageHeading title="Audit" description={current ? "Record findings, review progress and finalise when ready." : "Start a housekeeping audit or continue your saved work."} />}
        {tab === "audit" && !current && audits.length > 0 && <nav className="audit-shortcuts" aria-label="Audit tasks"><a className="chip" href="#start-audit">Start a new audit</a><a className="chip" href="#saved-work">Your saved work</a></nav>}
        {tab === "audit" && !current && finalAudits.length === 0 && <WorkspaceSetup name={auth.user?.displayName.split(" ")[0] ?? ""} progress={setup.progress}
          hasSites={sites.length > 0} hasAudit={audits.length > 0} writable={billing.writable} onUpdate={setup.update} onNavigate={navigate} />}
        {tab === "audit" && !current && draft && <section className="card continue-audit"><span className="onboarding-eyebrow">RIGHT WHERE YOU LEFT OFF</span>
          <h2>{draft.siteName}</h2><p>Your unfinished audit from {fmtDate(draft.date)} is saved on this device.</p>
          <button className="btn" onClick={() => setOpenId(draft.id)}>{billing.writable ? "Continue your audit" : "View your saved draft"}</button></section>}
        {tab === "audit" && (!current || current.state === "final") && finalAudits.length === 1 && !setup.progress.celebrated && <section className="card first-report" aria-labelledby="first-report-title">
          <span className="onboarding-eyebrow">YOUR FIRST CLEARER PICTURE</span><h2 id="first-report-title">One audit. A useful next step.</h2>
          <p>Your first finalised audit is ready to review and export. Open it to download a PDF; connect first if its photos are not cached on this device.</p>
          <div className="onboarding-footer"><button className="btn" onClick={() => setOpenId(finalAudits[0].id)}>View audit and report</button><button className="chip" onClick={() => setup.update({ celebrated: true })}>Got it</button></div>
        </section>}
        {tab === "dashboard" && <Dashboard real={real} author={{ name: profile.name, role: roleLine(profile) }} />}
        {tab === "settings" && <Settings profile={profile} onSaveProfile={onSaveProfile} theme={theme} onTheme={setTheme} auth={auth} unsynced={queued} />}
        {tab === "sites" && <Sites sites={sites} onAdd={add} onUpdate={update} onArchive={archive}
          training={training.sessions} onAddTraining={training.add} onRemoveTraining={training.remove} />}
        {tab === "audit" && (current
          ? <AuditScreen key={current.id} audit={current} onChange={save} onClose={() => setOpenId(null)} />
          : <div className="start-page">
            <section className="card startaudit" id="start-audit" data-tour="audit-start">
              <h2>Start an audit</h2>
              <p className="small">Choose your site, confirm what you will inspect, then review and start. Nothing is finalised until you confirm it.</p>
              {active.length === 0 ? <><p className="empty">Add the site you are auditing first.</p>
                <button type="button" className="btn" onClick={() => navigate("sites")}>Add a site</button></> : <div className="audit-setup-layout"><div className="audit-setup-fields">
                <h3 className="step-title"><span>1</span> Where and when?</h3>
                <div className="form-pair"><label className="field">Site (required)<select value={siteId} onChange={(e) => {
                  setSiteId(e.target.value);
                  const type = active.find((site) => site.id === e.target.value)?.facilityType;
                  setFacilitySelection(selectionForFacility(type));
                }}>
                  <option value="">Choose a site…</option>{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="field">Audit date (required)<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label></div>
                {selectedSite && <p className="small">Saved site classification: {facilityTypes.find(type => type.code === selectedSite.facilityType)?.name ?? "Not specified"}. The choices below apply to this audit only.</p>}
                <FacilitySelection value={facilitySelection} onChange={setFacilitySelection} />
                <details className="adv"><summary>Scoring rules (advanced)</summary>
                  <select aria-label="Scoring rules" value={ruleCode} onChange={(e) => setRuleCode(e.target.value)}>
                    {ruleSets.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
                  <p className="small">WPC identifies the source methodology, not a requirement to work for WPC. Keep the current rules unless your organisation has authorised a different set. Neither the rules nor a score certify regulatory compliance.</p></details>
                </div><aside className="audit-review" aria-labelledby="audit-review-title">
                  <h3 id="audit-review-title" className="step-title"><span>3</span> Review and start</h3>
                  <dl className="review-list"><div><dt>Site</dt><dd>{selectedSite?.name ?? "Choose a site"}</dd></div>
                    <div><dt>Date</dt><dd>{date ? fmtDate(date) : "Choose a date"}</dd></div>
                    <div><dt>Facility</dt><dd>{selectedTemplate.facilityName}</dd></div>
                    <div><dt>Checklist</dt><dd>{selectedTemplate.name} · v{selectedTemplate.version}</dd></div>
                    <div><dt>Areas / services</dt><dd>{selectedTemplate.areas.map(area => area.name).join(", ") || "None recorded"}</dd></div>
                    <div><dt>Scoring rules</dt><dd>{ruleSet(ruleCode).name}</dd></div></dl>
                  <p className="scope-total"><strong>{templateItemCount(selectedTemplate)}</strong> checks included</p>
                  <p className="small">Confirm every service present. This scope is fixed when you start; it does not certify regulatory compliance.</p>
                  {startError && <p className="warn" role="alert">{startError}</p>}
                  {!billing.writable && <p className="warn">Editing is paused. Review your access in Settings.</p>}
                  <button type="button" className="btn btn--wide" disabled={!siteId || !date || !billing.writable} onClick={start}>Start audit · {templateItemCount(selectedTemplate)} checks</button>
                  {!siteId && <p className="small">Choose a site in step 1 to continue.</p>}
                  <p className="small">Draft answers save on this device as you work. Finalised audits can upload when connected and entitled.</p>
                </aside></div>}
              {!installed() && finalAudits.length > 0 && <p className="tip">Make room for your next audit: add AudEx to your home screen from your browser menu. Load it online before offline use. Installation is not a backup; keep important exports and synced copies.</p>}
            </section>
            <AuditList audits={audits} onOpen={setOpenId} onDelete={(id) => { if (!billing.permit() || !window.confirm("Delete this unfinished audit? This cannot be undone.")) return; audits.find((a) => a.id === id)?.photos?.forEach((ph) => void deleteAccountPhoto(store.account, ph.id).catch(() => setSyncError("The draft was deleted, but a device photo could not be removed."))); remove(id); }} />
          </div>)}
      </section>
    </main></PhotoAccess.Provider>
  );
}

function AuditList({ audits, onOpen, onDelete }: { audits: SavedAudit[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  if (!audits.length) return null;
  const sorted = [...audits].filter(a => a.siteName.toLowerCase().includes(query.trim().toLowerCase()) && (filter === "all" || a.state === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="card saved-audits" id="saved-work">
      <h2>Your saved work</h2><p className="small">Continue a draft or open a completed audit to view its report.</p>
      <div className="form-pair"><label className="field">Find a site<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="field">Show<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All audits</option><option value="draft">In progress</option><option value="final">Completed audits</option></select></label></div>
      {sorted.length === 0 && <p className="empty" role="status">No audits match. Try another site name or filter.</p>}
      {(["draft", "final"] as const).map(state => {
        const group = sorted.filter(a => a.state === state);
        return group.length > 0 && <section key={state}><h3>{state === "draft" ? "In progress" : "Completed audits"} ({group.length})</h3>
      <ul className="auditlist">{group.map((a) => (
        <li key={a.id}>
          <div><strong>{a.siteName}</strong><div className="small">{fmtDate(a.date)} · {saveLabel(a)}</div>
            <div className="small">{auditTemplate(a).name}</div>
            {a.state === "draft" && <div className="small">{sectionProgress(a, auditTemplate(a).sections.flatMap(s => s.items)).complete} of {templateItemCount(auditTemplate(a))} checks complete</div>}
            {a.summary && <div className="small">{a.summary.percent}% <StatusTag status={a.summary.status} /></div>}</div>
          <div className="sitelist__btns">
            <button type="button" className="chip" onClick={() => onOpen(a.id)}>{a.state === "draft" ? "Open draft" : "View audit & report"}</button>
            {a.state === "draft" && <button type="button" className="chip danger-action" onClick={() => onDelete(a.id)}>Delete draft</button>}
          </div>
        </li>))}</ul></section>;
      })}
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
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.filter(s => s.items.some(i => !itemComplete(audit, i.key))).slice(0, 1).map(s => s.code)));
  const [flash, setFlash] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const attach = async (file: File, itemKey: string | null) => {
    try {
      setPhotoError("");
      setPhotoBusy(true);
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
    finally { setPhotoBusy(false); }
  };
  const detach = (id: string) => { if (!billing.permit()) return; onChange(removePhoto(latest.current, id)); void deleteAccountPhoto(store.account, id).catch(() => setPhotoError("Photo metadata was removed but its device file could not be deleted.")); };
  const doFinalise = () => {
    if (!billing.permit() || photoBusy || todo > 0 || score.status === "INCOMPLETE") return;
    const { audit: pruned, removed } = pruneOrphans(audit);
    removed.forEach((id) => void deleteAccountPhoto(store.account, id).catch(() => setPhotoError("The audit was finalised, but an unused device photo could not be removed.")));
    onChange(finalise(pruned, new Date().toISOString()));
    setConfirming(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Opens the next item that still needs an answer (or an N/A reason) and scrolls to it. */
  const goToNext = () => {
    for (const s of sections) for (const i of s.items) {
      if (!itemComplete(audit, i.key)) {
        setReviewOnly(false);
        setOpen((o) => new Set(o).add(s.code)); setFlash(i.key);
        setTimeout(() => {
          const item = document.getElementById(`item-${i.key}`);
          item?.scrollIntoView({ behavior: "smooth", block: "center" });
          item?.focus({ preventScroll: true });
        }, 60);
        setTimeout(() => setFlash(""), 2200);
        return;
      }
    }
  };

  return (
    <div className="audit-page">
      <p className="auditing" data-tour="audit-start"><span><strong>{audit.siteName}</strong><br />{fmtDate(audit.date)}</span>
        <button type="button" className="chip" disabled={photoBusy} onClick={async () => {
          try { await store.retryPersistence(); onClose(); }
          catch { setPhotoError("Device storage could not save this audit. Keep this page open, export your audit data and retry the device save."); }
        }}>{audit.state === "draft" ? "Save & back to audits" : "Back to audits"}</button></p>
      <p className="audit-save-state" role="status">{store.error ? "Device save failed. Check the error before leaving." : saveLabel(audit)}{photoBusy && " · Saving photo..."}</p>
      <details className="audit-scope"><summary>{template.name} · v{template.version} · {template.facilityName}</summary>
        <p className="small">{template.notice}</p>
        <p className="small">Areas recorded: {template.areas.map((area) => area.name).join(", ") || "None recorded"}. {totalItems} checklist items. Scope is fixed for this audit.</p>
      </details>
      <ScorePanel score={score} rules={rules} answered={totalItems - score.unanswered} total={totalItems} draft={audit.state === "draft"} reasonsNeeded={missing.size} />
      {audit.state === "final" && <p className="banner banner--ok">This audit is finalised and saved. Answers can no longer be changed.</p>}
      {audit.state === "draft" && !billing.writable && <p className="banner">This draft has been preserved. Renew or refresh access to edit it again.</p>}
      {photoError && <p className="warn" role="alert">{photoError}</p>}
      <details className="audit-details"><summary>Audit details & site photos</summary>
        <p className="small">Optional report details. Checklist answers below save as you work.</p>
        <div className="form-pair"><label className="field">Unit manager<input value={audit.unitManager} disabled={locked} onChange={(e) => set({ unitManager: e.target.value })} /></label>
        <label className="field">Housekeeping supervisor<input value={audit.supervisor} disabled={locked} onChange={(e) => set({ supervisor: e.target.value })} /></label></div>
        <PhotoStrip auditId={audit.id} photos={photosFor(audit, null)} locked={locked || photoBusy} label="Add a photo of the site" onAdd={(f) => attach(f, null)} onRemove={detach} />
      </details>
      <section className="card audit-exports" aria-label="Reports and data export">
        {audit.state === "final" && <button type="button" className="btn" onClick={async () => {
          try { await (await import("./report/auditPdf")).downloadAuditReport(audit, (id) => loadPhoto(audit.id, id)); }
          catch (e) { setPhotoError(e instanceof Error ? e.message : "Report could not be downloaded."); }
        }}>Download audit report (PDF)</button>}
        <details><summary>Data export (advanced)</summary><p className="small">JSON contains audit records, not photo files. It is not a PDF report or a full backup.</p>
        <button type="button" className="chip" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = `audex-${audit.id}-${audit.state}.json`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>Export audit data (JSON){audit.state === "draft" ? " · unfinished draft" : ""}</button></details>
      </section>
      {!locked && (
        <details className="card howto">
          <summary>How to answer</summary>
          <ul>
            <li><strong>Compliant</strong>: fully meets the standard.</li>
            <li><strong>Partially compliant</strong>: meets some of it. Counts as half marks.</li>
            <li><strong>Non-compliant</strong>: does not meet the standard.</li>
            <li><strong>Not applicable</strong>: does not apply at this site. Explain why; this is not a way to skip a check.</li>
          </ul>
          <p className="small">Answers save on this device automatically. Drafts are not uploaded; return on this device to continue. Check any save errors before leaving.</p>
        </details>)}
      <section className="checklist-tools">
        <div><h2>{locked ? "Review checklist" : "Inspect and answer"}</h2><p className="small">Choose one answer per check. You can change answers until finalisation.</p></div>
        <div className="actions"><button type="button" className="chip" aria-pressed={reviewOnly} onClick={() => setReviewOnly(!reviewOnly)}>{reviewOnly ? "Show all checks" : "Show checks needing attention"}</button>
          <button type="button" className="chip" onClick={() => setOpen(new Set(sections.map(s => s.code)))}>Expand sections</button>
          <button type="button" className="chip" onClick={() => setOpen(new Set())}>Collapse sections</button></div>
      </section>
      {reviewOnly && !sections.some(s => s.items.some(i => !itemComplete(audit, i.key) || audit.answers[i.key] === "NON_COMPLIANT" || audit.answers[i.key] === "PARTIALLY_COMPLIANT")) && <p className="empty">No checks need attention. Show all checks to review every answer.</p>}
      {sections.map((s) => {
        const progress = sectionProgress(audit, s.items);
        const shown = s.items.filter(i => !reviewOnly || !itemComplete(audit, i.key) || audit.answers[i.key] === "NON_COMPLIANT" || audit.answers[i.key] === "PARTIALLY_COMPLIANT");
        if (shown.length === 0) return null;
        return (
          <details className="checklist-section" key={s.code} open={open.has(s.code)}
            onToggle={(e) => { const isOpen = (e.currentTarget as HTMLDetailsElement).open; setOpen((o) => { const n = new Set(o); isOpen ? n.add(s.code) : n.delete(s.code); return n; }); }}>
            <summary>
              <span className="sec__name">{nice(s.name)}{s.highRisk && <span className="risk">High risk</span>}</span>
              <span className={`sec__count${progress.ready ? " sec__count--done" : ""}`}>{progress.ready ? "✓ Complete" : `${progress.answered} of ${progress.total} answered`}{progress.reasonsNeeded > 0 && <small>{progress.reasonsNeeded} reason(s) needed</small>}</span>
            </summary>
            <progress className="section-progress" value={progress.complete} max={progress.total} aria-label={`${nice(s.name)} checks complete`} />
            {shown.map((i) => (
              <fieldset key={i.key} id={`item-${i.key}`} tabIndex={-1} className={`inspection-card${flash === i.key ? " flash" : ""}`}>
                <legend><span className="check-number">Check {s.items.indexOf(i) + 1} of {s.items.length}</span>{i.text}</legend>
                <div className="inspection-meta"><span className={`sev sev--${i.severity.toLowerCase()}`}>{SEV[i.severity]} severity</span>
                  <span className="answer-state">{audit.answers[i.key] === undefined ? "Not answered" : missing.has(i.key) ? "Reason required" : "Answer recorded"}</span></div>
                <AnswerOptions itemKey={i.key} answer={audit.answers[i.key]} locked={locked} onChange={result => set({ answers: { ...audit.answers, [i.key]: result } })} />
                {(audit.answers[i.key] === "NON_COMPLIANT" || audit.answers[i.key] === "PARTIALLY_COMPLIANT" || photosFor(audit, i.key).length > 0) && (
                  <PhotoStrip auditId={audit.id} photos={photosFor(audit, i.key)} locked={locked || photoBusy} label="Add supporting photo (optional)" onAdd={(f) => attach(f, i.key)} onRemove={detach} />)}
                {audit.answers[i.key] === "NA" && (
                  <label className="field narow">Why is this not applicable? (required)
                    <input value={audit.naReasons?.[i.key] ?? ""} disabled={locked} required aria-invalid={missing.has(i.key)}
                      onChange={(e) => set({ naReasons: { ...audit.naReasons, [i.key]: e.target.value } })} /></label>)}
              </fieldset>))}
          </details>);
      })}
      {!locked && (
        <div className="finalbar">
          {confirming ? (
            <ConfirmDialog title="Finalise this audit?" onCancel={() => setConfirming(false)}>
              <p>Result: {score.percent}%. Once finalised you cannot change the answers.</p>
              <div className="filters__row">
                <button type="button" className="btn btn--ghost" autoFocus onClick={() => setConfirming(false)}>Keep editing</button>
                <button type="button" className="btn" disabled={photoBusy || todo > 0 || score.status === "INCOMPLETE"} onClick={doFinalise}>Yes, finalise</button>
              </div>
            </ConfirmDialog>
          ) : todo > 0 ? (
            <><span className="small">{totalItems - todo} of {totalItems} checks complete{missing.size > 0 ? ` · ${missing.size} reason(s) needed` : ""}</span><button type="button" className="btn btn--wide" disabled={photoBusy} onClick={goToNext}>Continue audit · {todo} left</button></>
          ) : (
            <><span className="small">{score.status === "INCOMPLETE" ? "The result is still incomplete. Show all checks and review outstanding answers." : "All required answers and reasons recorded. Review before finalising."}</span><button type="button" className="btn btn--wide" disabled={photoBusy || score.status === "INCOMPLETE"} onClick={() => setConfirming(true)}>Review & finalise audit</button></>)}
        </div>)}
    </div>
  );
}
