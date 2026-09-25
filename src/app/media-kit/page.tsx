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

// Fase 0 do plano de receita (ver memória project_click_tracking_redirect):
// primeira leitura real de click_events, agrupado por canal (`source`) --
// antes disso a tabela só era escrita, nunca lida em lugar nenhum.
async function getClickStatsByChannel(): Promise<{ total: number; bySource: Array<{ source: string; n: number }> }> {
  const db = getDb();
  const { data } = await db
    .from("click_events")
    .select("source")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = (row as any).source || "desconhecido";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bySource = [...counts.entries()]
    .map(([source, n]) => ({ source, n }))
    .sort((a, b) => b.n - a.n);
  return { total: data?.length ?? 0, bySource };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export default async function MediaKitPage() {
  const [site, instagram, clicks] = await Promise.all([getSiteStats(), getInstagramStats(), getClickStatsByChannel()]);
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
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Cliques por canal (30 dias)</h2>
        <p style={{ color: "var(--dc-text-muted)", fontSize: 13, marginBottom: 12 }}>
          Fase 0 do plano de receita: cada clique de afiliado que passa pelo redirecionador{" "}
          <code>/go</code> é registrado por origem. Contagem bruta de eventos, ainda sem filtro de
          bot/preview/crawler — não representa compradores nem cliques únicos, só volume de eventos
          registrados. Ainda em rollout.
        </p>
        {clicks.total === 0 ? (
          <p style={{ color: "var(--dc-text-muted)", fontSize: 13 }}>Sem cliques registrados ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {clicks.bySource.map(({ source, n }) => (
              <div
                key={source}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  background: "var(--dc-card-bg)",
                  border: "1px solid var(--dc-border)",
                  borderRadius: "var(--dc-radius-sm)",
                  padding: "8px 14px",
                  fontSize: 14,
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{source}</span>
                <strong style={{ color: "var(--dc-brand)" }}>{fmt(n)}</strong>
              </div>
            ))}
          </div>
        )}
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
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--dc-brand)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--dc-text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
