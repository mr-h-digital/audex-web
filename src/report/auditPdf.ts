import { jsPDF } from "jspdf";
import { fmtDate } from "../analytics/dates";
import { REPORT_AUTHOR, REPORT_ROLE } from "../config";
import type { SavedAudit } from "../audits/store";
import { scoreOf } from "../audits/store";
import { getPhoto } from "../photos/blobStore";
import { pdfJpegDataUrl } from "../photos/compress";
import { ruleSet } from "../scoring/catalog";
import { auditTemplate } from "../facilities/catalog";
import { explain } from "../scoring/explain";

const TEAL: [number, number, number] = [11, 77, 96];
const INK: [number, number, number] = [15, 42, 51];
const MUTED: [number, number, number] = [74, 95, 103];
const GRID: [number, number, number] = [223, 230, 232];
const LABEL = { COMPLIANT: "Compliant", NOT_YET_COMPLIANT: "Not yet compliant", NON_COMPLIANT: "Non-compliant", INCOMPLETE: "Incomplete" } as const;
const PW = 210, PH = 297, MX = 16, CW = PW - 2 * MX;
const title = (s: string) => s.toLowerCase().replace(/(^|[\s/&(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export const auditFilename = (a: SavedAudit) => `AudEx-audit_${a.siteName.replace(/[^A-Za-z0-9]+/g, "-")}_${a.date}.pdf`;

/** One audit: who and where, the result and why, section scores, and every item that was not fully compliant. */
export async function buildAuditReport(a: SavedAudit, logo: string | null = null, photoUrls: Record<string, string> = {}): Promise<jsPDF> {
  const author = a.auditor || REPORT_AUTHOR, role = a.auditorRole || REPORT_ROLE;
  const rules = ruleSet(a.ruleSetCode);
  const score = scoreOf(a);
  const template = auditTemplate(a);
  const sections = template.sections;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `AudEx audit ${a.siteName} ${a.date}`, author, creator: "AudEx" });
  let y = 0;
  const text = (s: string, x: number, yy: number, size = 10, bold = false, color = INK, align: "left" | "right" = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]); doc.text(s, x, yy, { align });
  };
  const need = (h: number) => { if (y + h > PH - 18) { doc.addPage(); y = 18; } };
  const heading = (s: string) => { need(14); y += 4; text(s, MX, y, 13, true, TEAL); y += 2; doc.setDrawColor(GRID[0], GRID[1], GRID[2]); doc.line(MX, y, PW - MX, y); y += 6; };
  const wrap = (s: string, w: number) => doc.splitTextToSize(s, w) as string[];

  doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]); doc.rect(0, 0, PW, 6, "F");
  if (logo) { try { doc.addImage(logo, "PNG", MX, 12, 46, 13.8); } catch { /* optional */ } } else text("AudEx", MX, 22, 20, true, TEAL);
  y = 34;
  text("Housekeeping audit report", MX, y, 18, true); y += 8;
  for (const [k, v] of [["Site", a.siteName], ["Audit date", fmtDate(a.date)], ["Auditor", author], ["Unit manager", a.unitManager || "Not recorded"],
    ["Housekeeping supervisor", a.supervisor || "Not recorded"], ["Scoring rules", rules.name]] as const) {
    text(k, MX, y, 10, false, MUTED); text(v, MX + 48, y, 10); y += 5;
  }
  text(role, MX, y + 1, 8.5, false, MUTED); y += 10;
  for (const line of wrap(`Audit standard: ${template.name} v${template.version}. Facility: ${template.facilityName}. Areas: ${template.areas.map((area) => area.name).join(", ") || "not recorded"}.`, CW)) {
    need(5); text(line, MX, y, 9); y += 5;
  }
  for (const line of wrap(template.notice, CW)) { need(5); text(line, MX, y, 8, false, MUTED); y += 4; }
  y += 4;

  text(`${score.percent}%`, MX, y + 10, 34, true, TEAL);
  text(LABEL[score.status], MX + 52, y + 4, 14, true);
  explain(score, rules).slice(0, 3).forEach((l, i) => text(wrap(l, CW - 52)[0], MX + 52, y + 10 + i * 4.5, 9, false, MUTED));
  y += 26;

  heading("Section scores");
  for (const s of sections) {
    const sc = score.sectionScores.find((x) => x.code === s.code); if (!sc) continue;
    need(6); text(title(s.name) + (s.highRisk ? " (high risk)" : ""), MX, y, 9);
    text(`${sc.percent}%`, MX + CW, y, 9, true, INK, "right");
    doc.setFillColor(GRID[0], GRID[1], GRID[2]); doc.rect(MX + 100, y - 3, 50, 3, "F");
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]); doc.rect(MX + 100, y - 3, (50 * sc.percent) / 100, 3, "F"); y += 5.5;
  }

  /** Draws a row of small photos (max 3 per row), fitting each into a 50 x 38 mm box. */
  const drawPhotos = (ids: string[]) => {
    const urls = ids.map((id) => photoUrls[id]).filter(Boolean);
    for (let i = 0; i < urls.length; i += 3) {
      need(42); let x = MX;
      for (const u of urls.slice(i, i + 3)) {
        try {
          const pr = doc.getImageProperties(u); const k = Math.min(50 / pr.width, 38 / pr.height);
          doc.addImage(u, "JPEG", x, y, pr.width * k, pr.height * k);
        } catch { /* skip an unreadable photo */ }
        x += 54;
      }
      y += 41;
    }
  };

  heading("Items needing action");
  const rows = sections.flatMap((s) => s.items.filter((i) => ["NON_COMPLIANT", "PARTIALLY_COMPLIANT"].includes(a.answers[i.key] ?? "")).map((i) => ({ s, i, r: a.answers[i.key] })));
  if (!rows.length) text("Every item was compliant or not applicable.", MX, y, 9.5, false, MUTED);
  for (const { s, i, r } of rows) {
    const lines = wrap(i.text, CW - 40); need(lines.length * 4.2 + 8);
    text(`${title(i.severity)} - ${r === "NON_COMPLIANT" ? "Non-compliant" : "Partial"}`, MX, y, 8.5, true, MUTED);
    text(title(s.name), MX + CW, y, 8.5, false, MUTED, "right"); y += 4.2;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text(lines, MX, y); y += lines.length * 4.2 + 3;
    drawPhotos((a.photos ?? []).filter((p) => p.itemKey === i.key).map((p) => p.id));
  }
  const general = (a.photos ?? []).filter((p) => p.itemKey === null);
  if (general.length) { heading("Site photos"); drawPhotos(general.map((p) => p.id)); }

  const nas = sections.flatMap((s) => s.items.filter((i) => a.answers[i.key] === "NA").map((i) => ({ i, why: a.naReasons?.[i.key] ?? "" })));
  if (nas.length) {
    heading("Not applicable items");
    for (const { i, why } of nas) {
      const lines = wrap(`${i.text} - Reason: ${why || "not recorded"}`, CW); need(lines.length * 4.2 + 3);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]); doc.text(lines, MX, y); y += lines.length * 4.2 + 2;
    }
  }

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); text(`AudEx - ${author}`, MX, PH - 8, 8, false, MUTED); text(`Page ${p} of ${n}`, PW - MX, PH - 8, 8, false, MUTED, "right"); }
  return doc;
}

export async function downloadAuditReport(a: SavedAudit, loadPhoto: (id: string) => Promise<Blob | undefined> = getPhoto): Promise<void> {
  let logo: string | null = null;
  try {
    const blob = await (await fetch("/logo/audex-lockup.png")).blob();
    logo = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = no; r.readAsDataURL(blob); });
  } catch { /* logo is optional */ }
  const photoUrls: Record<string, string> = {};
  for (const p of a.photos ?? []) {
    const missing = () => new Error("Some audit photos are not cached. Connect to download them before exporting this report.");
    let b: Blob | undefined;
    try { b = await loadPhoto(p.id); } catch { throw missing(); }
    if (!b) throw missing();
    try { photoUrls[p.id] = await pdfJpegDataUrl(b); } catch { throw missing(); }
  }
  (await buildAuditReport(a, logo, photoUrls)).save(auditFilename(a));
}
