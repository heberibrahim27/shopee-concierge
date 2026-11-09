import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { searchProductsByShop, generateAffiliateShortLink } from "../../../../lib/shopee/queries";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../../../../lib/db/snapshots";
import { buildProductSlug } from "../../../../lib/site/slug";
import { guessCategorySlug } from "../../../../lib/site/categorize";
import { notifyCatalogUpdate } from "../../../../lib/site/notifyRevalidate";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Importa o catálogo inteiro da loja própria do Heber, "Loja Para O Lar"
 * (Shopee, username `lojaparaolar`), pedido dele em 2026-11-09: "quero
 * postar produtos apenas da loja para o lar" (~500 itens hoje, deve passar
 * de 1.000). Mesmo molde de source-farmacia, mas PAGINADO (a Farmácia só
 * lia a página 1) e idempotente: roda 2x/dia e só cria candidato pra item
 * que ainda não entrou, então o que o Heber cadastrar ao longo do dia é
 * pego sozinho.
 *
 * shopId 337479662 confirmado ao vivo pela rede real da página da loja
 * (`get_shop_base_v2` -> shopid, name "Loja Para O Lar", item_count 502).
 *
 * O Instagram só passa a postar exclusivamente dessa loja quando a variável
 * INSTAGRAM_ONLY_ORIGEM=loja-propria-para-o-lar estiver definida (ver
 * publish-product) -- de propósito, pra o canal nunca ficar mudo enquanto
 * a importação ainda não trouxe itens.
 *
 * ?dryRun=1 só conta o que a API devolve, sem gravar nada.
 */

const PARA_O_LAR_SHOP_ID = "337479662";
const PARA_O_LAR_ORIGEM = "loja-propria-para-o-lar";
const PAGE_SIZE = 50;
const MAX_PAGES = 40; // até 2.000 itens
const MAX_NEW_PER_RUN = 150;
const CONCURRENCY = 5;
const BASE_SCORE = 85; // entra como Shopee comum nas filas (sem furar fila como a Farmácia)

function contentToken(itemId: string): string {
  return `c${crypto.createHash("sha1").update(itemId).digest("hex").slice(0, 6)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const db = getDb();

  // Varre a loja inteira pela API de afiliado.
  const offers: Awaited<ReturnType<typeof searchProductsByShop>> = [];
  const seen = new Set<string>();
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await searchProductsByShop({ shopId: PARA_O_LAR_SHOP_ID, page, limit: PAGE_SIZE });
      if (batch.length === 0) break;
      for (const o of batch) {
        const itemId = String(o.itemId);
        if (seen.has(itemId)) continue;
        seen.add(itemId);
        offers.push({ ...o, itemId, shopId: String(o.shopId) });
      }
      if (batch.length < PAGE_SIZE) break;
      await sleep(300);
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: `busca por loja falhou: ${err instanceof Error ? err.message : String(err)}`, coletadosAteAqui: offers.length }, { status: 500 });
  }

  // Quem já virou candidato (por origem) não é recriado.
  const { data: existing, error: existingError } = await db
    .from("deal_candidates")
    .select("products!inner(shopee_item_id)")
    .eq("score_breakdown->>origem", PARA_O_LAR_ORIGEM)
    .limit(5000);
  if (existingError) {
    return NextResponse.json({ ok: false, error: `leitura de candidatos existentes falhou: ${existingError.message}` }, { status: 500 });
  }
  const done = new Set((existing ?? []).map((r: any) => String(r.products?.shopee_item_id)));
  const fresh = offers.filter((o) => !done.has(o.itemId));

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      naLojaViaApi: offers.length,
      jaImportados: offers.length - fresh.length,
      novos: fresh.length,
      amostra: fresh.slice(0, 5).map((o) => `${o.productName.slice(0, 60)} R$${o.priceMin}`),
    });
  }

  const toCreate = fresh.slice(0, MAX_NEW_PER_RUN);
  const weekToken = `pl${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  let published = 0;
  const failed: string[] = [];
  const queue = [...toCreate];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const offer = queue.shift()!;
        try {
          const { productId, snapshotId } = await persistOfferSnapshot(offer);
          const subIds = ["ig", "paraolar", weekToken, contentToken(offer.itemId), "auto"];
          const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });
          const dc = await createDealCandidate({
            productId,
            offerSnapshotId: snapshotId,
            status: "discovered",
            score: BASE_SCORE,
            scoreBreakdown: { origem: PARA_O_LAR_ORIGEM },
          });
          await saveAffiliateLink({ dealCandidateId: dc.id, originUrl: offer.productLink || offer.offerLink, subIds, shortLink: link.shortLink, longLink: link.longLink });
          const slug = buildProductSlug(offer.productName, offer.itemId);
          const { error: updateError } = await db
            .from("products")
            .update({ slug, category_slug: guessCategorySlug(offer.productName), site_published: true, highlight_reason: "loja-propria", updated_at: new Date().toISOString() })
            .eq("id", productId);
          if (updateError) throw new Error(updateError.message);
          published++;
        } catch (err) {
          failed.push(`${offer.itemId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })
  );

  if (published > 0) {
    await notifyCatalogUpdate({ productSlug: "source-para-o-lar", categorySlug: null }).catch((e) =>
      console.error("[cron/source-para-o-lar] revalidate falhou:", e)
    );
  }

  return NextResponse.json({
    ok: true,
    naLojaViaApi: offers.length,
    jaImportados: offers.length - fresh.length,
    criadosAgora: published,
    faltamNaProximaRodada: Math.max(0, fresh.length - toCreate.length),
    falhas: failed.slice(0, 10),
  });
}
