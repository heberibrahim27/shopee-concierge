import { AdminShell } from "../../../components/admin/AdminShell";
import { KpiCard } from "../../../components/admin/KpiCard";
import { LinkHealthCard } from "../../../components/admin/LinkHealthCard";
import { AdminSectionHeader } from "../../../components/admin/RankingCard";
import { EmptyState } from "../../../components/admin/EmptyState";
import { AlertTriangleIcon, ImageIcon, LinkOffIcon, PackageIcon } from "../../../components/admin/icons";
import { getProductHealthStats } from "../../../lib/admin/stats";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const stats = await getProductHealthStats();

  return (
    <AdminShell title="Produtos & links" updatedAt={stats.linkHealth.lastCheckedAt}>
      <section className="dc-admin-section">
        <div className="dc-admin-kpi-grid">
          <KpiCard icon={<PackageIcon size={16} />} label="Publicados" value={stats.kpis.publicados} />
          <KpiCard icon={<AlertTriangleIcon size={16} />} label="Verificações bloqueadas" value={stats.kpis.bloqueadas} />
          <KpiCard icon={<LinkOffIcon size={16} />} label="Links mortos" value={stats.kpis.mortos} />
          <KpiCard icon={<ImageIcon size={16} />} label="Sem preço" value={stats.kpis.semPreco} />
        </div>
      </section>

      <section className="dc-admin-section">
        <LinkHealthCard
          ok={stats.linkHealth.ok}
          blocked={stats.linkHealth.blocked}
          dead={stats.linkHealth.dead}
          timeout={stats.linkHealth.timeout}
          total={stats.linkHealth.total}
          lastCheckedAt={stats.linkHealth.lastCheckedAt}
          needsAttention={stats.needsAttention}
          showAll
        />
      </section>

      <section className="dc-admin-section">
        <div className="dc-admin-card">
          <AdminSectionHeader title="Qualidade do catálogo" subtitle="Itens que podem afetar a performance" />
          {stats.quality.semImagem + stats.quality.semCategoria + stats.quality.semLink + stats.quality.desatualizados ===
          0 ? (
            <EmptyState message="Nenhum problema de qualidade encontrado." />
          ) : (
            <div className="dc-admin-link-health-grid">
              <div className="dc-admin-link-health-item">
                <strong>{stats.quality.semImagem}</strong>
                <span>Sem imagem</span>
              </div>
              <div className="dc-admin-link-health-item">
                <strong>{stats.quality.semCategoria}</strong>
                <span>Sem categoria</span>
              </div>
              <div className="dc-admin-link-health-item">
                <strong>{stats.quality.semLink}</strong>
                <span>Sem link de oferta</span>
              </div>
              <div className="dc-admin-link-health-item">
                <strong>{stats.quality.desatualizados}</strong>
                <span>Preço com +7 dias</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
