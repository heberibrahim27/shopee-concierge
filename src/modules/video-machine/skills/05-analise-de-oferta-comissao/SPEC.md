# Skill 05 — Análise de Oferta/Comissão

> **APROVADA EM ESPECIFICAÇÃO — 5/25** (2026-09-18). Especificação/contrato.
> **Sem implementação ainda** — nenhuma migration, tabela, RPC, worker ou
> cron foi criado. Este arquivo só vira código depois da revisão do Claude
> Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-17/18 após debate ChatGPT ↔ Claude Code, fundamentado
> em auditoria real do banco Supabase live (`babamanager-pro`,
> `czocwdlygdslyuoixmhh`) e em distribuições estatísticas reais dos 852
> `offer_snapshots` existentes — as fórmulas de normalização não foram
> chutadas, foram calibradas sobre o dado observado. Interface Skill 01 ↔
> Skill 05 via Skill 02 (fila de Jobs) congelada, reaproveitando o outbox
> já existente sem alteração.

## Garantia central

A Skill 05 recebe o shortlist produzido pela Skill 04
(`ProductDiscoveryResult`) e avalia a **atratividade econômica/comercial**
de cada candidato usando dados reais de preço, desconto e comissão,
produzindo uma análise auditável e versionada. Ela pode invalidar
economicamente um candidato ou reordenar o shortlist por atratividade
comercial, mas **nunca redescobre produtos** — isso é responsabilidade
exclusiva da Skill 04.

Toda análise econômica referencia exatamente o `sourceOfferSnapshotId`
recebido da Skill 04 — **nunca troca silenciosamente** por um snapshot
mais recente do mesmo produto, pelo mesmo princípio de auditabilidade já
congelado na Skill 04. Comissão é propriedade do **snapshot**, não do
produto: o mesmo `productId` pode ter `commission_rate` diferente entre
snapshots ao longo do tempo (confirmado ao vivo: um produto real variou de
9% para 13% com `period_start_time`/`period_end_time` idênticos).

## Objetivo

Ler os candidatos/snapshots referenciados pelo `ProductDiscoveryResult` da
Skill 04, validar a oferta, calcular sinais econômicos/comissão
normalizados e versionados, e produzir um `OfferAnalysisResult` auditável
— sem duplicar responsabilidades de descoberta (Skill 04), tendências
(Skill 06), geração de link/tracking (Skill 15) ou performance histórica
de conteúdo (Skills 18/19).

## Responsabilidades

- Executar `Job`s `OFFER_ANALYSIS` materializados e controlados pela
  Skill 02, recebendo `OfferAnalysisInput` dentro de um `JobAttempt`
  válido — mesmo padrão de execução da Skill 04 (Skill de execução comum
  via fila de Jobs, **sem outbox próprio**, sem lifecycle de Job/lease/
  retry próprio).
- Ler o `ProductDiscoveryResult` autoritativo (via `discoveryResultId`) e
  os `offer_snapshots` especificamente referenciados pelos candidatos
  selecionados — nunca o snapshot mais recente do produto.
- Aplicar hard filters determinísticos (elegibilidade econômica) e só
  então calcular sinais/ranking (`OFFER_RANKING_V1`) sobre os elegíveis.
- Persistir `OfferAnalysisResult` durável — snapshot histórico completo de
  avaliação econômica, policy usada e ranking, imutável mesmo que o
  `offer_snapshot` mude segundos depois.
- Devolver `JobExecutionReport` com `resultRef` apontando para o
  `OfferAnalysisResult` (nunca o payload completo inline).

## Não é responsabilidade

- Descobrir/rankear produtos por relevância — Skill 04.
- Pesquisar tendências — Skill 06.
- Gerar link afiliado/tracking (shortlink) — Skill 15. A Skill 05 analisa
  a oferta observada, não cria artefatos de rastreamento.
- Calcular performance histórica de conteúdo — Skills 18/19.
- Chamar Shopee/browser escondido para substituir um `offer_snapshot`
  stale — mesmo princípio da Skill 04; atualização é um job/provider
  explícito, fora de escopo.
- Tratar `conversionReport`/comissão realizada como comissão garantida da
  oferta atual — ver "Três camadas de dado econômico" abaixo.

## Quando é chamada

- Quando um worker da Skill 02 adquire lease (`EXECUTE_NEW_ATTEMPT`) de um
  `Job` com `stage = OFFER_ANALYSIS`.

## Quem pode chamar

- Skill 01, indiretamente via `LogicalJobIntent` (outbox) → Skill 02 →
  handler da Skill 05.

## Quais Skills ela pode chamar

Nenhuma diretamente. Reporta o resultado via `reportExecution()` da
Skill 02 (`JobExecutionReport`), que gera `JobResultEvent` →
`Skill01.advanceRun()`.

## Fluxo

```
Skill04 → ProductDiscoveryResult → shortlist primary + alternates
Skill01/02 → Job OFFER_ANALYSIS
Skill05 → lê candidatos/snapshots referenciados
        → valida oferta
        → calcula sinais econômicos/comissão
        → produz OfferAnalysisResult
Skill01 → interpreta o resultado → próximo stage
```

## Três camadas de dado econômico (nunca misturadas)

```
1. OFFER OBSERVED DATA (fato, do offer_snapshot referenciado)
   price_min, price_max, price_discount_rate, commission_rate, commission

2. DERIVED ECONOMIC SIGNALS (calculados pela Skill05, versionados)
   commissionRateSignal, commissionValueSignal, discountSignal, offerScore

3. REALIZED COMMISSION (histórico realizado, conversionReport)
   dinheiro realmente atribuído/validado depois de venda
```

O item 3 é histórico realizado e **nunca** pode ser usado como se fosse a
comissão garantida da oferta atual — é uma invariante forte da Skill 05.

## Unidades — tipos distintos (nunca converter usando a convenção do outro)

Auditoria real confirmou que `commission_rate` e `price_discount_rate`
usam **escalas diferentes** apesar do nome parecido:

```ts
type CommissionRateFraction = number; // 0..1  (ex.: commission_rate=0.13 -> 13%)
type DiscountRatePercent = number;    // 0..100 (ex.: price_discount_rate=48 -> 48%)
type MoneyBRL = number;               // valor monetário em reais
```

A Skill 05 nunca converte um campo usando a convenção do outro. Isso é
tratado como tipo distinto no contrato, não só como comentário.

## Semântica econômica observada (fatos canônicos)

