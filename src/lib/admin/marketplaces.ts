/**
 * `products.platform` foi pensado como "loja/marketplace" mas, desde a
 * integração com a Awin (2026-09-15), produtos da Nike/Olympikus gravam a
 * MARCA nesse campo (`platform = "nike"` / `"olympikus"`), não a rede de
 * afiliados de verdade. Corrigir isso na origem exigiria uma coluna nova
 * (`products.brand`) e mexer no site público (Header, ProductCard) — fora
 * do escopo do redesign do admin. Esse mapa resolve só a EXIBIÇÃO no
 * painel: agrupa marcas conhecidas da Awin sob a rede real, sem tocar em
 * banco nem no site público. Ver diagnóstico de 2026-09-16.
 */
const AWIN_BRAND_TO_NETWORK: Record<string, string> = {
  nike: "Awin (Nike)",
  olympikus: "Awin (Olympikus)",
};

const MARKETPLACE_LABELS: Record<string, string> = {
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
  aliexpress: "AliExpress",
  kabum: "KaBuM!",
  americanas: "Americanas",
};

/** Rótulo de exibição pra agrupamento "cliques por marketplace" no admin. */
export function marketplaceDisplayLabel(rawPlatform: string): string {
  return AWIN_BRAND_TO_NETWORK[rawPlatform] ?? MARKETPLACE_LABELS[rawPlatform] ?? rawPlatform;
}
