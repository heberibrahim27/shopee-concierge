# Skill 21 — Relatórios

> **IMPLEMENTATION STATUS: `DEFERRED_V2_CONTRACT`** (Ponto M5, reparo
> transversal pós-revisão Fable, 2026-09-18 —
> `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`, contrato completo em
> `src/modules/video-machine/IMPLEMENTATION-SCOPE.md`). V1 runtime: **NOT
> IMPLEMENTED, NOT SCHEDULED, NOT REQUIRED FOR PRODUCTION.** Os hashes
> já especificados continuam documentados como material de contrato
> futuro — não entram no gate de implementação do MVP. No V1,
> observabilidade/admin consulta os artifacts/ledgers já existentes
> diretamente, sem subsistema formal de relatórios. Skill21 é
> terminal/analítica — nenhuma Skill core pode depender de output da
> Skill21 para avançar um `ProductionRun`. Não é `DEPRECATED`/`LEGACY`
> — é trabalho futuro congelado.

> **APROVADA EM ESPECIFICAÇÃO — 21/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 3 rodadas com ChatGPT (decisões
> fundacionais → contratos centrais → fechamento operacional/erros/
> testes), com auditoria real do repositório prévia (mesmo método das
> Skills 04-20). Última Skill do núcleo de conteúdo: apresenta
> resultados já decididos pelas Skills 18-20, nunca computa análise
> nova. Durante a auto-verificação, um bug recorrente de tipo duplicado
> foi encontrado e corrigido antes do carimbo final (mesmo padrão já
> visto nas Skills 13/14/16/17).

## Garantia central (congelada após rodada 1 de debate)

A Skill 21 transforma artefatos canônicos e imutáveis das Skills
anteriores em projeções, snapshots, renders e entregas de relatório
rastreáveis, tenant-scoped e semanticamente fiéis às fontes. Ela pode
selecionar, ordenar, formatar, rotular e apresentar informações já
existentes, mas nunca recalcula métricas de negócio, cria scores,
altera níveis de evidência, infere causalidade, completa dados
ausentes ou consulta fontes operacionais cruas para produzir
conclusões novas.

Cadeia geral:

```text
Canonical source artifacts (Skill17 / Skill18 / Skill19 / Skill20)
  → Report source resolution → exact source refs/hashes frozen
  → Report projection → ReportSnapshot → Render policy
  → RenderedReportArtifact → delivery adapter → destination
```

## Decisões fundacionais (rodada 1 — debate com ChatGPT, 2026-09-18)

1. **UI existente é precedente de layout/UX, nunca de arquitetura de
   dados.** `src/app/admin` pode inspirar cards/filtros/visualização,
   mas não pode ser copiado como data architecture — ele calcula seus
   próprios números.
2. **Skill 21 nunca consulta `conversionReport()`/`page_views`/
   `click_events`/`site_catalog` diretamente** pra gerar nova
   conclusão analítica. Esses dados precisam chegar por artefatos
   canônicos da camada responsável — pra performance, Skill 19
   continua autoridade.
3. **Skill 21 pode consumir mais de uma Skill, com funções
   diferentes.** Fonte primária analítica: `PerformanceAnalysisResult`.
   Fontes operacionais complementares (`CreativeVariationExperimentLifecycle`,
   `ExperimentEvaluationBinding`, `SocialPublicationBinding`,
   `MetricSnapshot`) só pra apresentar fatos já materializados — nunca
   pra recomputar o que a Skill 19 deveria calcular.
4. **Skill 21 nunca recebe apenas `score=83`** — recebe
   `PerformanceScore` + `scoreKey` + `domain` + `analysisHorizon` +
   `policy` + `cohort` + `signals` + `analysisBasis` + `resultHash`, e
   preserva esse contexto rastreável.
5. **Contrato central: apresentar, nunca recomputar.** Render policy
   proíbe: calcular média nova, somar comissão, calcular percentual/
   delta/ranking, renormalizar score, reclassificar hipótese.
6. **Nem cálculo "simples" entra escondido** — se o relatório precisa
   mostrar "+18,4%", esse valor já existe em `DerivedMetric`/
   `PerformanceSignal`/`PerformanceScore` ou outro artefato canônico
   upstream; nunca `Skill21: (current-previous)/previous` "porque é só
   uma continha" (isso recriaria a Skill 19 aos poucos).
7. **Matemática de apresentação é permitida só se semanticamente
   neutra** — `0.184 → "18,4%"` é formatação; `0.184 × algo` pra
   produzir outro insight não é.
8. **`ReportProjection` precisa preservar source refs** — cada seção
   apresentada é rastreável até artifact id/hash, respondendo "de onde
   saiu este número?" sem consultar banco mutável.
9. **Fonte exata antes da renderização** — `LATEST_APPROVED` resolve
   IDs exatos → `ReportSourceSelection`/`ResolvedReportSourceBundle`
   com IDs/hashes exatos; depois disso não existe mais "latest"
   naquele relatório.
10. **Render e snapshot são coisas diferentes**: `ReportProjection`
    (estrutura de apresentação) → `ReportSnapshot` (conteúdo
    estruturado congelado/auditável) → `RenderedReportArtifact`
    (HTML/PDF/texto/imagem). Evita amarrar a verdade do relatório a um
    formato específico.
11. **Snapshot entregue é imutável** (resposta à pergunta 6): uma vez
    entregue, `ReportSnapshot S1` não muda porque `PerformanceAnalysisResult
    R2` nasceu amanhã — nova informação gera novo `ReportSnapshot S2`.
    Mesmo relatório "latest" amanhã é outro snapshot (18/09 latest→R8→RS1;
    21/09 latest→R11→RS2; RS1 continua reproduzível).
12. **`RenderedReportArtifact` precisa de hash próprio** — mesmo
    snapshot + locale diferente + template diferente pode produzir
    bytes diferentes; duas identidades: semantic report content hash +
    rendered artifact hash.
13. **Skill 21 nunca acessa banco operacional diretamente** — sempre
    via artefatos aprovados (Skill 19 → `PerformanceAnalysisResult`;
    Skill 18 → coleta); nunca `Skill21 → raw tables`.
14. **Reports têm audiência diferente** — dois níveis V1:
    `INTERNAL_AUTHENTICATED` / `EXTERNAL_RECIPIENT` (o que mostramos
    internamente não é necessariamente o que pode sair por WhatsApp).
15. **Hypothesis é primeira classe, mas claramente separada** —
    `HeuristicAttributionHypothesis` pode aparecer em relatório
    interno, sempre renderizada como "HIPÓTESE ANALÍTICA", nunca junto
    de "FATO CONFIRMADO"/"EVIDÊNCIA DIRETA".
16. **Skill 21 não pode promover heuristic pela linguagem** —
    proibido transformar "temporalmente compatível" em "essa
    publicação gerou a venda", mesmo que pareça mais natural em
    português.
17. **Nível factual continua vindo da Skill15/19** — render pode
    mostrar `DIRECT_PROVIDER_CONFIRMED`/`OWN_CLICK_CONFIRMED_ONLY`/
    `PROVIDER_AGGREGATE_ONLY`/`UNATTRIBUTED` com labels humanos
    adequados, mas não altera o enum.
18. **`assumptions`/`limitations` são conteúdo sensível de
    apresentação** (resposta à pergunta 2): V1 conservadora — default
    hide externo/show interno sanitizado. Relatório interno pode
    mostrar texto integral, desde que `INTERNAL_AUTHENTICATED` e render
    aplique sanitização técnica (não precisa aprovação humana só pra
    visualizar internamente).
19. **Sanitização não pode reescrever semântica** — remove HTML/
    script/markdown perigoso/payload malicioso; nunca "melhora a
    frase".
20. **Truncamento é decisão de render, não alteração do snapshot** — o
    snapshot preserva o texto canônico completo; render compacto pode
    exibir excerpt + `truncated=true` e permitir abrir detalhes.
21. **Texto livre externo exigiria policy explícita futura** —
    `EXTERNAL_FREE_TEXT_ALLOWED` seria uma policy específica futura;
    não habilitada na V1.
22. **Narração LLM fica fora da V1** (resposta à pergunta 3):
    `narrationMode=STRUCTURED_TEMPLATE_ONLY`, `llmNarrationAllowed=false`
    (literal). Futuro: `ReportNarrationArtifact` separado do
    `ReportSnapshot`, nunca texto livre incorporado como verdade
    canônica; cada afirmação gerada referenciaria sourceRef/hash e
    claim type, números só copiados de structured fields — fora da V1.
23. **Skill 21 não corrige texto da Skill 19** — se assumptions dizem
    algo estranho, Skill 21 renderiza conforme policy ou oculta, nunca
    "conserta" semanticamente.
24. **Partial results aparecem como partial** (resposta à pergunta 7):
    sim, sempre que o relatório for materializado — `PARTIAL_SIGNAL_UNAVAILABLE`
    aparece explicitamente, nunca remove silenciosamente a seção
    faltante pra parecer completo.
25. **Missing não vira zero** — `DirectCommercialScore unavailable` →
    "Dados comerciais individuais indisponíveis", nunca "Conversões:
    0".
26. **Relatório não é obrigado a esperar completude**, mas nunca finge
    causal claim que a Skill 19 não fez.
27. **Separar report materialization de delivery eligibility** — um
    relatório parcial pode existir internamente; `ReportDeliveryPolicy`
    decide `BLOCK_EXTERNAL_DELIVERY_IF_INCOMPLETE`.
28. **Internamente, prefere mostrar incompleto a esconder** — ocultar
    "missing commercial attribution" é pior pra tomada de decisão do
    que mostrar o gap.
29. **External reports podem ter regra mais rígida** —
    `INTERNAL: partial permitido` vs. `EXTERNAL: required completeness
    threshold`, policy-driven.
30. **Skill 21 não decide runtime que "partial agora é bom o
    suficiente"** — vem de `ReportPolicy`/`DeliveryPolicy`, nunca
    julgamento improvisado.
31. **Report types explícitos** — V1: `PERFORMANCE_REPORT` |
    `EXPERIMENT_REPORT` | `OPERATIONAL_REPORT`. Sem "mega relatório"
    genérico que tenta descobrir tudo.
32. **`PERFORMANCE_REPORT`**: fonte principal `PerformanceAnalysisResult`
    — pode mostrar organic/commercial/comparison/hypotheses/
    completeness.
33. **`EXPERIMENT_REPORT`**: fonte `CreativeVariationExperiment` +
    lifecycle + evaluation binding.
34. **`OPERATIONAL_REPORT`**: fonte publication/collection status,
    nunca converte isso em performance.
35. **Não misturar operacional com analítico sem rotulagem** — "Variante
    B não publicou por quota" não pode aparecer numa tabela "Performance
    das variantes" como score zero.
36. **Relatório precisa de source manifest** — todo snapshot carrega
    `ReportSourceManifest` com artifact kind/id/hash/tenantId de tudo
    que foi usado.
37. **Relatório derivado de relatório é proibido por default** — nunca
    `ReportSnapshot A → Skill21 lê A → cria ReportSnapshot B` pra
    análise; sempre preferimos as fontes canônicas originais. Um
    relatório pode ser re-renderizado, mas não vira fonte analítica.
38. **`tenantId` é obrigatório em toda entidade da Skill 21** (resposta
    à pergunta 5): Skill 21 nasce tenant-aware desde o primeiro
    contrato — não repete o admin atual tenant-blind.
