import { jsPDF } from "jspdf";
import { diffDays, fmtDate } from "../analytics/dates";
import type { Analytics } from "../analytics/types";
import { REPORT_AUTHOR, REPORT_ROLE } from "../config";

export interface ReportOptions {
  demo: boolean;
  siteName: string;
  /** Name and role printed as "Prepared by"; defaults to the configured report author. */
  author?: string;
  role?: string;
  compliantMin: number;
  notYetMin: number;
  /** PNG data URL of the logo; fetched from /logo when omitted. Skipped quietly if unavailable. */
  logo?: string | null;
}

const TEAL: [number, number, number] = [11, 77, 96];
const AMBER: [number, number, number] = [242, 153, 52];
const INK: [number, number, number] = [15, 42, 51];
const MUTED: [number, number, number] = [74, 95, 103];
const GRID: [number, number, number] = [223, 230, 232];
const STATUS_RGB = { COMPLIANT: [12, 163, 12], NOT_YET_COMPLIANT: [250, 178, 25], NON_COMPLIANT: [208, 59, 59] } as const;
const STATUS_LABEL = { COMPLIANT: "Compliant", NOT_YET_COMPLIANT: "Not yet compliant", NON_COMPLIANT: "Non-compliant" } as const;

const PW = 210, PH = 297, MX = 16, CW = PW - 2 * MX;
const sign = (n: number) => (n > 0 ? "+" : "") + n;
const title = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export const reportFilename = (a: Analytics) => `AudEx-report_${a.period.from}_to_${a.period.to}.pdf`;

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/logo/audex-lockup.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = no; r.readAsDataURL(blob); });
  } catch { return null; }
}

