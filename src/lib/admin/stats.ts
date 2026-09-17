import { getDbFresh } from "../db/client";
import { getConversionReport } from "../shopee/queries";
import { classifyLinkCheck, LinkHealthKind } from "./linkHealth";
import { marketplaceDisplayLabel } from "./marketplaces";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function normTerm(term: string): string {
  return term.trim().toLowerCase();
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

function pct(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** KPIs da Visão Geral, com comparação real vs período anterior (7 dias). */
export async function getOverviewStats() {
  const db = getDbFresh();

  const [views7d, viewsPrev7d, clicks7d, clicksPrev7d, clicksToday, catalogCount] = await Promise.all([
    db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
    db
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgoIso(14))
      .lt("created_at", daysAgoIso(7)),
    db.from("click_events").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
    db
      .from("click_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", daysAgoIso(14))
      .lt("created_at", daysAgoIso(7)),
    db.from("click_events").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(1)),
    db.from("site_catalog").select("*", { count: "exact", head: true }),
  ]);

  const v7 = views7d.count ?? 0;
  const vPrev = viewsPrev7d.count ?? 0;
  const c7 = clicks7d.count ?? 0;
  const cPrev = clicksPrev7d.count ?? 0;
  const ctr7d = pct(c7, v7);
  const ctrPrev = pct(cPrev, vPrev);
  const products = catalogCount.count ?? 0;

  return {
    views7d: v7,
    viewsChangePct: pctChange(v7, vPrev),
    clicks7d: c7,
    clicksToday: clicksToday.count ?? 0,
    clicksChangePct: pctChange(c7, cPrev),
    ctr7d,
    ctrChangePct: ctr7d !== null && ctrPrev !== null ? ctr7d - ctrPrev : null,
    products,
  };
}

/** "Atenção necessária" + "Qualidade do catálogo" — usado na Visão Geral. */
export async function getAttentionSummary() {
  const db = getDbFresh();
  const staleCutoff = daysAgoIso(7);

  const [catalog, linkChecksRecent] = await Promise.all([
    db
      .from("site_catalog")
      .select("slug, image_url, price_min, offer_link, category_slug, snapshot_captured_at"),
    db
      .from("link_checks")
      .select("product_slug, status_code, ok, checked_at")
      .order("checked_at", { ascending: false })
      .limit(300),
  ]);

  const rows = (catalog.data ?? []) as Pick<
    CatalogRow,
    "slug" | "image_url" | "price_min" | "offer_link" | "category_slug" | "snapshot_captured_at"
  >[];

  const latestBySlug = new Map<string, LinkCheckRow>();
  for (const row of (linkChecksRecent.data ?? []) as LinkCheckRow[]) {
    if (!latestBySlug.has(row.product_slug)) latestBySlug.set(row.product_slug, row);
  }
  const kinds = [...latestBySlug.values()].map(classifyLinkCheck);

  return {
    blocked: kinds.filter((k) => k === "blocked").length,
    dead: kinds.filter((k) => k === "dead").length,
    semPreco: rows.filter((r) => r.price_min === null).length,
    semImagem: rows.filter((r) => !r.image_url).length,
    semLink: rows.filter((r) => !r.offer_link).length,
    semCategoria: rows.filter((r) => !r.category_slug).length,
    desatualizados: rows.filter((r) => r.snapshot_captured_at < staleCutoff).length,
  };
}

