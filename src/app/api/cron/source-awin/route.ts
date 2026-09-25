import { NextRequest, NextResponse } from "next/server";
import { listAwinFeeds, fetchFeedProducts, AwinFeedInfo } from "../../../../lib/awin/client";
import {
  dedupeCheapestVariants,
  fetchLastUpdatedByVariantKey,
  isFootwear,
  isGiftCard,
  orderByFreshness,
  persistAwinProduct,
} from "../../../../lib/awin/ingest";
import { findShopeeMatchByMpn } from "../../../../lib/awin/matchShopee";
import { createDealCandidate, persistOfferSnapshot, linkProductsToGroup } from "../../../../lib/db/snapshots";
import { buildProductSlug } from "../../../../lib/site/slug";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Ingestão diária da Awin (rede de afiliados — Nike BR, Olympikus BR e
 * Kabum BR aprovados no publisher 2596713, ver CONTINUIDADE.md). Repete o
 * papel do /api/cron/source-deals, só que lendo o datafeed CSV da Awin em
 * vez da API productOfferV2 da Shopee.
 *
 * Pedido do Heber (2026-09-21): tênis, os mais baratos, não caro — Nike e
 * Olympikus filtram só tênis de verdade (categoria "Calçados" + nome/tipo
 * menciona tênis, ver isFootwear em src/lib/awin/ingest.ts) e ordenam por
 * preço crescente (dedupeCheapestVariants já devolve nessa ordem).
 *
 * Kabum (eletrônicos): categoria "Gift Card" é voucher digital, não
 * achadinho de verdade — exclui (ver isGiftCard). Sem piso de preço, os
 * itens mais baratos do feed eram acessório de poucos reais (testado ao
 * vivo, 2026-09-21) — por isso minPrice.
 *
 * Kabum também tenta achar o mesmo produto na Shopee via MPN (código do
 * modelo) e linkar os dois em product_groups (ver matchAndLinkShopee
 * abaixo e src/lib/awin/matchShopee.ts) — isso liga sozinho o
 * comparador de preço que já existe no site (queryGroupOffers em
 * src/lib/site/catalog.ts), sem precisar tocar em nada lá.
 *
 * Cria deal_candidate igual ao pipeline da Shopee — é isso que faz esses
 * produtos entrarem na fila do /api/cron/publish-product (Instagram)
 * também, não só aparecerem no site.
 */

function pickFeed(feeds: AwinFeedInfo[], advertiserName: string, preferNameIncludes?: string): AwinFeedInfo | null {
  const candidates = feeds.filter((f) => f.advertiserName === advertiserName);
  if (candidates.length === 0) return null;
  if (preferNameIncludes) {
    const preferred = candidates.find((f) => f.feedName.includes(preferNameIncludes));
    if (preferred) return preferred;
  }
  return candidates[0];
}

/**
 * Acha o mesmo produto na Shopee pelo MPN (ver src/lib/awin/matchShopee.ts)
 * e linka os dois em product_groups — é isso que liga o comparador de
 * preço do site (queryGroupOffers em src/lib/site/catalog.ts), sem
 * precisar mexer em nada lá. Pedido do Heber (2026-09-21): "quero no
 * site os produtos da Kabum comparando preços com o MESMO produto na
 * Shopee, de forma automática".
 *
 * Só roda se o produto Awin ainda não tem group_id (evita recriar grupo
 * toda execução diária pro mesmo produto) e se tem MPN pra buscar.
 * Sem match: segue sem grupo, não força um par errado.
 */
async function matchAndLinkShopee(params: {
  awinProductId: string;
  groupId: string | null;
  mpn: string | null;
  brand: string | null;
  referencePrice: number;
}) {
  if (params.groupId || !params.mpn) return { linked: false as const };

  const match = await findShopeeMatchByMpn({ mpn: params.mpn, brand: params.brand, referencePrice: params.referencePrice });
  if (!match) return { linked: false as const };

  const { productId: shopeeProductId } = await persistOfferSnapshot(match);

  const db = getDb();
  const slug = buildProductSlug(match.productName, match.itemId);
  const { error: publishError } = await db
    .from("products")
    .update({ slug, site_published: true, updated_at: new Date().toISOString() })
    .eq("id", shopeeProductId);
  if (publishError) throw new Error(`Falha ao publicar match Shopee ${match.itemId}: ${publishError.message}`);

  await linkProductsToGroup(params.awinProductId, shopeeProductId);
  return { linked: true as const, shopeeItemId: match.itemId };
}

