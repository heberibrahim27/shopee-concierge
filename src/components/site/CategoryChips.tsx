import { SITE_CATEGORIES } from "../../lib/site/categories";
import { CATEGORY_ICONS } from "./icons";

export function CategoryChips({ activeSlug }: { activeSlug?: string }) {
  return (
    <div className="dc-chip-row">
      {SITE_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICONS[category.slug];
        return (
          <a
            key={category.slug}
            href={`/categoria/${category.slug}`}
            className={`dc-chip${activeSlug === category.slug ? " dc-chip-active" : ""}`}
          >
            {Icon ? <Icon size={16} /> : null}
            <span>{category.label}</span>
          </a>
        );
      })}
    </div>
  );
}
