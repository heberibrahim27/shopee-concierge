import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../lib/db/client";

export const runtime = "nodejs";

/**
 * Redirecionador de clique de afiliado -- fecha o buraco real que o
 * ChatGPT apontou na revisão do plano de receita (2026-09-25, ver
 * project_business_plan_artifact na memória): hoje o link do Instagram
 * e do WhatsApp vai DIRETO pra Shopee/Awin/etc, pulando qualquer registro
 * nosso -- só clique que passa pela própria página de produto do site
 * é medido (click_events, via TrackedOfferLink.tsx). Isso trocava
 * "canal → clique → comissão" por um buraco preto pra tudo que sai de
 * rede social direto.
 *
 * `/go?u=<url>&src=<canal>&p=<slug ou nome>&pl=<plataforma>` registra o
 * clique (mesma tabela click_events) e redireciona (302) pro link real.
 * `u` só pode apontar pros domínios reais de afiliado já usados no
 * catálogo (confirmado via query real 2026-09-25) -- qualquer outro
 * domínio é recusado, pra não virar redirecionador aberto.
 */
const ALLOWED_DOMAINS = [
  "s.shopee.com.br",
  "shopee.com.br",
  "www.awin1.com",
  "awin1.com",
  "meli.la",
  "mercadolivre.com.br",
  "lmdee.link",
];

function isAllowedTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u");
  const source = request.nextUrl.searchParams.get("src")?.slice(0, 40) || "unknown";
  const productSlug = request.nextUrl.searchParams.get("p")?.slice(0, 200) || null;
  const platform = request.nextUrl.searchParams.get("pl")?.slice(0, 40) || null;

  if (!target || !isAllowedTarget(target)) {
    return NextResponse.json({ ok: false, error: "destino inválido" }, { status: 400 });
  }

  // Aguarda o insert (rápido, uma linha só) antes de redirecionar --
  // função serverless pode ser congelada assim que a resposta sai, então
  // "fire and forget" de verdade arrisca perder o registro em silêncio.
  try {
    const db = getDb();
    await db.from("click_events").insert({
      platform: platform ?? "unknown",
      product_slug: productSlug,
      product_name: null,
      source,
    });
  } catch (err) {
    console.error("[go] falha ao registrar clique:", err);
  }

  return NextResponse.redirect(target, { status: 302 });
}
