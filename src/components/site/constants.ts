/**
 * Número de WhatsApp do Concierge, confirmado 2026-09-14: é o número do
 * BancaZAP Prime reaproveitado (+55 71 8430-2570), não um número dedicado
 * separado. Formato E.164 sem "+" pra usar em wa.me.
 */
export const WHATSAPP_NUMBER = "557184302570";
export const WHATSAPP_DEFAULT_MESSAGE = "Quero encontrar um produto";

export function buildWhatsAppLink(message: string = WHATSAPP_DEFAULT_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
