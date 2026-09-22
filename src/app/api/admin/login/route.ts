import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "../../../../middleware";
import { getExpectedPasswordHash, hashPassword } from "../../../../lib/admin/password";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const expected = await getExpectedPasswordHash();
  if (!expected || !body?.password || (await hashPassword(body.password)) !== expected) {
    return NextResponse.json({ ok: false, error: "Senha incorreta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
