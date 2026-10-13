import { NextRequest, NextResponse } from "next/server";
import { listBoards } from "../../../../lib/pinterest/client";
import { hasAnyPinterestToken } from "../../../../lib/pinterest/auth";
import { publishNextPin } from "../../../../lib/pinterest/publishNext";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Publica 1 Pin por execução apontando pra PÁGINA DO PRODUTO no nosso site
 * (não direto pro merchant) -- o Pinterest desencoraja afiliado repetitivo
 * em volume e o valor real está na comparação/histórico que o site mostra.
 * Fica FORA do vercel.json até existir login OAuth (/admin/pinterest) e
 * PINTEREST_BOARD_ID; sem eles responde 200 "skipped" em vez de falhar.
 *
 * ?dryRun=1 mostra o Pin que sairia sem publicar.
 * ?boards=1 lista os boards da conta (pra descobrir o PINTEREST_BOARD_ID).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await hasAnyPinterestToken())) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Pinterest não conectado (/admin/pinterest)" });
  }

  if (request.nextUrl.searchParams.get("boards") === "1") {
    try {
      return NextResponse.json({ ok: true, boards: await listBoards() });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
    }
  }

  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!boardId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "PINTEREST_BOARD_ID ausente (use ?boards=1 pra listar)" });
  }

  const result = await publishNextPin({ boardId, dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
