import type { Result, RuleSet, ScoreResult, ScoredItem, SectionScore, Status } from "./types";

export const TRIGGER_CRITICAL_PARTIAL = "criticalPartialCap";
export const TRIGGER_MAJOR_FAILURES = "majorFailureCap";
export const TRIGGER_HIGH_RISK_SECTION = "highRiskSectionFloor";
export const FLAG_NA_REVIEW = "naReview";

const percent = (earnedHalf: number, possibleHalf: number): number =>
  possibleHalf === 0 ? 0 : Math.round((earnedHalf * 10000) / possibleHalf) / 100;

/**
 * Twin of the Java ScoringEngine (backend). Runs on the phone for a live score while offline; the server
 * recalculates on sync and its figure is the official one. Both are tested against shared/scoring-fixtures.json.
 *
 * Order of decisions:
 *  1. any unanswered item                        -> INCOMPLETE
 *  2. any Critical item Non-Compliant (enabled)  -> NON_COMPLIANT
 *  3. percentage thresholds                      -> COMPLIANT / NOT_YET_COMPLIANT / NON_COMPLIANT
 *  4. COMPLIANT but a cap rule triggered         -> NOT_YET_COMPLIANT (caps never lower a worse status)
 * Points are half-points (weight x 2 when Compliant, weight x 1 when Partially Compliant).
 */
export function evaluate(items: ScoredItem[], rules: RuleSet): ScoreResult {
  let earned = 0, possible = 0, unanswered = 0, naCount = 0;
  let criticalNonCompliant = 0, criticalPartial = 0, majorNonCompliant = 0;
  const sections = new Map<string, { earned: number; possible: number; highRisk: boolean }>();

  for (const item of items) {
    let sec = sections.get(item.sectionCode);
    if (!sec) {
      sec = { earned: 0, possible: 0, highRisk: item.highRisk };
      sections.set(item.sectionCode, sec);
    }
    const r: Result | null = item.result;
    if (r === null) { unanswered++; continue; }
    if (r === "NA") { naCount++; continue; }
    const full = item.weight * 2;
    const got = r === "COMPLIANT" ? full : r === "PARTIALLY_COMPLIANT" ? item.weight : 0;
    earned += got; possible += full;
    sec.earned += got; sec.possible += full;
    if (item.severity === "CRITICAL") {
      if (r === "NON_COMPLIANT") criticalNonCompliant++;
      if (r === "PARTIALLY_COMPLIANT") criticalPartial++;
    } else if (item.severity === "MAJOR" && r === "NON_COMPLIANT") {
      majorNonCompliant++;
    }
  }

  const triggers: string[] = [];
  if (rules.criticalPartialCap.enabled && criticalPartial > 0) triggers.push(TRIGGER_CRITICAL_PARTIAL);
  if (rules.majorFailureCap.enabled && majorNonCompliant >= rules.majorFailureCap.count) {
    triggers.push(TRIGGER_MAJOR_FAILURES);
  }
  const sectionScores: SectionScore[] = [];
  let sectionBelowFloor = false;
  for (const [code, s] of sections) {
    sectionScores.push({ code, highRisk: s.highRisk, earnedHalf: s.earned, possibleHalf: s.possible,
      percent: percent(s.earned, s.possible) });
    if (s.highRisk && s.possible > 0 && rules.highRiskSectionFloor.enabled &&
        s.earned * 1000 < s.possible * rules.highRiskSectionFloor.minTenths) {
      sectionBelowFloor = true;
    }
  }
  if (sectionBelowFloor) triggers.push(TRIGGER_HIGH_RISK_SECTION);

  const flags: string[] = [];
  if (rules.naReviewTrigger.enabled && naCount * 1000 > items.length * rules.naReviewTrigger.maxShareTenths) {
    flags.push(FLAG_NA_REVIEW);
  }

  let status: Status;
  if (unanswered > 0) status = "INCOMPLETE";
  else if (rules.criticalNonCompliantOverride && criticalNonCompliant > 0) status = "NON_COMPLIANT";
  else if (possible > 0 && earned * 1000 >= possible * rules.compliantMinTenths) {
    status = triggers.length === 0 ? "COMPLIANT" : "NOT_YET_COMPLIANT";
  } else if (possible > 0 && earned * 1000 >= possible * rules.notYetMinTenths) status = "NOT_YET_COMPLIANT";
  else status = "NON_COMPLIANT";

  return { status, earnedHalf: earned, possibleHalf: possible, percent: percent(earned, possible),
    criticalFailures: criticalNonCompliant, unanswered, naCount, triggers, flags, sectionScores };
}
