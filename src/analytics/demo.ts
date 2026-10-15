import { activeRuleSetCode, ruleSet, sections } from "../scoring/catalog";
import { evaluate } from "../scoring/engine";
import type { Result, ScoredItem } from "../scoring/types";
import { addDays } from "./dates";
import type { AuditSummary, Site, TrainingSession } from "./types";

/** Small deterministic PRNG (mulberry32) so the demo looks the same on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_SITES: Site[] = [
  { id: "demo-1", name: "Demo site A (clinic)" },
  { id: "demo-2", name: "Demo site B (hospital)" },
  { id: "demo-3", name: "Demo site C (retirement village)" },
];

interface Plan { site: Site; seed: number; base: number; lift: number; trainings: { daysAgo: number; topic: string }[]; weak: string[] }

const PLANS: Plan[] = [
  { site: DEMO_SITES[0], seed: 11, base: 0.88, lift: 0.09,
    trainings: [{ daysAgo: 150, topic: "Chemical storage and dilution" }],
    weak: ["chemicals-chemical-storage", "sluice"] },
  { site: DEMO_SITES[1], seed: 22, base: 0.84, lift: 0.12,
    trainings: [{ daysAgo: 170, topic: "Bathroom cleaning procedure" }, { daysAgo: 60, topic: "Colour-coding and trolley set-up" }],
    weak: ["bathroom-toilet-cleaning-procedure", "cleaning-equipment-trolley", "linen-management"] },
  { site: DEMO_SITES[2], seed: 33, base: 0.92, lift: 0.05,
    trainings: [{ daysAgo: 100, topic: "Waste disposal refresher" }],
    weak: ["waste-disposal"] },
];

/** Roughly nine months of audits, scored by the real engine so statuses and section scores are consistent. */
export function generateDemo(today: string): { sites: Site[]; audits: AuditSummary[]; trainings: TrainingSession[] } {
  const audits: AuditSummary[] = [];
  const trainings: TrainingSession[] = [];
  const rules = ruleSet(activeRuleSetCode);

  for (const plan of PLANS) {
    const rand = rng(plan.seed);
    const sessions = plan.trainings.map((t, i) => ({ id: `${plan.site.id}-t${i + 1}`, siteId: plan.site.id,
      date: addDays(today, -t.daysAgo), topic: t.topic }));
    trainings.push(...sessions);

    let n = 0;
    for (let ago = 270; ago >= 4; ago -= 14 + Math.floor(rand() * 8)) {
      const date = addDays(today, -ago);
      const trained = sessions.filter((s) => s.date < date).length;
      // Compliance probability improves with each training session, with some noise.
      const quality = Math.min(0.99, plan.base + (plan.lift * (1 - Math.exp(-trained * 0.9))) + (rand() - 0.5) * 0.06);
      const items: ScoredItem[] = sections.flatMap((s) => s.items.map((i) => {
        const isWeak = plan.weak.includes(s.code);
        const weak = isWeak ? (trained ? 0.04 : 0.1) : 0;
        // Critical items rarely fail, except in a site's weak sections before training lands.
        const sev = i.severity === "CRITICAL" ? (isWeak && !trained ? 0.35 : isWeak ? 0.12 : 0.04) : i.severity === "MAJOR" ? 0.7 : 1;
        const roll = rand();
        const failP = Math.max(0, 1 - quality + weak) * 0.5 * sev;
        const partP = Math.max(0, 1 - quality + weak) * 0.7 * (i.severity === "CRITICAL" ? 0.4 : 1);
        const result: Result = roll < failP ? "NON_COMPLIANT" : roll < failP + partP ? "PARTIALLY_COMPLIANT"
          : roll > 0.985 ? "NA" : "COMPLIANT";
        return { key: i.key, sectionCode: s.code, highRisk: s.highRisk, severity: i.severity, weight: i.weight, result };
      }));
      const r = evaluate(items, rules);
      audits.push({
        id: `${plan.site.id}-a${++n}`, siteId: plan.site.id, date, ruleSetCode: rules.code, status: r.status,
        earnedHalf: r.earnedHalf, possibleHalf: r.possibleHalf, percent: r.percent,
        criticalFailures: r.criticalFailures, sectionScores: r.sectionScores,
        failedItems: items.filter((i) => i.result === "NON_COMPLIANT").map((i) => ({ key: i.key, severity: i.severity })),
      });
    }
  }
  audits.sort((a, b) => a.date.localeCompare(b.date));
  return { sites: DEMO_SITES, audits, trainings };
}
