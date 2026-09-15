import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";
import { isAuthedAdminRequest } from "../../../middleware";

/**
 * Registra um clique num link de afiliado (Shopee/Mercado Livre/etc) —
 * chamado via sendBeacon no cliente (ver TrackedOfferLink.tsx) no exato
 * momento do clique, antes de abrir o link em nova aba. Fire-and-forget:
 * se falhar, o clique/navegação do usuário não é afetado.
 */
export async function POST(request: NextRequest) {
  try {
    if (await isAuthedAdminRequest(request)) return NextResponse.json({ ok: true, skipped: true });

    const body = await request.json().catch(() => null);
    const platform = typeof body?.platform === "string" ? body.platform.slice(0, 40) : null;
    if (!platform) return NextResponse.json({ ok: false }, { status: 400 });
    const productSlug = typeof body?.productSlug === "string" ? body.productSlug.slice(0, 200) : null;
    const productName = typeof body?.productName === "string" ? body.productName.slice(0, 300) : null;
    const source = typeof body?.source === "string" ? body.source.slice(0, 40) : null;

    const db = getDb();
    await db.from("click_events").insert({ platform, product_slug: productSlug, product_name: productName, source });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[track-click] falha ao registrar:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
