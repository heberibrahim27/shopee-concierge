import { NextRequest, NextResponse } from "next/server";
import { getExpectedPasswordHash } from "./lib/admin/password";

/**
 * Protege /admin/* com senha simples (temporária, ver CONTINUIDADE.md).
 * Cookie = o próprio hash esperado (ver lib/admin/password.ts) — sem
 * biblioteca de sessão, só pra travar acesso não autorizado ao painel
 * interno enquanto não existe autenticação de verdade (login por
 * e-mail, etc).
 */
export const ADMIN_COOKIE_NAME = "dc_admin_session";

/** Usado por rotas /api/admin/* que não passam pelo matcher do middleware
 * (ele só cobre /admin/*) mas ainda assim fazem ação real e não podem
 * ficar abertas — ver src/app/api/admin/revalidate-links/route.ts. */
export async function isAuthedAdminRequest(request: NextRequest): Promise<boolean> {
  const expected = await getExpectedPasswordHash();
  if (!expected) return false;
  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return cookie === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const expected = await getExpectedPasswordHash();
  if (!expected) return NextResponse.next(); // sem senha configurada, não bloqueia (evita lockout em dev)

  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (cookie === expected) return NextResponse.next();

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
