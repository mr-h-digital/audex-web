import { useState } from "react";
import type { Page } from "../Navigation";

export interface SetupProgress { skipped: boolean; profileConfirmed: boolean; celebrated: boolean }
export const EMPTY_PROGRESS: SetupProgress = { skipped: false, profileConfirmed: false, celebrated: false };
export function readProgress(account: string, established = false): SetupProgress {
  const value: unknown = JSON.parse(localStorage.getItem(`audex.setup.v1.${encodeURIComponent(account)}`) ?? "null");
  if (!value || typeof value !== "object") return { ...EMPTY_PROGRESS, skipped: established, celebrated: established };
  return {
    skipped: "skipped" in value && value.skipped === true,
    profileConfirmed: "profileConfirmed" in value && value.profileConfirmed === true,
    celebrated: "celebrated" in value && value.celebrated === true,
  };
}
export function useSetupProgress(account: string, established: boolean) {
  const [initial] = useState(() => {
    try { return { progress: readProgress(account, established), error: "" }; }
    catch { return { progress: EMPTY_PROGRESS, error: "Previous setup progress could not be read. Your audit records are unaffected." }; }
  });
  const [error, setError] = useState(initial.error);
  const [progress, setProgress] = useState<SetupProgress>(initial.progress);
  const update = (patch: Partial<SetupProgress>) => {
    const next = { ...progress, ...patch };
    setProgress(next);
    try { localStorage.setItem(`audex.setup.v1.${encodeURIComponent(account)}`, JSON.stringify(next)); setError(""); }
    catch { setError("Setup progress could not be saved on this device. Your audit records are unaffected; setup may appear again next time."); }
  };
  return { progress, update, error };
}

export function WorkspaceSetup({ name, progress, hasSites, hasAudit, writable, onUpdate, onNavigate }: {
  name: string; progress: SetupProgress; hasSites: boolean; hasAudit: boolean; writable: boolean;
  onUpdate: (patch: Partial<SetupProgress>) => void; onNavigate: (page: Page) => void;
}) {
  const [expanded, setExpanded] = useState(!hasSites && !hasAudit);
  const steps = [
    { title: "Make your reports yours", detail: "Confirm your name and report details in Settings, then save your profile.", done: progress.profileConfirmed, page: "settings" as const, action: "Review report details" },
    { title: "Give your first site a home", detail: "Add the clinic, hospital or facility you audit. One site is one whole facility.", done: hasSites, page: "sites" as const, action: "Add your first site" },
    { title: "Capture your first audit", detail: "Start a real checklist. Drafts save on this device; finalised audits can sync when connected and entitled.", done: hasAudit, page: "audit" as const, action: "Start your first audit" },
  ];
  const complete = steps.filter((s) => s.done).length;
  if (complete === steps.length) return null;
  if (progress.skipped) return <div className="setup-resume"><span className="small">Your workspace, at your pace. {complete} of 3 steps complete.</span><button className="chip" onClick={() => onUpdate({ skipped: false })}>Resume setup</button></div>;
  return <details className="workspace-setup card" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} aria-labelledby="setup-title">
    <summary><div className="setup-heading"><div><span className="onboarding-eyebrow">YOUR GETTING-STARTED CHECKLIST</span><h2 id="setup-title">Welcome{name ? `, ${name}` : ""}. Make this workspace yours.</h2></div><span className="setup-count">{complete} / 3</span></div></summary>
    <p>A few small steps to your first useful audit. You can explore now and return to this checklist whenever you are ready.</p>
    <progress value={complete} max={3} aria-label="Workspace setup progress" />
    <ol className="setup-steps">{steps.map((step, i) => <li key={step.title} className={step.done ? "is-complete" : ""}>
      <span className="setup-step-number" aria-label={step.done ? "Complete" : `Step ${i + 1}`}>{step.done ? "\u2713" : `0${i + 1}`}</span>
      <div><h3>{step.title}</h3><p>{step.detail}</p>{!step.done && <button className="linkbtn" disabled={step.page !== "settings" && !writable} onClick={() => onNavigate(step.page)}>{step.action} <span aria-hidden="true">&rarr;</span></button>}</div>
    </li>)}</ol>
    {!writable && <p className="small">You can review your report details now. Verify your email or refresh access in Settings before adding sites or audits.</p>}
    <div className="onboarding-footer"><button className="chip" onClick={() => onUpdate({ skipped: true })}>Explore first, finish later</button><span className="small">Progress is remembered on this device for this account.</span></div>
  </details>;
}
