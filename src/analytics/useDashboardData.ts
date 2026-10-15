import { useMemo } from "react";
import { generateDemo } from "./demo";
import type { AuditSummary, Site, TrainingSession } from "./types";

export interface DashboardData { demo: boolean; sites: Site[]; audits: AuditSummary[]; trainings: TrainingSession[] }
export interface RealData { sites: Site[]; audits: AuditSummary[]; trainings: TrainingSession[] }

/** Real finalised audits when there are any; otherwise (or when asked) clearly labelled demo data. */
export function useDashboardData(today: string, real: RealData, forceDemo: boolean): DashboardData {
  const demo = useMemo(() => generateDemo(today), [today]);
  return useMemo(() => (forceDemo || real.audits.length === 0 ? { demo: true, ...demo } : { demo: false, ...real }), [forceDemo, real, demo]);
}
