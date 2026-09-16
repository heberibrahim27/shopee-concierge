import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { searchProductsByKeyword, generateAffiliateShortLink } from "../../../../lib/shopee/queries";
import { ShopeeSortType } from "../../../../lib/shopee/types";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../../../../lib/db/snapshots";
import { selectTopCandidates } from "../../../../lib/growth/dealScoring";
import { buildProductSlug } from "../../../../lib/site/slug";
import { notifyCatalogUpdate } from "../../../../lib/site/notifyRevalidate";
import crypto from "node:crypto";

export const runtime = "nodejs";
// Subiu de 60s pra 300s: agora busca mais palavras-chave (10, era 6) e
// cria mais candidatos (25, era 8) pra alimentar os 20 posts/dia do
// Instagram — mais chamadas de rede (Shopee + geração de link de
// afiliado) por execução. Plano é Pro, 300s é suportado.
export const maxDuration = 300;

/**
 * Rotina diária de descoberta + publicação automática de produtos.
 * Roda ANTES do /api/cron/publish-product (que consome os candidatos
 * gerados aqui pra postar no Instagram). Reaproveita a mesma lógica do
 * script scripts/source-deals.ts, mas: (1) roda como rota HTTP chamável
 * pelo Vercel Cron, sem precisar de ninguém disparar manualmente, e (2)
 * já publica no site os candidatos aprovados (site_published=true +
 * slug), fechando o loop sourcing → site → Instagram sem toque humano.
 */

// Pool amplo, diversificado por categoria — evita viés só em brinquedo/
// eletrônico. Roda um subconjunto por dia (rotação por dia do ano) pra
// não estourar limite de chamadas à API da Shopee de uma vez.
const KEYWORD_POOL = [
  "fone bluetooth", "carregador rápido", "organizador de armário", "luminária led",
  "mochila notebook", "escova secadora", "umidificador ar led", "suporte celular carro",
  "caixa de som bluetooth", "massageador eletrico", "mini ventilador usb", "aromatizador difusor",
  "kit shorts masculino academia", "organizador maquiagem", "mini impressora portatil",
  "relogio smartwatch", "camera seguranca wifi", "air fryer", "panela eletrica", "tapete pet",
  "luminaria projetor estrelas", "espremedor eletrico portatil", "sensor movimento led",
  "kit ferramentas", "capa celular", "mochila feminina", "tenis esportivo", "bolsa termica",
];

function keywordsForToday(count = 10): string[] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const start = (dayOfYear * count) % KEYWORD_POOL.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(KEYWORD_POOL[(start + i) % KEYWORD_POOL.length]);
  }
  return picked;
}

function isoWeekToken(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `w${String(weekNo).padStart(2, "0")}`;
}

function contentToken(itemId: string): string {
  return `c${crypto.createHash("sha1").update(itemId).digest("hex").slice(0, 6)}`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const keywords = keywordsForToday();
  const limitPerKeyword = 10;

  const allOffers: Awaited<ReturnType<typeof searchProductsByKeyword>> = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    try {
      const offers = await searchProductsByKeyword({ keyword, limit: limitPerKeyword, sortType: ShopeeSortType.ITEM_SOLD_DESC });
      for (const o of offers) {
        const itemId = String(o.itemId);
        if (!seen.has(itemId)) {
          seen.add(itemId);
          allOffers.push({ ...o, itemId, shopId: String(o.shopId) });
        }
      }
    } catch (err) {
      console.error(`[cron/source-deals] falha busca "${keyword}":`, err);
    }
  }

  const persisted = new Map<string, { productId: string; snapshotId: string }>();
  for (const offer of allOffers) {
    try {
      persisted.set(offer.itemId, await persistOfferSnapshot(offer));
    } catch (err) {
      console.error(`[cron/source-deals] falha persistir ${offer.itemId}:`, err);
    }
  }

  // Publica até 25 por dia — sobe de 8 pra alimentar os 20 posts/dia do
  // Instagram (src/app/api/cron/publish-product, ver vercel.json) com
  // folga, já que nem todo candidato vira post (pode já ter sido usado
  // ou reprovar depois no filtro visual do Windsor/expert).
  const top = selectTopCandidates(allOffers.filter((o) => persisted.has(o.itemId)), 25);
  const weekToken = isoWeekToken();
  const published: string[] = [];
  const failed: Array<{ itemId: string; erro: string }> = [];

  for (const candidate of top) {
    const { offer, score } = candidate;
    const ref = persisted.get(offer.itemId);
    if (!ref) continue;
    try {
      const dc = await createDealCandidate({
        productId: ref.productId,
        offerSnapshotId: ref.snapshotId,
        status: "discovered",
        score: score.total,
        scoreBreakdown: score as unknown as Record<string, unknown>,
      });

      const subIds = ["ig", "p1", weekToken, contentToken(offer.itemId), "auto"];
      const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });
      await saveAffiliateLink({ dealCandidateId: dc.id, originUrl: offer.productLink || offer.offerLink, subIds, shortLink: link.shortLink, longLink: link.longLink });

      // Publica no site automaticamente — sem isso o produto fica só no
      // banco, invisível pro visitante e pra automação do Instagram usar
      // como link de afiliado "de verdade" (offer_link já serve pra isso,
      // mas o site também precisa mostrar o produto).
      const slug = buildProductSlug(offer.productName, offer.itemId);
      const { error: updateError } = await db
        .from("products")
        .update({ slug, site_published: true, updated_at: new Date().toISOString() })
        .eq("id", ref.productId);

      if (updateError) throw new Error(`falha ao publicar produto: ${updateError.message}`);

      await notifyCatalogUpdate({ productSlug: slug, categorySlug: null }).catch((e) =>
        console.error("[cron/source-deals] revalidate falhou:", e)
      );

      published.push(offer.itemId);
    } catch (err) {
      failed.push({ itemId: offer.itemId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    keywordsUsados: keywords,
    coletados: allOffers.length,
    persistidos: persisted.size,
    publicados: published.length,
    falhas: failed,
  });
}