async function ingestBatch(params: {
  feed: AwinFeedInfo | null;
  filterRow?: (row: Record<string, string>) => boolean;
  minPrice?: number;
  matchToShopee?: boolean;
  /** Rotaciona a seleção diária pelo catálogo inteiro (produto mais velho sem refresh primeiro) em vez de sempre pegar os N mais baratos do feed — ver orderByFreshness em src/lib/awin/ingest.ts. Sem isso, catálogos grandes (Kabum, pós-backfill) nunca terminam de ser revisitados. */
  prioritizeStale?: boolean;
  platform: string;
  category: string;
  categorySlug: string;
  limit: number;
}) {
  if (!params.feed) {
    return { publicados: [] as string[], falhas: [`feed não encontrado pra platform=${params.platform}`], comparados: [] as string[] };
  }

  const rows = await fetchFeedProducts(params.feed.downloadUrl);
  const filteredRows = params.filterRow ? rows.filter(params.filterRow) : rows;
  const priceSorted = dedupeCheapestVariants(filteredRows, params.minPrice ?? 0);
  // Rank de preço calculado ANTES de reordenar por freshness — o score do
  // deal_candidate continua refletindo "quão barato", não "quão velho",
  // mesmo quando a SELEÇÃO do dia é guiada por staleness.
  const priceRank = new Map(priceSorted.map((item, idx) => [item.variantKey, idx]));

  let ordered = priceSorted;
  if (params.prioritizeStale) {
    const freshness = await fetchLastUpdatedByVariantKey(params.platform);
    ordered = orderByFreshness(priceSorted, freshness);
  }
  const items = ordered.slice(0, params.limit);

  const publicados: string[] = [];
  const comparados: string[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const { productId, snapshotId, groupId } = await persistAwinProduct({
        item,
        platform: params.platform,
        category: params.category,
        categorySlug: params.categorySlug,
      });
      // Mais barato = score maior, numa faixa que compete de forma
      // razoável com os candidatos reais da Shopee (score 0-100, gate em
      // 75 só se aplica lá — aqui não tem gate, é seleção direta). Usa o
      // rank de preço original, não a posição `i` pós-reordenação por
      // staleness (senão "produto revisitado há mais tempo" viraria
      // sinônimo de "score alto", o que não tem nada a ver com o preço).
      const rank = priceRank.get(item.variantKey) ?? i;
      const score = Math.max(50, 85 - rank * 3);
      await createDealCandidate({ productId, offerSnapshotId: snapshotId, status: "discovered", score });
      publicados.push(item.awProductId);

      if (params.matchToShopee) {
        try {
          const result = await matchAndLinkShopee({
            awinProductId: productId,
            groupId,
            mpn: item.mpn,
            brand: item.brand,
            referencePrice: item.price,
          });
          if (result.linked) comparados.push(item.awProductId);
        } catch (err) {
          // Falha em achar par na Shopee não deve derrubar a publicação
          // do produto Awin em si — só fica sem comparação dessa vez.
          console.error(`[awin][match-shopee] falhou pra ${item.awProductId}:`, err);
        }
      }
    } catch (err) {
      falhas.push({ id: item.awProductId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return { publicados, comparados, falhas };
}

export async function GET(request: NextRequest) {
  // Fail-closed, mesmo padrão dos outros crons (ver
  // src/app/api/cron/publish-product/route.ts).
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let feeds: AwinFeedInfo[] = [];
  try {
    feeds = await listAwinFeeds();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `listAwinFeeds falhou: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const [nike, olympikus, kabum] = await Promise.all([
    ingestBatch({
      feed: pickFeed(feeds, "Nike BR", "2024"),
      filterRow: isFootwear,
      platform: "nike",
      category: "esporte",
      categorySlug: "esporte",
      limit: 12,
    }),
    ingestBatch({
      feed: pickFeed(feeds, "Olympikus BR"),
      filterRow: isFootwear,
      platform: "olympikus",
      category: "esporte",
      categorySlug: "esporte",
      limit: 12,
    }),
    ingestBatch({
      feed: pickFeed(feeds, "Kabum BR"),
      filterRow: (row) => !isGiftCard(row),
      minPrice: 40,
      matchToShopee: true,
      prioritizeStale: true,
      platform: "kabum",
      category: "eletronicos",
      categorySlug: "eletronicos",
      // 12 -> 50 -> 150 (2026-09-25). O catálogo cheio (~4.690 produtos) foi
      // trazido de uma vez via scripts/backfill-kabum-full-catalog.ts; só
      // limit:50 sem rotação (bug real flagado pelo ChatGPT e confirmado
      // lendo o código: dedupeCheapestVariants sempre ordena por preço
      // crescente, então "os 50 mais baratos" é quase o MESMO grupo todo
      // dia) deixaria uns ~4.362 produtos com preço parado pra sempre.
      // Com prioritizeStale:true (rotaciona pelo mais velho sem refresh
      // primeiro) + limit:150, uma volta completa no catálogo leva ~30
      // dias em vez de nunca — e como persistAwinProduct é só 2 writes +
      // webhook de revalidate (matchAndLinkShopee só custa uma busca real
      // na Shopee pra produto NOVO, que depois do backfill é raro por
      // dia), 150 itens cabe com folga nos 120s do maxDuration.
      limit: 150,
    }),
  ]);

  return NextResponse.json({ ok: true, nike, olympikus, kabum });
}
