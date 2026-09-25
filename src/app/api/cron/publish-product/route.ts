import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SITE_URL = "https://descontochegando.com.br";
const WINDSOR_ENDPOINT = "https://connectors.windsor.ai/instagram/actions";
// Conta @descontoschegando — ver reference_shopee_concierge_infra na memória do projeto.
const IG_ACCOUNT_ID = process.env.WINDSOR_INSTAGRAM_ACCOUNT_ID || "17841471469860803";

type Candidate = {
  dealCandidateId: string;
  productName: string;
  platform: string;
  imageUrl: string;
  priceMin: number;
  priceDiscountRate: number;
  offerLink: string;
};

async function pickNextCandidate(db: ReturnType<typeof getDbFresh>): Promise<Candidate | null> {
  // Dedupe por PRODUTO, não por candidato: o source-deals pode gerar mais
  // de um deal_candidate pro mesmo produto (achado de novo em outra busca
  // por palavra-chave) — sem isso, o mesmo produto podia ser postado 2x
  // no Instagram (aconteceu na prática em 2026-09-16, Kit Colmeia com 2
  // deal_candidate_id diferentes).
  //
  // IMPORTANTE (bug real corrigido em 2026-09-21): o filtro de "já
  // postado" precisa acontecer ANTES do corte por score, não depois —
  // antes, a query buscava só os 50 candidatos com maior score e SÓ
  // ENTÃO filtrava os já postados na memória. Depois de postar produto
  // suficiente, os 50 com maior score ficam 100% já-postados, e o loop
  // nunca alcança os candidatos novos que estão mais abaixo no ranking
  // — o cron passa a "sem candidato novo" pra sempre, mesmo com dezenas
  // de produtos elegíveis reais esperando. Confirmado ao vivo: parou de
  // postar em 2026-09-19 (achado pelo Heber, "site sem atualização").
  const { data: alreadyPosted } = await db
    .from("social_posts")
    .select("deal_candidates(product_id)");
  const postedProductIds = [
    ...new Set(
      (alreadyPosted ?? [])
        .map((r: any) => r.deal_candidates?.product_id)
        .filter(Boolean)
    ),
  ];

  let query = db
    .from("deal_candidates")
    .select(
      "id, score, product_id, products(product_name, platform), offer_snapshots(image_url, price_min, price_discount_rate, offer_link)"
    );
  if (postedProductIds.length > 0) {
    query = query.not("product_id", "in", `(${postedProductIds.join(",")})`);
  }
  const { data, error } = await query.order("score", { ascending: false, nullsFirst: false }).limit(50);

  if (error || !data) return null;

  for (const row of data as any[]) {
    const snap = row.offer_snapshots;
    if (!snap?.image_url || !snap?.offer_link || snap.price_min == null) continue;
    return {
      dealCandidateId: row.id,
      productName: row.products?.product_name ?? "Oferta imperdível",
      platform: row.products?.platform ?? "shopee",
      imageUrl: snap.image_url,
      priceMin: Number(snap.price_min),
      priceDiscountRate: Number(snap.price_discount_rate ?? 0),
      offerLink: snap.offer_link,
    };
  }
  return null;
}

function buildTemplateUrl(c: Candidate, variant: "feed" | "story"): string {
  const por = c.priceMin.toFixed(2).replace(".", ",");
  const params = new URLSearchParams({
    img: c.imageUrl,
    title: c.productName,
    por,
    variant,
    platform: c.platform,
  });
  // Regra conservadora de/por: só mostra "de" se a razão implícita for < 2.5x.
  if (c.priceDiscountRate > 0) {
    const original = c.priceMin / (1 - c.priceDiscountRate / 100);
    if (original / c.priceMin < 2.5) {
      params.set("de", original.toFixed(2).replace(".", ","));
    }
  }
  return `${SITE_URL}/api/story-template?${params.toString()}`;
}

// Confirmado na prática (post real, 2026-09-16): a Windsor devolve
// {"result": "Published image post to Instagram account X. Media id: 123."}
// — o id vem embutido numa frase em `result` (string), não num campo
// separado. Mantém os outros formatos como fallback caso isso mude.
function extractMediaId(resp: any): string | null {
  if (typeof resp?.result === "string") {
    const match = resp.result.match(/Media id:\s*(\d+)/i);
    if (match) return match[1];
  }
  return (
    resp?.id ??
    resp?.media_id ??
    resp?.data?.id ??
    resp?.data?.media_id ??
    resp?.result?.id ??
    resp?.media?.id ??
    null
  );
}

