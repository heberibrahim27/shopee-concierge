import { AdminSectionHeader } from "./RankingCard";

interface FunnelStep {
  label: string;
  value: number | null;
}

function ratePct(value: number | null, base: number | null): string | null {
  if (value === null || base === null || base <= 0) return null;
  return `${((value / base) * 100).toFixed(1)}%`;
}

export function FunnelCard({
  visitas,
  buscas,
  produtosVisualizados,
  cliquesEmOfertas,
  pedidosConfirmados,
}: {
  visitas: number;
  buscas: number;
  produtosVisualizados: number;
  cliquesEmOfertas: number;
  pedidosConfirmados: number | null;
}) {
  const steps: FunnelStep[] = [
    { label: "Visitas", value: visitas },
    { label: "Buscas", value: buscas },
    { label: "Produtos visualizados", value: produtosVisualizados },
    { label: "Cliques em ofertas", value: cliquesEmOfertas },
    { label: "Pedidos confirmados", value: pedidosConfirmados },
  ];

  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title="Funil de desempenho" subtitle="Da visita ao pedido confirmado" />
      <div className="dc-admin-funnel">
        {steps.map((step, i) => (
          <FunnelStepEl key={step.label} step={step} base={visitas} isFirst={i === 0} />
        ))}
      </div>
      {pedidosConfirmados === null ? (
        <p style={{ fontSize: 11.5, color: "var(--dc-text-muted)", marginTop: 10 }}>
          Pedidos confirmados ainda não tem fonte de dado real — mostra "—" até termos essa integração.
        </p>
      ) : null}
    </div>
  );
}

function FunnelStepEl({ step, base, isFirst }: { step: FunnelStep; base: number; isFirst: boolean }) {
  const rate = isFirst ? null : ratePct(step.value, base);
  return (
    <div className="dc-admin-funnel-step">
      <span>{step.label}</span>
      <strong>{step.value ?? "—"}</strong>
      {rate ? <span className="dc-admin-funnel-step-rate">{rate}</span> : null}
    </div>
  );
}
