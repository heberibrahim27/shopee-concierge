# Skill 04 — Descoberta de Produtos

> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC, worker ou cron foi criado. Este arquivo só vira código depois
> da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-17 após debate ChatGPT ↔ Claude Code, fundamentado
> em auditoria real do banco Supabase live (`babamanager-pro`,
> `czocwdlygdslyuoixmhh`) — as migrations `.sql` do repo estão desatualizadas
> em relação ao schema real e não foram usadas como fonte de verdade.
> Interface Skill 01 ↔ Skill 04 via Skill 02 (fila de Jobs) congelada.

## Garantia central

A Skill 04 produz um **shortlist ordenado e auditável** de produtos
elegíveis para uma `ProductionRun` — nunca "o produto que vira vídeo" de
forma irrevogável. O `primary` é a primeira recomendação; Skills seguintes
(05 — Oferta/Comissão, 06 — Tendências, 07 — Direção Criativa) podem
invalidá-lo. Toda decisão de elegibilidade e ranking é reconstruível a
partir do `ProductDiscoveryResult` persistido — nunca "escolhi esse porque
parece bom".

Toda seleção é explicável e reproduzível a partir da
`ProductSelectionPolicy` congelada, do pool efetivamente lido e dos
snapshots de oferta referenciados. A Skill 04 **nunca** substitui
silenciosamente o `sourceOfferSnapshotId` de um `deal_candidate` pelo
snapshot mais recente do produto — isso impede alguém de "otimizar" depois
usando `site_catalog`/latest snapshot e quebrar a auditoria.

## Objetivo

Selecionar, a partir do pool normalizado já existente
(`deal_candidates`/`products`/`offer_snapshots`), um conjunto ordenado de
candidatos elegíveis (`primaryCandidates` + `alternateCandidates`) para uma
`ProductionRun`, aplicando hard filters determinísticos e um ranking
versionado, sem duplicar a integração Shopee nem antecipar responsabilidade
de Skills futuras (oferta/comissão, tendências, performance histórica).

## Responsabilidades

- Executar `Job`s `PRODUCT_DISCOVERY` **materializados e controlados pela
  Skill 02**, recebendo `ProductDiscoveryInput` dentro de um `JobAttempt`
  válido. A Skill 04 **não consome `LogicalJobIntent` diretamente** e não
  possui lifecycle de Job, lease, retry ou outbox terminal — isso é
  responsabilidade exclusiva da Skill 02 (fila de Jobs comum, **sem outbox
  próprio** para a Skill 04: ela é uma Skill de execução normal, não tem
  lifecycle próprio como a Skill 03).
- Ler o pool de candidatos a partir do núcleo `deal_candidates`, com join
  explícito por chave específica — nunca por "produto + snapshot mais
  recente":
  ```
  deal_candidates.product_id        -> products.id
  deal_candidates.offer_snapshot_id -> offer_snapshots.id
  ```
  Nunca a partir de `site_catalog`, que reflete o snapshot mais recente e
  pode divergir do snapshot específico que originou o `score_breakdown` do
  candidato (há vários `offer_snapshots` por produto ao longo do tempo).
- Aplicar hard filters determinísticos (elegibilidade) e só então ranking
  (`DiscoveryScore`) sobre os elegíveis.
- Aplicar diversificação pós-ranking (`product_groups`, quando disponível)
  para evitar `primary` + `alternates` todos do mesmo produto físico.
- Persistir `ProductDiscoveryResult` durável — snapshot histórico completo
  de avaliação, policy usada e ranking, imutável mesmo que o pool mude
  segundos depois.
- Devolver `JobExecutionReport` com `resultRef` apontando para o
  `ProductDiscoveryResult` (nunca o payload completo inline).

## Não é responsabilidade

- Capturar dados brutos da Shopee ou reimplementar `src/lib/shopee/*` — o
  pipeline existente (`cron/source-deals`) continua alimentando
  `deal_candidates`.
- Analisar comissão, "melhor oferta" ou link afiliado — Skill 05.
- Pesquisar tendências — Skill 06.
- Decidir roteiro/direção criativa — Skill 07.
- Calcular performance histórica de conteúdo — Skills 18/19. A Skill 04
  pode **consumir** um sinal já produzido por elas no futuro, nunca
  calculá-lo.
- Abrir navegador/Shopee sozinha para "se salvar" quando o pool está
  desatualizado — isso seria um provider/job de refresh explícito, fora de
  escopo agora.
- Definir identidade de tenant do catálogo — `products`/`deal_candidates`/
  `offer_snapshots` são **catálogo de mercado compartilhado, sem
  `tenantId`** (ver "Multi-tenant" abaixo).

## Quando é chamada

- Quando um worker da Skill 02 adquire lease (`EXECUTE_NEW_ATTEMPT`) de um
  `Job` com `stage = PRODUCT_DISCOVERY`.

## Quem pode chamar

- Skill 01, indiretamente via `LogicalJobIntent` (outbox) → Skill 02 →
  handler da Skill 04.

## Quais Skills ela pode chamar

Nenhuma diretamente. Reporta o resultado via `reportExecution()` da
Skill 02 (`JobExecutionReport`), que gera `JobResultEvent` →
`Skill01.advanceRun()`.

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
// PipelineStage — contrato compartilhado, ver SPEC.md da Skill 01.
// stage/capability desta Skill: "PRODUCT_DISCOVERY"

type ProductDiscoveryInput = {
  // payload do LogicalJobIntent — tenantId/runId aqui são CORRELAÇÃO, não
  // fronteira de autorização: a Skill 04 confere ambos contra o Job
  // confiável materializado pela Skill 02; divergência é erro de
  // contrato, nunca troca silenciosa de tenant/run.
  tenantId: string;
  runId: string;

  requestedCount: number; // >= 1 — quantidade de candidatos PRINCIPAIS pedidos
  alternateCount: number; // >= 0 — reservas adicionais, sempre best-effort

  allowedCategorySlugs?: string[]; // categorySlug é a identidade real do
  excludedCategorySlugs?: string[]; // schema hoje — não existe categoryId
  excludedProductIds?: string[];

  selectionPolicyKey: string; // resolvido via ProductSelectionPolicyBinding

  discoveryContext?: {
    categorySlug?: string; // contexto para categoryPrioritySignal — NUNCA vira hard filter sozinho
    campaignKey?: string; // contexto/auditoria para policy e sinais
    publicationTargetKey?: string; // contexto da Run — não é fronteira de
      // autorização, não altera seleção silenciosamente sem regra
      // explícita da policy (mesmo conceito usado no FIRST_REAL_PUBLISH
      // da Skill 03)
  };
};
// allowedCategorySlugs/excludedCategorySlugs são hard filters.
// discoveryContext.categorySlug é só contexto de ranking — não filtra.

type ProductReusePolicy = "NEVER_REUSE" | "COOLDOWN" | "ALLOW";
// NEVER_REUSE: produto com QUALQUER histórico de produção/publicação de
//   vídeo daquele tenant fica inelegível para sempre (MVP começa aqui).
// COOLDOWN: inelegível só dentro de cooldownSeconds desde o último uso.
// ALLOW: histórico de vídeo não exclui.
// Baseado em histórico DURÁVEL PRÓPRIO de produção/publicação de vídeo do
// tenant — nunca em social_posts (ver "Herança do pipeline atual" abaixo).

type ProductSelectionPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  reusePolicy: ProductReusePolicy;
  cooldownSeconds?: number; // obrigatório quando reusePolicy = COOLDOWN

  minimumUsageEvidenceKind: ProductUsageEvidenceKind; // Ponto S9 — qual
    // patamar de ProductUsageEvidence qualifica como "uso" pra esta
    // policy. MATERIALIZED qualifica MATERIALIZED e PRIMARY_PUBLISHED;
    // PRIMARY_PUBLISHED qualifica só PRIMARY_PUBLISHED (precedência,
    // não union — nunca criar MATERIALIZED_OR_PUBLISHED)

  maxSnapshotAgeSeconds: number; // freshness hard cut

  // sinal legado do pipeline atual (social_posts) — desligado por padrão;
  // nunca é veto hardcoded da Skill 04, é opt-in explícito da policy
  excludeIfPreviouslyPublishedAsAnyContent: boolean;

  // allowlist explícita — hoje só "discovered" existe de fato no banco
  // (resto do enum de deal_candidates.status é código morto). Nunca supor
  // elegibilidade por nome do status (ex.: "published" não é
  // automaticamente elegível nem inelegível até mapeamento explícito).
  eligibleSourceStatuses: string[]; // MVP: ["discovered"]

  rankingWeights: {
    discoveryCommercial?: number; // único sinal comprovadamente pronto hoje
    freshness?: number;
    novelty?: number;
    categoryPriority?: number;
    historicalPerformance?: number; // ausente até Skills 18/19 produzirem algo real
  };

  diversificationRules: {
    avoidSameProductGroup?: boolean;
    maxPerCategory?: number;
    preferDistinctCategories?: boolean;
  };

  createdAt: string;
};
// Imutável por (policyId, policyVersion) — mesmo padrão da ApprovalPolicy
// (Skill 03). Mudou peso/freshness/reuse/eligibleSourceStatuses/
// diversificação → nova policyVersion, nunca edição in-place.

type ProductSelectionPolicyBinding = {
  tenantId: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
};
// Mesmo desenho do ApprovalPolicyBinding: a policy nunca muda, o binding
// aponta pra versão vigente; um ProductDiscoveryResult antigo continua
// provando qual versão decidiu aquele shortlist.

type RankingSignal = {
  value: number; // normalizado numa escala comum 0..100
  source: string;
  sourceVersion: string;
  observedAt: string;
};
// Nenhum sinal aparece como número solto sem se saber de onde veio.
// Ausência de sinal é AUSÊNCIA, nunca value=0 — sinal ruim e sinal
// inexistente não podem ser confundidos.

// Disponibilidade real dos sinais hoje:
//   discoveryCommercial   -> AVAILABLE
//   freshness              -> AVAILABLE
//   novelty                -> AVAILABLE somente se existir histórico
//                             tenant-scoped suficiente
//   categoryPriority       -> AVAILABLE somente se houver contexto/regra
//                             explícita (discoveryContext.categorySlug
//                             ou regra da policy)
//   historicalPerformance  -> UNAVAILABLE até Skills 18/19 produzirem
//                             sinal real e versionado
//
// REGRA: peso positivo (rankingWeights.<sinal> > 0) para um sinal
// UNAVAILABLE é config inválida -> INVALID_SELECTION_POLICY -> FATAL_ERROR
// via Skill 02. Nenhum ProductDiscoveryResult fictício é criado.

type ProductExclusionReason =
  | "NO_IMAGE"
  | "CATEGORY_NOT_ALLOWED"
  | "CATEGORY_EXCLUDED"
  | "SOURCE_STATUS_NOT_ALLOWED"
  | "SOURCE_DATA_STALE"
  | "PREVIOUSLY_USED" // reusePolicy = NEVER_REUSE + histórico encontrado
  | "REUSE_COOLDOWN_ACTIVE" // reusePolicy = COOLDOWN + ainda dentro da janela
  | "PREVIOUSLY_PUBLISHED_ANY_CONTENT" // sinal legado social_posts, só quando o opt-in está ligado
  | "EXPLICITLY_EXCLUDED" // excludedProductIds
  | "RANKING_SIGNAL_UNAVAILABLE"; // sinal com peso>0 estruturalmente
    // disponível na policy, mas ESTE candidato não tem os dados
    // necessários — distinto de INVALID_SELECTION_POLICY (sinal
    // indisponível para TODO o pool, que é FATAL_ERROR)

type ProductCandidateEvaluation = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;

  productGroupId?: string;
  sourceCandidateStatus: string; // valor bruto de deal_candidates.status, informativo

  eligible: boolean; // eligible=true implica exclusionReasons=[] (invariante)
  exclusionReasons: ProductExclusionReason[];

  // referência durável à evidência que causou PREVIOUSLY_USED/
  // REUSE_COOLDOWN_ACTIVE/PREVIOUSLY_PUBLISHED_ANY_CONTENT — não copia o
  // registro inteiro, só a referência, para poder responder depois "qual
  // evidência provocou a decisão", não só "foi bloqueado por reuse"
  selectionEvidence?: {
    reuseEvidenceRef?: string;
    legacyExposureEvidenceRef?: string;
  };

  discoveryScore?: number;
  rank?: number; // posição no ranking BRUTO entre elegíveis, ANTES da diversificação

  skippedForDiversification: boolean; // eligible continua true; diversificationReason vira obrigatório junto
  diversificationReason?: "SAME_PRODUCT" | "SAME_PRODUCT_GROUP" | "CATEGORY_LIMIT";

  signals: {
    discoveryCommercial?: RankingSignal;
    freshness?: RankingSignal;
    novelty?: RankingSignal;
    categoryPriority?: RankingSignal;
    historicalPerformance?: RankingSignal;
  };

  // proveniência do scorer é POR CANDIDATO, não do resultado inteiro — um
  // mesmo ProductDiscoveryResult pode conter candidatos produzidos em
  // épocas diferentes do feeder (alguns LEGACY_UNVERSIONED, outros já
  // VERSIONED no futuro) sem mentir sobre a origem de cada um. Carrega
  // também o score_breakdown BRUTO — não basta dizer que o rankingSnapshot
  // "guarda" o dado sem definir onde ele mora no contrato.
  sourceScoring: {
    model: "DEAL_SCORING";
    provenance: "VERSIONED" | "LEGACY_UNVERSIONED"; // hoje: LEGACY_UNVERSIONED para todo o pool
    version?: string; // ausente quando LEGACY_UNVERSIONED

    sourceScore: number; // deal_candidates.score bruto, não o DiscoveryScore
    sourceScoreBreakdown: {
      quedaHistorica: number;
      notaEAvaliacoes: number;
      vendas: number;
      comissao: number; // presente para auditoria; nunca usado no ranking da Skill 04
      confiancaHistorico: number; // hoje sempre 0 — feature não implementada
      total: number;
    };
  };
};

type SelectedProductCandidateRef = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;

  rawRank: number; // posição entre TODOS os elegíveis, ANTES da diversificação
  finalPosition: number; // posição GLOBAL no shortlist final, 1-based,
    // única dentro do ProductDiscoveryResult: primaryCandidates ocupa as
    // primeiras posições (até requestedCount), alternateCandidates
    // continua a numeração depois — nunca reinicia em 1 dentro de cada
    // array (ex.: primary = 1,2; alternates = 3,4,5)
};

type ProductDiscoveryResultStatus =
  | "OK" // primaryCandidates.length == requestedCount
  | "PARTIAL" // >= 1 primary encontrado, mas < requestedCount
  | "NO_ELIGIBLE_CANDIDATES" // dados frescos existem, mas nenhum sobreviveu aos filtros
  | "CANDIDATE_POOL_STALE"; // pool existe, mas nenhum candidato relevante está dentro de maxSnapshotAgeSeconds
// alternateCount é sempre best-effort — pedir 5 e conseguir 3 alternates
// ainda é OK se o requestedCount de primary foi satisfeito.
//
// INVALID_SELECTION_POLICY NÃO é um resultStatus: se a policy não existe,
// está corrompida, ou referencia sinal indisponível com peso > 0, a Skill
// não consegue preencher honestamente selectionPolicyId/Version/
// SnapshotHash — isso é FATAL_ERROR no JobExecutionReport, e nenhum
// ProductDiscoveryResult fictício é criado. Erro transitório de banco/infra
// também não vira NO_ELIGIBLE_CANDIDATES — vira RETRYABLE_ERROR (mesmo
// contrato de erro da Skill 02).