39. **Isso não exige reescrever o admin agora** — durante a fase de
    SPEC, não tocamos a UI legacy. Classificação: `current /admin =
    LEGACY_SINGLE_TENANT_ADMIN` (fora do escopo tenant-aware).
    Compatibilidade por resolução server-side, não modificando
    arquitetura.
40. **Autoridade real de tenant não é a Skill 21** — tenant vem de
    authenticated context/integration/account binding/futura Skill 22;
    quando a Skill 22 formalizar tenant/account, Skill 21 passa a
    reutilizar autoridade canônica (não precisa redefinir multi-tenant
    lá).
41. **Relatórios de tenants diferentes nunca compartilham snapshot** —
    mesmo template/score/produto, identidade inclui tenant.
42. **Templates podem ser globais** — `ReportTemplateDefinition` pode
    ser `SYSTEM`/`TENANT`, mas conteúdo e source refs continuam
    tenant-scoped.
43. **Infra de canal deve ser abstraída** (resposta à pergunta 4):
    não `Skill21 → zapi.ts` direto; cria fronteira
    `ReportDeliveryAdapter`. Z-API vira um adapter real possível,
    reaproveitando `ChannelConnector`/`OutgoingMessage`/
    `OutgoingImageMessage` quando compatível — Skill 21 conhece
    `REPORT_DELIVERY_PROVIDER`, não detalhes da Z-API.
44. **Não assumir suporte a PDF/documento na V1** — text/structured/
    image podem existir; PDF fica policy-gated se existir capability
    real; capability declara formatos suportados por canal, não
    presume o que a policy não exigir.
45. **Delivery credentials/secrets/accounts pertencem à camada de
    integração** — Skill 21 recebe `deliveryProfileRef` resolvido pro
    tenant.
46. **Delivery é side effect separado** — render é side-effect free,
    delivery é external side effect; precisam de idempotência
    distinta.
47. **Re-render não significa re-send** — mesmo snapshot pode ter
    render template V1 e V2 sem disparar entrega automaticamente.
48. **Delivery deve referenciar bytes exatos** — `DeliveryIntent`
    referencia `artifactId`/`artifactHash`/`contentHash`, nunca "gere
    latest na hora de enviar".
49. **Retry de delivery envia o mesmo conteúdo** — timeout de provider
    → retry não resolve novas fontes, continua no mesmo
    `ReportSnapshot`/`RenderedReportArtifact`.
50. **"Latest" nunca atravessa a fronteira de delivery** — no momento
    que existe `DeliveryIntent`, "latest" já foi resolvido.
51. **Scheduled report futuro também segue isso** — scheduler dispara
    novo `ReportRequest` → nova resolução de fontes por request (report
    request key existe mesmo aqui).
52. **Formatação regional é neutra** — locale entra no template porque
    influencia decimal/moeda/datas/labels.
53. **Sorting permitido só por campo existente** — `sort by rank`/
    `createdAt`/`score canonicalValue` é apresentação; se "rank" não
    existe e Skill 21 calcula a partir do score, proibido.
54. **Filtering precisa ser explícito** — Skill 21 pode mostrar só
    `domain=ORGANIC` se a report definition pediu, mas não esconde
    `UNAVAILABLE` pra deixar o relatório "mais bonito", salvo policy
    que claramente diz section excluded.
55. **Omissão distinta de ausência** — relatório diferencia
    `SECTION_NOT_REQUESTED` / `SECTION_POLICY_HIDDEN` /
    `SOURCE_UNAVAILABLE` / `SOURCE_PARTIAL`, nunca tudo vira "sem
    dados".
56. **Report templates não mudam sem versionamento** — layout/wording
    estruturado muda → `templateVersion` muda; mesmo snapshot pode ser
    renderizado por V1 e V2.
57. **Template version não altera source truth** — `ReportSnapshot`
    hash pode permanecer o mesmo; `RenderedReportArtifact` hash muda
    porque conteúdo visual/wording muda.
58. **Vários renders do mesmo snapshot são normais.**
59. **Provenance está sempre embutida sem ser mostrada** — o snapshot
    guarda refs/hashes; render externo pode não exibi-los
    visualmente. Auditabilidade não exige mostrar SHA256 ao cliente.
60. **Internal admin pode oferecer "ver fonte"** — score → source
    `PerformanceAnalysisResult` → `AnalysisBasis` é UX, não nova
    análise.
61. **`PerformanceAnalysisResult.resultCompleteness` é autoridade** —
    Skill 21 não inventa sua própria noção de completo/parcial; pode
    existir delivery policy sobre completeness, mas o factual status
    vem da Skill 19.
62. **Experiment lifecycle state vem da Skill 20** — Skill 21 não
    calcula "se 2 variantes publicaram então MEASURING", lê
    `CreativeVariationExperimentLifecycle.state` diretamente.
63. **Attribution labels canonicamente mapeados** —
    `DIRECT_PROVIDER_CONFIRMED→"Confirmado pelo provedor"`,
    `OWN_CLICK_CONFIRMED_ONLY→"Clique próprio confirmado"`,
    `PROVIDER_AGGREGATE_ONLY→"Resultado agregado do provedor"`,
    `UNATTRIBUTED→"Sem atribuição individual"` — mapeamento congelado
    como labeling policy, não regra de negócio.
64. **Score scale sempre exibe unidade correta.**
65. **Comparison ranking exibido conforme está, nunca recalculado.**
66. **Um relatório não é fonte de decisão automática** — Skill 20 deve
    continuar consumindo `PerformanceAnalysisResult`, nunca
    `ReportSnapshot`, mesmo que o relatório destaque algum ponto.
67. **Skill 21 não fecha loop de otimização** — apresenta, não chama
    Skill 20 automaticamente "porque relatório mostrou score baixo".
68. **Relatórios externos precisam de audience binding** —
    `ReportDeliveryIntent` sabe tenant/audience type/destination
    profile/channel, sem confiar em destinatário arbitrário vindo do
    conteúdo do report.
69. **Destinatário não entra no snapshot semântico** — mesmo report
    pode ser enviado a dois destinatários autorizados:
    `ReportSnapshot ≠ DeliveryIntent`.
70. **Delivery receipt não altera o relatório** — registra
    `SENT`/`DELIVERED`/`FAILED`/`UNKNOWN` sem modificar
    snapshot/render.
71. **Delivery unknown tratado com cautela** — como qualquer side
    effect externo: `SUBMITTING`/`CONFIRMED`/`UNKNOWN`; nunca dispara
    duplicata cegamente.
72. **Skill 21 e admin existente vivem lado a lado hoje** — legacy
    dashboard e novos relatórios canônicos precisam estar claramente
    separados.
73. **Zero tabelas existentes não é problema** — Skill 21 é greenfield
    de persistência; na fase SPEC não criamos `reports`/
    `report_snapshots`/`rendered_reports`/`deliveries` ainda, apenas
    contratos.
74. **Output multi-format, mas capability-driven** — HTML/TEXT/IMAGE/
    PDF/CSV conceitualmente, mas não declarados todos como
    implementados; V1 SPEC pode suportar tipos, runtime capabilities
    começam `NOT_IMPLEMENTED` até prova.
75. **CSV merece atenção** — exportação tabular só de campos já
    existentes; não gera "new totals row"/"average row" se esses
    valores não existem upstream.
76. **PDF também é só render** — não ganha permissão analítica só por
    "ser documento".
77. **Snapshot carrega completeness e disclosure** — qualquer
    relatório congelado sabe source completeness, sections
    unavailable/hidden by policy, heuristics included?, stale data
    used? — sem inferir depois.
78. **Delivery adapter capability declara formatos suportados por
    canal** — não presume suporte que a policy não exigir.
79. **Renderização determinística** — mesmo `ReportSnapshot` +
    `templateVersion` + locale + timezone + renderPolicy produz
    semanticamente o mesmo conteúdo. PDF bytes podem variar por
    metadata técnica se a engine não for bitwise deterministic — se
    isso ocorrer, distingue `semanticRenderHash` de
    `contentBytesHash` no contrato posterior.
80. **Report content hash precisa existir antes da entrega** — sem
    isso não conseguimos provar "qual relatório exatamente foi
    enviado?".

### Ownership final (rodada 1)

```text
Skill15  → attribution evidence
Skill17  → publication identity
Skill18  → observed metrics / commerce facts
Skill19  → derived metrics / scores / cohorts / hypotheses (factual authority)
Skill20  → experiment/variant lifecycle (factual authority)
Skill21  → projection, snapshot, render, delivery (apresentação)
Skill22  → tenant/account authority futuro
Skill24  → integration/account capability futuro
```

### Respostas diretas às sete perguntas (ChatGPT)

1. **Consumir sem computar nada novo?** Cadeia
   `ResolvedReportSourceBundle → ReportProjection → ReportSnapshot`. A
   projeção só seleciona, rotula e formata campos já existentes;
   nenhum cálculo analítico novo entra na Skill 21.
2. **`assumptions`/`limitations`?** Internos por default. Relatório
   interno pode mostrar texto integral sanitizado; render compacto
   pode truncar visualmente.
3. **Narração LLM?** Fica fora da V1 —
   `narrationMode=STRUCTURED_TEMPLATE_ONLY`,
   `llmNarrationAllowed=false` (literal).
4. **Infra de canal?** Fronteira `ReportDeliveryAdapter`; reutilizamos
   `ChannelConnector` onde couber; Skill 21 não importa Z-API como
   domínio.
5. **Multi-tenant?** Skill 21 nasce tenant-aware agora, mas não força
   reescrita do admin legacy durante SPEC. No runtime MVP, o admin
   atual pode resolver um tenant fixo server-side; nunca confia em
   `tenantId` arbitrário do navegador.
6. **Snapshot vs. live?** Relatório entregue é imutável. "Latest" só
   existe na resolução inicial; depois tudo vira refs/hashes exatos.
   Novo dado produz novo snapshot. O dashboard pode resolver novas
   fontes a cada carregamento, mas export/delivery sempre congela
   snapshot.
7. **Partial/incomplete?** Nunca esconder semanticamente. Se o report
   é materializado, mostra o estado real
   (`PARTIAL_SIGNAL_UNAVAILABLE`/`DESCRIPTIVE_ONLY`/
   `CLOSED_UNEVALUABLE` etc.). Delivery externa pode ser bloqueada por
   policy, mas não falsificamos completude.

### Cinco fechamentos conceituais (ChatGPT)

1. A Skill 21 pode mudar a forma de apresentação, nunca o significado
   analítico. Todo número, status ou conclusão factual exibidos
   precisa existir antes da renderização em uma fonte canônica
   identificável.
2. "Latest" termina na resolução da fonte. Um relatório materializado
   ou entregue sempre referencia artefatos exatos e imutáveis; novos
   dados produzem outro snapshot, nunca modificam o anterior.
3. Hipótese, limitação, incompletude e ausência de atribuição
   permanecem visíveis como tais. A camada de apresentação nunca
   melhora a certeza dos dados para produzir uma narrativa mais
   convincente.
4. Renderização e entrega são camadas separadas: o mesmo snapshot pode
   gerar formatos diferentes, e o mesmo render pode ser entregue por
   adapters diferentes, sem acoplamento ao WhatsApp/Z-API.
5. Skill 21 nasce tenant-aware mesmo sobre uma UI legacy single-tenant;
   compatibilidade com o admin existente será feita por resolução
   server-side, não pela criação de consultas tenant-blind novas.

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


