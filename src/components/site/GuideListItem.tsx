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
 */
export function GuideListItem({ guide }: { guide: GuideDefinition }) {
  const photoUrl = guide.categorySlug
    ? CATEGORY_TILES.find((t) => t.slug === guide.categorySlug)?.photoUrl ?? null
    : null;

  return (
    <a className="dc-guide-list-item" href={`/guia/${guide.slug}`}>
      <div className="dc-guide-list-thumb">
        {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <span aria-hidden="true">📖</span>}
      </div>
      <div className="dc-guide-list-text">
        <h3>{guide.title}</h3>
        <p>{guide.description}</p>
      </div>
    </a>
  );
}
