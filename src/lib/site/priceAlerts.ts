/**
 * Alerta de queda de preço por WhatsApp — ver migration
 * 20260926120000_create_price_alerts.sql pro porquê. Este módulo tem as
 * três peças que a rota pública (/api/price-alert) e o cron
 * (/api/cron/price-alerts) compartilham: normalização de telefone, o
 * link rastreado que vai na mensagem e o texto da mensagem.
 *
 * Todo link enviado passa pelo `/go` com `src=alerta` — assim o clique
 * que vem do alerta aparece separado em click_events, e dá pra medir se
 * o recurso rende de verdade.
 */
import { formatPriceBRL } from "./format";

const SITE_URL = "https://descontochegando.com.br";

export const MAX_ACTIVE_ALERTS_PER_PHONE = 20;

/**
 * Aceita "(11) 99999-9999", "11999999999", "+55 11 99999-9999"... e devolve
 * só dígitos com DDI 55 na frente (formato que a Z-API espera). Devolve
 * null pra qualquer coisa que não pareça celular/fixo brasileiro.
 */
export function normalizeBrazilianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    national = digits.slice(2);
  }
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = Number(national.slice(0, 2));
  if (!Number.isFinite(ddd) || ddd < 11 || ddd > 99) return null;
  // Celular tem 9 dígitos começando em 9; fixo tem 8 começando em 2-5.
  if (national.length === 11 && national[2] !== "9") return null;
  if (national.length === 10 && !/[2-5]/.test(national[2])) return null;
  return `55${national}`;
}

/** "(11) 99999-9999" pra mostrar de volta na tela, a partir do normalizado. */
export function formatPhoneForDisplay(normalized: string): string {
  const national = normalized.startsWith("55") ? normalized.slice(2) : normalized;
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  const split = rest.length === 9 ? [rest.slice(0, 5), rest.slice(5)] : [rest.slice(0, 4), rest.slice(4)];
  return `(${ddd}) ${split[0]}-${split[1]}`;
}

export function buildAlertTrackedLink(params: { offerLink: string; productSlug: string; platform: string }): string {
  const search = new URLSearchParams({
    u: params.offerLink,
    src: "alerta",
    p: params.productSlug,
    pl: params.platform,
  });
  return `${SITE_URL}/go?${search.toString()}`;
}

export function buildPriceDropMessage(params: {
  productName: string;
  currentPrice: number;
  targetPrice: number;
  storeLabel: string;
  link: string;
}): string {
  const current = formatPriceBRL(params.currentPrice) ?? `R$ ${params.currentPrice.toFixed(2)}`;
  const target = formatPriceBRL(params.targetPrice) ?? `R$ ${params.targetPrice.toFixed(2)}`;
  return [
    "🔔 *Caiu o preço!* Desconto Chegando",
    "",
    params.productName,
    `Agora: *${current}* na ${params.storeLabel} (seu alvo era ${target})`,
    "",
    `👉 ${params.link}`,
    "",
    "Esse alerta se encerra aqui. Pra criar outro, é só voltar na página do produto no site.",
  ].join("\n");
}

export function buildWelcomeMessage(params: { productName: string; targetPrice: number; productUrl: string }): string {
  const target = formatPriceBRL(params.targetPrice) ?? `R$ ${params.targetPrice.toFixed(2)}`;
  return [
    "✅ *Alerta de preço ativado* — Desconto Chegando",
    "",
    params.productName,
    `A gente te avisa aqui quando ficar por ${target} ou menos.`,
    params.productUrl,
    "",
    "Se não foi você que pediu, pode ignorar esta mensagem — não mandamos mais nada sem um alerta seu.",
  ].join("\n");
}
