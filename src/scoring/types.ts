export type Severity = "MINOR" | "MAJOR" | "CRITICAL";
export type Result = "COMPLIANT" | "PARTIALLY_COMPLIANT" | "NON_COMPLIANT" | "NA";
export type Status = "COMPLIANT" | "NOT_YET_COMPLIANT" | "NON_COMPLIANT" | "INCOMPLETE";

/** Percentages are integer tenths of a percent (950 = 95.0%) so comparisons are exact, as on the server. */
export interface RuleSet {
  code: string;
  name: string;
  compliantMinTenths: number;
  notYetMinTenths: number;
  criticalNonCompliantOverride: boolean;
  criticalPartialCap: { enabled: boolean };
  majorFailureCap: { enabled: boolean; count: number };
  highRiskSectionFloor: { enabled: boolean; minTenths: number };
  naReviewTrigger: { enabled: boolean; maxShareTenths: number };
}

/** One checklist item with the auditor's answer; result === null means unanswered. */
export interface ScoredItem {
  key: string;
  sectionCode: string;
  highRisk: boolean;
  severity: Severity;
  weight: number;
  result: Result | null;
}

export interface SectionScore {
  code: string;
  highRisk: boolean;
  earnedHalf: number;
  possibleHalf: number;
  percent: number;
}

export interface ScoreResult {
  status: Status;
  earnedHalf: number;
  possibleHalf: number;
  percent: number;
  criticalFailures: number;
  unanswered: number;
  naCount: number;
  triggers: string[];
  flags: string[];
  sectionScores: SectionScore[];
}
