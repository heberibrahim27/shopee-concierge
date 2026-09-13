/**
 * Ranking do concierge — DIFERENTE do score comercial usado no plano antigo
 * de "oferta em massa". Aqui a ordem é:
 *   1) atender requisitos obrigatórios ditos pelo usuário (exigenciaUsuario)
 *   2) correspondência visual/funcional com o que foi observado na foto
 *      (comparação REAL de imagem via compareCandidatesVisually, quando
 *      disponível — ver compare.ts; cai pro heurístico textual só se a
 *      comparação visual não rodar, ex: sem OPENAI_API_KEY ou erro de API)
 *   3) proximidade da faixa de preço estimada, qualidade (nota) e preço
 *   4) comissão só como desempate entre opções igualmente úteis
 *
 * Cada resultado sai rotulado com o tipo de correspondência — nunca
 * "equivalente" sem essa confirmação. Candidatos marcados como
 * "nao_relacionado" pela comparação visual são descartados.
 */
import { ShopeeProductOffer } from "../shopee/types";
import { ImageObservation } from "./recognize";
import { VisualComparison } from "./compare";

export type MatchType = "modelo_identificado" | "alternativa_funcional" | "semelhante_visual";

export interface RankedCandidate {
  offer: ShopeeProductOffer;
  matchType: MatchType;
  score: number;
}

const MIN_SALES = 5; // remove itens sem histórico de venda nenhuma

/**
 * Grupos de material/uso mutuamente incompatíveis — heurística leve por
 * palavra-chave (não é extração de atributo de verdade), adicionada em
 * 13/09/2026 por sugestão do debate técnico com o ChatGPT sobre o bug da
 * bermuda jeans aparecendo pra uma foto de bermuda tactel: contagem de
 * palavras pra medir "especificidade" do termo de busca se mostrou fraca
 * (foi tentada e revertida, ver histórico deste arquivo/confidenceRouter),
 * e similaridade textual pura (embeddings) também não resolveria — "bermuda
 * tactel" e "bermuda jeans" ficam parecidos pra qualquer medida de texto,
 * mesmo sendo produtos incompatíveis. Em vez disso, quando o fallback
 * textual é a ÚNICA coisa decidindo (nenhum sinal visual real), um
 * candidato que bate um material/uso de um GRUPO DIFERENTE do observado na
 * foto é descartado na hora, mesmo que o termo de busca bata — bloqueio
 * duro por atributo, não só por similaridade de texto.
 */
const MATERIAL_GROUPS: string[][] = [
  ["tactel", "dry fit", "dryfit", "poliester", "poliéster", "elastano", "lycra", "microfibra", "esportiv"],
  ["jeans", "sarja", "brim", "denim"],
  ["couro", "courino", "sintetico", "sintético"],
  ["algodao", "algodão", "moletom", "suede", "malha"],
];

const USO_GROUPS: string[][] = [
  ["esportivo", "esportiva", "academia", "corrida", "treino", "fitness"],
  ["casual", "dia a dia", "passeio"],
  ["social", "formal", "trabalho", "terno"],
  ["praia", "banho", "piscina"],
];

function groupIndexOf(text: string | undefined, groups: string[][]): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].some((kw) => lower.includes(kw))) return i;
  }
  return null;
}

/**
 * true quando o produto claramente pertence a um grupo DIFERENTE do
 * atributo observado na foto (os dois batem grupos conhecidos, mas
 * grupos diferentes) — quando qualquer um dos dois lados não bate nenhum
 * grupo conhecido, não dá pra afirmar conflito (nem por isso é considerado
 * compatível "à toa": o candidato ainda depende do termo de busca bater).
 */
function hasAttributeConflict(observedValue: string | undefined, productName: string, groups: string[][]): boolean {
  const observedGroup = groupIndexOf(observedValue, groups);
  if (observedGroup === null) return false;
  const productGroup = groupIndexOf(productName, groups);
  return productGroup !== null && productGroup !== observedGroup;
}

