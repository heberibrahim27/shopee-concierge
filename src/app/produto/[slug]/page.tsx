import { notFound } from "next/navigation";
import { Header } from "../../../components/site/Header";
import { Footer } from "../../../components/site/Footer";
import { getCachedProduct, getCachedGroupOffers } from "../../../lib/site/catalog";
import { formatPriceBRL, formatRating, formatSales } from "../../../lib/site/format";
import { getProductAffiliateHref, AFFILIATE_LINK_REL } from "../../../lib/site/affiliateLink";
import { AwardIcon, StarIcon } from "../../../components/site/icons";
import { getPlatformInfo } from "../../../lib/site/platforms";
import { TrackedOfferLink } from "../../../components/site/TrackedOfferLink";
import { ShareButton } from "../../../components/site/ShareButton";

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

  const rating = formatRating(product.ratingStar);
  const sales = formatSales(product.sales);
  const otherOffers = product.groupId
    ? await getCachedGroupOffers(product.groupId, product.slug)
    : [];

  // A oferta de destaque é sempre a de menor preço real entre as lojas
  // vinculadas (nunca fixa em "Shopee") — se só existir uma, é ela mesma.
  const allOffers = [product, ...otherOffers].filter((o) => o.priceMin !== null);
  const bestOffer =
    allOffers.length > 0
      ? allOffers.reduce((best, o) => (o.priceMin! < best.priceMin! ? o : best))
      : product;
  const price = formatPriceBRL(bestOffer.priceMin);
  const bestPlatform = getPlatformInfo(bestOffer.platform);
  const affiliateHref = getProductAffiliateHref(bestOffer.offerLink);
  const remainingOffers = [product, ...otherOffers].filter((o) => o.id !== bestOffer.id);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="dc-choice-badge">
                <AwardIcon size={14} />
                Nossa escolha
              </span>
              <ShareButton productName={product.productName} />
            </div>
            <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>{product.productName}</h1>
            {rating || sales ? (
              <div className="dc-card-meta dc-icon-inline" style={{ marginBottom: 8 }}>
                {rating ? (
                  <span className="dc-icon-inline">
                    <StarIcon size={12} style={{ color: "var(--dc-green-deep)" }} />
                    {rating}
                  </span>
                ) : null}
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
              <TrackedOfferLink
                className="dc-buy-button"
                href={affiliateHref}
                target="_blank"
                rel={AFFILIATE_LINK_REL}
                platform={bestOffer.platform}
                productSlug={bestOffer.slug}
                productName={bestOffer.productName}
                source="produto"
              >
                Ver oferta {bestPlatform.ctaPreposition}
              </TrackedOfferLink>
            ) : (
              <p className="dc-empty" style={{ marginTop: 16 }}>
                Link indisponível no momento.
              </p>
            )}

            {remainingOffers.length > 0 ? (
              <div className="dc-compare-box">
                <p className="dc-compare-title">Compare em outras lojas</p>
                <ul className="dc-compare-list">
                  {remainingOffers.map((offer) => {
                    const info = getPlatformInfo(offer.platform);
                    const offerPrice = formatPriceBRL(offer.priceMin);
                    const offerHref = getProductAffiliateHref(offer.offerLink);
                    if (!offerHref || !offerPrice) return null;
                    return (
                      <li key={offer.id} className="dc-compare-row">
                        <span
                          className="dc-compare-badge"
                          style={{ background: info.color, color: info.textColor }}
                        >
                          {info.label}
                        </span>
                        <span className="dc-compare-price">{offerPrice}</span>
                        <TrackedOfferLink
                          href={offerHref}
                          target="_blank"
                          rel={AFFILIATE_LINK_REL}
                          platform={offer.platform}
                          productSlug={offer.slug}
                          productName={offer.productName}
                          source="produto-comparar"
                        >
                          Ver oferta
                        </TrackedOfferLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
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
