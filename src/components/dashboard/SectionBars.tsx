import type { SectionRow } from "../../analytics/types";

export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Weakest sections first; a hairline marks the 85% line the rules use as the floor for high-risk sections. */
export function SectionBars({ rows, floor }: { rows: SectionRow[]; floor: number }) {
  if (!rows.length) return <p className="empty">No data for this period.</p>;
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.code}>
          <div className="bars__label">{titleCase(r.name)}{r.highRisk && <span className="risk">High risk</span>}</div>
          <div className="bars__track" role="img" aria-label={`${titleCase(r.name)} ${r.percent}%`}>
            <div className="bars__fill" style={{ width: `${r.percent}%` }} />
            <div className="bars__floor" style={{ left: `${floor}%` }} />
          </div>
          <div className="bars__val">{r.percent}%</div>
        </li>
      ))}
    </ul>
  );
}

export function SectionTable({ rows }: { rows: SectionRow[] }) {
  return (
    <table>
      <thead><tr><th>Section</th><th>Score</th><th>High risk</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.code}><td>{titleCase(r.name)}</td><td>{r.percent}%</td><td>{r.highRisk ? "Yes" : "No"}</td></tr>)}</tbody>
    </table>
  );
}