type ProductDiscoveryResult = {
  resultId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  resultStatus: ProductDiscoveryResultStatus;

  requestedCount: number;
  alternateCount: number;

  primaryCandidates: SelectedProductCandidateRef[];
  alternateCandidates: SelectedProductCandidateRef[];

  poolCandidateCount: number; // total lido do pool antes de qualquer filtro
  evaluatedCount: number;
  freshCandidateCount: number; // dentro de maxSnapshotAgeSeconds
  eligibleCount: number;

  selectionPolicyId: string;
  selectionPolicyVersion: string;
  selectionPolicySnapshotHash: string;

  // o banco não versiona qual código de dealScoring.ts produziu cada
  // score_breakdown — nunca fingir que sabemos além do que persistimos.
  // sourceScoringProvenance/sourceScoringVersion vivem POR CANDIDATO em
  // ProductCandidateEvaluation (não aqui) — um mesmo resultado pode
  // conter candidatos de proveniências diferentes. sourceScoringModel
  // fica só como informação agregada de referência.
  sourceScoringModel: "DEAL_SCORING";

  // commercialSignalFormulaVersion e discoveryRankingVersion SÃO do
  // resultado inteiro — versionam a execução da própria Skill 04, não o
  // dado de origem, e valem uniformemente para todo o ProductDiscoveryResult
  commercialSignalFormulaVersion: "DISCOVERY_COMMERCIAL_V1"; // (quedaHistorica+notaEAvaliacoes+vendas)/85*100
  discoveryRankingVersion: "DISCOVERY_RANKING_V1";

  poolReadAt: string;
  // PATCH (Ponto M3, reparo transversal pós-revisão Fable, 2026-09-18,
  // CONTRACT_CONVENTIONS_V1): "poolSnapshotHash" (POOL_SNAPSHOT_V1)
  // removido — a própria versão anterior deste campo já admitia "NÃO é
  // lock otimista", e não tinha nenhum consumer real (nunca comparado,
  // nunca usado pra detectar conflito). Regra geral: se um hash não
  // participa de provenance/replay/concorrência/decisão de
  // domínio/validação efetiva, ele não deve existir no contrato — não
  // substituído por candidateSetHash/selectionUniverseHash/poolVersion/
  // etag/snapshotVersion (seria só renomear o problema), nem
  // transformado em optimistic lock real (`expectedPoolSnapshotHash` +
  // comparação de conflito) — a Skill 04 não tem hoje esse requisito de
  // concorrência; se algum dia tiver, a solução é um mecanismo real
  // (constraint/transaction/claim/CAS/lease), nunca um hash de pool.
  // Reprodutibilidade continua vindo de policy snapshot/version, hash
  // canônico do resultado, tenant ownership, RESULT_MATERIALIZATION_V1
  // e ProductUsageEvidence/ReusePolicy — nenhum desses depende do
  // fingerprint do pool bruto.

  rankingSnapshot: ProductCandidateEvaluation[]; // todos os avaliados, não só os selecionados

  evaluatedAt: string;
  createdAt: string;
};
// Sempre persistido, mesmo quando resultStatus != OK — registra o estado
// do pool naquele momento, mesmo sem candidato válido. Snapshot histórico:
// se deal_candidates mudar 30 segundos depois, o resultado NÃO muda
// retroativamente.

// funções (assinaturas do contrato, não implementação):
// discoverProducts(input: ProductDiscoveryInput, jobContext) -> ProductDiscoveryResult
//   1. valida tenantId/runId do input contra o Job confiável da Skill 02
//   2. resolve ProductSelectionPolicyBinding vigente -> carrega policy imutável
//   3. lê pool: deal_candidates -> products -> offer_snapshots (por offer_snapshot_id)
//   4. avalia cada candidato: hard filters -> ProductCandidateEvaluation
//   5. rankeia elegíveis (DiscoveryScore) -> diversificação -> primary + alternates
//   6. persiste ProductDiscoveryResult -> retorna resultRef
```

## Hard filters (MVP)

Poucos e verdadeiros — deterministicamente eliminam o candidato
independente do score:

```
imageUrl presente no offer_snapshot referenciado
snapshot dentro de maxSnapshotAgeSeconds (freshness)
category(Slug) permitida (allowedCategorySlugs/excludedCategorySlugs)
sourceCandidateStatus está em eligibleSourceStatuses (MVP: só "discovered")
productId não está em excludedProductIds
ReusePolicy da Run permite o produto (histórico durável de produção/vídeo)
excludeIfPreviouslyPublishedAsAnyContent=true + histórico em social_posts (opt-in)
```

**Não** são hard filters universais: `hasGoodImage` fictício (não existe —
Shopee entrega uma única `imageUrl`, sem validação, sem galeria),
`site_published`, `product_group_id` isoladamente.

### Imagem

```
image_url null/vazia -> NO_IMAGE
```

Mínimo deliberado: nada de HEAD request, MIME, dimensões ou qualidade
visual escondidos dentro do hard filter. Essas validações só entram
quando existir um avaliador real (`ProductMediaInspector`, ainda fora de
escopo).

### Freshness — instante único congelado

```
poolReadAt = capturado UMA VEZ antes de avaliar qualquer candidato
ageSeconds = poolReadAt - sourceOfferSnapshot.captured_at
fresh      = ageSeconds <= maxSnapshotAgeSeconds
```

Sempre sobre o `offer_snapshot` **especificamente referenciado** pelo
`deal_candidate` (`deal_candidates.offer_snapshot_id`) — nunca consulta o
snapshot mais recente do produto para "salvar" um candidato stale. Isso
também torna `freshCandidateCount` reproduzível.
`freshCandidateCount` é contado **antes** dos demais hard filters (ex.: 10
snapshots frescos mas todos com `sourceCandidateStatus` não permitido é
`NO_ELIGIBLE_CANDIDATES`, não `CANDIDATE_POOL_STALE`).

### Precedência determinística de `resultStatus`

```
poolCandidateCount == 0
  -> NO_ELIGIBLE_CANDIDATES

poolCandidateCount > 0 AND freshCandidateCount == 0
  -> CANDIDATE_POOL_STALE

freshCandidateCount > 0 AND eligibleCount == 0
  -> NO_ELIGIBLE_CANDIDATES
```

`NO_ELIGIBLE_CANDIDATES` cobre tanto pool vazio quanto "há dados frescos
mas nenhum passou os demais filtros" — não é criado um status adicional
para pool vazio.

### Regras categóricas exatas

```
allowedCategorySlugs ausente
  -> nenhuma allowlist categórica (não filtra por allowlist)

allowedCategorySlugs presente + candidato sem categorySlug
  -> CATEGORY_NOT_ALLOWED

categorySlug do candidato em excludedCategorySlugs
  -> CATEGORY_EXCLUDED

categorySlug do candidato fora de allowedCategorySlugs (quando a allowlist existe)
  -> CATEGORY_NOT_ALLOWED
```

Invariante de entrada: `allowedCategorySlugs ∩ excludedCategorySlugs ≠ ∅`
é erro de contrato/configuração → `FATAL_ERROR`, nenhum
`ProductDiscoveryResult` criado. Nunca decide silenciosamente qual lista
"ganha".

### O que conta como "uso" para `ReusePolicy`

```
NÃO contam como uso:
  - candidato apenas selecionado (apareceu num ProductDiscoveryResult anterior)
  - tentativa de geração falha
  - Job cancelado
  - Run cancelada antes de produzir conteúdo utilizável

Contam como uso:
  - evidência durável de vídeo concluído/utilizável para aquele produto (MATERIALIZED)
  - publicação de vídeo confirmada (PRIMARY_PUBLISHED)
```

Para `COOLDOWN`, `usedAt` é a referência temporal da janela. Para
`NEVER_REUSE`, qualquer evidência qualificante bloqueia, não importa a
idade. Falha ao consultar esse histórico **não significa "nunca usado"**
— erro transitório de acesso vira `RETRYABLE_ERROR`, nunca elegibilidade
silenciosa.

### Ponto S9 — `ProductUsageEvidence` como ledger canônico

**PATCH (Ponto S9 — reparo transversal pós-revisão Fable, 2026-09-18).**
Achado real do Fable: antes deste patch, "o que conta como uso" era só
prosa — sem fonte canônica, a implementação correria o risco de
**adivinhar** se um produto já foi usado olhando artifacts espalhados
(existe `VideoArtifact`? existe `FinalizedRendition`?
`PublicationExecution` parece `PUBLISHED`?), misturando produção,
finalização e tentativa de publicação. A Skill 04 nunca deve consultar
esses artifacts estrangeiros diretamente. Decisão: um ledger durável,
append-only, com writers explícitos.

```typescript
type ProductUsageEvidenceKind =
  | 'MATERIALIZED'
  | 'PRIMARY_PUBLISHED';