```ts
observedCommissionRate: CommissionRateFraction  = sourceOfferSnapshot.commission_rate
observedCommissionValue: MoneyBRL               = sourceOfferSnapshot.commission
commissionBasePrice: MoneyBRL                   = sourceOfferSnapshot.price_min
observedDiscountRate: DiscountRatePercent       = sourceOfferSnapshot.price_discount_rate
```

Relação esperada, confirmada empiricamente em **790/790** snapshots
não-nulos do banco live (divergência máxima observada: R$0,005 — puro
arredondamento decimal):

```
commission ≈ price_min * commission_rate   (tolerância: até R$0,01)

abs(commission - price_min * commission_rate) <= 0.01  -> consistente
abs(commission - price_min * commission_rate) >  0.01  -> COMMISSION_DATA_INCONSISTENT
```

Comparação em decimal monetário, nunca igualdade binária de float.
Divergência acima da tolerância **não derruba o Job inteiro** — é um
problema daquele candidato específico, que fica economicamente
inelegível (`COMMISSION_DATA_INCONSISTENT`) até haver regra melhor. Dado
que 790/790 batem hoje, isso deve ser um caso raro/defensivo na prática,
não algo esperado com frequência.

## `period_start_time`/`period_end_time` — metadado, não identidade

Auditoria real: apenas ~23% das linhas (195/852) têm esses campos
preenchidos; quando preenchidos, `period_end_time` é frequentemente um
sentinel `2999-12-31` (taxa permanente, não janela de campanha real). Um
produto real variou de 9% para 13% de comissão com `period_start`/`end`
idênticos, provando que esses campos **não servem como identidade de
campanha nem como validade da comissão**.

```
period_start_time / period_end_time
  -> metadado observado, preservado para auditoria
  -> NÃO usado para determinar campanha ativa
  -> NÃO usado para decidir freshness
  -> sentinel 2999-12-31 não recebe semântica especial de negócio
```

Freshness é exclusivamente baseada em `captured_at` +
`maxSnapshotAgeSeconds` da `OfferAnalysisPolicy` — mesmo padrão da
Skill 04.

## Ausência de dado de comissão

Auditoria real: 62/852 `offer_snapshots` (7,3%) têm `commission_rate`/
`commission`/`price_discount_rate` `NULL` simultaneamente (`price_min`
nunca é `null`). Os 31 `deal_candidates` atuais não têm nenhum `NULL`, mas
isso é coincidência do pool atual, **não garantia estrutural**. Hard
filter explícito: candidato cujo `offer_snapshot` referenciado tem
`commission_rate`/`commission` `NULL` fica inelegível
(`COMMISSION_DATA_UNAVAILABLE`).

## Comissão realizada (`conversionReport`) — UNAVAILABLE no MVP

Auditoria real confirmou que `getConversionReport()`
(`src/lib/shopee/queries.ts`) existe e funciona, mas é **account-global,
on-demand, e sem ligação durável** com `productId`/`dealCandidateId`/
`sourceOfferSnapshotId`/`tenantId`/link de afiliado — hoje só alimenta um
card de KPI do admin (`getRevenueStats`), nunca é persistido. Qualquer
tentativa de dizer "esse produto costuma pagar X de comissão real" hoje
seria uma associação inventada.

```
REALIZED_COMMISSION_SIGNAL = UNAVAILABLE no MVP da Skill05
```

`conversionReport` pode continuar existindo para KPI administrativo, mas
**não entra na análise por candidato**. Sem uma ligação durável, não há
histórico econômico por produto confiável — fora de escopo do MVP.

### Restrição de atribuição futura (dependência para Skill 15/18/19)

Dado de negócio real confirmado pelo usuário: o link de afiliado Shopee
tem **janela de atribuição de até 7 dias**. Se a pessoa clicar no link e
comprar **qualquer produto** dentro dessa janela — não necessariamente o
produto anunciado — sem clicar em link de outro afiliado no meio, a
comissão inteira é atribuída a nós.

**A comissão realizada da Shopee não pode ser tratada como evidência
direta de performance do `productId`/`sourceOfferSnapshotId` anunciado.**
A atribuição parte do clique, não do produto — dentro da janela, uma
conversão pode gerar comissão por um produto diferente daquele promovido
originalmente. Por isso `REALIZED_COMMISSION_SIGNAL` permanece
`UNAVAILABLE` na Skill 05 MVP mesmo depois de qualquer implementação
futura de tracking — não é só "falta coluna no banco".

Uma futura utilização de comissão realizada exige um modelo de tracking
que preserve **separadamente** cada identidade da cadeia (não um simples
many-to-one):

```
Publication / Creative
  → AffiliateLink + subIds
  → AffiliateClick / attribution context
  → Conversion
  → Order
  → Purchased item(s)
```

Com `promotedProductId`/`promotedSourceOfferSnapshotId` mantidos
**distintos** de `purchasedProductId` — nunca assumidos iguais. Essa
dependência pertence principalmente à **Skill 15** (Gerador de
Link/Tracking — `subIds`/tracking precisam desde o início distinguir
`tenant`, `campaign/publication`, `creative/content`, `promotedProduct` e
`link instance`) e, depois, às **Skills 18/19** (Coletor de
Métricas/Analista de Performance — precisarão de duas métricas
distintas: *direct product conversion*, onde produto anunciado ==
produto comprado, vs. *assisted/attributed conversion*, onde o clique
veio daquele conteúdo/link mas a compra foi de outro produto — misturar
as duas faria um vídeo parecer excelente para vender um produto
específico quando, na verdade, pode só ser bom em levar tráfego para a
Shopee).

## Fatos canônicos vs. sinais derivados

Nenhuma das duas normalizações de comissão já existentes no código
(`dealScoring.ts`: `comissao = clamp((commission_rate/0.20)*5, 0, 5)`;
`concierge/rank.ts`: `commission BRL bruto` como tie-breaker) é adotada
como semântica canônica da Skill 05 — nenhuma das duas é uma definição
econômica universal, cada uma foi desenhada para encaixar num scorer
legado específico.

```
FATOS CANÔNICOS:
  commissionRateFraction, commissionValueBRL, priceMinBRL, discountRatePercent

SINAIS DERIVADOS (versionados pela Skill05):
  commissionRateSignal, commissionValueSignal, discountSignal, offerScore
```

## Calibração — congelada, versionada, nunca recalculada em runtime

