import { CATEGORY_TILES } from "../../lib/site/categoryTiles";

/**
 * Grade de categorias de /categoria/[slug] -- mesmo ladrilho com foto real
 * (.dc-featured-cat-tile) da home/`/categorias`, numa linha única com
 * rolagem horizontal (18 itens, não quebra linha). Antes usava um ladrilho
 * de ícone+texto separado (dc-cat-tile-link) -- Heber apontou que ficava
 * inconsistente entrar numa categoria e ver o modelo antigo (2026-09-25).
 * Dados (foto recortada + subtítulo) vêm de CATEGORY_TILES, mesma fonte da
 * home e de `/categorias`, pra nunca divergir. `activeSlug` destaca em qual
 * categoria o usuário está.
 */
export function CategoryGrid({ activeSlug }: { activeSlug?: string } = {}) {
  return (
    <div className="dc-cat-grid-scroll">
      <div className="dc-featured-cat-grid">
        {CATEGORY_TILES.filter((tile) => tile.slug !== "outros").map((tile) => {
          const href = tile.href ?? `/categoria/${tile.slug}`;
          const active = tile.slug === activeSlug;

          const inner = (
            <>
              <div className="dc-featured-cat-photo">
                {tile.photoUrl ? (
                  <img
                    src={tile.photoUrl}
                    alt={tile.label}
                    loading="lazy"
                    className={tile.available ? "" : "dc-cat-tile-dim"}
                  />
                ) : null}
              </div>
              <div className="dc-featured-cat-text">
                <span className="dc-featured-cat-label">{tile.label}</span>
                <span className="dc-featured-cat-subtitle">{tile.subtitle}</span>
              </div>
            </>
          );

          if (tile.available) {
            return (
              <a
                key={tile.slug}
                href={href}
                className={`dc-featured-cat-tile${active ? " dc-featured-cat-tile-active" : ""}`}
              >
                {inner}
              </a>
            );
          }

          return (
            <span key={tile.slug} className="dc-featured-cat-tile" title={`${tile.label} — em breve`}>
              {inner}
              <span className="dc-cat-tile-soon-badge">em breve</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
