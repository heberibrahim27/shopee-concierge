/**
 * Busca AO VIVO na Shopee — só usada na página `/busca`, como
 * complemento aos resultados curados (site_catalog). O cliente que
 * pesquisa já quer comprar; se não temos o produto publicado/validado,
 * perder a venda é pior do que mostrar um resultado que não passou pelo
 * placar completo do Growth OS. Ainda assim aplica um filtro leve
 * (nota/vendas) pra não deixar passar vendedor claramente ruim.
 */
import { searchProductsByKeyword } from "../shopee/queries";
import { ShopeeProductOffer, ShopeeSortType } from "../shopee/types";
import { SortOption } from "./sort";
import { getDb } from "../db/client";
import { persistOfferSnapshot } from "../db/snapshots";
import { buildProductSlug } from "./slug";

export interface LiveProduct {
  itemId: string;
  productName: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number | null;
  ratingStar: number | null;
  sales: number | null;
  offerLink: string;
}

const MAX_RESULTS = 12;

/** Nota abaixo de 4 com pelo menos uma avaliação real = fora. Sem nota
 * ainda (0) passa — produto novo não é a mesma coisa que produto ruim. */
function isDecentOffer(offer: ShopeeProductOffer): boolean {
  const rating = Number(offer.ratingStar);
  return !(Number.isFinite(rating) && rating > 0 && rating < 4);
}

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "para", "pra", "em", "a", "o",
  "as", "os", "um", "uma", "sem", "no", "na",
]);

/** A busca por palavra-chave da Shopee às vezes acha o termo em qualquer
 * parte (descrição, tag) e devolve acessório/peça avulsa em vez do produto
 * em si (ex: buscar "impressora térmica" trouxe "caneta de limpeza de
 * cabeça de impressão"). Exige que pelo menos uma palavra significativa da
 * busca apareça de verdade no título — filtro simples, mas evita a maior
 * parte do lixo fora de contexto sem arriscar cortar resultado bom. */
export function isRelevantTitle(term: string, productName: string): boolean {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return true; // termo curto/genérico demais pra filtrar com segurança
  const title = productName.toLowerCase();
  return words.some((w) => title.includes(w));
}

function mapOffer(offer: ShopeeProductOffer): LiveProduct {
  return {
    itemId: offer.itemId,
    productName: offer.productName,
    imageUrl: offer.imageUrl,
    priceMin: Number(offer.priceMin),
    priceDiscountRate: offer.priceDiscountRate ?? null,
    ratingStar: offer.ratingStar ? Number(offer.ratingStar) : null,
    sales: offer.sales ?? null,
    offerLink: offer.offerLink,
  };
}

/** A API da Shopee não tem sortType pra "melhor avaliação" — nesse caso
 * pede em relevância e reordena no nosso lado pelos que vieram. */
function toShopeeSortType(sort: SortOption): ShopeeSortType {
  switch (sort) {
    case "vendidos":
      return ShopeeSortType.ITEM_SOLD_DESC;
    case "preco":
      return ShopeeSortType.PRICE_ASC;
    default:
      return ShopeeSortType.RELEVANCE_DESC;
  }
}

// Achado real (Heber, 2026-09-25): "o ideal é salvar no nosso catálogo
// sempre que alguém pesquisa e tem apenas na shopee direto". Até aqui,
// resultado de busca ao vivo era 100% efêmero -- aparecia na hora,
// nunca virava produto de verdade (sem categoria, sem página própria,
// sem entrar em "Veja também"/"Mais vendidos"/sitemap). Quem pesquisa
// já demonstrou intenção de compra real; isso é sinal de demanda melhor
// que qualquer critério algorítmico dos crons de sourcing. Publica os
// resultados relevantes (mesmo filtro que já era mostrado ao usuário)
// como produto normal -- reaproveita persistOfferSnapshot (upsert por
// shopee_item_id, já cuida de categoria via guessCategorySlug) e só
// falta slug + site_published, que os outros pipelines (ex.
// matchAndLinkShopee em source-awin) fazem separado, então faz aqui
// também. Idempotente: primeiro filtra quem já existe (por
// shopee_item_id) pra nunca reprocessar/duplicar buscas repetidas do
// mesmo termo -- na maioria das buscas isso já é zero trabalho.
async function persistNewLiveOffers(offers: ShopeeProductOffer[]): Promise<void> {
  if (offers.length === 0) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const db = getDb();
    const itemIds = offers.map((o) => o.itemId);
    const { data: existing, error } = await db.from("products").select("shopee_item_id").in("shopee_item_id", itemIds);
    if (error) throw new Error(error.message);
    const known = new Set((existing ?? []).map((r) => String(r.shopee_item_id)));
    const toPublish = offers.filter((o) => !known.has(o.itemId));
    if (toPublish.length === 0) return;

    // Em paralelo (não sequencial) -- cada item é independente, e a
    // busca já tá esperando a Shopee responder; serializar N upserts só
    // pra empilhar latência em cima da latência não ajuda ninguém.
    await Promise.all(
      toPublish.map(async (offer) => {
        try {
          const { productId } = await persistOfferSnapshot(offer);
          const slug = buildProductSlug(offer.productName, offer.itemId);
          await db.from("products").update({ slug, site_published: true, updated_at: new Date().toISOString() }).eq("id", productId);
        } catch (err) {
          // Um item ruim (ex. slug colidindo) não pode derrubar a busca
          // nem os outros itens da mesma leva -- só fica de fora dessa vez.
          console.error(`[busca] falha ao publicar resultado ao vivo ${offer.itemId}:`, err);
        }
      })
    );
  } catch (err) {
    console.error("[busca] falha ao persistir resultados ao vivo:", err);
  }
}

export async function searchShopeeLive(term: string, sort: SortOption = "relevancia"): Promise<LiveProduct[]> {
  if (term.trim().length < 2) return [];
  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) return [];

  try {
    const offers = await searchProductsByKeyword({
      keyword: term.trim(),
      limit: 20,
      sortType: toShopeeSortType(sort),
    });
    const relevant = offers.filter(isDecentOffer).filter((offer) => isRelevantTitle(term, offer.productName));
    await persistNewLiveOffers(relevant);
    let products = relevant.map(mapOffer);
    if (sort === "avaliacao") {
      products = products.sort((a, b) => (b.ratingStar ?? 0) - (a.ratingStar ?? 0));
    }
    return products.slice(0, MAX_RESULTS);
  } catch (err) {
    console.error("[busca] Falha na busca ao vivo na Shopee:", err);
    return [];
  }
}