/** Dados da página Produtos & links. */
export async function getProductHealthStats() {
  const db = getDbFresh();
  const staleCutoff = daysAgoIso(7);

  const [catalog, linkChecksRecent] = await Promise.all([
    db
      .from("site_catalog")
      .select("slug, product_name, category_slug, image_url, price_min, offer_link, snapshot_captured_at"),
    db
      .from("link_checks")
      .select("product_slug, product_name, url, ok, status_code, checked_at")
      .order("checked_at", { ascending: false })
      .limit(300),
  ]);

  const catalogRows = (catalog.data ?? []) as Pick<
    CatalogRow,
    "slug" | "product_name" | "category_slug" | "image_url" | "price_min" | "offer_link" | "snapshot_captured_at"
  >[];

  const latestBySlug = new Map<string, LinkCheckRow>();
  for (const row of (linkChecksRecent.data ?? []) as LinkCheckRow[]) {
    if (!latestBySlug.has(row.product_slug)) latestBySlug.set(row.product_slug, row);
  }
  const catalogImageBySlug = new Map(catalogRows.map((r) => [r.slug, r.image_url]));
  const allChecks = [...latestBySlug.values()];
  const withKind = allChecks.map((row) => ({ ...row, kind: classifyLinkCheck(row) }));

  const countByKind = (k: LinkHealthKind) => withKind.filter((x) => x.kind === k).length;
  const lastCheckedAt = allChecks.length
    ? allChecks.reduce((max, c) => (c.checked_at > max ? c.checked_at : max), allChecks[0].checked_at)
    : null;

  const needsAttention = withKind
    .filter((c) => c.kind === "blocked" || c.kind === "dead")
    .sort((a, b) => (a.kind === "dead" ? -1 : 1) - (b.kind === "dead" ? -1 : 1))
    .map((c) => ({
      slug: c.product_slug,
      name: c.product_name ?? c.product_slug,
      imageUrl: catalogImageBySlug.get(c.product_slug) ?? null,
      url: c.url,
      statusCode: c.status_code,
      kind: c.kind as "blocked" | "dead",
    }));

  return {
    kpis: {
      publicados: catalogRows.length,
      bloqueadas: countByKind("blocked"),
      mortos: countByKind("dead"),
      semPreco: catalogRows.filter((r) => r.price_min === null).length,
    },
    linkHealth: {
      ok: countByKind("ok"),
      blocked: countByKind("blocked"),
      dead: countByKind("dead"),
      timeout: countByKind("timeout"),
      total: withKind.length,
      lastCheckedAt,
    },
    needsAttention,
    quality: {
      semImagem: catalogRows.filter((r) => !r.image_url).length,
      semCategoria: catalogRows.filter((r) => !r.category_slug).length,
      semLink: catalogRows.filter((r) => !r.offer_link).length,
      desatualizados: catalogRows.filter((r) => r.snapshot_captured_at < staleCutoff).length,
    },
  };
}

/** Dados da página Comparações (Shopee ↔ Mercado Livre / outras plataformas). */
export async function getComparisonStats() {
  const db = getDbFresh();
  const [catalog, productGroups] = await Promise.all([
    db.from("site_catalog").select("slug, product_name, price_min, group_id, platform"),
    db.from("product_groups").select("id"),
  ]);

  const catalogRows = (catalog.data ?? []) as Pick<
    CatalogRow,
    "slug" | "product_name" | "price_min" | "group_id" | "platform"
  >[];

  const byGroup = new Map<string, CatalogRow[]>();
  for (const row of catalogRows as CatalogRow[]) {
    if (!row.group_id) continue;
    const list = byGroup.get(row.group_id) ?? [];
    list.push(row);
    byGroup.set(row.group_id, list);
  }

  const allGroupIds = (productGroups.data ?? []).map((g: { id: string }) => g.id);
  let confirmados = 0;
  let pendentes = 0;
  let maisBaratoShopee = 0;
  let maisBaratoOutro = 0;
  const diffPercents: number[] = [];
  const rows: {
    groupId: string;
    productName: string;
    cheapestPlatform: string;
    cheapestPrice: number;
    otherPlatform: string;
    otherPrice: number;
    diffPct: number;
  }[] = [];

  for (const groupId of allGroupIds) {
    const groupRows = byGroup.get(groupId) ?? [];
    const platforms = new Set(groupRows.map((r) => r.platform));
    if (platforms.size >= 2) {
      confirmados += 1;
      const withPrice = groupRows.filter((r) => r.price_min !== null);
      if (withPrice.length >= 2) {
        const sorted = [...withPrice].sort((a, b) => (a.price_min ?? 0) - (b.price_min ?? 0));
        const cheapest = sorted[0];
        const second = sorted[1];
        if (cheapest.platform === "shopee") maisBaratoShopee += 1;
        else maisBaratoOutro += 1;
        if (cheapest.price_min && second.price_min) {
          const diffPct = ((second.price_min - cheapest.price_min) / second.price_min) * 100;
          diffPercents.push(diffPct);
          rows.push({
            groupId,
            productName: cheapest.product_name,
            cheapestPlatform: cheapest.platform,
            cheapestPrice: cheapest.price_min,
            otherPlatform: second.platform,
            otherPrice: second.price_min,
            diffPct,
          });
        }
      }
    } else if (groupRows.length === 1) {
      pendentes += 1;
    }
  }

  return {
    totalGrupos: allGroupIds.length,
    confirmados,
    pendentes,
    maisBaratoShopee,
    maisBaratoOutro,
    diffMedio: diffPercents.length ? diffPercents.reduce((a, b) => a + b, 0) / diffPercents.length : null,
    rows: rows.sort((a, b) => b.diffPct - a.diffPct).slice(0, 30),
  };
}

