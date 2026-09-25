import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { CategoryGrid } from "../../../components/site/CategoryGrid";
import { ProductGrid } from "../../../components/site/ProductGrid";
import { getCategoryBySlug, SITE_CATEGORIES } from "../../../lib/site/categories";
import { getCachedCategory, getCachedViablePriceThresholds } from "../../../lib/site/catalog";
import { Breadcrumb } from "../../../components/site/Breadcrumb";
import { CATEGORY_ICONS } from "../../../components/site/icons";
import { getGuidesForCategory } from "../../../lib/site/guides";
import { GuideListItem } from "../../../components/site/GuideListItem";

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

  const [products, priceThresholds] = await Promise.all([
    getCachedCategory(category.slug),
    getCachedViablePriceThresholds(category.slug),
  ]);
  const Icon = CATEGORY_ICONS[category.slug];
  const relatedGuides = getGuidesForCategory(category.slug);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb items={[{ label: "Início", href: "/" }, { label: category.label }]} />
          <h1 className="dc-icon-inline">
            {Icon ? <Icon size={24} /> : null}
            {category.label}
          </h1>
        </section>
        {priceThresholds.length > 0 ? (
          <section className="dc-section" style={{ paddingBlock: "0 4px" }}>
            <div className="dc-price-filter-row">
              {priceThresholds.map((preco) => (
                <a key={preco} href={`/categoria/${category.slug}/ate-${preco}`} className="dc-price-filter-pill">
                  Até R${preco}
                </a>
              ))}
            </div>
          </section>
        ) : null}
        <section className="dc-section">
          <CategoryGrid activeSlug={category.slug} />
        </section>
        <section className="dc-section">
          <ProductGrid
            products={products}
            emptyMessage="Ainda não temos produtos publicados nessa categoria. Manda uma foto no WhatsApp que a gente procura pra você."
          />
        </section>
        {relatedGuides.length > 0 ? (
          <section className="dc-section dc-guide-list">
            <h2>Guias de compra</h2>
            {relatedGuides.map((guide) => (
              <GuideListItem key={guide.slug} guide={guide} />
            ))}
          </section>
        ) : null}
        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
