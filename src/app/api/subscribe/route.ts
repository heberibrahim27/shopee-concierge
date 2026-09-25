import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Captura de e-mail própria (Fase 1 do plano de receita) -- ainda não
 * envia nada, só coleta. Público, sem autenticação.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    const sourcePage = typeof body?.sourcePage === "string" ? body.sourcePage.slice(0, 300) : null;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "e-mail inválido" }, { status: 400 });
    }

    const db = getDb();
    const { error } = await db
      .from("email_subscribers")
      .upsert({ email, source_page: sourcePage }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[subscribe] falha ao registrar:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
