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
// loop, sem lógica nova de exclusão aqui.
//
// Achado real (2026-09-22): subi pra 20 sem medir o custo real por
// candidato — cada um leva ~24s (medido: 2 candidatos = 47,7s), 20
// levaria uns 8min, estourando o teto de 300s do servidor. O Heber
// ficou 30min com a tela travada esperando. Voltei pra um número que
// cabe de verdade com margem (10 × ~25-30s ≈ 250-300s no pior caso).
// Rodar em paralelo resolveria o tempo, mas quebraria o dedup do
// reuse_policy=COOLDOWN (duas chamadas concorrentes podiam escolher o
// mesmo produto antes de qualquer uma gravar evidência de uso) — não
// arriscar isso sem resolver a condição de corrida primeiro.
const MAX_COUNT = 10;

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const requestedCount = Math.max(1, Math.min(MAX_COUNT, Number(body?.count) || 1));
  // Filtro manual de categoria (Heber, 2026-09-22: "eu preciso de
  // brinquedos para fazer reels e só me vem umidificador..."). Reusa o
  // mesmo mecanismo `allowedCategorySlugs` já existente pro
  // Opportunity Scorer — aqui é escolha explícita do Heber, não sinal
  // de demanda automático, então vale pra TODOS os candidatos do lote
  // (o hotCategory automático só valia pro 1º, de propósito).
  const manualCategorySlug = typeof body?.categorySlug === "string" && body.categorySlug.trim() ? body.categorySlug.trim() : null;

  const db = getDbFresh();
  const hotCategory = manualCategorySlug ? null : await computeHotCategory(db).catch(() => null);

  const results: unknown[] = [];
  const failures: Array<{ stage: string; errorCode: string }> = [];

  for (let i = 0; i < requestedCount; i++) {
    try {
      const forcedCategory = manualCategorySlug
        ? { categorySlug: manualCategorySlug, distinctSearchers: 0, sampleProductNames: [] }
        : // Sinal de demanda automático só faz sentido pro primeiro
          // candidato — do segundo em diante já queremos variedade
          // normal, não repetir a mesma categoria quente N vezes na
          // mesma leva.
          i === 0
          ? hotCategory
          : null;
      const result = await runVideoMachineOnce(db, undefined, forcedCategory);
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
