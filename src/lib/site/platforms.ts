/**
 * Metadados de marketplace pra exibição. Até 2026-09-25 só rótulo e cor
 * (decisão de não usar logo de terceiro); Heber pediu explicitamente pra
 * seguir o padrão do Cuponomia e mostrar a logo real da loja nos cards de
 * cupom -- uso nominativo/informativo pra identificar a loja de um cupom
 * de afiliado é prática padrão de qualquer comparador de preço real
 * (Cuponomia, Zoom, Promobit fazem o mesmo). `logoUrl` aponta pro arquivo
 * baixado direto do site oficial de cada loja (ver public/lojas-logos/);
 * loja sem logo baixado ainda cai no badge de texto+cor que já existia.
 * `shopee` e (desde 2026-09-15, via feed de produto da Awin) `nike`/
 * `olympikus`/`kabum` têm dado de verdade; os demais existem aqui pra
 * quando a integração de cada um for feita.
 */
export interface PlatformInfo {
  label: string;
  color: string;
  textColor: string;
  /** Pra montar "Ver oferta {ctaPreposition}" ("na Shopee", "no Mercado Livre"...). */
  ctaPreposition: string;
  /** Logo real baixada do site oficial da loja (public/lojas-logos/) -- ausente = cai no badge de texto+cor. */
  logoUrl?: string;
  /** Fundo do quadrado da logo -- branco por padrão; só precisa de outra cor quando o arquivo é uma versão monocromática branca (ex. Malwee, feita pra fundo escuro do site deles). */
  logoBg?: string;
}

export const PLATFORM_INFO: Record<string, PlatformInfo> = {
  shopee: {
    label: "Shopee",
    color: "#ee4d2d",
    textColor: "#fff",
    ctaPreposition: "na Shopee",
    logoUrl: "/lojas-logos/shopee.png",
  },
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
  kabum: {
    label: "KaBuM!",
    color: "#1e4bd1",
    textColor: "#fff",
    ctaPreposition: "no KaBuM!",
    logoUrl: "/lojas-logos/kabum.svg",
  },
  americanas: {
    label: "Americanas",
    color: "#e60014",
    textColor: "#fff",
    ctaPreposition: "nas Americanas",
  },
  nike: {
    label: "Nike",
    color: "#111111",
    textColor: "#fff",
    ctaPreposition: "na Nike",
    logoUrl: "/lojas-logos/nike.svg",
  },
  olympikus: {
    label: "Olympikus",
    color: "#0a8a4a",
    textColor: "#fff",
    ctaPreposition: "na Olympikus",
    logoUrl: "/lojas-logos/olympikus.svg",
  },
};

/**
 * Lojas da rede Lomadee (`coupon.platform === "lomadee"`) não têm slug de
 * plataforma próprio -- `advertiser_name` é o nome real da loja (ver
 * getPlatformInfo acima, que trata "lomadee" como genérico). Mapa à parte
 * só com logo, pelo nome do anunciante normalizado (minúsculo, sem
 * acento), pras poucas lojas Lomadee já com logo baixada.
 */
const ADVERTISER_LOGO_BY_NAME: Record<string, { logoUrl: string; logoBg?: string }> = {
  // Logo é uma versão só-branca (feita pro fundo escuro do header da
  // Malwee) -- some se colocada sobre o fundo branco do card, por isso o
  // fundo escuro próprio aqui.
  malwee: { logoUrl: "/lojas-logos/malwee.svg", logoBg: "#1a1a1a" },
};

export function getAdvertiserLogo(advertiserName: string | null): { logoUrl: string; logoBg?: string } | null {
  if (!advertiserName) return null;
  const key = advertiserName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ADVERTISER_LOGO_BY_NAME[key] ?? null;
}

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
