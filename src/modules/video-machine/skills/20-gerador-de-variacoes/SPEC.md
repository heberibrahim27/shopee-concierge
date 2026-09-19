# Skill 20 — Gerador de Variações

> **IMPLEMENTATION STATUS: `DEFERRED_V2_CONTRACT`** (Ponto M5, reparo
> transversal pós-revisão Fable, 2026-09-18 —
> `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`, contrato completo em
> `src/modules/video-machine/IMPLEMENTATION-SCOPE.md`). V1 runtime: **NOT
> IMPLEMENTED, NOT SCHEDULED, NOT REQUIRED FOR PRODUCTION** — sem
> runtime para experiment planning/automatic variants/variant
> promotion/comparative evaluation/experiment metrics orchestration no
> V1. A produção V1 trabalha com 1 caminho criativo escolhido → 1
> candidato por fluxo normal. Isso **não desfaz o Ponto S5**: o kernel
> continua entendendo `StageWorkUnitAxis.CREATIVE_VARIANT` — `No V1
> pipeline adapter may emit CREATIVE_VARIANT work units derived from
> Skill20`. Não é `DEPRECATED`/`LEGACY` — é trabalho futuro congelado.

> **APROVADA EM ESPECIFICAÇÃO — 20/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 3 rodadas com ChatGPT (decisões
> fundacionais → contratos centrais → fechamento operacional/erros/
> testes), com auditoria real do repositório prévia (mesmo método das
> Skills 04-19). V1 é explicitamente `OBSERVATIONAL_CREATIVE_VARIATION_TEST`,
> nunca `RANDOMIZED_CONTROLLED_EXPERIMENT` — a Skill 20 nunca declara
> winner/loser/causalidade, apenas planeja, organiza e verifica se o
> plano foi satisfeito.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achados B1/B2)**: a decisão
> já aprovada "correções permanecem na mesma variante" ganha
> concretização formal — `same Experiment + same variant identity +
> same ProductionRun + new StageIteration`, nunca `correction → new
> variant`. Criar nova `StageIteration` não muda subject (≠ novo
> produto, ≠ nova variante, ≠ novo `ProductionRun`, ≠ novo
> `StageSubjectBinding` automaticamente) — preserva a mesma linhagem
> factual. Separadamente, planejamento/avaliação de experimento
> (`STANDALONE` quando apropriado) e execução real de uma variante pelo
> pipeline de produção (`ProductionRunStartRequest → Skill01`) agora
> são caminhos explicitamente distintos — ver "Reparo transversal
> pós-revisão Fable" nos `SPEC.md` das Skills 01 (Pontos C e D) e 02
> (Ponto C).
>
> **🔧 Adição pós-revisão Fable (achado B6)**: `Skill23QuotaAuthorizationRef`
> já aprovado representa `PLANNING_ADMISSION` e **nunca** cria
> `ExecutionQuotaBinding` — planning authorization nunca viaja pra
> provider execution. Ex.: uma admissão de planejamento `AUTHORIZED`
> não substitui a autorização `EXECUTION_SPEND` que a Skill 11 precisa
> pedir de novo no momento real da execução. Ver "Ponto E" no
> `SPEC.md` da Skill 23.

## Garantia central (congelada após rodada 1 de debate)

A Skill 20 transforma resultados analíticos aprovados da Skill 19 em
planos de variação criativa imutáveis, rastreáveis, limitados por
política e custo, declarando exatamente o que pretende variar, o que
deve permanecer preservado e qual evidência motivou a proposta. Ela
nunca trata associação ou hipótese como causalidade comprovada, nunca
altera artefatos anteriores, nunca executa diretamente o pipeline e
nunca decide se uma variação "venceu".

Cadeia conceitual:

```text
PerformanceAnalysisResult aprovado → motivation/evidence selection
  → CreativeVariationExperiment → ExperimentVariant[] → VariationDirective
  → Skill01 Orchestrator → Run normal por variante → Skill07 → ... → Skill17
  → Skill18 novo ciclo de coleta → (futuro) Skill19 nova análise
```

## Decisões fundacionais (rodada 1 — debate com ChatGPT, 2026-09-18)

1. **V1 não é experimento controlado real.** Não temos randomização de
   audiência, controle de exposição, split traffic nem infraestrutura
   de A/B real. O que a Skill 20 cria é
   `OBSERVATIONAL_CREATIVE_VARIATION_TEST`, não
   `RANDOMIZED_CONTROLLED_EXPERIMENT` — mesmo chamando a entidade de
   `CreativeVariationExperiment`, "experiment" significa protocolo
   rastreável de geração e comparação, nunca prova estatística de
   causalidade.
2. **Resultado melhor da variante não prova que a dimensão causou a
   melhora.** Se a variante `HOOK_STRATEGY=QUESTION` performar mais que
   o controle `DIRECT_STATEMENT`, "a variante observou performance
   superior" é legítimo; "QUESTION causou a melhora" não é — hora da
   publicação, produto, algoritmo, audiência continuam confundindo a
   comparação.
3. **Skill 20 não cria conclusão científica** — cria proposta,
   variação, plano de teste, lineage, measurement plan. Quem analisa
   resultados futuros é a Skill 19.
4. **`CreativeVariationExperiment` deve existir como entidade real**,
   separada de `PerformanceAnalysisResult` e do resultado do Run — é a
   proposta congelada, agrupando control baseline, motivation, planned
   variants, mutation policy, evaluation plan, budget, resulting Run
   refs, future `PerformanceAnalysisResult` refs.
5. **Experimento ≠ Run.** Um experimento pode ter 1 controle + N
   variantes, portanto referenciar múltiplos Runs. O experimento é
   entidade owned pela Skill 20; os Runs continuam owned/coordenados
   pela Skill 01.
6. **Uma variante executável gera um novo Run canônico coordenado pela
   Skill 01** (resposta à pergunta 3) — não criamos pipeline de
   variação/A-B/Skill20 paralelo. Existe um único mecanismo
   operacional: Skill 01.
7. **Skill 20 não chama Skill 07/08/11 diretamente.** Correto:
   `Skill20 → VariationDirective/VariantExecutionIntent → Skill01 →
   pipeline normal`. Skill 01 continua autoridade sobre quais stages
   executar.
8. **`StageWorkUnitIdentity.creativeVariant` (Ponto S5) continua
   interno de execução** — mecanismo técnico de identidade de work
   unit do kernel, não `experimentVariantId`. A lineage canônica vive
   nos contratos da Skill 20 — nunca reconstruir experimento lendo
   `creativeVariant.valueIdentityHash` (antes: `LogicalJobIntent.variantKey`,
   string livre sem gramática, descontinuada pelo Ponto S5).
9. **Skill 20 não gera `CreativeDirectionResult`** — Skill 20 diz o
   que variar (`VariationDirective`), Skill 07 continua dona da
   `CreativeDirectionResult`. Nunca uma "nova direção criativa pronta"
   fingindo ser Skill 07.
9a. **PATCH (Ponto S6, `VIDEO_COMPOSITION_V1`)**: cada experiment
    variant é um candidato audiovisual **completo**, nunca um
    fragmento pra composição posterior. `Variant A + beat único`,
    `Variant B + beat único`, `Variant C + beat único` podem gerar 3
    vídeos candidatos completos — isso **não é multi-beat**, é 3
    variantes diferentes × 1 beat completo cada. Proibido formar um
    vídeo combinando variantes (`variant A clip + variant B clip →
    final video`) — variantes são alternativas, nunca segmentos.
10. **Baseline precisa ser exato e imutável** — não "último vídeo do
    produto", mas refs/hash pra `PerformanceAnalysisResult`,
    `SocialPublicationBinding`, `CreativeDirectionResult`,
    `FinalizedVideoRendition`, `promotedProductId`, offer/product
    factual basis conforme necessário.
11. **Dados novos não mudam o motivador de um experimento já criado**
    — se `PerformanceAnalysisResult R19-A` motivou `E1`, e amanhã
    nasce `R19-B`, `E1` continua motivado por `R19-A`; agir sobre
    `R19-B` exige novo experimento.
12. **Tipos de motivação**: `COMPARATIVE_EVIDENCE_GUIDED` |
    `DESCRIPTIVE_EVIDENCE_GUIDED` | `HEURISTIC_HYPOTHESIS_GUIDED` |
    `MANUAL_ANALYZED_BASELINE` — todas partem de um
    `PerformanceAnalysisResult` aprovado.
13. **`COMPARATIVE_EVIDENCE_GUIDED`** exige
    `ComparisonEligibility=COMPARATIVE_ELIGIBLE` + referência explícita
    ao finding/signal/score/cohort motivador. Significa "há associação
    comparativa suficiente para justificar testar", nunca "já sabemos
    que isso causa melhor resultado".
14. **`DESCRIPTIVE_EVIDENCE_GUIDED`** pode existir com
    `ComparisonEligibility=DESCRIPTIVE_ONLY` se a policy permitir, mas
    precisa ser marcada como exploração — nunca linguagem de
    "optimization proven".
15. **`HEURISTIC_HYPOTHESIS_GUIDED`** pode consumir
    `HeuristicAttributionHypothesis` da Skill 19, mas a hypothesis
    continua `canonicalAttributionLevelGranted=false` +
    `eligibleForEvidenceBackedScore=false` — Skill 20 não altera isso.
16. **Usar hipótese para testar não promove hipótese a evidência** —
    fluxo legítimo: hypothesis existe → Skill 20 pode propor
    experimento → resultado futuro vira novo `PerformanceAnalysisResult`
    → Skill 19 decide se materializa nova evidência canônica. Nunca:
    hypothesis vira contrato automático de variação.
17. **Piso de volume vem só de policy, não de código** (resposta à
    pergunta 5) — nunca `N≥5`/`N≥10` hardcoded no domínio; eligibility
    vem de `VariationGenerationPolicy` (`allowedSupportLevels`,
    `minSubjectCount`, `minObservationCoverage`, `minimumExposure`,
    `resultCompleteness`).
18. **Evidência comparativa recebe orçamento maior que heurística** —
    policy pode diferenciar `COMPARATIVE_EVIDENCE_GUIDED` (até N
    variantes/orçamento X) de `HEURISTIC_HYPOTHESIS_GUIDED` (limite
    menor) de `EXPLORATORY` (limite ainda menor); sem números fixos no
    contrato central.
19. **`LOW_SUPPORT` não gera gasto automaticamente por padrão** —
    default V1: `HEURISTIC_HYPOTHESIS_GUIDED + LOW_SUPPORT` = não
    elegível (policy explícita futura pode mudar). Evita pagar Veo por
    qualquer coincidência temporal fraca.
20. **Skill 20 pode variar dimensão nunca comparada pela Skill 19**
    (resposta à pergunta 2), desde que a dimensão já exista na
    taxonomia oficial da Skill 07 — vira `EXPLORATORY`, não
    `EVIDENCE_GUIDED`.
21. **Mas não pode inventar dimensão fora da taxonomia** — proibido
    criar `EMOTIONAL_INTENSITY_SCORE` se isso não existe na Skill 07;
    novo eixo/taxonomia exige extensão/versionamento da Skill 07
    primeiro, depois Skill 20 pode consumir.
22. **Valores também precisam pertencer à taxonomia aprovada** — pra
    `CreativeArchetypeV1`/`HookStrategyV1`/`NarrativeStructureV1`/
    `VisualApproachV1`, Skill 20 só escolhe valores válidos dessas
    taxonomias, nunca string criativa arbitrária fingindo ser enum.
23. **CTA segue a mesma regra** — `CreativeCtaIntent` é união
    discriminada; Skill 20 pode variar tipo/intenção CTA dentro do
    contrato permitido, realização textual continua downstream.
24. **V1 terá uma dimensão primária de mutação por variante** —
    principal proteção contra explosão combinatória. Cada variante
    declara `primaryMutationDimension` entre `CREATIVE_MODE` |
    `ARCHETYPE` | `HOOK_STRATEGY` | `NARRATIVE_STRUCTURE` |
    `VISUAL_APPROACH` | `CTA_INTENT`.
25. **Nada de produto cartesiano automático** — proibido `6 hooks × 8
    archetypes × 5 visuals × 4 narratives = 960 vídeos` por produto.
    Limite vem de `VariationGenerationPolicy.maxVariantsPerExperiment`.
26. **Variantes A/B/C são três braços do mesmo eixo primário** —
    compatível com o que Skills 08/11 já anteciparam sobre A/B/C.
