import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { listShopeeOffers } from "../../../../lib/shopee/queries";
import { ShopeeOffer } from "../../../../lib/shopee/types";
import { slugify } from "../../../../lib/site/slug";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ingestão diária das promoções oficiais da Shopee (shopeeOfferV2) na
 * tabela `coupons`, como platform "shopee" e sem código -- vira card
 * "Aproveitar" em /cupons e /cupom/shopee, com link de afiliado já
 * atribuído (comissão igual à de produto). Pergunta do Heber
 * (2026-09-26): "cupom Shopee conseguimos postar como?" -- é assim que a
 * Cuponomia faz ("Ver Desconto", sem código).
 *
 * `?dry=1` devolve a resposta crua da API sem gravar nada -- primeiro
 * passo depois do deploy, porque esta query não foi exercitada com a
 * chave real nesta sessão.
 */
const MAX_PAGES = 3;
const PAGE_SIZE = 50;

function offerKey(o: ShopeeOffer): string {
  const id = o.collectionId ?? o.categoryId ?? slugify(o.offerName);
  return `shopee:${o.offerType}:${id}`;
}

// Achado real (Heber, 2026-09-25, print do cupom Shopee: "Válido até
// 31/12/2999"): a API devolve periodEndTime=32503651199 pra promoção
// sem data de fim de verdade -- sentinela "sem fim", igual em espírito
// ao marcador de +366 dias da Awin (ver isAwinOpenEnded em
// couponRules.ts), só que aqui é uma data literalmente absurda em vez
// de "hoje + 1 ano". Qualquer epoch que caia depois do ano 2900 é
// tratado como "sem data real" -- vira null, não aparece pro usuário.
const NO_REAL_DATE_THRESHOLD_SEC = Date.UTC(2900, 0, 1) / 1000;

function epochToIso(v: number | undefined): string | null {
  if (!v || v <= 0) return null;
  if (v >= NO_REAL_DATE_THRESHOLD_SEC) return null;
  return new Date(v * 1000).toISOString();
}

function isCurrent(o: ShopeeOffer, nowSec: number): boolean {
  if (!o.offerLink || !o.offerName) return false;
  if (o.periodEndTime && o.periodEndTime > 0 && o.periodEndTime < nowSec) return false;
  if (o.periodStartTime && o.periodStartTime > nowSec + 86400) return false; // só começa depois de amanhã
  return true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) {
    return NextResponse.json({ ok: false, error: "SHOPEE_APP_ID / SHOPEE_SECRET não configurados" }, { status: 500 });
  }

  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const offers: ShopeeOffer[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { nodes, hasNextPage } = await listShopeeOffers({ page, limit: PAGE_SIZE, sortType: 1 });
      offers.push(...nodes);
      if (!hasNextPage || nodes.length === 0) break;
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const current = offers.filter((o) => isCurrent(o, nowSec));
  // Dedupe pela chave (a API pode repetir a mesma coleção em páginas diferentes).
  const byKey = new Map<string, ShopeeOffer>();
  for (const o of current) if (!byKey.has(offerKey(o))) byKey.set(offerKey(o), o);

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, coletados: offers.length, atuais: byKey.size, amostra: offers.slice(0, 5) });
  }

  const nowIso = new Date().toISOString();
  const rows = Array.from(byKey.entries()).map(([key, o]) => ({
    shopee_offer_key: key,
    advertiser_name: "Shopee",
    platform: "shopee",
    title: o.offerName,
    description: null,
    code: null,
    url_tracking: o.offerLink,
    starts_at: epochToIso(o.periodStartTime),
    ends_at: epochToIso(o.periodEndTime),
    status: "active",
    fetched_at: nowIso,
  }));

  const db = getDb();
  if (rows.length > 0) {
    const { error } = await db.from("coupons").upsert(rows, { onConflict: "shopee_offer_key" });
    if (error) return NextResponse.json({ ok: false, error: `upsert falhou: ${error.message}` }, { status: 500 });
  }

  // Expira promoções Shopee que já não vêm mais da API (mesma lógica dos
  // crons Awin/Lomadee, restrita às linhas com shopee_offer_key).
  const activeKeys = rows.map((r) => r.shopee_offer_key);
  const expireQuery = db.from("coupons").update({ status: "expired" }).eq("status", "active").not("shopee_offer_key", "is", null);
  const { error: expireError } =
    activeKeys.length > 0
      ? await expireQuery.not("shopee_offer_key", "in", `(${activeKeys.map((k) => `"${k}"`).join(",")})`)
      : await expireQuery;
  if (expireError) console.error("[source-shopee-offers] expirar falhou:", expireError.message);

  return NextResponse.json({ ok: true, coletados: offers.length, ativos: rows.length });
}
