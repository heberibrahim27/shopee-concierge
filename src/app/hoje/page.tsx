import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { ProductGrid } from "../../components/site/ProductGrid";
import { getCachedTodayPosts } from "../../lib/site/catalog";

export const metadata = {
  title: "Ofertas de hoje",
  description: "Todos os produtos postados hoje no Instagram do Desconto Chegando.",
  alternates: { canonical: "/hoje" },
};

// Sempre busca de novo — é o destino do link fixo da bio/QR code, tem que
// refletir o post mais recente rápido (cache curto vive em getCachedTodayPosts).
export const dynamic = "force-dynamic";

export default async function HojePage() {
  const products = await getCachedTodayPosts();

  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Ofertas de hoje</h1>
          <p>Tudo que a gente postou hoje no Instagram, num lugar só.</p>
        </section>
        <section className="dc-section">
          <ProductGrid
            products={products}
            emptyMessage="Ainda não postamos nada hoje — volta daqui a pouco."
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