// Fatos diferentes. Um nunca é implicitamente gravado como o outro.
// Precedência de força (relação de evidência, não workflow):
// MATERIALIZED < PRIMARY_PUBLISHED.

type ProductUsageEvidence = {
  productUsageEvidenceId: string;

  tenantId: string;
  productId: string; // identidade canônica já usada pela ReusePolicy —
    // nunca raw Shopee item id/offer id/URL/SKU improvisado/título, a
    // menos que seja exatamente esse identificador canônico

  usageKind: ProductUsageEvidenceKind;

  usedAt: string; // timestamp SEMÂNTICO do fato de origem — nunca o
    // momento em que este registro foi gravado (ver recordedAt)

  evidenceRef: KernelArtifactRef; // exact ref do artifact fonte —
    // nunca runId sozinho, productId sozinho, "latest publication",
    // URL solta

  recordedAt: string; // metadata de ledger — nunca usado como usedAt,
    // nunca participa do hash semântico

  productUsageEvidenceHash: string; // PRODUCT_USAGE_EVIDENCE_V1
};

type ProductUsageEvidenceRef = {
  productUsageEvidenceId: string;
  productUsageEvidenceHash: string;
};
// Sem hash próprio.
```

Hash `PRODUCT_USAGE_EVIDENCE_V1` (1 hash novo, via
`CANONICAL_SERIALIZATION_V1`) — projection inclui `tenantId`/
`productId`/`usageKind`/`usedAt`/`evidenceRef`; exclui
`productUsageEvidenceId`/`recordedAt`/`productUsageEvidenceHash`.

**Matriz fechada de writers (V1):**

| Writer | `usageKind` permitido |
| --- | --- |
| Skill 11 (Executor de Geração) | `MATERIALIZED` |
| Skill 14 (Finalizador de Vídeo) | `MATERIALIZED` |
| Skill 17 (Publicador Multicanal) | `PRIMARY_PUBLISHED` |

`Skill 11 → PRIMARY_PUBLISHED` ou `Skill 17 → MATERIALIZED` são
contract violation — Skill 17 não grava `MATERIALIZED` "pra preencher
buraco": a evidência de publicação já é mais forte e a precedência
resolve isso sem criar uma segunda linha sintética. Skill 11 e Skill 14
podem ambas produzir `MATERIALIZED` para o mesmo produto
(`evidenceRef`/`usedAt` diferentes) — não são duplicatas técnicas, mas
a `ReusePolicy` nunca conta linhas como "número de campanhas" (ver
abaixo).

**`MATERIALIZED` significa** apenas: existe conteúdo de vídeo durável e
materializado para esse produto. **Não significa**: publicado,
aprovado, teve clique, teve venda, teve conversão. Skill 11 só emite
quando existe `Job SUCCEEDED` + `VideoArtifact` durável realmente
materializado + lineage de produto resolvida — nunca basta provider
`ACCEPTED`/job enviado/`processing`/submission criada/
`externalEffectState=UNKNOWN`. Skill 11 não espera o veredito da
Skill 12 — um vídeo pode estar `MATERIALIZED` e depois `NON_COMPLIANT`;
o fato histórico "houve materialização" continua verdadeiro. Skill 14
só emite quando uma `FinalizedRendition` válida é efetivamente
materializada (nunca ao começar transcode/reservar processor/criar
plan).

**`PRIMARY_PUBLISHED` significa** que a Skill 17 provou: publicação
externa existe + correlação com o `PublicationPlan`/execução exato
confirmada (PATCH N5, 2026-09-19 — antes citava `PublicationIntent`,
artifact nunca declarado; ver skills/03-gestor-de-aprovacao/SPEC.md)
+ classificação `PRIMARY` (nunca
`SECONDARY`/`REPOST`/`DERIVATIVE`/`TEST` em V1 — evita que múltiplos
canais inflem o histórico; refinamento de multi-target fica pro
Ponto S5, sem mudar o conceito central). **Nunca** gerado por:
`DRY_RUN`, `PublicationPlan` criado, aprovação
manual concedida, `SUBMITTING`, request HTTP enviada, provider
`ACCEPTED`, `externalPublicationId` não confirmado, timeout,
`externalEffectState=UNKNOWN` — preserva a garantia já elogiada pelo
Fable: `ACCEPTED ≠ PUBLISHED ≠ confirmado`. O mesmo evento/fato externo
que confirma um `FirstRealPublishClaim` (Ponto F1) pode ser a
provenance de um `ProductUsageEvidence.PRIMARY_PUBLISHED`, mas são
fatos de **dimensões diferentes** — `FIRST_REAL_PUBLISH` é controle de
segurança/governança da integração (Skill 03/Ponto S1);
`PRIMARY_PUBLISHED` é o papel daquela publicação na produção/campanha
(Skill 04). Nunca usar o `FirstRealPublishClaim` em si como prova de
publicação — usar o artifact real de confirmação externa da Skill 17.
`PRIMARY_PUBLISHED` não significa conversão (zero cliques/vendas/
comissão ainda conta como publicado de verdade) — isso não invade
Skills 15/18/19.

**`usedAt` é sempre o timestamp semântico do fato de origem:** Skill 11
deriva do timestamp canônico real que já possui
(`materializedAt`/`completedAt`/`readyAt`, conforme existir — nunca
inventar outro relógio); Skill 14 deriva do timestamp real da
`FinalizedRendition`; Skill 17 prefere `providerPublishedAt` quando o
provider fornece, senão `confirmedAt` do artifact local de confirmação
— nunca `submittedAt`/`plannedAt`/`approvedAt`/`requestSentAt`. Replay
não muda `usedAt` (reprocessar hoje uma confirmação de ontem mantém
`usedAt` de ontem).

**Append-only.** `ProductUsageEvidence` é imutável — nunca `UPDATE`
`MATERIALIZED` para `PRIMARY_PUBLISHED`; publicação posterior cria uma
**segunda** linha (`E1 MATERIALIZED`, `E2 PRIMARY_PUBLISHED`),
preservando o histórico real (materializado às 10:00, publicado às
16:00) em vez de sobrescrever o primeiro fato. Histórico nunca é
apagado por eventos posteriores: publicação depois deletada, ou
conteúdo depois descartado — a evidência permanece (o fato histórico
não se torna falso retroativamente; quem quiser considerar só
publicação real usa o threshold `PRIMARY_PUBLISHED`).

**Idempotência** (S14 aplica): unicidade lógica por `tenantId` +
identidade do produto + `usageKind` + `evidenceRef` exato — sem
precisar de outro hash schema. Mesmo writer reapresentando mesmo
produto/kind/`evidenceRef`/`usedAt` → reutiliza a mesma evidência.
Mesma identidade lógica com `usedAt` ou produto diferente →
`PRODUCT_USAGE_EVIDENCE_REPLAY_CONFLICT`. Cross-tenant (writer de
tenant A gravando evidência com source de tenant B) → fail closed,
nenhum ledger cross-tenant. O writer precisa provar que o source
artifact pertence ao `productId` informado via sua lineage imutável
(upstream refs → produto canônico) — nunca por título parecido/URL/
nome (fuzzy match).

**`count(ProductUsageEvidence)` nunca é "número de campanhas".** O
ledger contém evidências, não um contador. `ReusePolicy` V1 trabalha
com **recência**: considera o `usedAt` mais recente entre as
evidências que satisfazem o threshold, nunca a quantidade de linhas.
Exemplo: `10:00 MATERIALIZED(Skill11)`, `10:05 MATERIALIZED(Skill14)`,
`16:00 PRIMARY_PUBLISHED(Skill17)`. Se a policy exige `MATERIALIZED`,
o `usedAt` efetivo é `16:00` (evidência mais forte também satisfaz o
threshold mais fraco). Se a policy exige `PRIMARY_PUBLISHED`, o
resultado é o mesmo `16:00`, mas as duas `MATERIALIZED` são ignoradas
para elegibilidade. Se só existir `MATERIALIZED` e a policy exigir
`PRIMARY_PUBLISHED`, não há evidência qualificante — isso significa
apenas "nenhuma evidência qualificadora no ledger conhecido", nunca
"esse produto nunca foi usado na história" (pode existir uma operação
`UNKNOWN` ainda não reconciliada em outro lugar; pra `ReusePolicy`,
porém, só fatos positivos comprovados contam).

**Ownership formal:** Skill 04 é dona do schema `ProductUsageEvidence`,
da semântica de persistência e da interpretação pela `ReusePolicy`.
Skills 11/14/17 são **produtoras autorizadas de evidência**, nunca
donas do contrato — cada uma só referencia `ProductUsageEvidence`/
`PRODUCT_USAGE_EVIDENCE_V1` e declara sua regra de writer, sem
redeclarar o tipo.

**Propagação:** quando source artifact e `ProductUsageEvidence`
puderem ser persistidos na mesma transação, commitam juntos; quando
não puderem, usa a infraestrutura de outbox já estabilizada no
Ponto S13 — nunca fire-and-forget/best-effort/"log depois", e nunca
uma segunda fila (`ProductUsageQueue`/`UsageEventBus`/
`ReuseHistoryOutbox`) paralela ao mecanismo já existente. Se o source
artifact existe mas a propagação interna ainda não conseguiu
materializar a evidência, não inventar evidência — a entrega fica
pendente/reconciliável pelo mecanismo canônico (mesma filosofia dos
Pontos S11/S14). Sem rollback de efeito externo: se a Skill 17
publicou de fato mas falhou localmente antes de registrar a evidência,
nunca republica só pra gerar evidence — primeiro reconcilia o estado
de publicação, depois materializa a partir do fato confirmado
existente.

**`AuditEvent`** pode registrar "usage evidence recorded" como resumo,
mas nunca substitui o artifact — Skill 04 nunca consulta `AuditEvent`
por `eventCode` para decidir reuse. **Segurança:** `ProductUsageEvidence`
nunca carrega caption/prompt/affiliate URL/provider secret/raw
webhook — só refs e identidade mínima. **Simulação:** `DRY_RUN` nunca
gera nenhum `ProductUsageEvidence` (nem `MATERIALIZED` por simulação);
artifacts marcados teste/simulação/preview-only não alimentam a
`ReusePolicy` produtiva — respeita a classificação de execução já
existente no projeto (`RunKind`/modo), sem inventar um `environment:
string` novo.

**`FATAL_ERROR` novos (4):** grep prévio em Skills 04/11/14/17 não
encontrou equivalente reaproveitável — este é um ledger cross-cutting
novo, sem contrato anterior para herdar códigos.

```text
PRODUCT_USAGE_EVIDENCE_SOURCE_INVALID
  → writer emitiu usageKind fora da sua linha na matriz (ex.: Skill 11
    tentando PRIMARY_PUBLISHED), ou evidenceRef não corresponde
    estruturalmente ao usageKind declarado

