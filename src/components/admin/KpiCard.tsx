import { ReactNode } from "react";

function formatChange(changePct: number | null): { label: string; up: boolean } | null {
  if (changePct === null || !Number.isFinite(changePct)) return null;
  const up = changePct >= 0;
  return { label: `${up ? "+" : ""}${changePct.toFixed(0)}%`, up };
}

export function KpiCard({
  icon,
  label,
  value,
  changePct,
  changeSuffix = "vs. período anterior",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  /** Omitido (undefined) quando não há dado histórico real pra comparar —
   * nunca inventa uma tendência. */
  changePct?: number | null;
  changeSuffix?: string;
}) {
  const change = changePct === undefined ? null : formatChange(changePct);
  return (
    <div className="dc-kpi-card">
      <div className="dc-kpi-card-top">
        <span className="dc-kpi-card-icon">{icon}</span>
        <span className="dc-kpi-card-label">{label}</span>
      </div>
      <span className="dc-kpi-card-value">{value}</span>
      {change ? (
        <span className={`dc-kpi-card-change ${change.up ? "dc-kpi-card-change-up" : "dc-kpi-card-change-down"}`}>
          {change.label} {changeSuffix}
        </span>
      ) : null}
    </div>
  );
}
