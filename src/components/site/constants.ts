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

// Grupo real "Descontos Chegando #GR42" — mesmo grupo do cron
// /api/cron/publish-whatsapp-group, achado via Z-API (2026-09-21).
export const WHATSAPP_GROUP_LINK = "https://chat.whatsapp.com/CA6kj3dtp1S7DXVwI24PFZ";
