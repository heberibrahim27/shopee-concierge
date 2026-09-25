import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";

/**
 * Recebe sugestão de melhoria enviada por visitante real (widget flutuante
 * no site) -- pedido do Heber (2026-09-25): a busca de melhorias não pode
 * depender só da minha pesquisa, tem que ter ideia vindo de gente de fora
 * também. Público, sem autenticação -- qualquer visitante pode enviar.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
    const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) : null;
    const pagePath = typeof body?.pagePath === "string" ? body.pagePath.slice(0, 300) : null;

    if (!message || message.length < 5) {
      return NextResponse.json({ ok: false, error: "mensagem muito curta" }, { status: 400 });
    }

    const db = getDb();
    const { error } = await db.from("site_suggestions").insert({
      message,
      contact: contact || null,
      page_path: pagePath,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[suggestions] falha ao registrar:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
