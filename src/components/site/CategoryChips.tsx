import { SITE_CATEGORIES } from "../../lib/site/categories";

export function CategoryChips({ activeSlug }: { activeSlug?: string }) {
  return (
    <div className="dc-chip-row">
      {SITE_CATEGORIES.map((category) => (
        <a
          key={category.slug}
          href={`/categoria/${category.slug}`}
          className="dc-chip"
          style={
            activeSlug === category.slug
              ? { background: "var(--dc-black)", color: "#fff", borderColor: "var(--dc-black)" }
              : undefined
          }
        >
          <span>{category.emoji}</span>
          <span>{category.label}</span>
        </a>
      ))}
    </div>
  );
}