PRODUCT_USAGE_EVIDENCE_TENANT_MISMATCH
  → tenant do writer diverge do tenant do source artifact referenciado

PRODUCT_USAGE_EVIDENCE_PRODUCT_MISMATCH
  → lineage do source artifact não resolve pro productId informado

PRODUCT_USAGE_EVIDENCE_REPLAY_CONFLICT
  → mesma identidade lógica (tenantId+productId+usageKind+evidenceRef),
    usedAt ou produto divergente
```

Ausência de evidência **nunca** é `FATAL_ERROR` —
`PRODUCT_USAGE_EVIDENCE_MISSING` não existe como código geral; ausência
é resultado normal da `ReusePolicy` (equivalente a "nenhuma evidência
qualificante encontrada", reaproveitando os `exclusionReasons` já
existentes — `PREVIOUSLY_USED`/`REUSE_COOLDOWN_ACTIVE` — sem criar
FATAL novo pra esse caso).

### `social_posts` — fail-closed em multi-tenant

```
MVP pessoal:
  excludeIfPreviouslyPublishedAsAnyContent=true
  + registro correspondente em social_posts
  -> PREVIOUSLY_PUBLISHED_ANY_CONTENT

Multi-tenant (futuro):
  excludeIfPreviouslyPublishedAsAnyContent=true
  + não existe fonte tenant-safe de exposição
  -> INVALID_SELECTION_POLICY
```

Fail-closed é preferível a ignorar silenciosamente a policy ou aplicar
`social_posts` global contra o candidato de outro tenant.

## DiscoveryScore

Nenhum peso é fixado no contrato — os pesos pertencem à
`ProductSelectionPolicy` (`rankingWeights`), versionada. Único sinal
comprovadamente pronto hoje: `discoveryCommercial`. `freshness` e
`novelty` podem existir de forma determinística. `historicalPerformance`
fica ausente até as Skills 18/19 produzirem algo real — não inventamos
arquitetura para dado que não existe (ver "Disponibilidade real dos
sinais" no bloco de `RankingSignal` acima).

### `DiscoveryCommercialSignal` — fórmula congelada (`DISCOVERY_COMMERCIAL_V1`)

```
allowedPoints = quedaHistorica + notaEAvaliacoes + vendas   // máximos hoje: 40 + 25 + 20 = 85
discoveryCommercialSignal = clamp((allowedPoints / 85) * 100, 0, 100)
```

Fonte: `sourceScoring.sourceScoreBreakdown` do candidato (contribuições já
ponderadas — confirmado com exemplos reais do banco). `comissao` **nunca**
entra (pertence à Skill 05). `confiancaHistorico` **nunca** entra — hoje é
hardcoded a `0` no scorer legado (`src/lib/growth/dealScoring.ts`), feature
não implementada, tratada como sinal inexistente, não como zero funcional.
O `deal_candidates.score` original **não é** o `DiscoveryScore` — continua
disponível para auditoria/referência (`sourceScoring.sourceScore`), mas a
Skill 04 nunca o usa diretamente. Arredondamento só no valor final, com
precisão determinística (6 casas decimais); nunca recalcula ou modifica o
`sourceScore` original.

**Se `discoveryCommercial` tem peso positivo mas um candidato específico
não tem os componentes necessários do `sourceScoreBreakdown`**, não vira
zero — vira `RANKING_SIGNAL_UNAVAILABLE` (novo `ProductExclusionReason`,
ver abaixo), distinto de `INVALID_SELECTION_POLICY` (que é quando a
*policy* pede um sinal que estruturalmente não existe/não está
configurado — `FATAL_ERROR`). Um é problema do candidato individual, o
outro é problema de configuração da policy inteira.

### `freshnessSignal`

```
ageSeconds = max(0, poolReadAt - sourceSnapshotCapturedAt)
freshnessSignal = clamp(100 * (1 - ageSeconds / maxSnapshotAgeSeconds), 0, 100)
```

Como um candidato stale já morreu no hard filter, todo candidato que
chega ao ranking está naturalmente dentro da faixa — snapshot recém-
capturado ≈ 100, limite da janela ≈ 0, sem degraus arbitrários.

### `DISCOVERY_RANKING_V1` — combinação dos sinais

Pesos da `ProductSelectionPolicy.rankingWeights` devem ser `>= 0`,
finitos, com pelo menos um `> 0`. Peso ausente/zero equivale a **sinal
desabilitado pela policy**, não a "valor de sinal zero".

```
discoveryScore = Σ(signal.value * weight) / Σ(weights > 0)
```

Média ponderada, não soma simples — exemplo: `commercial=88` (peso 70),
`freshness=60` (peso 30) → `(88*70 + 60*30) / 100 = 79.6`. **Nunca
renormaliza pesos por candidato** quando um sinal ativo não pôde ser
obtido para aquele candidato específico — isso vira
`RANKING_SIGNAL_UNAVAILABLE`, o candidato fica inelegível para aquela
execução, não recalcula a fórmula ao redor dele.

Condições de disponibilidade por sinal (reforçando a tabela já congelada):
`novelty > 0` exige fonte tenant-scoped versionada capaz de produzir
`RankingSignal` para todos os candidatos avaliáveis; `categoryPriority > 0`
exige regra/configuração explícita e versionada; `historicalPerformance > 0`
→ `INVALID_SELECTION_POLICY` no MVP atual (sinal estruturalmente
indisponível).

### Tie-breakers (desempate)

```
1. discoveryScore DESC
2. productId ASC
3. dealCandidateId ASC
4. sourceOfferSnapshotId ASC
```

Os três últimos servem **só** para produzir ordem estável — nenhum sinal
de negócio (vendas, comercial, freshness) reentra "pela porta dos fundos"
como desempate escondido. Se a policy pôs peso 0 em `freshness`,
`freshness` não pode voltar como tie-breaker. Desempate comercial
explícito, se algum dia for necessário, vira `DISCOVERY_RANKING_V2` ou
regra explícita da policy — nunca escondido no algoritmo atual.

## Diversificação (pós-ranking)

```
1. ordena elegíveis por DiscoveryScore (rank bruto) + tie-breakers
2. primaryCandidates = melhores elegíveis até requestedCount
3. alternateCandidates percorre o restante do ranking até alternateCount
4. dedupe por productId é invariante NÃO configurável (SAME_PRODUCT
   forte): o mesmo productId nunca ocupa mais de uma posição em
   primaryCandidates+alternateCandidates
   → skippedForDiversification=true, diversificationReason=SAME_PRODUCT