As fórmulas de normalização abaixo foram calibradas sobre os 790
`offer_snapshots` **não-nulos** do banco live em 2026-09-17 — não sobre os
31 `deal_candidates` atuais, que já sofreram seleção upstream (hard cuts
do `dealScoring.ts`) e servem para validar comportamento operacional, não
para definir a régua de calibração.

```ts
type Anchor = { raw: number; score: number }; // score sempre 0..100

type SignalCalibration = {
  calibrationId: string;
  calibrationVersion: string;       // ex.: "COMMISSION_RATE_SIGNAL_V1"
  signalKind: "COMMISSION_RATE" | "COMMISSION_VALUE";
  population: "OFFER_SNAPSHOTS_NON_NULL";
  sampleSize: number;               // 790 na calibração V1
  calibratedAt: string;
  anchors: readonly Anchor[];       // ordenados por raw ASC
  calibrationHash: string;          // "CALIBRATION_SNAPSHOT_V1:sha256:<hex>"
};
```

`calibrationHash` — formato congelado agora (parte da garantia de que os
anchors não mudam por baixo da mesma policy, não é implementação, é
integridade):

```
CALIBRATION_SNAPSHOT_V1:sha256:<hex>
```

Calculado sobre SHA-256 de uma serialização JSON canônica contendo
`calibrationId`, `calibrationVersion`, `signalKind`, `population`,
`sampleSize`, `calibratedAt`, `anchors` (ordenados por `raw` ASC). Se a
estrutura mudar no futuro, cria-se `CALIBRATION_SNAPSHOT_V2` — o que fica
aberto é **quando** recalibrar/publicar uma nova versão, nunca como provar
a integridade da V1 (ver "Questões abertas").

A Skill 05 **nunca** consulta percentis do banco a cada execução — isso
destruiria reprodutibilidade. Os valores medidos viram os `anchors` fixos
da versão. Se o mercado mudar materialmente no futuro, cria-se uma nova
calibração/versão (`V2`); a `V1` nunca é alterada retroativamente.

### `COMMISSION_RATE_SIGNAL_V1`

Anchors (calibrados sobre os 790 snapshots não-nulos: p25=0.03, p50=0.07,
p75=0.11, p90=0.14, p95=0.1855, max=0.28):

```ts
const COMMISSION_RATE_SIGNAL_V1: Anchor[] = [
  { raw: 0.00,   score: 0   },
  { raw: 0.03,   score: 25  }, // p25
  { raw: 0.07,   score: 50  }, // p50
  { raw: 0.11,   score: 75  }, // p75
  { raw: 0.14,   score: 90  }, // p90
  { raw: 0.1855, score: 95  }, // p95
  { raw: 0.28,   score: 100 }, // max da calibração V1
];
```

Entre dois anchors, interpolação linear:

```
score = scoreA + ((raw - rawA) / (rawB - rawA)) * (scoreB - scoreA)
```

Clamp final em `0..100`; arredondamento só no resultado final (6 casas
decimais). Acima do último anchor (28%) → `score = 100` enquanto a V1
estiver em vigor — não extrapola linearmente além do anchor máximo.

Exemplos verificados: `3%→25`, `7%→50`, `8%→56.25`, `13%→85`, `20%→95.77`,
`23%→97.35`, `28%→100`. Um candidato real do pool atual a 23% continua
superior a um de 20% — resolve o problema do teto rígido de 20% do
`dealScoring.ts` legado (que já cortaria o candidato de maior comissão do
pool real atual) sem deixar a cauda acima do p95 dominar o ranking.

### `COMMISSION_VALUE_SIGNAL_V1`

Anchors (calibrados sobre os 790 snapshots não-nulos: p25=0.90, p50=1.80,
p75=3.99, p90=7.76, p95=12.54, max=86.69):

```ts
const COMMISSION_VALUE_SIGNAL_V1: Anchor[] = [
  { raw: 0.00,  score: 0   },
  { raw: 0.90,  score: 25  }, // p25
  { raw: 1.80,  score: 50  }, // p50
  { raw: 3.99,  score: 75  }, // p75
  { raw: 7.76,  score: 90  }, // p90
  { raw: 12.54, score: 95  }, // p95
  { raw: 86.69, score: 100 }, // max da calibração V1
];
```

Mesma interpolação linear/clamp/arredondamento do sinal de rate. A cauda
longa em BRL (max R$86,69 vs. mediana R$1,80) é intencionalmente
comprimida pela calibração por quantis — um outlier de comissão alta não
deve automaticamente esmagar toda a análise. Exemplos verificados:
`R$0,27→~7.50`, `R$1,03→~28.61`, `R$2,59→~59.02`, `R$4,68→~77.75`,
`R$9,60→~91.92`, `R$12,54→95`, `R$86,69→100`.

### `DISCOUNT_SIGNAL_V1`

O dado já nasce numa escala intuitiva 0..100 — nenhuma calibração
empírica é necessária ou apropriada aqui:

```ts
DISCOUNT_SIGNAL_V1 = clamp(observedDiscountRate, 0, 100)
```

Representa o **desconto observado informado no snapshot** — não "desconto
real histórico validado" (esse dado não existe hoje); a Skill 05 não
atribui a ele semântica que o dado não possui.

### `OFFER_RANKING_V1`

Mesmo padrão do `DISCOVERY_RANKING_V1` da Skill 04 — média ponderada
normalizada, não soma simples:

```
offerScore = Σ(signal.value * weight) / Σ(activeWeights)
```

A `OfferAnalysisPolicy` escolhe o objetivo comercial pelos pesos, sem
preferência embutida no algoritmo:

```
commissionRate=100, commissionValue=0   -> estratégia focada em % de comissão
commissionRate=0, commissionValue=100   -> estratégia focada em R$/venda
commissionRate=50, commissionValue=50   -> equilíbrio entre os dois
discount pode entrar com qualquer peso explícito
```

A correlação real de apenas 0,22 entre `commission_rate` e `commission`
BRL (medida sobre o dataset live) confirma que são sinais economicamente
diferentes — não duas versões redundantes da mesma informação; por isso a
policy precisa poder pesá-los de forma independente. Mesma regra da
Skill 04: sinal com peso `0`/ausente não participa e **nunca** volta
escondido como tie-breaker.

