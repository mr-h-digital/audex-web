import { sections as templateSections } from "../scoring/catalog";
import type { Severity, Status } from "../scoring/types";
import { addDays, fmtDate, fmtMonth, fmtShort, meanDate, startOfMonth, startOfWeek } from "./dates";
import { previousPeriod } from "./period";
import type {
  Analytics, AnalyticsInput, AuditSummary, Confidence, Kpis, RecurringRow, SectionRow, SiteRow,
  TrainingRow, Trend, TrendPoint, WindowAvg,
} from "./types";

/** How far either side of a training session we look for audits when judging its effect. */
export const TRAINING_WINDOW_DAYS = 90;

const r1 = (n: number): number => Math.round(n * 10) / 10;
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };

const sectionMeta = new Map(templateSections.map((s) => [s.code, s]));
const itemMeta = new Map(templateSections.flatMap((s) => s.items.map((i) => [i.key, i] as const)));

function trendFor(audits: AuditSummary[], periodDays: number): Trend {
  if (audits.length === 0) return { granularity: "audit", points: [] };
  const oneSite = new Set(audits.map((a) => a.siteId)).size === 1;
  if (oneSite) {
    return {
      granularity: "audit",
      points: audits.map((a) => ({ date: a.date, label: fmtDate(a.date), avg: r1(a.percent), n: 1 })),
    };
  }
  const granularity = periodDays <= 120 ? "week" : "month";
  const buckets = new Map<string, AuditSummary[]>();
  for (const a of audits) {
    const k = granularity === "week" ? startOfWeek(a.date) : startOfMonth(a.date);
    buckets.set(k, [...(buckets.get(k) ?? []), a]);
  }
  const points: TrendPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, group]) => ({
      date: meanDate(group.map((g) => g.date)),
      label: granularity === "week" ? `Week of ${fmtShort(k)}` : fmtMonth(k),
      avg: r1(mean(group.map((g) => g.percent))),
      n: group.length,
    }));
  return { granularity, points };
}

function windowAvg(audits: AuditSummary[]): WindowAvg {
  return { n: audits.length, avg: audits.length ? r1(mean(audits.map((a) => a.percent))) : null };
}

/** "ok" needs at least two audits on each side; one audit is shown but flagged low; none means no comparison. */
function confidenceOf(before: WindowAvg, after: WindowAvg): Confidence {
  if (before.n === 0 || after.n === 0) return "none";
  return before.n >= 2 && after.n >= 2 ? "ok" : "low";
}

/**
 * Everything the dashboard and the PDF report show, for one period and one set of sites. Both read this single
 * result, so the numbers on screen and in the report always agree. Only finalised audits count (Incomplete ones
 * are ignored); averages are the plain mean of each audit's percentage.
 */