27. **Dependências podem mudar junto sem virar "segunda dimensão
    experimental"** — mudar um hook pode exigir texto/timing/frame
    composition/video prompt; distingue `PRIMARY_MUTATION` de
    `DEPENDENT_ADAPTATION`.
28. **Dependências não provam isolamento causal** — mesmo declarando
    `primary=HOOK_STRATEGY`, as adaptações necessárias significam que
    o resultado testa um pacote criativo cuja principal alteração
    declarada é o hook; não podemos dizer que isolamos causalmente o
    hook.
29. **Multi-factor experiment fica fora da V1** — sem `HOOK × ARCHETYPE`
    factorial design nem tentativa de estimar interaction effects
    (exige desenho experimental muito mais sério).
30. **Skill 13 e Skill 20 têm objetivos completamente diferentes** —
    Skill 13 corrige `NON_COMPLIANT` preservando estratégia; Skill 20
    altera estratégia intencionalmente por razão de hipótese/análise.
31. **Correção não é nova variante** — se Variant B fica
    `NON_COMPLIANT` → Skill 13 `CorrectionDirective` → Skill 11
    novamente, continua Variant B, não cria Variant C.
32. **Uma nova variação começa em uma nova intenção da Skill 20** —
    retry técnico, correction attempt e provider retry não contam como
    nova variante experimental.
33. **Novo Run, mas não recomputação total obrigatória** (resposta à
    pergunta 3, parte 2): cada variante recebe Run novo, mas pode
    reutilizar upstream immutable artifacts compatíveis — não precisa
    redescobrir o produto ou refazer análise de oferta sem motivo.
34. **Skills 04/05 normalmente são reutilizadas** — variação criativa
    do mesmo produto/oferta pode congelar `ProductDiscoveryResult`/
    `OfferAnalysisResult`/`ProductVisualReferenceSet` exatos do
    baseline/policy. **PATCH (Ponto S2):** o reuso é sempre pelo
    `ProductVisualReferenceSetRef` exato (id+hash) do baseline, nunca
    "o set mais recente daquele produto" — duas variantes podem
    compartilhar o mesmo `ProductVisualReferenceSetRef` se usam as
    mesmas referências, mas se a variação exige seleção visual
    diferente, isso implica uma nova execução da Skill 09 e um novo
    `ProductVisualReferenceSetRef`, não mutação do anterior.
35. **Skill 06 depende da mutação** — se a variante permanece
    `EVERGREEN`, pode não precisar de nova evidência de trend; se muda
    pra `TREND_INFORMED` e não existe `TrendResult` compatível, Skill 01
    precisa satisfazer Skill 06 antes de Skill 07 (a Skill 01 resolve
    o execution plan segundo dependências).
36. **Reuso precisa ser explícito por hash** — nunca "reuse latest
    OfferAnalysisResult", sempre "reuse exact immutable upstream
    result/hash".
37. **Correção de premissa da auditoria**: a existência da Skill 20
    não força, por si só, criar agora a política `StageSubjectBinding`
    pra `VIDEO`/`PUBLICATION` (resposta à pergunta 4). Nos stages de
    criação (07-11...), o objeto anunciado continua sendo `PRODUCT`. A
    lineage experimental é outra dimensão:
    `ExperimentBaselineRef → original CreativeDirectionResult →
    original video/publication/performance` — isso **não** significa
    `StageSubjectBinding.subjectType=VIDEO`. Não abusar de
    `StageSubjectBinding` pra armazenar lineage experimental — ela é
    dona de lineage de estágio de pipeline, não de árvore de
    experimentos criativos (conceitos diferentes).
    `VIDEO`/`PUBLICATION` binding continuam sem política até um stage
    futuro realmente precisar deles como subject — não agora só pra
    acomodar experimento.
38. **`StageWorkUnitIdentity.creativeVariant.valueIdentityHash` (Ponto
    S5) carrega a projeção técnica do `variantId`** — reaproveita
    exatamente o `experimentVariantIdentityHash` já produzido pela
    Skill 20 (nenhum hash novo), mas o source of truth continua
    `ExperimentVariant` identity.
39. **Controle não é regenerado automaticamente** — na V1, o controle
    normalmente é uma publicação existente que motivou a análise; não
    gastamos vídeo pra recriar o controle só porque nasceu o
    experimento.
40. **Isso reduz força causal** — controle histórico publicado segunda
    vs. variante publicada sexta não é randomized A/B; a avaliação
    continua observacional.
41. **Futuro pode ter `FRESH_CONTROL_REPLICATION`** — se um dia
    quisermos publicar um controle novo junto com variantes, seria
    deliberado sob policy explícita, não por padrão.
42. **Evaluation plan precisa ser fixado antes de qualquer publicação
    da variante** — cada experimento congela um `ExperimentEvaluationPlan`
    antes de gastar com as variantes: analysis horizon, primary
    metric/score, comparison policy, minimum sample/coverage, eligible
    attribution level. Evita "essa métrica ficou ruim, então vamos
    avaliar por outra" depois de ver o resultado.
43. **Skill 20 define o plano; Skill 19 executa a análise** —
    ownership: Skill 20 → evaluation intent; Skill 19 →
    measurement/analysis result. Skill 20 não calcula percentis ou
    score futuro.
44. **Skill 20 nunca declara "winner"** (resposta direta à pergunta
    6): Skill 20 inicia e organiza; Skill 19 avalia performance.
    Skill 20 pode registrar que um experimento chegou a `EVALUATED`
    porque recebeu uma análise válida, mas nunca produz
    `WINNER`/`LOSER`/`SUCCESS`/`FAILED_PERFORMANCE`.
45. **Estados operacionais futuros conceituais**: `PLANNED`/
    `SUBMITTED`/`EXECUTING`/`MEASURING`/`AWAITING_ANALYSIS`/`EVALUATED`
    — não formaliza todos agora, mas o nome não pode implicar sucesso.
46. **Nova rodada de aprendizado exige NOVO experimento** — se Skill 19
    depois mostra resultado interessante e queremos iterar: `E1 →
    analysis R2 → E2`; não mutamos `E1` adicionando infinitamente
    novas variantes.
47. **Isso cria generations auditáveis** — `E1 (baseline A → B/C)`,
    `E2 (baseline B → D/E)` se B futuramente for escolhido como novo
    baseline por decisão humana/policy apropriada.
48. **Variante-de-variante dentro do mesmo experimento: não** — na V1,
    `control ├── B ├── C └── D`, nunca `control → B → C → D`. Mantém
    lineage/interpretação mais limpas.
49. **Limites de custo são parte da elegibilidade, não detalhe
    operacional** (resposta à pergunta 7) — `VariationBudgetPolicy`
    owned pela fronteira Skill20/Skill23, limitando pelo menos:
    `maxVariantsPerExperiment`, `maxConcurrentVariantsPerProduct`,
    `maxConcurrentExperimentsPerProduct`,
    `maxPlannedVariantsPerPrimaryDimension`,
    `maxEstimatedGenerationCostPerExperiment`,
    `maxEstimatedGenerationCostPerVariant`. Sem essa policy
    configurada, exploratório fica bloqueado
    (`VARIATION_BUDGET_POLICY_NOT_CONFIGURED` deve bloquear
    futuramente).
50. **Skill 20 não autoriza gasto** — Skill 20 planeja/estima/solicita;
    Skill 23 autoriza quota/crédito; Skill 11 efetua o gasto real no
    provider.
51. **Cada variante paga o gate normal da Skill 23** — mesmo com
    orçamento conceitual de R$100 no experimento, Variant B e Variant C
    passam por quota check individualmente; não existe "cheque em
    branco" por o experiment ter sido aprovado.
52. **Reserva de orçamento do experimento pode existir futuramente**
    (`ExperimentCostEnvelope` reservando capacidade), mas a
    autorização real continua no ponto de consumo.
53. **Concurrency também respeita a restrição MVP da Skill 01** (max 1
    active run/tenant) — se existem 3 variantes, ficam
    `PLANNED`/`QUEUED` e a Skill 01 as executa conforme capacidade.
    "Simultâneas" não significa obrigatoriamente paralelas em runtime
    — pertencem ao mesmo experimento pra análise, mas podem executar
    sequencialmente.
54. **Evitar experiment stacking** — default V1: não iniciar nova
    geração de experimento pro mesmo baseline enquanto a geração
    anterior ainda estiver sem avaliação, salvo override explícito de
    policy. Reduz gasto e confusão.
55. **Uma dimensão primária por experimento** (além de por variante) —
    `E1` testa `HOOK_STRATEGY`, nunca "B muda hook, C muda visual, D
    muda archetype" no mesmo experimento. Simplifica avaliação futura
    (Skill 19 sabe `E1 → cohort groups por HOOK_STRATEGY`, sem
    misturar perguntas experimentais) — não significa causal
    isolation (dependent adaptations continuam existindo).
56. **Produto/oferta continuam autoridade da Skill 04/05** — Skill 20
    não decide preço/comissão/product identity (inputs factuais). Se
    produto/oferta muda (ex.: mesmo vídeo, outro preço), é outro
    experimento/problem domain (Skill 05), não escondido como
    "creative variation".
57. **Factual claims continuam protegidos** — Skill 20 nunca instrui
    "aumente desconto"/"invente benefício"/"mude preço no roteiro" pra
    melhorar performance; Skills 07/08 e factual basis continuam
    soberanas.
58. **`VariationDirective` declara `preserveSet`** — distinção central
    do próximo contrato: `MUTATE` | `PRESERVE` | `DEPENDENT_ADAPT`.
59. **Preserve-by-default** — tudo que não foi declarado mutável
    permanece semanticamente preservado por default. Evita variação
    silenciosa de múltiplos eixos.
60. **Se Skill 07 não consegue satisfazer a mutation preservando as
    invariantes, não improvisa** — resultado futuro
    `VARIATION_CONSTRAINT_UNSATISFIABLE`, a variante não segue.
61. **LLM não escolhe sozinho quais atributos mutar sem contrato** —
    policy define motivation tier, allowed dimensions, allowed values,
    budget, counts. LLM pode propor realização criativa (ex.: qual
    pergunta/wording/composição para `HookStrategy=QUESTION`, já
    decidido estruturalmente) sempre sob os contratos de Skill 07/08.
62. **Skill 20 não usa score isolado sem contexto** — nunca "score 82
    → crie variação"; precisa referenciar `PerformanceAnalysisResult`,
    `PerformanceScore` hash, `AnalysisBasis`, horizon/cohort/policy de
    onde aquele 82 veio.
63. **Score alto também pode motivar variação** — Skill 20 não é só
    pra "consertar coisa ruim"; pode testar replicar característica
    associada a bom desempenho em outras variações, ainda como
    hipótese operacional.
64. **Score baixo não implica que um atributo específico é culpado** —
    `OrganicScore` baixo sem análise por hook não autoriza "troque o
    hook porque o hook falhou". A motivação precisa estar ligada à
    evidência específica disponível, ou ser marcada explicitamente
    exploratória.
65. **Bom sinal em outro produto/vídeo pode inspirar teste analogamente**
    — testar outro `HookStrategy` observado com associação melhor,
    ainda sem causal claim.
66. **`DESCRIPTIVE_ONLY` reduz a força da recomendação operacional** —
    pode gerar teste, nunca linguagem de "otimização baseada em
    vencedor".
67. **Heurística comercial exige proteção adicional** — se a
    motivation vem de `HeuristicAttributionHypothesis`, Skill 20 não
    pode dizer "este CTA gera vendas", só "testar CTA diferente
    motivado por hipótese H".
68. **Attribution factual continua Skill 15**; nada na Skill 20 cria
    ou modifica `AffiliateAttributionEvidence`.
69. **Performance factual continua Skill 19**; nada na Skill 20 cria
    `PerformanceScore`/`ComparisonEligibility` — só referencia.
70. **Experimento precisa ser auditável sem linguagem** — removendo
    toda explicação textual, ainda precisamos reconstruir o que
    motivou, o que mudou, o que permaneceu, quanto podia custar, quais
    Runs nasceram, qual análise avaliou depois, via refs/hashes
    estruturados.
71. **Experimento cancelado/bloqueado ainda preserva o plano original
    e o execution outcome factual** — Skill 20 não "substitui C
    silenciosamente".
72. **Variante bloqueada não é variante ruim** — estados operacionais
    `BLOCKED_BY_QUOTA`/`CANCELLED`/`GENERATION_FAILED` não são
    conclusões de performance.
