/**
 * Teste manual, sem WhatsApp nem OpenAI — só pra confirmar que as
 * credenciais Shopee no .env local funcionam, reaproveitando a mesma
 * chamada validada manualmente em 10/09/2026.
 *
 * Uso: copie .env.example pra .env, preencha SHOPEE_APP_ID/SHOPEE_SECRET,
 * depois rode: npm run test:search -- "termo de busca"
 */
import "dotenv/config";
import { searchProductsByKeyword } from "../src/lib/shopee/queries";

async function main() {
  const keyword = process.argv[2] ?? "fone de ouvido bluetooth";
  const results = await searchProductsByKeyword({ keyword, limit: 5 });

  console.log(`Encontrados ${results.length} produtos para "${keyword}":\n`);
  for (const p of results) {
    console.log(`- ${p.productName} | R$${p.priceMin} | nota ${p.ratingStar} | comissão R$${p.commission}`);
    console.log(`  ${p.offerLink}\n`);
  }
}

main().catch((err) => {
  console.error("Erro no teste:", err);
  process.exit(1);
});
