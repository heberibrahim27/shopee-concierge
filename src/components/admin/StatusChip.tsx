import { LinkHealthKind, LINK_HEALTH_LABELS } from "../../lib/admin/linkHealth";

export function LinkHealthChip({ kind }: { kind: LinkHealthKind }) {
  return <span className={`dc-status-chip dc-status-chip-${kind}`}>{LINK_HEALTH_LABELS[kind]}</span>;
}

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "ok" | "blocked" | "dead" | "timeout" | "neutral" }) {
  return <span className={`dc-status-chip dc-status-chip-${tone}`}>{label}</span>;
}
