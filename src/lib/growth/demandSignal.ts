/**
 * Sinal de demanda real — calculado comparando o snapshot mais novo de
 * um produto (offer_snapshots) contra snapshots mais antigos DO MESMO
 * produto, em vez de olhar só o desconto que a própria Shopee informa
 * num instante só (isso é o que `quedaHistorica` em dealScoring.ts faz
 * hoje, apesar do nome — ver nota lá).
 *
 * Debate real com o Heber e o ChatGPT (2026-09-22): a API de afiliado da
 * Shopee não devolve estoque, flag de "queima de estoque" nem
 * velocidade de venda — só total acumulado. Mas `source-deals` já roda
 * todo dia e grava um snapshot novo por produto, então dá pra construir
 * esse sinal sozinho comparando snapshots ao longo do tempo. Confirmado
 * com dado real (2026-09-22): 374 produtos já têm 2+ snapshots no banco,
 * suficiente pra calcular queda de preço/aceleração de venda de
 * verdade, não só teoria.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DemandReasonCode =
  | "REAL_PRICE_DROP"
  | "SALES_ACCELERATION"
  | "LOWEST_TRACKED_PRICE"
  | null;

export type DemandSignal = {
  reasonCode: DemandReasonCode;
  /** 0-25 — usado como componente do offer_score. 0 quando não há histórico suficiente (produto visto só 1x). */
  demandBonus: number;
  /** Evidência real por trás do reasonCode — só números que realmente medimos, nunca inventados. */
  evidence: {
    snapshotCount: number;
    priceNow: number;
    priceDaysAgo: number | null;
    priceChangePct: number | null; // negativo = caiu
    daysSincePriceRef: number | null;
    salesDelta: number | null; // desde o snapshot anterior
    daysSinceLastSnapshot: number | null;
    avgDailySalesVelocity: number | null; // média histórica (todas as janelas)
    recentDailySalesVelocity: number | null; // só a janela mais recente
    accelerationMultiplier: number | null; // recentDailySalesVelocity / avgDailySalesVelocity
    lowestPriceInWindow: number | null;
    isLowestTracked: boolean;
  };
};

type SnapshotRow = { captured_at: string; price_min: number | null; sales: number | null };

const NO_SIGNAL: DemandSignal = {
  reasonCode: null,
  demandBonus: 0,
  evidence: {
    snapshotCount: 0,
    priceNow: 0,
    priceDaysAgo: null,
    priceChangePct: null,
    daysSincePriceRef: null,
    salesDelta: null,
    daysSinceLastSnapshot: null,
    avgDailySalesVelocity: null,
    recentDailySalesVelocity: null,
    accelerationMultiplier: null,
    lowestPriceInWindow: null,
    isLowestTracked: false,
  },
};

/**
 * Busca todo o histórico de snapshots de um produto e calcula o sinal.
 * Precisa de pelo menos 2 snapshots pra dizer qualquer coisa real sobre
 * "mudou" — com 1 só, devolve NO_SIGNAL (não é mentira dizer que não
 * sabemos ainda, é mais honesto que inventar).
 */
