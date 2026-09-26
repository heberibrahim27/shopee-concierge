/**
 * Continuação do backfill-bestseller-feed.ts: naquele backfill, 257 de
 * 413 produtos ficaram publicados no site (persistOfferSnapshot + slug +
 * site_published já tinham sucesso) mas SEM deal_candidate/link de
 * afiliado -- a chamada `generateShortLink` começou a ser rate-limitada
 * pela Shopee depois de ~150 chamadas em sequência rápida (concorrência
 * 8). Sem deal_candidate, esses produtos aparecem no site mas NUNCA são
 * elegíveis pro grupo de WhatsApp nem pro Instagram (os dois selecionam
 * a partir da tabela `deal_candidates`, não de `products` direto -- ver
 * publish-whatsapp-group/route.ts:178 e publish-product/route.ts).
 *
 * Preenche só o que falta, bem mais devagar (concorrência 2, pausa entre
 * lotes) pra não bater no rate limit de novo.
 *
 * Roda com: npx tsx scripts/fill-missing-deal-candidates.ts
 */
import "dotenv/config";
import { getDb } from "../src/lib/db/client";
import { generateAffiliateShortLink } from "../src/lib/shopee/queries";
import { createDealCandidate, saveAffiliateLink } from "../src/lib/db/snapshots";

const CONCURRENCY = 2;
const DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const db = getDb();

  // Achado real (2026-09-26, rodando pela 2a vez): sem paginação, esse
  // select devolve só as primeiras 1000 linhas por padrão do Supabase --
  // com 6732 deal_candidates já existentes, a maioria ficava invisível
  // pro `hasCandidate`, e a 2a rodada recriou candidato duplicado pra
  // ~400 produtos que já tinham (inofensivo pra postagem, que dedupe por
  // product_id via social_posts, mas gastou call de link à toa e voltou
  // a bater no rate-limit). Pagina de verdade agora.
  const hasCandidate = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.from("deal_candidates").select("product_id").range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) hasCandidate.add(r.product_id);
    if (data.length < 1000) break;
  }

  const { data: products } = await db
    .from("products")
    .select("id, product_name, offer_snapshots(id, offer_link, product_link)")
    .eq("site_published", true)
    .gte("updated_at", "2026-09-26T00:00:00Z");

  const missing = (products ?? []).filter((p) => !hasCandidate.has(p.id));
  console.log(`${products?.length ?? 0} produtos publicados hoje, ${missing.length} sem deal_candidate.`);

  let done = 0;
  let failed = 0;
  const weekToken = `bsfix${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const snapshot = (p as any).offer_snapshots?.[0];
        if (!snapshot) return;
        try {
          const dc = await createDealCandidate({ productId: p.id, offerSnapshotId: snapshot.id, status: "discovered" });
          const originUrl = snapshot.product_link || snapshot.offer_link;
          const subIds = ["bs", "p1", weekToken, "auto"];
          const link = await generateAffiliateShortLink({ originUrl, subIds });
          await saveAffiliateLink({ dealCandidateId: dc.id, originUrl, subIds, shortLink: link.shortLink, longLink: link.longLink });
          done++;
        } catch (err) {
          failed++;
          console.error(`falha ${p.id} (${p.product_name.slice(0, 40)}):`, err instanceof Error ? err.message : err);
        }
      })
    );
    if (done % 20 === 0 && done > 0) console.log(`${done} concluídos, ${failed} falhas...`);
    await sleep(DELAY_MS);
  }

  console.log(`\nConcluído: ${done} deal_candidates criados, ${failed} falhas restantes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
