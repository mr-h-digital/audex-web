import { describe, expect, it } from "vitest";
import { computeAnalytics } from "./analytics";
import { generateDemo } from "./demo";
import { resolvePeriod } from "./period";

const today = "2026-10-15";

describe("demo data", () => {
  const d = generateDemo(today);
  it("is deterministic", () => {
    expect(generateDemo(today)).toEqual(d);
  });
  it("covers every site with plenty of audits, none in the future", () => {
    for (const s of d.sites) expect(d.audits.filter((a) => a.siteId === s.id).length).toBeGreaterThan(12);
    expect(d.audits.every((a) => a.date <= today)).toBe(true);
  });
  it("improves after training", () => {
    const a = computeAnalytics({ audits: d.audits, trainings: d.trainings, sites: d.sites, siteIds: null,
      period: resolvePeriod("last12m", today) });
    expect(a.trainingSummary).not.toBeNull();
    expect(a.trainingSummary!.avgDelta).toBeGreaterThan(0);
    const pts = a.trend.points;
    expect(pts[pts.length - 1].avg).toBeGreaterThan(pts[0].avg);
  });
  it("has recurring failures", () => {
    const a = computeAnalytics({ audits: d.audits, trainings: d.trainings, sites: d.sites, siteIds: null,
      period: resolvePeriod("last90", today) });
    expect(a.recurring.length).toBeGreaterThan(0);
  });
});
