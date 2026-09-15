import { SITE_BANNERS } from "../../lib/site/banners";
import { AFFILIATE_LINK_REL } from "../../lib/site/affiliateLink";
import { TrackedOfferLink } from "./TrackedOfferLink";

/**
 * Carrossel do topo — rolagem horizontal com snap (mesmo padrão do
 * CategoryGrid), sem depender de JS pra girar sozinho. Primeiro slide é a
 * arte própria do site; os seguintes são banners oficiais de anunciantes
 * aprovados (ver src/lib/site/banners.ts) — só aparece quando existe
 * banner de verdade, nunca inventa arte de loja que não temos link.
 */
export function PromoBanner() {
  if (SITE_BANNERS.length === 1) {
    const [banner] = SITE_BANNERS;
    return (
      <a href={banner.href} className="dc-promo-single">
        <img src={banner.imageUrl} alt={banner.alt} />
      </a>
    );
  }

  return (
    <div className="dc-promo-scroll">
      {SITE_BANNERS.map((banner) =>
        banner.platform ? (
          <TrackedOfferLink
            key={banner.id}
            href={banner.href}
            platform={banner.platform}
            productName={banner.alt}
            source="banner-topo"
            className="dc-promo-slide"
            target="_blank"
            rel={AFFILIATE_LINK_REL}
          >
            <img src={banner.imageUrl} alt={banner.alt} />
          </TrackedOfferLink>
        ) : (
          <a key={banner.id} href={banner.href} className="dc-promo-slide">
            <img src={banner.imageUrl} alt={banner.alt} />
          </a>
        )
      )}
    </div>
  );
}
