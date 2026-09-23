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
  // Achado real (2026-09-22, debate com o Heber sobre variedade no
  // grupo WhatsApp): papelaria, alimentos, viagem e livros tinham 0
  // produto no catálogo inteiro — nem a busca diária ia atrás delas,
  // nem esse classificador sabia reconhecê-las se aparecessem por
  // acaso numa outra busca. Corrigindo os dois lados juntos (ver
  // KEYWORD_POOL em source-deals/route.ts). Fica ANTES de "infantil" de
  // propósito — "livro infantil" precisa cair em livros, não em
  // infantil (achado testando: a ordem do objeto decide qual categoria
  // vence primeiro, "infantil" capturava tudo que continha a palavra).
  papelaria: ["caderno", "caneta", "mochila escolar", "estojo escolar", "lápis", "lapis", "planner", "agenda"],
  alimentos: ["café gourmet", "cafe gourmet", "tempero", "achocolatado", "snack", "chocolate", "biscoito"],
  viagem: ["mala de viagem", "mala viagem", "necessaire", "nécessaire", "travesseiro de pescoço", "travesseiro de pescoco", "travesseiro pescoco", "organizador de viagem"],
  livros: ["livro infantil", "livro autoajuda", "livro de colorir", "livro "],
  // Achado real (2026-09-22): faltava "brinquedos" nesse mapa inteiro —
  // produto vindo da busca diária da Shopee (persistOfferSnapshot) nunca
  // tinha categoria salva, então nenhum filtro por categoria conseguia
  // achar brinquedo nenhum, mesmo com produto real no banco.
  brinquedos: ["brinquedo", "boneca", "boneco", "pelúcia", "pelucia", "squishy", "fidget", "antiestresse", "anti-estresse", "carrinho de", "blocos de montar", "quebra-cabeça", "quebra cabeça", "montessori"],
  infantil: ["infantil", "criança", "bebê conforto"],
  bebes: ["bebê", "bebe", "fralda", "mamadeira"],
  pet: ["cachorro", "gato", "pet ", "ração", "coleira"],
  games: ["controle", "playstation", "xbox", "console", "gamer"],
  automotivo: ["automotivo", "carro", "pneu", "farol"],
  saude: ["vitamina", "suplemento", "termômetro", "massageador"],
  ferramentas: ["furadeira", "parafusadeira", "ferramenta", "chave de fenda"],
  // "mesa" sozinho é ambíguo demais — acha "fogão de mesa" (é
  // eletrodoméstico, não móvel). Achado real testando (2026-09-23,
  // debate sobre keyword de eletrodoméstico nova). Usa termos
  // compostos específicos de móvel em vez da palavra solta.
  moveis: ["sofá", "sofa", "mesa de jantar", "mesa de centro", "mesa de escritorio", "mesa lateral", "cadeira", "estante", "cama box", "rack tv", "guarda roupa"],
};

export function guessCategorySlug(text: string): string {
  const name = text.toLowerCase();
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => name.includes(k))) return slug;
  }
  return "casa";
}