5. se avoidSameProductGroup=true e productGroupId de um candidato já
   coincide com um já selecionado, pula quando existir alternativa
   → diversificationReason=SAME_PRODUCT_GROUP
6. se maxPerCategory configurado e o limite real de composição da
   categoria já foi atingido, pula quando existir alternativa
   → diversificationReason=CATEGORY_LIMIT
7. productGroupId nulo NUNCA desclassifica por si só
```

`product_groups` entra só como **hint** de diversificação quando existir —
hoje 2,4% de cobertura (18/738 `products`), feature fina/experimental.
Nunca é dependência nem hard filter.

## Herança do pipeline atual — o que NÃO é herdado cegamente

- **`deal_candidates.score` não é `DiscoveryScore`** — ver fórmula acima.
- **Dedup atual (`social_posts`) não é `ReusePolicy` da Máquina de
  Vídeos.** O cron `publish-product` hoje exclui permanentemente qualquer
  `product_id` que já apareceu em `social_posts`, mas essa regra resolve
  "não postar imagem estática duas vezes" — não "produto já ganhou um
  vídeo". A Máquina de Vídeos usa histórico **próprio** de
  produção/publicação de vídeo do tenant; `social_posts` só entra como
  sinal auxiliar (`PREVIOUSLY_PUBLISHED_ANY_CONTENT`) quando
  `excludeIfPreviouslyPublishedAsAnyContent=true`, e é marcado
  arquiteturalmente como **legacy/global exposure signal**, nunca como
  histórico de produção tenant-safe.
- **`deal_candidates.status` não determina elegibilidade além do MVP
  atual** — hoje 100% das linhas estão em `"discovered"`; o resto do enum
  (`collecting_history`, `eligible`, `verified`, `link_created`,
  `content_ready`, `scheduled`, `published`, `rejected`, `expired`,
  `price_changed`, `out_of_stock`, `failed`) é código morto (confirmado:
  `updateDealCandidateStatus()` existe mas não tem nenhum caller no repo).
  Nunca supor elegibilidade pelo nome do status.

## Idempotência e operação

```
No máximo um ProductDiscoveryResult canônico por (jobId, attemptNumber).

Ao (re)executar o handler para um JobAttempt:
  1. verifica se já existe ProductDiscoveryResult para (jobId, attemptNumber)
  2. se existe -> reutiliza (não recalcula, não cria outro) -> devolve
     JobExecutionReport apontando pro resultId já persistido
  3. se não existe -> calcula -> persiste -> devolve
```

Cobre o caso: Skill04 persiste `ProductDiscoveryResult` → processo cai antes
de `reportExecution()` → Skill02 retoma o mesmo `JobAttempt` (mesmo
`leaseFence`/`expectedVersion`) → a Skill04 **não cria um segundo resultado
divergente** para a mesma chave. `leaseFence`/`expectedVersion` da Skill02
protegem o `Job`; essa invariante própria protege o efeito que a Skill04
persiste, que é responsabilidade dela, não da Skill02.

**PATCH (Ponto S14, reparo transversal pós-revisão Fable, 2026-09-18)**:
o parágrafo anterior a este patch condicionava `DISCOVERY_RESULT_REPLAY_CONFLICT`
a uma comparação de conteúdo entre o resultado já persistido e o que uma
reexecução produziria — isso contradizia o passo 2 acima (`existe →
reutiliza, NÃO recalcula`), porque só dá pra saber se o novo conteúdo
divergiria comparando-o, o que exige calcular esse novo conteúdo
primeiro. Achado exato S14 da revisão Fable/Claude Fable 5 Max: o pool de
candidatos é mutável (preço/estoque/comissão mudam entre 14:00 e 14:10) —
recalcular contra um pool mutável legitimamente produz seleção diferente,
então um crash transiente virava `FATAL` de Run inteira. Este SPEC segue
`RESULT_MATERIALIZATION_V1` (ver `contracts/RESULT-MATERIALIZATION.md`):
resultado existente → reutiliza, nunca reexecuta pra comparar. Mudança
legítima do pool mutável entre execuções **não é** `DISCOVERY_RESULT_REPLAY_CONFLICT`.

`DISCOVERY_RESULT_REPLAY_CONFLICT` passa a significar só colisão real de
identidade persistida — a mesma `(jobId, attemptNumber)` sendo reivindicada
por um `resultId`/conteúdo incompatível na tentativa de *escrita* (ex.:
`UNIQUE(jobId, attemptNumber)` violado por um segundo insert concorrente
tentando persistir outro `resultId`), nunca por recalcular e comparar:

```
tentativa de persistir 2º ProductDiscoveryResult pra mesma (jobId, attemptNumber)
com resultId/conteúdo diferente do já persistido
-> DISCOVERY_RESULT_REPLAY_CONFLICT -> FATAL_ERROR, AuditEvent/alerta
```

Mecanismo de enforcement (`UNIQUE(jobId, attemptNumber)` ou equivalente)
fica para a fase de implementação — aqui só a invariante está congelada.

`discoverProducts()` é determinístico quando recebe o mesmo conjunto
**lógico completo** de entrada e evidências observadas:

```
- ProductDiscoveryInput equivalente
- ProductSelectionPolicy (snapshot da versão) equivalente
- mesmo conjunto de candidatos efetivamente lido do pool
- mesmo poolReadAt
- mesmas evidências tenant-scoped de reuse/exposição (selectionEvidence)
- mesmas versões/fontes dos RankingSignals
```

Dados esses mesmos inputs lógicos, ranking e seleção são iguais; apenas
timestamps puramente de persistência (`createdAt`) podem diferir.
`poolReadAt` continua sendo o parâmetro real de determinismo — é ele
que define `freshnessSignal` (via `ageSeconds`), não um fingerprint do
pool (Ponto M3: `poolSnapshotHash` removido, nunca teve consumer real).

## Erros e JobExecutionReport

```
FATAL_ERROR (nenhum ProductDiscoveryResult criado/persistido):
  - SELECTION_POLICY_NOT_FOUND
  - SELECTION_POLICY_BINDING_NOT_FOUND
  - SELECTION_POLICY_TENANT_MISMATCH
  - INVALID_SELECTION_POLICY        (policy estruturalmente inválida:
                                      peso > 0 para sinal UNAVAILABLE, etc.)
  - INVALID_DISCOVERY_INPUT         (ex.: allowedCategorySlugs ∩
                                      excludedCategorySlugs ≠ ∅;
                                      tenantId/runId divergente do Job
                                      confiável)
  - DISCOVERY_RESULT_REPLAY_CONFLICT
  - PRODUCT_USAGE_EVIDENCE_SOURCE_INVALID   (Ponto S9)
  - PRODUCT_USAGE_EVIDENCE_TENANT_MISMATCH  (Ponto S9)
  - PRODUCT_USAGE_EVIDENCE_PRODUCT_MISMATCH (Ponto S9)
  - PRODUCT_USAGE_EVIDENCE_REPLAY_CONFLICT  (Ponto S9)