Duas decisões estruturais antes dos tipos: **(1)** fontes imutáveis
entram por id+hash; fontes operacionais mutáveis (ex.:
`CreativeVariationExperimentLifecycle`) não podem ser referenciadas
como se tivessem hash canônico imutável — a Skill 21 captura a versão
exata observada num `ReportMutableStateCapture`. **(2)** toda
formatação dependente de locale/template vive no render, nunca no
`ReportProjection` — o projection é semântico ("0.184" só vira "18,4%"
no `RenderedReportArtifact`), mantendo `ReportSnapshot` independente de
pt-BR/PDF/WhatsApp.

### Tipos de relatório e fonte

```typescript
type ReportKind = 'PERFORMANCE_REPORT' | 'EXPERIMENT_REPORT' | 'OPERATIONAL_REPORT';
type ReportAudienceType = 'INTERNAL_AUTHENTICATED' | 'EXTERNAL_RECIPIENT';

type ReportSourceSelectionMode = 'EXACT_IMMUTABLE' | 'LATEST_APPROVED' | 'MUTABLE_STATE_CAPTURE';

type ReportImmutableSourceKind = 'PERFORMANCE_ANALYSIS_RESULT' | 'METRIC_SNAPSHOT'
  | 'SOCIAL_PUBLICATION_BINDING' | 'CREATIVE_VARIATION_EXPERIMENT'
  | 'EXPERIMENT_EVALUATION_BINDING' | 'VARIANT_PUBLICATION_BINDING';

type ReportMutableStateSourceKind = 'CREATIVE_VARIATION_EXPERIMENT_LIFECYCLE'
  | 'EXPERIMENT_VARIANT_LIFECYCLE';
// Não coloca raw tables aqui.

type ReportSourceScopeRef =
  | { scope: 'PUBLICATION'; socialPublicationBindingId: string; socialPublicationBindingHash: string; }
  | { scope: 'EXPERIMENT'; creativeVariationExperimentId: string; creativeVariationExperimentHash: string; }
  | { scope: 'TENANT'; tenantId: string; };
// LATEST_APPROVED nunca aceita query arbitrária.
```

**Ambiguidade em latest**: se duas fontes satisfazem igualmente a
posição mais recente segundo o resolution profile →
`AMBIGUOUS_LATEST_REPORT_SOURCE` (nunca desempata por UUID/ordem do
SELECT/ordem física).

### Captura de estado mutável e seleção de fonte

```typescript
type ReportCapturedFieldValue =
  | { kind: 'STRING'; value: string } | { kind: 'INTEGER'; value: string }
  | { kind: 'DECIMAL'; value: string } | { kind: 'BOOLEAN'; value: boolean }
  | { kind: 'TIMESTAMP'; value: string } | { kind: 'ENUM'; value: string }
  | { kind: 'NULL'; value: null };

type ReportCapturedStateField = { fieldKey: string; value: ReportCapturedFieldValue; };

type ReportMutableStateCapture = {
  reportMutableStateCaptureId: string;
  tenantId: string;
  sourceKind: ReportMutableStateSourceKind;
  sourceEntityId: string;
  sourceVersion: number;
  fields: ReportCapturedStateField[];
  capturedAt: string;
};
// hash: REPORT_MUTABLE_STATE_CAPTURE_V1

type ResolvedReportSourceRef =
  | { sourceType: 'EXACT_IMMUTABLE'; sourceRole: string; sourceKind: ReportImmutableSourceKind; artifactId: string; artifactHash: string; }
  | { sourceType: 'LATEST_APPROVED_RESOLVED'; sourceRole: string; sourceKind: ReportImmutableSourceKind; artifactId: string; artifactHash: string; }
  | { sourceType: 'VERSIONED_STATE_CAPTURE'; sourceRole: string; sourceKind: ReportMutableStateSourceKind; sourceEntityId: string; sourceVersion: number; stateCaptureId: string; stateCaptureHash: string; };

type ResolvedReportSourceBundle = {
  resolvedReportSourceBundleId: string;
  tenantId: string;
  reportRequestKey: string;
  reportSourceSelectionHash: string;
  sources: ResolvedReportSourceRef[];
  resolvedAt: string;
  resolverPolicySnapshotHash: string;
  bundleHash: string;
};
// hash: RESOLVED_REPORT_SOURCE_BUNDLE_V1 — sources ordenadas por
// sourceRole + sourceKind + source identity.
```

**Bundle fica congelado** — depois da materialização, nenhuma fonte é
substituída; dado novo → novo `ReportRequest` → novo Bundle.

### ReportRequest e ReportDefinition

```typescript
type ReportRequest = {
  reportRequestId: string;
  tenantId: string;
  reportRequestKey: string;
  reportKind: ReportKind;
  audienceType: ReportAudienceType;
  reportDefinitionId: string; reportDefinitionVersion: string;
  requestHash: string;
  createdAt: string;
};
// hash: REPORT_REQUEST_V1
```

**Idempotência**: UNIQUE `(tenantId, reportRequestKey)`. Mesma
key+hash → mesmo request; conteúdo diferente →
`REPORT_REQUEST_REPLAY_CONFLICT`. `reportRequestKey` não é identidade
de conteúdo — dois requests diferentes podem produzir semanticamente o
mesmo snapshot (`ReportRequest identity ≠ ReportSnapshot semantic
identity`).

```typescript
type ReportSectionDefinition = {
  sectionKey: string;
  sectionKind: 'PERFORMANCE_OVERVIEW' | 'ORGANIC_PERFORMANCE' | 'COMMERCIAL_PERFORMANCE'
    | 'COMPARISON' | 'HEURISTIC_HYPOTHESES' | 'EXPERIMENT_PLAN' | 'EXPERIMENT_STATUS'
    | 'OPERATIONAL_STATUS' | 'PROVENANCE';
  required: boolean;
  requiredSourceRoles: string[];
  order: number;
};

type ReportDefinition = {
  reportDefinitionId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  reportKind: ReportKind;
  sections: ReportSectionDefinition[];
  definitionHash: string;
};
// hash: REPORT_DEFINITION_V1
```

### ReportPolicy

```typescript
type ReportHypothesisPresentationMode = 'HIDDEN' | 'STRUCTURED_STATUS_ONLY' | 'FULL_INTERNAL_TEXT';
type ReportPartialSourceBehavior = 'ALLOW_AND_DISCLOSE' | 'BLOCK_MATERIALIZATION';

type ReportPolicy = {
  policyId: string; policyKey: string; policyVersion: string;
  tenantId: string;
  allowedReportKinds: ReportKind[];
  audienceType: ReportAudienceType;
  sourceResolution: {
    exactSourcesAllowed: true;
    latestApprovedAllowed: boolean;
    mutableStateCaptureAllowed: boolean;
    ambiguousLatestBehavior: 'BLOCK';
  };
  partialSources: { behavior: ReportPartialSourceBehavior; };
  hypotheses: {
    presentationMode: ReportHypothesisPresentationMode;
    canonicalAttributionPromotionAllowed: false;
  };
  freeText: {
    internalCanonicalFreeTextAllowed: boolean;
    externalCanonicalFreeTextAllowed: false;
  };
  provenance: { retainSourceManifest: true; visuallyExposeSourceIds: boolean; };
  narration: { llmNarrationAllowed: false; };
  policyHash: string;
  createdAt: string;
};
// hash: REPORT_POLICY_V1

type ReportPolicyBinding = {
  tenantId: string; reportKind: ReportKind; audienceType: ReportAudienceType;
  policyKey: string; activePolicyId: string; activePolicyVersion: string;
  updatedAt: string;
}; // mutável

type ReportPolicyBindingResolution = {
  tenantId: string; reportKind: ReportKind; audienceType: ReportAudienceType;
  policyKey: string; policyId: string; policyVersion: string; policySnapshotHash: string;
  resolvedAt: string; bindingResolutionHash: string;
};
// hash: REPORT_POLICY_BINDING_RESOLUTION_V1
```

### Lineage de datum e seções

```typescript
type ReportSourceFieldRef = {
  sourceRole: string;
  sourceId: string; sourceHash: string;
  canonicalFieldPath: string; // locator auditável, ex.: "organic.scoreRefs[0].score.canonicalValue"
  // nunca uma expressão como "organic.score * 1.15"
};

type ReportCanonicalValue =
  | { kind: 'INTEGER'; value: string } | { kind: 'DECIMAL'; value: string }
  | { kind: 'STRING'; value: string } | { kind: 'BOOLEAN'; value: boolean }
  | { kind: 'TIMESTAMP'; value: string } | { kind: 'ENUM'; value: string }
  | { kind: 'CANONICAL_FREE_TEXT'; value: string };

type ReportDatum = {
  datumKey: string;
  semanticKey: string;
  value: ReportCanonicalValue;
  sourceRefs: ReportSourceFieldRef[]; // sourceRefs.length ≥ 1 obrigatório
  sensitivity: 'STANDARD' | 'INTERNAL_ONLY' | 'INTERNAL_CANONICAL_FREE_TEXT';
  datumHash: string;
};
// não recebe hash canônico global separado — entra no hash da section.
// Labels e headings ficam no template, não são datums.

type ReportRecord = { recordKey: string; datums: ReportDatum[]; };
// útil para: variantes, scores, grupos, publicações.

type ReportSectionStatus = 'PRESENT' | 'SOURCE_PARTIAL' | 'SOURCE_UNAVAILABLE'
  | 'POLICY_HIDDEN' | 'NOT_REQUESTED';

type ReportSection = {
  sectionKey: string;
  sectionKind: ReportSectionDefinition['sectionKind'];
  status: ReportSectionStatus;
  records: ReportRecord[];
  disclosures: ReportDisclosure[];
  sectionHash: string;
};
// hash: REPORT_SECTION_V1
```

### Disclosures

```typescript
type ReportDisclosureCode = 'PARTIAL_UNAVAILABLE' | 'DESCRIPTIVE_ONLY' | 'STALE_DATA_USED'
  | 'HEURISTIC_HYPOTHESIS_PRESENT' | 'HEURISTIC_TEXT_HIDDEN'
  | 'COMMERCIAL_ATTRIBUTION_AGGREGATE_ONLY' | 'COMMERCIAL_ATTRIBUTION_UNAVAILABLE'
  | 'EXPERIMENT_CLOSED_UNEVALUABLE' | 'SECTION_HIDDEN_BY_POLICY';

type ReportDisclosure = {
  disclosureId: string;
  code: ReportDisclosureCode;
  severity: 'INFO' | 'CAUTION';
  sourceRefs: ReportSourceFieldRef[];
  disclosureHash: string;
};
// hash: REPORT_DISCLOSURE_V1
```

**Human wording não fica no disclosure** — o snapshot guarda
`DESCRIPTIVE_ONLY`; o template pt-BR renderiza "A amostra permite
apenas análise descritiva"; outro locale usa outro wording.

**Hypothesis internal**: `FULL_INTERNAL_TEXT` — `assumptions`/
`limitations` viram `CANONICAL_FREE_TEXT` com
`sensitivity=INTERNAL_CANONICAL_FREE_TEXT`. **External**:
`externalCanonicalFreeTextAllowed=false`.

### ReportProjection e ReportSnapshot

