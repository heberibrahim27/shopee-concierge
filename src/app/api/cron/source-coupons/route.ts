import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const PUBLISHER_ID = "2596713";

/**
 * Ingestão automática de cupons/promoções reais via Awin Promotions API
 * (endpoint real confirmado ao vivo 2026-09-22, ver CONTINUIDADE.md —
 * POST https://api.awin.com/publisher/{id}/promotions, filtro
 * membership:"joined" = só anunciantes onde já somos aprovados).
 * Substitui o processo manual anterior (coupons.ts comentava "atualizado
 * manualmente por ora" — script de ingestão fora do repo).
 *
 * Pedido do Heber (2026-09-21/22): checar se existe cupom de frete
 * grátis. Investigação real confirmou que NÃO existe esse campo na API
 * nem no dashboard de afiliados da Shopee (schema GraphQL sem
 * voucher/coupon/frete, dashboard sem seção de cupom). Os únicos cupons
 * reais disponíveis hoje são os da Awin (desconto percentual, achados
 * aqui) — mapeamos platform pelo advertiserId conhecido pra manter
 * consistência com o resto do site.
 */
const ADVERTISER_PLATFORM: Record<number, string> = {
  17652: "nike",
  17698: "olympikus",
  17729: "kabum",
};

type AwinPromotion = {
  promotionId: number;
  type: string;
  advertiser: { id: number; name: string; joined: boolean };
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  url: string;
  urlTracking: string;
  voucher?: { code: string; exclusive: boolean; attributable: boolean } | null;
};

async function fetchAllPromotions(token: string): Promise<AwinPromotion[]> {
  const all: AwinPromotion[] = [];
  for (let page = 1; page <= 10; page++) {
    const resp = await fetch(`https://api.awin.com/publisher/${PUBLISHER_ID}/promotions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { membership: "joined", type: "all" }, pagination: { page, pageSize: 100 } }),
    });
    if (!resp.ok) throw new Error(`Awin promotions falhou: HTTP ${resp.status}`);
    const json = (await resp.json()) as { data?: AwinPromotion[] };
    const rows = json.data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.AWIN_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "AWIN_API_TOKEN não configurada" }, { status: 500 });
  }

  let promotions: AwinPromotion[];
  try {
    promotions = await fetchAllPromotions(token);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const active = promotions.filter((p) => p.status === "active");
  const nowIso = new Date().toISOString();
  const rows = active.map((p) => ({
    promotion_id: p.promotionId,
    advertiser_id: p.advertiser.id,
    advertiser_name: p.advertiser.name,
    platform: ADVERTISER_PLATFORM[p.advertiser.id] ?? null,
    title: p.title,
    description: p.description || null,
    code: p.voucher?.code ?? null,
    url_tracking: p.urlTracking,
    starts_at: p.startDate || null,
    ends_at: p.endDate || null,
    status: "active",
    fetched_at: nowIso,
  }));

  const db = getDb();
  const { error } = await db.from("coupons").upsert(rows, { onConflict: "promotion_id" });
  if (error) {
    return NextResponse.json({ ok: false, error: `upsert falhou: ${error.message}` }, { status: 500 });
  }

  // Expira (marca inactive) cupons que já não vêm mais como "active" na Awin.
  const activeIds = active.map((p) => p.promotionId);
  if (activeIds.length > 0) {
    await db.from("coupons").update({ status: "expired" }).eq("status", "active").not("promotion_id", "in", `(${activeIds.join(",")})`);
  }

  return NextResponse.json({ ok: true, coletados: promotions.length, ativos: rows.length });
}
