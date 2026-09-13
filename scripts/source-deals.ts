/**
 * Etapa 1 do Plano Diretor — "Primeira oferta rastreada":
 *   1. Buscar 20-50 produtos reais na Shopee (várias palavras-chave).
 *   2. Persistir produto + snapshot de cada um (Supabase).
 *   3. Aplicar cortes e selecionar até 3 candidatos.
 *   4. Gerar shortLinks com subIds (5 posições) para os selecionados.
 *   5. Imprimir evidência completa (JSON) pra revisão humana.
 *
 * NÃO publica nada em canal nenhum (WhatsApp/Instagram) — só gera e
 * mostra a evidência, conforme a instrução explícita de parar antes da
 * publicação externa.
 *
 * Uso:
 *   npm run source:deals
 *   npm run source:deals -- --limit-per-keyword=20
 *
 * Requer no .env: SHOPEE_APP_ID, SHOPEE_SECRET, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Código de saída: 0 só quando a execução produziu pelo menos um
 * resultado utilizável (busca + persistência funcionaram); diferente de
 * zero quando nada pôde ser buscado ou nada pôde ser persistido — ver
 * `hadCriticalFailure` no fim de `main()`. Falha em gerar/gravar o link de
 * UM candidato específico não derruba a execução inteira, mas também não
 * aparece na evidência como sucesso (ver `persistOfferSnapshot`/nota P2
 * abaixo) — correções aplicadas depois da revisão estática do Codex
 * (13/09/2026).
 */
import "dotenv/config";
import crypto from "node:crypto";
import { searchProductsByKeyword, generateAffiliateShortLink } from "../src/lib/shopee/queries";
import { ShopeeSortType, ShopeeProductOffer } from "../src/lib/shopee/types";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../src/lib/db/snapshots";
import { selectTopCandidates, ScoredCandidate } from "../src/lib/growth/dealScoring";

// Amostra inicial de palavras-chave — deliberadamente genérica e
// diversificada (várias categorias) só pra ter volume real de 20-50
// produtos pra aplicar corte/score em cima; não é uma decisão de
// posicionamento de nicho, é só massa de teste pra Etapa 1. Ibrahim pode
// substituir por uma lista de categorias-alvo quando decidir isso.
const SAMPLE_KEYWORDS = [
  "fone bluetooth",
  "carregador rápido",
  "organizador de armário",
  "luminária led",
  "mochila notebook",
];