73. **Skill 19 deve analisar apenas variantes realmente observáveis**
    — se não publicou, não entra em performance cohort; se publicou
    mas o horizon não completou, ainda não está pronta.
74. **Evaluation criteria precisam conhecer planned vs. actually
    published** — evita "experimento planejado com 3 variantes, só 1
    publicada → Skill 19 fingir que comparação A/B/C ocorreu".
75. **`ExperimentScore`/`OptimizationScore` não existem na V1** — o
    resultado analítico é `PerformanceAnalysisResult` da Skill 19.
76. **`ExploratoryPerformanceScore` continua adiado** — decisão da
    Skill 19 permanece; Skill 20 não reintroduz pela porta dos fundos.

### Ownership final (rodada 1)

```text
Skill07  → taxonomia e direção criativa final
Skill15/18 → identidade/atribuição/evidência continuam soberanas
Skill19  → performance factual continua soberana
Skill20  → variation directives, lineage experimental,
           budget/concurrency policy de variações
Skill01  → execução/orquestração dos Runs
Skill23  → autorização de quota/crédito
Skill18  → coleta dos resultados futuros
Skill19  → avaliação futura
```

### Respostas diretas às sete perguntas (ChatGPT)

1. **Experimento rastreável?** Sim: `CreativeVariationExperiment` como
   entidade própria, referenciando exatamente `PerformanceAnalysisResult`
   e, quando aplicável, `HeuristicAttributionHypothesis`. Cada
   variante possui lineage e diff próprios. O contrato declara
   explicitamente que o experimento V1 é observacional, não prova
   causal.
2. **Só dimensões já comparadas pela Skill 19?** Não. Pode variar
   qualquer dimensão já oficial da Skill 07. Se foi comparada e
   `COMPARATIVE_ELIGIBLE`, é evidence-guided. Se não foi comparada, é
   exploratory. Skill 20 não inventa dimensão/taxonomia nova.
3. **Novo Run ou reaproveitamento?** Cada variante executável recebe
   novo Run normal da Skill 01. Artefatos upstream imutáveis e
   compatíveis podem ser reutilizados, mas não é obrigatório
   redescobrir.
4. **Política de `StageSubjectBinding`?** Discordo da premissa — não
   força criar política pra `VIDEO`/`PUBLICATION` agora. Pra geração
   criativa, o subject factual continua `PRODUCT`. O vídeo/publicação
   original é `ExperimentBaselineRef`/parent lineage, não
   `StageSubjectBinding`. `VIDEO`/`PUBLICATION` só ganham política
   quando forem semanticamente subjects de um stage.
5. **Piso de volume/evidência?** Policy-driven, não N universal.
   `COMPARATIVE_ELIGIBLE` permite evidence-guided. Heurística exige
   thresholds próprios de volume/coverage/support e orçamento menor;
   `LOW_SUPPORT` fica bloqueado por default V1.
6. **Quem encerra/julga?** Skill 20 inicia e pode registrar estado
   operacional `EVALUATED` quando recebe uma análise posterior.
   Skill 19 julga/análise performance. Skill 20 nunca declara
   winner/loser.
7. **Como evitar explosão/custo?** Uma dimensão primária por
   experimento V1, uma dimensão primária por variante, sem produto
   cartesiano, limites de variantes/concurrency/custo, bloqueio de
   stacking e Skill 23 autorizando cada consumo caro.

### Cinco fechamentos conceituais (ChatGPT)

1. Um experimento da Skill 20 é um protocolo rastreável de variação e
   medição, não uma declaração de causalidade.
2. A Skill 20 declara a mudança; a Skill 07 materializa nova direção
   criativa; a Skill 01 executa; a Skill 19 avalia. Nenhuma quarta
   pipeline é criada.
3. Cada experimento V1 testa um único eixo criativo primário,
   preservando explicitamente o restante e registrando adaptações
   dependentes, sem gerar combinações cartesianas.
4. A evidência que motivou o experimento e o plano de avaliação são
   congelados antes da geração; dados posteriores geram avaliação ou
   um novo experimento, nunca reescrevem o experimento original.
5. Nenhuma variante cara é gerada apenas porque uma hipótese parece
   interessante: policy de elegibilidade, budget/concurrency e
   autorização da Skill 23 continuam obrigatórios.

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


Duas decisões adicionais antes dos tipos, porque afetam idempotência
diretamente: **(1)** na V1 a Skill 20 não usa LLM pra escolher a
dimensão nem o valor-alvo da variante — a seleção do eixo e dos
valores canônicos é determinística, baseada em Skill 19 + policy +
taxonomia oficial da Skill 07; IA continua livre pra realizar
criativamente essa decisão depois, nas Skills 07/08/09/10. **(2)** A/B/C
é rótulo de apresentação, não identidade — identidade da variante vem
dos hashes semânticos, nunca de `variantIndex`, "B" ou ordem retornada
por algum modelo.

### Dimensão e baseline

```typescript
type CreativeVariationDimension = 'CREATIVE_MODE' | 'ARCHETYPE'
  | 'HOOK_STRATEGY' | 'NARRATIVE_STRUCTURE' | 'VISUAL_APPROACH' | 'CTA_INTENT';
// exatamente os 6 eixos oficiais consumidos da Skill07 — não reutiliza
// o ComparisonDimension inteiro da Skill19 (que também tem dimensões
// que a Skill20 criativa não pode alterar) nem estende a taxonomia.

type ExperimentBaselineRef = {
  tenantId: string;
  baselineSubjectKey: string;
  promotedProductId: string;
  socialPublicationBinding: { id: string; hash: string; };
  creativeDirectionResult: { id: string; hash: string; };
  finalizedVideoRendition: { id: string; hash: string; };
  performanceAnalysisResult: { id: string; hash: string; };
  factualBasisRefs: Array<{
    artifactKind: 'PRODUCT_DISCOVERY_RESULT' | 'OFFER_ANALYSIS_RESULT' | 'PRODUCT_VISUAL_REFERENCE_SET';
    id: string; hash: string;
  }>;
  sourceOfferSnapshotId?: string;
  baselineHash: string;
};
// hash: EXPERIMENT_BASELINE_REF_V1
```

**Baseline não significa "latest"** — só IDs/hashes exatos, proibido
"latest CreativeDirectionResult"/"latest publication"/"latest
OfferAnalysisResult". Artefato novo surgindo depois não altera o
baseline. Factual basis é preservada — não substitui silenciosamente
um deles por versão mais recente.

### VariationMotivation (união discriminada)

```typescript
type VariationMotivationType = 'COMPARATIVE_EVIDENCE_GUIDED'
  | 'DESCRIPTIVE_EVIDENCE_GUIDED' | 'HEURISTIC_HYPOTHESIS_GUIDED'
  | 'EXPLORATORY_WITHIN_ANALYZED_BASELINE';

type VariationAnalysisResultRef = {
  performanceAnalysisResultId: string; performanceAnalysisResultHash: string;
  analysisBasisHash: string;
  analysisHorizonHash: string;
  policySnapshotHash: string;
  analysisMethodSetVersion: string;
};
// impede consumir "score 82" sem saber de qual contexto saiu.

type ComparativeVariationMotivation = {
  motivationType: 'COMPARATIVE_EVIDENCE_GUIDED';
  analysis: VariationAnalysisResultRef;
  primaryDimension: CreativeVariationDimension;
  comparisonEligibilityId: string; comparisonEligibilityHash: string;
  eligibilityStatus: 'COMPARATIVE_ELIGIBLE';
  supportingSignalRefs: Array<{ id: string; hash: string; }>;
  supportingScoreRefs: Array<{ id: string; hash: string; }>;
  motivationHash: string;
}; // Skill20 valida literalmente COMPARATIVE_ELIGIBLE — não basta o
   // result ter um ranking em algum lugar.

type DescriptiveVariationMotivation = {
  motivationType: 'DESCRIPTIVE_EVIDENCE_GUIDED';
  analysis: VariationAnalysisResultRef;
  primaryDimension: CreativeVariationDimension;
  comparisonEligibilityId: string; comparisonEligibilityHash: string;
  eligibilityStatus: 'DESCRIPTIVE_ONLY' | 'COMPARATIVE_ELIGIBLE';
  supportingDerivedMetricRefs: Array<{ id: string; hash: string; }>;
  motivationHash: string;
}; // continua sendo "vale testar", nunca "atributo vencedor".

type HeuristicVariationMotivation = {
  motivationType: 'HEURISTIC_HYPOTHESIS_GUIDED';
  analysis: VariationAnalysisResultRef;
  primaryDimension: CreativeVariationDimension;
  heuristicAttributionHypothesisId: string;
  heuristicAttributionHypothesisHash: string;
  supportLevel: 'LOW_SUPPORT' | 'MODERATE_SUPPORT' | 'HIGH_SUPPORT';
  canonicalAttributionLevelGranted: false;
  motivationHash: string;
}; // o literal false permanece — Skill20 não ganha permissão para reinterpretá-lo.

type ExploratoryVariationMotivation = {
  motivationType: 'EXPLORATORY_WITHIN_ANALYZED_BASELINE';
  analysis: VariationAnalysisResultRef;
  primaryDimension: CreativeVariationDimension;
  explorationReasonCode: 'DIMENSION_NOT_PREVIOUSLY_COMPARED'
    | 'INSUFFICIENT_EVIDENCE_FOR_DIRECTIONAL_CLAIM' | 'COVERAGE_EXPANSION';
  motivationHash: string;
}; // mesmo exploratória exige análise-base aprovada — nunca geração
   // aleatória desconectada do histórico.

type VariationMotivation = ComparativeVariationMotivation
  | DescriptiveVariationMotivation | HeuristicVariationMotivation
  | ExploratoryVariationMotivation;
// hash: VARIATION_MOTIVATION_V1 — inclui tipo, analysis refs/hashes,
// primaryDimension, evidence refs específicos, eligibility/support
// quando aplicável, reasonCode quando exploratória.
```

### Mutação e preservação

```typescript
type PrimaryDimensionMutation =
  | { dimension: 'CREATIVE_MODE'; fromValue: CreativeMode; toValue: CreativeMode; }
  | { dimension: 'ARCHETYPE'; fromValue: CreativeArchetypeV1; toValue: CreativeArchetypeV1; }
  | { dimension: 'HOOK_STRATEGY'; fromValue: HookStrategyV1; toValue: HookStrategyV1; }
  | { dimension: 'NARRATIVE_STRUCTURE'; fromValue: NarrativeStructureV1; toValue: NarrativeStructureV1; }
  | { dimension: 'VISUAL_APPROACH'; fromValue: VisualApproachV1; toValue: VisualApproachV1; }
  | { dimension: 'CTA_INTENT'; fromValue: CreativeCtaIntent; toValue: CreativeCtaIntent; };
```

`fromValue ≠ toValue` obrigatório — valores canônicos iguais →
`VARIATION_NO_OP_MUTATION`, a variante não existe.

```typescript
type VariationMutationSet = {
  primaryDimension: CreativeVariationDimension;
  mutations: PrimaryDimensionMutation[]; // V1: mutations.length === 1
};
```

Apesar do nome "Set", V1 possui exatamente uma mutação primária.
Invariantes: `mutations.length=1`, `mutations[0].dimension=
primaryDimension`, e `primaryDimension` da variante =
`primaryComparisonDimension` do experimento. Hash:
`VARIATION_MUTATION_SET_V1` (inclui representação canônica integral de
`fromValue`/`toValue`).

```typescript
type VariationPreserveSet = {
  baselineCreativeDirectionResultId: string;
  baselineCreativeDirectionResultHash: string;
  preservedCreativeDimensions: CreativeVariationDimension[];
  preservedFactualBasisRefs: Array<{
    artifactKind: 'PRODUCT_DISCOVERY_RESULT' | 'OFFER_ANALYSIS_RESULT' | 'PRODUCT_VISUAL_REFERENCE_SET';
    id: string; hash: string;
  }>;
  preserveProductIdentity: true;
  preserveOfferIdentity: true;
  preserveFactualClaims: true;
  preserveSetHash: string;
};
// hash: VARIATION_PRESERVE_SET_V1 — arrays ordenados canonicamente.
// Lista de dimensões preservadas é determinística, nunca implícita/silenciosa.
```

### Adaptação dependente

