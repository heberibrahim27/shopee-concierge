import { AdminShell } from "../../../components/admin/AdminShell";
import { MarketplaceComparisonCard } from "../../../components/admin/MarketplaceComparisonCard";
import { AdminSectionHeader } from "../../../components/admin/RankingCard";
import { EmptyState } from "../../../components/admin/EmptyState";
import { getComparisonStats } from "../../../lib/admin/stats";
import { getPlatformInfo } from "../../../lib/site/platforms";

export const dynamic = "force-dynamic";

export default async function AdminComparisonsPage() {
  const stats = await getComparisonStats();

  return (
    <AdminShell title="Comparações">
      <section className="dc-admin-section">
        <MarketplaceComparisonCard
          confirmados={stats.confirmados}
          maisBaratoShopee={stats.maisBaratoShopee}
          maisBaratoOutro={stats.maisBaratoOutro}
          diffMedio={stats.diffMedio}
          seeAllHref="#"
        />
      </section>

      <section className="dc-admin-section">
        <div className="dc-admin-card">
          <AdminSectionHeader
            title="Maiores diferenças de preço"
            subtitle={`${stats.pendentes} produtos com matching pendente (só um lado publicado)`}
          />
          {stats.rows.length === 0 ? (
            <EmptyState message="Nenhuma comparação confirmada ainda." />
          ) : (
            <div>
              {stats.rows.map((row) => (
                <div className="dc-admin-issue-row" key={row.groupId}>
                  <div className="dc-admin-issue-info">
                    <p className="dc-admin-issue-name">{row.productName}</p>
                    <div className="dc-admin-issue-chips">
                      <span className="dc-status-chip dc-status-chip-ok">
                        {getPlatformInfo(row.cheapestPlatform).label}: R$ {row.cheapestPrice.toFixed(2)}
                      </span>
                      <span className="dc-status-chip dc-status-chip-neutral">
                        {getPlatformInfo(row.otherPlatform).label}: R$ {row.otherPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <span className="dc-admin-ranking-value">-{row.diffPct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