RETRYABLE_ERROR:
  - POOL_READ_FAILED
  - REUSE_HISTORY_READ_FAILED
  - LEGACY_EXPOSURE_READ_FAILED
  - TRANSIENT_DATASTORE_ERROR
```

`errorCode` sempre explica a **causa**, nunca fica tudo agrupado sob
`INVALID_SELECTION_POLICY` — ex.: interseção de
`allowedCategorySlugs`/`excludedCategorySlugs` é erro do `input` da Run
(`INVALID_DISCOVERY_INPUT`), não da `policy`.

**`COMPLETED` é sucesso técnico, não sucesso de negócio.** `resultStatus ∈
{OK, PARTIAL, NO_ELIGIBLE_CANDIDATES, CANDIDATE_POOL_STALE}` significa "a
Skill04 executou corretamente e produziu um `ProductDiscoveryResult` de
domínio" — todos os quatro podem levar o `Job` a `COMPLETED`/`SUCCEEDED` na
Skill02. A Skill01 **nunca** interpreta `COMPLETED` como "avançar
automaticamente": ela reabre o `ProductDiscoveryResult` via `resultRef` e
aplica sua própria regra de interpretação do resultado de domínio daquele
stage (distinta do `StageDefinition.completionPolicy` `ALL`/`ANY`/
`ALLOW_PARTIAL`, que resolve multiplicidade de Jobs dentro do stage, não o
significado do `resultStatus` de um resultado específico):

```
OK                     -> normalmente satisfaz a etapa
PARTIAL                -> Skill01 decide, caso a caso da Run/stage
NO_ELIGIBLE_CANDIDATES -> Skill01 decide bloquear/falhar/intervenção humana
CANDIDATE_POOL_STALE   -> Skill01 decide bloquear/intervenção — NUNCA
                          dispara refresh Shopee escondido
```

## Multi-tenant

`products`, `deal_candidates`, `offer_snapshots` (e o legado
`social_posts`) **não têm `tenantId`** — isso é catálogo/market data
**compartilhado** no MVP, não um bug. `ProductDiscoveryResult`,
`ProductSelectionPolicy`/`ProductSelectionPolicyBinding` e o histórico de
produção/publicação de vídeo (usado pela `ReusePolicy`) **são
tenant-scoped**. `tenantId` do `ProductDiscoveryInput` nunca é aceito como
fronteira de autorização por si só — a Skill 04 confere contra o Job
confiável materializado pela Skill 02.

**Trava multi-tenant para `social_posts`**: essa tabela é legada e
**global, sem `tenantId`**. No MVP pessoal (uso individual), pode ser
usada como sinal de exposição opt-in
(`excludeIfPreviouslyPublishedAsAnyContent=true`). Em ambiente
**multi-tenant**, `social_posts` global **não pode bloquear candidato de
nenhum tenant** até existir uma fonte de exposição com ownership/tenant
confiável — uma `ProductSelectionPolicy` tenant-scoped não torna uma
tabela global magicamente tenant-safe:

```
multi-tenant + excludeIfPreviouslyPublishedAsAnyContent=true
  + ausência de exposure source tenant-safe
  -> INVALID_SELECTION_POLICY -> FATAL_ERROR -> nenhum ProductDiscoveryResult
