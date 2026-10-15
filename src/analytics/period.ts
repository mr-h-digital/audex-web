import { addDays, diffDays, fmtDate, fmtShort, startOfQuarter, startOfYear } from "./dates";
import type { Period, PresetId } from "./types";

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "last30", label: "30 days" },
  { id: "last90", label: "90 days" },
  { id: "quarter", label: "This quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "last12m", label: "12 months" },
  { id: "custom", label: "Custom" },
];

export function describe(from: string, to: string): string {
  return from.slice(0, 4) === to.slice(0, 4) ? `${fmtShort(from)} to ${fmtDate(to)}` : `${fmtDate(from)} to ${fmtDate(to)}`;
}

function make(preset: PresetId, from: string, to: string): Period {
  return { preset, from, to, days: diffDays(to, from) + 1, label: describe(from, to) };
}

/** Resolves a preset (or a custom range) to inclusive dates. A reversed custom range is swapped, not rejected. */
export function resolvePeriod(preset: PresetId, today: string, custom?: { from: string; to: string }): Period {
  switch (preset) {
    case "last30": return make(preset, addDays(today, -29), today);
    case "last90": return make(preset, addDays(today, -89), today);
    case "quarter": return make(preset, startOfQuarter(today), today);
    case "ytd": return make(preset, startOfYear(today), today);
    case "last12m": return make(preset, addDays(today, -364), today);
    case "custom": {
      const a = custom?.from || addDays(today, -89);
      const b = custom?.to || today;
      return a <= b ? make(preset, a, b) : make(preset, b, a);
    }
  }
}

/** The equally long period immediately before `p`, used for "vs previous period". */
export function previousPeriod(p: Period): Period {
  return make(p.preset, addDays(p.from, -p.days), addDays(p.from, -1));
}
