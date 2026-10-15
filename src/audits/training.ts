import { useCallback, useEffect, useState } from "react";
import type { TrainingSession } from "../analytics/types";

export interface TrainingDraft { siteId: string; date: string; topic: string }

export const addTraining = (l: TrainingSession[], d: TrainingDraft, id: string): TrainingSession[] =>
  d.siteId && d.date && d.topic.trim() ? [...l, { id, siteId: d.siteId, date: d.date, topic: d.topic.trim() }] : l;

const KEY = "audex.training.v1";
function read(): TrainingSession[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function useTraining() {
  const [sessions, setSessions] = useState<TrainingSession[]>(read);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(sessions)); } catch { /* storage unavailable */ } }, [sessions]);
  const add = useCallback((d: TrainingDraft) => setSessions((l) => addTraining(l, d, crypto.randomUUID())), []);
  const remove = useCallback((id: string) => setSessions((l) => l.filter((s) => s.id !== id)), []);
  return { sessions, add, remove };
}