O `OfferAnalysisResult` congela, no mínimo:
`commissionRateSignalVersion = "COMMISSION_RATE_SIGNAL_V1"`,
`commissionValueSignalVersion = "COMMISSION_VALUE_SIGNAL_V1"`,
`discountSignalVersion = "DISCOUNT_SIGNAL_V1"`,
`offerRankingVersion = "OFFER_RANKING_V1"`,
`offerAnalysisPolicyId`, `offerAnalysisPolicyVersion`,
`offerAnalysisPolicySnapshotHash`.

## Contratos

> ### Regra compartilhada de serialização canônica
>
> Todos os hashes estruturados canônicos definidos neste SPEC usam
> `CANONICAL_SERIALIZATION_V1`, conforme
> `src/modules/video-machine/contracts/CANONICAL-SERIALIZATION.md`
> (S10 do reparo pós-revisão Fable, 2026-09-18), salvo quando o
> contrato declara explicitamente um hash de bytes
> `RAW_BYTES_SHA256_V1`. O identificador canônico do hash de cada
> artifact (ex.: os `*_V1` já usados abaixo) é usado como
> `hashSchema` dentro do `CanonicalHashEnvelope`. Nenhuma
> implementação local de canonicalização pode substituir ou alterar
> essa regra.


> ### Regra compartilhada de audit trail
>
> `AuditEvent` neste SPEC referencia exclusivamente o contrato
> compartilhado `AUDIT_EVENT_V1`, definido em
> `src/modules/video-machine/contracts/AUDIT-EVENT.md` (S11 do reparo
> pós-revisão Fable, 2026-09-18). Este SPEC pode definir seus
> `eventCode` namespaced (`SKILL<NN>.<CODE>`) e os fatos que exigem
> auditoria, mas não pode redefinir o shape, tenant scoping,
> idempotência, persistência ou atomicidade de `AuditEvent`.


> ### Regra compartilhada de replay/materialização de resultado
>
> Este SPEC segue `RESULT_MATERIALIZATION_V1`, definido em
> `src/modules/video-machine/contracts/RESULT-MATERIALIZATION.md`
> (S14 do reparo pós-revisão Fable, 2026-09-18). Se um artifact de
> resultado válido já existe para a identidade exata
> tenant/job/attempt/input, ele DEVE ser reutilizado e o produtor NÃO
> DEVE ser executado de novo. `*_RESULT_REPLAY_CONFLICT` identifica
> uma colisão real de identidade imutável/provenance persistida — NÃO
> DEVE ser detectado recalculando a operação e comparando o valor
> recém-produzido com o resultado materializado. Mudanças em fontes
> externas mutáveis ou outputs de modelo não-determinísticos não são
> replay conflicts.


