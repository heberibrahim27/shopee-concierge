import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { runWorkerPass } from "../../../../modules/video-machine/kernel/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fase 1: NÃO registrado em vercel.json ainda — só chamada manual/teste,
// até o kernel estar provado (ver plano de implementação). Mesmo padrão
// de auth dos crons existentes (src/app/api/cron/publish-product).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && authHeader !== expected) {
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
