# Skill 19 — Analista de Performance

> **APROVADA EM ESPECIFICAÇÃO — 19/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 3 rodadas com ChatGPT (decisões
> fundacionais → contratos centrais → fechamento operacional/erros/
> testes), com auditoria real do repositório prévia (mesmo método das
> Skills 04-18). Dois patches compatíveis ficam congelados como
> extensões: `AnalysisSubjectBasis` (na própria Skill 19, com
> `individualCommerceObservations`/`ownedAffiliateClickEvents`) e
> `historicalReadStatus` na Skill 18 (`MetricFieldCapability`), sem
> reabrir a aprovação da Skill 18.

## Garantia central (congelada após rodada 1 de debate)

A Skill 19 deriva resultados analíticos reproduzíveis a partir de
evidências imutáveis e explicitamente versionadas, preservando
separadamente fatos observados, métricas derivadas, comparações
estatisticamente elegíveis e hipóteses analíticas. Ela nunca altera a
evidência canônica das Skills 15/18, nunca transforma associação
temporal em atribuição causal, nunca compara entidades observadas em
horizontes incompatíveis sem normalização explícita e nunca apresenta
um score contextual como uma verdade definitiva sobre o criativo.

Cadeia geral:

```text
MetricSnapshot[] + CommerceObservation[] + AffiliateAttributionEvidence[]
  + SocialPublicationBinding + CreativeDirectionResult
  → AnalysisPolicy → AnalysisBasis congelada → DerivedMetric[]
  → Cohort/ComparisonEligibility → PerformanceScore(s) contextual(is)
  → PerformanceAnalysisResult → Skill20/21
```

## Decisões fundacionais (rodada 1 — debate com ChatGPT, 2026-09-18)

1. **Não existe "a performance" como propriedade eterna do vídeo.**
   Nunca `performanceScore = 87` congelado — scores são
   contextualizados por objetivo, janela temporal, coorte, métricas
   disponíveis, policy, versão do método e evidence eligibility. Um
   vídeo pode ter "score de alcance em 24h", "score de engajamento em
   72h" e "score comercial com evidência direta" coexistindo — nenhuma
   obrigação de condensar tudo num único número.