export async function buildReport(a: Analytics, o: ReportOptions): Promise<jsPDF> {
  const logo = o.logo === undefined ? await loadLogo() : o.logo;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const author = o.author || REPORT_AUTHOR, role = o.role || REPORT_ROLE;
  doc.setProperties({ title: `AudEx compliance report ${a.period.label}`, author, creator: "AudEx" });
  let y = 0;

  const text = (s: string, x: number, yy: number, size = 10, bold = false, color = INK, align: "left" | "right" | "center" = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(s, x, yy, { align });
  };
  const need = (h: number) => { if (y + h > PH - 18) { doc.addPage(); y = 18; } };
  const heading = (s: string) => { need(14); y += 4; text(s, MX, y, 13, true, TEAL); y += 2; doc.setDrawColor(...GRID); doc.line(MX, y, PW - MX, y); y += 6; };
  const wrap = (s: string, w: number) => doc.splitTextToSize(s, w) as string[];

  // header
  doc.setFillColor(...TEAL); doc.rect(0, 0, PW, 6, "F");
  if (logo) { try { doc.addImage(logo, "PNG", MX, 12, 46, 46 * 0.3); } catch { /* logo is optional */ } }
  else text("AudEx", MX, 22, 20, true, TEAL);
  y = 34;
  text("Housekeeping compliance report", MX, y, 18, true); y += 7;
  text(`Period: ${a.period.label}  (${a.period.days} days)`, MX, y, 10, false, MUTED); y += 5;
  text(`Site: ${o.siteName}`, MX, y, 10, false, MUTED); y += 5;
  text(`Prepared by ${author}, ${role}`, MX, y, 10, false, MUTED); y += 5;
  if (o.demo) {
    y += 2; doc.setFillColor(255, 243, 220); doc.rect(MX, y - 4, CW, 8, "F");
    text("DEMO DATA: made-up sites and audits, not real audit results.", MX + 3, y + 1, 9.5, true); y += 8;
  }

  const k = a.kpis;
  if (k.audits === 0) {
    y += 8; text("No finalised audits in this period.", MX, y, 11); return finish(doc, author);
  }

  // headline
  y += 6;
  text(`${k.avgPercent}%`, MX, y + 12, 38, true, TEAL);
  text("Average compliance", MX + 52, y + 5, 10, false, MUTED);
  text(k.deltaPoints === null ? "No earlier period to compare with."
    : `${sign(k.deltaPoints)} pts vs previous ${a.period.days} days (${k.prevAvgPercent}%)`, MX + 52, y + 11, 10);
  text(`${k.audits} audits across ${k.sitesAudited} site${k.sitesAudited === 1 ? "" : "s"}; ${k.auditsWithCriticalFailure} with a critical failure; ${k.sitesNeedingAttention} site${k.sitesNeedingAttention === 1 ? "" : "s"} needing attention.`, MX + 52, y + 17, 9, false, MUTED);
  y += 24;

  // status split
  let sx = MX;
  for (const s of ["COMPLIANT", "NOT_YET_COMPLIANT", "NON_COMPLIANT"] as const) {
    const w = (CW * k.statusCounts[s]) / k.audits; if (!w) continue;
    doc.setFillColor(STATUS_RGB[s][0], STATUS_RGB[s][1], STATUS_RGB[s][2]); doc.rect(sx, y, Math.max(0, w - 0.6), 4, "F"); sx += w;
  }
  y += 9;
  let lx = MX;
  for (const s of ["COMPLIANT", "NOT_YET_COMPLIANT", "NON_COMPLIANT"] as const) {
    doc.setFillColor(STATUS_RGB[s][0], STATUS_RGB[s][1], STATUS_RGB[s][2]); doc.rect(lx, y - 3, 3, 3, "F");
    const label = `${STATUS_LABEL[s]}: ${k.statusCounts[s]}`;
    text(label, lx + 5, y, 9); lx += 8 + doc.getTextWidth(label) + 6;
  }
  y += 4;

  // trend chart
  heading("Compliance trend");
  const pts = a.trend.points;
  const ch = 55, cx = MX + 10, cw = CW - 22;
  need(ch + 22);
  const lo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.avg), o.notYetMin) - 5) / 5) * 5);
  const span = Math.max(1, diffDays(a.period.to, a.period.from));
  const px = (d: string) => cx + (cw * diffDays(d, a.period.from)) / span;
  const py = (v: number) => y + ch * (1 - (v - lo) / (100 - lo));
  doc.setLineWidth(0.2);
  for (let v = lo; v <= 100; v += lo >= 60 ? 10 : 20) {
    doc.setDrawColor(...GRID); doc.line(cx, py(v), cx + cw, py(v)); text(`${v}%`, cx - 2, py(v) + 1, 8, false, MUTED, "right");
  }
  doc.setLineDashPattern([1.5, 1.2], 0); doc.setDrawColor(138, 160, 168);
  for (const v of [o.compliantMin, o.notYetMin]) { doc.line(cx, py(v), cx + cw, py(v)); text(`${v}%`, cx + cw + 1.5, py(v) + 1, 8, false, MUTED); }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.6);
  for (let i = 1; i < pts.length; i++) doc.line(px(pts[i - 1].date), py(pts[i - 1].avg), px(pts[i].date), py(pts[i].avg));
  doc.setFillColor(...TEAL); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4);
  for (const p of pts) doc.circle(px(p.date), py(p.avg), 1.1, "FD");
  const lastPt = pts[pts.length - 1];
  text(`${lastPt.avg}%`, Math.min(px(lastPt.date), cx + cw - 4), py(lastPt.avg) - 2.5, 9, true);
  doc.setFillColor(...AMBER); doc.setDrawColor(255, 255, 255);
  for (const t of a.training) { const tx = px(t.date), ty = y + ch + 4; doc.triangle(tx, ty - 2, tx + 2, ty, tx, ty + 2, "F"); doc.triangle(tx, ty - 2, tx - 2, ty, tx, ty + 2, "F"); }
  y += ch + 10;
  text(`Teal line: average compliance per ${a.trend.granularity}. Amber diamond: training session.`, MX, y, 8, false, MUTED); y += 4;

  // simple table helper
  const table = (head: string[], widths: number[], rows: string[][]) => {
    const draw = (cells: string[], bold: boolean) => {
      const lines = cells.map((c, i) => wrap(c, widths[i] - 2));
      const h = Math.max(...lines.map((l) => l.length)) * 4.2 + 2.5;
      need(h);
      let x = MX;
      lines.forEach((l, i) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 8.5 : 9); doc.setTextColor(...(bold ? MUTED : INK)); doc.text(l, x, y + 3.5); x += widths[i]; });
      y += h; doc.setDrawColor(...GRID); doc.setLineWidth(0.2); doc.line(MX, y - 0.8, MX + CW, y - 0.8);
    };
    draw(head, true); rows.forEach((r) => draw(r, false));
  };

  heading("Sites");
  table(["Site", "Audits", "Average", "Latest", "Latest status"], [66, 18, 24, 24, 50],
    a.sites.map((s) => [s.siteName, String(s.audits), `${s.avgPercent}%`, `${s.latestPercent}%`, s.latestStatus === "INCOMPLETE" ? "Incomplete" : STATUS_LABEL[s.latestStatus]]));

  heading("Weakest sections");
  table(["Section", "Score", "High risk"], [112, 24, 46],
    a.sections.slice(0, 10).map((s) => [title(s.name), `${s.percent}%`, s.highRisk ? "Yes (85% floor)" : "No"]));

  heading("Does training help?");
  if (!a.training.length) text("No training sessions were logged in this period.", MX, y, 9.5, false, MUTED), y += 5;
  else {
    table(["Session", "Site", "Before", "After", "Change"], [62, 44, 26, 26, 24],
      a.training.map((t) => [`${t.topic} (${fmtDate(t.date)})`, t.siteName,
        t.before.avg === null ? "n/a" : `${t.before.avg}% (${t.before.n})`, t.after.avg === null ? "n/a" : `${t.after.avg}% (${t.after.n})`,
        t.delta === null ? "n/a" : `${sign(t.delta)} pts${t.confidence === "low" ? " (low)" : ""}`]));
    y += 2;
    const note = (a.trainingSummary ? `Across ${a.trainingSummary.sessions} session${a.trainingSummary.sessions === 1 ? "" : "s"} with enough audits, the average change was ${sign(a.trainingSummary.avgDelta)} pts. ` : "")
      + "Averages use the audits within 90 days before and after each session (number of audits in brackets). Scores moved this way around the sessions; this shows a link, not proof that training caused the change.";
    const lines = wrap(note, CW); need(lines.length * 4); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(lines, MX, y + 3); y += lines.length * 4 + 2;
  }

  heading("Failures that keep coming back");
  if (!a.recurring.length) text("No item failed in more than one audit.", MX, y, 9.5, false, MUTED), y += 5;
  else table(["Item", "Severity", "Times", "Last seen"], [100, 24, 16, 42],
    a.recurring.slice(0, 10).map((r) => [r.text, title(r.severity), String(r.count), fmtDate(r.lastSeen)]));

  return finish(doc, author);
}

function finish(doc: jsPDF, author: string): jsPDF {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`AudEx - ${author}`, MX, PH - 8);
    doc.text(`Page ${i} of ${n}`, PW - MX, PH - 8, { align: "right" });
  }
  return doc;
}