```typescript
type ReportProjection = {
  reportProjectionId: string;
  tenantId: string;
  reportRequestId: string;
  resolvedReportSourceBundleId: string; resolvedReportSourceBundleHash: string;
  reportDefinitionId: string; reportDefinitionHash: string;
  reportPolicyId: string; reportPolicyHash: string;
  sections: ReportSection[];
  disclosures: ReportDisclosure[];
  projectionHash: string;
  createdAt: string;
};
// hash: REPORT_PROJECTION_V1
```

**Projection é semanticamente neutro** — permitido: copiar valor,
selecionar seção, ordenar por campo já existente, ocultar conforme
policy, rotular semanticKey. Proibido: sum/mean/delta/ratio/rank/
score/currency conversion/causal interpretation. **Ordenação**: se
`PerformanceAnalysisResult` já tem rank, `sort by rank` é válido; se
não tem, "score descending → gerar rank visual 1,2,3" é proibido a
menos que `ReportDefinition` determine explicitamente essa ordem
(sem chamá-la de ranking).

```typescript
type ReportSnapshotCompleteness = 'COMPLETE_FOR_DEFINITION' | 'PARTIAL_BY_SOURCE'
  | 'PARTIAL_BY_POLICY' | 'BLOCKED_BY_POLICY';

type ReportSnapshot = {
  reportSnapshotId: string;
  tenantId: string;
  reportKind: ReportKind; audienceType: ReportAudienceType;
  resolvedReportSourceBundleId: string; resolvedReportSourceBundleHash: string;
  reportDefinitionId: string; reportDefinitionHash: string;
  reportPolicyId: string; reportPolicyHash: string;
  reportProjectionId: string; reportProjectionHash: string;
  completeness: ReportSnapshotCompleteness;
  disclosureHashes: string[];
  snapshotHash: string;
  createdAt: string;
};
// hash: REPORT_SNAPSHOT_V1
```

**Snapshot hash é semântico** — inclui tenant/kind/audience/
sourceBundleHash/definitionHash/policyHash/projectionHash/
completeness/disclosures; não inclui `reportRequestId`/`createdAt` —
dois requests podem reconhecer conteúdo semanticamente idêntico.
**Request replay nunca troca snapshot** — mesmo com snapshot
semanticamente idêntico já existente, o binding daquele request
continua pro mesmo bundle/snapshot resolvido inicialmente; não
re-resolve latest.

### Template e render

```typescript
type ReportRenderFormat = 'TEXT' | 'HTML' | 'IMAGE' | 'PDF' | 'CSV';

type ReportTemplateDefinition = {
  reportTemplateDefinitionId: string;
  tenantId: string;
  format: ReportRenderFormat;
  templateKey: string; templateVersion: string;
  localizedContentRefs?: Record<string, string>;
  templateHash: string;
  createdAt: string;
};
// hash: REPORT_TEMPLATE_DEFINITION_V1
// exemplo de placeholder: {{formattedMoney}}, {{localizedStatusLabel}}

type ReportRenderPolicy = {
  renderPolicyId: string;
  tenantId: string;
  policyKey: string; policyVersion: string;
  locale: string; timezone: string;
  numericFormatting: { preserveCanonicalValue: true; };
  canonicalFreeText: {
    allowInternalFullText: boolean;
    maxDisplayedCharacters?: number;
    truncationMode: 'NONE' | 'DISPLAY_ONLY_TRUNCATION';
  };
  narration: { llmNarrationAllowed: false; mode: 'STRUCTURED_TEMPLATE_ONLY'; };
  renderPolicyHash: string;
  createdAt: string;
};
// hash: REPORT_RENDER_POLICY_V1
```

**Truncamento não altera snapshot** — snapshot guarda texto completo;
render mostra primeiros N caracteres + `truncated=true`; novo template
pode mostrar tudo depois.

```typescript
type ReportRenderRequest = {
  reportRenderRequestId: string;
  tenantId: string;
  reportSnapshotId: string; reportSnapshotHash: string;
  format: ReportRenderFormat;
  templateKey: string; templateVersion: string;
  renderPolicyId: string; renderPolicyHash: string;
  renderRequestKey: string;
  requestHash: string;
  createdAt: string;
};
// hash: REPORT_RENDER_REQUEST_V1
```

**Idempotência**: UNIQUE `(tenantId, renderRequestKey)`. Mesma
key+hash → mesmo render; conflito → `REPORT_RENDER_REQUEST_REPLAY_CONFLICT`.

```typescript
type ReportCapabilityStatus = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED'
  | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';

type ReportRenderFormatCapability = {
  format: ReportRenderFormat;
  status: ReportCapabilityStatus;
  semanticDeterminism: ReportCapabilityStatus;
  binaryDeterminism: ReportCapabilityStatus;
  evidenceRefs: string[];
};

type ReportRenderCapabilities = {
  capabilitySnapshotId: string;
  tenantId: string;
  rendererKey: string; rendererVersion: string;
  formats: ReportRenderFormatCapability[];
  capabilitySnapshotHash: string;
  observedAt: string;
};
// hash: REPORT_RENDER_CAPABILITIES_V1
```

**Não mentir sobre PDF** — hoje `PDF runtime = NOT_IMPLEMENTED` até
implementarmos e testarmos; PDF bitwise determinismo também não é
assumido (distinguir `semanticRenderHash` de `contentBytesHash` se
ocorrer).

```typescript
type RenderedReportArtifact = {
  renderedReportArtifactId: string;
  tenantId: string;
  reportSnapshotId: string; reportSnapshotHash: string;
  templateId: string; templateHash: string;
  renderPolicyId: string; renderPolicyHash: string;
  format: ReportRenderFormat;
  locale: string; timezone: string;
  mimeType: string;
  semanticRenderHash: string;
  contentBytesHash: string;
  byteLength: number;
  materializationRef: string;
  rendererCapabilitySnapshotHash: string;
  artifactHash: string;
  createdAt: string;
};
// hash: RENDERED_REPORT_ARTIFACT_V1
```

**Delivery sempre usa esse artifact** — nunca
`DeliveryIntent → reportSnapshot → render na hora`; sempre
`DeliveryIntent → RenderedReportArtifact exato`.

### Delivery

```typescript
type ReportDeliveryMediaKind = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'LINK';
// não presume que PDF/document é suportado por Z-API.

type ReportDeliveryChannel = 'WHATSAPP' | 'EMAIL' | 'IN_APP' | 'OTHER';
// capacidade real decide o que existe no runtime.
```

**Opaque audience binding** — não coloca telefone/e-mail cru no
contrato central; usa `AudienceRecipientRef` → relacionamento
provider-specific, o dono real do relacionamento resolve o vínculo
canônico depois. Skill 21 não define secret/token.

```typescript
type ReportDeliveryPolicy = {
  deliveryPolicyId: string;
  tenantId: string;
  policyKey: string; policyVersion: string;
  audienceType: ReportAudienceType;
  allowedChannels: ReportDeliveryChannel[];
  allowedMediaKinds: ReportDeliveryMediaKind[];
  allowedRenderFormats: ReportRenderFormat[];
  completeness: {
    allowComplete: true;
    allowPartialBySource: boolean;
    allowPartialByPolicy: boolean;
  };
  hypotheses: {
    allowStructuredHypothesisStatus: boolean;
    allowCanonicalFreeText: false;
  };
  deliveryAuthorization: 'NO_EXTRA_APPROVAL' | 'EXPLICIT_APPROVAL_REQUIRED';
  policyHash: string;
  createdAt: string;
};
// hash: REPORT_DELIVERY_POLICY_V1
```

`allowCanonicalFreeText: false` literal na V1 — não existe delivery
externo contendo `assumptions`/`limitations` integrais.

```typescript
type ReportDeliveryMediaCapability = { mediaKind: ReportDeliveryMediaKind; status: ReportCapabilityStatus; };

// ReportDeliveryReceiptCapability é definido no bloco de fechamento
// (patch 3) como enum — ver "ACCEPTED_STATUS | SENT_STATUS | ..."
// mais abaixo; receiptCapabilities referencia esse enum, não um
// tipo objeto separado.

type ReportDeliveryCapabilities = {
  capabilitySnapshotId: string;
  tenantId: string;
  providerKey: string; deliveryProfileId: string;
  channel: ReportDeliveryChannel;
  media: ReportDeliveryMediaCapability[];
  providerIdempotencyKeySupport: ReportCapabilityStatus;
  receiptCapabilities: ReportDeliveryReceiptCapability[];
  capabilitySnapshotHash: string;
  observedAt: string;
};
// hash: REPORT_DELIVERY_CAPABILITIES_V1
```

**Z-API hoje**: `provider=Z_API`, `channel=WHATSAPP` — TEXT/IMAGE
capability potencialmente verificável no runtime; DOCUMENT
`UNVERIFIED` até teste real; PDF delivery não inferido. Sem inflar
capacidade.

```typescript
type ReportDeliveryIntent = {
  reportDeliveryIntentId: string;
  tenantId: string;
  deliveryRequestKey: string;
  renderedReportArtifactId: string; renderedReportArtifactHash: string;
  contentBytesHash: string;
  audience: ReportAudienceBindingRef;
  channel: ReportDeliveryChannel;
  requestedAt: string;
  requestHash: string;
  createdAt: string;
};
// hash: REPORT_DELIVERY_INTENT_V1
```

**Intent não conhece "latest"** — ausentes propositalmente:
`sourceSelection`/`latest`/`reportDefinitionKey` (tudo isso já
terminou antes).

**Idempotência**: UNIQUE `(tenantId, deliveryRequestKey)`. Mesma
key+hash → mesmo intent; mesma key+outro artifact/destination →
`REPORT_DELIVERY_INTENT_REPLAY_CONFLICT`. **Reenvio intencional**: se o
usuário quer reenviar o mesmo artifact ao mesmo recipient → novo
`deliveryRequestKey` (distingue retry técnico de novo envio de
negócio). **`providerDeliveryRequestKey`** permanece estável em todos
os retries técnicos — se o provider suporta idempotency key, o adapter
reutiliza essa key; se não, side-effect checkpoint da Skill 21 fica
obrigatório no bloco final.

```typescript
type ReportDeliveryReceiptStatus = 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'UNKNOWN';

type ReportDeliveryReceipt = {
  reportDeliveryReceiptId: string;
  reportDeliveryIntentId: string; reportDeliveryIntentHash: string;
  status: ReportDeliveryReceiptStatus;
  providerReference?: string;
  observedAt: string;
  receiptHash: string;
};
// hash: REPORT_DELIVERY_RECEIPT_V1
```

Cada receipt é uma observação imutável — múltiplos receipts não
precisam sobrescrever R1; uma projeção pode fornecer o latest state.
**`UNKNOWN` é fato importante** — se o side effect do provider pode ter
ocorrido mas não há confirmação, `UNKNOWN` (nunca `FAILED`, muito
menos retry cego); a state machine final fecha isso.

### Adapters

```typescript
interface ReportRenderAdapter {
  getCapabilities(): Promise<ReportRenderCapabilities>;
  render(input: {
    snapshot: ReportSnapshot;
    projection: ReportProjection;
    template: ReportTemplateDefinition;
    renderPolicy: ReportRenderPolicy;
    format: ReportRenderFormat;
  }): Promise<RenderedReportArtifact>;
}
// Skill21 conhece a interface, não a biblioteca específica de PDF.

interface ReportDeliveryAdapter {
  getCapabilities(profile: ReportDeliveryProfileRef): Promise<ReportDeliveryCapabilities>;
  submit(input: {
    intent: ReportDeliveryIntent;
    artifact: RenderedReportArtifact;
  }): Promise<ReportDeliveryReceipt>;
}
```

