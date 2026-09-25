/**
 * Backfill único (não é o cron diário) pra recategorizar produtos que
 * caíram no catch-all "casa" de `guessCategorySlug` antes da lista de
 * eletrônicos ser ampliada (ver src/lib/site/categorize.ts, 2026-09-25 --
 * Heber: "categoria nada com nada" em /categoria/casa, produto de R$20 mil
 * como controladora de DJ, drone, placa de vídeo aparecendo como "Casa").
 * Re-roda o classificador em cima do `product_name` de tudo que já está em
 * category_slug='casa' e atualiza só o que agora resolve pra outra
 * categoria -- nunca mexe no que já era "casa" de verdade (papelaria de
 * cozinha, airfryer, etc).
 *
 * Roda com: npx tsx scripts/backfill-recategorize-casa.ts
 */
import "dotenv/config";

import { guessCategorySlug } from "../src/lib/site/categorize";
import { getDb } from "../src/lib/db/client";

async function main() {
  const db = getDb();

  const rows: { id: string; product_name: string }[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error } = await db
      .from("products")
      .select("id, product_name")
      .eq("category_slug", "casa")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao listar produtos "casa": ${error.message}`);
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  console.log(`${rows.length} produtos em category_slug='casa'`);

  const changedCategories = new Set<string>();
  let updated = 0;
  let keptCasa = 0;
  const byNewCategory = new Map<string, number>();

  for (const row of rows) {
    const newSlug = guessCategorySlug(row.product_name);
    if (newSlug === "casa") {
      keptCasa++;
      continue;
    }
    const { error: updateError } = await db
      .from("products")
      .update({ category_slug: newSlug, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) {
      console.error(`Falha ao atualizar ${row.id}:`, updateError.message);
      continue;
    }
    updated++;
    changedCategories.add(newSlug);
    byNewCategory.set(newSlug, (byNewCategory.get(newSlug) ?? 0) + 1);
    if (updated % 100 === 0) console.log(`${updated} recategorizados...`);
  }

  console.log(`\nConcluído: ${updated} recategorizados, ${keptCasa} continuam "casa" de verdade.`);
  console.log("Por categoria nova:", Object.fromEntries(byNewCategory));

  // Revalida as tags de cache das categorias afetadas (inclui "casa", que
  // perdeu produtos) pra não esperar o fallback de 1h -- mesmo endpoint
  // interno usado pelo pipeline de sourcing (ver notifyRevalidate.ts),
  // chamado direto aqui porque isso é uma mudança em massa, não por
  // produto.
  const baseUrl = process.env.SITE_BASE_URL;
  const secret = process.env.REVALIDATION_SECRET;
  if (baseUrl && secret && updated > 0) {
    const tagsToRevalidate = ["casa", ...changedCategories];
    for (const categorySlug of tagsToRevalidate) {
      try {
        const res = await fetch(`${baseUrl}/api/internal/revalidate-catalog`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify({ event: "product_updated", productSlug: "backfill-recategorize-casa", categorySlug }),
        });
        console.log(`Revalidado category:${categorySlug} -> ${res.status}`);
      } catch (e) {
        console.error(`Falha ao revalidar category:${categorySlug}:`, e);
      }
    }
  } else if (updated > 0) {
    console.log("SITE_BASE_URL/REVALIDATION_SECRET ausentes -- pula revalidação (cache expira sozinho em até 1h).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
