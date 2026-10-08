/** Pool de palavras-chave de busca Shopee, compartilhado por source-deals (Instagram) e source-group-fill (grupo WhatsApp). */
export const KEYWORD_POOL = [
  "fone bluetooth", "carregador rápido", "organizador de armário", "luminária led",
  "mochila notebook", "escova secadora", "umidificador ar led", "suporte celular carro",
  "caixa de som bluetooth", "massageador eletrico", "mini ventilador usb", "aromatizador difusor",
  "kit shorts masculino academia", "organizador maquiagem", "mini impressora portatil",
  "relogio smartwatch", "camera seguranca wifi", "air fryer", "panela eletrica", "tapete pet",
  "luminaria projetor estrelas", "espremedor eletrico portatil", "sensor movimento led",
  "kit ferramentas", "capa celular", "mochila feminina", "tenis esportivo", "bolsa termica",
  "pelucia realista", "boneco antiestresse elastico", "brinquedo articulado", "squishy fidget",
  "brinquedo curioso adulto", "gadget engraçado presente", "brinquedo interativo pet",
  // Dia das Crianças (12/10) chegando (Heber, 2026-09-22) — brinquedo
  // infantil de verdade, não só novidade/antiestresse adulto.
  "brinquedo educativo infantil", "boneca brinquedo", "carrinho controle remoto",
  "brinquedo montessori", "jogo infantil", "kit brinquedo menino", "brinquedo bebe",
  "pista carrinho brinquedo",
  // Achado real (2026-09-22, debate com o Heber sobre o grupo WhatsApp
  // só postar TV/celular/tablet/pet sempre): moda, móveis, papelaria,
  // alimentos, viagem e livros tinham ZERO keyword própria — mesmo bug
  // do brinquedos, seis categorias de vez. `guessCategorySlug`
  // (categorize.ts) também ganhou entrada nova pras que faltavam.
  "vestido feminino verão", "camiseta masculina básica", "jaqueta corta vento",
  "mesa de escritorio dobravel", "estante organizadora livros", "sofa retratil 2 lugares",
  "caderno universitario capa dura", "kit canetas coloridas", "mochila escolar juvenil",
  "cafe gourmet grãos", "kit tempero gourmet", "snack saudavel fit",
  "mala de viagem com rodinha", "necessaire viagem organizadora", "travesseiro de pescoco viagem",
  "livro infantil ilustrado", "livro autoajuda best seller", "livro de colorir adulto",
  // Heber, 2026-09-23: "não vi ferramentas, eletrodomésticos como
  // geladeira, tvs, não vi tbm microondas, fogão, luminárias modernas".
  // "kit ferramentas" já existia mas era a ÚNICA keyword da categoria
  // inteira; geladeira/fogão/microondas/TV grande nunca tiveram keyword
  // nenhuma (só gadget pequeno tipo "mini ventilador" e "caixa de som"
  // apareciam, nunca eletrodoméstico de verdade).
  "furadeira parafusadeira bateria", "trena a laser digital", "chave de fenda kit profissional",
  "geladeira frost free", "fogão 4 bocas mesa vidro", "microondas 20 litros", "cooktop 4 bocas",
  "tv led 32 polegadas smart", "tv 43 polegadas 4k",
  "luminária pendente moderna", "arandela led parede moderna",
];
