/**
 * Banners do carrossel do topo. Por enquanto uma lista fixa em código (só
 * 2 itens: a arte própria do site + 1 banner oficial da Awin) — quando
 * tivermos mais criativos de anunciantes aprovados, vira tabela como
 * `coupons`. Cada banner de anunciante usa o mesmo link de rastreio
 * `cread.php` dos cupons (ver src/lib/site/coupons.ts) — nunca aponta
 * direto pro site do anunciante, senão perde a comissão.
 */
export interface SiteBanner {
  id: string;
  imageUrl: string;
  href: string;
  alt: string;
  platform: string | null;
}

function awinTrackingUrl(advertiserId: number, targetUrl: string): string {
  return `https://www.awin1.com/cread.php?awinmid=${advertiserId}&awinaffid=2596713&ued=${encodeURIComponent(targetUrl)}`;
}

export const SITE_BANNERS: SiteBanner[] = [
  {
    id: "site-principal",
    imageUrl: "/BANNER-FINAL.png",
    href: "/categorias",
    alt: "Compare e economize: os menores preços dos maiores marketplaces, tudo em um só lugar",
    platform: null,
  },
  {
    id: "olympikus-semana-do-cliente",
    imageUrl: "https://a1.awin1.com/ads/awin/17698/imgc_pia_de_970x250-1789412594096.jpg",
    href: awinTrackingUrl(17698, "https://www.olympikus.com.br/semana-do-cliente"),
    alt: "Olympikus — Semana do Cliente, até 20% de desconto",
    platform: "olympikus",
  },
];