```ts
// RankingSignal — tipo COMPARTILHADO, definido uma única vez no SPEC.md
// da Skill 04 (não redefinido aqui): { value: 0..100, source, sourceVersion, observedAt }.
// SelectedProductCandidateRef — também compartilhado, definido na Skill 04.

type OfferAnalysisInput = {
  // payload do LogicalJobIntent — tenantId/runId aqui são CORRELAÇÃO, a
  // Skill05 confere ambos contra o Job confiável materializado pela
  // Skill02, mesmo padrão da Skill04.
  tenantId: string;
  runId: string;

  discoveryResultId: string; // AUTORIDADE — o ProductDiscoveryResult é
    // sempre reaberto e é a fonte de verdade do conjunto de candidatos.
    // PATCH (Ponto M2, reparo transversal pós-revisão Fable, 2026-09-18,
    // CONTRACT_CONVENTIONS_V1, contrato completo em
    // contracts/CONTRACT-CONVENTIONS.md): campo "candidateRefs?" removido
    // — era REDUNDANT_DEFENSIVE_REFERENCE (categoria B): a própria spec
    // já dizia "se ausente, a Skill05 simplesmente reabre o
    // ProductDiscoveryResult", ou seja, o campo não mudava nenhum
    // comportamento quando ausente e não era a authority real (que
    // sempre foi discoveryResultId). Skill05 sempre deriva o conjunto de
    // candidatos do ProductDiscoveryResult, nunca do payload do caller.

  offerAnalysisPolicyKey: string; // resolvido via OfferAnalysisPolicyBinding
};

// Validação do ProductDiscoveryResult referenciado (trustedTenantId = Job.tenantId):
//   - precisa existir
//   - tenantId/runId precisam bater com o Job confiável (nunca o payload cru)
//   - resultStatus precisa ser OK ou PARTIAL (nunca NO_ELIGIBLE_CANDIDATES/
//     CANDIDATE_POOL_STALE — nesses casos a Skill05 nem deveria ser
//     agendada; se for mesmo assim -> DISCOVERY_RESULT_NOT_ANALYZABLE)
//   - primaryCandidates + alternateCandidates formam o conjunto
//     autoritativo analisável

type SignalCalibrationRef = {
  calibrationId: string;
  calibrationVersion: string;
  calibrationHash: string;
};

type OfferAnalysisPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  maxSnapshotAgeSeconds: number;

  minCommissionRateFraction?: CommissionRateFraction;
  minCommissionValueBRL?: MoneyBRL;
  minDiscountRatePercent?: DiscountRatePercent; // ver "Discount" abaixo —
    // mantido no contrato mas SEM default nas policies iniciais (a Skill04
    // já pré-filtra por desconto no dealScoring hoje; ligar isso sem
    // decisão comercial explícita seria dupla penalização do mesmo sinal)

  rankingWeights: {
    commissionRate?: number;
    commissionValue?: number;
    discount?: number;
  };

  // a policy congela INCLUSIVE quais versões/calibrações foram usadas —
  // não basta dizer "COMMISSION_RATE_SIGNAL_V1" e trocar os anchors por
  // baixo sem subir versão de policy.
  signalVersions: {
    commissionRate: "COMMISSION_RATE_SIGNAL_V1";
    commissionValue: "COMMISSION_VALUE_SIGNAL_V1";
    discount: "DISCOUNT_SIGNAL_V1";
    offerRanking: "OFFER_RANKING_V1";
  };
  calibrationRefs: {
    commissionRate: SignalCalibrationRef;
    commissionValue: SignalCalibrationRef;
  };

  createdAt: string;
};
// Imutável por (policyId, policyVersion) — mesmo padrão de
// ApprovalPolicy/ProductSelectionPolicy.

type OfferAnalysisPolicyBinding = {
  tenantId: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
};

// Invariantes de validação da policy — violação de qualquer uma:
// INVALID_OFFER_ANALYSIS_POLICY (FATAL_ERROR), nenhum OfferAnalysisResult fabricado.
//   0 <= minCommissionRateFraction <= 1
//   0 <= minDiscountRatePercent <= 100
//   minCommissionValueBRL >= 0
//   maxSnapshotAgeSeconds > 0
//   todos os pesos: finitos, >= 0
//   Σ pesos ativos > 0
//   calibrationHash precisa corresponder à calibração declarada

type OfferExclusionReason =
  | "OFFER_DATA_STALE"
  | "COMMISSION_DATA_UNAVAILABLE"       // commission_rate ou commission NULL
  | "COMMISSION_DATA_INVALID"           // fora de faixa estrutural (ex.: rate<0 ou >1, commission<0)
  | "COMMISSION_DATA_INCONSISTENT"      // |commission - price_min*commission_rate| > R$0,01
  | "DISCOUNT_DATA_UNAVAILABLE"         // só quando a policy depende de discount (ver abaixo)
  | "DISCOUNT_DATA_INVALID"             // fora de 0..100
  | "COMMISSION_RATE_BELOW_MINIMUM"     // threshold da policy, não dado bruto
  | "COMMISSION_VALUE_BELOW_MINIMUM"
  | "DISCOUNT_BELOW_MINIMUM"
  | "RANKING_SIGNAL_UNAVAILABLE";       // sinal com peso>0 estruturalmente
    // disponível na policy, mas ESTE candidato não tem os dados
    // necessários — distinto de INVALID_OFFER_ANALYSIS_POLICY (que é
    // quando a *policy* pede um sinal globalmente indisponível)

type OfferCandidateEvaluation = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;

  sourceDiscoveryRawRank: number;        // rank bruto na Skill04
  sourceDiscoveryFinalPosition: number;  // finalPosition no ProductDiscoveryResult

  observed: {
    snapshotCapturedAt: string;

    priceMinBRL: MoneyBRL;
    priceMaxBRL?: MoneyBRL;

    commissionRateFraction?: CommissionRateFraction;
    commissionValueBRL?: MoneyBRL;

    discountRatePercent?: DiscountRatePercent;

    // metadado observado, preservado para auditoria — NUNCA influencia
    // elegibilidade/ranking V1 (ver seção acima)
    periodStartTime?: string;
    periodEndTime?: string;
  };

  eligible: boolean; // eligible=true implica exclusionReasons=[] (invariante)
  exclusionReasons: OfferExclusionReason[];

  signals: {
    commissionRate?: RankingSignal;
    commissionValue?: RankingSignal;
    discount?: RankingSignal;
  };

  offerScore?: number;   // ausente quando eligible=false
  economicRank?: number; // ausente quando eligible=false
};

type OfferRankedCandidateRef = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;

  sourceDiscoveryFinalPosition: number; // rastreabilidade até a Skill04

  offerScore: number;
  economicRank: number;

  finalPosition: number; // posição GLOBAL no shortlist econômico final,
    // 1-based — mesmo padrão da Skill04 (primaryCandidates primeiro,
    // depois alternateCandidates, nunca reinicia em 1)
};

type OfferAnalysisResultStatus =
  | "OK"                  // primaryCandidates.length == targetPrimaryCount
  | "PARTIAL"              // 0 < primaryCandidates.length < targetPrimaryCount
  | "NO_ELIGIBLE_OFFERS"   // há candidatos frescos, mas nenhum sobrevive à análise econômica
  | "OFFER_DATA_STALE";    // candidatos autoritativos existem, mas nenhum
    // sourceOfferSnapshot satisfaz freshness
// DISCOVERY_RESULT_NOT_ANALYZABLE NÃO é um resultStatus — é FATAL_ERROR
// do JobExecutionReport (ver "Erros" abaixo), nenhum OfferAnalysisResult
// é fabricado.

type OfferAnalysisResult = {
  resultId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  discoveryResultId: string;

  resultStatus: OfferAnalysisResultStatus;

  targetPrimaryCount: number;   // = ProductDiscoveryResult.requestedCount
  targetAlternateCount: number; // = ProductDiscoveryResult.alternateCount

  primaryCandidates: OfferRankedCandidateRef[];
  alternateCandidates: OfferRankedCandidateRef[];

  analyzedCandidateCount: number; // total do conjunto autoritativo da Skill04
  freshCandidateCount: number;
  eligibleCandidateCount: number;

  offerAnalysisPolicyId: string;
  offerAnalysisPolicyVersion: string;
  offerAnalysisPolicySnapshotHash: string;

  commissionRateSignalVersion: "COMMISSION_RATE_SIGNAL_V1";
  commissionValueSignalVersion: "COMMISSION_VALUE_SIGNAL_V1";
  discountSignalVersion: "DISCOUNT_SIGNAL_V1";
  offerRankingVersion: "OFFER_RANKING_V1";

  commissionRateCalibrationRef: SignalCalibrationRef;
  commissionValueCalibrationRef: SignalCalibrationRef;

  analysisReadAt: string; // capturado UMA VEZ antes de avaliar qualquer candidato

  candidateSetHash: string; // "OFFER_CANDIDATE_SET_V1:sha256:<hash>" —
    // fingerprint auditável sobre os SelectedProductCandidateRef
    // autoritativos vindos da Skill04, serialização canônica e ordem
    // determinística. Prova exatamente qual shortlist da Skill04 entrou
    // na análise econômica. Não duplica o conteúdo dos offer_snapshots
    // (histórico imutável, cada evaluation já guarda sourceOfferSnapshotId).

  rankingSnapshot: OfferCandidateEvaluation[]; // todos os avaliados, não só os selecionados

  evaluatedAt: string;
  createdAt: string;
};
```

## Hard filters (MVP)

### Freshness — instante único congelado

```
analysisReadAt = capturado UMA VEZ antes de avaliar qualquer candidato
ageSeconds     = analysisReadAt - sourceOfferSnapshot.captured_at
fresh          = ageSeconds <= maxSnapshotAgeSeconds
```

Se `ageSeconds > maxSnapshotAgeSeconds` → `OFFER_DATA_STALE`. Nunca
procura um `offer_snapshot` mais recente do mesmo produto para "salvar"
um candidato stale — mesmo princípio da Skill 04.

### Comissão obrigatória (dado fundamental da Skill05)

