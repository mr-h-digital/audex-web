import { describe, expect, it } from "vitest";
import { computeAnalytics } from "./analytics";
import { resolvePeriod } from "./period";
import type { AuditSummary, Site, TrainingSession } from "./types";
import type { Status } from "../scoring/types";

const TODAY = "2026-10-15"; // a Thursday
const sites: Site[] = [{ id: "A", name: "Site A" }, { id: "B", name: "Site B" }, { id: "C", name: "Site C" }];

function audit(id: string, siteId: string, date: string, percent: number, status: Status, extra: Partial<AuditSummary> = {}): AuditSummary {
  return { id, siteId, date, ruleSetCode: "WPC_V1", status, earnedHalf: 0, possibleHalf: 0, percent, criticalFailures: 0,
    sectionScores: [], failedItems: [], ...extra };
}

const a1 = audit("a1", "A", "2026-08-10", 90, "NOT_YET_COMPLIANT", {
  sectionScores: [
    { code: "chemicals-chemical-storage", highRisk: true, earnedHalf: 20, possibleHalf: 28, percent: 71.43 },
    { code: "reception", highRisk: false, earnedHalf: 32, possibleHalf: 32, percent: 100 },
  ],
  failedItems: [{ key: "chemicals-chemical-storage-02", severity: "CRITICAL" }, { key: "reception-01", severity: "MINOR" }],
});
const a2 = audit("a2", "A", "2026-09-10", 96, "COMPLIANT", {
  sectionScores: [
    { code: "chemicals-chemical-storage", highRisk: true, earnedHalf: 28, possibleHalf: 28, percent: 100 },
    { code: "reception", highRisk: false, earnedHalf: 30, possibleHalf: 32, percent: 93.75 },
  ],
  failedItems: [{ key: "reception-01", severity: "MINOR" }],
});
const a3 = audit("a3", "B", "2026-09-12", 80, "NON_COMPLIANT", {
  criticalFailures: 1,
  sectionScores: [{ code: "chemicals-chemical-storage", highRisk: true, earnedHalf: 14, possibleHalf: 28, percent: 50 }],
  failedItems: [
    { key: "chemicals-chemical-storage-02", severity: "CRITICAL" }, { key: "reception-01", severity: "MINOR" },
    { key: "chemicals-chemical-storage-05", severity: "MINOR" },
  ],
});
const a4 = audit("a4", "B", "2026-05-01", 70, "NON_COMPLIANT"); // previous period
const a5 = audit("a5", "A", "2026-05-20", 86, "NOT_YET_COMPLIANT"); // previous period
const a6 = audit("a6", "B", "2026-10-01", 50, "INCOMPLETE"); // never counted
const all = [a1, a2, a3, a4, a5, a6];
const last90 = resolvePeriod("last90", TODAY); // 18 Jul to 15 Oct; previous = 19 Apr to 17 Jul

const run = (over: Partial<Parameters<typeof computeAnalytics>[0]> = {}) =>
  computeAnalytics({ audits: all, trainings: [], sites, period: last90, siteIds: null, ...over });

describe("headline numbers", () => {
  const k = run().kpis;
  it("counts only finalised audits inside the period", () => {
    expect(k.audits).toBe(3);
    expect(k.statusCounts).toEqual({ COMPLIANT: 1, NOT_YET_COMPLIANT: 1, NON_COMPLIANT: 1, INCOMPLETE: 0 });
  });
  it("averages audit percentages and compares with the previous period", () => {
    expect(k.avgPercent).toBe(88.7); // (90 + 96 + 80) / 3
    expect(k.prevAvgPercent).toBe(78); // (70 + 86) / 2
    expect(k.deltaPoints).toBe(10.7);
  });
  it("counts critical failures and sites needing attention", () => {
    expect(k.auditsWithCriticalFailure).toBe(1);
    expect(k.sitesAudited).toBe(2);
    expect(k.sitesNeedingAttention).toBe(1); // B's latest audit is Non-Compliant
  });
  it("gives no delta when the previous period has no audits", () => {
    const r = run({ audits: [a1, a2, a3] });
    expect(r.kpis.prevAvgPercent).toBeNull();
    expect(r.kpis.deltaPoints).toBeNull();
  });
  it("handles a period with no audits", () => {
    const r = run({ period: resolvePeriod("last30", TODAY) });
    expect(r.kpis.audits).toBe(0);
    expect(r.kpis.avgPercent).toBeNull();
    expect(r.trend.points).toEqual([]);
  });
});

describe("site filter", () => {
  it("limits everything to the chosen site", () => {
    const r = run({ siteIds: ["A"] });
    expect(r.kpis.audits).toBe(2);
    expect(r.kpis.avgPercent).toBe(93);
    expect(r.sites.map((s) => s.siteId)).toEqual(["A"]);
  });
  it("treats an empty list as all sites", () => {
    expect(run({ siteIds: [] }).kpis.audits).toBe(3);
  });
});

describe("site comparison", () => {
  it("ranks the weakest site first and reports the latest audit", () => {
    const s = run().sites;
    expect(s.map((x) => x.siteId)).toEqual(["B", "A"]);
    expect(s[1]).toMatchObject({ audits: 2, avgPercent: 93, latestPercent: 96, latestStatus: "COMPLIANT", latestDate: "2026-09-10" });
  });
});

