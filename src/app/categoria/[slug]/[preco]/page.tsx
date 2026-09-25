import { notFound } from "next/navigation";
import { Header } from "../../../../components/site/Header";
import { Footer } from "../../../../components/site/Footer";
import { CategoryGrid } from "../../../../components/site/CategoryGrid";
import { ProductGrid } from "../../../../components/site/ProductGrid";
import { getCategoryBySlug } from "../../../../lib/site/categories";
import { Breadcrumb } from "../../../../components/site/Breadcrumb";
import {
  getCachedCategoryUnderPrice,
  getCachedViablePriceThresholds,
  listViablePriceCategoryPages,
} from "../../../../lib/site/catalog";

// Páginas de intenção de compra ("achados de casa até R$50") -- ver
// nota em catalog.ts. Só gera a página quando existe produto real o
// bastante (listViablePriceCategoryPages já filtra isso), evitando
// conteúdo raso que prejudica SEO em vez de ajudar.
// Segmento totalmente dinâmico ([preco], sem "ate-" na pasta -- Next.js
// não suporta misturar texto fixo com colchete no nome da pasta) --
// captura o segmento inteiro da URL ("ate-30"), que a gente mesmo
// interpreta abaixo. Confirmado com teste real: pasta "ate-[preco]"
// compila mas nunca casa rota nenhuma (404 sempre).
export async function generateStaticParams() {
  const viable = await listViablePriceCategoryPages();
  return viable.map(({ slug, preco }) => ({ slug, preco: `ate-${preco}` }));
}

function parsePreco(param: string): number | null {
  const match = /^ate-(\d+)$/.exec(param);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: { params: { slug: string; preco: string } }) {
  const category = getCategoryBySlug(params.slug);
  const preco = parsePreco(params.preco);
  if (!category || !preco) return {};
  return {
    title: `${category.label} até R$${preco}`,
    description: `Os melhores achados de ${category.label.toLowerCase()} até R$${preco} na Shopee, escolhidos pelo Desconto Chegando.`,
    alternates: { canonical: `/categoria/${category.slug}/ate-${preco}` },
  };
}

export default async function CategoryUnderPricePage({
  params,
}: {
  params: { slug: string; preco: string };
}) {
  const category = getCategoryBySlug(params.slug);
  const preco = parsePreco(params.preco);
  if (!category || !preco) notFound();

  const [products, priceThresholds] = await Promise.all([
    getCachedCategoryUnderPrice(category.slug, preco),
    getCachedViablePriceThresholds(category.slug),
  ]);
  if (products.length === 0) notFound();

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb
            items={[
              { label: "Início", href: "/" },
              { label: category.label, href: `/categoria/${category.slug}` },
              { label: `Até R$${preco}` },
            ]}
          />
          <h1>
            {category.label} até R${preco}
          </h1>
          <p style={{ color: "var(--dc-text-muted)", fontSize: 14, marginTop: -8, marginBottom: 12 }}>
            {products.length} achados reais de {category.label.toLowerCase()} por até R${preco}, ordenados pelo
            maior desconto.
          </p>
        </section>
        {priceThresholds.length > 0 ? (
          <section className="dc-section" style={{ paddingBlock: "0 4px" }}>
            <div className="dc-price-filter-row">
              {priceThresholds.map((t) => (
                <a
                  key={t}
                  href={`/categoria/${category.slug}/ate-${t}`}
                  className={`dc-price-filter-pill${t === preco ? " dc-price-filter-pill-active" : ""}`}
                >
                  Até R${t}
                </a>
              ))}
            </div>
          </section>
        ) : null}
        <section className="dc-section">
          <CategoryGrid activeSlug={category.slug} />
        </section>
        <section className="dc-section">
          <ProductGrid products={products} emptyMessage="" />
        </section>
        <a className="dc-back-link" href={`/categoria/${category.slug}`}>
          ← Ver tudo de {category.label}
        </a>
      </main>
      <Footer />
    </>
  );
}
