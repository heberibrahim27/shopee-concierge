/**
 * Transforma linhas cruas do datafeed da Awin (ver src/lib/awin/client.ts)
 * em produtos prontos pra gravar no banco, e faz a gravação em si —
 * mesma forma de products/offer_snapshots que o pipeline da Shopee usa
 * (src/lib/db/snapshots.ts), só que a fonte é o feed CSV da Awin em vez
 * da API productOfferV2.
 *
 * Duas coisas que o feed da Awin não tem e o da Shopee tem: nota/vendas
 * (sem corte por avaliação aqui) e cada tamanho/cor de um produto vira
 * uma LINHA separada no CSV com o mesmo `merchant_product_id` (ou
 * `parent_product_id`, quando existe) — sem agrupar isso, o mesmo tênis
 * apareceria 5x, uma por numeração. `dedupeCheapestVariants` resolve
 * isso pegando só a variante mais barata em estoque de cada grupo.
 */
import { getDb } from "../db/client";
import { notifyCatalogUpdate } from "../site/notifyRevalidate";
import { buildProductSlug } from "../site/slug";

export interface AwinCatalogItem {
  awProductId: string;
  productName: string;
  price: number;
  basePrice: number | null;
  imageUrl: string;
  deepLink: string;
  productLink: string;
  variantKey: string;
}

function toNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function variantKeyFor(row: Record<string, string>): string {
  // Nike tem parent_product_id de verdade agrupando tamanho/cor (testado
  // ao vivo, 2026-09-21). Olympikus NÃO tem essa coluna e o
  // merchant_product_id de lá é um número solto sem prefixo em comum
  // entre variantes do mesmo tênis — nesse caso, agrupa pelo nome
  // normalizado (mais barato ganha). Imperfeito quando o nome já inclui
  // tamanho/cor ("Mantra Feminino 38 Preto" vs "... 36 Azul" não
  // colapsam), mas resolve o caso comum (nome igual, cores repetidas).
  const parent = row["parent_product_id"];
  if (parent && parent.trim()) return parent.trim();
  return stripAccents(row["product_name"] ?? "").toLowerCase().trim();
}

function isInStock(row: Record<string, string>): boolean {
  const v = (row["in_stock"] ?? "").trim().toLowerCase();
  // Coluna ausente ou vazia em alguns feeds — trata como "sem info", não bloqueia.
  return v === "" || v === "1" || v === "yes" || v === "true" || v === "in stock";
}

// Estrito de propósito (pedido do Heber, 2026-09-21: "os melhores tênis
// mais baratos", "não quero nada caro"): só tênis mesmo, não chinelo,
// sandália, bota ou chuteira.
const SNEAKER_KEYWORDS = ["tenis", "sneaker"];
// "product_type" é a taxonomia real do feed (ex: "Infantil > Calçados >
// Tênis" na Nike, "Feminino - Calçados - Casual" na Olympikus — separador
// muda, "Calçados" não). Só palavra-chave no nome não bastava: testado ao
// vivo, "Camiseta Jordan Sneaker" e "Bolsa Para Tênis" passavam no filtro
// por nome mesmo sendo roupa/acessório — exigir categoria de calçado
// também elimina esses falsos positivos.
const FOOTWEAR_CATEGORY_KEYWORDS = ["calcado", "calcados"];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Produto é tênis de verdade (categoria de calçado E nome/tipo menciona tênis) — filtra o feed de moda pra só o que o Heber pediu. */
export function isFootwear(row: Record<string, string>): boolean {
  const productType = stripAccents(row["product_type"] ?? "").toLowerCase();
  const categoryName = stripAccents(row["category_name"] ?? "").toLowerCase();
  const isFootwearCategory = FOOTWEAR_CATEGORY_KEYWORDS.some(
    (k) => productType.includes(k) || categoryName.includes(k)
  );
  if (!isFootwearCategory) return false;

  const nameHaystack = stripAccents(`${productType} ${row["product_name"] ?? ""}`).toLowerCase();
  return SNEAKER_KEYWORDS.some((k) => nameHaystack.includes(k));
}

// Kabum: a taxonomia real vem em `merchant_category` ("Periféricos >
// Teclado Gamer > ..."), não `category_name` (vazio nesse feed —
// confirmado ao vivo, 2026-09-21). "Gift Card > Cartão Presente > ..." é
// voucher digital, não achadinho de verdade.
export function isGiftCard(row: Record<string, string>): boolean {
  const category = row["merchant_category"] || row["category_name"] || "";
  return stripAccents(category).toLowerCase().startsWith("gift card");
}

/** Agrupa por variante (tamanho/cor), fica só com a mais barata em estoque de cada grupo, ordenado por preço crescente ("mais baratos" primeiro). `minPrice` corta lixo barato (ex: acessório de poucos reais que não é achadinho de verdade). */
export function dedupeCheapestVariants(
  rows: Record<string, string>[],
  minPrice = 0
): AwinCatalogItem[] {
  const groups = new Map<string, AwinCatalogItem>();
  for (const row of rows) {
    const price = toNumber(row["search_price"]);
    if (price == null || price < minPrice || !isInStock(row)) continue;
    const awProductId = row["aw_product_id"];
    const productName = row["product_name"];
    const imageUrl = row["aw_image_url"] || row["merchant_image_url"] || "";
    const deepLink = row["aw_deep_link"];
    if (!awProductId || !productName || !imageUrl || !deepLink) continue;

    const key = variantKeyFor(row);
    const existing = groups.get(key);
    if (existing && existing.price <= price) continue;

    groups.set(key, {
      awProductId,
      productName,
      price,
      basePrice: toNumber(row["base_price_amount"] || row["base_price"]),
      imageUrl,
      deepLink,
      productLink: row["merchant_deep_link"] || deepLink,
      variantKey: key,
    });
  }
  return [...groups.values()].sort((a, b) => a.price - b.price);
}

export async function persistAwinProduct(params: {
  item: AwinCatalogItem;
  platform: string;
  category: string;
  categorySlug: string;
}): Promise<{ productId: string; snapshotId: string; slug: string }> {
  const db = getDb();
  const shopeeItemId = `AWIN-${params.item.awProductId}`;
  const slug = buildProductSlug(params.item.productName, shopeeItemId);

  const { data: product, error: productError } = await db
    .from("products")
    .upsert(
      {
        shopee_item_id: shopeeItemId,
        product_name: params.item.productName,
        platform: params.platform,
        category: params.category,
        category_slug: params.categorySlug,
        slug,
        site_published: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopee_item_id" }
    )
    .select("id")
    .single();

  if (productError || !product) {
    throw new Error(`Falha ao gravar produto Awin ${shopeeItemId}: ${productError?.message}`);
  }

  const discountRate =
    params.item.basePrice && params.item.basePrice > params.item.price
      ? Math.round((1 - params.item.price / params.item.basePrice) * 100)
      : null;

  const { data: snapshot, error: snapshotError } = await db
    .from("offer_snapshots")
    .insert({
      product_id: product.id,
      price_min: params.item.price,
      price_max: params.item.price,
      price_discount_rate: discountRate,
      image_url: params.item.imageUrl,
      product_link: params.item.productLink,
      offer_link: params.item.deepLink,
      raw: params.item as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(`Falha ao gravar snapshot Awin ${shopeeItemId}: ${snapshotError?.message}`);
  }

  await notifyCatalogUpdate({ productSlug: slug, categorySlug: params.categorySlug }).catch((e) =>
    console.error(`[awin][revalidate] falhou pra ${slug}`, e)
  );

  return { productId: product.id, snapshotId: snapshot.id, slug };
}
