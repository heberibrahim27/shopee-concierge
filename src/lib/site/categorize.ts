/**
 * Heurística leve por palavra-chave pra mapear texto livre (nome de
 * produto, categoria solta de IA de visão) pra um slug da taxonomia
 * fechada do site (`SITE_CATEGORIES`). Extraído do cron da Lomadee
 * (2026-09-22) pra reaproveitar no Opportunity Scorer do Concierge —
 * os dois precisam da mesma normalização (produto sem categoria
 * confiável de fonte nenhuma). "casa" é o catch-all, não uma aposta forte.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  eletronicos: ["fone", "celular", "notebook", "tv ", "smart tv", "carregador", "mouse", "teclado", "caixa de som", "câmera", "camera"],
  esporte: ["tênis", "tenis", "bicicleta", "bike", "academia", "musculação", "esteira", "halter"],
  beleza: ["maquiagem", "batom", "perfume", "shampoo", "creme", "skincare", "secador"],
  moda: ["camiseta", "calça", "vestido", "jaqueta", "blusa", "jeans", "bermuda"],
  infantil: ["infantil", "criança", "bebê conforto"],
  bebes: ["bebê", "bebe", "fralda", "mamadeira"],
  pet: ["cachorro", "gato", "pet ", "ração", "coleira"],
  games: ["controle", "playstation", "xbox", "console", "gamer"],
  automotivo: ["automotivo", "carro", "pneu", "farol"],
  saude: ["vitamina", "suplemento", "termômetro", "massageador"],
  ferramentas: ["furadeira", "parafusadeira", "ferramenta", "chave de fenda"],
  moveis: ["sofá", "sofa", "mesa", "cadeira", "estante", "cama box"],
};

export function guessCategorySlug(text: string): string {
  const name = text.toLowerCase();
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => name.includes(k))) return slug;
  }
  return "casa";
}
