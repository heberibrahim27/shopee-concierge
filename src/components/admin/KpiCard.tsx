import { ReactNode } from "react";

function formatChange(changePct: number | null, unit: "%" | "pp"): { label: string; up: boolean } | null {
  if (changePct === null || !Number.isFinite(changePct)) return null;
  const up = changePct >= 0;
  // "pp" = pontos percentuais: variação de uma taxa (ex.: CTR 6,1% → 6,3% é
  // +0,2 pp, não +2%). Pedido do revisor do admin (2026-09-26).
  const num = unit === "pp" ? changePct.toFixed(1) : changePct.toFixed(0);
  return { label: `${up ? "+" : ""}${num}${unit === "pp" ? " pp" : "%"}`, up };
}

export function KpiCard({
  icon,
  label,
  value,
  changePct,
  changeSuffix = "vs. período anterior",
  changeUnit = "%",
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  /** Omitido (undefined) quando não há dado histórico real pra comparar —
   * nunca inventa uma tendência. */
  changePct?: number | null;
  changeSuffix?: string;
  /** "%" = variação relativa; "pp" = pontos percentuais (pra taxas como CTR). */
  changeUnit?: "%" | "pp";
  /** Uma linha explicando o que o número mede (ex.: fórmula do CTR). */
  hint?: string;
}) {
  const change = changePct === undefined ? null : formatChange(changePct, changeUnit);
  return (
    <div className="dc-kpi-card">
      <div className="dc-kpi-card-top">
        <span className="dc-kpi-card-icon">{icon}</span>
        <span className="dc-kpi-card-label">{label}</span>
      </div>
      <span className="dc-kpi-card-value">{value}</span>
      {hint ? <span className="dc-kpi-card-hint">{hint}</span> : null}
      {change ? (
        <span className={`dc-kpi-card-change ${change.up ? "dc-kpi-card-change-up" : "dc-kpi-card-change-down"}`}>
          {change.label} {changeSuffix}
        </span>
      ) : null}
    </div>
  );
}
