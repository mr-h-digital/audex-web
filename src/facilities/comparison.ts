import type { AuditSummary } from "../analytics/types";
import { BASELINE_TEMPLATE, facilityTemplates } from "./catalog";

export function comparisonKey(audit: AuditSummary): string {
  return JSON.stringify([audit.templateCode ?? BASELINE_TEMPLATE, audit.ruleSetCode, audit.scopeKey ?? "baseline"]);
}
export function comparisonGroups(audits: AuditSummary[]) {
  return [...new Map(audits.map((audit) => {
    const code = audit.templateCode ?? BASELINE_TEMPLATE;
    const name = facilityTemplates.find((template) => template.code === code)?.name ?? code;
    const label = `${name} / ${audit.ruleSetCode}${audit.scopeKey && audit.scopeKey !== "baseline" ? ` / areas: ${audit.scopeKey}` : ""}`;
    return [comparisonKey(audit), { key: comparisonKey(audit), label }] as const;
  })).values()];
}
