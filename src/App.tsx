import { useEffect, useMemo, useRef, useState } from "react";
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
import { deletePhoto, getPhoto, putPhoto } from "./photos/blobStore";
import { addPhoto, markUploaded, photosFor, photosWaiting, pruneOrphans, removePhoto } from "./photos/photos";
import { ScorePanel } from "./components/ScorePanel";
import { Sites } from "./components/Sites";
import { activeRuleSetCode, ruleSet, ruleSets, sections } from "./scoring/catalog";
import type { Result } from "./scoring/types";
import { useSites } from "./sites/store";
import { API_URL, pending, syncPending, syncPhotos } from "./sync/sync";
import { AuthGate } from "./components/auth/AuthGate";
import type { Auth } from "./auth/useAuth";

const RESULTS: { value: Result; label: string; icon: string; cls: string }[] = [
  { value: "COMPLIANT", label: "Compliant", icon: "✓", cls: "c" },
  { value: "PARTIALLY_COMPLIANT", label: "Partly", icon: "▲", cls: "p" },
  { value: "NON_COMPLIANT", label: "Non-compliant", icon: "✕", cls: "n" },
  { value: "NA", label: "N/A", icon: "–", cls: "na" },
];
const TOTAL_ITEMS = sections.reduce((n, s) => n + s.items.length, 0);
const nice = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const SEV: Record<string, string> = { CRITICAL: "Critical", MAJOR: "Major", MINOR: "Minor" };
const saveLabel = (a: SavedAudit) => a.state === "draft" ? "Draft saved" : a.synced ? "Uploaded" : API_URL ? "Saved, uploads when online" : "Saved on this phone";
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export default function App() {
  return <AuthGate>{(auth) => <Main auth={auth} />}</AuthGate>;
}

