import type { SectionScore, Severity, Status } from "../scoring/types";

export interface Site { id: string; name: string }

export interface FailedItem { key: string; severity: Severity }

/** What the dashboard needs from a finalised audit (stored per audit; derived from its responses). */
export interface AuditSummary {
  id: string;
  siteId: string;
  date: string; // YYYY-MM-DD
  ruleSetCode: string;
  templateCode?: string;
  facilityType?: string | null;
  scopeKey?: string;
  status: Status;
  earnedHalf: number;
  possibleHalf: number;
  percent: number;
  criticalFailures: number;
  sectionScores: SectionScore[];
  failedItems: FailedItem[];
}

export interface TrainingSession { id: string; siteId: string; date: string; topic: string; attendees?: number; notes?: string; revision?: number; archived?: boolean; updatedAt?: string; dirty?: boolean }

export type PresetId = "last30" | "last90" | "quarter" | "ytd" | "last12m" | "custom";

/** An inclusive date range. */
export interface Period { preset: PresetId; from: string; to: string; days: number; label: string }

export interface AnalyticsInput {
  audits: AuditSummary[];
  trainings: TrainingSession[];
  sites: Site[];
  period: Period;
  /** null or empty = all sites */
  siteIds: string[] | null;
}

export interface TrendPoint { date: string; label: string; avg: number; n: number }
export interface Trend { granularity: "audit" | "week" | "month"; points: TrendPoint[] }

export interface SiteRow {
  siteId: string; siteName: string; audits: number; avgPercent: number;
  latestPercent: number; latestStatus: Status; latestDate: string;
}
export interface SectionRow { code: string; name: string; highRisk: boolean; percent: number; audits: number }
export interface RecurringRow { key: string; text: string; severity: Severity; count: number; lastSeen: string }

export type Confidence = "none" | "low" | "ok";
export interface WindowAvg { n: number; avg: number | null }
export interface TrainingRow {
  id: string; siteId: string; siteName: string; date: string; topic: string;
  before: WindowAvg; after: WindowAvg; delta: number | null; confidence: Confidence;
}

export interface Kpis {
  audits: number;
  avgPercent: number | null;
  prevAvgPercent: number | null;
  deltaPoints: number | null;
  statusCounts: Record<Status, number>;
  auditsWithCriticalFailure: number;
  sitesNeedingAttention: number;
  sitesAudited: number;
}

export interface Analytics {
  period: Period;
  previous: Period;
  audits: AuditSummary[];
  kpis: Kpis;
  trend: Trend;
  sites: SiteRow[];
  sections: SectionRow[];
  recurring: RecurringRow[];
  training: TrainingRow[];
  trainingSummary: { sessions: number; avgDelta: number } | null;
}