/** Dados da página Analytics (funil, buscas, cliques por marketplace, ranking). */
export async function getAnalyticsStats() {
  const db = getDbFresh();

  const [views7d, recentViews, recentClicks, searchEventsRecent] = await Promise.all([
    db.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(7)),
    db
      .from("page_views")
      .select("path, created_at")
      .gte("created_at", daysAgoIso(7))
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("click_events")
      .select("platform, product_name, product_slug, created_at")
      .gte("created_at", daysAgoIso(7))
      .order("created_at", { ascending: false })
      .limit(1000),
    db
      .from("search_events")
      .select("term, results_count, created_at")
      .gte("created_at", daysAgoIso(7))
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const viewRows = recentViews.data ?? [];
  const searches = (searchEventsRecent.data ?? []) as { term: string; results_count: number }[];
  const clicks = recentClicks.data ?? [];

  const viewsByPath = new Map<string, number>();
  let produtoViews = 0;
  for (const row of viewRows) {
    viewsByPath.set(row.path, (viewsByPath.get(row.path) ?? 0) + 1);
    if (row.path?.startsWith("/produto/")) produtoViews += 1;
  }
  const topPaths = [...viewsByPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const clicksByMarketplace = new Map<string, number>();
  const clicksByProduct = new Map<string, { name: string; count: number }>();
  for (const row of clicks) {
    const label = marketplaceDisplayLabel(row.platform);
    clicksByMarketplace.set(label, (clicksByMarketplace.get(label) ?? 0) + 1);
    if (row.product_name) {
      const key = row.product_slug ?? row.product_name;
      const existing = clicksByProduct.get(key);
      clicksByProduct.set(key, { name: row.product_name, count: (existing?.count ?? 0) + 1 });
    }
  }
  const topProducts = [...clicksByProduct.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  const zeroByTerm = new Map<string, number>();
  const totalByTerm = new Map<string, number>();
  for (const ev of searches) {
    const key = normTerm(ev.term);
    if (!key) continue;
    totalByTerm.set(key, (totalByTerm.get(key) ?? 0) + 1);
    if (ev.results_count === 0) zeroByTerm.set(key, (zeroByTerm.get(key) ?? 0) + 1);
  }
  const topSearched = [...totalByTerm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topZeroResult = [...zeroByTerm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    funnel: {
      visitas: views7d.count ?? 0,
      buscas: searches.length,
      produtosVisualizados: produtoViews,
      cliquesEmOfertas: clicks.length,
      // Não existe fonte real de pedido confirmado ainda (ver diagnóstico
      // 2026-09-16, item 9) — mostra "—" em vez de inventar.
      pedidosConfirmados: null as number | null,
    },
    topSearched,
    topZeroResult,
    clicksByMarketplace: [...clicksByMarketplace.entries()].sort((a, b) => b[1] - a[1]),
    topProducts,
    topPaths,
  };
}

/** Dia calendário no fuso de Brasília (fixo UTC-3), formato "AAAA-MM-DD" —
 * mesma lógica de `queryTodayPosts` em lib/site/catalog.ts. */
function brtDayKey(iso: string): string {
  const brt = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(brtDayKey(daysAgoIso(i)));
  }
  return keys;
}

/** Visitantes (page_views) e cliques (click_events) por dia, últimos 14
 * dias, agrupado no fuso de Brasília — usado no gráfico de barras simples
 * da Analytics. Sem lib de gráfico no projeto: a UI desenha a barra com
 * CSS puro a partir do valor máximo do período. */
export async function getDailyTrend(days = 14) {
  const db = getDbFresh();
  const since = daysAgoIso(days - 1);

  const [viewsRes, clicksRes] = await Promise.all([
    db.from("page_views").select("created_at").gte("created_at", since),
    db.from("click_events").select("created_at").gte("created_at", since),
  ]);

  const dayKeys = lastNDayKeys(days);
  const visitsByDay = new Map(dayKeys.map((k) => [k, 0]));
  const clicksByDay = new Map(dayKeys.map((k) => [k, 0]));

  for (const row of viewsRes.data ?? []) {
    const key = brtDayKey(row.created_at);
    if (visitsByDay.has(key)) visitsByDay.set(key, (visitsByDay.get(key) ?? 0) + 1);
  }
  for (const row of clicksRes.data ?? []) {
    const key = brtDayKey(row.created_at);
    if (clicksByDay.has(key)) clicksByDay.set(key, (clicksByDay.get(key) ?? 0) + 1);
  }

  return dayKeys.map((key) => ({
    day: key,
    visits: visitsByDay.get(key) ?? 0,
    clicks: clicksByDay.get(key) ?? 0,
  }));
}

function startOfTodayBrtEpoch(): number {
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const startBrt = Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate());
  return Math.floor((startBrt + 3 * 60 * 60 * 1000) / 1000);
}

function sumCommission(conversions: { totalCommission: string }[]): number {
  return conversions.reduce((acc, c) => acc + (Number(c.totalCommission) || 0), 0);
}

/**
 * Vendas/comissão reais via `conversionReport` da Shopee (confirmado ao
 * vivo em 2026-09-17 — ver lib/shopee/queries.ts). Pedido do Heber: fechar
 * o gap de "Receita e conversões" que antes só mostrava "—". Se a API da
 * Shopee falhar (rate limit, credencial, rede), a página não pode quebrar
 * por causa disso — devolve `error: true` e a UI mostra "—" como sempre.
 */
export async function getRevenueStats() {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const todayStartEpoch = startOfTodayBrtEpoch();
  const sevenDaysAgoEpoch = nowEpoch - 7 * 24 * 60 * 60;

  try {
    const [todayConversions, last7dConversions] = await Promise.all([
      getConversionReport({ purchaseTimeStart: todayStartEpoch, purchaseTimeEnd: nowEpoch, limit: 200 }),
      getConversionReport({ purchaseTimeStart: sevenDaysAgoEpoch, purchaseTimeEnd: nowEpoch, limit: 200 }),
    ]);

    const pendingToday = todayConversions.filter((c) => c.conversionStatus === "PENDING");
    const completedToday = todayConversions.filter((c) => c.conversionStatus === "COMPLETED");
    const pending7d = last7dConversions.filter((c) => c.conversionStatus === "PENDING");
    const completed7d = last7dConversions.filter((c) => c.conversionStatus === "COMPLETED");

    return {
      error: false as const,
      today: {
        pedidos: new Set(todayConversions.flatMap((c) => c.orderIds)).size,
        comissaoPendente: sumCommission(pendingToday),
        comissaoValidada: sumCommission(completedToday),
      },
      last7d: {
        pedidos: new Set(last7dConversions.flatMap((c) => c.orderIds)).size,
        comissaoPendente: sumCommission(pending7d),
        comissaoValidada: sumCommission(completed7d),
        receitaTotal: sumCommission([...pending7d, ...completed7d]),
      },
    };
  } catch (err) {
    console.error("[admin] falha ao buscar conversionReport da Shopee:", err);
    return { error: true as const, today: null, last7d: null };
  }
}
