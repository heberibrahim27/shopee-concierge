/**
 * Backfill único (não é o cron diário) pra trazer o catálogo COMPLETO da
 * Kabum de uma vez, em vez de esperar o limite de 12/dia do
 * /api/cron/source-awin preencher aos poucos (levaria quase um ano pros
 * ~4.600 produtos válidos). Pedido do Heber 2026-09-25: "puxar um
 * catálogo que seja completo". Reaproveita exatamente a mesma lógica já
 * usada e testada no cron (persistAwinProduct, findShopeeMatchByMpn) —
 * só roda pra tudo de uma vez, com progresso no console.
 *
 * Roda com: npx tsx scripts/backfill-kabum-full-catalog.ts
 */
import "dotenv/config";

import { listAwinFeeds, fetchFeedProducts } from "../src/lib/awin/client";
import { dedupeCheapestVariants, isGiftCard, persistAwinProduct } from "../src/lib/awin/ingest";
import { findShopeeMatchByMpn } from "../src/lib/awin/matchShopee";
import { createDealCandidate, persistOfferSnapshot, linkProductsToGroup } from "../src/lib/db/snapshots";
import { buildProductSlug } from "../src/lib/site/slug";
import { getDb } from "../src/lib/db/client";

const MIN_PRICE = 40;
const SHOPEE_MATCH_DELAY_MS = 350; // pacing conservador -- nao existe limite documentado da Shopee, evita martelar a API

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function run() {
  console.log("--- Backfill completo do catalogo Kabum ---");
  const feeds = await listAwinFeeds();
  const kabumFeed = feeds.find((f) => f.advertiserName === "Kabum BR");
  if (!kabumFeed) throw new Error("Feed Kabum BR nao encontrado na lista ativa da Awin");
  console.log(`Feed: ${kabumFeed.feedName} (fid=${kabumFeed.feedId}), ${kabumFeed.productCount} produtos reportados`);

  const rows = await fetchFeedProducts(kabumFeed.downloadUrl);
  const filtered = rows.filter((row) => !isGiftCard(row));
  const items = dedupeCheapestVariants(filtered, MIN_PRICE);
  console.log(`${rows.length} linhas no feed -> ${filtered.length} depois de excluir gift card -> ${items.length} produtos unicos (>= R$${MIN_PRICE})`);

  let novos = 0;
  let jaExistiam = 0;
  let comparados = 0;
  let falhas = 0;
  const inicioMs = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const { productId, snapshotId, groupId } = await persistAwinProduct({
        item,
        platform: "kabum",
        category: "eletronicos",
        categorySlug: "eletronicos",
      });
      const score = Math.max(50, 85 - (i % 100) * 0.3);
      await createDealCandidate({ productId, offerSnapshotId: snapshotId, status: "discovered", score });
      novos++;

      try {
        const result = await matchAndLinkShopee({
          awinProductId: productId,
          groupId,
          mpn: item.mpn,
          brand: item.brand,
          referencePrice: item.price,
        });
        if (result.linked) comparados++;
        await sleep(SHOPEE_MATCH_DELAY_MS);
      } catch (err) {
        console.error(`  [match-shopee] falhou pra ${item.awProductId}:`, err instanceof Error ? err.message : err);
      }
    } catch (err) {
      falhas++;
      console.error(`  [persist] falhou pra ${item.awProductId}:`, err instanceof Error ? err.message : err);
    }

    if ((i + 1) % 50 === 0 || i === items.length - 1) {
      const decorridoMin = ((Date.now() - inicioMs) / 60000).toFixed(1);
      console.log(
        `[${i + 1}/${items.length}] processados | ${novos} ok | ${comparados} com match Shopee | ${falhas} falhas | ${decorridoMin} min decorridos`
      );
    }
  }

  console.log("\n--- Resumo final ---");
  console.log(`Total processado: ${items.length}`);
  console.log(`Publicados/atualizados: ${novos}`);
  console.log(`Comparacoes reais com Shopee criadas: ${comparados}`);
  console.log(`Falhas: ${falhas}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERRO FATAL:", err);
    process.exit(1);
  });
