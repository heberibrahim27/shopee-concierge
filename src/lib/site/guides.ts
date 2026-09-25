/**
 * Guias de compra editoriais — conteúdo próprio (não gerado a partir de
 * template raso) ligado direto ao catálogo real via slug de produto.
 * Pedido do Heber (2026-09-25), depois de debate com o ChatGPT sobre
 * monetização: não é blog genérico pra "encher" AdSense, é conteúdo que
 * ajuda quem ainda está decidindo o que comprar, usando dado real do
 * site (preço, comparação entre lojas, histórico) em vez de texto de
 * enchimento. Cada guia foi escrito só depois de conferir no banco que
 * o produto citado existe de verdade e com o preço/atributo certo — ver
 * FEITO.md do dia pra registro da checagem.
 *
 * Os produtos são resolvidos AO VIVO (getCachedProduct) na página, não
 * gravados aqui como texto — preço nunca fica desatualizado no guia.
 */

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "products"; slugs: string[]; note?: string }
  | { type: "compare"; aSlug: string; bSlug: string; note?: string };

export interface GuideDefinition {
  slug: string;
  title: string;
  description: string;
  intro: string;
  blocks: GuideBlock[];
  categorySlug?: string;
}

export const GUIDES: GuideDefinition[] = [
  {
    slug: "kabum-ou-shopee-onde-ssd-e-mais-barato",
    title: "Kabum ou Shopee: onde o SSD sai mais barato?",
    description:
      "Comparamos o mesmo SSD, exatamente o mesmo modelo, em Kabum e Shopee — o preço muda mais do que parece.",
    intro:
      "Uma dúvida real de quem está comprando SSD: o mesmo modelo, com o mesmo código de peça do fabricante, pode custar bem diferente dependendo da loja. Não tem um vencedor fixo — às vezes a Shopee sai na frente, às vezes a Kabum. É exatamente por isso que o Desconto Chegando compara as duas automaticamente em cada produto, em vez de indicar sempre a mesma loja.",
    blocks: [
      {
        type: "compare",
        aSlug: "ssd-kingston-nv3-1tb-m-2-2280-pcie-4-0-x4-nvme-leitura-6000-kyd10",
        bSlug: "kingston-nv3-1tb-m-2-2280-nvme-ssd-pcie-4-0-gen-4x4-up-to-60-1p4j4",
        note: "Mesmo SSD Kingston NV3 1TB, mesmo código de peça (SNV3S/1000G) — aqui a Shopee costuma sair mais em conta.",
      },
      {
        type: "compare",
        aSlug: "ssd-rise-mode-gamer-line-480gb-2-5-sata-iii-leitura-530-mb-s-cpp8b",
        bSlug: "ssd-rise-mode-gamer-line-480gb-2-5-sata-iii-6-gb-s-leitura-5-gv6ak",
        note: "Já nesse Rise Mode 480GB, a diferença inverte: a Kabum costuma ser bem mais barata que a Shopee.",
      },
      {
        type: "p",
        text: "O motivo é simples: cada loja define o próprio preço e promoção, independente da outra. Por isso vale sempre olhar as duas antes de fechar a compra — e é isso que a gente já faz automaticamente na página de cada produto que tem comparação disponível.",
      },
    ],
  },
  {
    slug: "ssd-nvme-ou-sata-qual-comprar",
    title: "SSD NVMe ou SATA: qual a diferença na prática?",
    description:
      "NVMe e SATA são dois tipos de SSD bem diferentes na velocidade e no preço — veja qual faz sentido pro seu uso.",
    intro:
      "Os dois guardam arquivo e deixam o computador mais rápido que um HD comum, mas não são a mesma coisa. A diferença está na conexão com a placa-mãe, e isso muda bastante tanto a velocidade quanto o preço.",
    blocks: [
      {
        type: "h2",
        text: "SATA: o mais barato e mais compatível",
      },
      {
        type: "p",
        text: "Usa a mesma conexão de um HD comum (por isso serve pra trocar um HD velho sem complicação). É mais lento que o NVMe, mas ainda assim uma evolução enorme sobre HD mecânico — pra quem só quer o computador ligando e abrindo programa mais rápido, geralmente já resolve.",
      },
      {
        type: "products",
        slugs: ["ssd-kingston-a400-240gb-2-5-sata-iii-leitura-500-mb-s-gravac-cxecl"],
      },
      {
        type: "h2",
        text: "NVMe: mais rápido, precisa de slot próprio (M.2)",
      },
      {
        type: "p",
        text: "Conecta direto na placa-mãe por um slot M.2, sem cabo, e é várias vezes mais rápido que o SATA. Faz mais diferença em edição de vídeo, jogos com carregamento pesado, ou quem simplesmente quer o desempenho máximo. Nem toda placa-mãe/notebook tem esse slot — vale conferir antes de comprar.",
      },
      {
        type: "products",
        slugs: ["ssd-kingston-nv3-1tb-m-2-2280-pcie-4-0-x4-nvme-leitura-6000-kyd10"],
      },
      {
        type: "p",
        text: "Resumindo: se o orçamento é curto ou é só uma troca de HD velho, SATA já resolve bem. Se o uso é mais pesado (ou o computador já tem o slot M.2 disponível), o NVMe compensa a diferença de preço.",
      },
    ],
  },
  {
    slug: "tv-4k-50-polegadas-o-que-olhar-antes-de-comprar",
    title: "TV 4K de 50\": o que olhar antes de comprar",
    description:
      "Resolução, taxa de atualização e HDMI são os pontos que realmente importam — e o mesmo modelo pode custar diferente em cada loja.",
    intro:
      "Numa TV 4K de 50\", três coisas pesam mais na hora de decidir: a resolução de verdade (4K = Ultra HD, 4x mais pixels que Full HD), quantas entradas HDMI ela tem (pra videogame, streaming box, etc.) e se tem HDR (contraste e cor mais próximos do real). Fora isso, o preço do MESMO modelo muda de loja pra loja — vale sempre comparar antes de fechar.",
    blocks: [
      {
        type: "compare",
        aSlug: "smart-tv-philips-50-4k-50pug7300-comando-de-voz-bluetooth-12sxc",
        bSlug: "smart-tv-50-dled-philips-50pug7300-78-com-bluetooth-5-0-3-hd-aqa69",
        note: "Mesma TV, Philips 50PUG7300, em lojas diferentes — repare como o preço muda pro mesmo produto.",
      },
      {
        type: "p",
        text: "Além do preço, olhe a taxa de atualização (Hz) se for usar pra jogo, e confirme quantas portas HDMI 2.1 tem se pensa em console novo — nem toda TV 4K de entrada vem com isso.",
      },
    ],
  },
  {
    slug: "notebook-ate-4000-reais-os-mais-em-conta",
    title: "Notebook até R$4.000: os modelos mais em conta hoje",
    description:
      "Levantamento real do catálogo: hoje o notebook mais barato que vendemos custa a partir de R$3.199 — veja as opções.",
    intro:
      "Conferimos direto no nosso catálogo quais notebooks reais estão saindo mais baratos agora — nada de faixa de preço genérica, é o que realmente está à venda hoje. A entrada de verdade começa por volta de R$3.200, não abaixo disso.",
    blocks: [
      {
        type: "products",
        slugs: [
          "notebook-lenovo-ideapad-slim-3-amd-ryzen-5-7535hs-8gb-amd-ra-1x5s5",
          "notebook-lenovo-ideapad-1-15iru7-intel-core-i3-1315u-8gb-ssd-xit8w",
          "notebook-acer-aspire-5-a515-45-r478-amd-ryzen-5-5500u-16gb-r-1s92p",
        ],
      },
      {
        type: "p",
        text: "Pra uso do dia a dia (navegar, trabalhar em planilha/texto, videochamada), 8GB de RAM e SSD já resolvem bem. Se o uso envolve edição de imagem/vídeo ou jogo mais pesado, vale mirar em RAM 16GB pra cima — geralmente já entra na faixa um pouco acima dessa.",
      },
    ],
  },
  {
    slug: "tenis-olympikus-guia-dos-modelos",
    title: "Tênis Olympikus: guia rápido dos modelos",
    description: "Conferimos no catálogo os modelos reais disponíveis hoje e o que diferencia cada linha.",
    intro:
      "A Olympikus tem várias linhas de tênis, e o nome do modelo já indica bastante sobre a proposta de cada um. Reunimos aqui os que estão disponíveis agora, do mais simples ao mais em conta.",
    blocks: [
      {
        type: "products",
        slugs: [
          "tenis-olympikus-casual-feminino-oly-001-37-branco-ltcgy",
          "tenis-olympikus-venus-feminino-37-azul-ltchb",
          "tenis-olympikus-angel-feminino-1c9b1",
          "tenis-olympikus-mantra-feminino-37-preto-ltcis",
        ],
        note: "Preço e disponibilidade de numeração mudam com frequência — confira o estoque atual na página de cada modelo.",
      },
      {
        type: "p",
        text: "Antes de comprar, vale conferir a tabela de numeração na própria página do produto — calçado costuma variar um pouco de numeração entre marcas.",
      },
    ],
  },
  {
    slug: "como-sabemos-se-o-preco-e-bom",
    title: "Como sabemos se um preço é realmente bom",
    description:
      "Explicamos o selo de \"menor preço\" e \"atualizado há X\" que aparece nas páginas de produto — e como funciona de verdade por trás.",
    intro:
      "Todo produto no Desconto Chegando guarda um histórico real de preço, não só o valor de agora. É esse histórico que decide quando mostramos o selo de \"menor preço\" — e ele só aparece quando o preço de hoje realmente bate ou fica abaixo do menor preço já registrado pra aquele produto, com pelo menos alguns dias de acompanhamento. Nunca é um selo decorativo.",
    blocks: [
      {
        type: "h2",
        text: "\"Atualizado há X\" também é real",
      },
      {
        type: "p",
        text: "Esse texto vem direto da última vez que conferimos o preço daquele produto na loja de origem, não é um texto fixo. Produtos com bastante procura são verificados com mais frequência.",
      },
      {
        type: "products",
        slugs: [
          "fogao-4-bocas-suggar-cook-glass-mesa-de-vidro-preto-bivolt-f-17l5h",
          "massageador-eletrico-portatil-alivio-p-pescoco-3-intensidade-4faz1",
        ],
        note: "Exemplos reais de produtos com histórico de preço acompanhado ao longo do tempo.",
      },
      {
        type: "p",
        text: "Isso significa que, em produtos sem histórico suficiente ainda (recém-chegados no catálogo), o selo de menor preço simplesmente não aparece — preferimos não mostrar nada a mostrar um selo sem base real por trás.",
      },
    ],
  },
];

export function getGuideBySlug(slug: string): GuideDefinition | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
