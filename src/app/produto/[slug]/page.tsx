import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { getCachedProduct } from "../../../lib/site/catalog";
import { formatPriceBRL, formatRating, formatSales } from "../../../lib/site/format";
import { getProductAffiliateHref, AFFILIATE_LINK_REL } from "../../../lib/site/affiliateLink";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = await getCachedProduct(params.slug);
  if (!product) return {};

  return {
    title: product.productName,
    description:
      product.highlightReason ??
      `${product.productName} na Shopee, escolhido pelo Desconto Chegando pelo custo-benefício.`,
    alternates: { canonical: `/produto/${product.slug}` },
    openGraph: {
      title: product.productName,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getCachedProduct(params.slug);
  if (!product) notFound();

  const price = formatPriceBRL(product.priceMin);
  const rating = formatRating(product.ratingStar);
  const sales = formatSales(product.sales);
  const affiliateHref = getProductAffiliateHref(product.offerLink);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.productName,
    image: product.imageUrl ?? undefined,
    aggregateRating:
      product.ratingStar && product.sales
        ? {
            "@type": "AggregateRating",
            ratingValue: product.ratingStar,
            reviewCount: product.sales,
          }
        : undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: product.priceMin ?? undefined,
      highPrice: product.priceMax ?? product.priceMin ?? undefined,
      url: affiliateHref ?? undefined,
    },
  };

  return (
    <>
      <Header />
      <main className="dc-shell">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="dc-product-hero">
          <div className="dc-product-image">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} /> : null}
          </div>
          <div className="dc-product-body">
            <span className="dc-choice-badge">🏆 NOSSA ESCOLHA</span>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>{product.productName}</h1>
            {rating || sales ? (
              <div className="dc-card-meta" style={{ marginBottom: 8 }}>
                {rating ? `⭐ ${rating}` : ""}
                {rating && sales ? " • " : ""}
                {sales ?? ""}
              </div>
            ) : null}
            {price ? <div className="dc-card-price" style={{ fontSize: 24 }}>{price}</div> : null}

            {product.highlightReason ? (
              <p style={{ fontSize: 13.5, color: "var(--dc-text-muted)", marginTop: 10 }}>
                {product.highlightReason}
              </p>
            ) : null}

            {affiliateHref ? (
              <a
                className="dc-cta-button"
                href={affiliateHref}
                target="_blank"
                rel={AFFILIATE_LINK_REL}
              >
                Ver na Shopee
              </a>
            ) : (
              <p className="dc-empty" style={{ marginTop: 16 }}>
                Link indisponível no momento.
              </p>
            )}
          </div>
        </div>

        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
