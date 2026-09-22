import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../middleware";
import { getDbFresh } from "../../../../lib/db/client";
import { runVideoMachineOnce } from "../../../../modules/video-machine/orchestrator/runOnce";
import { computeHotCategory } from "../../../../modules/video-machine/orchestrator/opportunityScorer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Heber: "eu quando tô no PC vou fazendo as coisas minhas e criando
// reels" — um candidato por clique era fricção desnecessária. Gera até
// MAX_COUNT candidatos numa chamada só; o reuse_policy=COOLDOWN da
// Skill04 (já existente) garante produto diferente a cada iteração do
// loop, sem lógica nova de exclusão aqui. Subiu de 8 pra 20 (2026-09-22,
// "a maquina só permite até 8 videos") — maxDuration junto de 180→300s
// pra caber o lote maior (Vercel Pro suporta até 300s).
const MAX_COUNT = 20;

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const requestedCount = Math.max(1, Math.min(MAX_COUNT, Number(body?.count) || 1));

  const db = getDbFresh();
  const hotCategory = await computeHotCategory(db).catch(() => null);

  const results: unknown[] = [];
  const failures: Array<{ stage: string; errorCode: string }> = [];

  for (let i = 0; i < requestedCount; i++) {
    try {
      // Sinal de demanda só faz sentido pro primeiro candidato — do
      // segundo em diante já queremos variedade normal, não repetir a
      // mesma categoria quente N vezes na mesma leva.
      const result = await runVideoMachineOnce(db, undefined, i === 0 ? hotCategory : null);
      if (result.outcome !== "READY") {
        failures.push({ stage: result.stage, errorCode: result.errorCode });
        continue;
      }
      results.push(result);
    } catch (err) {
      console.error("[video-machine-run] erro inesperado num candidato do lote:", err);
      failures.push({ stage: "unknown", errorCode: "UNEXPECTED_ERROR" });
    }
  }

  if (results.length === 0) {
    const last = failures[failures.length - 1];
    return NextResponse.json({ ok: false, stage: last?.stage ?? "unknown", errorCode: last?.errorCode ?? "NO_CANDIDATE" }, { status: 200 });
  }
  return NextResponse.json({ ok: true, results, failedCount: failures.length });
}