function argNumber(flag: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return fallback;
  const n = Number(arg.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

/** Semana ISO atual, token curto (ex: "w37") — muda toda semana sozinho. */
function isoWeekToken(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `w${String(weekNo).padStart(2, "0")}`;
}

/**
 * Token de "conteúdo" (posição 4 do subId) estável e único por produto —
 * hash curto do itemId, não um contador que reinicia a cada execução do
 * script. Correção do ponto P2 apontado pelo Codex: antes, `seq` reiniciava
 * em 1 a cada rodada, então produtos diferentes em execuções diferentes
 * acabavam com o MESMO subId completo (colidindo na atribuição/medição).
 */
function contentToken(itemId: string): string {
  const hash = crypto.createHash("sha1").update(itemId).digest("hex");
  return `c${hash.slice(0, 6)}`;
}

interface CandidateEvidence {
  itemId: string;
  productName: string;
  shopName: string;
  priceMin: string;
  priceDiscountRate: number;
  ratingStar: string;
  sales: number;
  commissionRate: string;
  score: ScoredCandidate["score"];
  dealCandidateId?: string;
  affiliateLink?: { shortLink: string; longLink: string; subIds: string[] };
  /**
   * "completo": candidato persistido, link gerado E gravado no banco.
   * "incompleto": alguma etapa falhou — ver `erro`. NUNCA fica
   * `affiliateLink` preenchido quando o status não é "completo" (correção
   * do ponto P2: antes, um link gerado mas não gravado ainda aparecia na
   * evidência como se estivesse tudo certo).
   */
  status: "completo" | "incompleto";
  erro?: string;
}

async function main() {
  const limitPerKeyword = argNumber("limit-per-keyword", 10);

  console.log(`[source-deals] buscando ${SAMPLE_KEYWORDS.length} palavras-chave, até ${limitPerKeyword} produtos cada...`);

  const allOffers: ShopeeProductOffer[] = [];
  const seenItemIds = new Set<string>();
  const keywordErrors: Array<{ keyword: string; erro: string }> = [];

  for (const keyword of SAMPLE_KEYWORDS) {
    try {
      const offers = await searchProductsByKeyword({
        keyword,
        limit: limitPerKeyword,
        sortType: ShopeeSortType.ITEM_SOLD_DESC,
      });
      console.log(`[source-deals] "${keyword}": ${offers.length} produtos`);
      for (const o of offers) {
        // A API retorna IDs numéricos apesar do tipo declarado no cliente.
        const itemId = String(o.itemId);
        if (!seenItemIds.has(itemId)) {
          seenItemIds.add(itemId);
          allOffers.push({ ...o, itemId, shopId: String(o.shopId) });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[source-deals] falha na busca "${keyword}":`, msg);
      keywordErrors.push({ keyword, erro: msg });
    }
  }

  console.log(`[source-deals] total único coletado: ${allOffers.length} produtos`);

  console.log(`[source-deals] persistindo produtos + snapshots no Supabase...`);
  const persisted = new Map<string, { productId: string; snapshotId: string }>();
  const persistErrors: Array<{ itemId: string; erro: string }> = [];
  for (const offer of allOffers) {
    try {
      const result = await persistOfferSnapshot(offer);
      persisted.set(offer.itemId, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[source-deals] falha ao persistir ${offer.itemId}:`, msg);
      persistErrors.push({ itemId: offer.itemId, erro: msg });
    }
  }
  console.log(`[source-deals] persistidos com sucesso: ${persisted.size}/${allOffers.length}`);

  const top3 = selectTopCandidates(allOffers.filter(o => persisted.has(o.itemId)), 3);

  console.log(`[source-deals] candidatos selecionados (top ${top3.length} após cortes + score >= 75):`);

  const evidence: CandidateEvidence[] = [];
  const weekToken = isoWeekToken();

  for (const candidate of top3) {
    const { offer, score } = candidate;
    const persistedRef = persisted.get(offer.itemId);

    const base: Omit<CandidateEvidence, "status" | "erro" | "dealCandidateId" | "affiliateLink"> = {
      itemId: offer.itemId,
      productName: offer.productName,
      shopName: offer.shopName,
      priceMin: offer.priceMin,
      priceDiscountRate: offer.priceDiscountRate,
      ratingStar: offer.ratingStar,
      sales: offer.sales,
      commissionRate: offer.commissionRate,
      score,
    };

    if (!persistedRef) {
      evidence.push({
        ...base,
        status: "incompleto",
        erro: "produto não foi persistido com sucesso (ver persistErrors) — sem deal_candidate nem link",
      });
      continue;
    }

    try {
      const dc = await createDealCandidate({
        productId: persistedRef.productId,
        offerSnapshotId: persistedRef.snapshotId,
        status: "discovered", // nunca "verified"/"eligible" nesta etapa — ver dealScoring.ts
        score: score.total,
        scoreBreakdown: score as unknown as Record<string, unknown>,
      });

      // subIds curtos — a Shopee rejeita valores longos/compostos (ver
      // comentário em src/lib/shopee/queries.ts, erro [11001]). A
      // convenção de 5 posições do plano diretor (12.1) usa exemplos
      // longos ("2026w37-casa", "ct000123") que PODEM não passar nesse
      // limite — usamos aqui uma versão abreviada até validar o limite
      // real com a API (pendência sinalizada no relatório). O token de
      // conteúdo (posição 4) é um hash estável do itemId, não um contador
      // que reinicia a cada execução (correção P2).
      const subIds = ["ig", "p1", weekToken, contentToken(offer.itemId), "feed1"];

      const link = await generateAffiliateShortLink({
        originUrl: offer.productLink || offer.offerLink,
        subIds,
      });

      // Só grava no banco DEPOIS de confirmar que a Shopee gerou o link;
      // e só marca "completo" na evidência DEPOIS que o saveAffiliateLink
      // realmente confirmar a gravação (correção P2 — antes, se
      // saveAffiliateLink falhasse, a evidência ainda mostrava o link como
      // se estivesse tudo certo, sem registro correspondente no banco).
      await saveAffiliateLink({
        dealCandidateId: dc.id,
        originUrl: offer.productLink || offer.offerLink,
        subIds,
        shortLink: link.shortLink,
        longLink: link.longLink,
      });

      evidence.push({
        ...base,
        dealCandidateId: dc.id,
        affiliateLink: { ...link, subIds },
        status: "completo",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[source-deals] falha ao gerar deal_candidate/link pra ${offer.itemId}:`, msg);
      evidence.push({ ...base, status: "incompleto", erro: msg });
    }
  }

  const completos = evidence.filter((e) => e.status === "completo").length;

  const resultado = {
    totalColetado: allOffers.length,
    totalPersistido: persisted.size,
    candidatosSelecionados: top3.length,
    candidatosCompletos: completos,
    keywordErrors,
    persistErrors,
    candidatos: evidence,
  };

  console.log(`\n[source-deals] EVIDÊNCIA FINAL:\n`);
  console.log(JSON.stringify(resultado, null, 2));

  // Falha crítica: nada foi coletado, ou nada foi persistido, ou nenhum
  // candidato selecionado chegou a "completo" (link gerado E gravado).
  // Correção P1: antes, essas situações terminavam com código 0 (sucesso
  // silencioso) mesmo sem nenhum resultado utilizável.
  const hadCriticalFailure =
    allOffers.length === 0 ||
    persisted.size === 0 ||
    (top3.length > 0 && completos === 0);

  if (hadCriticalFailure) {
    console.error(
      `\n[source-deals] FALHA: execução terminou sem nenhum resultado utilizável (coletado=${allOffers.length}, persistido=${persisted.size}, completos=${completos}/${top3.length}).`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[source-deals] erro fatal:", err);
  process.exit(1);
});