async function windsorAction(action: string, params: Record<string, unknown>) {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "WINDSOR_API_KEY não configurada — peça pro Heber pegar a chave no painel do Windsor.ai e adicionar como variável de ambiente."
    );
  }
  const resp = await fetch(`${WINDSOR_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: IG_ACCOUNT_ID, action, params }),
  });
  const json = await resp.json().catch(() => null);
  // A Windsor às vezes devolve 200 com um erro embutido no corpo (em vez de
  // um status HTTP de erro) — sem checar isso, o post falha de verdade na
  // Instagram mas o código segue achando que deu certo.
  if (!resp.ok || json?.error) {
    throw new Error(`Windsor ${action} falhou (${resp.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

export async function GET(request: NextRequest) {
  // Fail-closed (achado real SEC-025-CRON-PRODUCTION-AUTH, ver
  // CONTINUIDADE.md "Security findings rastreados"): CRON_SECRET
  // ausente agora REJEITA, nunca libera a rota sem autenticação.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDbFresh();
  const candidate = await pickNextCandidate(db);
  if (!candidate) {
    return NextResponse.json({ ok: true, skipped: true, reason: "sem candidato novo" });
  }

  const feedImageUrl = buildTemplateUrl(candidate, "feed");
  const storyImageUrl = buildTemplateUrl(candidate, "story");
  // Link na LEGENDA, não mais no comentário (pedido do Heber, 2026-09-21):
  // sem como marcar o produto automaticamente no feed via Windsor, o link
  // precisa estar visível de cara na legenda pra ele editar o post manual
  // (copiar o link, marcar o produto) depois de publicado.
  //
  // Hashtag de loja (bug real corrigido em 2026-09-22, achado pelo Heber:
  // "o template do instagram que tá só da shopee"): a legenda tinha
  // #shopee #achadosdashopee fixo pra QUALQUER plataforma — produto de
  // Kabum/Nike/Olympikus/Lomadee saía com hashtag errada. Agora deriva
  // da plataforma real do produto.
  const platformHashtag = candidate.platform.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const storeHashtags = candidate.platform === "shopee" ? "#shopee #achadosdashopee" : platformHashtag ? `#${platformHashtag}` : "";
  // Passa pelo redirecionador /go (ver src/app/go/route.ts) em vez do
  // link cru -- fecha o buraco real apontado na revisão do plano de
  // receita (2026-09-25): sem isso, clique que sai direto de rede social
  // nunca aparecia em click_events, só o que passava pela própria página
  // de produto do site. Não muda nada visível (Instagram não deixa link
  // de legenda clicável mesmo), só registra quem copiar/colar.
  const trackedLink = `${SITE_URL}/go?u=${encodeURIComponent(candidate.offerLink)}&src=instagram&pl=${encodeURIComponent(candidate.platform)}`;
  const caption = `${candidate.productName}\n\n🔗 Link: ${trackedLink}\n\n#promocao #achadinhos${storeHashtags ? " " + storeHashtags : ""}`;

  const results: Record<string, unknown> = { candidate: candidate.dealCandidateId };

  // 1) Post no feed (link já vem na legenda — ver comentário acima)
  let feedMediaId: string | null = null;
  try {
    const feedResp: any = await windsorAction("create_image_post", { image_url: feedImageUrl, caption });
    feedMediaId = extractMediaId(feedResp);
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "feed",
      image_url: feedImageUrl,
      caption,
      status: "posted",
      media_id: feedMediaId,
      // Se não achou o id por nenhum caminho conhecido, guarda a resposta
      // crua aqui pra dar pra inspecionar depois (não tenho acesso aos
      // logs de runtime desse projeto Vercel).
      error: feedMediaId ? null : `sem media_id na resposta: ${JSON.stringify(feedResp).slice(0, 1000)}`,
      posted_at: new Date().toISOString(),
    });
    results.feed = { ok: true, mediaId: feedMediaId };
  } catch (err: any) {
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "feed",
      image_url: feedImageUrl,
      caption,
      status: "failed",
      error: String(err?.message ?? err),
    });
    results.feed = { ok: false, error: String(err?.message ?? err) };
  }

  // 2) Comenta um CTA de seguir a página (pedido do Heber, 2026-09-21 —
  // não é mais o link, que agora já vai na legenda). Algumas variações
  // pra não postar sempre o texto idêntico.
  if (feedMediaId) {
    const followCtas = [
      "Siga a página pra acompanhar as novidades e promoções! 🔥",
      "Já segue a gente? Assim você não perde nenhuma promoção! 🛍️",
      "Segue aqui pra ficar por dentro dos melhores achadinhos! ✨",
    ];
    const followComment = followCtas[Math.floor(Math.random() * followCtas.length)];
    try {
      await windsorAction("create_comment", { media_id: feedMediaId, message: followComment });
      await db
        .from("social_posts")
        .update({ comment_posted: true })
        .eq("deal_candidate_id", candidate.dealCandidateId)
        .eq("post_type", "feed");
      results.comment = { ok: true, text: followComment };
    } catch (err: any) {
      results.comment = { ok: false, error: String(err?.message ?? err) };
    }
  }

  // 3) Story (sem legenda — o QR code + "comente EU QUERO" já vêm na própria imagem)
  try {
    const storyResp: any = await windsorAction("create_story", { image_url: storyImageUrl });
    const storyMediaId = extractMediaId(storyResp);
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "story",
      image_url: storyImageUrl,
      status: "posted",
      media_id: storyMediaId,
      error: storyMediaId ? null : `sem media_id na resposta: ${JSON.stringify(storyResp).slice(0, 1000)}`,
      posted_at: new Date().toISOString(),
    });
    results.story = { ok: true, mediaId: storyMediaId };
  } catch (err: any) {
    await db.from("social_posts").insert({
      deal_candidate_id: candidate.dealCandidateId,
      post_type: "story",
      image_url: storyImageUrl,
      status: "failed",
      error: String(err?.message ?? err),
    });
    results.story = { ok: false, error: String(err?.message ?? err) };
  }

  return NextResponse.json({ ok: true, ...results });
}