`ChannelConnector`/`OutgoingMessage` legacy da Concierge não são
reutilizados literalmente nos contratos canônicos da Skill 21 — o
adapter Z-API real por trás da interface pode reaproveitá-los na
implementação.

**Render e delivery capabilities são independentes** — ex.:
`PDF render=VERIFIED` mas `WhatsApp DOCUMENT delivery=UNVERIFIED` →
PDF pode existir, mas não pode ser enviado naquele canal ainda.
**TEXT fallback não é automático** — se PDF não é entregável, não faz
silenciosamente `PDF→texto` (muda o artifact enviado); precisa de
policy/request explícito para um render alternativo.

### Estado parcial/incompleto na apresentação

Se `PerformanceAnalysisResult=PARTIAL_SIGNAL_UNAVAILABLE`, o
projection/snapshot inclui o status — se a policy interna permite,
snapshot nasce com disclosure; se a policy bloqueia,
`REPORT_REQUIRED_SOURCE_INCOMPLETE` (futuramente blocked/domain). Em
experiment report, `source lifecycle state=CLOSED_UNEVALUABLE` vira
datum/status + disclosure, nunca muda pra `FAILED`.

### Formatos

- **PDF**: apenas outro `ReportRenderFormat`, nenhum privilégio
  analítico especial.
- **HTML**: precisa escapar `CANONICAL_FREE_TEXT` antes de renderizar;
  sanitização técnica não altera texto semântico.
- **IMAGE**: `semanticRenderHash` continua vinculado ao
  snapshot/template — nada de imagem criada por IA "resumindo" o
  report na V1.
- **TEXT**: provavelmente o formato inicial mais simples pra WhatsApp,
  mas só fica `VERIFIED` depois de teste runtime real.
- **CSV**: exportação tabular de campos já existentes, sem novas
  colunas/totals/averages geradas que não existem upstream.

### Hashes canônicos deste bloco (20)

```text
REPORT_REQUEST_V1
REPORT_SOURCE_SELECTION_V1
REPORT_MUTABLE_STATE_CAPTURE_V1
RESOLVED_REPORT_SOURCE_BUNDLE_V1
REPORT_DEFINITION_V1
REPORT_POLICY_V1
REPORT_POLICY_BINDING_RESOLUTION_V1
REPORT_SECTION_V1
REPORT_DISCLOSURE_V1
REPORT_PROJECTION_V1
REPORT_SNAPSHOT_V1
REPORT_TEMPLATE_DEFINITION_V1
REPORT_RENDER_POLICY_V1
REPORT_RENDER_REQUEST_V1
REPORT_RENDER_CAPABILITIES_V1
RENDERED_REPORT_ARTIFACT_V1
REPORT_DELIVERY_POLICY_V1
REPORT_DELIVERY_CAPABILITIES_V1
REPORT_DELIVERY_INTENT_V1
REPORT_DELIVERY_RECEIPT_V1
```

Tipos auxiliares (`ReportDatum`, `ReportRecord`, `ReportSourceFieldRef`,
`ReportAudienceBindingRef`, `ReportDeliveryProfileRef`) não recebem
hash próprio — entram nos hashes dos contratos-pai.

### Cadeias

```text
Materialização:
ReportRequest → ReportSourceSelection → ResolvedReportSourceBundle
  → ReportDefinition + ReportPolicy → ReportProjection → ReportSnapshot
  (até aqui: zero locale, zero PDF, zero WhatsApp)

Render:
ReportSnapshot + ReportTemplateDefinition + ReportRenderPolicy
  + RenderCapabilities → ReportRenderRequest → RenderedReportArtifact

Entrega:
RenderedReportArtifact + AudienceBinding + DeliveryProfile + DeliveryPolicy
  + DeliveryCapabilities → ReportDeliveryIntent → ReportDeliveryAdapter
  → ReportDeliveryReceipt[]
```

### Idempotência em três níveis independentes

1. **Materialização**: `reportRequestKey`
2. **Render**: `renderRequestKey`
3. **Entrega**: `deliveryRequestKey`

Retry em um nível nunca cria automaticamente uma nova identidade no
outro. `PerformanceAnalysisResult` novo não altera
`ResolvedReportSourceBundle`/`ReportProjection`/`ReportSnapshot`/
`RenderedReportArtifact`/`DeliveryIntent` antigos — dado novo exige
nova resolução (nunca reescreve artefatos anteriores).

### Três barreiras estruturais contra hipótese virar fato

```text
ReportPolicy.canonicalAttributionPromotionAllowed = false
externalCanonicalFreeTextAllowed = false
LLM narration = false
```

Além dos bloqueios já existentes nas Skills 19/20.

**Barreiras contra análise escondida** (explícito no SPEC):
`ReportCanonicalValue` não possui `COMPUTED`; `ReportSourceFieldRef`
sempre aponta pra field canônico; `ReportProjection` não possui
formula/expression; `ReportTemplateDefinition` não possui business
formula. Isso bloqueia estruturalmente grande parte do risco.

### Cinco invariantes de fechamento deste bloco (ChatGPT)

1. Uma fonte mutável só entra em relatório depois de ser capturada em
   uma versão exata; a Skill 21 nunca finge que lifecycle mutável
   possui hash imutável upstream.
2. `ReportSnapshot` representa conteúdo semântico congelado e
   independente de formato. Locale, template, truncamento e aparência
   pertencem exclusivamente ao render.
3. Todo datum apresentado possui lineage até campos canônicos exatos;
   a Skill 21 não possui um tipo de valor "computado pelo relatório".
4. Delivery sempre referencia bytes exatos de um `RenderedReportArtifact`.
   "Latest", resolução de fonte e renderização já terminaram antes do
   primeiro side effect externo.
5. Materialização, renderização e entrega possuem identidades/
   idempotências independentes; retry em qualquer camada reutiliza o
   mesmo artefato daquela camada em vez de recalcular ou reenviar
   conteúdo diferente.

## Fechamento (rodada 3 — debate com ChatGPT, 2026-09-18)

Três patches compatíveis no bloco central antes das state machines:

**Patch 1 — resolução exata de `ReportDefinition`**: `ReportRequest`
carregava só `reportDefinitionKey`, mas a definição também precisa ser
congelada exatamente (se a definição mudar durante o processamento,
o mesmo `reportRequestKey` não pode produzir outro documento):

```typescript
type ReportDefinitionBinding = {
  tenantId: string; reportKind: ReportKind; definitionKey: string;
  activeDefinitionId: string; activeDefinitionVersion: string;
  updatedAt: string;
}; // mutável

// ReportRequest ganha:
resolvedDefinition: { definitionId: string; definitionVersion: string; definitionHash: string; bindingResolutionHash: string; };
resolvedPolicy: { policyId: string; policyVersion: string; policySnapshotHash: string; bindingResolutionHash: string; };
```
Hash: `REPORT_DEFINITION_BINDING_RESOLUTION_V1`. Mesmo
`reportRequestKey` → mesma definição → mesma policy, mesmo que os
bindings ativos mudem depois.

**Patch 2 — checkpoint de resolução de fonte**: precisamos persistir
cada decisão individual antes do bundle final — senão um crash depois
de resolver `LATEST_APPROVED` poderia voltar e escolher um "latest"
diferente.

```typescript
type ReportSourceResolutionCheckpoint = {
  checkpointId: string;
  tenantId: string;
  reportRequestKey: string;
  selectionEntryHash: string;
  resolvedSourceRef: ResolvedReportSourceRef;
  status: 'RESOLVED' | 'CAPTURED';
  resolutionHash: string;
  resolvedAt: string;
};
// hash: REPORT_SOURCE_RESOLUTION_CHECKPOINT_V1
```

**Idempotência**: UNIQUE `(tenantId, reportRequestKey, selectionEntryHash)`.
Replay: checkpoint existe e bate → reutiliza; nunca executa
`LATEST_APPROVED` de novo para aquela entrada. Se A e B já resolvidos e
crash antes de C: retry resolve só C — mesmo que artifact mais recente
tenha surgido pra A/B, permanecem congelados. Mesma regra pra mutable
state (`CURRENT_VERSION_CAPTURE` produz `C1`; replay não recaptura
`C2` mais recente pro mesmo request).

**Patch 3 — capability de retry seguro de delivery**: capability de
idempotency key no provider não significa automaticamente que reenviar
a mesma key após timeout é comprovadamente seguro — precisa ser
capability própria.

```typescript
type ReportDeliveryReceiptCapability = 'ACCEPTED_STATUS' | 'SENT_STATUS'
  | 'DELIVERED_STATUS' | 'FAILED_STATUS' | 'LOOKUP_BY_PROVIDER_ID'
  | 'LOOKUP_BY_IDEMPOTENCY_KEY';

// ReportDeliveryCapabilities ganha:
providerIdempotencyKeySupport: ReportCapabilityStatus;
sameIdempotencyKeyRetrySafety: ReportCapabilityStatus;
```

### Materialização (state machine)

```typescript
type ReportMaterializationRunState = 'PREPARED' | 'RESOLVING_INPUTS'
  | 'SOURCES_FROZEN' | 'PROJECTING' | 'SNAPSHOT_MATERIALIZED'
  | 'COMPLETED' | 'CANCELLED';

type ReportMaterializationRun = {
  reportMaterializationRunId: string;
  tenantId: string; runId: string; jobId: string; attemptNumber: number;
  reportRequestKey: string; reportRequestHash: string;
  definitionHash: string; policyHash: string; sourceSelectionHash: string;
  runContextHash: string;
  state: ReportMaterializationRunState;
  resolvedSourceBundleId?: string; resolvedSourceBundleHash?: string;
  reportProjectionId?: string; reportProjectionHash?: string;
  reportSnapshotId?: string; reportSnapshotHash?: string;
  createdAt: string; updatedAt: string;
}; // mutável
// hash imutável REPORT_MATERIALIZATION_RUN_CONTEXT_V1 sobre
// reportRequestKey + reportRequestHash + definitionHash + policyHash + sourceSelectionHash.
```

**`SOURCES_FROZEN` é fronteira** — depois dela, Skill 21 nunca
reconsulta latest, recaptura lifecycle, substitui source ou adiciona
artifact novo. Projection e snapshot trabalham exclusivamente no
bundle congelado. **Source bundle só nasce quando resolução está
completa** — todos os entries requeridos precisam ter checkpoint
válido; depois: checkpoints → `ResolvedReportSourceBundle` →
`SOURCES_FROZEN`. **Source parcial**: se uma source requerida não
existe, `ReportPolicy.partialSources.behavior` decide `BLOCK` ou
`ALLOW_AND_DISCLOSE`; `BLOCK_MATERIALIZATION` não é erro fatal, é
resultado de domínio `REPORT_MATERIALIZATION_BLOCKED_INCOMPLETE_SOURCE`.
**Idempotência do snapshot**: mesmo bundleHash+definitionHash+policyHash
+sourceBundleHash → mesmo snapshot semântico; novo source data não
entra. **Cancelamento**: antes de `SNAPSHOT_MATERIALIZED` pode levar a
`CANCELLED` (checkpoints/captures já materializados podem permanecer
pra auditoria, não usados como relatório final); depois de
`SNAPSHOT_MATERIALIZED` o snapshot continua imutável — não apagamos a
evidência já criada, só impedimos etapas seguintes automáticas.