```
commission_rate NULL OU commission NULL
  -> COMMISSION_DATA_UNAVAILABLE

commission_rate < 0 OU > 1
OU commission < 0
OU price_min ausente/inválido
  -> COMMISSION_DATA_INVALID

abs(commission - roundMoney(price_min * commission_rate)) <= R$0,01
  -> consistente
abs(commission - roundMoney(price_min * commission_rate)) > R$0,01
  -> COMMISSION_DATA_INCONSISTENT
```

Comparação sempre em decimal monetário, nunca igualdade binária de float.

### Discount — obrigatório só quando a policy depende dele

`price_discount_rate` **não é** universalmente obrigatório. Só é exigido
quando a policy efetivamente usa o sinal:

```
minDiscountRatePercent configurado OU rankingWeights.discount > 0
  -> price_discount_rate NULL          -> DISCOUNT_DATA_UNAVAILABLE
  -> price_discount_rate fora de 0..100 -> DISCOUNT_DATA_INVALID

caso contrário: discount NULL nunca elimina um candidato que tem
comissão perfeitamente válida.
```

Isso deixa a policy definir o objetivo comercial, em vez de transformar
desconto em requisito oculto para toda e qualquer análise.

### Thresholds (hard filters econômicos da policy — nunca misturados com ranking)

```
commissionRate < minCommissionRateFraction  -> COMMISSION_RATE_BELOW_MINIMUM
commissionValue < minCommissionValueBRL     -> COMMISSION_VALUE_BELOW_MINIMUM
discount < minDiscountRatePercent           -> DISCOUNT_BELOW_MINIMUM
```

Só avaliados **depois** de validar os fatos (dado ausente/inválido/
inconsistente sempre precede threshold).

## `OFFER_RANKING_V1` — aplicação

Só candidatos `eligible=true` entram no ranking. Mesmas invariantes já
congeladas na Skill 04:

- peso ausente/`0` → sinal não participa;
- sinal exigido pela policy mas estruturalmente impossível (globalmente)
  → `INVALID_OFFER_ANALYSIS_POLICY`;
- sinal globalmente suportado mas ausente **naquele candidato específico**
  → `RANKING_SIGNAL_UNAVAILABLE`, candidato fica inelegível para aquela
  execução;
- nunca renormaliza pesos por candidato quando um sinal ativo não pôde
  ser obtido.

Tie-breakers puramente estruturais (nenhum sinal de negócio reentra pela
porta dos fundos):

```
1. offerScore DESC
2. productId ASC
3. dealCandidateId ASC
4. sourceOfferSnapshotId ASC
```

## Saída reordenada — filtra e reordena, não rediversifica

A Skill 05 pode substituir um `primary` economicamente ruim por um
`alternate` da Skill 04. Ela **não reexecuta** o algoritmo de
diversificação da Skill 04:

```
1. parte do conjunto autoritativo fixo (primary+alternate) da Skill04
2. exclui candidatos economicamente inválidos/insuficientes (hard filters)
3. ordena os elegíveis por OFFER_RANKING_V1 + tie-breakers
4. primeiros targetPrimaryCount -> primaryCandidates
5. restantes até targetAlternateCount -> alternateCandidates
```

**Preservação de invariantes upstream, não diversificação nova:** por
texto já aprovado da Skill 04 (seção "Diversificação"), `avoidSameProductGroup`,
`maxPerCategory` e `preferDistinctCategories` são **todos** preferências
best-effort ("pula quando existir alternativa" — se não existir
alternativa, o limite pode ser excedido), nunca invariante hard. O único
invariante estrutural da Skill 04 é unicidade de `productId`
(`SAME_PRODUCT`), que a Skill 05 preserva automaticamente por nunca
adicionar candidato novo ao conjunto — só filtra o que a Skill 04 já
selecionou.

**A filtragem e reordenação econômica podem degradar as preferências
best-effort de diversificação estabelecidas pela Skill 04**
(`avoidSameProductGroup`, `maxPerCategory`, `preferDistinctCategories`).
A Skill 05 não reexecuta o algoritmo de diversificação e não altera
`offerScore`/tie-breakers para tentar preservar essas preferências — isso
é uma **limitação aceita e documentada**, não um bug. A única invariância
estrutural preservada é a unicidade de `productId`.

## Precedência determinística de `resultStatus`

```
DISCOVERY_RESULT_NOT_ANALYZABLE (FATAL_ERROR, nenhum OfferAnalysisResult):
  ProductDiscoveryResult ausente, OU tenant/run incompatível com o Job,
  OU resultStatus fora de {OK, PARTIAL}, OU candidate set estruturalmente
  inválido, OU analyzedCandidateCount == 0 apesar do upstream ser OK/PARTIAL
  (indica inconsistência/corrupção do conjunto autoritativo, nunca produz
  NO_ELIGIBLE_OFFERS)

analyzedCandidateCount > 0 AND freshCandidateCount == 0
  -> OFFER_DATA_STALE

freshCandidateCount > 0 AND eligibleCandidateCount == 0
  -> NO_ELIGIBLE_OFFERS

eligibleCandidateCount > 0 AND primaryCandidates.length == targetPrimaryCount
  -> OK

eligibleCandidateCount > 0 AND 0 < primaryCandidates.length < targetPrimaryCount
  -> PARTIAL
```

`targetPrimaryCount >= 1` sempre, então não há ambiguidade no último
bloco. `alternateCandidates` continua best-effort: quantidade insuficiente
de alternates, sozinha, nunca transforma `OK` em `PARTIAL`.

## Erros e JobExecutionReport

```
FATAL_ERROR (nenhum OfferAnalysisResult criado/persistido):
  - DISCOVERY_RESULT_NOT_ANALYZABLE
  - OFFER_ANALYSIS_POLICY_NOT_FOUND
  - OFFER_ANALYSIS_POLICY_BINDING_NOT_FOUND
  - OFFER_ANALYSIS_POLICY_TENANT_MISMATCH
  - INVALID_OFFER_ANALYSIS_POLICY
  - OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT   (mesma invariante de
    idempotência de persistência da Skill04, ver abaixo)

RETRYABLE_ERROR:
  - DISCOVERY_RESULT_READ_FAILED
  - OFFER_SNAPSHOT_READ_FAILED
  - TRANSIENT_DATASTORE_ERROR
```

`COMPLETED` (`resultStatus ∈ {OK, PARTIAL, NO_ELIGIBLE_OFFERS,
OFFER_DATA_STALE}`) é sucesso **técnico** da Skill05, não necessariamente
sucesso de negócio do stage — mesma separação já congelada na Skill04: a
Skill01 nunca avança automaticamente só por `COMPLETED`, ela reabre o
`OfferAnalysisResult` via `resultRef` e aplica sua própria regra de
interpretação do resultado de domínio daquele stage.