describe("trend", () => {
  it("plots each audit when one site is selected", () => {
    const t = run({ siteIds: ["A"] }).trend;
    expect(t.granularity).toBe("audit");
    expect(t.points.map((p) => [p.date, p.avg])).toEqual([["2026-08-10", 90], ["2026-09-10", 96]]);
  });
  it("averages by week across sites for a period up to 120 days", () => {
    const t = run().trend;
    expect(t.granularity).toBe("week");
    expect(t.points.map((p) => [p.label, p.avg, p.n])).toEqual([["Week of 10 Aug", 90, 1], ["Week of 7 Sep", 88, 2]]);
  });
  it("averages by month across sites for longer periods", () => {
    const t = run({ period: resolvePeriod("ytd", TODAY) }).trend;
    expect(t.granularity).toBe("month");
    expect(t.points.map((p) => [p.label, p.avg, p.n])).toEqual([["May 2026", 78, 2], ["Aug 2026", 90, 1], ["Sep 2026", 88, 2]]);
  });
});

describe("weakest sections", () => {
  it("weights by points and sorts the weakest first", () => {
    const s = run().sections;
    expect(s.map((x) => [x.code, x.percent, x.audits, x.highRisk])).toEqual([
      ["chemicals-chemical-storage", 73.8, 3, true], // (20 + 28 + 14) / 84
      ["reception", 96.9, 2, false], // (32 + 30) / 64
    ]);
    expect(s[0].name).toBe("CHEMICALS & CHEMICAL STORAGE");
  });
});

describe("recurring failures", () => {
  it("lists items that failed in two or more audits, Critical first", () => {
    const r = run().recurring;
    expect(r.map((x) => [x.key, x.severity, x.count, x.lastSeen])).toEqual([
      ["chemicals-chemical-storage-02", "CRITICAL", 2, "2026-09-12"],
      ["reception-01", "MINOR", 3, "2026-09-12"],
    ]);
    expect(r[1].text).toContain("floors and carpets");
  });
});

describe("training effect", () => {
  const t = (id: string, siteId: string, date: string): TrainingSession => ({ id, siteId, date, topic: `Topic ${id}` });

  it("compares the 90 days before and after, with confidence", () => {
    const audits = [
      audit("c1", "C", "2026-08-01", 80, "NON_COMPLIANT"), audit("c2", "C", "2026-08-20", 84, "NON_COMPLIANT"),
      audit("c3", "C", "2026-09-15", 90, "NOT_YET_COMPLIANT"), audit("c4", "C", "2026-10-05", 94, "NOT_YET_COMPLIANT"),
    ];
    const r = computeAnalytics({ audits, trainings: [t("t1", "C", "2026-09-01")], sites, period: last90, siteIds: null });
    expect(r.training[0]).toMatchObject({ before: { n: 2, avg: 82 }, after: { n: 2, avg: 92 }, delta: 10, confidence: "ok", siteName: "Site C" });
    expect(r.trainingSummary).toEqual({ sessions: 1, avgDelta: 10 });
  });

  it("flags one audit on a side as low confidence and leaves it out of the summary", () => {
    const r = run({ trainings: [t("t1", "A", "2026-09-01")] });
    expect(r.training[0]).toMatchObject({ before: { n: 1, avg: 90 }, after: { n: 1, avg: 96 }, delta: 6, confidence: "low" });
    expect(r.trainingSummary).toBeNull();
  });

  it("gives no comparison when one side has no audits, and ignores Incomplete audits", () => {
    const r = run({ trainings: [t("t2", "B", "2026-09-20")] });
    expect(r.training[0]).toMatchObject({ before: { n: 1 }, after: { n: 0, avg: null }, delta: null, confidence: "none" });
  });

  it("leaves out audits on the training day itself", () => {
    const r = run({ trainings: [t("t3", "A", "2026-09-10")] }); // a2 was audited that day
    expect(r.training[0].after.n).toBe(0);
    expect(r.training[0].before.n).toBe(1);
  });

  it("includes an audit exactly 90 days before and excludes 91", () => {
    const edge = [audit("e1", "C", "2026-06-03", 70, "NON_COMPLIANT"), audit("e2", "C", "2026-06-02", 60, "NON_COMPLIANT")];
    const r = computeAnalytics({ audits: edge, trainings: [t("t4", "C", "2026-09-01")], sites, period: last90, siteIds: null });
    expect(r.training[0].before).toEqual({ n: 1, avg: 70 });
  });

  it("only lists sessions inside the period and for the chosen sites", () => {
    const trainings = [t("in", "A", "2026-09-01"), t("old", "A", "2026-03-01"), t("other", "B", "2026-09-01")];
    expect(run({ trainings }).training.map((x) => x.id).sort()).toEqual(["in", "other"]);
    expect(run({ trainings, siteIds: ["A"] }).training.map((x) => x.id)).toEqual(["in"]);
  });

  it("uses audits from before the period for the 'before' side", () => {
    // training on 20 Jul (inside last90); audit on 5 Jul (before the period) still counts as 'before'
    const audits = [audit("p1", "C", "2026-07-05", 70, "NON_COMPLIANT"), audit("p2", "C", "2026-08-05", 80, "NON_COMPLIANT")];
    const r = computeAnalytics({ audits, trainings: [t("t5", "C", "2026-07-20")], sites, period: last90, siteIds: null });
    expect(r.training[0].before.n).toBe(1);
    expect(r.training[0].after.n).toBe(1);
  });
});
