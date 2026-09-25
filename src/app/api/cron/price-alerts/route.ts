import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { createZApiConnector } from "../../../../lib/channel/zapi";
import { getPlatformInfo } from "../../../../lib/site/platforms";
import { buildAlertTrackedLink, buildPriceDropMessage } from "../../../../lib/site/priceAlerts";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 200;

/**
 * Cron diário (vercel.json, depois dos crons de coleta): pra cada alerta
 * ativo, pega o MENOR preço atual entre o produto e os irmãos do mesmo
 * group_id (a oferta em destaque na página pode trocar de loja) e, se
 * ficou igual ou abaixo do alvo, manda UMA mensagem pela Z-API e fecha o
 * alerta (status 'sent'). Produto que saiu do ar cancela o alerta com
 * motivo, em vez de ficar pra sempre na fila.
 */
interface AlertRow {
  id: string;
  product_id: string;
  product_slug: string;
  phone: string;
  target_price: number | string;
}

interface CatalogRow {
  id: string;
  slug: string;
  product_name: string;
  platform: string;
  group_id: string | null;
  price_min: number | string | null;
  offer_link: string | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDbFresh();
  const { data: alerts, error } = await db
    .from("price_alerts")
    .select("id, product_id, product_slug, phone, target_price")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (alerts ?? []) as AlertRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, checked: 0, sent: 0, cancelled: 0 });

  const productIds = Array.from(new Set(rows.map((a) => a.product_id)));
  const { data: products, error: productsError } = await db
    .from("site_catalog")
    .select("id, slug, product_name, platform, group_id, price_min, offer_link")
    .in("id", productIds);
  if (productsError) return NextResponse.json({ ok: false, error: productsError.message }, { status: 500 });

  const byId = new Map<string, CatalogRow>();
  for (const p of (products ?? []) as CatalogRow[]) byId.set(p.id, p);

  // Irmãos de grupo (mesmo produto físico em outra loja) -- só pros
  // produtos que têm grupo, numa consulta só.
  const groupIds = Array.from(
    new Set(Array.from(byId.values()).map((p) => p.group_id).filter((g): g is string => Boolean(g)))
  );
  const siblingsByGroup = new Map<string, CatalogRow[]>();
  if (groupIds.length > 0) {
    const { data: siblings } = await db
      .from("site_catalog")
      .select("id, slug, product_name, platform, group_id, price_min, offer_link")
      .in("group_id", groupIds);
    for (const s of (siblings ?? []) as CatalogRow[]) {
      if (!s.group_id) continue;
      const list = siblingsByGroup.get(s.group_id) ?? [];
      list.push(s);
      siblingsByGroup.set(s.group_id, list);
    }
  }

  function cheapestOffer(product: CatalogRow): CatalogRow | null {
    const candidates = [product, ...(product.group_id ? siblingsByGroup.get(product.group_id) ?? [] : [])].filter(
      (c) => c.price_min !== null && c.offer_link
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, c) => (Number(c.price_min) < Number(best.price_min) ? c : best));
  }

  const zapi = process.env.ZAPI_INSTANCE_ID ? createZApiConnector() : null;
  const nowIso = new Date().toISOString();
  let sent = 0;
  let cancelled = 0;
  const failures: string[] = [];

  for (const alert of rows) {
    const product = byId.get(alert.product_id);
    if (!product) {
      await db
        .from("price_alerts")
        .update({ status: "cancelled", cancel_reason: "produto saiu do catálogo" })
        .eq("id", alert.id);
      cancelled++;
      continue;
    }

    const best = cheapestOffer(product);
    if (!best) continue;
    const currentPrice = Number(best.price_min);
    const target = Number(alert.target_price);
    if (!(currentPrice <= target)) continue;

    if (!zapi) {
      failures.push(`${alert.id}: Z-API não configurada`);
      continue;
    }

    try {
      await zapi.sendText({
        chatId: alert.phone,
        text: buildPriceDropMessage({
          productName: product.product_name,
          currentPrice,
          targetPrice: target,
          storeLabel: getPlatformInfo(best.platform).label,
          link: buildAlertTrackedLink({ offerLink: best.offer_link!, productSlug: best.slug, platform: best.platform }),
        }),
      });
      await db
        .from("price_alerts")
        .update({ status: "sent", notified_at: nowIso, notified_price: currentPrice })
        .eq("id", alert.id);
      sent++;
    } catch (err) {
      failures.push(`${alert.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, checked: rows.length, sent, cancelled, failures });
}
