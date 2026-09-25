import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { Breadcrumb } from "../../../components/site/Breadcrumb";
import { ProductGrid } from "../../../components/site/ProductGrid";
import { ProductCard } from "../../../components/site/ProductCard";
import { getCachedProduct, SiteProduct } from "../../../lib/site/catalog";
import { GUIDES, GuideBlock, getGuideBySlug } from "../../../lib/site/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const guide = getGuideBySlug(params.slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guia/${guide.slug}` },
    openGraph: { title: guide.title, description: guide.description },
    robots: { index: true, follow: true },
  };
}

async function resolveProducts(slugs: string[]): Promise<SiteProduct[]> {
  const resolved = await Promise.all(slugs.map((slug) => getCachedProduct(slug)));
  // Produto pode sair do catálogo (fora de estoque, removido) -- filtra
  // silenciosamente em vez de quebrar a página ou mostrar link morto.
  return resolved.filter((p): p is SiteProduct => p !== null);
}

async function CompareBlock({ aSlug, bSlug, note }: { aSlug: string; bSlug: string; note?: string }) {
  const [a, b] = await Promise.all([getCachedProduct(aSlug), getCachedProduct(bSlug)]);
  const products = [a, b].filter((p): p is SiteProduct => p !== null);
  if (products.length === 0) return null;
  return (
    <div className="dc-guide-compare">
      {note ? <p className="dc-guide-compare-note">{note}</p> : null}
      <div className="dc-grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

async function ProductsBlock({ slugs, note }: { slugs: string[]; note?: string }) {
  const products = await resolveProducts(slugs);
  if (products.length === 0) return null;
  return (
    <div className="dc-guide-products">
      {note ? <p className="dc-guide-compare-note">{note}</p> : null}
      <ProductGrid products={products} emptyMessage="" />
    </div>
  );
}

function renderBlock(block: GuideBlock, index: number) {
  switch (block.type) {
    case "p":
      return <p key={index}>{block.text}</p>;
    case "h2":
      return <h2 key={index}>{block.text}</h2>;
    case "products":
      return <ProductsBlock key={index} slugs={block.slugs} note={block.note} />;
    case "compare":
      return <CompareBlock key={index} aSlug={block.aSlug} bSlug={block.bSlug} note={block.note} />;
  }
}

export default async function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuideBySlug(params.slug);
  if (!guide) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    author: { "@type": "Organization", name: "Desconto Chegando" },
  };

  return (
    <>
      <Header />
      <main className="dc-shell dc-guide">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Guias", href: "/guia" }, { label: guide.title }]} />
        <h1>{guide.title}</h1>
        <p className="dc-guide-intro">{guide.intro}</p>
        {guide.blocks.map(renderBlock)}
        <a className="dc-back-link" href="/guia">
          ← Ver todos os guias
        </a>
      </main>
      <Footer />
    </>
  );
}