```typescript
type DependentAdaptationDomain = 'SCRIPT_REALIZATION' | 'FRAME_COMPOSITION'
  | 'VIDEO_PROMPT' | 'VIDEO_GENERATION' | 'FINALIZATION'
  | 'TRACKING_LINEAGE' | 'PUBLICATION_LINEAGE' | 'TREND_CONTEXT';

type DependentAdaptation = {
  adaptationDomain: DependentAdaptationDomain;
  reason: 'PRIMARY_MUTATION_REALIZATION' | 'NEW_ARTIFACT_LINEAGE_REQUIRED' | 'UPSTREAM_CONTEXT_REQUIRED';
  secondaryCreativeDimensionMutationAllowed: false; // literal
};

type DependentAdaptationSet = {
  adaptations: DependentAdaptation[];
  adaptationSetHash: string;
};
// hash: DEPENDENT_ADAPTATION_SET_V1
```

Mudar hook pode envolver `SCRIPT_REALIZATION`/`FRAME_COMPOSITION`/
`VIDEO_PROMPT`/`VIDEO_GENERATION`/`FINALIZATION`/`TRACKING_LINEAGE`/
`PUBLICATION_LINEAGE` — mas isso não autoriza `ARCHETYPE`/
`VISUAL_APPROACH` mudarem junto. Se `CREATIVE_MODE` muda
`EVERGREEN→TREND_INFORMED`, pode existir adaptação `TREND_CONTEXT`
(`reason=UPSTREAM_CONTEXT_REQUIRED`) — Skill 01 decide como satisfazer
isso; Skill 20 não manda diretamente "rode Skill06".

### VariationDirective

```typescript
type VariationDirective = {
  variationDirectiveId: string;
  tenantId: string;
  experimentBaselineHash: string;
  motivationHash: string;
  mutationSet: VariationMutationSet;
  preserveSet: VariationPreserveSet;
  dependentAdaptations: DependentAdaptationSet;
  baselineCreativeDirectionResultId: string;
  baselineCreativeDirectionResultHash: string;
  promotedProductId: string;
  directiveVersion: 'V1';
  directiveHash: string;
  createdAt: string;
};
// hash: VARIATION_DIRECTIVE_V1
```

**O directive não é `CreativeDirectionResult`** — isso precisa ficar
explícito sempre. Quando o runtime existir, a nova direção terá que
demonstrar target mutation satisfeita + preserve set respeitado +
factual basis preservada, mas esse enforcement operacional fica no
bloco final/integração.

### ExperimentEvaluationPlan

```typescript
type ExperimentEvaluationPrimaryOutcome =
  | { outcomeType: 'PERFORMANCE_SCORE'; scoreKey: string; }
  | { outcomeType: 'PERFORMANCE_SIGNAL'; signalKey: string; }
  | { outcomeType: 'DERIVED_METRIC'; derivedMetricKey: string; };

type ExperimentEvaluationPlan = {
  experimentEvaluationPlanId: string;
  tenantId: string;
  analysisKind: 'CREATIVE_ATTRIBUTE_ANALYSIS';
  comparisonDimension: CreativeVariationDimension;
  baselineMode: 'HISTORICAL_BASELINE';
  analysisHorizon: AnalysisHorizon; analysisHorizonHash: string;
  primaryOutcome: ExperimentEvaluationPrimaryOutcome;
  secondaryOutcomeKeys?: string[];
  minimumComparisonEligibility: ComparisonEligibilityStatus;
  commerceEvidenceRequirement: 'NONE' | 'OWN_CLICK_CONFIRMED_ONLY' | 'DIRECT_PROVIDER_CONFIRMED';
  performanceAnalysisPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; };
  analysisMethodSetVersion: string;
  causalClaimAllowed: false; // literal, não configurável
  evaluationPlanHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_EVALUATION_PLAN_V1
```

`comparisonDimension` precisa ser exatamente
`Experiment.primaryComparisonDimension` — não pode planejar
experimento de HOOK e avaliar por ARCHETYPE "porque foi mais
conveniente". `primaryOutcome` é imutável depois da primeira publicação
variante — outro critério exige novo experimento ou análise secundária
claramente separada.

### VariationGenerationPolicy e VariationBudgetPolicy

```typescript
type VariationGenerationPolicy = {
  policyId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  allowedMotivationTypes: VariationMotivationType[];
  allowedPrimaryDimensions: CreativeVariationDimension[];
  evidenceEligibility: {
    comparative: { requireComparativeEligible: true; };
    descriptive: {
      allowDescriptiveOnly: boolean;
      minimumSubjectCount?: number;
      minimumObservationCoverageRatio?: string;
    };
    heuristic: {
      allowedSupportLevels: Array<'MODERATE_SUPPORT' | 'HIGH_SUPPORT'>;
      lowSupportAllowed: false; // literal — não configurável nesta versão
      minimumSubjectCount?: number;
      minimumObservationCoverageRatio?: string;
    };
    exploratory: { allowUncomparedOfficialDimension: boolean; };
  };
  experimentDesign: {
    singlePrimaryDimensionPerExperiment: true;
    singlePrimaryMutationPerVariant: true;
    factorialDesignAllowed: false;
    preserveByDefault: true;
    freshControlReplicationAllowed: false;
  };
  determinism: {
    deterministicTargetSelection: true;
    llmMayChoosePrimaryDimension: false;
    llmMayChooseCanonicalTargetValue: false;
  };
  budgetPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; };
  policyHash: string;
  createdAt: string;
};
// hash: VARIATION_GENERATION_POLICY_V1
```

Todos os literais `false` são intencionais e fechados na V1 (mudar
exige nova versão contratual/policy semantics, não config de tenant):
`lowSupportAllowed`, `factorialDesignAllowed`,
`freshControlReplicationAllowed`, `llmMayChoosePrimaryDimension`,
`llmMayChooseCanonicalTargetValue`. Isso simplifica brutalmente replay
e auditoria — a IA continua relevante depois de `target=HOOK_STRATEGY.QUESTION`
já decidido: Skill 07/08 geram a realização criativa, mas o experimento
continua testando o target estrutural predefinido.

```typescript
type VariationGenerationPolicyBinding = { /* mutável, sem hash integral */ };
type VariationGenerationPolicyBindingResolution = {
  tenantId: string; policyKey: string;
  policyId: string; policyVersion: string; policySnapshotHash: string;
  resolvedAt: string; bindingResolutionHash: string;
};
// hash: VARIATION_GENERATION_POLICY_BINDING_RESOLUTION_V1

type CanonicalMoney = { canonicalAmount: string; currency: string; };

type VariationBudgetPolicy = {
  policyId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  maxVariantsPerExperiment: number;
  maxConcurrentVariantsPerProduct: number;
  maxConcurrentExperimentsPerProduct: number;
  maxPlannedVariantsPerPrimaryDimension: number;
  maxEstimatedGenerationCostPerVariant: CanonicalMoney;
  maxEstimatedGenerationCostPerExperiment: CanonicalMoney;
  experimentStacking: 'BLOCK_UNTIL_EVALUATED' | 'ALLOW_EXPLICIT_OVERRIDE';
  unlimitedBudgetAllowed: false; // literal
  requiresPerVariantQuotaAuthorization: true; // literal
  budgetPolicyHash: string;
  createdAt: string;
};
// hash: VARIATION_BUDGET_POLICY_V1 — nenhum número default no domínio
// (valores vêm da policy real). O budget do experimento só responde
// "este plano cabe nos limites?", nunca "pode gastar automaticamente".
```

```typescript
type VariationCostEstimate = {
  variationCostEstimateId: string;
  tenantId: string;
  estimateFor: 'EXPERIMENT_VARIANT';
  estimatorVersion: string;
  estimatedGenerationCost: CanonicalMoney;
  costBasisRefs: Array<{ id: string; hash: string; }>;
  estimateHash: string;
  createdAt: string;
};
// hash: VARIATION_COST_ESTIMATE_V1
```

### Identidade de variante e experimento

```typescript
type ExperimentVariantIdentity = {
  experimentVariantIdentityId: string;
  tenantId: string;
  experimentIdentityHash: string;
  mutationSetHash: string; preserveSetHash: string; dependentAdaptationSetHash: string;
  variationDirectiveHash: string;
  identityHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_VARIANT_IDENTITY_V1
```

Se duas variantes têm mesmo mutation set + mesmo preserve set + mesmo
directive, são semanticamente a mesma variante — nunca cria "B" e "C"
idênticas só pra aumentar N. Realizações criativas diferentes do mesmo
target (dois roteiros ambos `HOOK=QUESTION`) seriam futuramente
"creative realization replication" — não deve entrar sorrateiramente
como B/C nesta versão (evita confundir variação do eixo com variação
estocástica de realização).

```typescript
type ExperimentVariant = {
  experimentVariantId: string;
  tenantId: string;
  creativeVariationExperimentId: string;
  experimentVariantIdentityId: string; experimentVariantIdentityHash: string;
  variationDirectiveId: string; variationDirectiveHash: string;
  mutationSetHash: string; preserveSetHash: string; dependentAdaptationSetHash: string;
  costEstimate: { variationCostEstimateId: string; variationCostEstimateHash: string; };
  variantArtifactHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_VARIANT_V1
```

**Não existe "winner" no variant** — explicitamente ausentes:
`winner`/`loser`/`successful`/`failedPerformance`/`uplift`. Esses
conceitos não pertencem ao artefato da Skill 20. Labels A/B/C/Control
podem existir como projeção/UI, mas são derivados — nunca entram em
`identityHash`/`variantArtifactHash`.

```typescript
type CreativeVariationExperimentIdentity = {
  creativeVariationExperimentIdentityId: string;
  tenantId: string;
  experimentRequestKey: string;
  baselineHash: string;
  primaryComparisonDimension: CreativeVariationDimension;
  motivation: VariationMotivation;
  evaluationPlan: ExperimentEvaluationPlan;
  generationPolicySnapshotHash: string;
  budgetPolicySnapshotHash: string;
  planningMethodVersion: string;
  identityHash: string;
  createdAt: string;
};
// hash: CREATIVE_VARIATION_EXPERIMENT_IDENTITY_V1
```

`experimentRequestKey` entra na identidade porque podemos ter `E1`
hoje e `E2` daqui a um mês com baseline/mutação parecidos — são
rodadas experimentais distintas, o request key diferencia essa
intenção de negócio.

**Idempotência do request**: UNIQUE lógico `(tenantId,
experimentRequestKey)`. Mesma key + mesmo contexto → mesma experiment
identity. Mesma key + contexto diferente →
`CREATIVE_VARIATION_EXPERIMENT_REQUEST_REPLAY_CONFLICT`.

```typescript
type CreativeVariationExperiment = {
  creativeVariationExperimentId: string;
  tenantId: string;
  experimentIdentityId: string; experimentIdentityHash: string;
  experimentRequestKey: string;
  baselineHash: string;
  primaryComparisonDimension: CreativeVariationDimension;
  motivation: VariationMotivation;
  evaluationPlan: ExperimentEvaluationPlan;
  generationPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; bindingResolutionHash: string; };
  budgetPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; };
  variants: Array<{ experimentVariantId: string; experimentVariantHash: string; experimentVariantIdentityHash: string; }>;
  estimatedExperimentCost: CanonicalMoney;
  experimentPlanHash: string;
  createdAt: string;
};
// hash: CREATIVE_VARIATION_EXPERIMENT_V1 — é o plano congelado, não o
// estado operacional mutável.
```

**Ordem de variants no hash**: canonicalizar por
`experimentVariantIdentityHash ASC`, nunca pela ordem de geração —
execução concorrente não altera o experiment hash.

**Invariante central**: `experiment.primaryComparisonDimension =
motivation.primaryDimension = evaluationPlan.comparisonDimension =
variant.mutationSet.primaryDimension` para todos os variants —
qualquer divergência é integridade fatal.

**Restrições de tamanho**: `variants.length ≥ 1`,
`variants.length ≤ budgetPolicy.maxVariantsPerExperiment`,
`variants.length ≤ maxPlannedVariantsPerPrimaryDimension`.
**Custo do experimento** = soma decimal determinística de
`estimatedGenerationCost` dos variants planejados, mesma currency
obrigatória — currencies divergentes →
`VARIATION_COST_CURRENCY_MISMATCH` (não converte moeda silenciosamente).
**Budget gate de planejamento**: experimento só materializa se cada
variant estimate ≤ `maxEstimatedGenerationCostPerVariant` E total
estimate ≤ `maxEstimatedGenerationCostPerExperiment` — isso ainda não
significa autorização de execução.