export async function computeDemandSignal(db: SupabaseClient, productId: string): Promise<DemandSignal> {
  const { data, error } = await db
    .from("offer_snapshots")
    .select("captured_at, price_min, sales")
    .eq("product_id", productId)
    .order("captured_at", { ascending: true });

  if (error || !data || data.length < 2) {
    if (data && data.length === 1 && data[0].price_min != null) {
      return { ...NO_SIGNAL, evidence: { ...NO_SIGNAL.evidence, snapshotCount: 1, priceNow: Number(data[0].price_min) } };
    }
    return NO_SIGNAL;
  }

  const rows = data as SnapshotRow[];
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const priceNow = Number(current.price_min ?? 0);

  // Referência de preço: a leitura mais antiga que ainda esteja dentro
  // de ~30 dias — se só tivermos 2 leituras próximas, usa a mais antiga
  // disponível mesmo assim (é o dado real que temos).
  const now = new Date(current.captured_at).getTime();
  const THIRTY_DAYS_MS = 30 * 86400000;
  const priceRef = rows.find((r) => now - new Date(r.captured_at).getTime() <= THIRTY_DAYS_MS) ?? rows[0];
  const daysSincePriceRef = Math.round((now - new Date(priceRef.captured_at).getTime()) / 86400000);
  const priceDaysAgo = priceRef.price_min != null ? Number(priceRef.price_min) : null;
  const priceChangePct = priceDaysAgo && priceDaysAgo > 0 ? ((priceNow - priceDaysAgo) / priceDaysAgo) * 100 : null;

  const lowestPriceInWindow = Math.min(...rows.map((r) => Number(r.price_min ?? Infinity)).filter((n) => Number.isFinite(n)));
  const isLowestTracked = priceNow > 0 && priceNow <= lowestPriceInWindow;

  // Velocidade de venda: delta entre os dois snapshots mais recentes
  // (vendas é contador acumulado da Shopee — nunca deveria cair; se
  // cair, é reset/produto trocado, ignora como sinal).
  const daysSinceLastSnapshot = Math.max(1, Math.round((now - new Date(previous.captured_at).getTime()) / 86400000));
  const rawSalesDelta = current.sales != null && previous.sales != null ? current.sales - previous.sales : null;
  const salesDelta = rawSalesDelta != null && rawSalesDelta >= 0 ? rawSalesDelta : null;
  const recentDailySalesVelocity = salesDelta != null ? salesDelta / daysSinceLastSnapshot : null;

  // Média histórica: soma de todos os deltas válidos / soma de todos os
  // dias — janela única maior é mais estável que média de médias.
  let totalDeltaDays = 0;
  let totalDeltaSales = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const d = b.sales != null && a.sales != null ? b.sales - a.sales : null;
    if (d == null || d < 0) continue;
    const days = Math.max(1, Math.round((new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()) / 86400000));
    totalDeltaSales += d;
    totalDeltaDays += days;
  }
  const avgDailySalesVelocity = totalDeltaDays > 0 ? totalDeltaSales / totalDeltaDays : null;
  const accelerationMultiplier =
    recentDailySalesVelocity != null && avgDailySalesVelocity != null && avgDailySalesVelocity > 0
      ? recentDailySalesVelocity / avgDailySalesVelocity
      : null;

  const evidence: DemandSignal["evidence"] = {
    snapshotCount: rows.length,
    priceNow,
    priceDaysAgo,
    priceChangePct,
    daysSincePriceRef,
    salesDelta,
    daysSinceLastSnapshot,
    avgDailySalesVelocity,
    recentDailySalesVelocity,
    accelerationMultiplier,
    lowestPriceInWindow,
    isLowestTracked,
  };

  // Prioridade dos reason codes: aceleração de venda real > queda de
  // preço real > menor preço já visto. Limiares conservadores de
  // propósito — é melhor dizer "sem sinal" do que forçar um motivo
  // fraco.
  if (accelerationMultiplier != null && accelerationMultiplier >= 2 && salesDelta != null && salesDelta >= 5) {
    return { reasonCode: "SALES_ACCELERATION", demandBonus: Math.min(25, 10 + accelerationMultiplier * 3), evidence };
  }
  if (priceChangePct != null && priceChangePct <= -10 && daysSincePriceRef != null && daysSincePriceRef >= 2) {
    return { reasonCode: "REAL_PRICE_DROP", demandBonus: Math.min(25, Math.abs(priceChangePct)), evidence };
  }
  if (isLowestTracked && rows.length >= 3) {
    return { reasonCode: "LOWEST_TRACKED_PRICE", demandBonus: 15, evidence };
  }
  return { reasonCode: null, demandBonus: 0, evidence };
}
