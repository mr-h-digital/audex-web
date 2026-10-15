import { describe, expect, it } from "vitest";
import { computeAnalytics } from "../analytics/analytics";
import { generateDemo } from "../analytics/demo";
import { resolvePeriod } from "../analytics/period";
import { buildReport, reportFilename } from "./pdf";

const today = "2026-10-15";
const d = generateDemo(today);
const run = (preset: "last90" | "last12m", siteIds: string[] | null) =>
  computeAnalytics({ ...d, period: resolvePeriod(preset, today), siteIds });
const opts = { demo: true, siteName: "All sites", compliantMin: 95, notYetMin: 85, logo: null };

describe("PDF report", () => {
  it("produces a real PDF", async () => {
    const doc = await buildReport(run("last12m", null), opts);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });
  it("names the file by period and credits Chernay", async () => {
    const a = run("last90", null);
    expect(reportFilename(a)).toBe("AudEx-report_2026-07-18_to_2026-10-15.pdf");
    const doc = await buildReport(a, opts);
    expect(String(doc.output())).toContain("Chernay Hildebrandt");
  });
  it("handles an empty period", async () => {
    const a = computeAnalytics({ ...d, period: resolvePeriod("custom", today, { from: "2020-01-01", to: "2020-02-01" }), siteIds: null });
    const doc = await buildReport(a, opts);
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
