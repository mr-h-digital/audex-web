import type { Status } from "../../scoring/types";

/** Status colours are always paired with an icon and a label, never colour alone. */
export const STATUS_META: Record<Exclude<Status, "INCOMPLETE">, { label: string; icon: string; color: string }> = {
  COMPLIANT: { label: "Compliant", icon: "✓", color: "var(--good)" },
  NOT_YET_COMPLIANT: { label: "Not yet compliant", icon: "▲", color: "var(--warn)" },
  NON_COMPLIANT: { label: "Non-compliant", icon: "✕", color: "var(--bad)" },
};

export function StatusTag({ status }: { status: Status }) {
  if (status === "INCOMPLETE") return <span className="tag">Incomplete</span>;
  const m = STATUS_META[status];
  return <span className="tag"><span className="tag__icon" style={{ background: m.color }} aria-hidden>{m.icon}</span>{m.label}</span>;
}
