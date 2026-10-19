import { useMemo } from "react";
import { generateDemo } from "./demo";
import type { AuditSummary, Site, TrainingSession } from "./types";

export interface DashboardData { demo: boolean; sites: Site[]; audits: AuditSummary[]; trainings: TrainingSession[] }
export interface RealData { sites: Site[]; audits: AuditSummary[]; trainings: TrainingSession[] }

/** Demo data is an explicit preview, never a substitute for an empty account. */
export function useDashboardData(today: string, real: RealData, forceDemo: boolean): DashboardData {
  const demo = useMemo(() => generateDemo(today), [today]);
  return useMemo(() => (forceDemo ? { demo: true, ...demo } : { demo: false, ...real }), [forceDemo, real, demo]);
}
