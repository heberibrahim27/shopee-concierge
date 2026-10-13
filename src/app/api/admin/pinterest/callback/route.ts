import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../../middleware";
import { exchangeCodeAndSave } from "../../../../../lib/pinterest/auth";

export const runtime = "nodejs";

/** Retorno do Pinterest: confere o `state`, troca o code pelo token e salva. */
export async function GET(request: NextRequest) {
  const back = (msg: string, key: "ok" | "erro") => {
    const res = NextResponse.redirect(new URL(`/admin/pinterest?${key}=${encodeURIComponent(msg)}`, request.url));
    res.cookies.delete({ name: "dc_pin_state", path: "/api/admin/pinterest" });
    return res;
  };

  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.redirect(new URL("/admin/login?from=/admin/pinterest", request.url));
  }
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(`Pinterest recusou: ${params.get("error_description") ?? params.get("error")}`, "erro");

  const state = params.get("state");
  const expected = request.cookies.get("dc_pin_state")?.value;
  if (!state || !expected || state !== expected) return back("State inválido -- refaça a conexão.", "erro");

  const code = params.get("code");
  if (!code) return back("Pinterest não devolveu o code.", "erro");
  try {
    await exchangeCodeAndSave(code);
    return back("Pinterest conectado.", "ok");
  } catch (err: any) {
    return back(String(err?.message ?? err).slice(0, 300), "erro");
  }
}
