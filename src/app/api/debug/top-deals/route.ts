/**
 * Endpoint TEMPORÁRIO de sondagem, criado em 12/09/2026 só pra buscar
 * candidatos reais de produto pro pipeline de conteúdo do Instagram
 * (@descontoschegando) sem precisar rodar nada localmente (as credenciais
 * SHOPEE_APP_ID/SHOPEE_SECRET só existem na Vercel, nunca neste ambiente).
 *
 * NÃO faz parte do fluxo do concierge — é só uma sonda manual (GET),
 * sem autenticação. Remover depois de usar (ver pendência na memória).
 * Deploy autorizado explicitamente pelo Ibrahim em 12/09/2026.
 *
 * Uso: /api/debug/top-deals?keyword=fone bluetooth&sortType=2&limit=10
 * sortType: 1=RELEVANCE_DESC (exige keyword) 2=ITEM_SOLD_DESC
 *           3=PRICE_DESC 4=PRICE_ASC 5=COMMISSION_DESC
 */
import { NextRequest, NextResponse } from "next/server";
import { searchProductsByKeyword } from "@/lib/shopee/queries";
import { ShopeeSortType } from "@/lib/shopee/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword") ?? "";
  const sortTypeParam = Number(searchParams.get("sortType") ?? "2");
  const limit = Number(searchParams.get("limit") ?? "10");

  try {
    const results = await searchProductsByKeyword({
      keyword,
      sortType: sortTypeParam as ShopeeSortType,
      limit,
    });

    const simplified = results.map((p) => ({
      itemId: p.itemId,
      productName: p.productName,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      priceDiscountRate: p.priceDiscountRate,
      sales: p.sales,
      ratingStar: p.ratingStar,
      commission: p.commission,
      commissionRate: p.commissionRate,
      imageUrl: p.imageUrl,
      offerLink: p.offerLink,
      productLink: p.productLink,
      shopName: p.shopName,
    }));

    return NextResponse.json({ ok: true, count: simplified.length, results: simplified });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
