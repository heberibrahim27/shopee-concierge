/**
 * Limpeza pontual (não é cron): despublica um cluster específico de
 * produto quase-duplicado que entrou no catálogo sem nenhum sinal real
 * de mercado (nota=0 E vendas=0 em todos os itens) -- achado real
 * (Heber, 2026-09-26: "olha a quantidade de escova elétrica que tem na
 * categoria casa"), causa raiz corrigida em liveSearch.ts (hasRealSignal).
 * Só marca site_published=false (reversível, produto continua no banco)
 * -- nunca deleta linha. Roda com: npx tsx scripts/unpublish-zero-signal-cluster.ts
 */
import "dotenv/config";
import { getDb } from "../src/lib/db/client";

async function main() {
  const db = getDb();
  const { data, error } = await db
    .from("site_catalog")
    .select("id, product_name, rating_star, sales")
    .eq("category_slug", "beleza");
  if (error) throw new Error(error.message);

  const cluster = (data ?? []).filter(
    (p) =>
      p.product_name.toLowerCase().includes("vapor") &&
      p.product_name.toLowerCase().includes("escova") &&
      (p.rating_star === 0 || p.rating_star === null) &&
      (p.sales === 0 || p.sales === null)
  );

  console.log(`${cluster.length} produtos do cluster "escova a vapor" sem sinal real -- despublicando.`);

  for (const p of cluster) {
    const { error: updateError } = await db
      .from("products")
      .update({ site_published: false, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (updateError) console.error(`Falha ao despublicar ${p.id}:`, updateError.message);
    else console.log(`Despublicado: ${p.product_name.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
