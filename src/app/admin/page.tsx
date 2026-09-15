import { getDb } from "../../lib/db/client";

export const dynamic = "force-dynamic";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function getStats() {
  const db = getDb();

  const [viewsTotal, views7d, views30d, clicksTotal, clicks7d, recentClicks, recentViews] =
    await Promise.all([
      db.from("page_views").select("*", { count: "exact", head: true }),
      db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
      db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(30)),
      db.from("click_events").select("*", { count: "exact", head: true }),
      db.from("click_events").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
      db
        .from("click_events")
        .select("platform, product_name, product_slug, source, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("page_views").select("path, created_at").order("created_at", { ascending: false }).limit(1000),
    ]);

  const clicksByPlatform = new Map<string, number>();
  const clicksByProduct = new Map<string, { name: string; count: number }>();
  for (const row of recentClicks.data ?? []) {
    clicksByPlatform.set(row.platform, (clicksByPlatform.get(row.platform) ?? 0) + 1);
    if (row.product_name) {
      const key = row.product_slug ?? row.product_name;
      const existing = clicksByProduct.get(key);
      clicksByProduct.set(key, { name: row.product_name, count: (existing?.count ?? 0) + 1 });
    }
  }
  const topProducts = [...clicksByProduct.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  const viewsByPath = new Map<string, number>();
  for (const row of recentViews.data ?? []) {
    viewsByPath.set(row.path, (viewsByPath.get(row.path) ?? 0) + 1);
  }
  const topPaths = [...viewsByPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return {
    viewsTotal: viewsTotal.count ?? 0,
    views7d: views7d.count ?? 0,
    views30d: views30d.count ?? 0,
    clicksTotal: clicksTotal.count ?? 0,
    clicks7d: clicks7d.count ?? 0,
    clicksByPlatform: [...clicksByPlatform.entries()].sort((a, b) => b[1] - a[1]),
    topProducts,
    topPaths,
  };
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: "16px 18px",
        minWidth: 140,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: "#777", fontWeight: 600 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800, color: "#0a8a4a" }}>{value}</p>
    </div>
  );
}

export default async function AdminPage() {
  const stats = await getStats();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Painel — Desconto Chegando</h1>
        <a href="/api/admin/logout" style={{ fontSize: 13, color: "#777" }}>
          Sair
        </a>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label="Visitas (total)" value={stats.viewsTotal} />
        <StatCard label="Visitas (7 dias)" value={stats.views7d} />
        <StatCard label="Visitas (30 dias)" value={stats.views30d} />
        <StatCard label="Cliques em ofertas (total)" value={stats.clicksTotal} />
        <StatCard label="Cliques (7 dias)" value={stats.clicks7d} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>Cliques por loja (últimos 500)</h2>
          {stats.clicksByPlatform.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Ainda sem cliques registrados.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {stats.clicksByPlatform.map(([platform, count]) => (
                <li
                  key={platform}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #eee",
                    fontSize: 13.5,
                  }}
                >
                  <span>{platform}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>Páginas mais vistas (últimas 1000)</h2>
          {stats.topPaths.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Ainda sem visitas registradas.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {stats.topPaths.map(([path, count]) => (
                <li
                  key={path}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #eee",
                    fontSize: 13,
                    gap: 8,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {path}
                  </span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Produtos mais clicados (últimos 500 cliques)</h2>
        {stats.topProducts.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Ainda sem cliques registrados.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {stats.topProducts.map((p) => (
              <li
                key={p.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <strong>{p.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p style={{ marginTop: 32, fontSize: 12, color: "#999" }}>
        Estatísticas próprias do site (visitas de página + cliques em "Ver oferta"). Não inclui
        vendas/comissão de verdade — isso só a Shopee e o Mercado Livre sabem, nos painéis deles.
      </p>
    </main>
  );
}