```

Nunca ignora a flag e nunca consulta a tabela global como substituto.

**Cadeia de tenant confiável** — `trustedTenantId` é sempre
`Job.tenantId` (materializado pela Skill 02, nunca o payload bruto):

```
ProductDiscoveryInput.tenantId  -> só correlação, deve == trustedTenantId
ProductSelectionPolicyBinding   -> resolvido por trustedTenantId + selectionPolicyKey
ProductSelectionPolicy.tenantId -> deve == trustedTenantId
ProductDiscoveryResult.tenantId -> sempre trustedTenantId
ReuseHistory                    -> sempre consultado com trustedTenantId
```

**Nunca existe fallback "não achei pra esse tenant, então consulta
global"** — divergência de `tenantId` em qualquer ponto da cadeia é
`SELECTION_POLICY_TENANT_MISMATCH` (`FATAL_ERROR`), nunca resolvida
silenciosamente caindo para outro contexto.

`products`/`deal_candidates`/`offer_snapshots` sendo *shared market
catalog* não significa "sem controle de origem": essas tabelas **nunca**
carregam decisões específicas de tenant (reuse state, approval state ou
preferência privada) usadas como se fossem globais — o compartilhamento é
só do dado de mercado, nunca de decisão de negócio.

## Observabilidade

Log estruturado por avaliação de candidato dentro de um
`ProductDiscoveryResult`: `tenantId`, `runId`, `jobId`, `resultId`,
`attemptNumber`, `selectionPolicyId`, `selectionPolicyVersion`,
`productId`, `dealCandidateId`, `eligible`, `exclusionReasons`,
`discoveryScore?`, `rank?`. Não duplica o `rankingSnapshot` inteiro — o
log serve pra operação, o `ProductDiscoveryResult` persistido continua
sendo a fonte auditável detalhada.

`AuditEvent` persistido para a criação de todo `ProductDiscoveryResult`,
como **resumo**, não o array inteiro de candidatos: `resultId`,
`tenantId`, `runId`, `jobId`, `attemptNumber`, `resultStatus`,
`requestedCount`, `primaryCount`, `alternateCount`,
`alternateSelectedCount`, `poolCandidateCount`, `freshCandidateCount`,
`eligibleCount`, `selectionPolicyId`, `selectionPolicyVersion`,
`selectionPolicySnapshotHash`,
`discoveryRankingVersion`, `createdAt`. O `rankingSnapshot` completo
permanece só no `ProductDiscoveryResult`.

`AuditEvent` explícito também para os dois erros mais graves — o segundo
é violação de fronteira de tenant, não falha operacional comum:
`DISCOVERY_RESULT_REPLAY_CONFLICT`, `SELECTION_POLICY_TENANT_MISMATCH`.

Métricas: `resultStatus` por execução (`OK`/`PARTIAL`/
`NO_ELIGIBLE_CANDIDATES`/`CANDIDATE_POOL_STALE`); taxa de
`CANDIDATE_POOL_STALE` (saúde/freshness do feeder do catálogo) mantida
**separada** da taxa de `NO_ELIGIBLE_CANDIDATES` (composição do
pool/policy/filtros) — nunca agregadas como uma mesma "taxa de falha",
pois apontam causas raiz diferentes; distribuição de `exclusionReasons`;
taxa de `skippedForDiversification`; idade média dos snapshots avaliados
(`poolReadAt` - `sourceOfferSnapshotId.captured_at`).

## Plano de testes

### Casos críticos (obrigatórios)

- Pool com candidatos elegíveis suficientes → `resultStatus = OK`,
  `primaryCandidates.length == requestedCount`.
- Pool com apenas 1 elegível mas `requestedCount = 3` →
  `resultStatus = PARTIAL`.
- Nenhum candidato no pool sobrevive aos hard filters (dados frescos) →
  `NO_ELIGIBLE_CANDIDATES`, `ProductDiscoveryResult` ainda persistido.
- Todos os candidatos do pool relevante fora de `maxSnapshotAgeSeconds` →
  `CANDIDATE_POOL_STALE`, distinto de `NO_ELIGIBLE_CANDIDATES`.
- `ProductSelectionPolicy` inválida/inexistente → `FATAL_ERROR` no
  `JobExecutionReport`, `errorCode = INVALID_SELECTION_POLICY`, **nenhum**
  `ProductDiscoveryResult` criado.
- Erro transitório de banco/infra durante leitura do pool →
  `RETRYABLE_ERROR`, nunca `NO_ELIGIBLE_CANDIDATES`.
- `DiscoveryCommercialSignal` calculado corretamente a partir de
  `score_breakdown` real: `comissao` e `confiancaHistorico` nunca
  influenciam o resultado.
- `reusePolicy = NEVER_REUSE` + produto com histórico de produção de vídeo
  (mesmo antigo) → `exclusionReasons` contém `PREVIOUSLY_USED`.
- `reusePolicy = COOLDOWN` + produto usado dentro da janela →
  `REUSE_COOLDOWN_ACTIVE`; fora da janela → elegível.
- `excludeIfPreviouslyPublishedAsAnyContent = false` → histórico em
  `social_posts` nunca gera exclusão.
- Dois candidatos elegíveis com o mesmo `productGroupId` → só um entra em
  `primaryCandidates`/`alternateCandidates`; o outro fica
  `skippedForDiversification = true` com alternativa disponível.
- `productGroupId` nulo em dois candidatos distintos → nunca são tratados
  como duplicados entre si.
- `tenantId`/`runId` do `ProductDiscoveryInput` divergindo do Job
  confiável da Skill 02 → erro de contrato, nunca processa com o
  tenant/run do payload.
- `eligibleSourceStatuses = ["discovered"]` (MVP) → candidato com qualquer
  outro `sourceCandidateStatus` fica com `SOURCE_STATUS_NOT_ALLOWED`.
- Mudança de `ProductSelectionPolicy` (nova `policyVersion`) não afeta um
  `ProductDiscoveryResult` já persistido — ele continua provando qual
  versão decidiu aquele shortlist.
- `deal_candidates` mudando segundos depois da leitura não altera
  retroativamente um `ProductDiscoveryResult` já criado (snapshot
  histórico).
- Reexecução do mesmo `(jobId, attemptNumber)` após crash pós-persist e
  pré-`reportExecution()` reutiliza o `ProductDiscoveryResult` já existente,
  nunca cria um segundo.
- Tentativa de persistir um segundo `ProductDiscoveryResult` pra mesma
  `(jobId, attemptNumber)` com `resultId`/conteúdo diferente do já
  persistido (colisão real de escrita, nunca detectada recalculando —
  ver Ponto S14) → `DISCOVERY_RESULT_REPLAY_CONFLICT`, nunca sobrescreve.
- `allowedCategorySlugs ∩ excludedCategorySlugs ≠ ∅` → `FATAL_ERROR` com
  `errorCode = INVALID_DISCOVERY_INPUT` (não `INVALID_SELECTION_POLICY`).
- Pool genuinamente vazio (`poolCandidateCount == 0`) →
  `NO_ELIGIBLE_CANDIDATES`, distinto de pool com dados mas sem candidato
  elegível.
- Peso positivo em sinal globalmente `UNAVAILABLE` (ex.:
  `historicalPerformance > 0` no MVP) → `FATAL_ERROR` com
  `errorCode = INVALID_SELECTION_POLICY`.
- Multi-tenant + `excludeIfPreviouslyPublishedAsAnyContent = true` sem
  fonte de exposição tenant-safe → `FATAL_ERROR` com
  `errorCode = INVALID_SELECTION_POLICY`.

**Ponto S9 (`ProductUsageEvidence`):**

- `ProductUsageEvidence` sempre tenant-scoped, sempre com `productId`,
  sempre com `evidenceRef` exato.
- Skill 11 grava `MATERIALIZED` válido; tentativa de `PRIMARY_PUBLISHED`
  → `PRODUCT_USAGE_EVIDENCE_SOURCE_INVALID`.
- Skill 14 grava `MATERIALIZED` válido; mesma rejeição pra
  `PRIMARY_PUBLISHED`.
- Skill 17 grava `PRIMARY_PUBLISHED` válido; tentativa de
  `MATERIALIZED` → `PRODUCT_USAGE_EVIDENCE_SOURCE_INVALID`.
- Provider `ACCEPTED`/`SUBMITTING`/`externalEffectState=UNKNOWN` nunca
  geram `PRIMARY_PUBLISHED`.
- Publicação confirmada e classificada `SECONDARY`/`TEST` não gera
  `PRIMARY_PUBLISHED`.
- `usedAt` vem do timestamp real do fato de origem, nunca de
  `recordedAt`.
- Replay não altera `usedAt`; `recordedAt` não altera
  `productUsageEvidenceHash`.
- Mesma identidade lógica + `evidenceRef` diferente → evidência
  distinta (não reuso).
- Mesma identidade lógica + `usedAt` divergente →
  `PRODUCT_USAGE_EVIDENCE_REPLAY_CONFLICT`.
- Source de tenant diferente do writer →
  `PRODUCT_USAGE_EVIDENCE_TENANT_MISMATCH`.
- Lineage do source não resolve pro `productId` informado →
  `PRODUCT_USAGE_EVIDENCE_PRODUCT_MISMATCH`.
- `minimumUsageEvidenceKind=MATERIALIZED` aceita `MATERIALIZED` e
  `PRIMARY_PUBLISHED`.
- `minimumUsageEvidenceKind=PRIMARY_PUBLISHED` rejeita evidência
  só-`MATERIALIZED`.
- Duas evidências `MATERIALIZED` (Skill11+Skill14) não são
  interpretadas como duas campanhas — `ReusePolicy` usa o `usedAt`
  mais recente entre as qualificantes, nunca `count()`.
- `DRY_RUN` nunca gera `ProductUsageEvidence`.
- Publicação depois deletada, ou vídeo depois descartado → evidência
  permanece no ledger.
- `ReusePolicy` nunca consulta `VideoArtifact`/`FinalizedRendition`/
  `PublicationExecution` diretamente — só `ProductUsageEvidence`.

### Teste real

Adiado — sem schema/migration em produção nesta fase. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `ProductDiscoveryInput`,
  `ProductCandidateEvaluation`, `SelectedProductCandidateRef`,
  `ProductDiscoveryResult`, `ProductSelectionPolicy`,
  `ProductSelectionPolicyBinding`.
- Fronteira clara com Skill 05 (comissão/oferta nunca entra no ranking) e
  com Skills 06/18/19 (tendência e performance histórica nunca calculadas
  aqui).
- `DiscoveryCommercialSignal` com fórmula congelada e rastreável até
  `score_breakdown` real, sem incluir `comissao`/`confiancaHistorico`.
- `ReusePolicy` desacoplada da regra legada de `social_posts` — histórico
  próprio de produção/publicação de vídeo do tenant é a fonte real.
- `resultStatus` distingue `PARTIAL`/`NO_ELIGIBLE_CANDIDATES`/
  `CANDIDATE_POOL_STALE`; `INVALID_SELECTION_POLICY` tratado como erro de
  execução, não como resultado de descoberta.
- Quando a execução alcança um resultado de domínio válido (`OK`,
  `PARTIAL`, `NO_ELIGIBLE_CANDIDATES` ou `CANDIDATE_POOL_STALE`), o
  `ProductDiscoveryResult` é persistido como snapshot histórico imutável,
  mesmo em resultado vazio. `FATAL_ERROR` e `RETRYABLE_ERROR` **não**
  fabricam `ProductDiscoveryResult`.
- Multi-tenant documentado corretamente: catálogo compartilhado vs.
  seleção/produção tenant-scoped.

## Dependências

Skill 01 — Orquestrador de Produção (emite `LogicalJobIntent` com
`stage = PRODUCT_DISCOVERY`). Skill 02 — Gestor de Fila/Jobs (materializa
o `Job`, invoca o handler desta Skill, consome `JobExecutionReport`).
Skill 05 — Análise de Oferta/Comissão (ainda não especificada; consome o
shortlist desta Skill). Interface Skill 01↔02 já congelada é reaproveitada
sem alteração — Skill 04 não introduz outbox novo.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão:

- `maxSnapshotAgeSeconds` padrão;
- `cooldownSeconds` padrão para `reusePolicy = COOLDOWN`;
- pesos concretos de `rankingWeights` (hoje só a estrutura está congelada);
- valores concretos/defaults de `avoidSameProductGroup`, `maxPerCategory` e
  `preferDistinctCategories` nas policies iniciais (o formato de
  `diversificationRules` em si já está congelado nos Contratos);
- quando/como o feeder do catálogo passa a gravar `sourceScoringVersion`
  (`VERSIONED`) em vez do `LEGACY_UNVERSIONED` atual.
