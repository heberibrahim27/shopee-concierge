import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../../middleware";
import { isAllowedProductImageUrl } from "../../../../../lib/admin/allowedImageHosts";

export const dynamic = "force-dynamic";

/**
 * Proxy de download da foto real do produto (Skill09/orchestrator).
 * Necessário porque a imagem vem de um domínio de terceiro (cross-origin)
 * — o atributo `download` do HTML não força o download em mobile
 * Safari/Chrome pra recursos cross-origin sem CORS liberado; um
 * download real via nosso próprio backend (Content-Disposition) sempre
 * funciona. Restrito à allowlist de hosts reais de produto — nunca vira
 * um proxy aberto pra qualquer URL (risco de SSRF).
 */

export async function GET(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false, error: "url ausente" }, { status: 400 });
  if (!isAllowedProductImageUrl(url)) return NextResponse.json({ ok: false, error: "domínio não permitido" }, { status: 400 });

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: "não deu pra baixar a imagem agora" }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const extension = contentType.includes("png") ? "png" : "jpg";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="produto.${extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
