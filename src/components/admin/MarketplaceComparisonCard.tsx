import { AdminSectionHeader } from "./RankingCard";

export function MarketplaceComparisonCard({
  confirmados,
  maisBaratoShopee,
  maisBaratoOutro,
  diffMedio,
  seeAllHref,
}: {
  confirmados: number;
  maisBaratoShopee: number;
  maisBaratoOutro: number;
  diffMedio: number | null;
  seeAllHref: string;
}) {
  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title="Ponte Shopee ↔ Mercado Livre" seeAllHref={seeAllHref} seeAllLabel="Ver comparações" />
      <div className="dc-admin-link-health-grid">
        <div className="dc-admin-link-health-item">
          <strong>{confirmados}</strong>
          <span>Comparações confirmadas</span>
        </div>
        <div className="dc-admin-link-health-item">
          <strong>{maisBaratoShopee}</strong>
          <span>Shopee mais barata</span>
        </div>
        <div className="dc-admin-link-health-item">
          <strong>{maisBaratoOutro}</strong>
          <span>Outra loja mais barata</span>
        </div>
        <div className="dc-admin-link-health-item">
          <strong>{diffMedio !== null ? `${diffMedio.toFixed(1)}%` : "—"}</strong>
          <span>Diferença média</span>
        </div>
      </div>
    </div>
  );
}