## Idempotência e operação

Mesma invariante já congelada na Skill 04, adaptada ao domínio: no máximo
um `OfferAnalysisResult` canônico por `(jobId, attemptNumber)`. Reexecução
após crash reutiliza o resultado já persistido, nunca recalcula/cria
outro.

**PATCH (Ponto S14, reparo transversal pós-revisão Fable, 2026-09-18)**:
o texto anterior a este patch condicionava `OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT`
a uma comparação de conteúdo entre o resultado já persistido e o que uma
reexecução produziria — contradizia a frase anterior ("nunca recalcula"),
porque só dá pra saber se o novo conteúdo divergiria calculando-o primeiro
(mesmo achado S14 da Skill 04). Preço/comissão/oferta mudam legitimamente
entre execuções — isso
não é replay conflict (ver `contracts/RESULT-MATERIALIZATION.md`).
`OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT` passa a significar só colisão
real de identidade persistida (tentativa de escrever um 2º
`OfferAnalysisResult` com `resultId`/conteúdo diferente pra mesma
`(jobId, attemptNumber)`), nunca recalcular-e-comparar:

```
tentativa de persistir 2º OfferAnalysisResult pra mesma (jobId, attemptNumber)
com resultId/conteúdo diferente do já persistido
-> OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT -> FATAL_ERROR + AuditEvent
```

`analyzeOffers()` é determinístico quando recebe o mesmo conjunto lógico
completo: `OfferAnalysisInput` equivalente, `OfferAnalysisPolicy`
(snapshot da versão) equivalente, conjunto autoritativo de candidatos da
Skill 04 equivalente (`candidateSetHash` igual), mesmo `analysisReadAt`, e
mesmas calibrações de sinal (`calibrationHash` igual). Timestamps
puramente de persistência (`createdAt`) podem diferir. Mesmo
`candidateSetHash` com `analysisReadAt` diferente pode alterar
elegibilidade por freshness — `candidateSetHash` não substitui
`analysisReadAt` como parâmetro de determinismo.

## Multi-tenant

`offer_snapshots`/`products`/`deal_candidates` (catálogo de mercado) **não
têm `tenantId`** — compartilhado, mesmo tratamento da Skill 04.
`OfferAnalysisResult`, `OfferAnalysisPolicy`/`OfferAnalysisPolicyBinding`
**são tenant-scoped**.

**Cadeia de tenant confiável** — `trustedTenantId` é sempre `Job.tenantId`
(materializado pela Skill 02, nunca o payload bruto):

```
OfferAnalysisInput.tenantId        -> só correlação, deve == trustedTenantId
ProductDiscoveryResult.tenantId    -> deve == trustedTenantId (senão DISCOVERY_RESULT_NOT_ANALYZABLE)
OfferAnalysisPolicyBinding         -> resolvido por trustedTenantId + policyKey
OfferAnalysisPolicy.tenantId       -> deve == trustedTenantId
OfferAnalysisResult.tenantId       -> sempre trustedTenantId
```

Divergência em qualquer ponto da cadeia → `OFFER_ANALYSIS_POLICY_TENANT_MISMATCH`
(`FATAL_ERROR`), **nunca** um fallback silencioso para outro tenant ou
para o catálogo global. `products`/`deal_candidates`/`offer_snapshots`
sendo *shared market catalog* não significa "sem controle de origem":
essas tabelas nunca carregam decisão específica de tenant (elegibilidade
econômica, policy, resultado) usada como se fosse global.

## Observabilidade

Log estruturado por avaliação de candidato: `tenantId`, `runId`, `jobId`,
`resultId`, `attemptNumber`, `offerAnalysisPolicyId`,
`offerAnalysisPolicyVersion`, `productId`, `dealCandidateId`,
`sourceOfferSnapshotId`, `eligible`, `exclusionReasons`, `offerScore?`,
`economicRank?`. Não duplica o `rankingSnapshot` inteiro no log.

`AuditEvent` persistido para a criação de todo `OfferAnalysisResult`, como
**resumo**, não o array inteiro: `resultId`, `tenantId`, `runId`, `jobId`,
`attemptNumber`, `resultStatus`, `targetPrimaryCount`,
`primaryCandidates.length`, `alternateCandidates.length`,
`analyzedCandidateCount`, `freshCandidateCount`, `eligibleCandidateCount`,
`offerAnalysisPolicyId`/`Version`/`SnapshotHash`, `candidateSetHash`,
`commissionRateCalibrationRef`, `commissionValueCalibrationRef`,
`createdAt`. `rankingSnapshot` completo permanece só no
`OfferAnalysisResult`.

`AuditEvent` explícito também para `OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT`
e `OFFER_ANALYSIS_POLICY_TENANT_MISMATCH` (violação de fronteira de
tenant, não falha operacional comum).

Métricas: `resultStatus` por execução; distribuição de
`exclusionReasons` (em especial `COMMISSION_DATA_UNAVAILABLE`/
`COMMISSION_DATA_INCONSISTENT`, que sinalizam saúde do feeder de dados da
Shopee, distinto de `*_BELOW_MINIMUM`, que sinaliza policy restritiva);
`diversity_preference_degradation_rate` — candidatos promovidos que
degradam qualquer uma das três preferências best-effort da Skill 04
(`avoidSameProductGroup`, `maxPerCategory`, `preferDistinctCategories`).
Nome deliberadamente não usa "violação" — são preferências, não
invariantes; a métrica existe para observar a limitação aceita, não para
sinalizar erro.

## Plano de testes

### Casos críticos (obrigatórios)

- Todos os candidatos elegíveis e frescos → `resultStatus = OK`,
  `primaryCandidates.length == targetPrimaryCount`.
- Só parte dos candidatos elegível → `resultStatus = PARTIAL`.
- Todos os candidatos autoritativos fora de `maxSnapshotAgeSeconds` →
  `OFFER_DATA_STALE`, distinto de `NO_ELIGIBLE_OFFERS`.
- Candidatos frescos mas nenhum sobrevive à análise econômica →
  `NO_ELIGIBLE_OFFERS`.
- `ProductDiscoveryResult` referenciado não existe, ou
  `tenantId`/`runId` divergem do Job, ou `resultStatus` fora de
  `{OK, PARTIAL}` → `DISCOVERY_RESULT_NOT_ANALYZABLE` (`FATAL_ERROR`),
  nenhum `OfferAnalysisResult` criado.
