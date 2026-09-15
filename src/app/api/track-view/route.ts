import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";
import { isAuthedAdminRequest } from "../../../middleware";

/**
 * Registra uma visualização de página — chamado via sendBeacon no cliente
 * (ver TrackPageView.tsx), fire-and-forget, nunca deve travar a navegação.
 * Sem dado pessoal nenhum, só o caminho da página e o horário. Quem está
 * logado no /admin (o próprio dono testando o site) não conta como visita.
 */
export async function POST(request: NextRequest) {
  try {
    if (await isAuthedAdminRequest(request)) return NextResponse.json({ ok: true, skipped: true });

    const body = await request.json().catch(() => null);
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : null;
    if (!path) return NextResponse.json({ ok: false }, { status: 400 });

    const db = getDb();
    await db.from("page_views").insert({ path });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[track-view] falha ao registrar:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
