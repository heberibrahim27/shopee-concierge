import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "../../../../middleware";

async function cookieValue(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password + "::dc-admin-salt");
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Buffer.from(digest).toString("hex");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const password = process.env.ADMIN_PASSWORD;
  if (!password || body?.password !== password) {
    return NextResponse.json({ ok: false, error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, await cookieValue(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
