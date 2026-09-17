import { AdminShell } from "../../../components/admin/AdminShell";
import { FunnelCard } from "../../../components/admin/FunnelCard";
import { RankingCard } from "../../../components/admin/RankingCard";
import { DailyTrendCard } from "../../../components/admin/DailyTrendCard";
import { getAnalyticsStats, getDailyTrend } from "../../../lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const [stats, dailyTrend] = await Promise.all([getAnalyticsStats(), getDailyTrend(14)]);

  return (
    <AdminShell title="Analytics">
      <p style={{ margin: "-8px 0 16px", fontSize: 12.5, color: "var(--dc-text-muted)" }}>
        Busca, cliques e intenção do usuário — últimos 7 dias.
      </p>

      <section className="dc-admin-section">
        <DailyTrendCard points={dailyTrend} />
      </section>

      <section className="dc-admin-section">
        <FunnelCard
          visitas={stats.funnel.visitas}
          buscas={stats.funnel.buscas}
          produtosVisualizados={stats.funnel.produtosVisualizados}
          cliquesEmOfertas={stats.funnel.cliquesEmOfertas}
          pedidosConfirmados={stats.funnel.pedidosConfirmados}
        />
      </section>

      <section className="dc-admin-section dc-admin-grid-2">
        <RankingCard
          title="Termos mais buscados"
          rows={stats.topSearched}
          emptyMessage="Nenhuma busca registrada ainda."
        />
        <RankingCard
          title="Buscas sem resultado"
          rows={stats.topZeroResult}
          emptyMessage="Nenhuma busca sem resultado registrada."
        />
      </section>

      <section className="dc-admin-section dc-admin-grid-2">
        <RankingCard
          title="Cliques por marketplace"
          rows={stats.clicksByMarketplace}
          emptyMessage="Nenhum clique registrado ainda."
        />
        <RankingCard
          title="Produtos mais clicados"
          rows={stats.topProducts.map((p) => [p.name, p.count] as [string, number])}
          emptyMessage="Nenhum clique registrado ainda."
        />
      </section>

      <section className="dc-admin-section">
        <RankingCard
          title="Páginas mais vistas"
          rows={stats.topPaths}
          emptyMessage="Nenhuma visita registrada ainda."
        />
      </section>
    </AdminShell>
  );
}
