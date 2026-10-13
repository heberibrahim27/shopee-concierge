import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../../middleware";
import { publishNextPin } from "../../../../../lib/pinterest/publishNext";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Botão "Criar Pin de teste" do /admin/pinterest: publica 1 Pin no board escolhido. */
export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.redirect(new URL("/admin/login?from=/admin/pinterest", request.url), 303);
  }
  const form = await request.formData();
  const boardId = String(form.get("board_id") ?? "").trim();
  const go = (key: "ok" | "erro", msg: string) =>
    NextResponse.redirect(new URL(`/admin/pinterest?${key}=${encodeURIComponent(msg)}`, request.url), 303);
  if (!boardId) return go("erro", "Escolha um board.");

  const result = await publishNextPin({ boardId });
  if (!result.ok) return go("erro", result.error.slice(0, 300));
  if ("skipped" in result) return go("erro", result.reason);
  if ("pinId" in result) return go("ok", `Pin criado (id ${result.pinId}): ${result.produto.slice(0, 80)}`);
  return go("erro", "Resultado inesperado.");
}
