import { useAccountStore } from "../sync/accountStore";
import type { TrainingSession } from "../analytics/types";

export interface TrainingDraft { siteId: string; date: string; topic: string }

export const addTraining = (l: TrainingSession[], d: TrainingDraft, id: string): TrainingSession[] =>
  d.siteId && d.date && d.topic.trim() ? [...l, { id, siteId: d.siteId, date: d.date, topic: d.topic.trim(), revision: 0, archived: false, dirty: true }] : l;

export function useTraining() {
  const { store, data } = useAccountStore();
  const sessions = data.training.filter((s) => !s.archived);
  const add = (d: TrainingDraft) => store.change((l) => ({ ...l, training: addTraining(l.training, d, crypto.randomUUID()) }));
  const remove = (id: string) => store.change((l) => ({ ...l, training: l.training.map((s) => s.id === id ? { ...s, archived: true, dirty: true } : s) }));
  return { sessions, add, remove };
}
