import crypto from "node:crypto";
import { getDb } from "../db/client";
import type { RankedCandidate } from "./rank";

/**
 * Sensor de demanda ("Motor 4" do debate com o ChatGPT sobre crescimento
 * de seguidores, 2026-09-22, ver CONTINUIDADE.md): cada busca do
 * Concierge que encontra um candidato real vira um sinal de demanda —
 * a Máquina de Vídeos vai poder usar isso pra priorizar pauta pelo que
 * pessoas de verdade estão procurando, em vez de só comissão/desconto.
 *
 * Anonimizado por padrão (chat_id_hash, nunca o telefone cru) — nunca
 * trava nem quebra a resposta real ao cliente: sempre chamado com
 * .catch() por quem chama, erro aqui só vira log.
 */

function hashChatId(chatId: string): string {
  return crypto.createHash("sha256").update(chatId).digest("hex").slice(0, 24);
}

export async function recordGrowthSignal(params: {
  chatId: string;
  categorySlug?: string;
  searchTerms: string[];
  topCandidate: RankedCandidate;
}): Promise<void> {
  const db = getDb();
  const { offer, matchType } = params.topCandidate;
  await db.from("concierge_growth_signal").insert({
    chat_id_hash: hashChatId(params.chatId),
    category_slug: params.categorySlug ?? null,
    item_id: offer.itemId,
    product_name: offer.productName,
    price_min: offer.priceMin != null ? Number(offer.priceMin) : null,
    match_type: matchType,
    search_terms: params.searchTerms,
  });
}
