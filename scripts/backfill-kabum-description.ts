/**
 * Backfill único (não é o cron diário) pra preencher `products.description`
 * nos produtos Kabum/Awin já publicados antes da coluna existir (ver
 * migration 20260925200000). Sem isso, só produto ingerido DAQUI PRA FRENTE
 * teria a ficha técnica real -- os ~4.900 já publicados no backfill de
 * 2026-09-25 ficariam sem, mesmo o dado já existindo no feed hoje.
 *
 * Roda com: npx tsx scripts/backfill-kabum-description.ts
 */
import "dotenv/config";

import { listAwinFeeds, fetchFeedProducts } from "../src/lib/awin/client";
import { decodeAwinDescription, variantKeyFor } from "../src/lib/awin/ingest";
import { getDb } from "../src/lib/db/client";

async function main() {
  const feeds = await listAwinFeeds();
  const kabum = feeds.find((f) => f.advertiserName.toLowerCase().includes("kabum"));
  if (!kabum) throw new Error("Feed da Kabum não encontrado");

  console.log("Baixando feed da Kabum...");
  const rows = await fetchFeedProducts(kabum.downloadUrl);
  console.log(`${rows.length} linhas no feed`);

  // Mesma variantKey usada em persistAwinProduct (shopee_item_id = "AWIN-"
  // + variantKey) -- reaproveitada de ingest.ts pra não duplicar/divergir a
  // lógica de agrupamento por tamanho/cor.
  const descByVariantKey = new Map<string, string>();
  for (const row of rows) {
    const key = variantKeyFor(row);
    if (descByVariantKey.has(key)) continue;
    const desc = decodeAwinDescription(row["description"]);
    if (desc) descByVariantKey.set(key, desc);
  }
  console.log(`${descByVariantKey.size} produtos com descrição real no feed`);

  const db = getDb();
  // Supabase limita SELECT a 1000 linhas por padrão -- achado real ao rodar
  // (catálogo Kabum tem 4.412 produtos, primeira rodada só pegou os 1000
  // primeiros). Pagina em blocos de 1000 até esgotar.
  const existing: { id: string; shopee_item_id: string; description: string | null }[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error } = await db
      .from("products")
      .select("id, shopee_item_id, description")
      .eq("platform", "kabum")
      .like("shopee_item_id", "AWIN-%")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao listar produtos Kabum: ${error.message}`);
    if (!page || page.length === 0) break;
    existing.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  console.log(`${existing.length} produtos Kabum já publicados no banco`);

  let updated = 0;
  let skippedNoMatch = 0;
  let skippedAlreadyHas = 0;
  for (const p of existing) {
    if (p.description) {
      skippedAlreadyHas++;
      continue;
    }
    const variantKey = p.shopee_item_id.slice("AWIN-".length);
    const desc = descByVariantKey.get(variantKey);
    if (!desc) {
      skippedNoMatch++;
      continue;
    }
    const { error: updateError } = await db.from("products").update({ description: desc }).eq("id", p.id);
    if (updateError) {
      console.error(`Falha ao atualizar ${p.id}:`, updateError.message);
      continue;
    }
    updated++;
    if (updated % 200 === 0) console.log(`${updated} atualizados...`);
  }

  console.log(`\nConcluído: ${updated} atualizados, ${skippedAlreadyHas} já tinham descrição, ${skippedNoMatch} sem match/descrição no feed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