### Render (state machine)

```typescript
type ReportRenderRunState = 'PREPARED' | 'VALIDATING_CAPABILITY'
  | 'RENDERING' | 'OUTPUT_CAPTURED' | 'ARTIFACT_MATERIALIZED'
  | 'COMPLETED' | 'CANCELLED';

type ReportRenderRun = {
  reportRenderRunId: string;
  tenantId: string; runId: string; jobId: string; attemptNumber: number;
  renderRequestKey: string; renderRequestHash: string;
  reportSnapshotHash: string; templateHash: string; renderPolicyHash: string;
  format: ReportRenderFormat;
  state: ReportRenderRunState;
  runContextHash: string;
  createdAt: string; updatedAt: string;
}; // mutável
// hash imutável REPORT_RENDER_RUN_CONTEXT_V1

type ReportRenderOutputCapture = {
  reportRenderOutputCaptureId: string;
  tenantId: string;
  renderRequestKey: string; renderRequestHash: string;
  semanticRenderHash: string;
  contentBytesHash: string; byteLength: number;
  mimeType: string;
  materializationRef: string;
  rendererCapabilitySnapshotHash: string;
  capturedAt: string;
  captureHash: string;
};
// hash: REPORT_RENDER_OUTPUT_CAPTURE_V1
```

**Por que o capture é necessário**: imagine PDF engine que injeta
metadata variável — primeira execução produz `semanticRenderHash=S`,
`contentBytesHash=B1`; processo cai antes de terminar o artifact; sem
capture, replay poderia produzir `B2` diferente e perderíamos qual
conjunto de bytes pertencia à execução original. Com capture, `B1`
permanece autoridade daquela execução. Depois de `OUTPUT_CAPTURED`,
retry usa exatamente os bytes capturados, nunca rerenderiza.
Materialização de `RenderedReportArtifact` depois do capture é só
persistir metadata canônica; retry após `ARTIFACT_MATERIALIZED`
devolve o mesmo artifact.

### Delivery approval

`ReportDeliveryPolicy.deliveryAuthorization = NOT_REQUIRED |
EXPLICIT_APPROVAL_REQUIRED`. Se explícita, **Skill 03 continua sendo a
autoridade** — Skill 21 não cria segunda engine de approval.

```typescript
type ReportDeliveryApprovalSubject = {
  tenantId: string;
  reportDeliveryIntentId: string; reportDeliveryIntentHash: string;
  renderedReportArtifactId: string; renderedReportArtifactHash: string;
  contentBytesHash: string;
  audienceBindingHash: string; deliveryProfileHash: string;
  channel: ReportDeliveryChannel; mediaKind: ReportDeliveryMediaKind;
  deliveryPolicySnapshotHash: string;
  subjectHash: string;
};
// se qualquer item mudar, approval anterior não serve.

type ReportDeliveryAuthorization =
  | { mode: 'NOT_REQUIRED'; deliveryPolicySnapshotHash: string; authorizationHash: string; }
  | { mode: 'SKILL03_APPROVED'; approvalSubjectHash: string; approvalRequestId: string; approvedAt: string; authorizationHash: string; };
```

Approval pending: estado operacional `WAITING_APPROVAL`, sem provider
call. Approval rejeitada não é `FAILED` — é resultado de negócio
`DELIVERY_NOT_AUTHORIZED`, nenhum side effect ocorre.

### Side-effect safety da entrega

```typescript
type ReportDeliveryExternalEffectState = 'NOT_SUBMITTED' | 'SUBMITTING'
  | 'CONFIRMED' | 'NO_SIDE_EFFECT' | 'UNKNOWN';

type ReportDeliveryRunState = 'PREPARED' | 'VALIDATING' | 'WAITING_APPROVAL'
  | 'READY_TO_SUBMIT' | 'SUBMITTING' | 'RECONCILING' | 'HELD_EXTERNAL_UNKNOWN'
  | 'COMPLETED' | 'CANCEL_REQUESTED' | 'CANCELLED';

type ReportDeliveryRun = {
  reportDeliveryRunId: string;
  tenantId: string; runId: string; jobId: string; attemptNumber: number;
  deliveryRequestKey: string; deliveryIntentHash: string;
  renderedReportArtifactHash: string; contentBytesHash: string;
  // ... state, timestamps
};
// hash imutável REPORT_DELIVERY_RUN_CONTEXT_V1

type ReportDeliveryCheckpoint = {
  reportDeliveryCheckpointId: string;
  tenantId: string;
  reportDeliveryIntentId: string; reportDeliveryIntentHash: string;
  submissionSequence: number;
  providerDeliveryRequestKey: string;
  renderedReportArtifactHash: string; contentBytesHash: string;
  audienceBindingHash: string; deliveryProfileHash: string;
  deliveryCapabilitySnapshotHash: string; authorizationHash: string;
  checkpointHash: string;
  createdAt: string;
};
// hash: REPORT_DELIVERY_CHECKPOINT_V1 — persistido antes da rede.
```

**`providerDeliveryRequestKey` nunca muda em retry técnico** — mesmo
`ReportDeliveryIntent` → mesma key em todos os retries técnicos; novo
reenvio intencional → novo `deliveryRequestKey` → novo `DeliveryIntent`
→ nova `providerDeliveryRequestKey`. **`submissionSequence`** começa em
1, só incrementa quando uma nova chamada de rede realmente ocorre.
**Sucesso confirmado**: quando o provider confirma explicitamente pela
capability, `externalEffectState=CONFIRMED` e persiste
`ReportDeliveryReceipt` — `CONFIRMED` não significa necessariamente
`DELIVERED` (pode só significar "provider aceitou a mensagem"; receipts
futuras trazem `SENT`/`DELIVERED`/`FAILED`, lifecycle do provider, não
nova entrega). **Timeout ambíguo**: se não conseguimos provar envio nem
ausência de side effect, `externalEffectState=UNKNOWN` +
`state=HELD_EXTERNAL_UNKNOWN` — `UNKNOWN` nunca vira `FAILED` por
conveniência, nem `NO_SIDE_EFFECT` por timeout; permanece incerto até
evidência.

**Reconciliação (ordem V1)**: 1) `providerMessageId` conhecido +
`LOOKUP_BY_PROVIDER_ID=VERIFIED` → lookup; 2) idempotency key +
`LOOKUP_BY_IDEMPOTENCY_KEY=VERIFIED` → lookup; 3)
`sameIdempotencyKeyRetrySafety=VERIFIED` → pode submeter de novo com a
mesma key; 4) nenhuma opção segura → permanece `HELD_EXTERNAL_UNKNOWN`.
`NO_SIDE_EFFECT` só quando há prova suficiente de que o envio externo
não ocorreu (aí retry pode ser autorizado conforme policy/capability).
Provider failover em `UNKNOWN` é proibido. Receipts são append-only —
`ACCEPTED` permanece imutável após `SENT`; `SENT`/`DELIVERED` produzem
novos receipts, nunca overwrite.

