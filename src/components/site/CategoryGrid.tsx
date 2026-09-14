import { CATEGORY_TILES } from "../../lib/site/categoryTiles";
import { CATEGORY_ICONS } from "./icons";

/**
 * Grade de categorias da Home: 2 linhas fixas, rolagem horizontal (visual
 * de carrossel) — mesmo padrão de apps de marketplace grandes. Usa as
 * artes prontas (ícone + rótulo já desenhados) geradas pelo ChatGPT;
 * quando ainda não existe arte nova pra categoria (caso da Infantil por
 * enquanto), cai num ladrilho equivalente montado com o ícone antigo.
 */
export function CategoryGrid() {
  return (
    <div className="dc-cat-grid-scroll">
      <div className="dc-cat-grid">
        {CATEGORY_TILES.map((tile) => {
          const href = tile.href ?? `/categoria/${tile.slug}`;
          const FallbackIcon = tile.image ? null : CATEGORY_ICONS[tile.slug];

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
              <a key={tile.slug} href={href} className="dc-cat-tile-link">
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
