import template from "../../shared/template.json";
import rulesets from "../../shared/rulesets.json";
import type { Result, RuleSet, ScoredItem, Severity } from "./types";

export interface TemplateItem { key: string; text: string; severity: Severity; weight: number }
export interface TemplateSection { code: string; name: string; highRisk: boolean; items: TemplateItem[] }

export const sections = template.sections as TemplateSection[];
export const ruleSets = rulesets as RuleSet[];
export const activeRuleSetCode = "WPC_V1"; // switch to WPC_V2_PROPOSED once the IPC lead approves the new rules

export function ruleSet(code: string): RuleSet {
  const rs = ruleSets.find((r) => r.code === code);
  if (!rs) throw new Error(`Unknown rule set ${code}`);
  return rs;
}

/** Builds the scorable list from the auditor's answers (items with no answer are unanswered). */
export function toScoredItems(answers: Record<string, Result | undefined>): ScoredItem[] {
  return sections.flatMap((s) =>
    s.items.map((i) => ({ key: i.key, sectionCode: s.code, highRisk: s.highRisk, severity: i.severity,
      weight: i.weight, result: answers[i.key] ?? null })));
}
