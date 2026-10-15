import { fmtDate } from "../../analytics/dates";
import type { TrainingRow } from "../../analytics/types";
import { useWidth } from "../../hooks/useWidth";

const ROW = 56, L = 12, R = 56;
const sign = (n: number) => (n > 0 ? "+" : "") + n;

/** Dumbbell per session: hollow ring = average before, filled = average after. */
export function TrainingChart({ rows }: { rows: TrainingRow[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const usable = rows.filter((r) => r.before.avg !== null && r.after.avg !== null);
  if (!rows.length) return <p className="empty">No training sessions logged in this period.</p>;
  const all = usable.flatMap((r) => [r.before.avg as number, r.after.avg as number]);
  const lo = all.length ? Math.floor((Math.min(...all) - 3) / 5) * 5 : 70;
  const hi = all.length ? Math.min(100, Math.ceil((Math.max(...all) + 2) / 5) * 5) : 100;
  const x = (v: number) => L + ((w - L - R) * (v - lo)) / (hi - lo);
  return (
    <div ref={ref} className="chart">
      {rows.map((r) => (
        <div key={r.id} className="trow">
          <div className="trow__head">
            <span>{r.topic} <small>· {r.siteName} · {fmtDate(r.date)}</small></span>
            <strong>{r.delta === null ? "n/a" : `${sign(r.delta)} pts`}</strong>
          </div>
          {r.before.avg !== null && r.after.avg !== null ? (
            <svg width={w} height={ROW - 28} role="img" aria-label={`Before ${r.before.avg}%, after ${r.after.avg}%`}>
              <line x1={x(r.before.avg)} x2={x(r.after.avg)} y1={14} y2={14} className="dumbbell" />
              <circle cx={x(r.before.avg)} cy={14} r={6} className="ring" />
              <circle cx={x(r.after.avg)} cy={14} r={6} className="dot" />
              <text x={w - 4} y={18} textAnchor="end" className="axis">{r.after.avg}%</text>
            </svg>
          ) : null}
          <div className="trow__meta">
            {r.confidence === "none" && "Not enough audits on both sides to compare."}
            {r.confidence === "low" && `Low confidence: only ${r.before.n} audit${r.before.n === 1 ? "" : "s"} before and ${r.after.n} after.`}
            {r.confidence === "ok" && `${r.before.n} audits before, ${r.after.n} after (90 days each side).`}
          </div>
        </div>
      ))}
      <div className="legend">
        <span><i className="sw sw--ring" /> Average before</span>
        <span><i className="sw sw--dot" /> Average after</span>
      </div>
      <p className="card__note">Scores moved this way around the sessions. That shows a link, not proof that training caused the change.</p>
    </div>
  );
}

export function TrainingTable({ rows }: { rows: TrainingRow[] }) {
  return (
    <table>
      <thead><tr><th>Session</th><th>Site</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}>
          <td>{r.topic}<br /><small>{fmtDate(r.date)}</small></td><td>{r.siteName}</td>
          <td>{r.before.avg === null ? "n/a" : `${r.before.avg}% (${r.before.n})`}</td>
          <td>{r.after.avg === null ? "n/a" : `${r.after.avg}% (${r.after.n})`}</td>
          <td>{r.delta === null ? "n/a" : `${sign(r.delta)} pts`}</td>
        </tr>))}
      </tbody>
    </table>
  );
}
