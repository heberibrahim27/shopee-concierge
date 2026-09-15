import { NextRequest, NextResponse } from "next/server";

/**
 * Protege /admin/* com senha simples (temporária, ver CONTINUIDADE.md).
 * Cookie assinado com HMAC da própria senha — sem biblioteca de sessão,
 * só pra travar acesso não autorizado ao painel interno enquanto não
 * existe autenticação de verdade (login por e-mail, etc).
 */
export const ADMIN_COOKIE_NAME = "dc_admin_session";

async function expectedCookieValue(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password + "::dc-admin-salt");
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Buffer.from(digest).toString("hex");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  if (!password) return NextResponse.next(); // sem senha configurada, não bloqueia (evita lockout em dev)

  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const expected = await expectedCookieValue(password);
  if (cookie === expected) return NextResponse.next();

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
