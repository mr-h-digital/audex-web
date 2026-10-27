import { useState } from "react";
import { useState as useS } from "react";
import type { TrainingSession } from "../analytics/types";
import type { TrainingDraft } from "../audits/training";
import { fmtDate } from "../analytics/dates";
import type { AuditSite, SiteDraft } from "../sites/store";
import { PageHeading } from "./PageHeading";
import { useBilling } from "../billing/BillingProvider";
import { facilityTypes } from "../facilities/catalog";

const EMPTY: SiteDraft = { name: "", address: "", unitManager: "", supervisor: "" };

interface Props { training: TrainingSession[]; onAddTraining: (d: TrainingDraft) => void; onRemoveTraining: (id: string) => void; sites: AuditSite[]; onAdd: (d: SiteDraft) => void; onUpdate: (id: string, d: SiteDraft) => void; onArchive: (id: string, a: boolean) => void }

export function Sites({ training, onAddTraining, onRemoveTraining, sites, onAdd, onUpdate, onArchive }: Props) {
  const { writable } = useBilling();
  const [draft, setDraft] = useState<SiteDraft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const dup = !editing && sites.some((s) => !s.archived && s.name.toLowerCase() === draft.name.trim().toLowerCase());
  const shown = sites.filter((s) => showArchived || !s.archived);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || dup) return;
    editing ? onUpdate(editing, draft) : onAdd(draft);
    setDraft(EMPTY); setEditing(null);
  };
  const field = (k: "name" | "address" | "unitManager" | "supervisor", label: string, req = false) => (
    <label className="field">{label}
      <input value={draft[k]} required={req} disabled={!writable} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>
  );

  return (
    <div className="dash sites-page">
      <PageHeading title="Sites" description="Manage your facilities, archived sites and training sessions." />
      <form className="card form" data-tour="site-form" onSubmit={submit}>
        <h2>{editing ? "Edit site" : "Add a site"}</h2>
        {field("name", "Site name (e.g. clinic, hospital or village)", true)}
        <label className="field">Facility type<select disabled={!writable} value={draft.facilityType ?? ""} onChange={(e) => setDraft({ ...draft, facilityType: e.target.value || undefined })}>
          <option value="">Not specified</option>
          {draft.facilityType && !facilityTypes.some((type) => type.code === draft.facilityType) && <option value={draft.facilityType}>{draft.facilityType} (existing classification)</option>}
          {facilityTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
        </select></label>
        {field("address", "Address")}
        {field("unitManager", "Unit manager (housekeeping)")}
        {field("supervisor", "Housekeeping supervisor")}
        {dup && <p className="warn" role="alert">A site with this name already exists.</p>}
        <div className="filters__row">
          <button className="btn" type="submit" disabled={!writable || !draft.name.trim() || dup}>{editing ? "Save changes" : "Add site"}</button>
          {editing && <button className="btn btn--ghost" type="button" onClick={() => { setEditing(null); setDraft(EMPTY); }}>Cancel</button>}
        </div>
      </form>
      <section className="card" data-tour="site-list">
        <div className="card__head"><h2>Your sites</h2>
          <label className="small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label></div>
        {shown.length === 0 ? <p className="empty">No sites yet. Add the first one above.</p> : (
          <ul className="sitelist">{shown.map((s) => (
            <li key={s.id}>
              <div><strong>{s.name}</strong>{s.archived && <span className="risk">Archived</span>}
                <div className="small">{[facilityTypes.find((type) => type.code === s.facilityType)?.name ?? s.facilityType, s.address, s.unitManager && `Manager: ${s.unitManager}`, s.supervisor && `Supervisor: ${s.supervisor}`].filter(Boolean).join(" · ")}</div></div>
              <div className="sitelist__btns">
                {!s.archived && <button type="button" className="chip" disabled={!writable} onClick={() => { setEditing(s.id); setDraft({ name: s.name, address: s.address, unitManager: s.unitManager, supervisor: s.supervisor, facilityType: s.facilityType }); }}>Edit</button>}
                <button type="button" className="chip" disabled={!writable} onClick={() => onArchive(s.id, !s.archived)}>{s.archived ? "Restore" : "Archive"}</button>
              </div>
            </li>))}
          </ul>)}
      </section>
      <TrainingLog sites={sites.filter((x) => !x.archived)} all={sites} training={training} onAdd={onAddTraining} onRemove={onRemoveTraining} />
    </div>
  );
}

function TrainingLog({ sites, all, training, onAdd, onRemove }: { sites: AuditSite[]; all: AuditSite[]; training: TrainingSession[]; onAdd: (d: TrainingDraft) => void; onRemove: (id: string) => void }) {
  const { writable } = useBilling();
  const [d, setD] = useS<TrainingDraft>({ siteId: "", date: new Date().toISOString().slice(0, 10), topic: "" });
  const name = (id: string) => all.find((x) => x.id === id)?.name ?? "Unknown site";
  return (
    <section className="card form" data-tour="training">
      <h2>Training sessions</h2>
      <p className="small">Log each training session so the dashboard can show whether scores improve afterwards.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (d.siteId && d.topic.trim()) { onAdd(d); setD({ ...d, topic: "" }); } }}>
        <label className="field">Site<select value={d.siteId} disabled={!writable} required onChange={(e) => setD({ ...d, siteId: e.target.value })}>
          <option value="">Choose a site…</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field">Date<input type="date" value={d.date} disabled={!writable} required onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
        <label className="field">Topic<input value={d.topic} disabled={!writable} required onChange={(e) => setD({ ...d, topic: e.target.value })} /></label>
        <button className="btn" type="submit" disabled={!writable || !d.siteId || !d.topic.trim()}>Log training</button>
      </form>
      {training.length > 0 && <ul className="sitelist">{[...training].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
        <li key={t.id}><div><strong>{t.topic}</strong><div className="small">{name(t.siteId)} · {fmtDate(t.date)}</div></div>
          <button type="button" className="chip" disabled={!writable} onClick={() => onRemove(t.id)}>Remove</button></li>))}</ul>}
    </section>
  );
}
