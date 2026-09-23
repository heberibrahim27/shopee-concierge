import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { searchProductsByKeyword, generateAffiliateShortLink } from "../../../../lib/shopee/queries";
import { ShopeeSortType } from "../../../../lib/shopee/types";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../../../../lib/db/snapshots";
import { selectTopCandidates, scoreOffer, DEFAULT_HARD_CUTS, type ScoredCandidate } from "../../../../lib/growth/dealScoring";
import { guessCategorySlug } from "../../../../lib/site/categorize";
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

// Pool amplo, diversificado por categoria. Até 2026-09-22 o comentário
// aqui dizia "evita viés só em brinquedo/eletrônico" — decisão que, na
// prática, zerou brinquedo/novidade da busca inteira (nenhuma das 28
// keywords originais tocava a categoria). Achado real, com dado de
// Reels: os 2 vídeos com mais visualização do canal (Reels de
// brinquedo/novidade — capivara de pelúcia, boneco antiestresse) têm
// 2-4x mais views que qualquer acessório de celular/eletrônico
// postado, mas a categoria "brinquedos" tinha 25 produtos no catálogo
// e ZERO nunca virou deal_candidate — não é peso de ranking, a busca
// diária nunca ia atrás disso. Adicionadas keywords reais de
// brinquedo/novidade (Heber, 2026-09-22: "não vem nada viral").
const KEYWORD_POOL = [
  "fone bluetooth", "carregador rápido", "organizador de armário", "luminária led",
  "mochila notebook", "escova secadora", "umidificador ar led", "suporte celular carro",
  "caixa de som bluetooth", "massageador eletrico", "mini ventilador usb", "aromatizador difusor",
  "kit shorts masculino academia", "organizador maquiagem", "mini impressora portatil",
  "relogio smartwatch", "camera seguranca wifi", "air fryer", "panela eletrica", "tapete pet",
  "luminaria projetor estrelas", "espremedor eletrico portatil", "sensor movimento led",
  "kit ferramentas", "capa celular", "mochila feminina", "tenis esportivo", "bolsa termica",
  "pelucia realista", "boneco antiestresse elastico", "brinquedo articulado", "squishy fidget",
  "brinquedo curioso adulto", "gadget engraçado presente", "brinquedo interativo pet",
  // Dia das Crianças (12/10) chegando (Heber, 2026-09-22) — brinquedo
  // infantil de verdade, não só novidade/antiestresse adulto.
  "brinquedo educativo infantil", "boneca brinquedo", "carrinho controle remoto",
  "brinquedo montessori", "jogo infantil", "kit brinquedo menino", "brinquedo bebe",
  "pista carrinho brinquedo",
  // Achado real (2026-09-22, debate com o Heber sobre o grupo WhatsApp
  // só postar TV/celular/tablet/pet sempre): moda, móveis, papelaria,
  // alimentos, viagem e livros tinham ZERO keyword própria — mesmo bug
  // do brinquedos, seis categorias de vez. `guessCategorySlug`
  // (categorize.ts) também ganhou entrada nova pras que faltavam.
  "vestido feminino verão", "camiseta masculina básica", "jaqueta corta vento",
  "mesa de escritorio dobravel", "estante organizadora livros", "sofa retratil 2 lugares",
  "caderno universitario capa dura", "kit canetas coloridas", "mochila escolar juvenil",
  "cafe gourmet grãos", "kit tempero gourmet", "snack saudavel fit",
  "mala de viagem com rodinha", "necessaire viagem organizadora", "travesseiro de pescoco viagem",
  "livro infantil ilustrado", "livro autoajuda best seller", "livro de colorir adulto",
  // Heber, 2026-09-23: "não vi ferramentas, eletrodomésticos como
  // geladeira, tvs, não vi tbm microondas, fogão, luminárias modernas".
  // "kit ferramentas" já existia mas era a ÚNICA keyword da categoria
  // inteira; geladeira/fogão/microondas/TV grande nunca tiveram keyword
  // nenhuma (só gadget pequeno tipo "mini ventilador" e "caixa de som"
  // apareciam, nunca eletrodoméstico de verdade).
  "furadeira parafusadeira bateria", "trena a laser digital", "chave de fenda kit profissional",
  "geladeira frost free", "fogão 4 bocas mesa vidro", "microondas 20 litros", "cooktop 4 bocas",
  "tv led 32 polegadas smart", "tv 43 polegadas 4k",
  "luminária pendente moderna", "arandela led parede moderna",
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Mínimo de resultados comparáveis pra confiar na mediana da busca —
// achado real (Heber, 2026-09-24): "quando eu subo um produto na
// Shopee eu coloco o preço dele cheio e dou o desconto pra aparecer no
// topo das pesquisas" — o desconto auto-declarado é jogo de ranking, não
// sinal de valor. Preço comparado aos OUTROS resultados da MESMA busca
// (ex.: "tv 64 polegadas" traz ~10 TVs comparáveis) é o sinal honesto.
// Com poucos resultados a mediana fica instável, então exige um mínimo.
const MIN_COHORT_SIZE = 4;

export async function GET(request: NextRequest) {
  // Fail-closed (achado real SEC-025-CRON-PRODUCTION-AUTH, ver
  // CONTINUIDADE.md "Security findings rastreados"): CRON_SECRET
  // ausente agora REJEITA, nunca libera a rota sem autenticação.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  // Override manual (?keywords=a,b,c) pra rodar uma busca pontual sem
  // esperar a rotação diária — ex.: puxar brinquedo/novidade agora
  // mesmo pro Heber gerar vídeo na hora, em vez de só amanhã quando a
  // rotação passar por essas keywords.
  const keywordsParam = request.nextUrl.searchParams.get("keywords");
  const keywords = keywordsParam ? keywordsParam.split(",").map((k) => k.trim()).filter(Boolean) : keywordsForToday();
  const limitPerKeyword = 10;

  const allOffers: Awaited<ReturnType<typeof searchProductsByKeyword>> = [];
  const cohortMedianPriceByItemId = new Map<string, number>();
  const seen = new Set<string>();
  for (const keyword of keywords) {
    try {
      const offers = await searchProductsByKeyword({ keyword, limit: limitPerKeyword, sortType: ShopeeSortType.ITEM_SOLD_DESC });

      // Mediana calculada sobre TODOS os resultados desta busca (mesmo
      // os que já apareceram numa keyword anterior) — é o preço "dos
      // concorrentes reais desta pesquisa", não do pool acumulado do
      // dia inteiro, que misturaria categorias sem relação nenhuma.
      const prices = offers.map((o) => Number(o.priceMin)).filter((p) => Number.isFinite(p) && p > 0);
      const cohortMedian = prices.length >= MIN_COHORT_SIZE ? median(prices) : null;

      for (const o of offers) {
        const itemId = String(o.itemId);
        if (cohortMedian !== null && !cohortMedianPriceByItemId.has(itemId)) {
          cohortMedianPriceByItemId.set(itemId, cohortMedian);
        }
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
  const eligibleOffers = allOffers.filter((o) => persisted.has(o.itemId));
  const topByScore = selectTopCandidates(eligibleOffers, 25, DEFAULT_HARD_CUTS, cohortMedianPriceByItemId);

  // Achado real (2026-09-23, Heber: "não vi geladeira, tvs... fogão,
  // luminárias modernas"): mesmo depois de expandir as keywords de
  // busca, geladeira/fogão real (desconto 22-37%, nota 4.8-4.9, 100+
  // vendas) NUNCA virava deal_candidate. Causa: `quedaHistorica` pesa
  // 40 dos 100 pontos do score e escala pra máximo só a partir de 50%
  // de desconto — eletrodoméstico de ticket alto raramente tem desconto
  // percentual gigante mesmo sendo oferta real, então fica sempre
  // abaixo do corte de 75, perdendo pra gadget pequeno com desconto
  // agressivo. Mesma lição da penalidade de saturação do grupo WhatsApp
  // (publish-whatsapp-group/route.ts), só que um passo antes, na
  // ENTRADA do funil: garante até MAX_DIVERSITY_PICKS candidatos de
  // categorias que não apareceriam de jeito nenhum no top por score,
  // desde que passem nos cortes duros (desconto/nota/vendas reais) e
  // tenham score minimamente decente — não é "forçar qualquer coisa",
  // é dar uma chance real pra categoria que a fórmula despreza.
  const MAX_DIVERSITY_PICKS = 5;
  const MIN_DIVERSITY_SCORE = 55;
  const coveredCategories = new Set(topByScore.map((c) => guessCategorySlug(c.offer.productName)));
  const alreadyPicked = new Set(topByScore.map((c) => c.offer.itemId));
  const diversityPicks: ScoredCandidate[] = [];
  const scoredEligible = eligibleOffers
    .map((o) => scoreOffer(o, DEFAULT_HARD_CUTS, cohortMedianPriceByItemId.get(o.itemId)))
    .filter((c) => c.passesHardCuts && !alreadyPicked.has(c.offer.itemId))
    .sort((a, b) => b.score.total - a.score.total);
  for (const candidate of scoredEligible) {
    if (diversityPicks.length >= MAX_DIVERSITY_PICKS) break;
    if (candidate.score.total < MIN_DIVERSITY_SCORE) continue;
    const slug = guessCategorySlug(candidate.offer.productName);
    if (coveredCategories.has(slug)) continue;
    coveredCategories.add(slug);
    diversityPicks.push(candidate);
  }
  const top = [...topByScore, ...diversityPicks];
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
