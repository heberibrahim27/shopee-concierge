/**
 * Gate de validação pra reduzir falso positivo no match MPN+marca (ver
 * findShopeeMatchByMpn em matchShopee.ts). Achado real na QA amostral de
 * 2026-09-25 (60 dos 988 matches conferidos manualmente): MPN+marca+preço
 * deixa passar exceção -- "DJI214" aparecia em duas câmeras de linha
 * DIFERENTE (Kabum "Osmo Action 4" x Shopee "Osmo Action 360"), porque o
 * código foi reaproveitado/coincidiu no texto das duas fontes. MPN+marca
 * é uma chave forte pra achar CANDIDATO, mas não é identidade de produto
 * sozinha -- precisa também não contradizer os atributos críticos do
 * nome antes de virar comparação pro usuário.
 *
 * IMPORTANTE (2026-09-25, achado rodando scripts/audit-kabum-shopee-matches.ts
 * contra os 987 matches reais em produção): a primeira versão também
 * tinha um check de "número solto" (qualquer dígito 1-4 sem unidade) e
 * um check de "palavra de edição" (ice/pro/max/plus/ultra/mini/lite/neo).
 * Os dois geraram MUITO mais ruído que sinal -- ~102/963 pares flagados
 * no dry-run, e a esmagadora maioria era falso alarme: "LGA 1700" (Kabum,
 * com espaço) vs "LGA1700" (Shopee, sem espaço) perde o \b antes do
 * "1700" e o número deixa de ser capturado só de um lado; "ultra" batia
 * em frase de marketing genérica tipo "Ultra-Baixa Latência", não em
 * nome de linha de produto. Os dois checks foram REMOVIDOS -- só ficou o
 * de valor-com-unidade (GB/W/Hz/kg/V/tela/K/mm), que é mais confiável
 * porque a unidade ancora o número a um atributo específico e não sofre
 * do mesmo problema de tokenização. Não reintroduzir os outros dois sem
 * resolver a tokenização primeiro E confirmar com o audit script que o
 * sinal supera o ruído antes de confiar.
 */

interface UnitPattern {
  label: string;
  regex: RegExp;
}

// Cada padrão captura um número com unidade grudada, do jeito que o feed
// normalmente escreve ("165Hz", "120kg", "8GB"). \b nos dois lados pra
// não confundir com o meio de outra palavra/token.
const UNIT_PATTERNS: UnitPattern[] = [
  { label: "armazenamento_ou_cache", regex: /\b(\d+(?:[.,]\d+)?)\s*(?:gb|tb|mb)\b/gi },
  { label: "potencia", regex: /\b(\d+(?:[.,]\d+)?)\s*w\b/gi },
  { label: "taxa_atualizacao", regex: /\b(\d+(?:[.,]\d+)?)\s*hz\b/gi },
  { label: "peso_capacidade", regex: /\b(\d+(?:[.,]\d+)?)\s*kg\b/gi },
  { label: "voltagem", regex: /\b(\d+(?:[.,]\d+)?)\s*v\b/gi },
  { label: "tamanho_tela", regex: /\b(\d+(?:[.,]\d+)?)\s*(?:"|''|pol(?:egadas)?)\b/gi },
  { label: "resolucao", regex: /\b(\d+)\s*k\b/gi },
  { label: "diametro_mm", regex: /\b(\d+(?:[.,]\d+)?)\s*mm\b/gi },
];

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function extractUnitValues(name: string): Map<string, Set<string>> {
  const text = stripAccents(name).toLowerCase();
  const byLabel = new Map<string, Set<string>>();
  for (const pattern of UNIT_PATTERNS) {
    const values = new Set<string>();
    for (const match of text.matchAll(pattern.regex)) {
      values.add(match[1].replace(",", "."));
    }
    if (values.size > 0) byLabel.set(pattern.label, values);
  }
  return byLabel;
}

export interface MatchConflict {
  type: "atributo";
  detail: string;
}

/**
 * Compara os nomes dos dois produtos (marca+MPN já confirmados por
 * findShopeeMatchByMpn) e devolve os conflitos encontrados. Lista vazia
 * = não achou sinal contrário (não é garantia de que é o mesmo produto
 * físico, só que o texto não contradiz num atributo com unidade
 * explícita). Só sinaliza quando os DOIS lados mencionam um valor da
 * MESMA classe (ex: os dois falam de voltagem) e os valores divergem --
 * atributo que só um lado menciona não conta como conflito (omissão não
 * é contradição).
 */
export function findMatchConflicts(nameA: string, nameB: string): MatchConflict[] {
  const conflicts: MatchConflict[] = [];

  const unitsA = extractUnitValues(nameA);
  const unitsB = extractUnitValues(nameB);
  for (const [label, valuesA] of unitsA) {
    const valuesB = unitsB.get(label);
    if (!valuesB) continue;
    const hasOverlap = [...valuesA].some((v) => valuesB.has(v));
    if (!hasOverlap) {
      conflicts.push({
        type: "atributo",
        detail: `${label}: ${[...valuesA].join("/")} vs ${[...valuesB].join("/")}`,
      });
    }
  }

  return conflicts;
}
