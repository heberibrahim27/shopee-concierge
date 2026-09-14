import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { CategoryChips } from "../../../components/site/CategoryChips";
import { ProductGrid } from "../../../components/site/ProductGrid";
import { getCategoryBySlug, SITE_CATEGORIES } from "../../../lib/site/categories";
import { getCachedCategory } from "../../../lib/site/catalog";
import { CATEGORY_ICONS } from "../../../components/site/icons";

export function generateStaticParams() {
  return SITE_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const category = getCategoryBySlug(params.slug);
  if (!category) return {};
  return {
    title: category.label,
    description: `As melhores ofertas de ${category.label.toLowerCase()} na Shopee, escolhidas pelo Desconto Chegando.`,
    alternates: { canonical: `/categoria/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = getCategoryBySlug(params.slug);
  if (!category) notFound();

  const products = await getCachedCategory(category.slug);
  const Icon = CATEGORY_ICONS[category.slug];

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1 className="dc-icon-inline">
            {Icon ? <Icon size={24} /> : null}
            {category.label}
          </h1>
        </section>
        <section className="dc-section">
          <CategoryChips activeSlug={category.slug} />
        </section>
        <section className="dc-section">
          <ProductGrid
            products={products}
            emptyMessage="Ainda não temos produtos publicados nessa categoria. Manda uma foto no WhatsApp que a gente procura pra você."
          />
        </section>
        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
