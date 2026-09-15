import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "../../../../middleware";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