### VariantExecutionIntent (ponte com Skill 01)

```typescript
type VariantExecutionIntent = {
  variantExecutionIntentId: string;
  tenantId: string;
  creativeVariationExperimentId: string;
  experimentVariantId: string; experimentVariantIdentityHash: string;
  promotedProductId: string;
  variationDirectiveId: string; variationDirectiveHash: string;
  baselineHash: string;
  reusableUpstreamArtifactRefs: Array<{
    artifactKind: 'PRODUCT_DISCOVERY_RESULT' | 'OFFER_ANALYSIS_RESULT' | 'PRODUCT_VISUAL_REFERENCE_SET';
    id: string; hash: string;
  }>;
  requestedExecutionAuthority: 'SKILL01';
  spendAuthorizationAuthority: 'SKILL23';
  executionIntentHash: string;
  createdAt: string;
};
// hash: VARIANT_EXECUTION_INTENT_V1
```

**Execution intent não é autorização** — dois literais conceituais:
`requestedExecutionAuthority=SKILL01`, `spendAuthorizationAuthority=
SKILL23`; Skill 20 não pula nenhuma. **Skill 01 decide execution plan**
— `VariantExecutionIntent` não contém `startAtStage=7`/`skipSkill06=true`/
`callSkill11=true`; informa variant/directive/baseline/reusable
immutable refs, Skill 01 resolve o DAG/pipeline. **Reuso nunca é
obrigatório** — mesmo se refs existem, quando Skill 01 identifica
incompatibilidade, pode reprocessar; reuso não força execução
incorreta. `StageWorkUnitIdentity.creativeVariant.valueIdentityHash`
(Ponto S5) é projeção determinística de `experimentVariantIdentityHash`
(detalhe operacional) — a verdade continua sendo o hash.

**Idempotência do execution intent**: UNIQUE lógico `(tenantId,
experimentVariantIdentityHash)`. Retry → mesmo `VariantExecutionIntent`,
não cria novo Run de negócio (Skill01/Skill02 cuidam de retry técnico
dentro da execução). Nova tentativa criativa intencional não é retry —
outro target → nova `ExperimentVariant`; nova rodada após avaliação →
novo `CreativeVariationExperiment`; nunca reutiliza execution intent
antigo.

**`planningMethodVersion` entra na experiment identity** porque mesma
análise + mesma policy + algoritmo diferente pra selecionar target
values pode legitimamente produzir plano diferente — não sobrescreve
`E1`.

### Seleção determinística de target

Target selection é determinística, não substitui a IA — só define
regras versionadas de seleção; não faz sentido pedir "IA, invente três
ideias" pra definir os braços do experimento. Quando há evidência
comparativa, a policy/método pode selecionar valores canônicos
associados aos resultados comparativos disponíveis — ainda significa
"target experimentalmente interessante", nunca "winner causal". Quando
exploratória (sem comparação prévia), o planning method seleciona
deterministicamente valores oficiais ainda não testados segundo
policy — a ordem vem de regra versionada, nunca `Math.random()`.
**Baseline target não pode reaparecer** — se baseline `HOOK=QUESTION`,
não cria variant `QUESTION→QUESTION`. **Nunca usa performance de outro
tenant** — todas as evidências usadas pra escolher targets pertencem
ao mesmo `tenantId` (cross-tenant benchmark fica pra decisão futura).
Mudança futura de policy não altera experimento existente — se antes
da materialização final do plano a policy mudou, resolve novamente e
gera nova experiment identity se o snapshot mudou; depois do
experiment plan congelado, permanece como estava (execução real ainda
passa pela quota atual da Skill 23). **Budget antigo não obriga gasto
futuro** — experimento planejado dentro do orçamento ontem pode ter a
execução bloqueada hoje pela Skill 23 (`quota exhausted`/`provider
cost changed`/`tenant limit changed`); o plano continua historicamente
válido, só a execução fica bloqueada.

### Hashes canônicos deste bloco (16)

```text
EXPERIMENT_BASELINE_REF_V1
VARIATION_MOTIVATION_V1
VARIATION_MUTATION_SET_V1
VARIATION_PRESERVE_SET_V1
DEPENDENT_ADAPTATION_SET_V1
VARIATION_DIRECTIVE_V1
EXPERIMENT_EVALUATION_PLAN_V1
VARIATION_GENERATION_POLICY_V1
VARIATION_GENERATION_POLICY_BINDING_RESOLUTION_V1
VARIATION_BUDGET_POLICY_V1
VARIATION_COST_ESTIMATE_V1
CREATIVE_VARIATION_EXPERIMENT_IDENTITY_V1
EXPERIMENT_VARIANT_IDENTITY_V1
EXPERIMENT_VARIANT_V1
CREATIVE_VARIATION_EXPERIMENT_V1
VARIANT_EXECUTION_INTENT_V1
```

`VariationGenerationPolicyBinding` é mutável e não recebe hash
integral.

### Cadeias

```text
Identidade:
ExperimentBaselineRef + VariationMotivation + ExperimentEvaluationPlan
  + GenerationPolicy snapshot + BudgetPolicy snapshot + experimentRequestKey
  → CreativeVariationExperimentIdentity
  → mutation + preserve + adaptation + directive
  → ExperimentVariantIdentity → ExperimentVariant
  → CreativeVariationExperiment → VariantExecutionIntent → Skill01

Evidence-guided:
PerformanceAnalysisResult → ComparisonEligibility=COMPARATIVE_ELIGIBLE
  → VariationMotivation=COMPARATIVE_EVIDENCE_GUIDED
  → deterministic target selection → ExperimentVariant
  (sem seta para CAUSALITY_PROVEN)

Heurística:
PerformanceAnalysisResult → HeuristicAttributionHypothesis
  (canonicalAttributionLevelGranted=false) → ... (continua sem elevar nível)
```

### Cinco invariantes para fechar este bloco (ChatGPT)

1. A identidade de uma variante deriva da mudança semântica planejada
   e de suas restrições, nunca de rótulos A/B/C, ordem de geração ou
   JobAttempt.
2. O experimento congela antes da execução baseline, motivação,
   dimensão primária, plano de avaliação e policies. Nenhum resultado
   posterior reescreve esse plano.
3. Tudo que não pertence ao único eixo primário de mutação é
   preservado por default; adaptações necessárias à realização da
   mudança são declaradas separadamente e não constituem segundo eixo
   experimental.
4. `VariantExecutionIntent` apenas solicita uma execução normal à
   Skill 01. Ele não cria pipeline paralelo, não decide stages e não
   concede autorização financeira.
5. Orçamento de experimento limita planejamento; autorização de gasto
   continua acontecendo por variante na Skill 23 no momento adequado
   do pipeline.

## Fechamento (rodada 3 — debate com ChatGPT, 2026-09-18)

Dois patches compatíveis antes da state machine, porque fecham uma
lacuna operacional real (não reabrem decisões):

### Patch 1 — escopo de publicação no `ExperimentEvaluationPlan`

O experimento precisa congelar em qual conta/superfície a comparação
acontece — senão poderíamos comparar o controle no Instagram Reels com
variante publicada em outro target ou outra conta.

```typescript
type ExperimentEvaluationPublicationScope = {
  providerKey: string;
  providerAccountId: string;
  publicationTargetKey: string;
  requireExactScopeMatch: true;
};
// ExperimentEvaluationPlan ganha: evaluationPublicationScope
```

### Patch 2 — escopo no `VariantExecutionIntent`

```typescript
// VariantExecutionIntent ganha:
evaluationPublicationScope: ExperimentEvaluationPublicationScope;
// requestedExecutionAuthority: 'SKILL01' e spendAuthorizationAuthority:
// 'SKILL23' permanecem. VARIANT_EXECUTION_INTENT_V1 passa a incluir o scope.
```

Skill 01 continua decidindo o pipeline, mas a execução experimental
precisa terminar na superfície pré-declarada.

**Plano imutável e estado operacional separados**: `CreativeVariationExperiment`
é o plano imutável — nenhum status operacional entra nele. Execution,
bloqueios, cancelamento e avaliação ficam em entidades mutáveis
separadas.

### Planning state machine

```typescript
type CreativeVariationPlanningRunState = 'PREPARED' | 'RESOLVING_INPUTS'
  | 'VALIDATING_ELIGIBILITY' | 'SELECTING_VARIANTS' | 'ESTIMATING_COST'
  | 'CHECKING_GUARDS' | 'MATERIALIZING_PLAN' | 'PLAN_FROZEN'
  | 'COMPLETED' | 'CANCELLED';
// fluxo: PREPARED → RESOLVING_INPUTS → VALIDATING_ELIGIBILITY →
// SELECTING_VARIANTS → ESTIMATING_COST → CHECKING_GUARDS →
// MATERIALIZING_PLAN → PLAN_FROZEN → COMPLETED

type CreativeVariationPlanningRun = {
  creativeVariationPlanningRunId: string;
  tenantId: string; runId: string; jobId: string; attemptNumber: number;
  experimentRequestKey: string;
  baselineHash: string;
  motivationHash: string;
  evaluationPlanHash: string;
  planningMethodVersion: string;
  planningRunContextHash: string;
  state: CreativeVariationPlanningRunState;
  experimentIdentityId?: string; experimentIdentityHash?: string;
  experimentPlanCommitId?: string; experimentPlanCommitHash?: string;
  createdAt: string; updatedAt: string;
}; // mutável, sem hash integral
// hash imutável CREATIVE_VARIATION_PLANNING_RUN_CONTEXT_V1 sobre
// experimentRequestKey + baselineHash + motivationHash +
// generationPolicySnapshotHash + budgetPolicySnapshotHash +
// evaluationPlanHash + planningMethodVersion.
```

**Unicidade**: UNIQUE lógico `(tenantId, experimentRequestKey)`. Retry
técnico → mesmo PlanningRun; nova Attempt ≠ novo experimento.

**Materialização não pode ficar parcialmente visível** — a Skill 20
pode persistir componentes durante `MATERIALIZING_PLAN`, mas
consumidores não podem usar `VariationDirective`/`ExperimentVariant`/
`CreativeVariationExperiment` antes do commit.

```typescript
type ExperimentPlanCommit = {
  experimentPlanCommitId: string;
  creativeVariationExperimentId: string;
  variantHashes: Array<{ id: string; hash: string; }>;
  directiveHashes: string[];
  costEstimateHashes: string[];
  componentRootHash: string;
  commitHash: string;
  committedAt: string;
};
// hash: EXPERIMENT_PLAN_COMMIT_V1 — arrays ordenados canonicamente.
```

**`ExperimentPlanCommit` é visibility gate** — plano utilizável só se
`CreativeVariationExperiment` existe + `ExperimentPlanCommit`
correspondente existe + hashes conferem. Crash antes do commit:
componentes podem estar staged, mas o plano NÃO é consumível. Replay:
reutiliza componentes compatíveis, cria faltantes, valida tudo, commit
exatamente uma vez. Se já existe `ExperimentVariantIdentity X` mas o
conteúdo materializado não bate com seu hash → `FATAL_ERROR` (nunca
substituir).

### Lifecycle do experimento e da variante

```typescript
type CreativeVariationExperimentLifecycleState = 'PLANNED' | 'ACTIVATING'
  | 'EXECUTING' | 'MEASURING' | 'AWAITING_ANALYSIS' | 'EVALUATED'
  | 'CLOSED_UNEVALUABLE' | 'CANCELLED' | 'BLOCKED_BY_QUOTA';
// NO_MATERIAL_FOR_EVALUATION nunca significa que o criativo foi ruim
// — significa que o experimento planejado não produziu material
// suficiente para satisfazer seu plano de avaliação.

type CreativeVariationExperimentLifecycle = {
  experimentLifecycleId: string;
  tenantId: string;
  creativeVariationExperimentId: string; creativeVariationExperimentHash: string;
  state: CreativeVariationExperimentLifecycleState;
  version: number;
  concurrencyReservationId?: string;
  latestEvaluationRequestId?: string; latestEvaluationRequestHash?: string;
  latestEvaluationBindingId?: string; latestEvaluationBindingHash?: string;
  cancellationCommandId?: string; cancellationCommandHash?: string;
  createdAt: string; updatedAt: string;
}; // mutável, sem hash integral. Todas as transições usam optimistic version/CAS.

type ExperimentVariantLifecycleState = 'PLANNED' | 'EXECUTION_INTENT_MATERIALIZED'
  | 'SUBMITTED_TO_ORCHESTRATOR' | 'RUN_BOUND' | 'RUN_EXECUTING'
  | 'GENERATION_FAILED' | 'PUBLICATION_FAILED' | 'PUBLICATION_CONFIRMED'
  | 'BLOCKED_OPERATIONAL' | 'CANCELLED';
```