export function computeAnalytics(input: AnalyticsInput): Analytics {
  const { period } = input;
  const previous = previousPeriod(period);
  const siteOk = (id: string) => !input.siteIds || input.siteIds.length === 0 || input.siteIds.includes(id);
  const siteName = (id: string) => input.sites.find((s) => s.id === id)?.name ?? id;

  const finalised = input.audits
    .filter((a) => a.status !== "INCOMPLETE" && siteOk(a.siteId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const within = (a: AuditSummary, from: string, to: string) => a.date >= from && a.date <= to;
  const current = finalised.filter((a) => within(a, period.from, period.to));
  const prior = finalised.filter((a) => within(a, previous.from, previous.to));

  // sites
  const bySite = new Map<string, AuditSummary[]>();
  for (const a of current) bySite.set(a.siteId, [...(bySite.get(a.siteId) ?? []), a]);
  const sites: SiteRow[] = [...bySite.entries()].map(([id, list]) => {
    const latest = list[list.length - 1];
    return {
      siteId: id, siteName: siteName(id), audits: list.length, avgPercent: r1(mean(list.map((a) => a.percent))),
      latestPercent: r1(latest.percent), latestStatus: latest.status, latestDate: latest.date,
    };
  }).sort((a, b) => a.avgPercent - b.avgPercent || a.siteName.localeCompare(b.siteName));

  // headline numbers
  const statusCounts: Record<Status, number> = { COMPLIANT: 0, NOT_YET_COMPLIANT: 0, NON_COMPLIANT: 0, INCOMPLETE: 0 };
  for (const a of current) statusCounts[a.status]++;
  const avg = current.length ? r1(mean(current.map((a) => a.percent))) : null;
  const prevAvg = prior.length ? r1(mean(prior.map((a) => a.percent))) : null;
  const kpis: Kpis = {
    audits: current.length,
    avgPercent: avg,
    prevAvgPercent: prevAvg,
    deltaPoints: avg !== null && prevAvg !== null ? r1(avg - prevAvg) : null,
    statusCounts,
    auditsWithCriticalFailure: current.filter((a) => a.criticalFailures > 0).length,
    sitesNeedingAttention: sites.filter((s) => s.latestStatus !== "COMPLIANT").length,
    sitesAudited: sites.length,
  };

  // weakest sections: weighted by points, so a long section counts for more than a short one
  const sectionTotals = new Map<string, { earned: number; possible: number; audits: number }>();
  for (const a of current) {
    for (const s of a.sectionScores) {
      if (s.possibleHalf === 0) continue;
      const t = sectionTotals.get(s.code) ?? { earned: 0, possible: 0, audits: 0 };
      sectionTotals.set(s.code, { earned: t.earned + s.earnedHalf, possible: t.possible + s.possibleHalf, audits: t.audits + 1 });
    }
  }
  const sections: SectionRow[] = [...sectionTotals.entries()].map(([code, t]) => ({
    code, name: sectionMeta.get(code)?.name ?? code, highRisk: sectionMeta.get(code)?.highRisk ?? false,
    percent: r1((t.earned / t.possible) * 100), audits: t.audits,
  })).sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));

  // items failing in two or more audits
  const failures = new Map<string, { count: number; lastSeen: string }>();
  for (const a of current) {
    for (const key of new Set(a.failedItems.map((f) => f.key))) {
      const f = failures.get(key);
      failures.set(key, { count: (f?.count ?? 0) + 1, lastSeen: f && f.lastSeen > a.date ? f.lastSeen : a.date });
    }
  }
  const recurring: RecurringRow[] = [...failures.entries()]
    .filter(([, f]) => f.count >= 2)
    .map(([key, f]) => ({ key, text: itemMeta.get(key)?.text ?? key, severity: itemMeta.get(key)?.severity ?? "MINOR", ...f }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.key.localeCompare(b.key));

  // training effect: scores in the 90 days before vs after, looking at ALL of that site's audits (not just this period)
  const training: TrainingRow[] = input.trainings
    .filter((t) => siteOk(t.siteId) && t.date >= period.from && t.date <= period.to)
    .map((t) => {
      const siteAudits = finalised.filter((a) => a.siteId === t.siteId);
      // audits on the training day itself are ambiguous (before or after the session?), so they are left out
      const before = windowAvg(siteAudits.filter((a) => a.date < t.date && a.date >= addDays(t.date, -TRAINING_WINDOW_DAYS)));
      const after = windowAvg(siteAudits.filter((a) => a.date > t.date && a.date <= addDays(t.date, TRAINING_WINDOW_DAYS)));
      const delta = before.avg !== null && after.avg !== null ? r1(after.avg - before.avg) : null;
      return { id: t.id, siteId: t.siteId, siteName: siteName(t.siteId), date: t.date, topic: t.topic, before, after, delta,
        confidence: confidenceOf(before, after) };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const solid = training.filter((t) => t.confidence === "ok" && t.delta !== null);
  const trainingSummary = solid.length ? { sessions: solid.length, avgDelta: r1(mean(solid.map((t) => t.delta as number))) } : null;

  return { period, previous, audits: current, kpis, trend: trendFor(current, period.days), sites, sections, recurring, training, trainingSummary };
}
