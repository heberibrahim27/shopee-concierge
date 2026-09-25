import { getDb } from "../../lib/db/client";

export const metadata = {
  title: "Mídia Kit — dados reais para anunciantes",
  robots: { index: false, follow: false },
};

const WINDSOR_ENDPOINT = "https://connectors.windsor.ai/instagram";
// O parâmetro `account_id` da Windsor NÃO filtra (confirmado 2026-09-25,
// devolve as 3 contas sempre) -- e o `account_id` que aparece nesses dados
// nem bate com o ID usado pra postar (execute_action). `username` é o
// único campo confiável pra identificar a conta certa aqui.
const IG_USERNAME = "descontoschegando";

async function getInstagramStats() {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `${WINDSOR_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}&fields=followers_count,media_count,username`;
    const resp = await fetch(url, { next: { revalidate: 3600 } });
    const json = await resp.json();
    const row = (json?.data ?? []).find((r: any) => r.username === IG_USERNAME);
    if (!row) return null;
    return { followers: Number(row.followers_count), posts: Number(row.media_count) };
  } catch {
    return null;
  }
}

async function getSiteStats() {
  const db = getDb();
  const [{ count: views30 }, { count: views7 }, { count: produtos }, { count: ofertas }] = await Promise.all([
    db.from("page_views").select("*", { count: "exact", head: true }).gte(
      "created_at",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    ),
    db.from("page_views").select("*", { count: "exact", head: true }).gte(
      "created_at",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    ),
    db.from("products").select("*", { count: "exact", head: true }),
    db.from("deal_candidates").select("*", { count: "exact", head: true }),
  ]);
  return {
    views30: views30 ?? 0,
    views7: views7 ?? 0,
    produtos: produtos ?? 0,
    ofertas: ofertas ?? 0,
  };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default async function MediaKitPage() {
  const [site, instagram] = await Promise.all([getSiteStats(), getInstagramStats()]);
  const updatedAt = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Desconto Chegando — Mídia Kit</h1>
      <p style={{ color: "var(--dc-text-muted)", marginBottom: 28 }}>
        Números reais, atualizados automaticamente. Última atualização: {updatedAt}.
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 14,
          marginBottom: 32,
        }}
      >
        <StatCard label="Visitas no site (30 dias)" value={fmt(site.views30)} />
        <StatCard label="Visitas no site (7 dias)" value={fmt(site.views7)} />
        <StatCard label="Seguidores no Instagram" value={instagram ? fmt(instagram.followers) : "—"} />
        <StatCard label="Posts publicados" value={instagram ? fmt(instagram.posts) : "—"} />
        <StatCard label="Produtos no catálogo" value={fmt(site.produtos)} />
        <StatCard label="Ofertas ativas" value={fmt(site.ofertas)} />
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Sobre o Desconto Chegando</h2>
        <p style={{ color: "var(--dc-text)", lineHeight: 1.6 }}>
          Comparador de preços e curadoria de ofertas reais da Shopee e outros marketplaces, com
          publicação diária de achados verificados no site, Instagram e WhatsApp.
        </p>
      </section>

      <section
        style={{
          background: "var(--dc-bg)",
          border: "1px solid var(--dc-border)",
          borderRadius: "var(--dc-radius)",
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Quer anunciar ou conversar sobre parceria?</h2>
        <p style={{ color: "var(--dc-text-muted)", fontSize: 14 }}>
          Fale direto pelo WhatsApp — respondemos rápido.
        </p>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--dc-card-bg)",
        border: "1px solid var(--dc-border)",
        borderRadius: "var(--dc-radius-sm)",
        padding: "16px 14px",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--dc-green-deep)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--dc-text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
