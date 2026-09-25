import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";
import { shortenLomadeeUrl } from "../../../lib/lomadee/client";

export const runtime = "nodejs";

/**
 * Clique num resultado ao vivo da Lomadee (página /busca). A API de
 * produtos da Lomadee não devolve link de afiliado pronto — cada URL
 * precisa de 1 POST /affiliate/shortener/url. Gerar isso pra cada
 * resultado exibido estouraria o limite real de 60 req/min da chave;
 * gerar só no clique custa 1 chamada por clique de verdade.
 *
 * `/go/lomadee?u=<url da loja>&org=<organizationId>&n=<nome>&s=<slug da loja>`
 *  1. valida (https, organizationId com cara de UUID, sem redirecionar pro
 *     próprio site);
 *  2. encurta via Lomadee (cache em memória por instância — clique
 *     repetido no mesmo produto não gasta chamada nova);
 *  3. registra em click_events (mesma tabela do /go);
 *  4. 302 pro link de afiliado. Se a Lomadee recusar (marca restrita pro
 *     nosso canal) ou falhar, redireciona pra URL crua da loja: a pessoa
 *     ainda chega no produto, só não gera comissão — registrado com
 *     platform "lomadee-sem-link" pra dar pra medir quanto isso acontece.
 */
const UUID_LIKE = /^[0-9a-f-]{20,64}$/i;
const shortLinkCache = new Map<string, string>();

function isValidTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname.endsWith("descontochegando.com.br")) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolveAffiliateLink(organizationId: string, url: string): Promise<string | null> {
  const cacheKey = `${organizationId}|${url}`;
  const cached = shortLinkCache.get(cacheKey);
  if (cached) return cached;

  try {
    const result = await shortenLomadeeUrl({ organizationId, type: "Custom", url });
    const short = result[0]?.shortUrls?.[0] ?? null;
    if (short) shortLinkCache.set(cacheKey, short);
    return short;
  } catch (err) {
    console.error("[go/lomadee] shortener falhou:", err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = params.get("u");
  const organizationId = params.get("org") ?? "";
  const productName = params.get("n")?.slice(0, 200) || null;
  const storeSlug = params.get("s")?.slice(0, 40) || null;

  if (!target || !isValidTarget(target) || !UUID_LIKE.test(organizationId)) {
    return NextResponse.json({ ok: false, error: "destino inválido" }, { status: 400 });
  }

  const affiliateLink = process.env.LOMADEE_API_KEY
    ? await resolveAffiliateLink(organizationId, target)
    : null;

  // Aguarda o insert antes de redirecionar (mesma razão do /go: função
  // serverless pode congelar assim que a resposta sai).
  try {
    const db = getDb();
    await db.from("click_events").insert({
      platform: affiliateLink ? (storeSlug ?? "lomadee") : "lomadee-sem-link",
      product_slug: null,
      product_name: productName,
      source: "busca-lomadee",
    });
  } catch (err) {
    console.error("[go/lomadee] falha ao registrar clique:", err);
  }

  return NextResponse.redirect(affiliateLink ?? target, { status: 302 });
}
