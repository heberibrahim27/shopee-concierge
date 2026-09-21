import { NextRequest, NextResponse } from "next/server";
import { listAwinFeeds, fetchFeedProducts, AwinFeedInfo } from "../../../../lib/awin/client";
import { dedupeCheapestVariants, isFootwear, persistAwinProduct } from "../../../../lib/awin/ingest";
import { createDealCandidate } from "../../../../lib/db/snapshots";

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
 * Kabum (eletrônicos, aprovado no publisher mas sem sinal de desconto ou
 * categoria confiável no feed) fica FORA por enquanto: testado ao vivo
 * (2026-09-21), os itens mais baratos do feed são gift card e acessório
 * de poucos reais — ordenar só por preço puxa lixo, não achadinho de
 * verdade. Precisa de um filtro de qualidade melhor antes de entrar aqui.
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

async function ingestBatch(params: {
  feed: AwinFeedInfo | null;
  footwearOnly: boolean;
  platform: string;
  category: string;
  categorySlug: string;
  limit: number;
}) {
  if (!params.feed) {
    return { publicados: [] as string[], falhas: [`feed não encontrado pra platform=${params.platform}`] };
  }

  const rows = await fetchFeedProducts(params.feed.downloadUrl);
  const filteredRows = params.footwearOnly ? rows.filter(isFootwear) : rows;
  const items = dedupeCheapestVariants(filteredRows).slice(0, params.limit);

  const publicados: string[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const { productId, snapshotId } = await persistAwinProduct({
        item,
        platform: params.platform,
        category: params.category,
        categorySlug: params.categorySlug,
      });
      // Mais barato = score maior, numa faixa que compete de forma
      // razoável com os candidatos reais da Shopee (score 0-100, gate em
      // 75 só se aplica lá — aqui não tem gate, é seleção direta).
      const score = Math.max(50, 85 - i * 3);
      await createDealCandidate({ productId, offerSnapshotId: snapshotId, status: "discovered", score });
      publicados.push(item.awProductId);
    } catch (err) {
      falhas.push({ id: item.awProductId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return { publicados, falhas };
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

  const [nike, olympikus] = await Promise.all([
    ingestBatch({
      feed: pickFeed(feeds, "Nike BR", "2024"),
      footwearOnly: true,
      platform: "nike",
      category: "esporte",
      categorySlug: "esporte",
      limit: 12,
    }),
    ingestBatch({
      feed: pickFeed(feeds, "Olympikus BR"),
      footwearOnly: true,
      platform: "olympikus",
      category: "esporte",
      categorySlug: "esporte",
      limit: 12,
    }),
  ]);

  return NextResponse.json({ ok: true, nike, olympikus });
}
