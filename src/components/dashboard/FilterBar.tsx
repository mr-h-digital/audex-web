import { PRESETS } from "../../analytics/period";
import type { PresetId, Site } from "../../analytics/types";

interface Props {
  preset: PresetId; onPreset: (p: PresetId) => void;
  from: string; to: string; onFrom: (d: string) => void; onTo: (d: string) => void;
  sites: Site[]; siteId: string; onSite: (id: string) => void;
  periodLabel: string; onDownload: () => void; busy: boolean;
}

/** One filter row above all the charts: period, custom range, site, and the report download. */
export function FilterBar(p: Props) {
  return (
    <div className="filters">
      <div className="chips" role="group" aria-label="Period">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={p.preset === x.id} onClick={() => p.onPreset(x.id)}>{x.label}</button>
        ))}
      </div>
      {p.preset === "custom" && (
        <div className="daterow">
          <label>From <input type="date" value={p.from} max={p.to} onChange={(e) => p.onFrom(e.target.value)} /></label>
          <label>To <input type="date" value={p.to} min={p.from} onChange={(e) => p.onTo(e.target.value)} /></label>
        </div>
      )}
      <div className="filters__row">
        <label className="sitesel">Site
          <select value={p.siteId} onChange={(e) => p.onSite(e.target.value)}>
            <option value="">All sites</option>
            {p.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={p.onDownload} disabled={p.busy}>{p.busy ? "Preparing…" : "Download report (PDF)"}</button>
      </div>
      <p className="period">{p.periodLabel}</p>
    </div>
  );
}
