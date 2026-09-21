/**
 * Teste manual (sem gravar no banco) do pipeline de ingestão da Awin —
 * confirma que o filtro de calçado/gift-card + dedup de variante +
 * ordenação por preço estão pegando produto de verdade antes de ligar
 * isso num cron.
 */
import { listAwinFeeds, fetchFeedProducts } from "../src/lib/awin/client";
import { dedupeCheapestVariants, isFootwear, isGiftCard } from "../src/lib/awin/ingest";

async function run() {
  const feeds = await listAwinFeeds();
  console.log(`Feeds ativos: ${feeds.length}`);
  for (const f of feeds) {
    console.log(`  - ${f.advertiserName} | ${f.feedName} | fid=${f.feedId} | ${f.productCount} produtos | last=${f.lastImported}`);
  }

  const nikeFeed = feeds.find((f) => f.advertiserName === "Nike BR" && f.feedName.includes("2024")) ?? feeds.find((f) => f.advertiserName === "Nike BR");
  const olympikusFeed = feeds.find((f) => f.advertiserName === "Olympikus BR");
  const kabumFeed = feeds.find((f) => f.advertiserName === "Kabum BR");

  const batches = [
    { label: "Nike", feed: nikeFeed, filterRow: isFootwear, minPrice: 0 },
    { label: "Olympikus", feed: olympikusFeed, filterRow: isFootwear, minPrice: 0 },
    { label: "Kabum", feed: kabumFeed, filterRow: (row: Record<string, string>) => !isGiftCard(row), minPrice: 40 },
  ] as const;

  for (const { label, feed, filterRow, minPrice } of batches) {
    if (!feed) {
      console.log(`\n${label}: feed não encontrado`);
      continue;
    }
    const rows = await fetchFeedProducts(feed.downloadUrl);
    const filtered = rows.filter(filterRow);
    const items = dedupeCheapestVariants(filtered, minPrice);
    console.log(`\n${label}: ${rows.length} linhas no feed -> ${filtered.length} depois do filtro -> ${items.length} produtos únicos`);
    for (const item of items.slice(0, 8)) {
      console.log(`  R$ ${item.price.toFixed(2).padStart(8)} ${item.basePrice ? `(de R$ ${item.basePrice.toFixed(2)})` : ""} | ${item.productName.slice(0, 60)}`);
    }
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
