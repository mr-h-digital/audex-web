import type { Analytics } from "../analytics/types";
import type { ReportOptions } from "./pdf";

/** Builds the PDF (jsPDF is loaded only now, so it never slows the audit screen) and saves it. */
export async function downloadReport(a: Analytics, opts: ReportOptions): Promise<void> {
  const { buildReport, reportFilename } = await import("./pdf");
  const doc = await buildReport(a, opts);
  doc.save(reportFilename(a));
}
