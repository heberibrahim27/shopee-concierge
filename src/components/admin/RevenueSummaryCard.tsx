import { AdminSectionHeader } from "./RankingCard";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface RevenuePeriod {
  pedidos: number;
  comissaoPendente: number;
  comissaoValidada: number;
  receitaTotal?: number;
}

/**
 * "Cliques enviados" continua vindo do nosso click_events (só cliques que
 * passam pelo nosso site — ver conversa 2026-09-17: o CTA do Instagram vai
 * direto pra Shopee, então esse número é sempre menor que o real). Pedidos
 * e comissão vêm de verdade da API de conversão da Shopee agora.
 */
export function RevenueSummaryCard({
  cliquesHoje,
  cliques7d,
  today,
  last7d,
  shopeeError,
}: {
  cliquesHoje: number;
  cliques7d: number;
  today: RevenuePeriod | null;
  last7d: RevenuePeriod | null;
  shopeeError: boolean;
}) {
  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title="Receita e conversões" />
      <div className="dc-admin-grid-2">
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dc-text-muted)", marginBottom: 8 }}>Hoje</p>
          <RevenueRow label="Cliques enviados (nosso site)" value={cliquesHoje} />
          <RevenueRow label="Pedidos atribuídos" value={today ? today.pedidos : "—"} />
          <RevenueRow label="Comissão pendente" value={today ? formatBRL(today.comissaoPendente) : "—"} />
          <RevenueRow label="Comissão validada" value={today ? formatBRL(today.comissaoValidada) : "—"} />
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dc-text-muted)", marginBottom: 8 }}>
            Últimos 7 dias
          </p>
          <RevenueRow label="Cliques enviados (nosso site)" value={cliques7d} />
          <RevenueRow label="Pedidos" value={last7d ? last7d.pedidos : "—"} />
          <RevenueRow
            label="Receita gerada (comissão)"
            value={last7d?.receitaTotal !== undefined ? formatBRL(last7d.receitaTotal) : "—"}
          />
          <RevenueRow label="Comissão validada" value={last7d ? formatBRL(last7d.comissaoValidada) : "—"} />
        </div>
      </div>
      <div className="dc-admin-info" style={{ marginTop: 12 }}>
        {shopeeError
          ? "Não consegui buscar os dados de venda da Shopee agora (falha temporária de rede/API) — mostrando só o que temos do nosso site."
          : "Pedidos e comissão vêm direto da API de afiliado da Shopee (conversionReport). \"Cliques enviados\" só conta quem passou pelo nosso site — o CTA do Instagram vai direto pra Shopee e não aparece aqui."}
      </div>
    </div>
  );
}

function RevenueRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", gap: 8 }}>
      <span style={{ color: "var(--dc-text-muted)" }}>{label}</span>
      <strong style={{ flexShrink: 0 }}>{value}</strong>
    </div>
  );
}
