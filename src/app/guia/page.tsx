import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { Breadcrumb } from "../../components/site/Breadcrumb";
import { GUIDES } from "../../lib/site/guides";

export function generateMetadata() {
  return {
    title: "Guias de compra",
    description: "Guias reais pra ajudar a escolher, com comparação de preço e dado do nosso catálogo.",
    alternates: { canonical: "/guia" },
    robots: { index: true, follow: true },
  };
}

export default function GuidesIndexPage() {
  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Guias" }]} />
          <h1>Guias de compra</h1>
        </section>
        <section className="dc-section dc-guide-list">
          {GUIDES.map((guide) => (
            <a key={guide.slug} className="dc-guide-list-item" href={`/guia/${guide.slug}`}>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
            </a>
          ))}
        </section>
        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
