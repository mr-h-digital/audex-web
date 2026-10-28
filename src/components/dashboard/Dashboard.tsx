import { useMemo, useState } from "react";
import { computeAnalytics } from "../../analytics/analytics";
import { todayIso } from "../../analytics/dates";
import { resolvePeriod } from "../../analytics/period";
import type { PresetId } from "../../analytics/types";
import { useDashboardData, type RealData } from "../../analytics/useDashboardData";
import { activeRuleSetCode, ruleSet } from "../../scoring/catalog";
import { ChartCard } from "./ChartCard";
import { FilterBar } from "./FilterBar";
import { SectionBars, SectionTable, titleCase } from "./SectionBars";
import { STATUS_META, StatusTag } from "./status";
import { TrainingChart, TrainingTable } from "./TrainingEffect";
import { TrendChart, TrendTable } from "./TrendChart";
import { PageHeading } from "../PageHeading";
import { comparisonGroups, comparisonKey } from "../../facilities/comparison";

const sign = (n: number) => (n > 0 ? "+" : "") + n;

export function Dashboard({ real, author }: { real: RealData; author: { name: string; role: string } }) {
  const today = useMemo(todayIso, []);
  const [forceDemo, setForceDemo] = useState(false);
  const data = useDashboardData(today, real, forceDemo);
  const [preset, setPreset] = useState<PresetId>("last90");
  const [custom, setCustom] = useState({ from: "", to: today });
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [comparison, setComparison] = useState("");
  const groups = useMemo(() => comparisonGroups(data.audits), [data.audits]);
  const selectedGroup = groups.find((group) => group.key === comparison) ?? groups[0];
  const comparable = data.audits.filter((audit) => comparisonKey(audit) === selectedGroup?.key);

  const rules = ruleSet(comparable[0]?.ruleSetCode ?? activeRuleSetCode);
  const period = resolvePeriod(preset, today, custom.from ? custom : undefined);
  const a = useMemo(() => computeAnalytics({ audits: comparable, trainings: data.trainings, sites: data.sites,
    period, siteIds: siteId ? [siteId] : null }), [data, selectedGroup?.key, period.from, period.to, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = a.kpis;
  const total = Math.max(1, k.audits);

  const download = async () => {
    setBusy(true); setExportError("");
    try { (await import("../../report/download")).downloadReport(a, { demo: data.demo, siteName: data.sites.find((s) => s.id === siteId)?.name ?? "All sites", author: author.name, role: author.role,
      compliantMin: rules.compliantMinTenths / 10, notYetMin: rules.notYetMinTenths / 10, scopeLabel: selectedGroup?.label }); }
    catch (error) { setExportError(error instanceof Error ? error.message : "The dashboard summary could not be exported. Please retry."); }
    finally { setBusy(false); }
  };

  return (
    <div className="dash dashboard-page">
      <PageHeading title="Dashboard" description="Review compliance, trends and sites that need attention." />
      {data.demo
        ? <p className="banner">Demo data: made-up sites and audits, not real results.{" "}
          <button type="button" className="linkbtn" onClick={() => setForceDemo(false)}>Show my audits</button></p>
        : <p className="small"><button type="button" className="linkbtn" onClick={() => setForceDemo(true)}>Preview with demo data</button></p>}
      {groups.length > 0 && <section className="card">
        <label className="field">Comparable audit scope<select value={selectedGroup?.key ?? ""} onChange={(e) => setComparison(e.target.value)}>
          {groups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
        </select></label>
        <p className="small">Only audits using this template, scoring rule set and area scope are compared. Different standards are not combined into one average.</p>
      </section>}
      <FilterBar preset={preset} onPreset={(p) => { setPreset(p); if (p === "custom" && !custom.from) setCustom({ from: period.from, to: period.to }); }}
        from={custom.from || period.from} to={custom.to} onFrom={(from) => setCustom((c) => ({ ...c, from }))} onTo={(to) => setCustom((c) => ({ ...c, to }))}
        sites={data.sites} siteId={siteId} onSite={setSiteId} periodLabel={period.label} onDownload={download} busy={busy} />
      {exportError && <p className="warn" role="alert">{exportError}</p>}

      {k.audits === 0 ? <p className="empty card">No finalised audits in this period. Try a longer period or another site.</p> : (
        <>
          <section className="card attention-summary">
            <h2>Where to focus next</h2>
            <p>{k.sitesNeedingAttention ? `${k.sitesNeedingAttention} of ${k.sitesAudited} audited sites need follow-up based on their latest result.` : "No audited sites need follow-up based on their latest result in this view."}</p>
            <p className="small">{k.auditsWithCriticalFailure} audit(s) contain a failed critical check. Review site results and weakest sections below. Figures use only the selected scope, site and period; a score is not regulatory certification.</p>
          </section>
          <section className="card hero">
            <div className="hero__summary">
              <div className="hero__label">Average compliance</div>
              <div className="hero__num">{k.avgPercent}%</div>
              <div className="hero__delta">
                {k.deltaPoints === null ? "No earlier period to compare with."
                  : <>{k.deltaPoints > 0 ? "▲" : k.deltaPoints < 0 ? "▼" : "■"} {sign(k.deltaPoints)} pts vs previous {period.days} days ({k.prevAvgPercent}%)</>}
              </div>
            </div>
            <div className="hero__outcomes">
              <div className="split" role="img" aria-label="Audit outcomes">
                {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => k.statusCounts[s] > 0 && (
                  <div key={s} style={{ width: `${(100 * k.statusCounts[s]) / total}%`, background: STATUS_META[s].color }} />))}
              </div>
              <ul className="legend legend--col">
                {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
                  <li key={s}><span className="tag__icon" style={{ background: STATUS_META[s].color }} aria-hidden>{STATUS_META[s].icon}</span>
                    {STATUS_META[s].label}: <strong>{k.statusCounts[s]}</strong></li>))}
              </ul>
            </div>
          </section>

          <div className="kpis">
            <div className="kpi"><div className="kpi__n">{k.audits}</div><div>Audits</div></div>
            <div className="kpi"><div className="kpi__n">{k.auditsWithCriticalFailure}</div><div>Audits with a Critical item failed</div></div>
            <div className="kpi"><div className="kpi__n">{k.sitesNeedingAttention}<small>/{k.sitesAudited}</small></div><div>Sites to follow up</div></div>
          </div>

          <p className="small">Sites to follow up: the latest audit was not Compliant. Critical items are the most serious checks on the list.</p>

          <ChartCard title="Compliance trend" chart={<TrendChart a={a} compliantMin={rules.compliantMinTenths / 10} notYetMin={rules.notYetMinTenths / 10} />} table={<TrendTable a={a} />} />

          <section className="card">
            <h2>Sites</h2>
            <div className="tablewrap"><table>
              <thead><tr><th>Site</th><th>Average</th><th>Latest</th></tr></thead>
              <tbody>{a.sites.map((s) => (
                <tr key={s.siteId}><td>{s.siteName}<br /><small>{s.audits} audit{s.audits === 1 ? "" : "s"}</small></td><td>{s.avgPercent}%</td>
                  <td>{s.latestPercent}%<br /><StatusTag status={s.latestStatus} /></td></tr>))}</tbody>
            </table></div>
          </section>

          <ChartCard title="Weakest sections" note="Weakest first. The line marks the 85% floor for high-risk sections."
            chart={<SectionBars rows={a.sections.slice(0, 10)} floor={rules.highRiskSectionFloor.minTenths / 10} />} table={<SectionTable rows={a.sections} />} />

          <ChartCard title="Scores before and after training" chart={<TrainingChart rows={a.training} />} table={<TrainingTable rows={a.training} />}
            note={`${a.trainingSummary ? `Across ${a.trainingSummary.sessions} session${a.trainingSummary.sessions === 1 ? "" : "s"} with enough audits, average change ${sign(a.trainingSummary.avgDelta)} pts. ` : ""}This comparison shows association, not proof that training caused a change.`} />

          <section className="card">
            <h2>Failures that keep coming back</h2>
            {a.recurring.length === 0 ? <p className="empty">No item failed in more than one audit.</p> : (
              <div className="tablewrap"><table>
                <thead><tr><th>Item</th><th>Times</th></tr></thead>
                <tbody>{a.recurring.slice(0, 8).map((r) => (
                  <tr key={r.key}><td>{r.text}<br /><small>{titleCase(r.severity)} · last {r.lastSeen}</small></td><td>{r.count}</td></tr>))}</tbody>
              </table></div>)}
          </section>
        </>
      )}
    </div>
  );
}