Bloqueios possíveis (quota impossível de satisfazer, cancelamento,
generation exhausted, publication failure terminal) — o motivo
original continua owned pelas Skills correspondentes; Skill 20 não
reclassifica tudo como "falhou".

```typescript
type VariantOperationalBlockReason = 'CONCURRENCY_LIMIT' | 'STACKING_GUARD'
  | 'QUOTA_NOT_AUTHORIZED';

type ExperimentVariantLifecycle = {
  experimentVariantLifecycleId: string;
  tenantId: string;
  experimentVariantId: string; experimentVariantHash: string;
  state: ExperimentVariantLifecycleState;
  version: number;
  variantExecutionIntentId?: string; variantExecutionIntentHash?: string;
  variantOrchestrationBindingId?: string; variantOrchestrationBindingHash?: string;
  variantPublicationBindingId?: string; variantPublicationBindingHash?: string;
  operationalBlockReason?: VariantOperationalBlockReason;
  createdAt: string; updatedAt: string;
};
```

Bloqueio não precisa virar state próprio.

### Integração com Skill23 e Skill01

```typescript
type Skill23QuotaAuthorizationRef = {
  authority: 'SKILL23';
  authorizationId: string; authorizationHash: string;
  decision: 'AUTHORIZED' | 'DENIED' | 'EXPIRED';
};
```

A Skill 20 não define a semântica interna do hash — só armazena
referência opaca canonicamente owned pela futura Skill 23 (quando ela
existir, reutilizamos/ajustamos). **Negação de quota não gera nova
variante** — se Skill 23 negar Variant B, Skill 20 não faz "Variant
B2/novo Run/novo provider" pra escapar do limite; retry/reautorização
segue Skill02/23.

```typescript
type VariationRunLineageRef = {
  tenantId: string;
  creativeVariationExperimentId: string; creativeVariationExperimentHash: string;
  experimentVariantId: string; experimentVariantHash: string;
  experimentVariantIdentityHash: string;
  variationDirectiveId: string; variationDirectiveHash: string;
  publicationTargetKey: string;
  requestedAt: string;
  lineageHash: string;
};
// hash: VARIATION_RUN_LINEAGE_REF_V1
```

**Experimental lineage ≠ stage subject** — não cria policy de
`VIDEO`/`PUBLICATION` aqui. `StageSubjectBinding` não guarda isso.
`StageWorkUnitIdentity.creativeVariant.valueIdentityHash` (Ponto S5) é
`experimentVariantIdentityHash` reaproveitado diretamente pela Skill 01
(nenhum `compact()`/derivação nova), mas continua apenas desambiguador
técnico do Job/work unit, nunca source of truth.

```typescript
type VariantOrchestrationBinding = {
  variantOrchestrationBindingId: string;
  tenantId: string;
  experimentVariantId: string; experimentVariantHash: string;
  experimentVariantIdentityHash: string;
  variantExecutionIntentId: string; variantExecutionIntentHash: string;
  orchestratorRunId: string;
  variationRunLineageHash: string;
  bindingHash: string;
  createdAt: string;
};
// hash: VARIANT_ORCHESTRATION_BINDING_V1
```

**Unicidade**: `(tenantId, experimentVariantIdentityHash)` — e
`orchestratorRunId` não pode ficar ligado a duas variantes distintas.
Mesmo execution intent não cria dois Runs de negócio (já congelado
antes).

```typescript
type VariantPublicationBinding = {
  variantPublicationBindingId: string;
  tenantId: string;
  experimentVariantId: string;
  variantOrchestrationBindingId: string; variantOrchestrationBindingHash: string;
  socialPublicationBindingId: string; socialPublicationBindingHash: string;
  publicationScope: ExperimentEvaluationPublicationScope;
  bindingHash: string;
  createdAt: string;
};
// hash: VARIANT_PUBLICATION_BINDING_V1
```

**Scope precisa bater exatamente**:
`VariantPublicationBinding.publicationScope =
ExperimentEvaluationPlan.evaluationPublicationScope`. Publicação
adicional em outro canal pode existir normalmente, mas não entra no
experimento V1 — se baseline é Instagram Reel e variant B publica em
Reel+Pinterest, só Reel é subject da avaliação daquele experimento.

**Factual basis expirada**: se antes da execução alguma dependência
factual obrigatória (`OfferAnalysisResult`, `ProductVisualReferenceSet`
etc.) estiver expirada segundo sua própria validity policy, Skill20/
Skill01 NÃO substituem silenciosamente — não reprocessam upstream
automaticamente.

### Concurrency e stacking

```typescript
type VariationConcurrencyReservationState = 'RESERVED' | 'EXECUTION_RESERVED'
  | 'MEASUREMENT_HOLD' | 'RELEASED';

type VariationConcurrencyReservation = {
  variationConcurrencyReservationId: string;
  tenantId: string;
  promotedProductId: string;
  experimentIdentityHash: string;
  budgetPolicySnapshotHash: string; generationPolicySnapshotHash: string;
  state: VariationConcurrencyReservationState;
  reservedVariantSlots: number;
  version: number;
  acquiredAt: string; updatedAt: string; releasedAt?: string;
}; // mutável, sem hash integral
```

**Aquisição atômica**: guard key `(tenantId, promotedProductId)` — sob
o mesmo guard, verifica `maxConcurrentExperimentsPerProduct`/
`maxConcurrentVariantsPerProduct`/`experimentStacking` e reserva.
Nunca `SELECT count → solta lock → INSERT` com race — a operação
lógica é atômica. `EXECUTION_RESERVED` enquanto existem variantes
`PLANNED`/intent/`RUN_BOUND`/`EXECUTING` ocupando capacidade.
`MEASUREMENT_HOLD` quando todas chegaram a `PUBLISHED`/
`TERMINAL_NO_PUBLICATION`/`CANCELLED`. Release automático quando a
reserva não é mais necessária. Concorrência entre dois experimentos do
mesmo produto: o atomic guard decide — não podem ambos acreditar que
estão dentro do limite. **Limite MVP da Skill 01 continua valendo** —
mesmo com `maxConcurrentVariantsPerProduct=3`, se Skill 01 hoje
permite só 1 active Run/tenant, as três variantes executam conforme
essa capacidade (Skill 20 não substitui a restrição do Orquestrador).

### Lifecycle de avaliação com Skill18/19

Experimento passa a `MEASURING` só quando todas as variantes
planejadas têm outcome de execução (`PUBLISHED`/
`TERMINAL_NO_PUBLICATION`/`CANCELLED`) — não precisa que todas tenham
publicado. Verificação antes da avaliação: conta
`publishedVariantCount`; se `< evaluationPlan.minimumEvaluableVariantCount`
→ `CLOSED_UNEVALUABLE`. Nenhuma variante cancelada entra na
comparação — subjects = 1 baseline histórico exato + todas as
variantes `PUBLISHED`, somente.

**Skill 20 não chama Skill 18 pra coletar métricas** — fluxo correto:
Variant `PUBLISHED` → Skill 17 `SocialPublicationBinding` → Skill 18
coleta de performance (fim; Skill 18 já autorizado a coletar
publicamente, sem intervenção da Skill 20).

```typescript
type ExperimentEvaluationSubjectRef = {
  subjectKind: 'BASELINE' | 'VARIANT';
  variantPublicationBindingId?: string; variantPublicationBindingHash?: string;
  socialPublicationBindingId: string; socialPublicationBindingHash: string;
};

type ExperimentEvaluationRequest = {
  experimentEvaluationRequestId: string;
  tenantId: string;
  evaluationRequestKey: string;
  creativeVariationExperimentId: string; creativeVariationExperimentHash: string;
  evaluationPlanId: string; evaluationPlanHash: string;
  subjects: ExperimentEvaluationSubjectRef[];
  analysisKind: 'CREATIVE_ATTRIBUTE_ANALYSIS';
  comparisonDimension: CreativeVariationDimension;
  analysisHorizonHash: string;
  performanceAnalysisPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; };
  analysisMethodSetVersion: string;
  requestedSkill19AnalysisRequestKey: string;
  requestHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_EVALUATION_REQUEST_V1 — subjects em ordem
// determinística por subjectKind + subjectId.
```

**Idempotência**: UNIQUE `(tenantId, evaluationRequestKey)`. Retry
técnico → mesma request/rodada. Nova rodada legítima → nova key → novo
`PerformanceAnalysisResult` da Skill 19; anteriores permanecem, nenhum
overwrite. **Skill 19 continua dona da análise** — a request converte
em `PerformanceAnalysisInput` (`analysisKind=CREATIVE_ATTRIBUTE_ANALYSIS`)
com subjects/horizon/policy exatos. Skill 20 não calcula delta/
percentile/score/rank/winner.

```typescript
type ExperimentEvaluationPlanSatisfaction = 'SATISFIED' | 'NOT_YET_SATISFIED';

type ExperimentEvaluationBinding = {
  experimentEvaluationBindingId: string;
  tenantId: string;
  experimentEvaluationRequestId: string; experimentEvaluationRequestHash: string;
  performanceAnalysisResultId: string; performanceAnalysisResultHash: string;
  planSatisfaction: ExperimentEvaluationPlanSatisfaction;
  reasonCodes: Array<'COMPARISON_ELIGIBILITY_BELOW_REQUIRED'
    | 'PRIMARY_OUTCOME_UNAVAILABLE' | 'HORIZON_INCOMPLETE'>;
  bindingHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_EVALUATION_BINDING_V1
```

`SATISFIED` significa: mínimo do plano + primary outcome disponível →
`ExperimentLifecycle → EVALUATED`. `NOT_YET_SATISFIED` (ex.: plano
exige `COMPARATIVE_ELIGIBLE`, Skill 19 retorna `DESCRIPTIVE_ONLY`) —
não existe vencedor, não altera plano, lifecycle volta/permanece
`MEASURING`; nova rodada pode ocorrer depois. **Incompatibilidade
estrutural não vira `NOT_YET_SATISFIED`** — result com horizon errado/
subjects errados/outro tenant é `FATAL_ERROR`, não mera insuficiência
de dados.

**Três terminais**: `EVALUATED` | `CLOSED_UNEVALUABLE` | `CANCELLED`.
Só `EVALUATED` significa "há análise que satisfez o plano" — ainda sem
julgamento de vencedor. **Nova otimização = novo experimento** — se o
`PerformanceAnalysisResult` de `E1` motivar outra rodada:
`E1 → Skill19 result → novo experimentRequestKey → E2`; não anexa
variantes indefinidamente a `E1`.

### Cancelamento

```typescript
type ExperimentCancellationCommand = {
  experimentCancellationCommandId: string;
  tenantId: string;
  cancellationCommandKey: string;
  creativeVariationExperimentId: string;
  reasonCode: string;
  commandHash: string;
  createdAt: string;
};
// hash: EXPERIMENT_CANCELLATION_COMMAND_V1
```

**Idempotência**: UNIQUE `(tenantId, cancellationCommandKey)`. Mesma
key + mesmo hash → mesmo comando; mesma key + conteúdo diferente →
`FATAL_ERROR`. **Antes de `PLAN_FROZEN`**: Planning Run →
`CANCELLED`, nenhum plano consumível nasce. **Depois de
`PLAN_FROZEN`**: Experiment lifecycle → `CANCEL_REQUESTED`; Skill 20
marca variantes ainda `PLANNED` como `CANCELLED` e para Runs ativos
pede `RunControlCommand` à Skill 01. **Skill 20 não cancela Jobs
diretamente** — pede via Skill01/Skill02 usando contratos já
existentes, nunca edita estado de Job na mão. **Variante já publicada
não é apagada** — se Variant B está `PUBLISHED` e usuário cancela `E1`,
B continua `PUBLISHED` (nunca delete post/unpublish — V1 não possui
compensação externa desse tipo). **Race cancelamento × publicação**:
se cancelamento foi solicitado mas Skill 17 já confirmou publicação, o
fato externo vence — a variante termina `PUBLISHED`, não `CANCELLED`;
o experimento só deixa de orquestrar automaticamente aquela avaliação.

