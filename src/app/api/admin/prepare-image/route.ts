import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { isAuthedAdminRequest } from "../../../../middleware";
import { isAllowedProductImageUrl } from "../../../../lib/admin/allowedImageHosts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Heber: "tô tendo que pegar a foto que puxa da Shopee e mandar o
 * ChatGPT ajustar para o Flow não alucinar" — automatiza esse passo
 * manual. Isola o produto, remove selo/badge/marca d'água/fundo poluído
 * que a foto crua do catálogo (Shopee/Awin) costuma ter, sem inventar
 * nem alterar nenhuma característica real do produto (mesmo invariante
 * de fidelidade já usado na Skill09/prompt de vídeo).
 *
 * Utilitário de conveniência, fora do pipeline formal da Skill09 (que
 * continua NOT_IMPLEMENTED — aguarda revisão externa Fable/Astra antes
 * de virar parte do kernel). Não persiste nada, não gera hash/artifact,
 * não conta como ProductVisualReferenceSet — é só uma foto auxiliar pra
 * colar na ferramenta externa.
 */
const EDIT_PROMPT =
  "Isole apenas o produto principal desta foto de e-commerce. Remova qualquer selo, badge de desconto, texto sobreposto, marca d'água, elemento promocional ou colagem de variantes. Coloque o produto sozinho, centralizado, contra um fundo neutro e limpo (estúdio, levemente desfocado ou liso). Mantenha EXATAMENTE a cor, formato, proporções, botões e todos os detalhes visíveis do produto original — não invente, não altere e não complete nenhuma parte não visível. Imagem nítida e bem iluminada.";

export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY não configurada" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const imageUrl = body?.imageUrl as string | undefined;
  if (!imageUrl) return NextResponse.json({ ok: false, error: "imageUrl ausente" }, { status: 400 });
  if (!isAllowedProductImageUrl(imageUrl)) return NextResponse.json({ ok: false, error: "domínio de imagem não permitido" }, { status: 400 });

  const upstream = await fetch(imageUrl);
  if (!upstream.ok) return NextResponse.json({ ok: false, error: "não deu pra baixar a foto original agora" }, { status: 502 });
  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const originalBytes = Buffer.from(await upstream.arrayBuffer());

  try {
    const client = new OpenAI({ apiKey });
    const file = await toFile(originalBytes, "produto.png", { type: contentType });
    const result = await client.images.edit({ model: "gpt-image-1", image: file, prompt: EDIT_PROMPT, size: "1024x1024" });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ ok: false, error: "provedor de imagem não devolveu resultado" }, { status: 502 });
    return NextResponse.json({ ok: true, dataUrl: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error("[prepare-image] erro ao chamar OpenAI images.edit:", err);
    return NextResponse.json({ ok: false, error: "não deu pra preparar a imagem agora, tenta de novo" }, { status: 502 });
  }
}
