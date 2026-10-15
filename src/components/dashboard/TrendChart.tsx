import { useState } from "react";
import { diffDays, fmtDate } from "../../analytics/dates";
import type { Analytics } from "../../analytics/types";
import { useWidth } from "../../hooks/useWidth";

const H = 220, M = { t: 12, r: 44, b: 40, l: 34 };

export function TrendChart({ a, compliantMin, notYetMin }: { a: Analytics; compliantMin: number; notYetMin: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = a.trend.points;
  if (!pts.length) return <p className="empty">No finalised audits in this period.</p>;

  const lo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.avg), notYetMin) - 5) / 5) * 5);
  const span = Math.max(1, diffDays(a.period.to, a.period.from));
  const iw = w - M.l - M.r, ih = H - M.t - M.b;
  const x = (d: string) => M.l + (iw * diffDays(d, a.period.from)) / span;
  const y = (v: number) => M.t + ih * (1 - (v - lo) / (100 - lo));
  const ticks: number[] = [];
  for (let v = lo; v <= 100; v += lo >= 60 ? 10 : 20) ticks.push(v);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const tip = hover !== null ? pts[hover] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(pts[best].date) - px)) best = i; });
    setHover(best);
  };

  return (
    <div ref={ref} className="chart">
      <svg width={w} height={H} role="img" aria-label={`Average compliance trend, ${pts.length} points, latest ${last.avg}%`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="axis">{v}%</text>
          </g>
        ))}
        {[compliantMin, notYetMin].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className="thresh" />
            <text x={w - M.r + 4} y={y(v) + 4} className="axis">{v}%</text>
          </g>
        ))}
        <path d={path} className="line" />
        {a.training.map((t) => (
          <g key={t.id} transform={`translate(${x(t.date)},${H - M.b + 14})`}>
            <title>{`Training: ${t.topic} (${fmtDate(t.date)})`}</title>
            <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" className="tmark" />
          </g>
        ))}
        {pts.map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.avg)} r={i === hover ? 5 : 4} className="dot" />)}
        <text x={Math.min(x(last.date) + 8, w - 4)} y={y(last.avg) - 8} textAnchor={x(last.date) + 40 > w ? "end" : "start"} className="endlabel">{last.avg}%</text>
        <text x={M.l} y={H - 4} className="axis">{a.period.label}</text>
        {tip && <line x1={x(tip.date)} x2={x(tip.date)} y1={M.t} y2={H - M.b} className="cross" />}
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(tip.date), 70), w - 70) }}>
          <strong>{tip.avg}%</strong> {tip.label}<br /><span>{tip.n} audit{tip.n === 1 ? "" : "s"}</span>
        </div>
      )}
      <div className="legend">
        <span><i className="sw sw--line" /> Average compliance ({a.trend.granularity === "audit" ? "per audit" : `per ${a.trend.granularity}`})</span>
        <span><i className="sw sw--diamond" /> Training session</span>
      </div>
    </div>
  );
}

export function TrendTable({ a }: { a: Analytics }) {
  return (
    <table>
      <thead><tr><th>{a.trend.granularity === "audit" ? "Audit" : a.trend.granularity === "week" ? "Week" : "Month"}</th><th>Average</th><th>Audits</th></tr></thead>
      <tbody>{a.trend.points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.avg}%</td><td>{p.n}</td></tr>)}</tbody>
    </table>
  );
}