### Erros

**FATAL_ERROR (37):**

```text
VARIATION_TENANT_MISMATCH
VARIATION_CROSS_TENANT_SOURCE
VARIATION_EXPERIMENT_REQUEST_REPLAY_CONFLICT
VARIATION_PLANNING_RUN_CONTEXT_CONFLICT
VARIATION_BASELINE_HASH_MISMATCH
VARIATION_BASELINE_LINEAGE_MISMATCH
VARIATION_MOTIVATION_HASH_MISMATCH
VARIATION_MOTIVATION_EVIDENCE_INTEGRITY_VIOLATION
VARIATION_GENERATION_POLICY_HASH_MISMATCH
INVALID_VARIATION_GENERATION_POLICY
VARIATION_BUDGET_POLICY_HASH_MISMATCH
INVALID_VARIATION_BUDGET_POLICY
VARIATION_EVALUATION_PLAN_HASH_MISMATCH
INVALID_VARIATION_EVALUATION_PLAN
VARIATION_PRIMARY_DIMENSION_MISMATCH
VARIATION_MUTATION_SET_INVALID
VARIATION_PRESERVE_SET_INVALID
VARIATION_DEPENDENT_ADAPTATION_INVALID
VARIATION_DIRECTIVE_REPLAY_CONFLICT
VARIATION_VARIANT_IDENTITY_CONFLICT
VARIATION_DUPLICATE_SEMANTIC_VARIANT
VARIATION_COST_ESTIMATE_REPLAY_CONFLICT
VARIATION_COST_CURRENCY_MISMATCH
VARIATION_EXPERIMENT_PLAN_REPLAY_CONFLICT
VARIATION_PLAN_COMMIT_CONFLICT
VARIATION_EXECUTION_INTENT_REPLAY_CONFLICT
VARIATION_ORCHESTRATION_BINDING_CONFLICT
VARIATION_RUN_LINEAGE_MISMATCH
VARIATION_PUBLICATION_BINDING_LINEAGE_MISMATCH
VARIATION_PUBLICATION_SCOPE_MISMATCH
VARIATION_CONCURRENCY_GUARD_INTEGRITY_VIOLATION
VARIATION_EVALUATION_REQUEST_REPLAY_CONFLICT
VARIATION_EVALUATION_RESULT_LINEAGE_MISMATCH
VARIATION_EVALUATION_BINDING_REPLAY_CONFLICT
VARIATION_HEURISTIC_CAUSAL_ESCALATION_ATTEMPT
VARIATION_INVALID_STATE_TRANSITION
VARIATION_CANCEL_COMMAND_REPLAY_CONFLICT
```

**RETRYABLE_ERROR (11):**

```text
VARIATION_SOURCE_LOOKUP_TRANSIENT_ERROR
VARIATION_POLICY_LOOKUP_TRANSIENT_ERROR
VARIATION_COST_ESTIMATION_TRANSIENT_ERROR
VARIATION_PLAN_PERSISTENCE_TRANSIENT_ERROR
VARIATION_CONCURRENCY_RESERVATION_TRANSIENT_ERROR
VARIATION_ORCHESTRATOR_SUBMISSION_TRANSIENT_ERROR
VARIATION_ORCHESTRATOR_STATUS_TRANSIENT_ERROR
VARIATION_QUOTA_STATUS_TRANSIENT_ERROR
VARIATION_EVALUATION_SUBMISSION_TRANSIENT_ERROR
VARIATION_EVALUATION_STATUS_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

**BLOCKED:**

```text
VARIATION_GENERATION_POLICY_NOT_CONFIGURED    → POLICY_BLOCKED
VARIATION_BUDGET_POLICY_NOT_CONFIGURED        → POLICY_BLOCKED
VARIATION_MOTIVATION_NOT_ELIGIBLE             → POLICY_BLOCKED
VARIATION_LOW_SUPPORT_HEURISTIC_BLOCKED       → POLICY_BLOCKED
VARIATION_REQUIRED_ANALYSIS_INCOMPLETE        → DATA_BLOCKED
VARIATION_BASELINE_FACTUAL_BASIS_EXPIRED      → DATA_BLOCKED
VARIATION_BUDGET_EXCEEDED                     → POLICY_BLOCKED
VARIATION_MAX_VARIANTS_EXCEEDED               → POLICY_BLOCKED
VARIATION_CONCURRENT_EXPERIMENT_LIMIT         → CAPACITY_BLOCKED
VARIATION_ORCHESTRATOR_CAPACITY_BLOCKED       → CAPACITY_BLOCKED
VARIATION_DEPENDENCY_NOT_READY                → DATA_BLOCKED
```

**Resultados de domínio, não erros:**

```text
NO_ELIGIBLE_VARIATION_TARGET
VARIATION_NO_OP_REJECTED
EXPERIMENT_PLAN_ALREADY_EXISTS
WAITING_FOR_CONCURRENCY
WAITING_FOR_ORCHESTRATOR
WAITING_FOR_QUOTA
WAITING_FOR_VARIANT_EXECUTIONS
VARIANT_TERMINATED_WITHOUT_PUBLICATION
NO_VARIANT_PUBLISHED
INSUFFICIENT_PUBLISHED_VARIANTS
MEASURING
AWAITING_PERFORMANCE_ANALYSIS
EVALUATION_NOT_YET_SATISFIED
EVALUATION_PLAN_UNSATISFIABLE
EXPERIMENT_EVALUATED
EXPERIMENT_CANCELLED
```

`NO_ELIGIBLE_VARIATION_TARGET`: se baseline `HookStrategy=QUESTION` e a
policy só permite `QUESTION`, nenhuma variante válida — não é crash,
não inventa dimensão/valor.

### Multi-tenant

`trustedTenantId = Job.tenantId`, precisam bater
`PerformanceAnalysisResult`/`HeuristicAttributionHypothesis`/
`ExperimentBaselineRef`/`GenerationPolicy`/`BudgetPolicy`/
`EvaluationPlan`/`VariationDirective`/Skill17
`SocialPublicationBinding`/Skill19 `PerformanceAnalysisResult` de
avaliação. Divergência → `VARIATION_TENANT_MISMATCH` (`FATAL_ERROR` +
security `AuditEvent`). **Cohort nunca cruza tenant** — mesmo
produto/conta/taxonomia não permite usar evidence de outro tenant na
geração de target (benchmarking multi-tenant fora da V1). **Provider
account também precisa pertencer ao tenant** — `evaluationPublicationScope`
nunca é aceito só porque o account ID existe, precisa resolver pra
integração autorizada daquele tenant (Skill 24 formalizará essa
resolução depois).

### Observabilidade

**Planning**: `tenantId`, `jobId`, `attemptNumber`,
`experimentRequestKey`, `planningRunState`, `baselineHash`,
`motivationType`/`motivationHash`, `primaryComparisonDimension`,
`generationPolicySnapshotHash`/`budgetPolicySnapshotHash`,
`evaluationPlanHash`, `candidateTargetCount`, `plannedVariantCount`,
`estimatedExperimentCost`/`currency`, `concurrencyGuardStatus`,
`experimentIdentityHash?`. **Lifecycle**:
`executionIntentHash?`, `orchestratorRunId?`/`orchestrationBindingHash?`,
`operationalBlockReason?`, `publicationBindingHash?`,
`experimentLifecycleState`, `activeVariantCount`/
`publishedVariantCount`/`terminalNoPublicationCount`/
`cancelledVariantCount`. **Evaluation**: `evaluationRequestKey`/
`evaluationRequestHash`, `evaluationSubjectCount`,
`performanceAnalysisResultHash?`, `planSatisfaction`,
`evaluationReasonCodes`, `experimentLifecycleState`.

**Nunca logar**: trackingToken, affiliate URL completa, provider
secrets, quota token/credential, order IDs, mensagens privadas, raw
provider payloads, texto livre integral de hypothesis, PII de
audiência. **Não usar high-cardinality como metric labels** —
`experimentVariantId`/`mediaId`/`conversionId`/`runId` podem existir
em logs estruturados/audit trail, nunca como label de série
operacional.

Audit events: `VariationPlanningRun created`, `variation motivation
accepted`/`blocked`, `experiment plan materialized`/`committed`,
`VariantExecutionIntent materialized`, `variant bound to Skill01 Run`,
`variant publication bound`, `variant terminated without publication`,
`ExperimentEvaluationRequest materialized`,
`PerformanceAnalysisResult bound to experiment`, `evaluation plan
satisfied`/`not yet satisfied`, `experiment closed unevaluable`,
`experiment cancellation requested`/`active variant cancellation
propagated`, `heuristic causal escalation blocked`, `cross-tenant
attempt blocked`.

Métricas operacionais: `variation_planning_run_total`,
`variation_experiment_planned_total`, `variation_variant_planned_total`,
`variation_plan_blocked_total`, `variation_concurrency_blocked_total`/
`variation_stacking_blocked_total`, `variation_execution_intent_total`,
`variation_variant_published_total`/`variation_variant_no_publication_total`,
`variation_quota_blocked_total`, `variation_experiment_measuring_total`,
`variation_evaluation_request_total`/`variation_evaluation_satisfied_total`/
`variation_evaluation_not_ready_total`, `variation_experiment_evaluated_total`,
`variation_hypothesis_used_total`. **Sem** métricas de sucesso/vencedor
(`successful_variation_total`/`best_hook_total`/`optimization_success_rate`
— a Skill 20 não possui esses conceitos).

### Plano de testes — 100 casos críticos, 10 blocos

1–10 Planning/motivation/policy: comparative motivation válida com
`COMPARATIVE_ELIGIBLE`; descriptive válida quando policy permite;
heuristic `MODERATE_SUPPORT` elegível; `LOW_SUPPORT` bloqueada;
exploratory usa dimensão oficial da Skill 07; dimensão não oficial
rejeitada; mesma `experimentRequestKey`+contexto reutiliza PlanningRun;
diferente → fatal; experimento tem exatamente uma primary dimension;
`causalClaimAllowed` permanece false.

11–20 Mutation/preservation/materialização: baseline usa refs/hashes
exatos; nenhum lookup "latest"; `fromValue=toValue` →
`VARIATION_NO_OP_REJECTED`; preserve set contém as outras cinco
dimensões; dependent adaptation não permite segunda mutação criativa;
target semântico duplicado no mesmo experimento → fatal; custos das
variantes somam deterministicamente; currencies divergentes → fatal;
crash antes do PlanCommit não torna plano consumível; replay completa
os mesmos componentes e produz o mesmo commit.

21–30 Budget/concurrency/stacking: estimate de variante/total acima do
teto → blocked; `unlimitedBudgetAllowed` permanece false; budget
policy ausente → blocked; limite de experimentos/variantes por produto
aplicado atomicamente; prior experiment unevaluated bloqueia stacking;
fim da execução move reservation pra `MEASUREMENT_HOLD`; `EVALUATED`
libera reservation; dois experimentos concorrentes não conseguem
reservar o mesmo capacity slot além do limite.

31–40 Skill01/lineage: `VariantExecutionIntent` contém scope correto;
retry do mesmo intent reutiliza intent; mesmo variant identity com
intent incompatível → fatal; Skill 01 cria no máximo um orchestration
binding por variant identity; Run recebe `VariationRunLineageRef`
exato; `StageSubjectBinding` continua `PRODUCT`; `creativeVariant.valueIdentityHash`
(Ponto S5) não é usado pra reconstruir experiment identity; Skill 01 continua decidindo
quais stages executam; upstream artifact reutilizado só por ID/hash
exato; factual basis expirada nunca é silenciosamente substituída.

41–50 Skill23/execução: Skill 20 nunca emite spend authorization; cada
variante sujeita à autorização Skill 23; `DENIED` produz quota block;
quota denial não gera automaticamente outro Run; authorization não
bypassa Skill 01; provider retry/Skill13 correction continuam na mesma
`ExperimentVariant`; Run terminal sem `SocialPublicationBinding` →
`TERMINAL_NO_PUBLICATION`; quota block nunca é classificado como
performance ruim; estado operacional nunca altera
`CreativeVariationExperiment` hash.

51–60 Publicação/scope/subjects: variante só vira `PUBLISHED` com
`SocialPublicationBinding`; publication binding precisa da lineage
exata do Run; target diferente do evaluation scope → fatal; provider
account diferente → fatal; publicação adicional em outro canal não
entra na avaliação; evaluation request só nasce após todas as
variantes terem execution outcome; `publishedVariantCount ≥
minimumEvaluableVariantCount` permite prosseguir; contagem abaixo do
mínimo → `CLOSED_UNEVALUABLE`; `CANCELLED` variant não entra nos
evaluation subjects; subject set = baseline + variantes publicadas
elegíveis.

61–70 Skill18/Skill19: Skill 20 nunca consulta provider diretamente
nem coleta `MetricSnapshot` diretamente; `ExperimentEvaluationRequest`
enviado à Skill 19; Skill 19 continua podendo solicitar refresh à
Skill 18; replay da mesma `evaluationRequestKey` reutiliza request;
nova rodada usa nova request key; result com horizon/subject set
incompatível → fatal; required `COMPARATIVE_ELIGIBLE` + result
`DESCRIPTIVE_ONLY` → `NOT_YET_SATISFIED`; primary outcome indisponível
→ `NOT_YET_SATISFIED`.

71–80 Evaluation/causalidade: result que satisfaz plano leva a
`EVALUATED`; `EVALUATED` não cria winner; heuristic motivation nunca
vira canonical attribution evidence; Skill 20 nunca cria
`ExperimentScore`; `PerformanceAnalysisResult` novo não altera
experiment plan; dados novos após `EVALUATED` não sobrescrevem
evaluation binding antigo; nova otimização exige novo
`experimentRequestKey`; replay do mesmo evaluation binding é
idempotente; `NOT_YET_SATISFIED` mantém experimento em `MEASURING`;
`EVALUATED` é terminal operacional, não julgamento de performance.

81–90 Cancelamento/state machine: cancelamento antes de PlanCommit
encerra PlanningRun; após plan freeze impede variantes não iniciadas;
Runs ativos recebem pedido via Skill 01; publicação existente nunca é
apagada automaticamente; publicação confirmada durante race de
cancelamento permanece `PUBLISHED`; mesma `cancellationCommandKey`+hash
é idempotente; mesma key+payload diferente → fatal; `CANCELLED` libera
concurrency reservation; experimento cancelado não inicia avaliação
automática; publicação de experimento cancelado continua analisável
diretamente pela Skill 19.

91–100 Multi-tenant/segurança/observabilidade: `Job.tenantId` é
autoridade da Skill 20; baseline/`ExperimentVariant`/
`SocialPublicationBinding`/`PerformanceAnalysisResult` motivador de
outro tenant → fatal; logs não expõem token/link/secrets/order IDs;
IDs de alta cardinalidade não viram metric labels; plan commit/
orchestration/evaluation/cancellation geram AuditEvents; lifecycle
mutável nunca altera hashes do plano; **Skill 20 nunca declara
winner/loser nem bypassa Skill 01 ou Skill 23.**

### Hashes novos deste bloco (8)

```text
CREATIVE_VARIATION_PLANNING_RUN_CONTEXT_V1
EXPERIMENT_PLAN_COMMIT_V1
VARIATION_RUN_LINEAGE_REF_V1
VARIANT_ORCHESTRATION_BINDING_V1
VARIANT_PUBLICATION_BINDING_V1
EXPERIMENT_EVALUATION_REQUEST_V1
EXPERIMENT_EVALUATION_BINDING_V1
EXPERIMENT_CANCELLATION_COMMAND_V1
```

Total 24 hashes canônicos (16 do bloco central + 8 deste bloco). Não
recebem hash integral por serem mutáveis:
`CreativeVariationPlanningRun`, `CreativeVariationExperimentLifecycle`,
`ExperimentVariantLifecycle`, `VariationConcurrencyReservation`.

### Cadeia operacional final

```text
PerformanceAnalysisResult → VariationMotivation → CreativeVariationPlanningRun
  → policies + budget + eligibility → deterministic target selection
  → VariationDirective(s) → ExperimentVariant(s) → CreativeVariationExperiment
  → ExperimentPlanCommit → PLANNED → atomic concurrency reservation
  → VariantExecutionIntent → Skill01 → normal pipeline
  → Skill23 gate no consumo pago → Skill17 SocialPublicationBinding
  → VariantPublicationBinding → MEASURING → Skill18 coleta
  → ExperimentEvaluationRequest → Skill19 → PerformanceAnalysisResult
  → ExperimentEvaluationBinding → SATISFIED?
      não → MEASURING
      sim → EVALUATED
