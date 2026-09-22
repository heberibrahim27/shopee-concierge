import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { fetchLomadeeCampaigns, fetchLomadeeProducts, fetchLomadeeBrandById, LomadeeCampaign } from "../../../../lib/lomadee/client";
import { toCatalogItem, persistLomadeeProduct } from "../../../../lib/lomadee/ingest";
import { createDealCandidate } from "../../../../lib/db/snapshots";
import { SITE_CATEGORIES } from "../../../../lib/site/categories";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Ingestão diária da Lomadee (rede de afiliados multi-loja — Americanas,
 * Submarino, Extra, Sawary, Casa do Fitness etc., canal
 * descontochegando.com.br verificado 2026-09-22, ver CONTINUIDADE.md).
 * Duas fontes na mesma API:
 *
 * 1. Cupons/ofertas (campaigns) — já vêm com link de afiliado pronto em
 *    channels[].shortUrls (a API gera automaticamente pro nosso canal),
 *    grava na mesma tabela `coupons` que a Awin usa (coluna própria
 *    `lomadee_campaign_id`, UUID, não cabe no `promotion_id` bigint da
 *    Awin).
 * 2. Produtos (catálogo) — NÃO vem com link pronto; cada produto exige
 *    1 chamada própria em POST /affiliate/shortener/url (type:"Custom").
 *    Rate limit real da Lomadee é 60 req/60s por chave, por isso o lote
 *    de produtos é pequeno (20/execução) — 1 call de listagem + até 20
 *    calls de shortener por execução, bem dentro do limite.
 */

// Heurística leve por palavra-chave — a API de produto não devolve
// categoria confiável (campo `categories` vem vazio nos exemplos reais
// testados). "casa" é o catch-all (achadinho genérico), não uma aposta
// forte.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  eletronicos: ["fone", "celular", "notebook", "tv ", "smart tv", "carregador", "mouse", "teclado", "caixa de som", "câmera", "camera"],
  esporte: ["tênis", "tenis", "bicicleta", "bike", "academia", "musculação", "esteira", "halter"],
  beleza: ["maquiagem", "batom", "perfume", "shampoo", "creme", "skincare", "secador"],
  moda: ["camiseta", "calça", "vestido", "jaqueta", "blusa", "jeans", "bermuda"],
  infantil: ["infantil", "criança", "bebê conforto"],
  bebes: ["bebê", "bebe", "fralda", "mamadeira"],
  pet: ["cachorro", "gato", "pet ", "ração", "coleira"],
  games: ["controle", "playstation", "xbox", "console", "gamer"],
  automotivo: ["automotivo", "carro", "pneu", "farol"],
  saude: ["vitamina", "suplemento", "termômetro", "massageador"],
  ferramentas: ["furadeira", "parafusadeira", "ferramenta", "chave de fenda"],
  moveis: ["sofá", "sofa", "mesa", "cadeira", "estante", "cama box"],
};

function guessCategorySlug(productName: string): string {
  const name = productName.toLowerCase();
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => name.includes(k))) return slug;
  }
  return "casa";
}

/**
 * campaigns/products só devolvem `organizationId` (UUID) — o nome real
 * da loja (pro badge do cupom, ver CouponCard.tsx) exige uma chamada
 * própria em GET /affiliate/brands/{id}. Cache em memória por execução
 * evita repetir a chamada pra marcas que aparecem em várias campanhas.
 */
function makeBrandResolver() {
  const cache = new Map<string, { name: string; slug: string } | null>();
  return async function resolveBrand(organizationId: string): Promise<{ name: string; slug: string } | null> {
    if (cache.has(organizationId)) return cache.get(organizationId)!;
    try {
      const { data } = await fetchLomadeeBrandById(organizationId);
      const resolved = { name: data.name, slug: data.slug };
      cache.set(organizationId, resolved);
      return resolved;
    } catch {
      cache.set(organizationId, null);
      return null;
    }
  };
}

async function ingestCoupons(resolveBrand: ReturnType<typeof makeBrandResolver>) {
  const db = getDb();
  let campaigns: LomadeeCampaign[] = [];
  try {
    const resp = await fetchLomadeeCampaigns({ types: "GenericCoupon,PersonalCoupon,Offer", status: "onTime", limit: 20 });
    campaigns = resp.data;
  } catch (err) {
    return { publicados: 0, falhas: [`fetchLomadeeCampaigns: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const falhas: string[] = [];
  let publicados = 0;

  for (const c of campaigns) {
    const link = c.channels?.[0]?.shortUrls?.[0];
    if (!link) continue; // sem link pro nosso canal (marca restrita) — pula

    const brand = await resolveBrand(c.organizationId);

    const { error } = await db.from("coupons").upsert(
      {
        lomadee_campaign_id: c.id,
        lomadee_organization_id: c.organizationId,
        advertiser_name: brand?.name ?? c.name,
        platform: brand?.slug ?? "lomadee",
        title: c.name,
        description: c.description ?? null,
        code: c.code ?? null,
        url_tracking: link,
        starts_at: c.period?.startAt ?? null,
        ends_at: c.period?.endAt ?? null,
        status: "active",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lomadee_campaign_id" }
    );
    if (error) {
      falhas.push(`${c.id}: ${error.message}`);
      continue;
    }
    publicados++;
  }

  return { publicados, falhas };
}

async function ingestProducts(limit: number, resolveBrand: ReturnType<typeof makeBrandResolver>) {
  let products;
  try {
    const resp = await fetchLomadeeProducts({ isAvailable: true, limit });
    products = resp.data;
  } catch (err) {
    return { publicados: [] as string[], falhas: [`fetchLomadeeProducts: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const publicados: string[] = [];
  const falhas: string[] = [];

  for (const product of products) {
    const item = toCatalogItem(product);
    if (!item) continue;
    try {
      const categorySlug = guessCategorySlug(item.productName);
      const category = SITE_CATEGORIES.find((c) => c.slug === categorySlug)?.label ?? "Casa";
      const brand = await resolveBrand(item.organizationId);
      const persisted = await persistLomadeeProduct({ item, platform: brand?.slug ?? "lomadee", category, categorySlug });
      if (!persisted) continue; // canal restrito pra essa marca, sem link de afiliado
      await createDealCandidate({ productId: persisted.productId, offerSnapshotId: persisted.snapshotId, status: "discovered", score: 60 });
      publicados.push(item.lomadeeProductId);
    } catch (err) {
      falhas.push(`${product.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { publicados, falhas };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const resolveBrand = makeBrandResolver();
  const [coupons, products] = await Promise.all([ingestCoupons(resolveBrand), ingestProducts(20, resolveBrand)]);

  return NextResponse.json({ ok: true, coupons, products });
}
