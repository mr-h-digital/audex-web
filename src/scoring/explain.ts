import type { RuleSet, ScoreResult } from "./types";
import { sections } from "./catalog";

const sectionName = (code: string) => sections.find((s) => s.code === code)?.name ?? code;

/** Plain-language reasons an audit is not plain "Compliant", shown to the auditor and in the PDF. */
export function explain(score: ScoreResult, rules: RuleSet): string[] {
  const out: string[] = [];
  if (score.status === "INCOMPLETE") {
    out.push(`${score.unanswered} item${score.unanswered === 1 ? "" : "s"} still to answer.`);
  }
  if (score.criticalFailures > 0 && rules.criticalNonCompliantOverride) {
    out.push(`${score.criticalFailures} Critical item${score.criticalFailures === 1 ? "" : "s"} Non-Compliant: an automatic fail.`);
  }
  if (score.triggers.includes("criticalPartialCap")) {
    out.push("A Critical item is only Partially Compliant, so the best possible status is Not Yet Compliant.");
  }
  if (score.triggers.includes("majorFailureCap")) {
    out.push(`${rules.majorFailureCap.count} or more Major items are Non-Compliant, so the best possible status is Not Yet Compliant.`);
  }
  if (score.triggers.includes("highRiskSectionFloor")) {
    const min = rules.highRiskSectionFloor.minTenths / 10;
    const low = score.sectionScores
      .filter((s) => s.highRisk && s.possibleHalf > 0 &&
        s.earnedHalf * 1000 < s.possibleHalf * rules.highRiskSectionFloor.minTenths)
      .map((s) => `${sectionName(s.code)} (${s.percent}%)`);
    out.push(`High-risk section${low.length === 1 ? "" : "s"} under ${min}%: ${low.join(", ")}.`);
  }
  if (score.flags.includes("naReview")) {
    out.push(`More than ${rules.naReviewTrigger.maxShareTenths / 10}% of items are N/A. Please review the reasons.`);
  }
  return out;
}
