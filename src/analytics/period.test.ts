import { describe, expect, it } from "vitest";
import { previousPeriod, resolvePeriod } from "./period";

const TODAY = "2026-10-15";

describe("resolvePeriod", () => {
  it.each([
    ["last30", "2026-09-16", 30],
    ["last90", "2026-07-18", 90],
    ["quarter", "2026-10-01", 15],
    ["ytd", "2026-01-01", 288],
    ["last12m", "2025-10-16", 365],
  ] as const)("%s runs from %s to today (%i days)", (preset, from, days) => {
    const p = resolvePeriod(preset, TODAY);
    expect(p.from).toBe(from);
    expect(p.to).toBe(TODAY);
    expect(p.days).toBe(days);
  });

  it("takes a custom range as given", () => {
    const p = resolvePeriod("custom", TODAY, { from: "2026-01-05", to: "2026-03-10" });
    expect([p.from, p.to, p.days]).toEqual(["2026-01-05", "2026-03-10", 65]);
    expect(p.label).toBe("5 Jan to 10 Mar 2026");
  });

  it("swaps a reversed custom range instead of failing", () => {
    const p = resolvePeriod("custom", TODAY, { from: "2026-03-10", to: "2026-01-05" });
    expect([p.from, p.to]).toEqual(["2026-01-05", "2026-03-10"]);
  });

  it("allows a single-day custom range", () => {
    const p = resolvePeriod("custom", TODAY, { from: "2026-02-02", to: "2026-02-02" });
    expect(p.days).toBe(1);
  });

  it("labels a range that crosses a year with both years", () => {
    expect(resolvePeriod("last12m", TODAY).label).toBe("16 Oct 2025 to 15 Oct 2026");
  });
});

describe("previousPeriod", () => {
  it("is the same length, ending the day before", () => {
    const prev = previousPeriod(resolvePeriod("last30", TODAY));
    expect([prev.from, prev.to, prev.days]).toEqual(["2026-08-17", "2026-09-15", 30]);
  });
});