2. **Reaproveita o padrão das Skills 04/05**: média ponderada, nunca
   soma; peso ausente nunca redistribuído — sinal ausente vira
   `PERFORMANCE_SIGNAL_UNAVAILABLE`; candidato sem sinal obrigatório
   não ganha vantagem porque o denominador diminuiu (nunca "vídeo B
   não tem dado comercial → redistribui peso comercial pro engagement
   → score artificialmente bonito").
3. **`AnalysisHorizon` obrigatório antes de qualquer ranking**
   (`FIRST_24H`/`FIRST_72H`/`PUBLICATION_AGE_WINDOW`/`CALENDAR_PERIOD`/
   `CUSTOM_WINDOW`, valores concretos policy-driven). Entidades só
   entram na mesma comparação quando seus dados cobrem um horizonte
   analítico compatível.
4. **Invariante**: nunca usar "latest views" puro pra ranking entre
   posts de idades diferentes (post A com 20k views/10 dias não
   "ganha" de post B com 8k views/1 dia sem controlar o horizonte) —
   correto é views acumuladas nas primeiras 24h, ou delta T0→T+72h,
   desde que ambos tenham dados suficientes pra mesma janela.
5. **Score contextual, nunca definitivo** — `PerformanceScoreContext`
   contém obrigatoriamente `scorePolicy`/`analysisHorizon`/
   `cohortDefinition`/`normalizationMethod`/signals utilizados/signals
   indisponíveis. Skill 21 nunca recebe só `score=83`; recebe "83 sob
   `PERFORMANCE_SCORE_POLICY_V1`, primeiras 72h, comparado com coorte
   X, usando signals A/B".
6. **Percentil/calibração continuam melhores que número arbitrário** —
   padrão piecewise-linear das Skills 04/05 reutilizável, mas a
   população de referência precisa ser explícita (nunca "engagement 5%
   = score 80" inventado; sim "engagement 5% → percentil 73 dentro de
   posts equivalentes → calibração policy-versioned").
7. **A coorte é parte da verdade analítica** — comparações possíveis
   por `publicationTarget`/media kind/faixa de idade/período
   histórico/categoria/`CreativeMode`, mas Skill 19 nunca adiciona
   filtro silencioso; a definição da coorte precisa ser persistida.
   Dois resultados com coortes diferentes são resultados analíticos
   diferentes.
8. **Três níveis de elegibilidade de comparação**, sem N mínimo
   universal (`ComparisonEligibilityStatus`, contrato completo
   `ComparisonEligibility` definido mais abaixo — não redeclarado aqui):
   `INSUFFICIENT_SAMPLE | DESCRIPTIVE_ONLY | COMPARATIVE_ELIGIBLE`.
   `N=2` pode gerar média/mediana/distribuição observada com
   `status=DESCRIPTIVE_ONLY`, nunca "POV é melhor".
9. **Sample policy versionada** — `minEntitiesPerGroup`,
   `minTotalEntities`, `minObservationCoverage`, `minExposure?` vivem
   em `PerformanceAnalysisPolicy`, nunca hardcoded agora (5/10/30
   posts); serão calibrados.
10. **Tamanho de amostra não é o único problema** — `N=20` total com
    18 posts num grupo e 2 no outro ainda é comparação frágil;
    eligibility olha N total, N por grupo, cobertura temporal,
    métricas disponíveis e distribuição de exposição, não só N global.
11. **Exposição importa** — archetype A (3 posts, 100k reach total) vs.
    archetype B (3 posts, 500 reach total) têm N=3 igual mas robustez
    informacional diferente; não pondera tudo por reach
    automaticamente (distorceria), mas o resultado carrega
    `sampleSize`/`exposureSummary`/`coverage`, e a policy pode exigir
    pisos.
12. **Skill 19 não faz inferência causal.** Nunca derivamos afirmações
    causais de fatores externos (produto, preço, conta, algoritmo,
    época, qualidade do vídeo, audiência). V1 é
    `descriptive/comparative analytics`, não `causal inference engine`.
    Se futuramente houver experimento controlado/A-B testing real,
    outro contrato poderá autorizar claims causais específicos.
13. **Atributos criativos são dimensões, não causas** — `creativeMode`/
    `archetype`/`hookStrategy`/`narrativeStructure`/`visualApproach`/
    `ctaIntent` (Skill 07) servem pra agrupamento/segmentação/
    comparação/associação, nunca automaticamente "hook X causou +23%
    de conversão".
14. **Delta de `CUMULATIVE_COUNTER`** (resposta à pergunta 3): Skill 19
    lê duas observações/snapshots e produz resultado derivado
    analítico — nunca grava de volta na Skill 18. Condições
    obrigatórias: mesma `MetricSeriesIdentity`, mesma dimensão, mesma
    unidade, `semantics=CUMULATIVE_COUNTER`, `T2 > T1`. Então
    `delta = value(T2) - value(T1)` é derivação legítima; ambos
    `providerDataAsOf`/`observedAt` preservados pra reprodutibilidade.
15. **Delta negativo não vira "-500 views"** — se T1=10.000 e
    T2=9.500 numa métrica `CUMULATIVE_COUNTER`, pode ser revisão do
    provider/counter reset/mudança semântica/erro; resultado vira
    `COUNTER_NON_MONOTONIC`, nunca "delta=-500" como se 500 pessoas
    "desvissem" o vídeo.
16. **`seriesIdentityHash` igual é requisito forte** — nunca derivar
    delta entre `media_views` e `story_views`, nem entre dimensões
    distintas, nem se a Skill 18 criou nova `MetricSeriesIdentity` por
    mudança de semântica.
17. **Percentual de crescimento**: `growth = (T2-T1)/T1`, mas
    `T1=0` nunca vira infinito nem zero arbitrário — resultado
    `GROWTH_RATE_UNDEFINED_BASE_ZERO`.
18. **Orgânico e comercial continuam dois domínios** (resposta à
    pergunta 4) — não funde a evidência num score único desde o
    início; Skill 19 produz sinais separados primeiro, só combina
    explicitamente via `CompositePerformanceAssessment` quando policy
    permitir.
19. **Orgânico tem lineage direto** — quando Skill 18 conseguiu join
    determinístico `SocialPublicationBinding → media metrics`, é
    evidência direta de desempenho orgânico daquela publicação.
20. **Comercial depende do nível da Skill 15** — matriz congelada:
    `DIRECT_PROVIDER_CONFIRMED` → elegível pra métricas de
    conversão/comissão daquele criativo; `OWN_CLICK_CONFIRMED_ONLY` →
    elegível só pra clique próprio, NÃO pra afirmar venda/comissão do
    criativo; `PROVIDER_AGGREGATE_ONLY` → só contexto comercial
    agregado, NÃO entra como signal comercial individual;
    `UNATTRIBUTED` → não entra como signal individual;
    `INFERRED_HEURISTIC` → hipótese separada, nunca signal factual
    canônico.
21. **Nunca renormaliza peso comercial quando atribuição é fraca** —
    vídeo B sem dado comercial não faz "organic passar a valer 100%";
    vira `commercial signal=PERFORMANCE_SIGNAL_UNAVAILABLE` e a policy
    define se o score fica `INCOMPLETE` ou existe um score
    organic-only separado.
22. **Múltiplos scores por domínio, em vez de um número único**:
    `OrganicPerformanceScore`, `OwnedClickPerformanceScore`,
    `DirectCommercialPerformanceScore`, `CompositePerformanceScore`
    (os dois últimos só quando a evidence policy permitir). Um vídeo
    sem comercial atribuível ainda pode ter excelente score orgânico.
23. **Comparações comerciais usam só populações compatíveis** — nunca
    comparar vídeo A `DIRECT_PROVIDER_CONFIRMED` com vídeo B
    `PROVIDER_AGGREGATE_ONLY` numa tabela "conversão por vídeo" (B não
    tem esse dado).
24. **Persistir o resultado: sim** (resposta à pergunta 5) — Skill 19
    materializa `PerformanceAnalysisResult` imutável, auditável e
    versionado; nunca só sob demanda (Skill 20 precisa saber
    exatamente qual conclusão gerou uma decisão; exige rastreabilidade
    de método).
25. **Reprocessar não sobrescreve** — vídeo A com 24h de dados gera R1
    em 18/09; com 72h de dados gera R2 em 21/09; R2 não atualiza R1,
    ambos continuam verdadeiros em suas respectivas bases.
26. **`AnalysisBasis` congelada** — todo resultado registra
    exatamente quais `MetricSnapshot`s, `CommerceObservation`s,
    `AffiliateAttributionEvidence`, `SocialPublicationBinding`s, qual
    `CreativeDirectionResult`, policy, método, horizon e cohort o
    produziram — análise reproduzível.
27. **Idempotência conceitual**: `analysisBasisHash +
    analysisPolicySnapshotHash + analysisMethodVersion → AnalysisIdentity`.
    Retry técnico → mesmo `PerformanceAnalysisResult`; dados novos →
    nova `AnalysisBasis` → novo result.
28. **Não existe `UPDATE current_score`** — verdade canônica é
    `R1, R2, R3...` append-only (mesmo princípio da Skill 18); uma
    futura `latest_performance_analysis` seria cache/projeção
    reconstruível, nunca autoridade.
29. **Skill 21 pode pedir "latest", mas recebe identidade exata** —
    "este é o melhor hook observado" sempre referencia
    `PerformanceAnalysisResultId`/hash, nunca consulta mutável
    invisível no meio da renderização.
30. **`INFERRED_HEURISTIC` fica estruturalmente separado** (resposta à
    pergunta 6, crítica): Skill 19 **nunca** cria
    `AffiliateAttributionEvidence { attributionLevel: INFERRED_HEURISTIC }`
    mesmo que o enum histórico da Skill 15 contenha esse valor — produz
    um tipo diferente, `HeuristicAttributionHypothesis`. Campos
    separados no resultado: `canonicalAttributionEvidenceRefs: [...]`
    e `heuristicHypotheses: [...]` — **nunca** misturados na mesma
    coleção.
31. **Hypothesis usa vocabulário próprio** — não reutiliza
    `DIRECT_PROVIDER_CONFIRMED`/`OWN_CLICK_CONFIRMED_ONLY` como
    "strength"; usa algo como `HypothesisSupportLevel = LOW_SUPPORT |
    MODERATE_SUPPORT | HIGH_SUPPORT` — ainda é apoio analítico, nunca
    attribution level.
32. **Nunca copia commission pra hypothesis como "atribuída"** — post
    14h + clique Shopee 14:10 + compra 14:30 sem join oficial pode
    gerar `HeuristicAttributionHypothesis: "temporalmente compatível"`,
    nunca `commissionAttributed=R$5,20`; pode referenciar
    `commerceObservationId`/`commissionObserved=R$5,20` como evidência
    contextual — diferença importante.
33. **Heurística nunca alimenta score factual por padrão (V1)** —
    `heuristicHypotheses` não entram em `PerformanceScore`; servem pra
    insight/investigação/hipótese de teste futuro (Skill 20 pode usar
    pra criar variações experimentais quando houver volume), mas não
    melhoram score factual. Se um dia heurística entrar em score, deve
    ser outro score explícito (`ExploratoryPerformanceScore`,
    separado de `EvidenceBackedPerformanceScore`) — não precisa
    implementar na V1.
34. **LLM não calcula score** — números, percentis, weights, cohort,
    eligibility, rank, deltas são calculados deterministicamente; LLM
    pode receber resultado estruturado e gerar linguagem, nunca "olhando
    os dados, dê um score de 0-100".
35. **Ranking declara elegibilidade por item**: `RANKED` |
    `UNRANKED_INSUFFICIENT_SAMPLE` | `UNRANKED_SIGNAL_UNAVAILABLE` |
    `UNRANKED_INCOMPARABLE_HORIZON` — melhor que forçar todo mundo a
    ter posição.
36. **Empate é legítimo** — se scores/calibração produzem valores
    equivalentes, é rank tie; nunca inventa desempate por `createdAt`/
    ID/"mais recente" só pra gerar lista 1-10, a menos que a policy
    defina desempate semanticamente válido.
37. **Toda comparação relativa expõe denominadores** — nunca só "POV:
    +18%" sem "em relação a quê? N de cada grupo? qual horizon? qual
    métrica?" — o contrato final guarda esses dados.
38. **Variação temporal precisa de cohort freeze** — recalcular hoje
    (percentil=85) e daqui a 3 meses com 500 vídeos novos
    (percentil=61) não significa que o resultado antigo estava errado;
    cada analysis result congela a coorte; nova coorte → novo
    resultado.
39. **Intents de análise distintos, não obrigatórios entre si**:
    `SINGLE_PUBLICATION_ANALYSIS`, `COHORT_COMPARISON`, e futuramente
    `CREATIVE_ATTRIBUTE_ANALYSIS` — análise individual não é obrigada
    a construir ranking global.
40. **Skill 19 não toca provider** — só lê artefatos da Skill 18; nunca
    `Skill19 → Windsor`/`Skill19 → Shopee` diretamente. Se dados estão
    stale, pede refresh à Skill 18 conforme contrato já aprovado.
41. **Não mistura qualidade do vídeo com performance** — Skill 12
    (`COMPLIANT`/`NON_COMPLIANT`/`INCONCLUSIVE`) é auditoria técnica/
    semântica; Skill 19 pode estudar "vídeos compliant tiveram tal
    performance", mas nunca transforma "views altas" em "video
    quality=alta" — domínios diferentes.
42. **Performance de produto vs. de criativo são distintas** — um
    vídeo pode performar bem por produto forte/preço excelente/oferta
    momentânea, não necessariamente por hook bom. V1 pode comparar
    associações por atributo, mas não decompõe causalmente
    product/creative/offer effect (dados/modelo insuficientes) — fica
    registrado como limitação explícita.

### Ownership final (rodada 1)

```text
Skill07  → atributos criativos originais
Skill15  → canonical affiliate attribution evidence
Skill17  → publication identity
Skill18  → observed metrics / commerce / evidence materialization
Skill19  → deterministic derivations, contextual scores, cohort
           comparisons, descriptive associations, hypotheses
           explicitamente non-canonical
Skill20  → gera variações a partir de análise aprovada
Skill21  → apresenta resultados/relatórios
```

### Cinco fechamentos conceituais (ChatGPT)

1. Score é uma conclusão contextual sobre uma base, horizonte, coorte
   e método específicos; nunca uma propriedade definitiva do criativo.
2. Comparabilidade vem antes de ranking: entidades com horizonte
   incompatível, sinal obrigatório ausente ou amostra insuficiente
   permanecem fora do ranking em vez de receber números artificiais.
3. Métricas derivadas preservam integralmente sua lineage até as
   observações originais; Skill 19 calcula novos fatos analíticos, mas
   nunca reescreve os fatos coletados pela Skill 18.
4. Evidência orgânica direta, evidência comercial atribuída e hipótese
   analítica permanecem estruturalmente separadas. Uma hipótese nunca
   se transforma em atribuição apenas porque parece plausível.
5. Resultados analíticos são append-only: dados, coortes ou métodos
   novos produzem novos `PerformanceAnalysisResult`, preservando
   exatamente o que era conhecido e calculado em cada momento.

## Contratos centrais (rodada 2 — debate com ChatGPT, 2026-09-18)

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


Duas decisões estruturais adicionais antes dos tipos: **(1)**
`PerformanceAnalysisInput` identifica uma execução analítica
congelável, não "a análise atual" — depois que a `AnalysisBasis` é
materializada, dados novos não entram nela; analisar dados mais
recentes exige nova request/basis/result. **(2)** para horizontes
relativos ("primeiras 24h") é preciso saber qual timestamp ancora o
início — como a Skill 17 nem sempre garante `publishedAt` oficial do
provider, a Skill 19 não finge precisão; o anchor carrega sua própria
evidência.

### Tipos de análise e horizonte

```typescript
type PerformanceAnalysisKind =
  | 'SINGLE_PUBLICATION_ANALYSIS' | 'COHORT_COMPARISON' | 'CREATIVE_ATTRIBUTE_ANALYSIS';
// V1 não precisa de um quarto tipo genérico: um post, grupo de posts,
// atributo criativo entre grupos.

type AnalysisHorizon =
  | { mode: 'RELATIVE_TO_PUBLICATION'; startOffsetMs: number; endOffsetMs: number; }
  | { mode: 'ABSOLUTE_WINDOW'; startAt: string; endAt: string; };
// hash: ANALYSIS_HORIZON_V1. "primeiras 24h" = RELATIVE com
// startOffsetMs=0; "01/09-07/09" = ABSOLUTE_WINDOW.

type AnalysisPublicationTimeAnchor = {
  anchorType: 'PROVIDER_PUBLISHED_AT' | 'PROVIDER_CREATED_AT'
    | 'PUBLICATION_RECEIPT_OBSERVED_AT' | 'FIRST_CONFIRMED_PUBLISHED_AT';
  timestamp: string;
  precision: 'PROVIDER_EXACT_TIMESTAMP' | 'CONFIRMED_OBSERVATION_PROXY';
  evidenceRefId: string;
  evidenceRefHash: string;
  anchorHash: string;
};
// hash: ANALYSIS_PUBLICATION_TIME_ANCHOR_V1. PROVIDER exact ≠
// observation proxy; policy pode permitir proxy para análise
// descritiva e excluir de comparação comprometida por precisão.
```

### PerformanceAnalysisInput (união discriminada)

```typescript
type PerformanceAnalysisInputBase = {
  tenantId: string;
  // PATCH (R2, kernel repair pós re-review GPT-6 Astra, 2026-09-19):
  // runId REMOVIDO. Analisar histórico/performance não depende de uma
  // ProductionRun ativa — naturalmente STANDALONE (Ponto C, Skill02).
  // Já nem participava do hash (ver "runId não entra" abaixo). Execution
  // scope é infraestrutura do Job, não campo duplicado no domain input.
  analysisRequestKey: string;
  analysisKind: PerformanceAnalysisKind;
  analysisHorizon: AnalysisHorizon;
  analysisHorizonHash: string;
  performanceAnalysisPolicyKey: string;
  resolvedPolicy: {
    policyId: string; policyVersion: string;
    policySnapshotHash: string; bindingResolutionHash: string;
  };
  analysisMethodSetVersion: string;
};

type SinglePublicationAnalysisInput = PerformanceAnalysisInputBase & {
  analysisKind: 'SINGLE_PUBLICATION_ANALYSIS';
  socialPublicationBindingId: string;
  socialPublicationBindingHash: string;
};

type CohortComparisonAnalysisInput = PerformanceAnalysisInputBase & {
  analysisKind: 'COHORT_COMPARISON';
  subjectBindings: Array<{ socialPublicationBindingId: string; socialPublicationBindingHash: string; }>;
  cohortDefinitionKey: string;
};

type CreativeAttributeAnalysisInput = PerformanceAnalysisInputBase & {
  analysisKind: 'CREATIVE_ATTRIBUTE_ANALYSIS';
  subjectBindings: Array<{ socialPublicationBindingId: string; socialPublicationBindingHash: string; }>;
  creativeAttribute: 'CREATIVE_MODE' | 'ARCHETYPE' | 'HOOK_STRATEGY'
    | 'NARRATIVE_STRUCTURE' | 'VISUAL_APPROACH' | 'CTA_INTENT';
  cohortDefinitionKey: string;
};

type PerformanceAnalysisInput =
  | SinglePublicationAnalysisInput | CohortComparisonAnalysisInput | CreativeAttributeAnalysisInput;
// hash: PERFORMANCE_ANALYSIS_INPUT_V1 — runId não entra.
```

**Idempotência do input**: UNIQUE lógico `(tenantId,
analysisRequestKey)`. Mesma key + mesmo input hash → reutiliza análise
existente. Mesma key + input diferente →
`PERFORMANCE_ANALYSIS_REQUEST_REPLAY_CONFLICT`. Análise futura com
dados novos exige nova request.

### AnalysisBasis

```typescript
type AnalysisMetricSnapshotRef = { metricSnapshotId: string; metricSnapshotHash: string; observedAt: string; };
type AnalysisCommerceObservationRef = { commerceObservationId: string; commerceObservationHash: string; observedAt: string; };
type AnalysisAttributionEvidenceRef = {
  affiliateAttributionEvidenceId: string;
  affiliateAttributionEvidenceHash: string;
  attributionLevel: 'DIRECT_PROVIDER_CONFIRMED' | 'OWN_CLICK_CONFIRMED_ONLY'
    | 'PROVIDER_AGGREGATE_ONLY' | 'UNATTRIBUTED';
}; // nunca inclui INFERRED_HEURISTIC aqui.

type AnalysisSubjectBasis = {
  subjectKey: string;
  tenantId: string;
  socialPublicationBindingId: string;
  socialPublicationBindingHash: string;
  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;
  promotedProductId: string;
  creativeDirectionResultId: string;
  creativeDirectionResultHash: string;
  publicationTimeAnchor: AnalysisPublicationTimeAnchor;
  metricSnapshots: AnalysisMetricSnapshotRef[];
  canonicalAttributionEvidence: AnalysisAttributionEvidenceRef[];
  subjectBasisHash: string;
};
// hash: ANALYSIS_SUBJECT_BASIS_V1

type AnalysisAggregateCommerceContext = {
  commerceObservations: AnalysisCommerceObservationRef[];
  attributionEvidence: AnalysisAttributionEvidenceRef[];
  contextHash: string;
};
// hash: ANALYSIS_AGGREGATE_COMMERCE_CONTEXT_V1 — comercial
// PROVIDER_AGGREGATE_ONLY/UNATTRIBUTED fica separado do subject:
// comissão agregada ≠ comissão do vídeo.

type AnalysisBasis = {
  analysisBasisId: string;
  tenantId: string;
  performanceAnalysisInputHash: string;
  analysisKind: PerformanceAnalysisKind;
  analysisHorizon: AnalysisHorizon;
  analysisHorizonHash: string;
  analysisAsOf: string;
  subjects: AnalysisSubjectBasis[];
  aggregateCommerceContext?: AnalysisAggregateCommerceContext;
  basisSelectionPolicyId: string;
  basisSelectionPolicyVersion: string;
  basisSelectionPolicyHash: string;
  basisHash: string;
  createdAt: string;
};
// hash: ANALYSIS_BASIS_V1 — inclui inputHash, horizonHash,
// analysisAsOf, subjects em ordem canônica,
// aggregateCommerceContextHash?, basisSelectionPolicyHash.
```

`analysisAsOf` importa: rodar hoje 18/09 10h vs. 19/09 12h representa
contextos históricos diferentes — importa em análises auditáveis.
**Basis é imutável** — depois que B1 nasce, não adicionamos o snapshot
de amanhã; amanhã nasce B2, nova análise. **Seleção temporal**:
`AnalysisHorizon` diz a janela desejada, `AnalysisBasis` congela os
pontos realmente escolhidos — nunca silenciosamente "queria 24h, só
achei snapshot de 39h, usa assim mesmo"; a policy define tolerância de
boundary.

### PerformanceAnalysisPolicy

```typescript
type PerformanceAnalysisDomain = 'ORGANIC' | 'OWNED_CLICK' | 'DIRECT_COMMERCIAL' | 'COMPOSITE';
type PerformanceSignalDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
type PerformanceSignalNormalization = 'PERCENTILE_WITHIN_COHORT' | 'PIECEWISE_LINEAR' | 'NONE';
type PerformanceSignalSource = 'METRIC_OBSERVATION' | 'DERIVED_METRIC' | 'CANONICAL_ATTRIBUTION_EVIDENCE';

type PerformanceSignalDefinition = {
  signalKey: string;
  domain: PerformanceAnalysisDomain;
  source: PerformanceSignalSource;
  canonicalMetricKey?: string;
  derivedMetricKey?: string;
  required: boolean;
  direction: PerformanceSignalDirection;
  normalization: PerformanceSignalNormalization;
  piecewiseCalibration?: Array<{ input: string; output: string; }>;
  weight?: string;
};

type PerformanceScoreDefinition = {
  scoreKey: string;
  domain: PerformanceAnalysisDomain;
  signalKeys: string[];
  fixedWeights: Record<string, string>;
  requiredSignalKeys: string[];
  scoreScale: { min: '0'; max: '100'; };
  eligibility: {
    allowProviderAggregateEvidence: false;
    allowUnattributedEvidence: false;
    allowHeuristicHypothesis: false;
  };
};
// os três "false" ficam congelados literalmente na V1.

type PerformanceComparisonSamplePolicy = {
  minTotalEntities: number;
  minEntitiesPerGroup: number;
  minimumObservationCoverageRatio: string;
  minimumExposure?: { canonicalMetricKey: string; canonicalValue: string; };
};

type PerformanceHorizonPolicy = {
  requireCompatibleHorizon: true;
  allowedAnchorPrecision: Array<'PROVIDER_EXACT_TIMESTAMP' | 'CONFIRMED_OBSERVATION_PROXY'>;
  maxStartBoundaryToleranceMs: number;
  maxEndBoundaryToleranceMs: number;
};

type PerformanceAnalysisPolicy = {
  policyId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  analysisKind: PerformanceAnalysisKind;
  horizonPolicy: PerformanceHorizonPolicy;
  samplePolicy: PerformanceComparisonSamplePolicy;
  signalDefinitions: PerformanceSignalDefinition[];
  scoreDefinitions: PerformanceScoreDefinition[];
  ranking: {
    enabled: boolean;
    scoreKey?: string;
    tiesAllowed: true;
    unavailableSignalBehavior: 'UNRANK' | 'SCORE_UNAVAILABLE';
  };
  attribution: {
    individualCommercialEligibility: ['DIRECT_PROVIDER_CONFIRMED'];
    ownedClickEligibility: ['OWN_CLICK_CONFIRMED_ONLY'];
    compositeAllowed: boolean;
  };
  createdAt: string;
};
// hash: PERFORMANCE_ANALYSIS_POLICY_V1

type PerformanceAnalysisPolicyBinding = {
  tenantId: string; analysisKind: PerformanceAnalysisKind; policyKey: string;
  activePolicyId: string; activePolicyVersion: string; updatedAt: string;
}; // mutável, sem hash integral

type PerformanceAnalysisPolicyBindingResolution = {
  tenantId: string; analysisKind: PerformanceAnalysisKind; policyKey: string;
  policyId: string; policyVersion: string; policySnapshotHash: string;
  resolvedAt: string; bindingResolutionHash: string;
};
// hash: PERFORMANCE_ANALYSIS_POLICY_BINDING_RESOLUTION_V1
```

### DerivedMetric

```typescript
type DerivedMetricMethod = 'COUNTER_DELTA' | 'GROWTH_RATE' | 'RATIO' | 'GROUP_MEAN' | 'GROUP_MEDIAN';
// V1 não inclui regressão/z-score.

type DerivedMetric = {
  derivedMetricId: string;
  tenantId: string;
  analysisBasisId: string;
  canonicalMetricKey: string;
  method: DerivedMetricMethod;
  methodVersion: string;
  sourceSeriesIdentityHash?: string;
  sourceObservationRefs: Array<{ metricObservationId: string; metricObservationHash: string; observedAt: string; }>;
  sourceDerivedMetricRefs?: Array<{ derivedMetricId: string; derivedMetricHash: string; }>;
  interval?: { startAt: string; endAt: string; };
  valueStatus: 'DEFINED' | 'UNAVAILABLE' | 'UNDEFINED_BASE_ZERO' | 'COUNTER_NON_MONOTONIC' | 'INCOMPARABLE_INPUTS';
  value?: { canonicalValue: string; unit: 'COUNT' | 'PERCENT' | 'RATIO' | 'CURRENCY' | 'OTHER'; currency?: string; };
  derivationHash: string;
  createdAt: string;
};
// hash: DERIVED_METRIC_V1
```

`COUNTER_DELTA` exige 2 observations, mesma `MetricSeriesIdentity`,
`semantics=CUMULATIVE_COUNTER`, `T2>T1`; se `T2<T1` →
`COUNTER_NON_MONOTONIC`, nenhum valor negativo é emitido.
`GROWTH_RATE` exige inputs não nulos; `T1=0` → `UNDEFINED_BASE_ZERO`.
**Idempotência**: mesma basis + mesma métrica + mesmo método/version →
mesmo `derivedMetricHash`; retry não materializa outro resultado
incompatível.

### Coorte e elegibilidade de comparação

```typescript
type ComparisonDimension = 'CREATIVE_MODE' | 'ARCHETYPE' | 'HOOK_STRATEGY'
  | 'NARRATIVE_STRUCTURE' | 'VISUAL_APPROACH' | 'CTA_INTENT' | 'PROMOTED_PRODUCT' | 'PUBLICATION_TARGET';

type ComparisonCohortMember = {
  subjectKey: string;
  socialPublicationBindingId: string; socialPublicationBindingHash: string;
  creativeDirectionResultId: string; creativeDirectionResultHash: string;
  groupKey: string; groupValue: string;
  analysisAnchorHash: string;
  included: boolean;
  exclusionReason?: 'INCOMPATIBLE_HORIZON' | 'MISSING_REQUIRED_SIGNAL'
    | 'INSUFFICIENT_OBSERVATION_COVERAGE' | 'INVALID_TIME_ANCHOR' | 'POLICY_EXCLUDED';
  memberHash: string;
};

type ComparisonCohort = {
  comparisonCohortId: string;
  tenantId: string;
  analysisBasisId: string;
  dimension: ComparisonDimension;
  members: ComparisonCohortMember[];
  groupKeys: string[];
  cohortHash: string;
  createdAt: string;
};
// hash: COMPARISON_COHORT_V1 — membros em ordem canônica.
```

**Comparability não é inferida depois** — criado `ComparisonCohort C1`,
a entrada/saída de membros fica congelada; dados novos geram `C2`.

```typescript
type ComparisonEligibilityStatus = 'INSUFFICIENT_SAMPLE' | 'DESCRIPTIVE_ONLY' | 'COMPARATIVE_ELIGIBLE';

type ComparisonEligibility = {
  comparisonEligibilityId: string;
  tenantId: string;
  comparisonCohortId: string; comparisonCohortHash: string;
  status: ComparisonEligibilityStatus;
  totalIncludedEntities: number;
  groups: Array<{
    groupKey: string; entityCount: number; observationCoverageRatio: string;
    exposure?: { canonicalMetricKey: string; canonicalValue: string; };
  }>;
  policyRequirements: Array<'SAMPLE_TOO_SMALL' | 'GROUP_SAMPLE_TOO_SMALL'
    | 'OBSERVATION_COVERAGE_TOO_LOW' | 'EXPOSURE_TOO_LOW' | 'INCOMPATIBLE_HORIZON'
    | 'REQUIRED_SIGNAL_UNAVAILABLE'>;
  eligibilityHash: string;
  createdAt: string;
};
// hash: COMPARISON_ELIGIBILITY_V1
```

`DESCRIPTIVE_ONLY` pode gerar N/mean/median/min-max (se a policy
permitir)/coverage — nunca "winner"/"best archetype"/"superior". O
contrato impede ranking comparativo quando `status ≠
COMPARATIVE_ELIGIBLE`.

### PerformanceSignal e PerformanceScore

```typescript
type PerformanceSignalAvailability = 'AVAILABLE' | 'UNAVAILABLE';
type PerformanceSignalUnavailableReason = 'SOURCE_METRIC_MISSING' | 'DERIVED_METRIC_UNAVAILABLE'
  | 'ATTRIBUTION_LEVEL_INSUFFICIENT' | 'INCOMPARABLE_HORIZON' | 'SAMPLE_INELIGIBLE' | 'POLICY_EXCLUDED';

type PerformanceSignal = {
  performanceSignalId: string;
  tenantId: string;
  analysisBasisHash: string;
  signalKey: string;
  subjectKey?: string;
  groupKey?: string;
  sourceObservationRefs: Array<{ id: string; hash: string; }>;
  availability: PerformanceSignalAvailability;
  unavailableReason?: PerformanceSignalUnavailableReason;
  rawValue?: { canonicalValue: string; unit: string; };
  normalization: PerformanceSignalNormalization;
  normalizationContext?: {
    comparisonCohortId?: string; comparisonCohortHash?: string;
    populationSize?: number; percentile?: string; calibrationPolicyHash?: string;
  };
  calibratedValue?: string;
  configuredWeight?: string;
  signalHash: string;
  createdAt: string;
};
// hash: PERFORMANCE_SIGNAL_V1
```

`rawValue` sempre preservado além de `calibratedValue` — nunca guarda
só "82" sem a métrica de origem. **Sinal indisponível nunca vira
zero**: `UNAVAILABLE ≠ rawValue=0` e não recebe `calibratedValue=0`
automaticamente — ausência e performance ruim são fatos diferentes.

```typescript
type PerformanceScoreStatus = 'SCORED' | 'INCOMPLETE' | 'INELIGIBLE_COMPARISON';

type PerformanceScore = {
  performanceScoreId: string;
  tenantId: string;
  analysisBasisHash: string;
  subjectKey?: string;
  cohortGroupKey?: string;
  scoreKey: string;
  domain: PerformanceAnalysisDomain;
  scoreDefinitionHash: string;
  status: PerformanceScoreStatus;
  signalRefs: Array<{ performanceSignalId: string; performanceSignalHash: string; configuredWeight: string; weightedContribution?: string; }>;
  configuredWeightTotal: string;
  score?: { canonicalValue: string; scaleMin: '0'; scaleMax: '100'; };
  context: {
    analysisHorizonHash: string;
    comparisonCohortHash?: string; comparisonEligibilityHash?: string;
    policySnapshotHash: string; analysisMethodSetVersion: string;
  };
  scoreHash: string;
  createdAt: string;
};
// hash: PERFORMANCE_SCORE_V1
```

Score = média ponderada com pesos fixos da policy — nunca
"maquiar comercial fraco pra parecer organic bom". Pesos vêm 100% da
policy, nunca calculados dinamicamente. Sinal `required` +
`UNAVAILABLE` → score inteiro `INCOMPLETE`, nunca parcial silencioso
(mas ainda pode existir `ORGANIC score AVAILABLE` se houver definição
separada).

**Ranking é projeção sobre `PerformanceScore`, não outro score**:

```typescript
type PerformanceRankEntry = {
  subjectKey: string;
  performanceScoreId: string; performanceScoreHash: string;
  rank?: number;
  rankStatus: 'RANKED' | 'TIED' | 'UNRANKED_INSUFFICIENT_SAMPLE'
    | 'UNRANKED_SIGNAL_UNAVAILABLE' | 'UNRANKED_INCOMPARABLE_HORIZON';
};
```

Empate real compartilha rank.

### HeuristicAttributionHypothesis

```typescript
type HeuristicAttributionHypothesisType = 'TEMPORAL_COMPATIBILITY'
  | 'OWN_CLICK_COMMERCE_PROXIMITY' | 'AGGREGATE_PATTERN_ASSOCIATION';
type HeuristicSupportLevel = 'LOW_SUPPORT' | 'MODERATE_SUPPORT' | 'HIGH_SUPPORT';

type HeuristicAttributionHypothesis = {
  heuristicAttributionHypothesisId: string;
  tenantId: string;
  analysisBasisHash: string;
  hypothesisType: HeuristicAttributionHypothesisType;
  subjectKey: string;
  supportingEvidenceRefs: Array<{
    evidenceKind: 'METRIC_SNAPSHOT' | 'COMMERCE_OBSERVATION' | 'OWNED_AFFILIATE_CLICK_EVENT' | 'CANONICAL_ATTRIBUTION_EVIDENCE';
    id: string; hash: string;
  }>;
  contradictingEvidenceRefs: Array<{ evidenceKind: string; id: string; hash: string; }>;
  assumptions: string[];
  limitations: string[];
  supportLevel: HeuristicSupportLevel;
  temporalCompatibility?: {
    withinProviderAttributionWindow: boolean;
    timeDistanceMs?: number; // contexto apenas, nunca prova
  };
  canonicalAttributionLevelGranted: false;
  eligibleForEvidenceBackedScore: false;
  hypothesisHash: string;
  createdAt: string;
};
// hash: HEURISTIC_ATTRIBUTION_HYPOTHESIS_V1
```

`canonicalAttributionLevelGranted: false` e
`eligibleForEvidenceBackedScore: false` ficam **literalmente
congelados como `false`** — o melhor bloqueio estrutural (nenhum
signal consegue apontar pra `HEURISTIC_ATTRIBUTION_HYPOTHESIS` para
alimentar `PerformanceScore`, mesmo em teoria). Proibido no contrato:
`commissionAttributed`/`conversionAttributed`/`revenueAttributed` —
pode referenciar `CommerceObservation`, nunca reivindicar ownership
comercial. `assumptions`/`limitations` são texto livre transparente,
mas nunca mudam o score factual.

### Identidade e resultado final

```typescript
type PerformanceAnalysisIdentity = {
  performanceAnalysisIdentityId: string;
  tenantId: string;
  analysisKind: PerformanceAnalysisKind;
  analysisBasisHash: string;
  policySnapshotHash: string;
  analysisHorizonHash: string;
  analysisMethodSetVersion: string;
  identityHash: string;
  createdAt: string;
};
// hash: PERFORMANCE_ANALYSIS_IDENTITY_V1 — rege idempotência do
// resultado. Mesmo basis+policy+horizon+methodVersion → mesmo
// resultado. Qualquer um mudou → nova identity → novo result.
```

**Idempotência do resultado**: UNIQUE lógico `(tenantId,
PerformanceAnalysisIdentity.identityHash)`.

```typescript
type OrganicPerformanceAnalysisSection = {
  derivedMetricRefs: Array<{ id: string; hash: string; }>;
  signalRefs: Array<{ id: string; hash: string; }>;
  scoreRefs: Array<{ id: string; hash: string; }>;
};

type CommercialPerformanceAnalysisSection = {
  derivedMetricRefs: Array<{ id: string; hash: string; }>;
  canonicalAttributionEvidenceRefs: AnalysisAttributionEvidenceRef[];
  signalRefs: Array<{ id: string; hash: string; }>;
  scoreRefs: Array<{ id: string; hash: string; }>;
  aggregateCommerceContextHash?: string;
};

type ComparisonAnalysisSection = {
  comparisonCohortId: string; comparisonCohortHash: string;
  comparisonEligibilityId: string; comparisonEligibilityHash: string;
  groupSummaries: Array<{
    groupKey: string; entityCount: number;
    derivedMetricRefs: Array<{ id: string; hash: string; }>;
    scoreRefs: Array<{ id: string; hash: string; }>;
  }>;
  ranking?: PerformanceRankEntry[];
};

type PerformanceAnalysisResult = {
  performanceAnalysisResultId: string;
  tenantId: string;
  performanceAnalysisIdentityId: string; performanceAnalysisIdentityHash: string;
  performanceAnalysisInputHash: string;
  analysisBasisId: string; analysisBasisHash: string;
  analysisKind: PerformanceAnalysisKind;
  analysisHorizonHash: string;
  policySnapshotHash: string;
  analysisMethodSetVersion: string;
  organic?: OrganicPerformanceAnalysisSection;
  commercial?: CommercialPerformanceAnalysisSection;
  comparison?: ComparisonAnalysisSection;
  heuristicHypotheses: Array<{ heuristicAttributionHypothesisId: string; heuristicAttributionHypothesisHash: string; }>;
  resultCompleteness: 'COMPLETE' | 'PARTIAL_SIGNAL_UNAVAILABLE' | 'DESCRIPTIVE_ONLY';
  resultHash: string;
  createdAt: string;
};
// hash: PERFORMANCE_ANALYSIS_RESULT_V1 — inclui identityHash,
// inputHash, basisHash, kind, horizonHash, policySnapshotHash,
// methodVersion, refs/hashes de cada seção, resultCompleteness. Não
// inclui result ID nem createdAt.
```

**`heuristicHypotheses` fica estruturalmente fora da seção comercial
factual** — `commercial.canonicalAttributionEvidenceRefs` e
`heuristicHypotheses` são campos irmãos separados; nenhuma query
futura precisa interpretar um enum pra descobrir se aquilo era
"verdade" — o campo em si já responde.

**Regras de elegibilidade comercial**: score `DIRECT_COMMERCIAL` exige
evidência `DIRECT_PROVIDER_CONFIRMED` referenciando o subject;
`PROVIDER_AGGREGATE_ONLY` fica só em `aggregateCommerceContext`, nunca
gera signal individual. `OWN_CLICK_CONFIRMED_ONLY` pode gerar signal/
score `OWNED_CLICK`, nunca `DIRECT_COMMERCIAL` por si só. Antes de
percentil/ranking entre grupos, `ComparisonEligibility.status` precisa
ser `COMPARATIVE_ELIGIBLE` — `DESCRIPTIVE_ONLY` permite estatística
descritiva, nunca ranking comparativo. `SINGLE_PUBLICATION_ANALYSIS`
pode ter score sem cohort se a normalização for `PIECEWISE_LINEAR`
(calibração já congelada pela policy); `PERCENTILE_WITHIN_COHORT`
exige cohort válido.

**Calibração piecewise-linear** reaproveita a mesma garantia das
Skills 04/05 — pontos ordenados, sem x duplicado, sem segmento
inválido; comportamento V1 de extrapolação é `CLAMP_TO_ENDPOINTS`
(mesma semântica das Skills anteriores, evitando duas semânticas de
calibração no sistema).

**Analysis method version**: `analysisMethodSetVersion` entra na
`PerformanceAnalysisIdentity` porque mesmos dados + mesma policy +
algoritmo corrigido futuramente precisam poder gerar novo resultado
sem destruir o antigo — `METHOD_SET_V1 → R1`, `METHOD_SET_V2 → R2`,
ambos permanecem auditáveis; Skill 21 pode escolher o método latest
aprovado, mas não altera R1.

### Idempotência (resumo)

- `DerivedMetric`: `analysisBasisHash + subject/group + derivedMetricKey + method + methodVersion + source hashes → derivationHash`. Conflito → `DERIVED_METRIC_REPLAY_CONFLICT`.
- `ComparisonCohort`: `analysisBasisHash + comparisonDimension + cohortDefinitionKey + horizonHash + membership → cohortHash` (independente de Job/Attempt).
- `PerformanceSignal`: `analysisBasisHash + subject/group + signalKey + source hashes + normalization context + policy snapshot → signalHash`.
- `PerformanceScore`: `analysisBasisHash + scoreKey + subject/group + signalRefs → scoreHash`. Não deriva score novo pra basis já processada; coorte já congelada.

### Hashes canônicos deste bloco

```text
ANALYSIS_HORIZON_V1
ANALYSIS_PUBLICATION_TIME_ANCHOR_V1
PERFORMANCE_ANALYSIS_INPUT_V1
ANALYSIS_SUBJECT_BASIS_V1
ANALYSIS_AGGREGATE_COMMERCE_CONTEXT_V1
ANALYSIS_BASIS_V1
PERFORMANCE_ANALYSIS_POLICY_V1
PERFORMANCE_ANALYSIS_POLICY_BINDING_RESOLUTION_V1
DERIVED_METRIC_V1
COMPARISON_COHORT_V1
COMPARISON_ELIGIBILITY_V1
PERFORMANCE_SIGNAL_V1
PERFORMANCE_SCORE_V1
HEURISTIC_ATTRIBUTION_HYPOTHESIS_V1
PERFORMANCE_ANALYSIS_IDENTITY_V1
PERFORMANCE_ANALYSIS_RESULT_V1
```

### Cadeias

```text
Individual:
SocialPublicationBinding + Skill18 MetricSnapshots + canonical attribution
  evidence + CreativeDirectionResult → AnalysisSubjectBasis → AnalysisBasis
  → DerivedMetric[] → PerformanceSignal[] → PerformanceScore[]
  → PerformanceAnalysisResult

Cohort:
AnalysisSubjectBasis[] → ComparisonCohort → ComparisonEligibility
  (INSUFFICIENT_SAMPLE | DESCRIPTIVE_ONLY | COMPARATIVE_ELIGIBLE)
  → signals/calibração → scores/ranking → PerformanceAnalysisResult

Heurística:
CommerceObservation + OwnedAffiliateClickEvent + timestamps + canonical
  evidence existente → HeuristicAttributionHypothesis
  → PerformanceAnalysisResult.heuristicHypotheses
  (sem seta pra AffiliateAttributionEvidence/PerformanceSignal/PerformanceScore na V1)
```

Esse bloqueio estrutural (heurística nunca alcança score factual na V1)
é provavelmente a garantia mais importante da Skill 19.

## Fechamento (rodada 3 — debate com ChatGPT, 2026-09-18)

Dois patches compatíveis necessários antes do fechamento:

### Patch 1 — `AnalysisSubjectBasis` (na própria Skill 19)

`AnalysisSubjectBasis` tinha `metricSnapshots` e
`canonicalAttributionEvidence`, mas não as `CommerceObservation`
individuais nem os cliques próprios que originaram os sinais
comerciais — evidência prova a relação, não necessariamente contém o
valor de comissão ou o evento necessário ao cálculo.

```typescript
type AnalysisOwnedAffiliateClickEventRef = {
  ownedAffiliateClickEventId: string;
  ownedAffiliateClickEventHash: string;
  occurredAt: string;
};

// AnalysisSubjectBasis ganha:
individualCommerceObservations: AnalysisCommerceObservationRef[];
ownedAffiliateClickEvents: AnalysisOwnedAffiliateClickEventRef[];
```

Regra: `individualCommerceObservations` só inclui `CommerceObservation`
deterministicamente elegível para aquele subject;
`ownedAffiliateClickEvents` só eventos com lineage determinística pro
subject/link — nada de comércio agregado aqui. O hash já existente
`ANALYSIS_SUBJECT_BASIS_V1` passa a incluir os dois conjuntos ordenados
canonicamente (sem versão nova artificial por causa do patch).

### Patch 2 — leitura histórica (patch compatível na Skill 18)

> `REFERENCE ONLY` — ver Ponto F3 no `SPEC.md` da Skill 18 pra
> definição completa e canônica.

```typescript
// MetricFieldCapability ganha (dono: Skill 18):
historicalReadStatus?: MetricHistoricalReadStatus;
```

`readStatus` = consigo ler a métrica hoje; `historicalReadStatus` =
consigo pedir ao provider um ponto histórico válido (tipo dedicado
`MetricHistoricalReadStatus`, não reaproveita `MetricReadCapabilityStatus`).
Patch owned pela Skill 18, não reabre 18/25.

### Freshness atual ≠ cobertura histórica

Princípio mais importante deste bloco: "performance atual do post"
pode exigir snapshot recente; "views nas primeiras 24h" não importa se
o snapshot é antigo hoje — importa se existe observação suficientemente
próxima de `publishedAt + 24h`.

```typescript
type AnalysisDataRecencyMode = 'CURRENT_AS_OF' | 'HORIZON_BOUNDARY_COVERAGE';
```

Nunca usar o snapshot atual de um vídeo de 20 dias como substituto do
snapshot das primeiras 24h só porque está "fresco".

### AnalysisBasisSelectionPolicy

```typescript
type AnalysisBasisSelectionPolicy = {
  policyId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  metricData: {
    currentStateMaxSnapshotAgeMs?: number;
    staleRequiredDataBehavior: 'BLOCKED_UNTIL_REFRESH' | 'PROCEED_WITH_KNOWN_DATA';
    allowHistoricalRefreshWhenVerified: boolean;
  };
  commerce: {
    stateSelection: 'LATEST_OBSERVATION_PER_CONVERSION_AS_OF';
    ambiguousLatestStateBehavior: 'EXCLUDE_AS_AMBIGUOUS';
  };
  ownedClicks: { selection: 'EVENT_OCCURRED_WITHIN_ANALYSIS_HORIZON'; };
  freeze: { excludeEvidenceObservedAfterAnalysisAsOf: true; atomicReferenceFreeze: true; };
  calibration: {
    percentileMethod: 'EMPIRICAL_MIDRANK';
    piecewiseOutOfRangeBehavior: 'CLAMP_TO_ENDPOINTS';
  };
  policyHash: string;
  createdAt: string;
};
// hash: ANALYSIS_BASIS_SELECTION_POLICY_V1
```

`PerformanceAnalysisPolicy` define COMO analisar; `AnalysisBasisSelectionPolicy`
define QUAIS evidências entram na base (referenciado via
`basisSelectionPolicy: { policyId, policyVersion, policyHash }` — patch
no `PerformanceAnalysisPolicy`). Nenhuma seleção invisível.

**Boundary de horizonte** (`desiredStart = publicationAnchor + startOffset`):
V1 `BRACKET_PREFERRED` — exact timestamp, ou primeira observação ≥
boundary dentro da tolerância, ou última observação < boundary dentro
da tolerância (tolerâncias vêm do `PerformanceHorizonPolicy`).

**Não inventa ponto histórico ausente** — se quer `FIRST_24H` e só tem
T+2h e T+7d, não interpola por regra de três; resultado
`HISTORICAL_COVERAGE_UNAVAILABLE`, a menos que Skill 18 tenha
capability verificada pra buscar aquele histórico no provider.

**Refresh histórico só quando capability permite**: snapshot histórico
ausente → `historicalReadStatus ∈ {VERIFIED_AVAILABLE,
PARTIALLY_VERIFIED}`? sim → pede refresh histórico à Skill 18; não →
marca coverage unavailable. Nunca "vou consultar `media_views` agora e
fingir que corresponde a T+24h".

### MetricRefreshRequest (patch compatível na Skill 18)

> **`REFERENCE ONLY` — dono canônico é a Skill 18.** A Skill 18 é
> formalmente dona de `MetricRefreshRequest`, `MetricHistoricalReadStatus`,
> `MetricRefreshReason`, `MetricRefreshSubjectRef`,
> `MetricRefreshObservationWindow`, e do campo `historicalReadStatus?`
> patchado in-place em `MetricFieldCapability` — ver "Reparo transversal
> pós-revisão Fable → Ponto F3" no `SPEC.md` da Skill 18 pra definição
> completa, hash (`METRIC_REFRESH_REQUEST_V1`) e `FATAL_ERROR`. Até
> 2026-09-18 este contrato só existia aqui (rascunho local, com nomes
> diferentes dos finais) e nunca havia sido escrito no `SPEC.md` real da
> Skill 18 — achado exato B5 da revisão Fable/Claude Fable 5 Max. A
> Skill 19 **não define esses tipos, só consome**; nenhuma definição
> local concorrente permanece neste arquivo.

Fluxo consumido pela Skill 19 (resumo, sem redeclarar tipos): quando a
`AnalysisBasis` detecta lacuna (ex. `HISTORICAL_COVERAGE_GAP` — análise
exige 30 dias, evidência cobre só 7), a Skill 19 materializa um
`MetricRefreshRequest` com o motivo/janela/subjects/fields exatos e
segue via `MetricRefreshRequest → KernelArtifactRef →
StandaloneWorkRequest{targetSkillId:'18'} → Skill02 → Skill18` (Ponto C
do reparo transversal) — **nunca toca provider diretamente**. A
`refreshRequestKey` deve refletir tenant+subjects+fields+janela+motivo
(nunca `Date.now()`), então um retry da Skill 19 reaproveita a mesma
key em vez de disparar coletas infinitas. Depois do refresh, a Skill 19
continua dona da decisão analítica — a Skill 18 nunca declara "análise
de performance válida", só entrega evidência nova.

### Readiness da basis

```typescript
type AnalysisBasisReadinessStatus = 'READY' | 'READY_WITHOUT_REFRESHABLE_GAP'
  | 'WAITING_FOR_REFRESH' | 'BLOCKED_MISSING_CAPABILITY';

type AnalysisBasisRequirementResult = {
  requirementKey: string;
  subjectKey?: string;
  domain: 'ORGANIC' | 'OWNED_CLICK' | 'DIRECT_COMMERCIAL' | 'AGGREGATE_COMMERCIAL';
  recencyMode: AnalysisDataRecencyMode;
  required: boolean;
  status: 'SATISFIED' | 'SATISFIED_STALE_ALLOWED' | 'REFRESH_REQUIRED' | 'REFRESH_IN_PROGRESS' | 'UNAVAILABLE';
  selectedSourceRefs: Array<{ id: string; hash: string; }>;
  refreshRequestId?: string;
  refreshRequestHash?: string;
  reasonCode?: string;
};

type AnalysisBasisSelectionResult = {
  analysisBasisSelectionResultId: string;
  tenantId: string;
  analysisRequestKey: string;
  performanceAnalysisInputHash: string;
  basisSelectionPolicyId: string; basisSelectionPolicyVersion: string; basisSelectionPolicyHash: string;
  evaluatedAt: string;
  status: AnalysisBasisReadinessStatus;
  requirements: AnalysisBasisRequirementResult[];
  analysisAsOf?: string;
  selectionHash: string;
  createdAt: string;
};
// hash: ANALYSIS_BASIS_SELECTION_RESULT_V1
```

**`analysisAsOf` só é definido quando pronto** — enquanto
`WAITING_FOR_REFRESH`, não congelamos `analysisAsOf` (seria incoerente
manter `analysisAsOf=14:00` e depois excluir justamente o dado pedido).
Quando o selection result vira `READY`/`READY_WITH_ALLOWED_STALE_DATA`,
definimos `analysisAsOf` e congelamos a `AnalysisBasis`.

**Depois de `BASIS_FROZEN`, acabou a seleção** — snapshot novo um
segundo depois não entra; replay da mesma análise → mesma
`AnalysisBasis`; nova informação → nova `analysisRequestKey` → nova
basis → novo result.

### Comportamento comercial na basis

- Skill 18 preserva `C1 PENDING/VALIDATED/CANCELLED` — Skill 19 não
  soma isso como três conversões; a basis comercial seleciona a
  **latest `CommerceObservation`** por `providerConversionId` com
  `observedAt ≤ analysisAsOf`.
- Duas observações incompatíveis do mesmo `conversionId` no mesmo
  ponto temporal máximo sem ordem factual confiável →
  `COMMERCE_STATE_AMBIGUOUS` (fatal).
- `OWN_CLICK_CONFIRMED_ONLY` + `DIRECT_PROVIDER_CONFIRMED` no mesmo
  contexto não significa "duas conversões" — domínios independentes
  (`DIRECT_COMMERCIAL` usa `CommerceObservation` única +
  `DIRECT_PROVIDER_CONFIRMED`; `OWNED_CLICK` usa
  `OwnedAffiliateClickEvent` único).

### AnalysisRun (state machine)

```typescript
type PerformanceAnalysisRunState = 'PREPARED' | 'RESOLVING_BASIS'
  | 'WAITING_FOR_METRIC_REFRESH' | 'BASIS_FROZEN' | 'DERIVING'
  | 'BUILDING_COMPARISON' | 'SCORING' | 'MATERIALIZING_RESULT'
  | 'COMPLETED' | 'CANCELLED';
// sem FAILED/BLOCKED — Skill02 continua dona do Job lifecycle.

type PerformanceAnalysisRun = {
  performanceAnalysisRunId: string;
  tenantId: string; // PATCH (R2, 2026-09-19): runId REMOVIDO, mesmo motivo do PerformanceAnalysisInputBase acima
  jobId: string; attemptNumber: number;
  analysisRequestKey: string;
  performanceAnalysisInputHash: string;
  policyId: string; policyVersion: string; policySnapshotHash: string;
  basisSelectionPolicyId: string; basisSelectionPolicyVersion: string; basisSelectionPolicyHash: string;
  analysisMethodSetVersion: string;
  runContextHash: string;
  state: PerformanceAnalysisRunState;
  latestBasisSelectionResultId?: string; latestBasisSelectionResultHash?: string;
  analysisBasisId?: string; analysisBasisHash?: string;
  performanceAnalysisIdentityId?: string; performanceAnalysisIdentityHash?: string;
  performanceAnalysisResultId?: string; performanceAnalysisResultHash?: string;
  createdAt: string; updatedAt: string;
}; // mutável, sem hash integral
// hash imutável PERFORMANCE_ANALYSIS_RUN_CONTEXT_V1 sobre
// analysisRequestKey + inputHash + policySnapshotHash +
// basisSelectionPolicyHash + analysisMethodSetVersion.
```

**Unicidade**: UNIQUE lógico `(tenantId, analysisRequestKey)`. Retry
técnico → mesmo Run; nova Attempt ≠ nova análise.

**Replay por estado**: em `PREPARED`/`RESOLVING_BASIS`/
`WAITING_FOR_METRIC_REFRESH`, o run pode reavaliar readiness (Skill 18
pode ter terminado uma coleta enquanto o run ficava preso esperando —
re-selecionar é legítimo, não é bug). Depois de `BASIS_FROZEN`,
nenhuma observation/evidence nova entra. Em `DERIVING`, se 8 de 12
`DerivedMetric` foram persistidos, replay valida os 8 existentes e
materializa os 4 faltantes; hash incompatível →
`DERIVED_METRIC_REPLAY_CONFLICT`. Mesmo princípio pra cohort e
signal/score — sempre derivam dos hashes congelados, nunca "vou
buscar o percentile atual de novo" contra população nova. Depois de
`COMPLETED`, retorna o `PerformanceAnalysisResult` existente — zero
novo cálculo.

### Cálculo determinístico — numeric policy, percentil, score

```typescript
// patch no PerformanceAnalysisPolicy:
numericPolicy: {
  representation: 'CANONICAL_DECIMAL_STRING';
  calculationScale: number;
  outputScale: number;
  roundingMode: 'HALF_EVEN';
};
```

Nunca usa binary float como autoridade canônica; arredondamento é
feito com scale fixa antes de arredondar o output
(`round(a)+round(b) ≠ round(a+b)`).

**Percentil V1**: `EMPIRICAL_MIDRANK` —
`percentile = 100 × (count(worse) + 0.5×count(equal)) / N`, com
`worse` invertido deterministicamente para `LOWER_IS_BETTER`. Se a
comparação exige `COMPARATIVE_ELIGIBLE` e o cohort é só
`DESCRIPTIVE_ONLY`, `PERCENTILE_WITHIN_COHORT` vira
`PERFORMANCE_SIGNAL_UNAVAILABLE` — nunca calcula percentil "só pra ter
número". Piecewise-linear V1 idêntico às Skills 04/05: x estritamente
crescente sem duplicatas, interpolação linear entre pontos,
`CLAMP_TO_ENDPOINTS` fora da faixa.

**Score V1: todos os sinais são obrigatórios** — decisão que fecha uma
ambiguidade sutil: `set(signalKeys) = set(requiredSignalKeys)` para
cada `PerformanceScoreDefinition` (sinais opcionais podem existir pra
análise descritiva, mas não entram num score V1). Isso elimina a
tentação de redistribuir peso. `score = Σ(weight_i × calibratedValue_i)
/ Σ(weight_i)`, denominador é o conjunto fixo da definição — como
todos são obrigatórios em V1, sinal faltando = score indisponível, não
parcial. `weight > 0` obrigatório por sinal; `Σ weights > 0`
obrigatório (não exige `Σ weights = 1`, a fórmula já divide pelo
total).

**Ranking determinístico**: opera sobre
`PerformanceScore.score.canonicalValue` já sob `numericPolicy` — dois
scores canonicamente iguais → `TIED`; nunca usa `createdAt`/ID/"mais
recente" pra quebrar empate. Só é rankeável quando
`ComparisonEligibility=COMPARATIVE_ELIGIBLE` e
`PerformanceScore.status=AVAILABLE`; outros recebem `UNRANKED_*`.
`DESCRIPTIVE_ONLY` produz `GROUP_MEAN`/`GROUP_MEDIAN`/sample
size/coverage/exposure summary, mas nunca ranking/percentil
comparativo/claim de superioridade.

**Hipóteses V1 também são determinísticas** — não usa LLM pra decidir
`LOW_SUPPORT`/`HIGH_SUPPORT`:

```typescript
// patch no PerformanceAnalysisPolicy:
heuristics: {
  enabled: boolean;
  ruleSetVersion: string;
  allowedHypothesisTypes: HeuristicAttributionHypothesisType[];
  allowLlmGeneration: false;
  eligibleForCanonicalScore: false;
};
```

**Triplo bloqueio estrutural do heurístico** (a garantia mais
importante da Skill 19): `HeuristicAttributionHypothesis.canonicalAttributionLevelGranted=false`
+ `.eligibleForEvidenceBackedScore=false` (campos literais) +
`PerformanceSignalSource` não inclui hypothesis como origem +
`PerformanceAnalysisPolicy.heuristics.eligibleForCanonicalScore=false`
— três barreiras independentes. LLM pode futuramente explicar uma
hypothesis em prosa, mas nunca fora do modelo canônico.

**Cancelamento**: Skill 19 não tem side effects externos. Antes de
`COMPLETED`, Job cancelado → run pode virar `CANCELLED` (artefatos
analíticos imutáveis já materializados podem permanecer pra auditoria,
mas nenhum `PerformanceAnalysisResult` incompleto é exposto como
final). Depois de `COMPLETED`, cancelar Job não apaga o resultado.

### Erros

**FATAL_ERROR (34):**

```text
PERFORMANCE_TENANT_MISMATCH
PERFORMANCE_CROSS_TENANT_SOURCE
PERFORMANCE_INPUT_HASH_MISMATCH
PERFORMANCE_ANALYSIS_REQUEST_REPLAY_CONFLICT
PERFORMANCE_POLICY_NOT_FOUND
INVALID_PERFORMANCE_ANALYSIS_POLICY
ANALYSIS_BASIS_SELECTION_POLICY_NOT_FOUND
INVALID_ANALYSIS_BASIS_SELECTION_POLICY
ANALYSIS_HORIZON_INVALID
ANALYSIS_TIME_ANCHOR_HASH_MISMATCH
ANALYSIS_SUBJECT_BASIS_HASH_MISMATCH
ANALYSIS_BASIS_SOURCE_LINEAGE_MISMATCH
ANALYSIS_BASIS_REPLAY_CONFLICT
PERFORMANCE_ANALYSIS_IDENTITY_CONFLICT
DERIVED_METRIC_REPLAY_CONFLICT
DERIVED_METRIC_SOURCE_MISMATCH
DERIVED_METRIC_METHOD_INVALID
COMPARISON_COHORT_REPLAY_CONFLICT
COMPARISON_COHORT_MEMBERSHIP_CONFLICT
COMPARISON_ELIGIBILITY_REPLAY_CONFLICT
PERFORMANCE_SIGNAL_REPLAY_CONFLICT
PERFORMANCE_SIGNAL_SOURCE_INTEGRITY_VIOLATION
PERFORMANCE_SCORE_REPLAY_CONFLICT
PERFORMANCE_SCORE_WEIGHT_POLICY_INVALID
PERFORMANCE_CALIBRATION_INVALID
PERFORMANCE_RANKING_INTEGRITY_VIOLATION
COMMERCIAL_ATTRIBUTION_LINEAGE_MISMATCH
HEURISTIC_HYPOTHESIS_REPLAY_CONFLICT
HEURISTIC_CANONICAL_EVIDENCE_ESCALATION_ATTEMPT
HEURISTIC_SCORE_CONTAMINATION_ATTEMPT
PERFORMANCE_RESULT_REPLAY_CONFLICT
PERFORMANCE_INVALID_STATE_TRANSITION
ANALYSIS_NUMERIC_POLICY_VIOLATION
PERFORMANCE_RESULT_LINEAGE_MISMATCH
```

**RETRYABLE_ERROR** (Skill 19 não lê provider diretamente, lista curta):

```text
PERFORMANCE_BASIS_LOOKUP_TRANSIENT_ERROR
PERFORMANCE_BASIS_SELECTION_TRANSIENT_ERROR
PERFORMANCE_METRIC_REFRESH_REQUEST_TRANSIENT_ERROR
PERFORMANCE_METRIC_REFRESH_STATUS_TRANSIENT_ERROR
PERFORMANCE_SCORE_PERSISTENCE_TRANSIENT_ERROR
PERFORMANCE_RESULT_PERSISTENCE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Depois do basis freeze, retry é só cálculo/persistência — nunca
Skill18/provider refresh de novo.

**BLOCKED:**

```text
PERFORMANCE_POLICY_NOT_CONFIGURED                    → POLICY_BLOCKED
ANALYSIS_BASIS_SELECTION_POLICY_NOT_CONFIGURED       → POLICY_BLOCKED
PERFORMANCE_METHOD_VERSION_NOT_SUPPORTED             → POLICY_BLOCKED
REQUIRED_METRIC_DATA_MISSING                         → DATA_BLOCKED
REQUIRED_METRIC_DATA_STALE (policy não permite stale)→ DATA_BLOCKED
HISTORICAL_COVERAGE_UNAVAILABLE (signal obrigatório) → DATA_BLOCKED
REQUIRED_PUBLICATION_TIME_ANCHOR_UNAVAILABLE         → DATA_BLOCKED
REQUIRED_TIME_ANCHOR_PRECISION_INSUFFICIENT          → DATA_BLOCKED
REQUIRED_CREATIVE_METADATA_UNAVAILABLE               → DATA_BLOCKED
HISTORICAL_METRIC_READ_UNVERIFIED (necessário p/ coverage) → POLICY_BLOCKED
```

**O que NÃO é erro** (resultados normais de domínio):
`WAITING_FOR_METRIC_REFRESH`, `READY_WITH_ALLOWED_STALE_DATA`,
`INSUFFICIENT_SAMPLE`, `DESCRIPTIVE_ONLY`, `NO_COMMERCIAL_EVIDENCE`,
`NO_ATTRIBUTABLE_COMMERCE`, `COMMERCE_STATE_AMBIGUOUS` (nota: este é
fatal, ver lista acima — os demais são domínio),
`NO_HEURISTIC_HYPOTHESIS`, `TIED_RANK`. `COUNTER_NON_MONOTONIC`
continua não-fatal, nunca vira valor negativo
(`DerivedMetric.valueStatus=COUNTER_NON_MONOTONIC`).

Dados stale permitidos aparecem no resultado:

```typescript
// patch em PerformanceAnalysisResult:
basisDataQuality: {
  usedAllowedStaleData: boolean;
  unavailableRequiredSignals: string[];
}; // entra no resultHash
```

`resultCompleteness=PARTIAL_SIGNAL_UNAVAILABLE` cobre "organic
disponível, commercial indisponível" sem invalidar o resultado
inteiro.

### Multi-tenant

`trustedTenantId = Job.tenantId`, precisam corresponder
`PerformanceAnalysisInput`/`PerformanceAnalysisRun`/`AnalysisBasis`/
subjects/`canonicalAttributionEvidence`/`CreativeDirectionResult`/
`DerivedMetric`/`ComparisonCohort`/`PerformanceSignal`/
`PerformanceScore`/`HeuristicAttributionHypothesis`/
`PerformanceAnalysisResult`. Divergência → `PERFORMANCE_TENANT_MISMATCH`
(`FATAL_ERROR` + security `AuditEvent`). **Nenhum cohort cross-tenant**
— mesmo que duas contas publiquem o mesmo produto, tenant A e tenant B
nunca entram na mesma `ComparisonCohort` V1 (benchmarking multi-tenant
futuro exigiria contrato de anonimização/consentimento separado);
mesmo provider account físico compartilhado não muda isso. IDs
externos (`providerMediaId`/`conversionId`) nunca são chave analítica
global — lineage vem dos artefatos tenant-scoped das Skills 17/18.

### Observabilidade

Logs por tick: `tenantId`, `jobId`, `attemptNumber`, // PATCH (R2): runId removido do log, campo não existe mais em PerformanceAnalysisRun
`analysisRequestKey`, `analysisKind`, `policyId`/`policyVersion`/
`policySnapshotHash`, `basisSelectionPolicyHash`, `analysisBasisHash?`,
`analysisAsOf?`, `subjectCount`, `derivedMetricCount`,
`comparisonCohortId?`/`Hash?`/`comparisonEligibilityStatus?`,
`performanceSignalCount`/`availableSignalCount`/
`unavailableSignalCount`, `performanceScoreCount`/
`availableScoreCount`, `heuristicHypothesisCount`, `resultId?`/
`resultHash?`/`resultCompleteness?`, `durationMs`, `errorCode?`.
**Nunca logar por padrão**: `providerAffiliateUrl`, `trackingToken`,
order IDs, raw commerce payload, actor/user identifiers, texto bruto
de mensagens, `assumptions`/`limitations` livres completos. Não usar
`mediaId`/`conversionId`/`subjectKey` como label de métrica de alta
cardinalidade.

Audit events: `PerformanceAnalysisRun created`,
`MetricRefreshRequest requested`/`waiting for refresh`/`refresh
requirement satisfied`, `AnalysisBasis frozen`/`frozen with allowed
stale data`, `ComparisonCohort materialized`, `ComparisonEligibility
determined`, `PerformanceScore materialized`/`score unavailable due
required signal`, `HeuristicAttributionHypothesis materialized`,
`replay conflict`/`score replay conflict`. Não precisa `AuditEvent`
pra cada soma/divisão.

Métricas operacionais: `performance_analysis_run_total`,
`performance_analysis_completed_total`,
`performance_analysis_waiting_refresh_total`,
`performance_basis_frozen_total`,
`performance_basis_stale_allowed_total`,
`performance_derived_metric_total`,
`performance_comparison_cohort_total`,
`performance_comparison_eligibility_total{insufficient, descriptive,
comparative}`, `performance_signal_available_total`/
`unavailable_total`, `performance_score_available_total`/
`unavailable_total`, `performance_hypothesis_total`,
`performance_result_total`. Métricas de proteção:
`performance_cross_tenant_block_total`,
`performance_heuristic_escalation_block_total`,
`performance_heuristic_score_contamination_block_total`,
`performance_historical_coverage_unavailable_total`,
`performance_counter_non_monotonic_total` — importantes pra descobrir
uso indevido da análise. Não criar métricas com dimensão de negócio
sensível — para direct commercial, o rótulo reflete
`attribution_level=DIRECT_PROVIDER_CONFIRMED`; para
aggregate/unattributed, nomes refletem isso
(`provider_aggregate_commission_observed`, nunca `video_commission`).

### Plano de testes — 100 casos críticos, 10 blocos

1–10 Input/policy/horizon: input single/cohort/creative-attribute
válidos; mesma requestKey+input → mesmo run; mesma
requestKey+diferente → fatal; policy ausente → blocked; policy
inválida → fatal; horizon relativo inválido → fatal; horizon absoluto
end≤start → fatal; method version não suportada → blocked.

11–20 Basis selection/freshness: current snapshot dentro do max age →
READY; stale + `WAIT_FOR_REFRESH` → refresh request; mesma
necessidade em replay → mesma request key; refresh em andamento →
`WAITING_FOR_METRIC_REFRESH`; refresh concluído → nova seleção pode
ficar READY; stale permitido →
`READY_WITH_ALLOWED_STALE_DATA`; basis só congela depois de readiness
resolvida; `WAITING`→`BASIS_FROZEN` só via todos requirements
satisfeitos; `analysisAsOf` só nasce no freeze; replay pós-freeze
reutiliza mesma basis.

21–30 Horizonte histórico/derivação temporal: snapshot exato em T+24h
satisfaz boundary; start/end boundary escolhem ponto dentro da
tolerância; ausência dentro da tolerância →
`HISTORICAL_COVERAGE_UNAVAILABLE`; current snapshot não substitui
histórico ausente; `historicalReadStatus=VERIFIED_AVAILABLE` permite
refresh histórico; `UNVERIFIED` não autoriza reconstrução; `COUNTER_DELTA` usa
mesma series identity; `T2<T1` → `COUNTER_NON_MONOTONIC`; growth com
base zero → `UNDEFINED_BASE_ZERO`.

31–40 Commerce/attribution/clicks: latest `CommerceObservation` por
conversionId é selecionada; `PENDING`+`VALIDATED` conta uma conversão;
`VALIDATED`+`CANCELLED` posterior preserva estado atual; empate
temporal incompatível → `COMMERCE_STATE_AMBIGUOUS`; aggregate commerce
não entra em subject basis individual; owned click determinístico gera
`OWN_CLICK_CONFIRMED_ONLY`; direct provider requer `CommerceObservation`
+ evidência direta juntos; `OWN_CLICK_CONFIRMED_ONLY` sozinho nunca é
escalado a signal `DIRECT_COMMERCIAL`;
`UNATTRIBUTED` não gera signal comercial individual; promoted product
nunca substitui purchased product ausente.

41–50 Cohort/sample eligibility: membership do cohort é congelado;
subject posterior não entra em cohort antigo; horizon incompatível
exclui member; N total insuficiente → `INSUFFICIENT_SAMPLE`; grupo
insuficiente → não comparative eligible; coverage baixa impede
eligibility conforme policy; exposure floor respeitado quando
configurado; `DESCRIPTIVE_ONLY` permite mean/median mas proíbe ranking
comparativo; `COMPARATIVE_ELIGIBLE` libera comparação.

51–60 Signals/calibração: signal disponível preserva rawValue; ausente
não vira zero; required source faltante → `UNAVAILABLE`; percentile
usa população congelada e `EMPIRICAL_MIDRANK`; empate recebe mesmo
percentile pelo midrank; `LOWER_IS_BETTER` invertido corretamente;
piecewise points duplicados → fatal; fora da faixa → clamp endpoint;
cohort inelegível impede percentile signal.

61–70 Scores/ranking: todos signalKeys do score são required na V1;
missing signal torna score indisponível; peso nunca redistribuído;
weighted average usa fixed weights; binary float não usado como valor
canônico; `HALF_EVEN` segue numeric policy; scores iguais → `TIED`;
competition rank produz 1,2,2,4; createdAt/ID nunca quebra empate;
aggregate/unattributed evidence nunca alimenta direct-commercial
score.

71–80 Heurísticas: temporal proximity pode criar hypothesis conforme
rule set; `canonicalAttributionLevelGranted` e
`eligibleForEvidenceBackedScore` permanecem `false`; hypothesis não
pode ser `PerformanceSignal` source; não cria
`AffiliateAttributionEvidence`; não recebe `commissionAttributed`;
supporting `CommerceObservation` continua referência contextual apenas;
mesma basis/rule set → mesma hypothesis; tentativa de elevar heuristic
→ fatal integrity violation; tentativa de alimentar canonical score →
fatal integrity violation.

81–90 Replay/state machine: `PREPARED→RESOLVING_BASIS` válido;
`WAITING` refresh pode voltar a `RESOLVING_BASIS`; `BASIS_FROZEN` não
volta a `RESOLVING_BASIS`; replay parcial de `DerivedMetric` não
duplica; replay de cohort/signal/score reutiliza hash existente;
`COMPLETED` retorna mesmo result; dados novos pós-`COMPLETED` não
alteram result; nova `analysisRequestKey` pode produzir nova
basis/result.

91–100 Multi-tenant/resultado/observabilidade: Job tenant governa toda
análise; `MetricSnapshot`/`CommerceObservation`/`AttributionEvidence`
cross-tenant → fatal; cohort nunca mistura tenants; logs não expõem
trackingToken/affiliate URL/order IDs; stale permitido fica
explicitamente marcado no result; heuristic continua fora da
commercial canonical section; resultHash reproduz exatamente
basis/policy/method/sections; **Skill 19 nunca chama provider
diretamente nem altera evidência das Skills 15/18.**

### Hashes novos deste bloco

```text
ANALYSIS_BASIS_SELECTION_POLICY_V1     regras de escolha/congelamento da evidence basis
METRIC_REFRESH_REQUEST_V1              patch compatível owned pela Skill18
ANALYSIS_BASIS_SELECTION_RESULT_V1     resultado imutável de uma tentativa de readiness/selection
PERFORMANCE_ANALYSIS_RUN_CONTEXT_V1    contexto imutável do run
```

`PerformanceAnalysisRun` não recebe hash integral porque é mutável.

### Cadeia operacional final

```text
PerformanceAnalysisInput → PerformanceAnalysisRun → RESOLVING_BASIS
  → dados suficientes?
      não (refresh possível) → MetricRefreshRequest → Skill18
        → WAITING_FOR_METRIC_REFRESH → reavaliar
      sim → AnalysisBasisSelectionResult READY → analysisAsOf
        → ATOMIC BASIS FREEZE → AnalysisBasis
        → PerformanceAnalysisIdentity → DerivedMetric[]
        → ComparisonCohort/Eligibility → PerformanceSignal[]
        → PerformanceScore[] → HeuristicAttributionHypothesis[]
        → PerformanceAnalysisResult

E depois de BASIS_FROZEN não existe mais seta de volta para dados novos.
```

### Cinco garantias operacionais de fechamento (ChatGPT)

1. Freshness atual e cobertura histórica são problemas diferentes:
   dado recente não substitui uma observação histórica que nunca foi
   coletada.
2. `AnalysisBasis` é a fronteira de imutabilidade da Skill 19. Antes
   dela, a Skill pode aguardar a Skill 18; depois dela, nenhum dado
   novo entra naquela análise.
3. Uma conversão observada várias vezes ao longo do tempo conta uma
   única vez no estado analítico corrente; Skill 19 seleciona
   deterministicamente o estado mais recente conhecido até
   `analysisAsOf` e preserva a lineage histórica na Skill 18.
4. Calibração, percentil, pesos, arredondamento e ranking são
   algoritmos determinísticos versionados. Nenhum modelo de linguagem
   decide números, posições ou níveis de evidência.
5. Hipóteses podem orientar investigação e futuras variações, mas são
   estruturalmente incapazes de se transformar em evidência canônica
   ou score factual na V1.

## Auditoria real do repositório (2026-09-18)

- **Dashboard admin existente é real, mas não tem relação com
  video-machine.** `src/app/admin/analytics/page.tsx` renderiza
  `RankingCard` ("Termos mais buscados", "Produtos mais clicados",
  "Cliques por marketplace", "Páginas mais vistas") via
  `getAnalyticsStats()`/`getDailyTrend()`
  (`src/lib/admin/stats.ts`) — rankings simples por contagem sobre
  `page_views`/`click_events` (tráfego de site, não publicação de
  vídeo). `src/app/admin/comparacoes/page.tsx` usa
  `MarketplaceComparisonCard` (`getComparisonStats()`) — comparação de
  preço entre plataformas via `site_catalog`, nada a ver com
  performance de vídeo/social. `getOverviewStats()` calcula
  `pctChange` período-sobre-período (7 dias vs. 7 dias anteriores)
  sobre `page_views`/`click_events` — precedente real e reutilizável de
  **estilo** de cálculo de tendência/delta, mas escopado a analytics de
  site puro, não a `MetricSnapshot`/`AffiliateAttributionEvidence`.
  **Nada disso toca tabelas de video-machine — greenfield para o
  domínio real da Skill 19.**
- **Precedente forte de ranking/normalização: Skills 04 e 05**
  (`DISCOVERY_RANKING_V1`/`OFFER_RANKING_V1`). Média ponderada, nunca
  soma: `score = Σ(signal.value × weight) / Σ(activeWeights)`, cada
  `RankingSignal.value` normalizado 0..100. **"Nunca renormaliza pesos
  por candidato"** — sinal ausente com peso>0 torna o candidato
  inelegível (`RANKING_SIGNAL_UNAVAILABLE`), nunca redistribui peso
  silenciosamente. Calibração piecewise-linear sobre percentis reais
  (ex.: Skill 05 — `{raw:0.07, score:50}` p50, `{raw:0.14, score:90}`
  p90, `{raw:0.28, score:100}` máx V1, interpolação linear entre
  âncoras). **Este é o padrão a reaproveitar** para qualquer score de
  performance da Skill 19.
- **Contratos da Skill 18 (lidos por completo)**: `MetricSnapshot`
  (append-only, `observations: MetricObservation[]`, nunca
  `latestValue` como autoridade), `MetricObservation`
  (`status: OBSERVED_VALUE|EXPLICIT_ZERO|NOT_AVAILABLE|NOT_APPLICABLE`,
  `value?`, `dimensions`), `CommerceObservation` (fatos Shopee:
  `providerConversionId`, `conversionStatus`, `clickTime?`,
  `purchaseTime?`, `commission?`, `providerOrderIds[]` — append-only,
  múltiplas linhas por conversão ao longo do tempo),
  `AttributionEvidenceMaterializationResult` →
  `attributionLevel: DIRECT_PROVIDER_CONFIRMED|OWN_CLICK_CONFIRMED_ONLY|
  PROVIDER_AGGREGATE_ONLY|UNATTRIBUTED`.
- **Fronteiras explícitas já escritas na Skill 18 nomeando a Skill 19**
  (13 ocorrências): "Skill 19 nunca pode elevar silenciosamente o
  nível de evidência — pode apenas dizer 'há correlação temporal
  possível' para análise heurística futura, **sem alterar a evidência
  canônica**"; derivação de delta para métricas `CUMULATIVE_COUNTER`
  pertence à Skill 19, não à Skill 18; "Skill 19 nunca lê metade da
  coleta" (materialização precisa estar completa antes de ficar
  visível); `INFERRED_HEURISTIC` fica reservado explicitamente para
  análise futura da Skill 19, sempre separado da evidência canônica.
- **Dimensões de comparação disponíveis**: `SocialPublicationBinding`
  (Skill 17) expõe `finalizedVideoRenditionId`,
  `affiliateLinkArtifactId`, `creativeCtaIntentId`, `promotedProductId`,
  `providerMediaId`/`providerStoryId`, `providerAccountId` — chaves de
  join, sem campo de performance próprio. `CreativeDirectionResult`
  (Skill 07) expõe `creativeMode: TREND_INFORMED|EVERGREEN`,
  `archetype`, `hookStrategy`, `narrativeStructure`, `visualApproach`,
  `ctaIntent`. A Skill 07 recusou explicitamente computar isso:
  **"Nada como `best_archetype`/`POV_success_rate`/`hook_quality_score`
  até as Skills 18/19 possuírem dados reais"** — handoff nomeado
  diretamente para a Skill 19.
- **Nenhum outro código analítico/estatístico existe no repo** — zero
  A/B testing, cohort analysis, trend detection, z-score/percentil/
  regressão fora dos dois SPECs já cobertos. **Totalmente greenfield.**
- **Nenhuma tabela de score/ranking computado existe hoje** — todos os
  "rankings" do admin são `count()`/`order by` ao vivo sobre tabelas
  cruas, nunca score derivado persistido. **Greenfield para output de
  análise persistido.**

## Questões reais para o debate com o ChatGPT

1. Como a Skill 19 deriva um "score de performance" sem inventar uma
   métrica definitiva — reaproveitando o padrão `*_RANKING_V1`
   (Skills 04/05) mas aplicado a séries temporais em vez de um único
   snapshot de oferta?
2. Como comparar performance entre `CreativeMode`/`archetype`/
   `hookStrategy` de forma estatisticamente honesta com volume baixo de
   dados (poucos vídeos publicados até agora) — a Skill 19 deve exigir
   um tamanho mínimo de amostra antes de declarar qualquer comparação,
   e como isso é representado no contrato (nunca um "vencedor" com N=2)?
3. Delta de métricas `CUMULATIVE_COUNTER` explicitamente delegado à
   Skill 19 pela Skill 18 — qual o contrato exato disso (ex.: uma
   Skill 19 lê dois `MetricSnapshot` e deriva `views_delta` como
   resultado analítico, nunca persistido pela Skill 18)?
4. Como a Skill 19 combina evidência de atribuição comercial
   (`AffiliateAttributionEvidence`, 4 níveis) com métricas orgânicas
   (`MetricSnapshot`) num único "resultado de performance" sem
   misturar os dois domínios de certeza (comercial confirmado vs.
   engajamento orgânico observado)?
5. A Skill 19 persiste seu output (um "PerformanceAnalysisResult"
   materializado, auditável, versionado) ou é sempre computada sob
   demanda pela futura Skill 21? Dado o padrão de imutabilidade
   estabelecido nas Skills anteriores, provavelmente precisa persistir
   — mas como isso convive com "reprocessar com dados mais recentes"?
6. `INFERRED_HEURISTIC` (reservado pela Skill 18 para a Skill 19) —
   qual o contrato formal desse nível de inferência, e como ele fica
   estruturalmente impossível de ser confundido com
   `AffiliateAttributionEvidence` canônico em qualquer consulta futura?
