import { describe, expect, it } from "vitest";
import { ruleSet, toScoredItems, sections } from "./catalog";
import { evaluate } from "./engine";
import { explain } from "./explain";
import type { Result } from "./types";

const allCompliant = (): Record<string, Result | undefined> =>
  Object.fromEntries(toScoredItems({}).map((i) => [i.key, "COMPLIANT" as Result]));

describe("explain", () => {
  it("is silent for a clean audit", () => {
    const rs = ruleSet("WPC_V2_PROPOSED");
    expect(explain(evaluate(toScoredItems(allCompliant()), rs), rs)).toEqual([]);
  });

  it("names the failing high-risk section and the cap", () => {
    const rs = ruleSet("WPC_V2_PROPOSED");
    const answers = allCompliant();
    const chem = sections.find((s) => s.code === "chemicals-chemical-storage")!;
    for (const i of chem.items.filter((x) => x.severity === "CRITICAL")) answers[i.key] = "PARTIALLY_COMPLIANT";
    const msgs = explain(evaluate(toScoredItems(answers), rs), rs);
    expect(msgs.some((m) => m.includes("Critical item is only Partially Compliant"))).toBe(true);
    expect(msgs.some((m) => m.includes("CHEMICALS & CHEMICAL STORAGE (57.14%)"))).toBe(true);
  });

  it("says nothing extra under the current rules", () => {
    const rs = ruleSet("WPC_V1");
    const answers = allCompliant();
    const chem = sections.find((s) => s.code === "chemicals-chemical-storage")!;
    for (const i of chem.items.filter((x) => x.severity === "CRITICAL")) answers[i.key] = "PARTIALLY_COMPLIANT";
    expect(explain(evaluate(toScoredItems(answers), rs), rs)).toEqual([]);
  });
});
