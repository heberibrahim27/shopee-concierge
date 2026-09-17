import { AdminSectionHeader } from "./RankingCard";

/**
 * Não existe nenhuma fonte real de pedido/comissão confirmada no projeto
 * ainda (ver diagnóstico 2026-09-16, item 9) — todo campo aqui é "—" até
 * existir integração de verdade. `cliquesHoje`/`cliques7d` são reais
 * (click_events), o resto é placeholder deliberado, nunca fabricado.
 */
export function RevenueSummaryCard({ cliquesHoje, cliques7d }: { cliquesHoje: number; cliques7d: number }) {
  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title="Receita e conversões" />
      <div className="dc-admin-grid-2">
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dc-text-muted)", marginBottom: 8 }}>Hoje</p>
          <RevenueRow label="Cliques enviados" value={cliquesHoje} />
          <RevenueRow label="Pedidos atribuídos" value="—" />
          <RevenueRow label="Comissão pendente" value="—" />
          <RevenueRow label="Comissão validada" value="—" />
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dc-text-muted)", marginBottom: 8 }}>
            Últimos 7 dias
          </p>
          <RevenueRow label="Cliques enviados" value={cliques7d} />
          <RevenueRow label="Pedidos" value="—" />
          <RevenueRow label="Receita gerada" value="—" />
          <RevenueRow label="Comissão" value="—" />
        </div>
      </div>
      <div className="dc-admin-info" style={{ marginTop: 12 }}>
        Dados do site ≠ vendas confirmadas. Estatísticas aqui são de visitas, cliques e checagem de links — vendas e
        comissões reais só a Shopee e o Mercado Livre sabem.
      </div>
    </div>
  );
}

function RevenueRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
      <span style={{ color: "var(--dc-text-muted)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
