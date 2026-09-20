import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { runWorkerPass } from "../../../../modules/video-machine/kernel/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fase 1: NÃO registrado em vercel.json ainda — só chamada manual/teste,
// até o kernel estar provado (ver plano de implementação). Mesmo padrão
// de auth dos crons existentes (src/app/api/cron/publish-product).
export async function GET(request: NextRequest) {
  // Fail-closed (achado real SEC-025-CRON-PRODUCTION-AUTH, ver
  // CONTINUIDADE.md "Security findings rastreados"): CRON_SECRET
  // ausente agora REJEITA, nunca libera a rota sem autenticação.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId obrigatório" }, { status: 400 });
  }

  const db = getDbFresh();
  const result = await runWorkerPass(db, { tenantId });
  return NextResponse.json(result);
}
