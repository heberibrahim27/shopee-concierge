/**
 * Heurística leve por palavra-chave pra mapear texto livre (nome de
 * produto, categoria solta de IA de visão) pra um slug da taxonomia
 * fechada do site (`SITE_CATEGORIES`). Extraído do cron da Lomadee
 * (2026-09-22) pra reaproveitar no Opportunity Scorer do Concierge —
 * os dois precisam da mesma normalização (produto sem categoria
 * confiável de fonte nenhuma). "casa" é o catch-all, não uma aposta forte.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Achado real (2026-09-25, Heber: "categoria nada com nada" em /categoria/
  // casa): "casa" é o catch-all, e placa de vídeo/processador/SSD/drone/
  // monitor (nenhum keyword batia) caíam lá por padrão -- produto de R$20 mil
  // (controladora de DJ, drone, GPU) aparecendo como "Casa". Lista de
  // eletrônicos/informática ampliada com os termos reais que faltavam
  // (auditoria dos 20 produtos mais caros da categoria "casa").
  eletronicos: [
    "fone", "celular", "notebook", "tv ", "smart tv", "carregador", "mouse", "teclado", "caixa de som",
    "câmera", "camera", "placa de vídeo", "placa de video", "placa-mãe", "placa mãe", "placa mae",
    "processador", "ssd", "hd externo", "hd interno", "memória", "memoria", "ddr3", "ddr4", "ddr5",
    "monitor", "webcam", "roteador", "nobreak", "storage", "drone", "impressora", "fonte atx",
    "fonte de alimentação", "gabinete", "headset", "microfone", "water cooler", "air cooler", "ventoinha",
    "pasta térmica", "pasta termica", "pendrive", "cartão de memória", "cartao de memoria", "hub usb",
    "switch", "controladora para dj", "controladora de dj", "relógio", "relogio", "smartwatch",
    "smart watch", "filtro de linha", "régua de tomadas", "regua de tomadas",
  ],
  esporte: ["tênis", "tenis", "bicicleta", "bike", "academia", "musculação", "esteira", "halter"],
  // Achado real (2026-09-26, feed de "Mais Vendidos" da Shopee inteira --
  // ver getBestSellerOffers): mais da metade caía em "casa" (catch-all)
  // porque best-seller nacional é dominado por relógio/smartwatch,
  // suplemento e lingerie/moda íntima -- categorias que as keywords de
  // BUSCA (KEYWORD_POOL) nunca precisaram cobrir, já que ninguém aqui
  // buscava isso de propósito antes.
  // "escova alisadora"/"escova a vapor" ampliado 2026-09-25 (achado ao
  // vivo: busca por "escova alisadora a vapor" persistindo direto da
  // Shopee caía em "casa", faltava termo de cuidado capilar/beleza).
  beleza: [
    "maquiagem", "batom", "perfume", "shampoo", "creme", "skincare", "secador", "escova alisadora",
    "escova a vapor", "chapinha", "prancha de cabelo", "modelador de cabelo", "babyliss",
    "protetor solar", "clareador facial", "sabonete líquido", "sabonete liquido",
  ],
  // Achado real (2026-09-26, Heber: "categoria casa tá estranha, roupas
  // lá não seria moda?"): chinelo/sandália/top de roupa nunca tinham
  // keyword -- caíam no catch-all. "top" sozinho é perigoso (bateria
  // dentro de "Desktop"/"Cooktop"/"Kitop"), por isso só entra como
  // termo composto ("top feminino" etc.), nunca a palavra solta -- ver
  // `matchesKeyword` abaixo, que agora exige fronteira de palavra pra
  // keyword de uma palavra só, mas continua checando substring pra frase.
  moda: [
    "camiseta", "calça", "vestido", "jaqueta", "blusa", "jeans", "bermuda", "calcinha", "sutiã",
    "sutia", "legging", "camisola", "pijama", "lingerie", "cinta modeladora", "bolsa feminina",
    "bolsa de ombro", "bolsa tote", "bolsa feminina de ombro", "bolsa estilosa", "meia", "cueca",
    "bota", "coturno", "chinelo", "sandália", "sandalia", "top feminino", "top cropped", "cropped",
    "regata", "camisa térmica", "camisa termica", "moletom", "saia",
  ],
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
  saude: [
    "vitamina", "suplemento", "termômetro", "termometro", "massageador", "massagem", "cápsula",
    "capsula", "comprimido", "melatonina", "magnésio", "magnesio", "inositol", "whey protein",
    "colágeno", "colageno", "seringa de insulina", "creatina", "oxímetro", "oximetro",
  ],
  // Achado real (2026-09-26, Heber: "pesquisei finca pinos... não achei
  // ele em ferramentas"): produto persistido certo pela busca ao vivo,
  // mas "pistola finca pino"/"fixadora" não batiam em nenhuma keyword
  // de ferramentas -- caía no catch-all "casa" mesmo sendo ferramenta
  // de construção de verdade.
  ferramentas: [
    "furadeira", "parafusadeira", "ferramenta", "chave de fenda", "finca pino", "finca-pino",
    "pistola de fixação", "pistola de fixacao", "fixadora", "serra tico-tico", "serra circular",
    "esmerilhadeira", "lixadeira", "solda", "soldador", "multímetro", "multimetro", "nível a laser",
    "nivel a laser", "trena",
  ],
  // "mesa" sozinho é ambíguo demais — acha "fogão de mesa" (é
  // eletrodoméstico, não móvel). Achado real testando (2026-09-23,
  // debate sobre keyword de eletrodoméstico nova). Usa termos
  // compostos específicos de móvel em vez da palavra solta.
  moveis: ["sofá", "sofa", "mesa de jantar", "mesa de centro", "mesa de escritorio", "mesa lateral", "cadeira", "estante", "cama box", "rack tv", "guarda roupa"],
};

// Achado real (2026-09-26, revisão pedida pelo Heber: "precisamos
// melhorar a categorização"): até aqui era `name.includes(keyword)`
// puro -- funciona bem pra frase composta ("mesa de jantar"), mas uma
// keyword de UMA palavra só (ex. "top", "mesa") vira risco real de
// falso positivo escondido dentro de outra palavra ("Desktop",
// "Cooktop"). Pra keyword de uma palavra só, exige fronteira real
// (não pode ter letra colada antes/depois); frase composta continua
// checando substring puro, já é específica o suficiente por natureza.
function matchesKeyword(name: string, keyword: string): boolean {
  if (keyword.includes(" ")) return name.includes(keyword);
  const idx = name.indexOf(keyword);
  if (idx === -1) return false;
  const isLetter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);
  const before = name[idx - 1];
  const after = name[idx + keyword.length];
  return !isLetter(before) && !isLetter(after);
}

export function guessCategorySlug(text: string): string {
  const name = text.toLowerCase();
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => matchesKeyword(name, k.toLowerCase()))) return slug;
  }
  return "casa";
}
