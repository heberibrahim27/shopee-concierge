import { CATEGORY_TILES } from "../../lib/site/categoryTiles";
import { CATEGORY_ICONS } from "./icons";

/**
 * Grade de categorias: 2 linhas fixas, rolagem horizontal (visual de
 * carrossel) — mesmo padrão de apps de marketplace grandes. Usa as artes
 * prontas (ícone + rótulo já desenhados) geradas pelo ChatGPT; quando
 * ainda não existe arte nova pra categoria (caso da Infantil por
 * enquanto), cai num ladrilho equivalente montado com o ícone antigo.
 * Reaproveitada tanto na Home quanto na página de categoria (com
 * `activeSlug` pra destacar em qual categoria o usuário está).
 */
export function CategoryGrid({ activeSlug }: { activeSlug?: string } = {}) {
  return (
    <div className="dc-cat-grid-scroll">
      <div className="dc-cat-grid">
        {CATEGORY_TILES.map((tile) => {
          const href = tile.href ?? `/categoria/${tile.slug}`;
          const FallbackIcon = tile.image ? null : CATEGORY_ICONS[tile.slug];
          const active = tile.slug === activeSlug;

          const inner = tile.image ? (
            <img
              src={tile.image}
              alt={tile.label}
              className={`dc-cat-tile-img${tile.available ? "" : " dc-cat-tile-dim"}`}
            />
          ) : (
            <span className={`dc-cat-tile-fallback${tile.available ? "" : " dc-cat-tile-dim"}`}>
              {FallbackIcon ? <FallbackIcon size={26} /> : null}
              <span>{tile.label}</span>
            </span>
          );

          if (tile.available) {
            return (
              <a
                key={tile.slug}
                href={href}
                className={`dc-cat-tile-link${active ? " dc-cat-tile-active" : ""}`}
              >
                {inner}
              </a>
            );
          }

          return (
            <span key={tile.slug} className="dc-cat-tile-link" title={`${tile.label} — em breve`}>
              {inner}
              <span className="dc-cat-tile-soon-badge">em breve</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
