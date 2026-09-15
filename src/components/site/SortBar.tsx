import { SORT_OPTIONS, SortOption } from "../../lib/site/sort";

/**
 * Links simples (sem JS no cliente) — cada opção recarrega `/busca` com
 * `?sort=` no lugar certo. Afeta os dois lados do resultado (catálogo
 * curado e busca ao vivo na Shopee) ao mesmo tempo.
 */
export function SortBar({ term, active }: { term: string; active: SortOption }) {
  return (
    <div className="dc-sort-bar">
      {SORT_OPTIONS.map((option) => {
        const params = new URLSearchParams({ q: term });
        if (option.value !== "relevancia") params.set("sort", option.value);
        return (
          <a
            key={option.value}
            href={`/busca?${params.toString()}`}
            className={`dc-sort-pill${active === option.value ? " dc-sort-pill-active" : ""}`}
          >
            {option.label}
          </a>
        );
      })}
    </div>
  );
}
