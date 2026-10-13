import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { isAuthedAdminRequest } from "../../../../../middleware";
import { buildAuthorizeUrl } from "../../../../../lib/pinterest/auth";

export const runtime = "nodejs";

/** Inicia o login OAuth do Pinterest (só admin logado). `state` aleatório num cookie curto anti-CSRF. */
export async function GET(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.redirect(new URL("/admin/login?from=/admin/pinterest", request.url));
  }
  let url: string;
  const state = crypto.randomBytes(16).toString("hex");
  try {
    url = buildAuthorizeUrl(state);
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/admin/pinterest?erro=${encodeURIComponent(String(err?.message ?? err))}`, request.url));
  }
  const response = NextResponse.redirect(url);
  response.cookies.set("dc_pin_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/pinterest", maxAge: 600 });
  return response;
}
