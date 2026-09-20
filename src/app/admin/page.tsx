import { AdminShell } from "../../components/admin/AdminShell";
import { KpiCard } from "../../components/admin/KpiCard";
import { AlertSummary } from "../../components/admin/AlertSummary";
import { RevenueSummaryCard } from "../../components/admin/RevenueSummaryCard";
import { MarketplaceComparisonCard } from "../../components/admin/MarketplaceComparisonCard";
import { VideoMachineRunButton } from "../../components/admin/VideoMachineRunButton";
import { EyeIcon, ClickIcon, ChartIcon, PackageIcon } from "../../components/admin/icons";
import { getAttentionSummary, getComparisonStats, getOverviewStats, getRevenueStats } from "../../lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const now = new Date().toISOString();
  const [overview, attention, comparison, revenue] = await Promise.all([
    getOverviewStats(),
    getAttentionSummary(),
    getComparisonStats(),
    getRevenueStats(),
  ]);

  return (
    <AdminShell updatedAt={now}>
      <section className="dc-admin-section">
        <div className="dc-admin-kpi-grid">
          <KpiCard icon={<EyeIcon size={16} />} label="Visitas (7 dias)" value={overview.views7d} changePct={overview.viewsChangePct} />
          <KpiCard icon={<ClickIcon size={16} />} label="Cliques em ofertas (7 dias)" value={overview.clicks7d} changePct={overview.clicksChangePct} />
          <KpiCard icon={<ChartIcon size={16} />} label="CTR (7 dias)" value={overview.ctr7d !== null ? `${overview.ctr7d.toFixed(1)}%` : "—"} changePct={overview.ctrChangePct} />
          <KpiCard icon={<PackageIcon size={16} />} label="Produtos ativos" value={overview.products} />
        </div>
      </section>

      <section className="dc-admin-section">
        <AlertSummary
          blocked={attention.blocked}
          dead={attention.dead}
          semPreco={attention.semPreco}
          semImagem={attention.semImagem}
          seeAllHref="/admin/produtos"
        />
      </section>

      <section className="dc-admin-section">
        <RevenueSummaryCard
          cliquesHoje={overview.clicksToday}
          cliques7d={overview.clicks7d}
          today={revenue.today}
          last7d={revenue.last7d}
          shopeeError={revenue.error}
        />
      </section>

      <section className="dc-admin-section">
        <MarketplaceComparisonCard
          confirmados={comparison.confirmados}
          maisBaratoShopee={comparison.maisBaratoShopee}
          maisBaratoOutro={comparison.maisBaratoOutro}
          diffMedio={comparison.diffMedio}
          seeAllHref="/admin/comparacoes"
        />
      </section>

      <section className="dc-admin-section">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Máquina de Vídeos</div>
        <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 10 }}>
          Roda o motor (descoberta → oferta → direção criativa → roteiro → prompt de vídeo) pra um produto e entrega foto real + roteiro + prompt prontos pra
          fazer o vídeo numa ferramenta externa (a geração automática ainda depende de contratar um provedor pago).
        </p>
        <VideoMachineRunButton />
      </section>
    </AdminShell>
  );
}