function Main({ auth }: { auth: Auth }) {
  const [tab, setTab] = useState<"audit" | "sites" | "dashboard" | "settings">("audit");
  const [profile, saveProfile] = useProfile();
  const [theme, setTheme] = useTheme();
  const { sites, add, update, archive } = useSites();
  const { audits, save, remove, markSynced, setAudits } = useAudits();
  const training = useTraining();
  const [openId, setOpenId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ruleCode, setRuleCode] = useState(activeRuleSetCode);
  const active = sites.filter((s) => !s.archived);
  const current = audits.find((a) => a.id === openId) ?? null;
  const queued = pending(audits).length;
  const online = useOnline();

  // The server stamps each audit with the signed-in person's name, so keep the name on reports in step with it once per sign-in.
  const userId = auth.user?.id;
  useEffect(() => {
    if (auth.user && auth.user.displayName && auth.user.displayName !== profile.name) saveProfile({ ...profile, name: auth.user.displayName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // Changing name or phone in Settings also updates the account when online; the phone copy is always saved.
  const onSaveProfile = (p: typeof profile) => {
    saveProfile(p);
    const u = auth.user;
    if (u) void auth.api.updateMe({ displayName: p.name.trim(), email: u.email, phone: p.phone.trim() }).then(auth.setUser).catch(() => { /* offline: saved on the phone */ });
  };

  const photosQueued = photosWaiting(audits);
  // Send finalised audits, then their photos, whenever something is queued and the phone is online.
  useEffect(() => {
    if (!API_URL || queued + photosQueued === 0) return;
    const run = async () => {
      const ids = await syncPending(audits, API_URL, (u, i) => auth.authFetch(u, i));
      if (ids.length) { markSynced(ids); return; } // photos follow on the next pass, once the audits are marked synced
      const up = await syncPhotos(audits, API_URL, (id) => getPhoto(id), (u, i) => auth.authFetch(u, i));
      if (up.length) setAudits((l) => markUploaded(l, up));
    };
    if (navigator.onLine) void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [audits, queued, photosQueued, markSynced, setAudits, auth]);

  const real = useMemo(() => ({
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
    audits: audits.flatMap((a) => (a.summary ? [a.summary] : [])),
    trainings: training.sessions,
  }), [sites, audits, training.sessions]);

  const start = () => {
    const site = active.find((s) => s.id === siteId);
    if (!site) return;
    const a = newAudit(crypto.randomUUID(), site, date, ruleCode, { name: profile.name, role: roleLine(profile) });
    save(a); setOpenId(a.id);
  };

  return (
    <main className="app">
      <BrandHeader>
        {current && tab === "audit" && <span className="syncbadge">{saveLabel(current)}</span>}
        <button type="button" className="gear" aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </BrandHeader>
      {!online && <p className="offline" role="status">You are offline. That is fine: keep working and everything is saved on this phone.</p>}

      <nav className="tabbar" aria-label="Main">
        {(["audit", "sites", "dashboard"] as const).map((t) => (
          <button key={t} type="button" aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "audit" ? "Audit" : t === "sites" ? "Sites" : "Dashboard"}</button>))}
        <button className="tabbar__settings" type="button" aria-current={tab === "settings" ? "page" : undefined} onClick={() => setTab("settings")}>Settings</button>
      </nav>

      <section className="app-content">
        {tab === "dashboard" && <Dashboard real={real} author={{ name: profile.name, role: roleLine(profile) }} />}
        {tab === "settings" && <Settings profile={profile} onSaveProfile={onSaveProfile} theme={theme} onTheme={setTheme} auth={auth} unsynced={queued} />}
        {tab === "sites" && <Sites sites={sites} onAdd={add} onUpdate={update} onArchive={archive}
          training={training.sessions} onAddTraining={training.add} onRemoveTraining={training.remove} />}
        {tab === "audit" && (current
          ? <AuditScreen audit={current} onChange={save} onClose={() => setOpenId(null)} />
          : <div className="start-page">
            <section className="card startaudit">
              <h2>Start an audit</h2>
              {active.length === 0 ? <><p className="empty">Add the site you are auditing first.</p>
                <button type="button" className="btn" onClick={() => setTab("sites")}>Add a site</button></> : <>
                <label className="field">Site<select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">Choose a site…</option>{active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="field">Audit date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <button type="button" className="btn" disabled={!siteId} onClick={start}>Start audit</button>
                <details className="adv"><summary>Scoring rules (advanced)</summary>
                  <select aria-label="Scoring rules" value={ruleCode} onChange={(e) => setRuleCode(e.target.value)}>
                    {ruleSets.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
                  <p className="small">Leave this on the current WPC rules unless you have been told to change it.</p></details></>}
              {!installed() && <p className="tip">Tip: add AudEx to your home screen (in your browser menu, choose Add to Home Screen). That keeps your audits safe on this phone and opens the app faster.</p>}
            </section>
            <AuditList audits={audits} onOpen={setOpenId} onDelete={(id) => { if (!window.confirm("Delete this unfinished audit? This cannot be undone.")) return; audits.find((a) => a.id === id)?.photos?.forEach((ph) => void deletePhoto(ph.id).catch(() => undefined)); remove(id); }} />
          </div>)}
      </section>
    </main>
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
  const rules = ruleSet(audit.ruleSetCode);
  const score = useMemo(() => scoreOf(audit), [audit]);
  const locked = audit.state === "final";
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
      const id = crypto.randomUUID();
      await putPhoto(id, await compressImage(file));
      onChange(addPhoto(latest.current, { id, itemKey, caption: "", takenAt: new Date().toISOString() }));
    } catch { setPhotoError("That photo could not be saved. Please try again."); }
  };
  const detach = (id: string) => { onChange(removePhoto(latest.current, id)); void deletePhoto(id).catch(() => undefined); };
  const doFinalise = () => {
    const { audit: pruned, removed } = pruneOrphans(audit);
    removed.forEach((id) => void deletePhoto(id).catch(() => undefined));
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
      <p className="auditing"><span><strong>{audit.siteName}</strong><br />{fmtDate(audit.date)}</span>
        <button type="button" className="chip" onClick={onClose}>Back to audits</button></p>
      <ScorePanel score={score} rules={rules} answered={TOTAL_ITEMS - score.unanswered} total={TOTAL_ITEMS} />
      {locked && <p className="banner banner--ok">This audit is finalised and saved. Answers can no longer be changed.</p>}
      <section className="card form">
        <label className="field">Unit manager<input value={audit.unitManager} disabled={locked} onChange={(e) => set({ unitManager: e.target.value })} /></label>
        <label className="field">Housekeeping supervisor<input value={audit.supervisor} disabled={locked} onChange={(e) => set({ supervisor: e.target.value })} /></label>
        <PhotoStrip photos={photosFor(audit, null)} locked={locked} label="Add a photo of the site" onAdd={(f) => attach(f, null)} onRemove={detach} />
        {photoError && <p className="warn" role="alert">{photoError}</p>}
        {locked && <button type="button" className="btn" onClick={async () => (await import("./report/auditPdf")).downloadAuditReport(audit)}>Download audit report (PDF)</button>}
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
              <fieldset key={i.key} id={`item-${i.key}`} disabled={locked} className={flash === i.key ? "flash" : undefined}>
                <legend>{i.text} <span className={`sev sev--${i.severity.toLowerCase()}`}>{SEV[i.severity]}</span></legend>
                <div className="opts">
                  {RESULTS.map((r) => (
                    <label key={r.value} className={`opt opt--${r.cls}`}>
                      <input type="radio" name={i.key} checked={audit.answers[i.key] === r.value}
                        onChange={() => set({ answers: { ...audit.answers, [i.key]: r.value } })} />
                      <span aria-hidden>{r.icon}</span> {r.label}
                    </label>))}
                </div>
                {(audit.answers[i.key] === "NON_COMPLIANT" || audit.answers[i.key] === "PARTIALLY_COMPLIANT" || photosFor(audit, i.key).length > 0) && (
                  <PhotoStrip photos={photosFor(audit, i.key)} locked={locked} label="Add photo" onAdd={(f) => attach(f, i.key)} onRemove={detach} />)}
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
