import { useState, type ReactNode } from "react";

/** A chart with a table twin: the table carries every value the chart shows. */
export function ChartCard({ title, note, chart, table }: { title: string; note?: string; chart: ReactNode; table: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="card">
      <div className="card__head">
        <h2>{title}</h2>
        <div className="seg" role="group" aria-label={`${title} view`}>
          {(["chart", "table"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === "chart" ? "Chart" : "Table"}</button>
          ))}
        </div>
      </div>
      {note && <p className="card__note">{note}</p>}
      {view === "chart" ? chart : <div className="tablewrap">{table}</div>}
    </section>
  );
}