export function rankCandidates(
  candidates: ShopeeProductOffer[],
  observation: ImageObservation,
  visualComparisons?: Map<string, VisualComparison>
): RankedCandidate[] {
  const filtered = candidates.filter((c) => {
    const hasEssentials = Boolean(c.productLink && c.offerLink && c.priceMin);
    const visual = visualComparisons?.get(c.itemId);
    if (visual?.matchType === "nao_relacionado") return false;
    return hasEssentials && c.sales >= MIN_SALES;
  });

  // Remove duplicado por loja+produto similar (dedupe simples por itemId)
  const seen = new Set<string>();
  const deduped = filtered.filter((c) => {
    if (seen.has(c.itemId)) return false;
    seen.add(c.itemId);
    return true;
  });

  // Classifica o tipo de correspondência ANTES de pontuar, num passo próprio,
  // pra também poder descartar aqui quem nem bate o termo de busca mais
  // específico — não só quem a comparação visual rejeitou. Isso importa
  // sobretudo quando a comparação visual NÃO roda (sem OPENAI_API_KEY, erro
  // de API, JSON inválido etc.) — bug real (11/09/2026): mandou foto de uma
  // lata de cera de carnaúba cuja embalagem tem escrito "ACABAMENTOS", esse
  // termo genérico virou keyword de busca, e como o fallback textual antigo
  // classificava QUALQUER não-match como "semelhante_visual" (nunca
  // descartava), uma torneira e uma moldura de teto (ambos produtos de
  // "acabamento" de construção, sem nenhuma relação com cera) entraram no
  // ranking normalmente e venceram nas categorias nota/venda.
  // A comparação visual "rodou de verdade" se devolveu pelo menos 1
  // resultado — usado pra decidir o que fazer com um candidato que não tem
  // entrada no mapa (ver comentário abaixo). Mapa vazio é indistinguível
  // entre "nunca rodou" (sem OPENAI_API_KEY, erro de API, JSON inválido) e
  // "rodou só que não achou nada" — nos dois casos, sem NENHUM sinal visual,
  // preservamos o comportamento antigo de cair pro fallback textual (melhor
  // esforço) pra não devolver "não encontrei nada" à toa.
  const hasAnyVisualSignal = Boolean(visualComparisons && visualComparisons.size > 0);

  const classified = deduped
    .map((offer) => {
      const visual = visualComparisons?.get(offer.itemId);
      let matchType: MatchType | "nao_relacionado";
      if (visual) {
        matchType = visual.matchType;
      } else if (hasAnyVisualSignal) {
        // Bug real (13/09/2026): comparação visual rodou e confirmou vários
        // candidatos, mas um item específico ficou de fora da resposta do
        // modelo (imagem que não carregou, resposta truncada/incompleta
        // etc.) — antes disso, esse item "sem entrada no mapa" caía no MESMO
        // fallback textual usado quando a comparação visual não roda nunca,
        // e um match por substring solto num termo genérico deixou passar
        // um vaso de planta e um livro numa busca de bermuda de academia.
        // Já que o resto da lista TEM sinal visual real, um item sem
        // veredito não merece o benefício da dúvida do fallback textual —
        // é mais seguro descartar do que arriscar categoria errada.
        matchType = "nao_relacionado";
      } else {
        // Sem NENHUM sinal visual (comparação não rodou), só dá pra confiar
        // no termo de busca MAIS específico (o primeiro da lista, ver
        // recognize.ts — o resto é "específico -> genérico", então
        // termos[1+] podem ser palavras soltas tipo "acabamento", que
        // aparecem escritas em produtos de categorias inteiramente
        // diferentes). Bater só um termo genérico não vira mais
        // "semelhante_visual" (antes entrava no ranking mesmo sem nenhuma
        // relação real) — sem bater o termo específico, o candidato é
        // descartado (nao_relacionado).
        //
        // Bug real (13/09/2026, recorrência): mesmo um termo de 2 palavras
        // ("bermuda branca") pode bater literalmente no nome de um produto
        // de estilo bem diferente ("Bermuda branca rascada...", jeans),
        // porque .includes() só olha substring, não estilo — exigir mais
        // palavras aqui quebrava termos legítimos igualmente curtos (ex:
        // "tenis corrida"), então a defesa de verdade pra esse caso passou
        // pra decideEscalation (ver `semSinalVisual` em confidenceRouter.ts
        // e orchestrator.ts): sem NENHUM sinal visual real, o roteador
        // sempre escala pro modelo avançado antes de confiar nesse fallback
        // sozinho, e o resultado do perito é que decide se mostra algo.
        const nome = offer.productName.toLowerCase();
        const termoEspecifico = observation.termosDeBusca[0]?.toLowerCase();
        const bateuTermo = Boolean(termoEspecifico && nome.includes(termoEspecifico));
        // Bloqueio duro por atributo (13/09/2026, ver MATERIAL_GROUPS/
        // USO_GROUPS acima) — bater o termo de busca não basta mais se o
        // material ou uso observado na foto conflita com o do produto.
        const conflitoMaterial = hasAttributeConflict(observation.materialProvavel, offer.productName, MATERIAL_GROUPS);
        const conflitoUso = hasAttributeConflict(observation.usoOuEstilo, offer.productName, USO_GROUPS);
        matchType = bateuTermo && !conflitoMaterial && !conflitoUso ? "alternativa_funcional" : "nao_relacionado";
      }
      return { offer, matchType };
    })
    .filter(
      (c): c is { offer: ShopeeProductOffer; matchType: MatchType } => c.matchType !== "nao_relacionado"
    );

  const faixa = observation.faixaPrecoEstimadaBRL;
  // Quando a própria foto mostrava um preço legível (print de anúncio,
  // etiqueta), a faixa é ancorada num fato, não num chute — por isso a
  // penalidade por estar fora dela é bem mais forte (evita sugerir produto
  // 2-3x mais caro que o preço que a pessoa mostrou só porque tem mais
  // venda/nota; ver comentário em recognize.ts sobre o bug real que motivou isso)
  const priceIsAnchoredToVisiblePrice = typeof observation.precoVisivelNaFotoBRL === "number";
  const PRICE_PENALTY_MULTIPLIER = priceIsAnchoredToVisiblePrice ? 40 : 15;

  const ranked = classified.map(({ offer, matchType }) => {
    const rating = parseFloat(offer.ratingStar || "0");
    const commission = parseFloat(offer.commission || "0");
    const price = parseFloat(offer.priceMin || "0");

    // bônus por tipo de correspondência (a comparação visual é o sinal
    // mais forte de relevância — precisa pesar mais que nota/comissão)
    const matchBonus =
      matchType === "modelo_identificado" ? 40 : matchType === "alternativa_funcional" ? 20 : 0;

    // penalidade por estar fora da faixa de preço estimada (quando houver
    // uma estimativa) — não descarta, só reordena pra priorizar o que faz
    // sentido de preço antes do que só bate a categoria
    let pricePenalty = 0;
    if (faixa && price > 0) {
      if (price < faixa.min) {
        pricePenalty = ((faixa.min - price) / faixa.min) * PRICE_PENALTY_MULTIPLIER;
      } else if (price > faixa.max) {
        pricePenalty = ((price - faixa.max) / faixa.max) * PRICE_PENALTY_MULTIPLIER;
      }
    }

    // score: relevância visual pesa mais; nota e demanda vêm depois;
    // comissão só como desempate
    const score =
      matchBonus +
      rating * 5 +
      Math.log10(offer.sales + 1) * 5 +
      commission * 0.5 -
      pricePenalty;

    return { offer, matchType, score };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export interface HighlightedCandidate {
  label: string;
  candidate: RankedCandidate;
}

/**
 * Em vez de mandar os 3 melhores pelo score composto (que mistura relevância,
 * nota, venda e preço num número só — e por isso tendia a mandar 3 opções
 * parecidas, todas rotuladas só como "alternativa equivalente"), o Ibrahim
 * pediu pra mandar 3 opções com critério CLARO e diferente cada uma, pra
 * pessoa entender na hora por que aquela opção foi escolhida:
 *   1) menor preço
 *   2) melhor nota (desempate por quantidade de venda)
 *   3) mais vendida
 * Sempre dentro do conjunto já filtrado por relevância (o `ranked` recebido
 * aqui já veio de rankCandidates, que descarta "nao_relacionado" e itens sem
 * venda mínima) — nunca escolhe o mais barato/mais vendido geral, só entre o
 * que já faz sentido pra foto mandada.
 * Evita repetir o mesmo produto em duas categorias: se o mais barato também
 * for o mais vendido, por exemplo, a categoria "mais vendida" pula pro
 * próximo da lista que ainda não foi usado — assim a pessoa sempre recebe
 * até 3 produtos distintos, não o mesmo produto 2-3 vezes.
 *
 * IMPORTANTE (bug real, 11/09/2026): as 3 categorias só escolhem dentro dos
 * candidatos com relevância CONFIRMADA (modelo_identificado ou
 * alternativa_funcional) — nunca entre TODO o `ranked` recebido. Antes,
 * "melhor avaliada"/"mais vendida" ignoravam o tipo de correspondência e
 * escolhiam só por nota/venda no pool inteiro; como isso não olha pro
 * matchBonus (só o score composto olhava), um produto de categoria errada
 * mas muito popular (torneira, moldura de teto) vencia fácil um produto
 * certo só que de nicho (cera de carnaúba). Só cai pro pool inteiro,
 * incluindo "semelhante_visual", se não sobrar NENHUM confirmado — melhor
 * mostrar algo incerto (rotulado como tal em reply.ts) do que nada.
 */
export function pickHighlightedCandidates(ranked: RankedCandidate[]): HighlightedCandidate[] {
  const confirmados = ranked.filter(
    (r) => r.matchType === "modelo_identificado" || r.matchType === "alternativa_funcional"
  );
  const base = confirmados.length > 0 ? confirmados : ranked;

  const used = new Set<string>();

  const pick = (
    label: string,
    compare: (a: RankedCandidate, b: RankedCandidate) => number
  ): HighlightedCandidate | null => {
    const pool = base.filter((r) => !used.has(r.offer.itemId));
    if (pool.length === 0) return null;
    const best = [...pool].sort(compare)[0];
    used.add(best.offer.itemId);
    return { label, candidate: best };
  };

  const highlights: HighlightedCandidate[] = [];

  const porPreco = pick(
    "💰 MENOR PREÇO",
    (a, b) => parseFloat(a.offer.priceMin) - parseFloat(b.offer.priceMin)
  );
  if (porPreco) highlights.push(porPreco);

  const porNota = pick("⭐ MELHOR AVALIADA", (a, b) => {
    const ratingA = parseFloat(a.offer.ratingStar || "0");
    const ratingB = parseFloat(b.offer.ratingStar || "0");
    if (ratingB !== ratingA) return ratingB - ratingA;
    return b.offer.sales - a.offer.sales;
  });
  if (porNota) highlights.push(porNota);

  const porVendas = pick("🔥 MAIS VENDIDA", (a, b) => b.offer.sales - a.offer.sales);
  if (porVendas) highlights.push(porVendas);

  return highlights;
}

/**
 * "Essa é a que eu escolheria" (pedido do Ibrahim, 13/09/2026): em vez de
 * SEMPRE mandar 3 opções mecânicas com critérios iguais, quando um
 * candidato se destaca de verdade — correspondência confirmada, nota alta,
 * volume de venda alto e vantagem clara de score sobre o 2º colocado —
 * o bot lidera com uma recomendação única antes das alternativas.
 *
 * Limiares conservadores de propósito (primeira versão, precisa calibrar
 * com uso real): é melhor deixar de "puxar" um destaque duvidoso do que
 * recomendar demais e perder a credibilidade da recomendação.
 */
const CLEAR_PICK_MIN_SCORE_MARGIN = 20;
const CLEAR_PICK_MIN_RATING = 4.6;
const CLEAR_PICK_MIN_SALES = 100;

export function detectClearPick(ranked: RankedCandidate[]): RankedCandidate | null {
  const [top, second] = ranked;
  if (!top || top.matchType !== "modelo_identificado") return null;

  const rating = parseFloat(top.offer.ratingStar || "0");
  if (rating < CLEAR_PICK_MIN_RATING) return null;
  if (top.offer.sales < CLEAR_PICK_MIN_SALES) return null;
  if (second && top.score - second.score < CLEAR_PICK_MIN_SCORE_MARGIN) return null;

  return top;
}
