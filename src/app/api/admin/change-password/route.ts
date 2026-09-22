import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest, ADMIN_COOKIE_NAME } from "../../../../middleware";
import { hashPassword, setStoredPasswordHash } from "../../../../lib/admin/password";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  await setStoredPasswordHash(newHash);

  // Já loga a sessão atual com o hash novo, pra não derrubar quem
  // acabou de trocar a própria senha.
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, newHash, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
