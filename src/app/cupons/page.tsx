import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { CouponCard } from "../../components/site/CouponCard";
import { getCachedCoupons } from "../../lib/site/coupons";
import { getCachedStoreDirectory } from "../../lib/site/stores";
import { getPlatformInfo, getAdvertiserLogo } from "../../lib/site/platforms";

export function generateMetadata() {
  const title = "Cupons de desconto verificados";
  const description =
    "Cupons e promoções ativas de Kabum, Olympikus, Nike e lojas parceiras, verificados todo dia pelo Desconto Chegando.";
  return {
    title,
    description,
    alternates: { canonical: "/cupons" },
    robots: { index: true, follow: true },
    // Mesmo achado do /cupom/[loja] (Heber, 2026-09-26): sem `openGraph`
    // próprio o Next herda o objeto inteiro da home no card compartilhado.
    openGraph: {
      title,
      description,
      url: "https://descontochegando.com.br/cupons",
      siteName: "Desconto Chegando",
      images: [{ url: "/BANNER-FINAL.png", width: 1983, height: 793 }],
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/BANNER-FINAL.png"],
    },
  };
}

export default async function CuponsPage() {
  const [coupons, directory] = await Promise.all([getCachedCoupons(), getCachedStoreDirectory()]);
  const storesWithCoupons = directory.filter((store) => store.couponCount > 0);

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Cupons e promoções</h1>
        </section>

        {storesWithCoupons.length > 0 ? (
          <section className="dc-section" style={{ paddingBlock: "0 4px" }}>
            <div className="dc-store-filter-scroll">
              {storesWithCoupons.map((store) => {
                const info = getPlatformInfo(store.slug);
                const logo = info.logoUrl
                  ? { logoUrl: info.logoUrl, logoBg: info.logoBg }
                  : getAdvertiserLogo(store.label);
                return (
                  <a key={store.slug} href={`/cupom/${store.slug}`} className="dc-store-filter-pill">
                    {logo ? (
                      <span
                        className="dc-store-filter-logo"
                        style={logo.logoBg ? { background: logo.logoBg } : undefined}
                      >
                        <img src={logo.logoUrl} alt="" loading="lazy" />
                      </span>
                    ) : null}
                    {store.label} ({store.couponCount})
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        {coupons.length > 0 ? (
          <section className="dc-section dc-coupon-grid">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </section>
        ) : (
          <section className="dc-section">
            <p className="dc-empty">
              Nenhum cupom ativo agora — manda uma foto no WhatsApp que a gente procura o melhor
              preço na hora.
            </p>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