**Cancelamento**: antes de submit (`NOT_SUBMITTED`) → `CANCELLED` sem
provider call. Em `SUBMITTING` → `CANCEL_REQUESTED`, mas seguimos
reconciliando o efeito externo (não fingimos que cancelamos). Em
`UNKNOWN` → mesma regra, incerteza precisa ser resolvida ou permanece
`HELD_EXTERNAL_UNKNOWN` (não apagamos incerteza com `CANCELLED`). Após
`CONFIRMED` → não desfaz a mensagem (Skill 21 V1 não tem "delete
WhatsApp message"/"recall email" como compensação).

### Scheduling de relatórios

```typescript
type ReportScheduleTrigger =
  | { mode: 'FIXED_INTERVAL'; intervalMs: number; }
  | { mode: 'CRON'; expression: string; timezone: string; }
  | { mode: 'RRULE'; expression: string; timezone: string; };

type ReportScheduleDefinition = {
  reportScheduleDefinitionId: string;
  tenantId: string;
  trigger: ReportScheduleTrigger;
  missedSlotBehavior: 'RUN_LATE_ONCE' | 'SKIP';
  requestTemplate: {
    reportKind: ReportKind; audienceType: ReportAudienceType;
    reportDefinitionKey: string; reportPolicyKey: string;
    sourceSelection: ReportSourceSelection;
  };
  renderTemplate?: { templateId: string; templateHash: string; renderPolicyId: string; renderPolicyHash: string; format: ReportRenderFormat; };
  deliveryTemplate?: {
    audience: ReportAudienceBindingRef;
    deliveryProfile: ReportDeliveryProfileRef;
    deliveryPolicyId: string; deliveryPolicyHash: string;
    channel: ReportDeliveryChannel; mediaKind: ReportDeliveryMediaKind;
  };
  scheduleHash: string;
  createdAt: string;
};
// hash: REPORT_SCHEDULE_DEFINITION_V1
```

**Schedule não congela latest antecipadamente** — congela a instrução
de seleção; cada slot futuro cria `ReportRequest` novo e naquele
momento a fonte é resolvida normalmente.

```typescript
type ReportScheduleSlot = {
  reportScheduleSlotId: string;
  tenantId: string;
  reportScheduleDefinitionId: string; reportScheduleDefinitionHash: string;
  slotKey: string;
  scheduledFor: string;
  derivedReportRequestKey: string;
  derivedRenderRequestKey?: string; derivedDeliveryRequestKey?: string;
  slotHash: string;
  createdAt: string;
};
// hash: REPORT_SCHEDULE_SLOT_V1
```

**Idempotência do slot**: UNIQUE `(tenantId, scheduleKey, slotKey)` —
dois cron workers vendo o mesmo horário produzem um único slot lógico.
**Chaves derivadas são determinísticas** — de `scheduleHash+slotKey`
derivam `reportRequestKey`/`renderRequestKey`/`deliveryRequestKey`;
retry do scheduler não cria um segundo envio de negócio. **Approval em
schedule**: se a delivery policy exige aprovação explícita, o slot pode
materializar/renderizar e parar em `WAITING_APPROVAL` — scheduling
nunca bypassa Skill 03. **Missed slots**: `RUN_LATE_ONCE` cria o slot
vencido uma vez quando o scheduler volta; `SKIP` não inventa relatório
retroativo (sem default escondido). Jobs das três operações
(materialization/render/delivery) continuam sujeitos aos mecanismos de
Job/cancelamento da Skill 02 — Skill 21 não edita Job state
diretamente.

### Erros

**FATAL_ERROR (43):**

```text
REPORT_TENANT_MISMATCH
REPORT_CROSS_TENANT_SOURCE
REPORT_REQUEST_HASH_MISMATCH
REPORT_REQUEST_REPLAY_CONFLICT
REPORT_DEFINITION_HASH_MISMATCH
INVALID_REPORT_DEFINITION
REPORT_POLICY_HASH_MISMATCH
INVALID_REPORT_POLICY
REPORT_SOURCE_SELECTION_HASH_MISMATCH
REPORT_SOURCE_RESOLUTION_REPLAY_CONFLICT
REPORT_SOURCE_ROLE_CONFLICT
REPORT_SOURCE_LINEAGE_MISMATCH
REPORT_MUTABLE_STATE_CAPTURE_REPLAY_CONFLICT
REPORT_RESOLVED_BUNDLE_REPLAY_CONFLICT
REPORT_PROJECTION_SOURCE_INTEGRITY_VIOLATION
REPORT_PROJECTION_ANALYSIS_ATTEMPT
REPORT_SECTION_REPLAY_CONFLICT
REPORT_DISCLOSURE_REPLAY_CONFLICT
REPORT_SNAPSHOT_REPLAY_CONFLICT
REPORT_TEMPLATE_HASH_MISMATCH
INVALID_REPORT_TEMPLATE
REPORT_RENDER_POLICY_HASH_MISMATCH
INVALID_REPORT_RENDER_POLICY
REPORT_RENDER_REQUEST_REPLAY_CONFLICT
REPORT_RENDER_OUTPUT_REPLAY_CONFLICT
REPORT_RENDER_ARTIFACT_REPLAY_CONFLICT
REPORT_DELIVERY_POLICY_HASH_MISMATCH
INVALID_REPORT_DELIVERY_POLICY
REPORT_DELIVERY_INTENT_REPLAY_CONFLICT
REPORT_DELIVERY_CHECKPOINT_CONFLICT
REPORT_DELIVERY_RECEIPT_REPLAY_CONFLICT
REPORT_DELIVERY_APPROVAL_SUBJECT_MISMATCH
REPORT_DELIVERY_AUTHORIZATION_REPLAY_CONFLICT
REPORT_DELIVERY_EXTERNAL_EFFECT_INTEGRITY_VIOLATION
REPORT_UNSAFE_DELIVERY_RETRY_ATTEMPT
REPORT_SCHEDULE_DEFINITION_HASH_MISMATCH
INVALID_REPORT_SCHEDULE_DEFINITION
REPORT_SCHEDULE_SLOT_REPLAY_CONFLICT
REPORT_INVALID_STATE_TRANSITION
REPORT_LLM_NARRATION_ATTEMPT
REPORT_HEURISTIC_PROMOTION_ATTEMPT
REPORT_EXTERNAL_FREE_TEXT_LEAK_ATTEMPT
REPORT_RAW_SOURCE_QUERY_ATTEMPT
```

**RETRYABLE_ERROR (13):**

```text
REPORT_SOURCE_LOOKUP_TRANSIENT_ERROR
REPORT_MUTABLE_STATE_CAPTURE_TRANSIENT_ERROR
REPORT_SOURCE_BUNDLE_PERSISTENCE_TRANSIENT_ERROR
REPORT_PROJECTION_PERSISTENCE_TRANSIENT_ERROR
REPORT_SNAPSHOT_PERSISTENCE_TRANSIENT_ERROR
REPORT_RENDER_TRANSIENT_ERROR
REPORT_RENDER_OUTPUT_PERSISTENCE_TRANSIENT_ERROR
REPORT_RENDER_ARTIFACT_PERSISTENCE_TRANSIENT_ERROR
REPORT_DELIVERY_PRE_SUBMIT_TRANSIENT_ERROR
REPORT_DELIVERY_RECONCILIATION_TRANSIENT_ERROR
REPORT_DELIVERY_RECEIPT_PERSISTENCE_TRANSIENT_ERROR
REPORT_SCHEDULE_PERSISTENCE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Uma falha de rede depois de iniciar o submit não entra
automaticamente em `REPORT_DELIVERY_PRE_SUBMIT_TRANSIENT_ERROR` — pode
ser `UNKNOWN`.

**BLOCKED:**

```text
REPORT_DEFINITION_NOT_CONFIGURED       → POLICY_BLOCKED
REPORT_POLICY_NOT_CONFIGURED           → POLICY_BLOCKED
REPORT_TEMPLATE_NOT_CONFIGURED         → POLICY_BLOCKED
REPORT_RENDER_POLICY_NOT_CONFIGURED    → POLICY_BLOCKED
REPORT_DELIVERY_POLICY_NOT_CONFIGURED  → POLICY_BLOCKED
REPORT_REQUIRED_SOURCE_UNAVAILABLE     → DATA_BLOCKED
REPORT_REQUIRED_SOURCE_PARTIAL         → DATA_BLOCKED
AMBIGUOUS_LATEST_REPORT_SOURCE         → DATA_BLOCKED
REPORT_MUTABLE_STATE_CAPTURE_UNAVAILABLE → DATA_BLOCKED
REPORT_RENDERER_NOT_CONFIGURED         → POLICY_BLOCKED
REPORT_RENDER_FORMAT_NOT_IMPLEMENTED   → CAPABILITY_BLOCKED
REPORT_RENDER_CAPABILITY_UNVERIFIED (quando policy exige VERIFIED) → CAPABILITY_BLOCKED
REPORT_AUDIENCE_BINDING_UNAVAILABLE    → DATA_BLOCKED
REPORT_DELIVERY_PROFILE_UNAVAILABLE    → DATA_BLOCKED
REPORT_DELIVERY_MEDIA_UNSUPPORTED      → CAPABILITY_BLOCKED
REPORT_DELIVERY_CAPABILITY_UNVERIFIED  → CAPABILITY_BLOCKED
REPORT_EXTERNAL_PARTIAL_BLOCKED_BY_POLICY → POLICY_BLOCKED
```

**Resultados de domínio, não erros:**

```text
REPORT_ALREADY_MATERIALIZED
REPORT_PARTIAL_MATERIALIZED
WAITING_APPROVAL
DELIVERY_NOT_AUTHORIZED
HELD_EXTERNAL_UNKNOWN
```

`HELD_EXTERNAL_UNKNOWN` deve ser visível operacionalmente — nunca fica
escondido como "falha temporária", porque o operador pode decidir
investigar antes de qualquer reenvio manual.

### Multi-tenant

Para execução normal: `trustedTenantId = Job.tenantId`. Para schedule:
`Job.tenantId = ReportScheduleDefinition.tenantId`. Fontes tenant-scoped
que precisam corresponder: `PerformanceAnalysisResult`/`MetricSnapshot`/
`SocialPublicationBinding`/`CreativeVariationExperiment`/
`ExperimentEvaluationBinding`/`VariantPublicationBinding`/lifecycle
captures/`ReportDefinition`/`ReportPolicy`/`ReportProjection`/
`ReportSnapshot`/`RenderedReportArtifact`/`AudienceBinding`/
`DeliveryProfile`/`DeliveryPolicy`/`DeliveryIntent`. **Audience externo
cross-tenant**: mesmo que um `audienceBindingId` exista no tenant A,
não pode usar binding do tenant B → `REPORT_TENANT_MISMATCH` (nunca
resolve destinatário por ID global). Delivery profile também é
tenant-scoped mesmo com provider físico compartilhado. IDs externos
nunca são chave global. Resolução sempre determinística: tenant +
scope + source kind + resolution profile.

### Observabilidade

**Materialization**: `tenantId`, `reportRequestKey`, `reportKind`,
`audienceType`, `definitionHash`/`policyHash`/`sourceSelectionHash`,
`materializationState`, `sourceEntryCount`/`resolvedSourceCount`/
`mutableCaptureCount`/`partialSourceCount`, `resolvedSourceBundleHash?`,
`projectionHash?`/`snapshotHash?`/`snapshotCompleteness?`, `durationMs`,
`errorCode?`. **Render**: `renderRequestKey`, `snapshotHash`/
`templateHash`/`renderPolicyHash`, `format`/`locale`/`timezone`,
`rendererKey`/`rendererVersion`/`capabilitySnapshotHash`, `renderState`,
`semanticRenderHash?`/`contentBytesHash?`/`byteLength?`, `durationMs`,
`errorCode?`. **Delivery**: `deliveryRequestKey`, `renderedArtifactHash`/
`contentBytesHash`, `channel`/`mediaKind`, `deliveryPolicyHash`/
`capabilitySnapshotHash`, `approvalMode`/`approvalStatus`,
`deliveryRunState`/`externalEffectState`, `submissionSequence`,
`providerMessageIdPresent`, `latestReceiptStatus`, `durationMs`,
`errorCode?`.

**Nunca logar**: providerMessageId cru, raw provider delivery payload,
raw `PerformanceAnalysisResult` integral, telefone/e-mail/secrets/free
text completo.

Audit events: `ReportRequest created`, `latest source resolved`,
`mutable state captured`, `source bundle frozen`,
`ReportProjection materialized`, `ReportSnapshot materialized`,
`partial report materialized`, `report materialization blocked`,
`render started`/`render output captured`/`RenderedReportArtifact
materialized`, `delivery approval requested`/`approved`/`rejected`,
`delivery checkpoint persisted`, `external submit started`,
`delivery confirmed`/`became UNKNOWN`, `delivery reconciliation
attempted`, `delivery held external unknown`, `schedule slot
created`/`disabled`, `LLM narration attempt blocked`,
`heuristic promotion attempt blocked`, `external free-text leak
blocked`, `raw-source analytics attempt blocked`, `cross-tenant
attempt blocked`.

Métricas operacionais: `report_materialization_run_total`,
`report_snapshot_created_total`, `report_partial_snapshot_total`,
`report_source_resolution_total`, `report_mutable_state_capture_total`,
e demais por fase (render/delivery/schedule). **Sem** métricas
analíticas novas disfarçadas — nunca `average_score_from_reports`/
`report_conversion_rate`/`best_hook_from_reports` (seriam analytics da
Skill 19 disfarçadas).

### Plano de testes — 100 casos críticos, 10 blocos

1–10 Request/definition/policy: `ReportRequest` válido congela
definição exata; mesmo requestKey+hash reutiliza request; diferente →
fatal; mudança de definition/policy binding depois não altera request
antigo; definition/policy hash divergente → fatal; LLM narration e
`externalCanonicalFreeTextAllowed` continuam false; raw table/provider
query não é fonte válida.

11–20 Source resolution/replay: `EXACT_IMMUTABLE` resolve ID/hash
exatos; `LATEST_APPROVED` resolve uma única vez; replay reutiliza
checkpoint; artifact mais recente após checkpoint não substitui
source; `CURRENT_VERSION_CAPTURE` materializa versão exata; replay não
recaptura lifecycle mais novo; sourceRole duplicado conflitante →
fatal; ambiguous latest → blocked; todos checkpoints válidos produzem
bundle; `SOURCES_FROZEN` impede nova resolução.

21–30 Projection/snapshot: todo `ReportDatum` possui sourceRefs;
`ReportCanonicalValue` não possui `COMPUTED`; copiar score canônico é
válido; tentar calcular delta/ranking → fatal; missing source nunca
vira zero; `POLICY_HIDDEN ≠ SOURCE_UNAVAILABLE`; partial permitido
produz disclosure; snapshot semanticamente idêntico reutiliza
identidade; novo source result não altera snapshot antigo.

31–40 Hypothesis/free text: hipótese interna pode aparecer
estruturada; `FULL_INTERNAL_TEXT` exige audience interna/policy;
assumptions internas preservam source lineage; external report não
contém canonical free text; structured hypothesis external só com
policy explícita; heuristic nunca vira atribuição confirmada; template
não usa linguagem causal indevida; truncamento é display-only e não
altera snapshot; tentativa de leak de free text externo → fatal.

41–50 Render: render usa snapshot exato; locale não altera
snapshotHash; template V2 gera novo artifact sem novo snapshot;
renderPolicy diferente gera novo render; capability
`NOT_IMPLEMENTED` bloqueia formato; crash antes/depois de
`OUTPUT_CAPTURED` reutiliza bytes capturados sem rerenderizar;
`semanticRenderHash` pode permanecer igual com bytes hash distinto
entre requests; mesmo render request não troca bytes após capture;
render cancelado antes do capture não cria artifact final.

51–60 Delivery preparation/approval: `DeliveryIntent` aponta pra
`RenderedReportArtifact` exato, nunca latest; mesmo
deliveryRequestKey+intent reutiliza; mesma key+artifact diferente →
fatal; `NO_EXTRA_APPROVAL` segue sem Skill 03; approval required entra
`WAITING_APPROVAL`; approval subject contém artifact/content/audience
exatos; aprovação de artifact diferente não é reutilizada; approval
rejeitada não chama provider; schedule nunca bypassa approval.

61–70 Side-effect safety: checkpoint persistido antes da network call;
`providerDeliveryRequestKey` estável em retry; confirmação confiável →
`CONFIRMED`; timeout ambíguo → `UNKNOWN`; `UNKNOWN` não vira `FAILED`
automaticamente; `FAILED` receipt não prova `NO_SIDE_EFFECT`; lookup
por provider ID/idempotency key só com capability `VERIFIED`; resubmit
mesma key exige `sameIdempotencyKeyRetrySafety=VERIFIED`; `UNKNOWN` sem
reconciliação segura permanece `HELD_EXTERNAL_UNKNOWN`.

71–80 Receipts/cancelamento de delivery: `NO_SIDE_EFFECT` comprovado
pode autorizar nova submission sequence; provider failover em
`UNKNOWN` é proibido; receipt `ACCEPTED` permanece imutável após
`SENT`; `SENT`/`DELIVERED` produzem novo receipt, nunca overwrite;
cancelamento antes do submit → `CANCELLED`; em `SUBMITTING` não afirma
ausência de envio; em `UNKNOWN` preserva incerteza; `CONFIRMED` não é
desfeito por cancelamento; reenvio intencional exige novo
`deliveryRequestKey`.

81–90 Scheduling: slot deriva chaves determinísticas; dois schedulers
produzem um único slot lógico; cada slot cria novo `ReportRequest`;
latest resolvido no slot, não na criação da schedule; schedule
template pinned não muda silenciosamente; `RUN_LATE_ONCE` cria slot
atrasado uma vez; `SKIP` não cria relatório retroativo; schedule
disabled não cria slots futuros; desabilitar não apaga slots antigos;
approval required continua válido pra delivery agendado.

91–100 Multi-tenant/observabilidade/boundaries: `Job.tenantId` governa
materialização; source/audience binding/delivery profile de outro
tenant → fatal; schedule tenant precisa bater com Job tenant; logs não
expõem telefone/e-mail/secrets/free text; high-cardinality IDs não
viram labels de métrica; AuditEvents cobrem plan commit/orchestration/
evaluation/cancellation; materialização/render/delivery permanecem três
identidades independentes; **Skill 21 nunca recalcula análise, eleva
evidência ou consulta raw provider/tables para inventar conclusão.**

### Hashes novos deste bloco (10)

```text
REPORT_DEFINITION_BINDING_RESOLUTION_V1
REPORT_SOURCE_RESOLUTION_CHECKPOINT_V1
REPORT_MATERIALIZATION_RUN_CONTEXT_V1
REPORT_RENDER_RUN_CONTEXT_V1
REPORT_RENDER_OUTPUT_CAPTURE_V1
REPORT_DELIVERY_AUTHORIZATION_V1
REPORT_DELIVERY_CHECKPOINT_V1
REPORT_DELIVERY_RUN_CONTEXT_V1
REPORT_SCHEDULE_DEFINITION_V1
REPORT_SCHEDULE_SLOT_V1
```

Total: 20 anteriores + 10 finais = **30 hashes canônicos**. Não
recebem hash integral por serem mutáveis: `ReportDefinitionBinding`,
`ReportMaterializationRun`, `ReportRenderRun`, `ReportDeliveryRun`,
`ReportScheduleRuntimeState`.

### Cadeia operacional completa

```text
ReportRequest → source checkpoints → ResolvedReportSourceBundle
  → SOURCES_FROZEN → ReportProjection → ReportSnapshot
  → ReportRenderRequest → ReportRenderOutputCapture → RenderedReportArtifact
  → ReportDeliveryIntent → approval?
      required → Skill03
      não → segue
  → ReportDeliveryCheckpoint → SUBMITTING → provider
  → CONFIRMED / NO_SIDE_EFFECT / UNKNOWN
```

Scheduling: `ReportScheduleDefinition → slot vencido → ReportScheduleSlot
→ novo ReportRequest → mesma cadeia normal`. Não existe pipeline
paralela de reporting agendado.

### Cinco garantias operacionais finais (ChatGPT)

1. Cada decisão de source resolution possui checkpoint próprio. Depois
   que uma fonte foi resolvida para um request, nem `latest` nem
   estado mutável podem mudar aquela decisão durante replay.
2. Renderização possui sua própria fronteira durável: depois que os
   bytes foram capturados, retry reutiliza aqueles bytes mesmo que o
   renderer pudesse produzir outro arquivo semanticamente equivalente.
3. Delivery usa checkpoint pré-network e modela explicitamente
   `UNKNOWN`. Ausência de resposta nunca autoriza duplicação
   automática; qualquer reenvio após incerteza exige capacidade de
   reconciliação ou segurança idempotente comprovada.
4. Scheduling cria requests novos por slot e reutiliza exatamente as
   mesmas state machines de materialização, render e delivery;
   agendamento nunca ganha privilégios especiais sobre approval,
   tenant ou side-effect safety.
5. Materialização, renderização, entrega e scheduling permanecem
   auditáveis e independentes, enquanto a Skill 21 continua sem
   autorização para realizar qualquer cálculo analítico que pertença
   às Skills 18/19.

## Auditoria real do repositório (2026-09-18)

- **UI de admin/relatórios já existe, mas com padrão incompatível.**
  `src/app/admin/` tem `analytics/page.tsx`, `comparacoes/page.tsx`,
  `produtos/page.tsx`, `mais/page.tsx` — todos consumindo
  `src/lib/admin/stats.ts` (`getOverviewStats`, `getAttentionSummary`,
  `getProductHealthStats`, `getComparisonStats`, `getAnalyticsStats`,
  `getDailyTrend`, `getRevenueStats`). São **queries diretas ao
  Supabase sobre tabelas operacionais cruas** (`page_views`,
  `click_events`, `search_events`, `site_catalog`, `link_checks`,
  `product_groups`) + chamada Shopee `conversionReport()` ao vivo — o
  "relatório" de hoje calcula seus próprios números ad hoc, **não
  consome nenhum artefato das Skills 18/19/20** (que ainda nem existem
  como tabelas). Isso é precedente de UI/estilo reutilizável, mas
  arquiteturalmente incompatível com "nunca computar análise nova".
- **Zero código de PDF/export/CSV/relatório por e-mail existe** — grep
  por `puppeteer|react-pdf|jspdf|pdfkit|pdf-lib` em `src/` e
  `package.json` não encontrou nada. **Greenfield para
  export/entrega.**
- **Diretório da Skill 21 estava vazio antes desta auditoria** —
  confirmado greenfield para a própria Skill.
- **Handoff explícito Skill19→Skill21** (5 menções verbatim já
  escritas na Skill 19; Skill 20 tem **zero** menções): ownership
  final "Skill21 → apresenta resultados/relatórios"; "Skill 21 nunca
  recebe só `score=83`; recebe '83 sob `PERFORMANCE_SCORE_POLICY_V1`,
  primeiras 72h, comparado com coorte X, usando signals A/B'"; "Skill
  21 pode pedir 'latest', mas recebe identidade exata — nunca consulta
  mutável invisível no meio da renderização"; "Skill 21 pode escolher
  o método latest aprovado, mas não altera R1".
- **`PerformanceAnalysisResult` não é puramente numérico** —
  `HeuristicAttributionHypothesis` tem campos de texto livre
  (`assumptions: string[]`, `limitations: string[]`), explicitamente
  marcados como "nunca logados por padrão" e estruturalmente
  triplo-bloqueados de virar score canônico
  (`canonicalAttributionLevelGranted: false`,
  `eligibleForEvidenceBackedScore: false`, policy
  `eligibleForCanonicalScore: false`). A Skill 21 precisa renderizar
  isso como hipótese claramente rotulada, nunca como fato.
- **Fronteira de narração LLM já antecipada (mas não resolvida) pela
  Skill 19**: "LLM pode futuramente explicar uma hypothesis em prosa,
  mas nunca fora do modelo canônico" — capacidade futura,
  restringida. Nenhuma outra Skill (01-20) discute fronteira de
  prosa/LLM em relatório.
- **Zero multi-tenant na UI de admin atual** — `grep tenant` em
  `stats.ts` e nas páginas admin não retornou nada; "Desconto
  Chegando" é hoje single-tenant no admin, mesmo as Skills 01-20 do
  video-machine usando `tenantId` internamente em todo lugar. Skill 21
  seria a primeira renderização tenant-aware contra uma superfície de
  admin hoje tenant-blind.
- **Infraestrutura de entrega real e reutilizável já existe** —
  `src/lib/channel/zapi.ts` (`createZApiConnector`) +
  `src/app/api/webhook/zapi/route.ts` é o gateway WhatsApp (Z-API), e
  `src/lib/concierge/*` é o bot "Shopee Concierge" — mesmo repo, mesma
  abstração de canal (`ChannelConnector`/`OutgoingMessage`/
  `OutgoingImageMessage` em `src/lib/channel/types.ts`), genuinamente
  reutilizável pra entrega de relatório em vez de canal separado. Zero
  código de e-mail/Slack em `src/lib/`.
- **Banco**: zero tabela `report`/`dashboard_config`/
  `scheduled_report`/`export` em qualquer migration. **Totalmente
  greenfield na camada de persistência.**

## Questões reais para o debate com o ChatGPT

1. Como a Skill 21 consome `PerformanceAnalysisResult` sem nunca
   computar nada novo — um tipo `ReportView`/`ReportRender` que só
   projeta campos já existentes, nunca soma/compara/deriva?
2. Como tratar `HeuristicAttributionHypothesis.assumptions`/
   `limitations` (texto livre) na apresentação — trunca, sanitiza,
   exige aprovação humana antes de mostrar externamente, ou fica
   restrito a relatórios internos?
3. A narração LLM (explicitamente antecipada como futura pela
   Skill 19) fica de fora da V1 da Skill 21, ou entra já com um
   contrato formal que impede inventar número/conclusão fora do
   modelo canônico?
4. Como a Skill 21 usa a infraestrutura real de canal (`ChannelConnector`/
   Z-API) sem se tornar acoplada ao WhatsApp — abstração de "delivery
   surface" própria, reaproveitando o canal existente como um dos
   destinos possíveis?
5. Multi-tenant: a Skill 21 força o admin existente a virar
   tenant-aware agora, ou o relatório do video-machine nasce como
   superfície nova e paralela (`/admin/video-machine/...`) sem tocar o
   dashboard atual?
6. Snapshot vs. live: um relatório entregue (ex.: por WhatsApp) é
   imutável no momento do envio (hash do conteúdo enviado) ou sempre
   aponta pra "latest" e pode mudar de conteúdo se reaberto depois?
7. Como o relatório lida com resultado parcial/incompleto
   (`resultCompleteness=PARTIAL_SIGNAL_UNAVAILABLE` da Skill 19,
   `CLOSED_UNEVALUABLE` da Skill 20) — sempre mostra o estado real, ou
   omite até estar completo?
