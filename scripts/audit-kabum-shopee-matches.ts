import "dotenv/config";
import { getDb } from "../src/lib/db/client";
import { findMatchConflicts } from "../src/lib/awin/matchValidation";

/**
 * Roda o MATCH_VALIDATION_GATE v1 (src/lib/awin/matchValidation.ts)
 * retroativamente contra os pares Kabum x Shopee já linkados via
 * product_groups, pra achar (e opcionalmente corrigir) casos como o DJI
 * Action 4 x Action 360 achado na QA amostral manual de 2026-09-25 sem
 * precisar conferir os ~987 restantes um por um.
 *
 * Uso: npx tsx scripts/audit-kabum-shopee-matches.ts        (dry-run, só lista)
 *      npx tsx scripts/audit-kabum-shopee-matches.ts --fix  (deslinka os conflitos)
 */
async function run() {
  const fix = process.argv.includes("--fix");
  const db = getDb();

  const { data: rows, error } = await db
    .from("products")
    .select("id, group_id, platform, product_name, slug")
    .eq("platform", "kabum")
    .not("group_id", "is", null);

  if (error) throw new Error(`Falha ao buscar produtos Kabum linkados: ${error.message}`);

  console.log(`Kabum com group_id: ${rows?.length ?? 0}`);

  let checked = 0;
  let conflicts = 0;
  const examples: string[] = [];

  for (const kabum of rows ?? []) {
    const { data: pair, error: pairError } = await db
      .from("products")
      .select("id, product_name, slug, platform")
      .eq("group_id", kabum.group_id)
      .neq("id", kabum.id);

    if (pairError) {
      console.error(`Falha ao buscar par do grupo ${kabum.group_id}: ${pairError.message}`);
      continue;
    }
    const shopee = (pair ?? []).find((p) => p.platform !== "kabum");
    if (!shopee) continue;

    checked++;
    const found = findMatchConflicts(kabum.product_name, shopee.product_name);
    if (found.length > 0) {
      conflicts++;
      const line = `[CONFLITO] Kabum "${kabum.product_name}" x Shopee "${shopee.product_name}" -- ${found.map((c) => c.detail).join(" | ")}`;
      console.log(line);
      examples.push(line);

      if (fix) {
        await db.from("products").update({ group_id: null, updated_at: new Date().toISOString() }).in("id", [kabum.id, shopee.id]);
        await db.from("product_groups").delete().eq("id", kabum.group_id);
        console.log(`  -> deslinkado (group_id ${kabum.group_id} removido)`);
      }
    }
  }

  console.log(`\nResumo: ${checked} pares conferidos, ${conflicts} com conflito de atributo detectado${fix ? " (deslinkados)" : " (dry-run, nada alterado -- rode com --fix pra corrigir)"}.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
