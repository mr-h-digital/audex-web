import type { SavedAudit } from "./store";

export function itemComplete(audit: Pick<SavedAudit, "answers" | "naReasons">, key: string) {
  const answer = audit.answers[key];
  return answer !== undefined && (answer !== "NA" || !!audit.naReasons?.[key]?.trim());
}

export function sectionProgress(audit: Pick<SavedAudit, "answers" | "naReasons">, items: { key: string }[]) {
  const answered = items.filter(item => audit.answers[item.key] !== undefined).length;
  const complete = items.filter(item => itemComplete(audit, item.key)).length;
  return { answered, complete, reasonsNeeded: answered - complete, total: items.length, ready: complete === items.length };
}

export function auditSaveLabel(audit: Pick<SavedAudit, "state" | "synced">, connected: boolean) {
  return audit.state === "draft" ? "Draft on this device only"
    : audit.synced ? "Uploaded to your account"
    : connected ? "Saved on this device · Upload pending" : "Saved on this device";
}
