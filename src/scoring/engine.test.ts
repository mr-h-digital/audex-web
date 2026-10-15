import { describe, expect, it } from "vitest";
import fixtures from "../../shared/scoring-fixtures.json";
import { ruleSet, toScoredItems } from "./catalog";
import { evaluate } from "./engine";
import type { Result } from "./types";

interface Fixture {
  name: string;
  ruleSet: string;
  default: Result;
  overrides: Record<string, Result | null>;
  expected: { status: string; earnedHalf: number; possibleHalf: number; criticalFailures: number;
    triggers: string[]; flags: string[] };
}

describe("shared scoring fixtures (same file the Java engine is tested against)", () => {
  for (const fx of fixtures as unknown as Fixture[]) {
    it(fx.name, () => {
      const answers: Record<string, Result | undefined> = {};
      for (const item of toScoredItems({})) answers[item.key] = fx.default;
      for (const [key, value] of Object.entries(fx.overrides)) {
        if (value === null) delete answers[key]; else answers[key] = value;
      }
      const actual = evaluate(toScoredItems(answers), ruleSet(fx.ruleSet));
      expect(actual.status).toBe(fx.expected.status);
      expect(actual.earnedHalf).toBe(fx.expected.earnedHalf);
      expect(actual.possibleHalf).toBe(fx.expected.possibleHalf);
      expect(actual.criticalFailures).toBe(fx.expected.criticalFailures);
      expect(actual.triggers).toEqual(fx.expected.triggers);
      expect(actual.flags).toEqual(fx.expected.flags);
    });
  }

  it("reports the percentages quoted in the WPC proposal", () => {
    const eight = (fixtures as unknown as Fixture[]).find((f) => f.name.startsWith("8 Major") && f.ruleSet === "WPC_V1")!;
    const answers: Record<string, Result | undefined> = {};
    for (const item of toScoredItems({})) answers[item.key] = eight.default;
    for (const [k, v] of Object.entries(eight.overrides)) answers[k] = v as Result;
    expect(evaluate(toScoredItems(answers), ruleSet("WPC_V1")).percent).toBe(95.03);
  });
});
