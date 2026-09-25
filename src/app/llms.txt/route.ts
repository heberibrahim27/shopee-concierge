import { NextResponse } from "next/server";
import { SITE_CATEGORIES } from "../../lib/site/categories";

export const dynamic = "force-static";

/**
 * llms.txt -- mapa curado do site pra assistente de IA/agente de busca
 * (spec 2026, ver memória project_llms_txt_shipped). Não é sitemap.xml
 * (isso já existe e é completo); aqui é um resumo enxuto e legível.
 * Categorias reais mantidas em código (SITE_CATEGORIES), sem hardcode
 * duplicado.
 */
const SITE_URL = "https://descontochegando.com.br";

// Curadoria: as 10 categorias com mais produto real no catálogo
// (checado 2026-09-25) -- a spec pede ~10-20 links curados, não o
// sitemap inteiro.
const TOP_CATEGORY_SLUGS = [
  "casa",
  "esporte",
  "brinquedos",
  "eletronicos",
  "saude",
  "moveis",
  "pet",
  "bebes",
  "games",
  "automotivo",
];

export async function GET() {
  const topCategories = TOP_CATEGORY_SLUGS.map((slug) => SITE_CATEGORIES.find((c) => c.slug === slug)).filter(
    (c): c is (typeof SITE_CATEGORIES)[number] => Boolean(c)
  );

  const lines = [
    "# Desconto Chegando",
    "",
    "> Comparador de preços independente: curadoria diária de ofertas reais da Shopee e outros marketplaces brasileiros (Mercado Livre, Awin/Nike/KaBuM/Olympikus). Mostra o menor preço encontrado por produto, com desconto real calculado sobre o histórico, não preço inflado.",
    "",
    "Não vendemos nem processamos pagamento -- a compra é sempre direto na loja de origem. Links de produto podem gerar comissão de afiliado para o Desconto Chegando, sem custo extra pro comprador.",
    "",
    "## Páginas principais",
    `- [Início](${SITE_URL}/): ofertas publicadas nas últimas 24h`,
    `- [Busca](${SITE_URL}/busca): buscar produto específico por nome`,
    `- [Cupons](${SITE_URL}/cupons): cupons de desconto ativos por loja`,
    `- [Categorias](${SITE_URL}/categorias): todas as categorias de produto`,
    "",
    "## Categorias com mais ofertas",
    ...topCategories.map((c) => `- [${c.label}](${SITE_URL}/categoria/${c.slug})`),
  ];

  return new NextResponse(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
