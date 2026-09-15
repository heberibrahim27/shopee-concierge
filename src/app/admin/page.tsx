import { getDbFresh } from "../../lib/db/client";
import { RevalidateLinksButton } from "../../components/admin/RevalidateLinksButton";

export const dynamic = "force-dynamic";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

interface CatalogRow {
  slug: string;
  product_name: string;
  category_slug: string | null;
  image_url: string | null;
  price_min: number | null;
  offer_link: string | null;
  group_id: string | null;
  platform: string;
  snapshot_captured_at: string;
}

interface LinkCheckRow {
  product_slug: string;
  product_name: string | null;
  url: string | null;
  ok: boolean;
  status_code: number | null;
  checked_at: string;
}

function normTerm(term: string): string {
  return term.trim().toLowerCase();
}

async function getStats() {
  const db = getDbFresh();

  const [
    viewsTotal,
    views7d,
    views30d,
    clicksTotal,
    clicks24h,
    clicks7d,
    recentClicks,
    recentViews,
    catalog,
    productGroups,
    linkChecksRecent,
    searchEventsRecent,
  ] = await Promise.all([
    db.from("page_views").select("*", { count: "exact", head: true }),
    db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
    db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(30)),
    db.from("click_events").select("*", { count: "exact", head: true }),
    db.from("click_events").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(1)),
    db.from("click_events").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
    db
      .from("click_events")
      .select("platform, product_name, product_slug, source, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("page_views").select("path, created_at").order("created_at", { ascending: false }).limit(1000),
    db
      .from("site_catalog")
      .select("slug, product_name, category_slug, image_url, price_min, offer_link, group_id, platform, snapshot_captured_at")
      .limit(2000),
    db.from("product_groups").select("id"),
    db.from("link_checks").select("product_slug, product_name, url, ok, status_code, checked_at").order("checked_at", { ascending: false }).limit(300),
    db.from("search_events").select("term, results_count, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);

  const catalogRows = (catalog.data ?? []) as CatalogRow[];

  // --- Cliques por loja / produtos mais clicados / páginas mais vistas ---
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

  // --- Produtos ---
  const staleCutoff = daysAgoIso(7);
  const produtos = {
    total: catalogRows.length,
    semPreco: catalogRows.filter((r) => r.price_min === null).length,
    semImagem: catalogRows.filter((r) => !r.image_url).length,
    semLink: catalogRows.filter((r) => !r.offer_link).length,
    semCategoria: catalogRows.filter((r) => !r.category_slug).length,
    desatualizados: catalogRows.filter((r) => r.snapshot_captured_at < staleCutoff).length,
  };

  // --- Links (saúde) ---
  const latestCheckBySlug = new Map<string, LinkCheckRow>();
  for (const row of (linkChecksRecent.data ?? []) as LinkCheckRow[]) {
    if (!latestCheckBySlug.has(row.product_slug)) latestCheckBySlug.set(row.product_slug, row);
  }
  const allChecks = [...latestCheckBySlug.values()];
  const brokenLinks = allChecks.filter((c) => !c.ok);
  const lastCheckedAt = allChecks.length > 0
    ? allChecks.reduce((max, c) => (c.checked_at > max ? c.checked_at : max), allChecks[0].checked_at)
    : null;

  // --- Matching Shopee x Mercado Livre ---
  const byGroup = new Map<string, CatalogRow[]>();
  for (const row of catalogRows) {
    if (!row.group_id) continue;
    const list = byGroup.get(row.group_id) ?? [];
    list.push(row);
    byGroup.set(row.group_id, list);
  }
  const allGroupIds = (productGroups.data ?? []).map((g: { id: string }) => g.id);
  let confirmados = 0;
  let pendentes = 0;
  let maisBaratoShopee = 0;
  let maisBaratoML = 0;
  const diffPercents: number[] = [];
  for (const groupId of allGroupIds) {
    const rows = byGroup.get(groupId) ?? [];
    const platforms = new Set(rows.map((r) => r.platform));
    if (platforms.size >= 2) {
      confirmados += 1;
      const withPrice = rows.filter((r) => r.price_min !== null);
      if (withPrice.length >= 2) {
        const sorted = [...withPrice].sort((a, b) => (a.price_min ?? 0) - (b.price_min ?? 0));
        const cheapest = sorted[0];
        const secondCheapest = sorted[1];
        if (cheapest.platform === "shopee") maisBaratoShopee += 1;
        else maisBaratoML += 1;
        if (cheapest.price_min && secondCheapest.price_min) {
          diffPercents.push(((secondCheapest.price_min - cheapest.price_min) / secondCheapest.price_min) * 100);
        }
      }
    } else if (rows.length === 1) {
      pendentes += 1;
    }
  }
  const diffMedio = diffPercents.length > 0 ? diffPercents.reduce((a, b) => a + b, 0) / diffPercents.length : null;

  // --- Buscas ---
  const searchEvents = (searchEventsRecent.data ?? []) as { term: string; results_count: number }[];
  const zeroByTerm = new Map<string, number>();
  const totalByTerm = new Map<string, number>();
  for (const ev of searchEvents) {
    const key = normTerm(ev.term);
    if (!key) continue;
    totalByTerm.set(key, (totalByTerm.get(key) ?? 0) + 1);
    if (ev.results_count === 0) zeroByTerm.set(key, (zeroByTerm.get(key) ?? 0) + 1);
  }
  const topZeroResult = [...zeroByTerm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topSearched = [...totalByTerm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // --- Alertas (só o que dá pra medir de verdade) ---
  const alerts: { label: string; count: number }[] = [
    { label: "produtos publicados sem preço", count: produtos.semPreco },
    { label: "produtos publicados sem imagem", count: produtos.semImagem },
    { label: "produtos publicados sem link de oferta", count: produtos.semLink },
    { label: "links com problema na última checagem", count: brokenLinks.length },
    { label: "comparações Shopee x Mercado Livre com matching pendente", count: pendentes },
    { label: "produtos com preço não atualizado há mais de 7 dias", count: produtos.desatualizados },
  ].filter((a) => a.count > 0);

  return {
    viewsTotal: viewsTotal.count ?? 0,
    views7d: views7d.count ?? 0,
    views30d: views30d.count ?? 0,
    clicksTotal: clicksTotal.count ?? 0,
    clicks24h: clicks24h.count ?? 0,
    clicks7d: clicks7d.count ?? 0,
    ctr7d: (views7d.count ?? 0) > 0 ? ((clicks7d.count ?? 0) / (views7d.count ?? 1)) * 100 : null,
    clicksByPlatform: [...clicksByPlatform.entries()].sort((a, b) => b[1] - a[1]),
    topProducts,
    topPaths,
    produtos,
    links: {
      totalChecados: allChecks.length,
      okCount: allChecks.length - brokenLinks.length,
      brokenCount: brokenLinks.length,
      broken: brokenLinks.slice(0, 15),
      lastCheckedAt,
    },
    matching: {
      totalGrupos: allGroupIds.length,
      confirmados,
      pendentes,
      maisBaratoShopee,
      maisBaratoML,
      diffMedio,
    },
    busca: { topZeroResult, topSearched },
    alerts,
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 15, marginBottom: 10 }}>{children}</h2>;
}

function KeyValueList({ rows }: { rows: [string, number | string][] }) {
  if (rows.length === 0) return <p style={{ color: "#999", fontSize: 13 }}>Sem dados ainda.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map(([label, value]) => (
        <li
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid #eee",
            fontSize: 13,
            gap: 8,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
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

      {/* 1. Resumo */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Visitas (7 dias)" value={stats.views7d} />
        <StatCard label="Visitas (30 dias)" value={stats.views30d} />
        <StatCard label="Cliques em ofertas (24h)" value={stats.clicks24h} />
        <StatCard label="Cliques (7 dias)" value={stats.clicks7d} />
        <StatCard label="CTR (7 dias)" value={stats.ctr7d !== null ? `${stats.ctr7d.toFixed(1)}%` : "—"} />
        <StatCard label="Produtos publicados" value={stats.produtos.total} />
      </div>

      {/* 2. Alertas */}
      <section
        style={{
          marginBottom: 28,
          padding: "14px 16px",
          borderRadius: 12,
          background: stats.alerts.length > 0 ? "#fff7ed" : "#f0fbf4",
          border: `1px solid ${stats.alerts.length > 0 ? "#fdba74" : "#86efac"}`,
        }}
      >
        {stats.alerts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#166534" }}>✓ Operação normal</p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 700, color: "#9a3412" }}>⚠ Atenção</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#7c2d12" }}>
              {stats.alerts.map((a) => (
                <li key={a.label}>
                  {a.count} {a.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* 3. Produtos */}
        <section>
          <SectionTitle>Produtos</SectionTitle>
          <KeyValueList
            rows={[
              ["Publicados no site", stats.produtos.total],
              ["Sem preço", stats.produtos.semPreco],
              ["Sem imagem", stats.produtos.semImagem],
              ["Sem link de oferta", stats.produtos.semLink],
              ["Sem categoria", stats.produtos.semCategoria],
              ["Preço não atualizado há mais de 7 dias", stats.produtos.desatualizados],
            ]}
          />
        </section>

        {/* 4. Links */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>Saúde dos links</h2>
            <RevalidateLinksButton />
          </div>
          {stats.links.totalChecados === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>
              Ainda não checamos os links. Clica em &quot;Revalidar agora&quot;.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}>
                Última checagem: {stats.links.okCount} ok, {stats.links.brokenCount} com problema
                {stats.links.lastCheckedAt ? ` (${new Date(stats.links.lastCheckedAt).toLocaleString("pt-BR")})` : ""}
              </p>
              {stats.links.broken.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {stats.links.broken.map((b) => (
                    <li key={b.product_slug} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid #eee" }}>
                      {b.product_name ?? b.product_slug} — {b.status_code ?? "sem resposta"}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
                Checa só se o link ainda responde (200-3xx) — não confirma estoque real nem se o preço mudou.
              </p>
            </>
          )}
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* 5. Matching Shopee x Mercado Livre */}
        <section>
          <SectionTitle>Ponte Shopee ↔ Mercado Livre</SectionTitle>
          <KeyValueList
            rows={[
              ["Comparações confirmadas", stats.matching.confirmados],
              ["Matching pendente (só um lado publicado)", stats.matching.pendentes],
              ["Mais barato na Shopee", stats.matching.maisBaratoShopee],
              ["Mais barato no Mercado Livre", stats.matching.maisBaratoML],
              [
                "Diferença média de preço",
                stats.matching.diffMedio !== null ? `${stats.matching.diffMedio.toFixed(1)}%` : "—",
              ],
            ]}
          />
        </section>

        {/* 6. Buscas sem resultado */}
        <section>
          <SectionTitle>Buscas sem resultado</SectionTitle>
          {stats.busca.topZeroResult.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Nenhuma busca sem resultado registrada ainda.</p>
          ) : (
            <KeyValueList rows={stats.busca.topZeroResult} />
          )}
        </section>
      </div>

      {/* Funil / secundários */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section>
          <SectionTitle>Termos mais buscados</SectionTitle>
          <KeyValueList rows={stats.busca.topSearched} />
        </section>

        <section>
          <SectionTitle>Cliques por loja (últimos 500)</SectionTitle>
          <KeyValueList rows={stats.clicksByPlatform} />
        </section>
      </div>

      <section style={{ marginTop: 28 }}>
        <SectionTitle>Produtos mais clicados (últimos 500 cliques)</SectionTitle>
        <KeyValueList rows={stats.topProducts.map((p) => [p.name, p.count])} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionTitle>Páginas mais vistas (últimas 1000)</SectionTitle>
        <KeyValueList rows={stats.topPaths} />
      </section>

      <p style={{ marginTop: 32, fontSize: 12, color: "#999" }}>
        Estatísticas próprias do site (visitas de página + cliques em &quot;Ver oferta&quot; + checagem de link).
        Não inclui vendas/comissão de verdade — isso só a Shopee e o Mercado Livre sabem, nos painéis deles.
      </p>
    </main>
  );
}
