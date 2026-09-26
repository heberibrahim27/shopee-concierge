import type { GuideDefinition } from "../../lib/site/guides";
import { CATEGORY_TILES } from "../../lib/site/categoryTiles";

/**
 * Card de guia de compra — reaproveitado nas 4 listagens (home, /guia,
 * /categoria/[slug], /produto/[slug]). Heber: "guia de compras tá feio"
 * (2026-09-25) -- era só título+texto empilhado, sem nenhum apoio visual.
 * Usa a mesma foto real de categoria já recortada (CATEGORY_TILES,
 * lib/site/categoryTiles.ts) como miniatura, pra não precisar de arte
 * nova — guia sem `categorySlug` (ex: "como sabemos se o preço é bom",
 * não é sobre uma categoria) cai no ícone genérico.
 *
 * `variant="card"` (só a home, 2026-09-25): Heber achou a lista vertical
 * "pesada" com os 6 guias -- destoava do resto da home, que é tudo
 * scroll horizontal (Ofertas de hoje, Mais vendidos, Achados). `/guia`
 * (listagem completa) e os guias relacionados de categoria/produto (1-3
 * itens só) continuam na lista vertical, onde faz mais sentido.
 */
export function GuideListItem({ guide, variant = "row" }: { guide: GuideDefinition; variant?: "row" | "card" }) {
  const photoUrl = guide.categorySlug
    ? CATEGORY_TILES.find((t) => t.slug === guide.categorySlug)?.photoUrl ?? null
    : null;
  const thumb = photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <span aria-hidden="true">📖</span>;

  if (variant === "card") {
    return (
      <a className="dc-guide-card" href={`/guia/${guide.slug}`}>
        <div className="dc-guide-card-thumb">{thumb}</div>
        <h3>{guide.title}</h3>
        <p>{guide.description}</p>
      </a>
    );
  }

  return (
    <a className="dc-guide-list-item" href={`/guia/${guide.slug}`}>
      <div className="dc-guide-list-thumb">{thumb}</div>
      <div className="dc-guide-list-text">
        <h3>{guide.title}</h3>
        <p>{guide.description}</p>
      </div>
    </a>
  );
}
