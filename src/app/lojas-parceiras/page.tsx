import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";
import { Breadcrumb } from "../../components/site/Breadcrumb";
import { getCachedPlatformStats } from "../../lib/site/catalog";
import { getPlatformInfo } from "../../lib/site/platforms";

export function generateMetadata() {
  return {
    title: "Lojas parceiras",
    description: "Todas as lojas que o Desconto Chegando compara — a parceria nunca muda a ordem dos resultados.",
    alternates: { canonical: "/lojas-parceiras" },
    robots: { index: true, follow: true },
  };
}

export default async function PartnerStoresPage() {
  const stats = await getCachedPlatformStats();
  const totalProdutos = stats.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      <Header />
      <main className="dc-shell dc-guide">
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Lojas Parceiras" }]} />
        <h1>Lojas que comparamos</h1>
        <p className="dc-guide-intro">
          Estas são as lojas que o Desconto Chegando acompanha hoje, de verdade — nada de loja
          "fantasma" só pra parecer grande. A compra, entrega, troca e garantia são sempre direto
          com a loja de origem; a gente só ajuda a achar o menor preço.
        </p>

        <div className="dc-partner-stats">
          <div className="dc-partner-stat">
            <strong>{stats.length}</strong>
            <span>lojas monitoradas</span>
          </div>
          <div className="dc-partner-stat">
            <strong>{totalProdutos.toLocaleString("pt-BR")}</strong>
            <span>produtos comparados</span>
          </div>
          <div className="dc-partner-stat">
            <strong>R$ 0</strong>
            <span>de custo pra você comparar</span>
          </div>
        </div>

        <h2>A parceria não muda o placar</h2>
        <p>
          Em toda página de produto, a oferta que aparece em destaque é sempre a de menor preço
          real entre as lojas vinculadas — nunca uma ordem fixa nem uma loja "favorita". Quando
          você compra por um link nosso, podemos receber uma comissão de afiliado da loja; isso
          não custa nada a mais pra você e não muda qual oferta aparece primeiro.
        </p>

        <h2>Nossas lojas</h2>
        <div className="dc-partner-grid">
          {stats.map(({ platform, count }) => {
            const info = getPlatformInfo(platform);
            return (
              <a key={platform} className="dc-partner-card" href={`/loja/${platform}`}>
                <span
                  className="dc-partner-badge"
                  style={{ background: info.color, color: info.textColor }}
                >
                  {info.label}
                </span>
                <span className="dc-partner-count">{count.toLocaleString("pt-BR")} produtos</span>
              </a>
            );
          })}
        </div>

        <a className="dc-back-link" href="/">
          ← Voltar pra Home
        </a>
      </main>
      <Footer />
    </>
  );
}