```

E não existe em nenhum ponto: `Skill20 → WINNER`,
`Skill20 → CAUSALITY_PROVEN`.

### Cinco garantias operacionais finais (ChatGPT)

1. `ExperimentPlanCommit` é a fronteira de visibilidade: componentes
   parcialmente materializados nunca constituem um experimento
   executável.
2. O plano experimental é imutável; lifecycle, bloqueios, Runs,
   publicações e avaliações são estados externos separados e nunca
   alteram os hashes do plano.
3. Cada variante entra no único pipeline da Skill 01 com lineage
   experimental explícita, enquanto `StageSubjectBinding` continua
   representando o `PRODUCT` factual.
4. A avaliação usa exclusivamente publicações no scope pré-declarado e
   é executada pela Skill 19; a Skill 20 apenas verifica se o
   resultado satisfaz estruturalmente o plano, sem interpretar
   vencedor ou causalidade.
5. Concurrency, stacking e orçamento limitam a criação de custo; quota
   real continua sob Skill 23 e nenhum retry, correção ou bloqueio
   cria silenciosamente uma nova variante.

Com esse bloco integrado, a Skill 20 fica pronta para a
auto-verificação final: tipos únicos, 24 hashes canônicos totais (16
anteriores + 8 novos), exatamente 37 `FATAL_ERROR`, 100 testes, além de
conferir os dois patches do `ExperimentEvaluationPlan` e
`VariantExecutionIntent`.

## Auditoria real do repositório (2026-09-18)

- **Contratos exatos da Skill 19 a consumir**: `PerformanceAnalysisResult`
  (imutável, `resultCompleteness: COMPLETE|PARTIAL_SIGNAL_UNAVAILABLE|
  DESCRIPTIVE_ONLY`, seções `organic`/`commercial`/`comparison` como
  refs/hashes, `heuristicHypotheses` como campo irmão estruturalmente
  fora da seção comercial); `PerformanceScore`
  (`status: SCORED|INCOMPLETE|INELIGIBLE_COMPARISON`, pesos fixos de
  policy); `ComparisonEligibility`
  (`INSUFFICIENT_SAMPLE|DESCRIPTIVE_ONLY|COMPARATIVE_ELIGIBLE` — nunca
  "winner"/"best archetype" quando não `COMPARATIVE_ELIGIBLE`);
  `ComparisonDimension` (`CREATIVE_MODE|ARCHETYPE|HOOK_STRATEGY|
  NARRATIVE_STRUCTURE|VISUAL_APPROACH|CTA_INTENT|PROMOTED_PRODUCT|
  PUBLICATION_TARGET`); `HeuristicAttributionHypothesis` com
  `canonicalAttributionLevelGranted: false` e
  `eligibleForEvidenceBackedScore: false` **travados literalmente**.
- **Handoff explícito Skill19→Skill20 (3 menções verbatim já escritas
  na Skill 19)**: cadeia `→ PerformanceAnalysisResult → Skill20/21`;
  "Skill 20 precisa saber exatamente qual conclusão gerou uma decisão;
  exige rastreabilidade de método"; "`heuristicHypotheses`... servem
  pra insight/investigação/hipótese de teste futuro (**Skill 20 pode
  usar pra criar variações experimentais quando houver volume**), mas
  não melhoram score factual"; ownership final: "Skill20 → gera
  variações a partir de análise aprovada". `ExploratoryPerformanceScore`
  foi **proposto mas explicitamente adiado** pela Skill 19 ("não
  precisa implementar na V1") — conceito futuro, não construído.
- **Taxonomia criativa a variar (Skill 07)**: `CreativeMode`
  (`TREND_INFORMED|EVERGREEN`), `CreativeArchetypeV1` (8 valores:
  DEMONSTRATION, PROBLEM_SOLUTION, PRODUCT_IN_USE, POV, UNBOXING,
  BEFORE_AFTER, REACTION, EVERGREEN_PRODUCT_DEMO), `HookStrategyV1` (6
  valores), `NarrativeStructureV1` (4 valores), `VisualApproachV1` (5
  valores), `CreativeCtaIntent` (união discriminada
  COMMENT_KEYWORD/DIRECT_LINK/NONE). A Skill 07 não menciona
  "variação"/Skill 20 no próprio arquivo — a fronteira só é declarada
  do lado da Skill 08/11/19.
- **Achado crítico: zero conceito de experimento/variação existe hoje
  em qualquer Skill 01-19.** Nenhum `experimentId`/`parentRunId`/
  `variationOf` em lugar nenhum — greenfield total.
  `LogicalJobIntent.variantKey` (Skill 01/02) existia na época desta
  aprovação, como desambiguador **interno de pipeline**
  (`logicalJobKey = runId:stage:subjectType:subjectId:variantKey`),
  não um conceito de rastreamento de experimento — **PATCH (Ponto S5,
  2026-09-18): `variantKey` foi descontinuado do kernel**, substituído
  por `StageWorkUnitIdentity` estruturado
  (`logicalJobKey = runId:stage:subjectType:subjectId:stageWorkUnitIdentityHash`);
  nota histórica preservada, ver `01-orquestrador-de-producao/SPEC.md`
  → Ponto S5 pro contrato atual. Skills 08/11 já
  citam a Skill 20 como dona futura da geração de variantes A/B/C,
  ainda não especificada.
- **Zero precedente real de A/B testing/experiment tracking em
  qualquer lugar do repo** — grep amplo por experiment/variant/A-B/
  bandit não encontrou nada fora do texto "invariante" (falso
  positivo) e do campo `variant: "feed"|"story"` do compositor OG
  estático (`story-template/route.tsx`), que é só seletor de layout de
  imagem, sem relação com experimentação.
- **`StageSubjectBinding` (Skill 01) só tem política concreta para
  `PRODUCT`** — `VIDEO`/`PUBLICATION` ficam explicitamente "sem
  política definida até serem necessários". A Skill 20 será a primeira
  consumidora real forçando uma política de resolução para
  `VIDEO`/`PUBLICATION`.
- **Banco de dados**: a migration original já cita `experiments` como
  tabela planejada-mas-adiada no comentário do plano mestre ("entram
  em migrations futuras... não criamos tabela especulativa sem uso
  imediato") — nenhuma migration desde então criou
  `experiments`/`variants`/`versions`/`ab_test*`. **100% greenfield na
  camada de banco.**

## Questões reais para o debate com o ChatGPT

1. Como formalizar "experimento rastreável" — um novo tipo
   `CreativeVariationExperiment` que referencia o
   `PerformanceAnalysisResult`/`HeuristicAttributionHypothesis` que o
   motivou, sem nunca prometer que o resultado provará causalidade?
2. Como a Skill 20 decide QUAL dimensão variar (archetype? hook?
   CTA?) — segue estritamente o `ComparisonDimension` já testado pela
   Skill 19, ou pode propor dimensões novas nunca comparadas?
3. Uma variação gera um novo Job/Run completo (voltando a Skill
   07→08→...→17) ou pode reaproveitar artefatos já aprovados de
   estágios anteriores (ex.: mesmo roteiro, só hook diferente)? Como
   isso não vira uma "quarta forma" de pipeline concorrendo com o
   Orquestrador da Skill 01?
4. Como fica a política de resolução de `StageSubjectBinding` para
   `VIDEO`/`PUBLICATION` que a Skill 20 vai forçar a existir pela
   primeira vez — a variação aponta pro vídeo original como subject,
   ou pro produto/oferta original?
5. `heuristicHypotheses` explicitamente habilita "variações
   experimentais quando houver volume" — qual o piso mínimo de volume/
   evidência antes da Skill 20 sequer considerar gerar uma variação
   baseada numa hipótese heurística (vs. baseada em
   `ComparisonEligibility=COMPARATIVE_ELIGIBLE` real)?
6. Quando um experimento "termina" — a Skill 20 decide isso, ou isso
   volta a ser papel da Skill 19 (novo `PerformanceAnalysisResult`
   sobre o vídeo variante) e a Skill 20 só decide iniciar, nunca
   concluir/julgar?
7. Limite de variações simultâneas por produto/criativo original —
   como evitar explosão combinatória (N dimensões × M valores) gerando
   custo de geração de vídeo pago (Skill 11) sem controle?
