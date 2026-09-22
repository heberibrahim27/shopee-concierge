import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../middleware";
import { getDbFresh } from "../../../../lib/db/client";
import { runVideoMachineOnce } from "../../../../modules/video-machine/orchestrator/runOnce";
import { computeHotCategory } from "../../../../modules/video-machine/orchestrator/opportunityScorer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDbFresh();
  try {
    const hotCategory = await computeHotCategory(db).catch(() => null);
    const result = await runVideoMachineOnce(db, undefined, hotCategory);
    if (result.outcome !== "READY") {
      return NextResponse.json({ ok: false, stage: result.stage, errorCode: result.errorCode }, { status: 200 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[video-machine-run] erro inesperado:", err);
    return NextResponse.json({ ok: false, error: "erro inesperado, ver logs" }, { status: 200 });
  }
}
