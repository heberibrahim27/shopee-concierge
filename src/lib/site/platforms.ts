/**
 * Metadados de marketplace pra exibição — só rótulo e cor, nunca logo
 * copiado de terceiros (uso nominativo, informativo, comum em qualquer
 * comparador de preço real). `shopee` e (desde 2026-09-15, via feed de
 * produto da Awin) `nike`/`olympikus` têm dado de verdade; os demais
 * existem aqui pra quando a integração de cada um for feita — até lá,
 * nenhuma linha do banco usa esses valores, então nada aparece.
 */
export interface PlatformInfo {
  label: string;
  color: string;
  textColor: string;
  /** Pra montar "Ver oferta {ctaPreposition}" ("na Shopee", "no Mercado Livre"...). */
  ctaPreposition: string;
}

export const PLATFORM_INFO: Record<string, PlatformInfo> = {
  shopee: { label: "Shopee", color: "#ee4d2d", textColor: "#fff", ctaPreposition: "na Shopee" },
  mercadolivre: {
    label: "Mercado Livre",
    color: "#fff159",
    textColor: "#1a1712",
    ctaPreposition: "no Mercado Livre",
  },
  amazon: { label: "Amazon", color: "#131921", textColor: "#fff", ctaPreposition: "na Amazon" },
  aliexpress: {
    label: "AliExpress",
    color: "#e62e04",
    textColor: "#fff",
    ctaPreposition: "no AliExpress",
  },
  kabum: { label: "KaBuM!", color: "#1e4bd1", textColor: "#fff", ctaPreposition: "no KaBuM!" },
  americanas: {
    label: "Americanas",
    color: "#e60014",
    textColor: "#fff",
    ctaPreposition: "nas Americanas",
  },
  nike: { label: "Nike", color: "#111111", textColor: "#fff", ctaPreposition: "na Nike" },
  olympikus: {
    label: "Olympikus",
    color: "#0a8a4a",
    textColor: "#fff",
    ctaPreposition: "na Olympikus",
  },
};

export function getPlatformInfo(platform: string): PlatformInfo {
  return (
    PLATFORM_INFO[platform] ?? {
      label: platform,
      color: "#14110c",
      textColor: "#fff",
      ctaPreposition: `em ${platform}`,
    }
  );
}