- `analyzedCandidateCount == 0` mesmo com upstream `OK`/`PARTIAL` →
  `DISCOVERY_RESULT_NOT_ANALYZABLE`, nunca `NO_ELIGIBLE_OFFERS`.
- (Ponto M2) `candidateRefs?` removido do input — Skill05 sempre deriva
  o conjunto de `discoveryResultId`, nunca de payload do caller.
- `commission_rate`/`commission` `NULL` no snapshot referenciado →
  `COMMISSION_DATA_UNAVAILABLE`.
- `commission_rate` fora de `0..1` ou `commission < 0` →
  `COMMISSION_DATA_INVALID`.
- `|commission - price_min*commission_rate| > R$0,01` →
  `COMMISSION_DATA_INCONSISTENT`; dentro da tolerância → elegível quanto a
  esse critério.
- `price_discount_rate` `NULL` com `minDiscountRatePercent`/
  `rankingWeights.discount` desligados → **não** gera exclusão.
- `price_discount_rate` `NULL` com `rankingWeights.discount > 0` →
  `DISCOUNT_DATA_UNAVAILABLE`.
- `commissionRate < minCommissionRateFraction` da policy →
  `COMMISSION_RATE_BELOW_MINIMUM`, distinto de dado ausente/inválido.
- Candidato do meio do shortlist excluído economicamente + alternate
  promovido com `productGroupId` repetido → resultado aceito, sem
  `exclusionReason`, apenas observável via métrica de degradação de
  diversidade.
- Dois candidatos elegíveis com mesmo `offerScore` → desempate
  determinístico por `productId ASC` (nunca reintroduz comissão bruta
  como critério de desempate).
- Peso `0`/ausente em `rankingWeights.commissionValue` → sinal não
  participa do `offerScore`, mesmo que o dado exista.
- Sinal exigido pela policy mas globalmente indisponível →
  `INVALID_OFFER_ANALYSIS_POLICY`; sinal disponível globalmente mas
  ausente **só naquele candidato** → `RANKING_SIGNAL_UNAVAILABLE`
  (candidato específico inelegível, resto do pool não afetado).
- `tenantId`/`runId` do `OfferAnalysisInput` divergindo do Job confiável
  → erro de contrato, nunca processa com o tenant/run do payload.
- Reexecução do mesmo `(jobId, attemptNumber)` após crash reutiliza o
  `OfferAnalysisResult` existente, nunca cria outro nem recalcula pra
  comparar.
- Tentativa de persistir um 2º `OfferAnalysisResult` com conteúdo
  diferente pra mesma chave (colisão de escrita, nunca detectada
  recalculando) → `OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT`.
- `offer_snapshot` mudando segundos depois da leitura não altera
  retroativamente um `OfferAnalysisResult` já criado (snapshot histórico).
- Nova `offerAnalysisPolicyVersion` não afeta um `OfferAnalysisResult` já
  persistido.
- Diferença monetária de exatamente R$0,01 → ainda consistente; qualquer
  valor acima de R$0,01 → `COMMISSION_DATA_INCONSISTENT` (limite
  inclusive, não exclusivo).
- Candidato com `commission_rate = 23%` produz `commissionRateSignal`
  superior a um candidato com `commission_rate = 20%` em
  `COMMISSION_RATE_SIGNAL_V1` (verifica que a calibração não recria o
  teto arbitrário do scorer legado).
- Percentis do banco mudando depois da calibração `V1` não alteram os
  `anchors`/`calibrationHash` já congelados — uma execução nova continua
  usando a mesma calibração até uma `V2` explícita ser publicada.

### Teste real

Adiado — sem schema/migration em produção nesta fase. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `OfferAnalysisInput`,
  `OfferAnalysisPolicy`/`Binding`, `OfferCandidateEvaluation`,
  `OfferRankedCandidateRef`, `OfferAnalysisResult`.
- Três camadas de dado econômico (observado/derivado/realizado) nunca
  misturadas; `REALIZED_COMMISSION_SIGNAL = UNAVAILABLE` justificado por
  auditoria real (não só ausência de coluna — modelo de atribuição por
  clique, não por produto).
- Tipos de unidade (`CommissionRateFraction`/`DiscountRatePercent`/
  `MoneyBRL`) distintos, nunca convertidos usando convenção um do outro.
- `COMMISSION_RATE_SIGNAL_V1`/`COMMISSION_VALUE_SIGNAL_V1` calibrados
  sobre dado real (790 snapshots não-nulos), versionados e congelados —
  nunca recalculados em runtime.
- Fronteira clara com Skill 04 (não rediversifica — degradação de
  diversidade é limitação aceita e documentada, não bug) e com Skill 15
  (não gera link/shortlink).
- `resultStatus` com precedência determinística
  (`DISCOVERY_RESULT_NOT_ANALYZABLE` → `OFFER_DATA_STALE` →
  `NO_ELIGIBLE_OFFERS` → `OK`/`PARTIAL`).
- Multi-tenant documentado corretamente: catálogo compartilhado vs.
  policy/resultado tenant-scoped.

## Dependências

Skill 01 — Orquestrador de Produção (emite `LogicalJobIntent` com
`stage = OFFER_ANALYSIS`). Skill 02 — Gestor de Fila/Jobs (materializa o
`Job`, invoca o handler desta Skill, consome `JobExecutionReport`).
Skill 04 — Descoberta de Produtos (produz o `ProductDiscoveryResult`
autoritativo consumido aqui). Skill 15 — Gerador de Link/Tracking (ainda
não especificada; ver "Restrição de atribuição futura" acima). Skills
18/19 — Coletor de Métricas/Analista de Performance (idem). Interface
Skill 01↔02 já congelada é reaproveitada sem alteração — Skill 05 não
introduz outbox novo.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão:

- `maxSnapshotAgeSeconds` padrão;
- valores concretos de `rankingWeights` nas policies iniciais (hoje só a
  estrutura está congelada);
- se/quando `minDiscountRatePercent` será ativado em alguma policy —
  mantido no contrato, desligado por padrão (ver "Discount" acima);
- quando/como recalibrar e publicar `V2` das fórmulas de sinal, se a
  distribuição de mercado mudar materialmente (o formato do
  `calibrationHash` em si já está congelado — ver seção de Calibração).
