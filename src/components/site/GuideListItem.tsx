import type { GuideDefinition } from "../../lib/site/guides";

/**
 * Card de guia de compra — reaproveitado nas 4 listagens (home, /guia,
 * /categoria/[slug], /produto/[slug]). Heber: "guia de compras tá feio"
 * (2026-09-25) -- era só título+texto empilhado, sem nenhum apoio visual.
 * Usa `guide.thumbnailUrl` (foto real de um dos produtos que o guia cita,
 * ver lib/site/guides.ts) -- guia sem thumbnail cai no ícone genérico.
 * Antes usava a foto genérica da categoria (CATEGORY_TILES), mas os 4
 * guias de eletrônicos ficavam todos com a MESMA foto de carregador
 * (achado real, Heber: "mesma foto?" ao ver os cards lado a lado no
 * scroll da home) -- corrigido com foto específica por guia.
 *
 * `variant="card"` (só a home, 2026-09-25): Heber achou a lista vertical
 * "pesada" com os 6 guias -- destoava do resto da home, que é tudo
 * scroll horizontal (Ofertas de hoje, Mais vendidos, Achados). `/guia`
 * (listagem completa) e os guias relacionados de categoria/produto (1-3
 * itens só) continuam na lista vertical, onde faz mais sentido.
 */
export function GuideListItem({ guide, variant = "row" }: { guide: GuideDefinition; variant?: "row" | "card" }) {
  const thumb = guide.thumbnailUrl ? (
    <img src={guide.thumbnailUrl} alt="" loading="lazy" />
  ) : (
    <span aria-hidden="true">📖</span>
  );

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
