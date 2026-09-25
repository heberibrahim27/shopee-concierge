import { AdminShell } from "../../components/admin/AdminShell";
import { KpiCard } from "../../components/admin/KpiCard";
import { AlertSummary } from "../../components/admin/AlertSummary";
import { RevenueSummaryCard } from "../../components/admin/RevenueSummaryCard";
import { MarketplaceComparisonCard } from "../../components/admin/MarketplaceComparisonCard";
import { VideoMachineRunButton } from "../../components/admin/VideoMachineRunButton";
import { ChangePasswordForm } from "../../components/admin/ChangePasswordForm";
import { MercadoLivrePendingPanel } from "../../components/admin/MercadoLivrePendingPanel";
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
          {/* Rótulos revisados 2026-09-26: page_views conta VISUALIZAÇÕES de
              página (não sessões nem pessoas), já sem o admin logado;
              CTR = cliques pra lojas ÷ visualizações; variação do CTR é em
              pontos percentuais. */}
          <KpiCard
            icon={<EyeIcon size={16} />}
            label="Visualizações (7 dias)"
            value={overview.views7d}
            changePct={overview.viewsChangePct}
            hint="páginas vistas, sem o admin"
          />
          <KpiCard
            icon={<ClickIcon size={16} />}
            label="Cliques p/ lojas (7 dias)"
            value={overview.clicks7d}
            changePct={overview.clicksChangePct}
            hint="saídas pra Shopee, Kabum etc."
          />
          <KpiCard
            icon={<ChartIcon size={16} />}
            label="Cliques ÷ visualizações"
            value={overview.ctr7d !== null ? `${overview.ctr7d.toFixed(1)}%` : "—"}
            changePct={overview.ctrChangePct}
            changeUnit="pp"
            hint="7 dias; 1 clique a cada N páginas"
          />
          <KpiCard icon={<PackageIcon size={16} />} label="Produtos publicados" value={overview.products} hint="catálogo inteiro; ver Produtos" />
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
          awinToday={revenue.awinToday}
          awinLast7d={revenue.awinLast7d}
          awinError={revenue.awinError}
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

      <section className="dc-admin-section">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Mercado Livre — pendências da varredura semanal</div>
        <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 10 }}>
          O cron acha produto novo sozinho toda semana — só falta gerar o link de afiliado (a Mercado Livre não tem API pra isso), leva uns 2 minutos.
        </p>
        <MercadoLivrePendingPanel />
      </section>

      <section className="dc-admin-section">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Configurações</div>
        <p style={{ fontSize: 12, color: "#666", marginTop: 0, marginBottom: 10 }}>Trocar a senha de acesso ao painel.</p>
        <ChangePasswordForm />
      </section>
    </AdminShell>
  );
}
