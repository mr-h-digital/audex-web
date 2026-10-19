import { useAccountStore } from "../sync/accountStore";
import type { AuditSummary } from "../analytics/types";
import type { PhotoMeta } from "../photos/photos";
import { ruleSet, toScoredItems } from "../scoring/catalog";
import { evaluate } from "../scoring/engine";
import type { Result, ScoreResult } from "../scoring/types";

export type Answers = Record<string, Result | undefined>;

/** An audit as kept on the device. `synced` flips to true once the server has confirmed it. */
export interface SavedAudit {
  id: string;
  siteId: string;
  siteName: string;
  date: string;
  ruleSetCode: string;
  answers: Answers;
  /** Why an item was marked N/A (required for every N/A). */
  naReasons?: Record<string, string>;
  /** Photo details; the image files are in IndexedDB (see photos/blobStore). */
  photos?: PhotoMeta[];
  unitManager: string;
  supervisor: string;
  /** Who did the audit (from the profile when it was started); printed on the report. */
  auditor?: string;
  auditorRole?: string;
  state: "draft" | "final";
  finalisedAt?: string;
  synced: boolean;
  /** Set when finalised, scored under the audit's own rule set so later rule changes never rewrite history. */
  summary?: AuditSummary;
  /** Authoritative frozen score returned by the server for a finalized audit. */
  score?: ScoreResult;
}

export const scoreOf = (a: Pick<SavedAudit, "answers" | "ruleSetCode" | "score">): ScoreResult =>
  a.score ?? evaluate(toScoredItems(a.answers), ruleSet(a.ruleSetCode));

export function summarise(a: SavedAudit): AuditSummary {
  const r = scoreOf(a);
  return {
    id: a.id, siteId: a.siteId, date: a.date, ruleSetCode: a.ruleSetCode, status: r.status,
    earnedHalf: r.earnedHalf, possibleHalf: r.possibleHalf, percent: r.percent,
    criticalFailures: r.criticalFailures, sectionScores: r.sectionScores,
    failedItems: toScoredItems(a.answers).filter((i) => i.result === "NON_COMPLIANT").map((i) => ({ key: i.key, severity: i.severity })),
  };
}

export function newAudit(id: string, site: { id: string; name: string; unitManager: string; supervisor: string }, date: string, ruleSetCode: string, by?: { name: string; role: string }): SavedAudit {
  return { auditor: by?.name, auditorRole: by?.role, id, siteId: site.id, siteName: site.name, date, ruleSetCode, answers: {}, unitManager: site.unitManager, supervisor: site.supervisor, state: "draft", synced: false };
}

/** Item keys answered N/A without a written reason. */
export const missingNaReasons = (a: Pick<SavedAudit, "answers" | "naReasons">): string[] =>
  Object.entries(a.answers).filter(([k, v]) => v === "NA" && !(a.naReasons?.[k] ?? "").trim()).map(([k]) => k);

/** Finalising needs every item answered and every N/A explained; it freezes the audit and queues it for sync. */
export function finalise(a: SavedAudit, nowIso: string): SavedAudit {
  if (a.state === "final") return a;
  if (scoreOf(a).status === "INCOMPLETE" || missingNaReasons(a).length > 0) return a;
  const done = { ...a, state: "final" as const, finalisedAt: nowIso, synced: false };
  return { ...done, summary: summarise(done) };
}

export const upsert = (list: SavedAudit[], a: SavedAudit): SavedAudit[] =>
  list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];

export function useAudits() {
  const { store, data } = useAccountStore();
  const audits = data.audits;
  const setAudits = (fn: (list: SavedAudit[]) => SavedAudit[]) => store.change((d) => ({ ...d, audits: fn(d.audits) }));
  const save = (a: SavedAudit) => setAudits((l) => upsert(l, a));
  const remove = (id: string) => setAudits((l) => l.filter((x) => x.id !== id || x.state === "final"));
  const markSynced = (ids: string[]) => setAudits((l) => l.map((x) => (ids.includes(x.id) ? { ...x, synced: true } : x)));
  return { audits, save, remove, markSynced, setAudits };
}
