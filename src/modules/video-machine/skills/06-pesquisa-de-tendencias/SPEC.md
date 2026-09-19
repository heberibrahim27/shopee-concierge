# Skill 06 — Pesquisa de Tendências

> **IMPLEMENTATION STATUS: `DEFERRED_V2_CONTRACT`** (Ponto M5, reparo
> transversal pós-revisão Fable, 2026-09-18 —
> `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`, contrato completo em
> `src/modules/video-machine/IMPLEMENTATION-SCOPE.md`). V1 runtime: **NOT
> IMPLEMENTED, NOT SCHEDULED, NOT REQUIRED FOR PRODUCTION.** Este SPEC
> continua especificado/revisável, mas não entra no acceptance gate V1
> — `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1 MUST NOT require a Skill06
> execution to complete a V1 ProductionRun`. O V1 opera `Skill05 →
> Skill07` sem execução intermediária desta Skill (Skill07 já foi
> corrigida no mesmo Ponto M5 para tratar `trendResearchResultId`
> ausente com a mesma semântica de `NO_SOURCES_AVAILABLE`/EVERGREEN).
> Não é `DEPRECATED`/`LEGACY` — é trabalho futuro congelado.

> **APROVADA EM ESPECIFICAÇÃO — 6/25** (2026-09-18). Especificação/contrato.
> **Sem implementação ainda** — nenhuma migration, tabela, RPC, worker ou
> cron foi criado. Este arquivo só vira código depois da revisão do Claude
> Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code, fundamentado
> em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`). Diferente das Skills 04/05,
> essa auditoria não encontrou nenhuma fonte de dado de tendência
> operacional hoje — a especificação reflete essa realidade explicitamente,
> em vez de inventar sinais/fórmulas sobre dado inexistente. Interface
> Skill 01 ↔ Skill 06 via Skill 02 (fila de Jobs) congelada, reaproveitando
> o outbox já existente sem alteração.

## Garantia central

A Skill 06 pesquisa e normaliza **evidências externas de tendência**
relevantes aos candidatos aprovados economicamente pela Skill 05,
produzindo um conjunto auditável de evidências/sinais. Ela **não** escolhe
o conceito final do vídeo (Skill 07) e **não** altera a seleção econômica
feita pela Skill 05.

**A Skill 06 só produz evidência de tendência quando uma fonte real e
autorizada a forneceu.** Ausência de integração, ausência de evidência e
falha de provider são estados distintos, nunca confundidos. Nenhuma
métrica, score, crescimento ou tendência é **inferida** para preencher
lacunas — o mesmo princípio que impediu a Skill 04/05 de inventar
semântica sobre dado que não existe.

## Objetivo

Ler o `OfferAnalysisResult` autoritativo da Skill 05, consultar fontes
externas de tendência **realmente disponíveis** (via `TrendProvider`),
preservar a evidência observada com proveniência completa, e produzir um
`TrendResearchResult` auditável — sem fabricar sinais normalizados
(`viralityScore`, `trendVelocity`, etc.) sobre fontes que hoje não
existem no repositório.

## Responsabilidades

- Executar `Job`s `TREND_RESEARCH` materializados e controlados pela
  Skill 02, recebendo `TrendResearchInput` dentro de um `JobAttempt`
  válido — mesmo padrão de execução das Skills 04/05 (Skill de execução
  comum via fila de Jobs, **sem outbox próprio**).
- Ler o `OfferAnalysisResult` autoritativo (via `offerAnalysisResultId`) e
  os candidatos economicamente aprovados pela Skill 05.
- Consultar, via `TrendProvider` (interface — sem hardcode de plataforma
  dentro da Skill), fontes de tendência **realmente executáveis** para a
  `TrendResearchPolicy` vigente.
- Preservar toda evidência observada com proveniência completa
  (`providerField`, `capturedAt`, `rawEvidenceHash`) — nunca transformar
  automaticamente um dado bruto (`views=12300`) num score derivado sem uma
  fórmula versionada e calibrada sobre população real.
- Persistir `TrendResearchResult` durável, distinguindo explicitamente
  "não há fonte disponível" de "fonte executou e não achou evidência
  relevante".
- Devolver `JobExecutionReport` com `resultRef` apontando para o
  `TrendResearchResult`.

## Não é responsabilidade

- Recalcular comissão, desconto ou `offerScore` — Skill 05.
- Redescobrir produtos fora do conjunto autorizado pela Skill 05.
- Usar performance dos **nossos próprios** conteúdos como se fosse
  tendência externa — isso pertence às Skills 18/19 (Coletor de
  Métricas/Analista de Performance). Analytics de conta própria (mesmo
  quando existir) é uma capacidade estruturalmente diferente de pesquisa
  de tendência externa/de mercado.
- Escolher roteiro, hook final ou conceito criativo definitivo — Skill 07.
- Tratar "ausência de dado" como tendência zero, ou inventar métricas
  quando uma plataforma não fornece um sinal confiável.
- Usar navegador/RPA como bypass de autenticação, anti-bot ou restrição de
  acesso — quando autorizado, é só fallback de coleta.

## Quando é chamada

- Quando um worker da Skill 02 adquire lease (`EXECUTE_NEW_ATTEMPT`) de um
  `Job` com `stage = TREND_RESEARCH`.

## Quem pode chamar

- Skill 01, indiretamente via `LogicalJobIntent` (outbox) → Skill 02 →
  handler da Skill 06.

## Quais Skills ela pode chamar

Nenhuma diretamente. Reporta o resultado via `reportExecution()` da
Skill 02 (`JobExecutionReport`), que gera `JobResultEvent` →
`Skill01.advanceRun()`.

## Fluxo

```
Skill04 → shortlist de produtos
Skill05 → shortlist economicamente válido (OfferAnalysisResult)
Skill06 → pesquisa evidência externa de tendência (via TrendProvider)
        → TrendResearchResult
Skill07 → combina produto + oferta + tendências (ou segue sem tendência)
        → direção criativa
```

## Três camadas (mesmo padrão de dado da Skill 05)

```
1. RAW TREND EVIDENCE
   evidência observada na fonte: views, likes, shares, growth, recency,
   keyword rank, hashtag, áudio, formato etc. — SÓ quando realmente
   disponível, nunca inferido.

2. NORMALIZED TREND SIGNALS
   sinais derivados/versionados pela Skill06 — hoje TODOS UNAVAILABLE
   (ver "Sinais — congelados como UNAVAILABLE" abaixo).

3. CREATIVE INTERPRETATION
   "usar POV", "usar unboxing", "usar determinado hook"
   → NÃO pertence à Skill06 → pertence à Skill07.
```

## Auditoria real de fontes (2026-09-18) — matriz de disponibilidade

Auditoria via grep completo do repositório + `list_tables` no banco live.
Distinção deliberada entre **capacidade arquitetural** (a plataforma
externa suporta) e **disponibilidade executável** (existe adapter/provider
real neste repositório) — ter credencial, pacote instalado ou função
morta não é suficiente para `AVAILABLE`.

| Fonte / Capacidade | Estado |
|---|---|
| TikTok — pesquisa de tendência externa | `UNAVAILABLE` (zero código/credencial/SDK) |
| Pinterest — pesquisa de tendência | `UNAVAILABLE` (só meta tag de verificação de domínio, não API) |
| Google Trends | `UNAVAILABLE` (zero menção no código/`package.json`) |
| Instagram — pesquisa de tendência externa | `UNAVAILABLE` |
| Instagram — analytics de conta própria | não implementado (fora de escopo da Skill06 de qualquer forma) |
| Windsor.ai — leitura orgânica (IG/TikTok) | capacidade existe na *plataforma* Windsor, mas `NOT_IMPLEMENTED` neste repo — só as `actions` de escrita (`create_image_post`/`create_comment`/`create_story`) são usadas hoje |
| Metricool | `NOT_INTEGRATED` (zero código, ferramenta usada manualmente fora do sistema) |
| Browser/RPA para trends | `NOT_IMPLEMENTED` |
| Persistência de `TrendEvidence` | `NOT_IMPLEMENTED` (nenhuma tabela relacionada a trend/hashtag/áudio/viral nas 15 tabelas live) |

**Conclusão factual:** hoje, uma execução real da Skill 06 cairia
estruturalmente em `NO_SOURCES_AVAILABLE` — não existe nenhum
`TrendProvider` implementado. A especificação abaixo é deliberadamente
capability-aware desde a V1: contratos de evidência/execução/política são
congelados agora; fórmulas de sinal normalizado (`viralityScore` etc.)
ficam explicitamente adiadas até existir população real de dados para
calibrar — mesmo princípio que produziu `COMMISSION_RATE_SIGNAL_V1` na
Skill 05 a partir de dado real, nunca chutado.

## Sinais — congelados como `UNAVAILABLE`

Nenhuma fórmula V1 é publicada antes de existir uma população real de
dados para auditar/calibrar (mesmo requisito que produziu as calibrações
da Skill 05). Congelado explicitamente:

```
TREND_VELOCITY_SIGNAL       = UNAVAILABLE
VIRALITY_SIGNAL             = UNAVAILABLE
CROSS_PLATFORM_TREND_SIGNAL = UNAVAILABLE
AUDIO_TREND_SIGNAL          = UNAVAILABLE
HASHTAG_TREND_SIGNAL        = UNAVAILABLE
```

Isso não significa que nunca existirão — significa que nenhuma fórmula é
publicada antes do ciclo já estabelecido: dados reais → distribuição/
comportamento → semântica dos campos → normalização → versão congelada.

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
// OfferRankedCandidateRef — tipo COMPARTILHADO, definido no SPEC.md da
// Skill 05 (não redefinido aqui).

type TrendResearchInput = {
  tenantId: string;
  runId: string;

  offerAnalysisResultId: string; // AUTORIDADE — sempre reaberto, fonte de
    // verdade da sequência de candidatos.
    // PATCH (Ponto M2, reparo transversal pós-revisão Fable, 2026-09-18,
    // CONTRACT_CONVENTIONS_V1): campo "candidateRefs?" removido — mesmo
    // achado da Skill05 (REDUNDANT_DEFENSIVE_REFERENCE, categoria B).
    // Skill06 sempre deriva a sequência de offerAnalysisResultId, nunca
    // do payload do caller.

  trendResearchPolicyKey: string;
};

// Validação do OfferAnalysisResult referenciado (trustedTenantId = Job.tenantId):
//   - precisa existir
//   - tenantId/runId precisam bater com o Job confiável
//   - resultStatus precisa ser OK ou PARTIAL
//   - primaryCandidates + alternateCandidates, NA ORDEM PERSISTIDA, formam
//     o conjunto autoritativo analisável pela Skill06

type TrendResearchPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  sourceRequirements: {
    allowedSourceKeys: string[];   // pode listar fontes conceituais
      // (TIKTOK/PINTEREST/GOOGLE_TRENDS) mesmo sem provider implementado —
      // permite NO_SOURCES_AVAILABLE auditável em vez de fingir que a
      // fonte não existe conceitualmente
    requiredSourceKeys?: string[]; // subconjunto de allowedSourceKeys
    minSuccessfulSources?: number;
  };

  allowNoEvidence: boolean;

  createdAt: string;
};
// Imutável por (policyId, policyVersion) — mesmo padrão das policies
// anteriores. Policies iniciais do MVP: requiredSourceKeys=[],
// minSuccessfulSources ausente/0, allowNoEvidence=true — mesmo padrão de
// "campo existe no contrato, desligado até haver motivo real de negócio
// pra ligar" já usado com minDiscountRatePercent na Skill05 (aqui o
// motivo seria "existe pelo menos 1 provider implementado").

type TrendResearchPolicyBinding = {
  tenantId: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
};

// Invariantes de validação da policy — violação de qualquer uma:
// INVALID_TREND_RESEARCH_POLICY (FATAL_ERROR), nenhum TrendResearchResult fabricado.
//   requiredSourceKeys ⊆ allowedSourceKeys
//   minSuccessfulSources, quando presente: inteiro >= 0, <= |allowedSourceKeys|
//   sourceKey duplicada em allowedSourceKeys -> inválida
//   allowNoEvidence=false + allowedSourceKeys vazio -> inválida

type TrendProviderImplementationStatus = "IMPLEMENTED" | "NOT_IMPLEMENTED";

type TrendRuntimeAvailability =
  | "AVAILABLE"
  | "CONDITIONALLY_AVAILABLE"
  | "UNAVAILABLE"
  | "UNKNOWN";

type TrendSourceCapability = {
  sourceKey: string;
  providerKey?: string;

  implementationStatus: TrendProviderImplementationStatus;
  runtimeAvailability: TrendRuntimeAvailability;

  executable: boolean; // true SOMENTE quando implementationStatus=IMPLEMENTED
    // E runtimeAvailability=AVAILABLE. CONDITIONALLY_AVAILABLE não vira
    // executável automaticamente — a condição precisa estar satisfeita
    // NAQUELA execução. Credencial ou capacidade comercial do fornecedor
    // (ex.: Windsor.ai ter leitura orgânica na plataforma) NÃO substitui
    // implementação real no repositório.

  reasonCode?:
    | "NO_PROVIDER_IMPLEMENTED"
    | "NOT_CONFIGURED"
    | "AUTHORIZATION_REQUIRED"
    | "PERMISSION_MISSING"
    | "REGION_UNAVAILABLE"
    | "RUNTIME_UNAVAILABLE"
    | "CAPABILITY_NOT_VERIFIED";

  supportedMetricKeys: string[];
  capabilityVersion: string;
  checkedAt: string;
};

// TrendProvider — interface conceitual, sem hardcode de plataforma dentro
// da Skill06:
//   interface TrendProvider {
//     getCapabilities(): TrendProviderCapabilities;
//     searchEvidence(request: TrendProviderSearchRequest): Promise<TrendProviderSearchResult>;
//   }
// Futuros: TikTokTrendProvider, PinterestTrendProvider, GoogleTrendsProvider,
// WindsorOrganicProvider, LicensedTrendDataProvider, AuthorizedBrowserTrendProvider
// — NENHUM declarado implementado hoje (ver "Estado real do MVP" abaixo).

type ObservedTrendMetric = {
  metricKey: string;
  value: number | string | boolean;
  unit?: string;

  providerField: string; // preserva o campo bruto do provider (ex.:
    // "stats.playCount") — o fato observado é "o provider informou
    // stats.playCount=12300", NUNCA transformado automaticamente em
    // "virality=82"
  observedAt: string;
};

type TrendSubjectRef = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;
}; // evidência amarrada ao candidato EXATO analisado, não só ao productId
   // — mesmo princípio de auditabilidade das Skills 04/05

type TrendEvidence = {
  evidenceId: string;

  tenantId: string; // sempre trustedTenantId = Job.tenantId — NUNCA vem
    // do payload do provider. Permite aplicar ownership tenant-scoped
    // também a rawEvidenceRef.
  sourceExecutionId: string; // referencia o SourceExecutionResult que a
    // produziu — base da unicidade lógica (sourceExecutionId, evidenceHash)

  subjectRef: TrendSubjectRef;

  sourceKey: string;
  providerKey: string;

  externalRef?: string;

  queryContext: {
    queryTerms: string[];
    locale?: string;
    region?: string;
  };

  capturedAt: string;

  observedMetrics: ObservedTrendMetric[];

  rawEvidenceRef?: string;  // aponta futuramente para payload/blob
    // persistido quando houver necessidade — não obriga armazenamento
    // bruto para todo provider
  rawEvidenceHash?: string;

  evidenceHash: string; // "TREND_EVIDENCE_V1:sha256:<hex>" — calculado
    // sobre JSON canônico de: subjectRef, sourceKey, providerKey,
    // externalRef?, queryContext, capturedAt, observedMetrics (ordenadas
    // deterministicamente), rawEvidenceHash?. NUNCA inclui evidenceId nem
    // createdAt (identidade/persistência, não conteúdo observado).

  createdAt: string;
};

// PATCH (Ponto M1, reparo transversal pós-revisão Fable, 2026-09-18,
// CONTRACT_CONVENTIONS_V1, contrato completo em
// contracts/CONTRACT-CONVENTIONS.md): value ref canônico pra qualquer
// consumer que precise referenciar um TrendEvidence exato sem carregar
// naked evidenceId. Skill 06 continua owner — consumers só
// importam/referenciam, nunca redeclaram. Sem hash próprio.
type TrendEvidenceRef = {
  evidenceId: string;
  evidenceHash: string;
};
// Skill 07 (`applicableTrendEvidence`) já carrega evidenceId+evidenceHash
// inline — semanticamente equivalente a TrendEvidenceRef, já era exact
// ref antes deste ponto, nada a corrigir lá. Se um consumer futuro
// precisar de referência solta a um TrendEvidence exato, usa este tipo.

// Sinais normalizados — TODOS explicitamente indisponíveis nesta versão:
//   TREND_VELOCITY_SIGNAL       = UNAVAILABLE
//   VIRALITY_SIGNAL             = UNAVAILABLE
//   CROSS_PLATFORM_TREND_SIGNAL = UNAVAILABLE
//   AUDIO_TREND_SIGNAL          = UNAVAILABLE
//   HASHTAG_TREND_SIGNAL        = UNAVAILABLE
// Logo TrendEvidence não possui trendScore nem campo de score derivado.

type TrendSourceExecutionStatus =
  | "SUCCEEDED_WITH_EVIDENCE" // executou corretamente, >=1 evidência
  | "SUCCEEDED_NO_EVIDENCE"   // executou corretamente, 0 evidências
  | "NOT_EXECUTABLE"          // nenhum provider executável naquele momento
  | "FAILED_RETRYABLE"        // era executável, chamado, falhou transitoriamente
  | "FAILED_FATAL";           // era executável, falhou de forma não retryable
// CRÍTICO: NOT_EXECUTABLE nunca vira SUCCEEDED_NO_EVIDENCE — "não pude
// executar" é sempre distinto de "executei e não encontrei nada".

// SourceExecutionResult — definição canônica na seção "Resolução de
// providers e fallback" abaixo (inclui sourceExecutionId, providerAttempts
// e resolvedProviderKey; não redefinida duas vezes neste arquivo).

// successfulSource = status ∈ {SUCCEEDED_WITH_EVIDENCE, SUCCEEDED_NO_EVIDENCE}
// — mede capacidade de pesquisa efetivamente CONCLUÍDA, não volume de
// evidência. minSuccessfulSources da policy mede isso, não quantidade de
// TrendEvidence produzida.

type TrendResearchResultStatus =
  | "OK"                  // evidenceCount > 0 e requisitos da policy satisfeitos
  | "PARTIAL"              // evidenceCount > 0 mas requisitos da policy NÃO satisfeitos
  | "NO_EVIDENCE_FOUND"    // >=1 fonte concluiu com sucesso, evidenceCount == 0
  | "NO_SOURCES_AVAILABLE"; // executableSourceCount == 0
// OFFER_ANALYSIS_RESULT_NOT_RESEARCHABLE NÃO é um resultStatus — é
// FATAL_ERROR do JobExecutionReport (ver "Erros" abaixo).

type TrendResearchResult = {
  resultId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  offerAnalysisResultId: string;

  resultStatus: TrendResearchResultStatus;

  policySatisfied: boolean; // separa FATO (resultStatus) de DECISÃO DE
    // NEGÓCIO (a policy autoriza seguir mesmo sem fonte/evidência?) —
    // mesmo princípio de COMPLETED != sucesso de negócio, generalizado.
    // Ex.: zero providers implementados + allowNoEvidence=true ->
    // resultStatus=NO_SOURCES_AVAILABLE mas policySatisfied=true.

  offerCandidateSetHash: string; // "TREND_CANDIDATE_SET_V1:sha256:<hex>" —
    // fingerprint sobre a sequência canônica (primaryCandidates seguido
    // de alternateCandidates) do OfferAnalysisResult efetivamente
    // recebido. NOME diferente do candidateSetHash da Skill05 de
    // propósito: aquele prova o input Skill04->Skill05
    // (OFFER_CANDIDATE_SET_V1); este prova o OUTPUT Skill05->Skill06
    // (TREND_CANDIDATE_SET_V1) — nomes de campo distintos evitam
    // confundir proveniência ao auditar entre Skills.
  capabilitySnapshotHash: string; // "TREND_CAPABILITY_SET_V1:sha256:<hex>" —
    // fingerprint das TrendSourceCapability consideradas nesta execução
    // (ordenadas por sourceKey+providerKey) — explica auditavelmente por
    // que o resultado foi NO_SOURCES_AVAILABLE

  consideredSourceCount: number;
  executableSourceCount: number;
  successfulSourceCount: number;

  evidenceCount: number;

  trendResearchPolicyId: string;
  trendResearchPolicyVersion: string;
  trendResearchPolicySnapshotHash: string;

  sourceExecutions: SourceExecutionResult[];

  evidenceRefs: Array<{
    evidenceId: string;
    subjectRef: TrendSubjectRef;
    sourceKey: string;
  }>;

  evidenceSchemaVersion: "TREND_EVIDENCE_V1";

  researchStartedAt: string;
  evaluatedAt: string;
  createdAt: string;
};
// Sem rankingSnapshot — não existe ranking de tendências nesta versão.

// policySatisfied — cálculo:
//   sourceRequirementsSatisfied = todas requiredSourceKeys concluíram com
//     sucesso AND successfulSourceCount >= minSuccessfulSources
//   evidenceRequirementSatisfied = evidenceCount > 0 OR allowNoEvidence == true
//   policySatisfied = sourceRequirementsSatisfied AND evidenceRequirementSatisfied
// requiredSourceKeys exige execução BEM-SUCEDIDA, não necessariamente
// evidência, a menos que allowNoEvidence=false.
```

## Precedência determinística de `resultStatus`

```
OFFER_ANALYSIS_RESULT_NOT_RESEARCHABLE (FATAL_ERROR, nenhum TrendResearchResult):
  OfferAnalysisResult ausente/incompatível com o Job, OU resultStatus fora
  de {OK, PARTIAL}, OU candidate set estruturalmente inválido

executableSourceCount == 0
  -> NO_SOURCES_AVAILABLE

executableSourceCount > 0 AND pelo menos uma fonte concluiu com sucesso
  AND evidenceCount == 0
  -> NO_EVIDENCE_FOUND

evidenceCount > 0 AND requisitos da policy NÃO satisfeitos (policySatisfied=false)
  -> PARTIAL

evidenceCount > 0 AND requisitos da policy satisfeitos (policySatisfied=true)
  -> OK
```

Caso existam fontes executáveis mas todas falhem operacionalmente antes
de concluir a pesquisa (sem nenhuma `SUCCEEDED_WITH_EVIDENCE`/
`SUCCEEDED_NO_EVIDENCE`), isso **não** vira `NO_EVIDENCE_FOUND` — a
regra exata de retry/fallback fica para a seção "Idempotência e
operação" abaixo; o importante é nunca transformar falha de
infraestrutura em "não encontrei tendência".

## Estado real do MVP (2026-09-18)

Registrado literalmente para que ninguém, daqui a três meses, olhe este
SPEC e conclua que esses componentes já existem:

```
TikTok provider                    NOT_IMPLEMENTED
Pinterest provider                 NOT_IMPLEMENTED
Google Trends provider             NOT_IMPLEMENTED
Instagram external research        NOT_IMPLEMENTED
Windsor organic-read adapter       NOT_IMPLEMENTED
Metricool adapter                  NOT_IMPLEMENTED
Authorized browser trend provider  NOT_IMPLEMENTED

Persistência runtime de TrendEvidence   NOT_IMPLEMENTED
Trend signals normalizados              UNAVAILABLE
```

## Resolução de providers e fallback

A Skill 06 resolve providers **por source e por tenant**, nunca hardcoded
dentro do handler:

```
TrendResearchPolicy.allowedSourceKeys
  -> trustedTenantId = Job.tenantId
  -> Provider Registry (futuramente Skill 24 — Gestor de Integrações)
  -> capabilities reais naquele instante
  -> plano determinístico por sourceKey
```

Para cada `sourceKey`, pode haver vários providers futuros (ex.:
`TIKTOK_OFFICIAL_PROVIDER` → `LICENSED_DATA_PROVIDER` →
`AUTHORIZED_BROWSER_PROVIDER`). A ordem é determinística e faz parte do
snapshot de capabilities (`providerPriority` entra na projeção canônica
de `TREND_CAPABILITY_SET_V1`). A Skill 06 não executa providers em
paralelo para a mesma fonte por padrão — tenta em ordem até um concluir
com sucesso. **Fallback só entre providers previamente registrados e
autorizados** — nunca "inventa" browser scraping porque a API falhou.

```ts
type TrendProviderAttemptResult = {
  providerKey: string;
  providerPriority: number;

  status: TrendSourceExecutionStatus;

  evidenceIds: string[];

  errorCode?: string;
  errorRef?: string;

  startedAt?: string;
  completedAt?: string;
};

type SourceExecutionResult = {
  sourceExecutionId: string; // identidade canônica do checkpoint —
    // UNIQUE lógico (jobId, attemptNumber, sourceKey) -> um único
    // sourceExecutionId canônico. Base da unicidade lógica
    // (sourceExecutionId, evidenceHash) de TrendEvidence.

  sourceKey: string;

  status: TrendSourceExecutionStatus;

  resolvedProviderKey?: string; // qual provider efetivamente respondeu
    // pela fonte (fallback resolvido)

  providerAttempts: TrendProviderAttemptResult[]; // trilha completa de
    // fallback preservada, mesmo quando um provider anterior falhou

  evidenceIds: string[];

  startedAt?: string;
  completedAt?: string;
};
```

Semântica final da fonte: algum provider conseguiu executar → resultado
da fonte é o resultado daquele provider (para o fallback); nenhum
provider executável → `NOT_EXECUTABLE`; todos falharam e existe pelo
menos uma falha retryable → `FAILED_RETRYABLE`; todos falharam
definitivamente → `FAILED_FATAL`. Isso permite trocar
API → provider licenciado → browser autorizado no futuro sem perder a
trilha de auditoria.

Encadeamento auditável: `TrendResearchResult` → `SourceExecutionResult`
(via `sourceExecutionId`) → `TrendEvidence[]` (via `sourceExecutionId` em
cada evidência).

## Idempotência e operação

Dois níveis, porque a Skill 06 lida com múltiplas fontes externas (mais
complexo que as Skills 04/05):

**Nível 1 — mesmo padrão das Skills 04/05**: no máximo 1
`TrendResearchResult` canônico por `(jobId, attemptNumber)`. Replay
reutiliza o resultado já persistido — **nunca reexecuta pra comparar**
(Ponto S14, reparo transversal pós-revisão Fable, 2026-09-18 — ver
`contracts/RESULT-MATERIALIZATION.md`; tendências são inerentemente
temporais, mudança posterior da fonte é normal, não corruption).
`TREND_RESEARCH_RESULT_REPLAY_CONFLICT` significa só colisão real de
identidade persistida (tentativa de escrever um 2º
`TrendResearchResult` com conteúdo diferente pra mesma chave), nunca
detectado recalculando.

**Nível 2 — checkpoint lógico por fonte**: no máximo 1 `SourceExecution`
canônico por `(jobId, attemptNumber, sourceKey)`. Se uma fonte já chegou
a um estado terminal e foi persistida, replay do mesmo `JobAttempt`
reutiliza aquele checkpoint — **não chama o provider de novo**.
`TrendEvidence` é imutável e, dentro de uma execução de fonte,
`(sourceExecutionId, evidenceHash)` é logicamente único — redelivery da
mesma evidência reutiliza a existente. Isso evita: TikTok respondeu →
evidências persistidas → processo caiu → retomou → chamou TikTok de novo
→ recebeu dataset diferente, quando já havia um resultado durável — mas
a proteção é "não chama o provider de novo quando já há checkpoint
terminal", nunca "chama de novo e compara pra decidir conflict".
`TREND_SOURCE_EXECUTION_REPLAY_CONFLICT` é o mesmo tipo de colisão real
de identidade persistida, agora no nível de fonte.

**Atomicidade entre checkpoint e evidências (obrigatória):** um provider
pode responder com várias evidências e o processo cair no meio da
persistência — ex.: 3 de 5 `TrendEvidence` gravadas, `SourceExecutionResult`
ainda não chegou a estado terminal. Sem uma regra explícita, o replay
chamaria o provider de novo e poderia obter um dataset diferente, mesmo
com evidência parcial já persistida. Por isso:

```
Quando um provider conclui (com sucesso ou falha terminal):
  TrendEvidence[] normalizadas + SourceExecutionResult terminal +
  evidenceIds são persistidos ATOMICAMENTE na mesma transação —
  ou todos ficam duráveis, ou nenhum deles fica.

Sem checkpoint terminal durável -> nenhuma evidência daquela execução
é considerada canônica (mesmo que parte dela tenha sido observada).
```

Se um `rawEvidenceRef` apontar para blob storage no futuro: sanitiza o
payload → grava o blob → só então commit atômico no banco referenciando
o `rawEvidenceRef`. Falha no commit do banco → o blob pode ficar órfão
(limpo posteriormente) e **não conta** como `SourceExecution` concluída.

**Limitação inevitável, declarada explicitamente**: coleta externa **não
é** uma função matemática determinística. Se o processo cair depois da
chamada externa mas antes de qualquer resposta ter sido persistida, uma
nova leitura pode observar dados diferentes. A garantia correta é:
normalização, hashing e avaliação de policy são determinísticos **dados
os mesmos checkpoints/evidências persistidos**. A leitura de uma fonte
externa mutável não possui garantia de repetibilidade quando nenhuma
resposta anterior foi duravelmente registrada — a Skill 06 nunca promete
um determinismo impossível.

### Precedência operacional: falha de fonte × resultado do Job

```
executableSourceCount == 0
  -> TrendResearchResult com resultStatus=NO_SOURCES_AVAILABLE
  -> JobExecutionReport = COMPLETED (resultado de domínio normal)

executableSourceCount > 0 AND nenhuma fonte concluiu com sucesso:
  houve >=1 FAILED_RETRYABLE  -> JobExecutionReport = RETRYABLE_ERROR,
                                  nenhum TrendResearchResult fabricado
  só houve FAILED_FATAL       -> JobExecutionReport = FATAL_ERROR,
                                  nenhum TrendResearchResult fabricado

pelo menos uma fonte concluiu com sucesso (já existe observação de
domínio válida — falhas das demais ficam registradas em
sourceExecutions, TrendResearchResult é produzido):
  evidenceCount == 0 AND successfulSourceCount > 0
    -> NO_EVIDENCE_FOUND
  evidenceCount > 0 AND policySatisfied == false
    -> PARTIAL
  evidenceCount > 0 AND policySatisfied == true
    -> OK
```

Uma fonte requerida pode falhar enquanto outra produz evidência — isso
gera `PARTIAL`/`policySatisfied=false`, não destrói a pesquisa que de
fato aconteceu. Preserva a separação central da Skill 06: `FAILED_RETRYABLE`
≠ "não achei tendência"; `NOT_EXECUTABLE` ≠ "pesquisei e não achei";
só `SUCCEEDED_NO_EVIDENCE` é "pesquisei e não achei".

## Erros e JobExecutionReport

```
FATAL_ERROR (nenhum TrendResearchResult criado/persistido):
  - OFFER_ANALYSIS_RESULT_NOT_RESEARCHABLE
  - TREND_RESEARCH_POLICY_NOT_FOUND
  - TREND_RESEARCH_POLICY_BINDING_NOT_FOUND
  - TREND_RESEARCH_TENANT_MISMATCH
  - INVALID_TREND_RESEARCH_POLICY
  - TREND_RESEARCH_RESULT_REPLAY_CONFLICT
  - TREND_SOURCE_EXECUTION_REPLAY_CONFLICT
  - TREND_PROVIDER_FATAL_FAILURE (só quando nenhuma fonte concluiu com
    sucesso e todas as falhas foram fatais)

RETRYABLE_ERROR:
  - TREND_CAPABILITY_RESOLUTION_FAILED
  - TREND_PROVIDER_TEMPORARY_FAILURE (só quando nenhuma fonte concluiu
    com sucesso e existe pelo menos uma falha retryable)
  - TREND_EVIDENCE_PERSIST_FAILED
  - TRANSIENT_DATASTORE_ERROR
```

Erros específicos de fornecedor (ex.: rate limit do TikTok, erro HTTP do
Pinterest) ficam em `errorRef`/detalhe operacional — o domínio da Skill 06
nunca depende de strings específicas de um provider.

`COMPLETED` (`resultStatus ∈ {OK, PARTIAL, NO_EVIDENCE_FOUND,
NO_SOURCES_AVAILABLE}`) é sucesso técnico, mesma separação já congelada
nas Skills 04/05 entre sucesso técnico do Job e sucesso de negócio do
stage.

## Multi-tenant

```
trustedTenantId = Job.tenantId

TrendResearchInput.tenantId          -> deve == trustedTenantId
OfferAnalysisResult.tenantId         -> deve == trustedTenantId
TrendResearchPolicyBinding.tenantId  -> deve == trustedTenantId
TrendResearchPolicy.tenantId         -> deve == trustedTenantId
TrendResearchResult.tenantId         -> sempre trustedTenantId
provider/integration resolution      -> sempre resolvido no contexto do trustedTenantId
TrendEvidence                        -> ownership do trustedTenantId
```

Qualquer divergência → `TREND_RESEARCH_TENANT_MISMATCH` (`FATAL_ERROR` +
`AuditEvent` de segurança).

**Regra específica da Skill 06 — provider global não significa
credencial global**: um provider pode tecnicamente atender vários
tenants, mas configuração/autorização/credenciais são sempre resolvidas
dentro do contexto do tenant. **Nunca** "tenant A não tem integração
TikTok, então usa a credencial do tenant B/global". Nenhuma deduplicação
cross-tenant de `TrendEvidence` no MVP, mesmo para dados publicamente
observáveis — isso poderá existir futuramente como cache compartilhado
explícito, sanitizado e com proveniência própria, nunca surgindo por
acidente. `rawEvidenceRef`, quando existir, **nunca** guarda token/
cookie/segredo — payload bruto autenticado precisa ser sanitizado antes
de qualquer persistência reutilizável.

## Observabilidade

Log estruturado por source/provider: `resultId`, `tenantId`, `runId`,
`jobId`, `attemptNumber`, `sourceKey`, `providerKey`, `providerPriority`,
`sourceExecutionStatus`, `evidenceCount`, `durationMs`, `policyId`,
`policyVersion`, `errorCode?`. Nunca despeja payload bruto ou métricas
inteiras no log.

`AuditEvent` de criação do `TrendResearchResult` como **resumo**:
`resultId`, `tenantId`, `runId`, `jobId`, `attemptNumber`,
`offerAnalysisResultId`, `resultStatus`, `policySatisfied`,
`consideredSourceCount`, `executableSourceCount`, `successfulSourceCount`,
`evidenceCount`, `offerCandidateSetHash`, `capabilitySnapshotHash`,
`trendResearchPolicyId`/`Version`/`SnapshotHash`, `researchStartedAt`,
`createdAt`. Detalhe fica no `TrendResearchResult`/`TrendEvidence`.

`AuditEvent` explícito também para: `TREND_RESEARCH_RESULT_REPLAY_CONFLICT`,
`TREND_SOURCE_EXECUTION_REPLAY_CONFLICT`, `TREND_RESEARCH_TENANT_MISMATCH`.

Métricas: `no_sources_available_rate`, `no_evidence_found_rate`,
`trend_policy_satisfied_rate`, `source_executable_rate` (por source),
`source_success_rate` (por source), `provider_fallback_rate`,
`provider_retryable_failure_rate`, `provider_fatal_failure_rate`,
`evidence_count` (por source), `research_duration`. **No MVP atual,
`no_sources_available_rate` tenderá a 100% — isso não é "erro", é a
fotografia honesta da implementação atual** (ver "Estado real do MVP").

## Consequência para a Skill 07

A Skill 07 precisa aceitar dois caminhos, nunca travar por falta de
tendência:

```
OfferAnalysisResult + TrendResearchResult COM evidências
  -> conceito informado por trends

OfferAnalysisResult + TrendResearchResult NO_SOURCES_AVAILABLE/NO_EVIDENCE_FOUND
  -> conceito evergreen / baseado no produto
```

## Plano de testes

### Casos críticos (obrigatórios)

- Zero providers implementados + policy inicial permissiva →
  `NO_SOURCES_AVAILABLE`, `policySatisfied=true`, `COMPLETED`.
- Zero providers + `TikTok` obrigatório (`requiredSourceKeys`) →
  `NO_SOURCES_AVAILABLE`, `policySatisfied=false`.
- Provider executa e retorna zero evidências → `NO_EVIDENCE_FOUND`.
- Provider retorna evidência + policy satisfeita → `OK`.
- Evidência existe, mas `requiredSource` não concluiu → `PARTIAL`,
  `policySatisfied=false`.
- `allowNoEvidence=true` + busca concluída sem evidência →
  `NO_EVIDENCE_FOUND`, mas `policySatisfied=true`.
- `allowNoEvidence=false` + zero evidências → `NO_EVIDENCE_FOUND`,
  `policySatisfied=false`.
- `NOT_EXECUTABLE` nunca é contado como `SUCCEEDED_NO_EVIDENCE`.
- `successfulSourceCount` conta `SUCCEEDED_WITH_EVIDENCE` e
  `SUCCEEDED_NO_EVIDENCE`, nunca volume de evidências.
- `executable=true` só é permitido com `IMPLEMENTED` + `AVAILABLE`
  simultaneamente.
- Capability de Windsor existente comercialmente na plataforma, mas sem
  adapter no repo → `NOT_IMPLEMENTED`, nunca `executable=true`.
- Fallback: provider A `NOT_EXECUTABLE` → provider B executa com
  sucesso, `resolvedProviderKey=B`.
- Provider A `FAILED_RETRYABLE` → fallback B executa com sucesso;
  `providerAttempts` preserva a trilha dos dois.
- Nenhum provider da fonte executável → `SourceExecutionResult` final
  `NOT_EXECUTABLE`.
- Todos os providers falham e existe falha retryable → fonte
  `FAILED_RETRYABLE`.
- Todas as fontes executáveis falham retryably e nenhuma pesquisa
  conclui → `RETRYABLE_ERROR`, sem `TrendResearchResult`.
- Todas falham fatalmente e nenhuma conclui → `FATAL_ERROR`, sem
  resultado fictício.
- Uma fonte conclui com sucesso e outra falha fatalmente → resultado de
  domínio ainda é persistido; `policySatisfied` decide completude.
- (Ponto M2) `candidateRefs?` removido do input — Skill06 sempre deriva
  a sequência de `offerAnalysisResultId`, nunca de payload do caller.
- Tenant divergente em input/upstream/policy/provider →
  `TREND_RESEARCH_TENANT_MISMATCH`.
- Mesma evidência produz o mesmo hash `TREND_EVIDENCE_V1` independente
  de `evidenceId`/`createdAt`.
- Mudança em `ObservedTrendMetric` muda o `evidenceHash`.
- Crash após `SourceExecution` terminal persistida → replay reutiliza o
  checkpoint, não chama o provider de novo.
- Crash após `TrendResearchResult` persistido e antes de
  `reportExecution()` → replay retorna o mesmo resultado; incompatibilidade
  → `TREND_RESEARCH_RESULT_REPLAY_CONFLICT`.
- Provider retorna evidências, mas o processo falha durante a
  persistência **antes** do commit atômico → transação faz rollback de
  `SourceExecutionResult` + `TrendEvidence`; replay pode chamar o
  provider novamente; nenhuma evidência parcial/órfã entra no
  `TrendResearchResult`.
- `AUTHORIZED_BROWSER_PROVIDER`: só provider registrado/autorizado pode
  ser selecionado; ausência/falha de API **jamais** habilita browser
  arbitrário como fallback implícito.

### Teste real

Adiado — sem schema/migration em produção nesta fase, e sem nenhum
provider implementado ainda. Acontece na fase de implementação, depois
da revisão do Fable 5 Max e do GPT-6 Astra, e depois do primeiro provider
real ser construído.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `TrendResearchInput`,
  `TrendResearchPolicy`/`Binding`, `TrendSourceCapability`,
  `TrendEvidence`, `SourceExecutionResult`, `TrendResearchResult`.
- Especificação reflete a auditoria real (2026-09-18): nenhuma fonte de
  tendência operacional hoje, registrado literalmente como "Estado real
  do MVP" — nenhum componente é declarado implementado sem sê-lo.
  Nenhum `viralityScore`/`trendVelocity`/formula inventada sobre dado que
  não existe.
  Distinção `implementationStatus` vs. `runtimeAvailability` capturando o
  achado central da auditoria (capacidade arquitetural ≠ disponibilidade
  executável).
- `resultStatus` distingue `NO_SOURCES_AVAILABLE` de `NO_EVIDENCE_FOUND`
  com precedência determinística; `policySatisfied` separado de
  `resultStatus` (fato técnico vs. decisão de negócio).
- `NOT_EXECUTABLE` nunca confundido com `SUCCEEDED_NO_EVIDENCE`; falha de
  infraestrutura nunca vira "não encontrei tendência".
- Fronteira clara com Skill 05 (não recalcula economia), Skill 07 (não
  escolhe conceito criativo — aceita os dois caminhos, com e sem
  evidência) e Skills 18/19 (analytics de conta própria é capacidade
  diferente).
- Idempotência em dois níveis (resultado + checkpoint por fonte) e
  honestidade explícita sobre a não-determinabilidade de leitura externa.
- Multi-tenant documentado, incluindo a regra "provider global não é
  credencial global" e sanitização de evidência bruta.

## Dependências

Skill 01 — Orquestrador de Produção (emite `LogicalJobIntent` com
`stage = TREND_RESEARCH`). Skill 02 — Gestor de Fila/Jobs (materializa o
`Job`, invoca o handler desta Skill, consome `JobExecutionReport`).
Skill 05 — Análise de Oferta/Comissão (produz o `OfferAnalysisResult`
autoritativo consumido aqui). Skill 07 — Direção Criativa (ainda não
especificada; consome `TrendResearchResult`, precisa aceitar os dois
caminhos). Skill 24 — Gestor de Integrações (ainda não especificada;
futuro lar do Provider Registry). Interface Skill 01↔02 já congelada é
reaproveitada sem alteração — Skill 06 não introduz outbox novo.

## Questões abertas

Nenhum bloqueio arquitetural conhecido — a especificação é deliberadamente
capability-aware e não depende de nenhum provider existir para ser
coerente.

Adiado para quando o primeiro provider real existir (nunca antes,
mesmo princípio que produziu as calibrações reais das Skills 04/05):

- fórmulas de `TREND_VELOCITY_SIGNAL`/`VIRALITY_SIGNAL`/
  `CROSS_PLATFORM_TREND_SIGNAL`/`AUDIO_TREND_SIGNAL`/`HASHTAG_TREND_SIGNAL`
  — dependem de população real de dados para calibrar;
- qual será o primeiro `TrendProvider` implementado (TikTok? Windsor
  organic-read? browser autorizado?) — decisão de produto/negócio, não
  arquitetural;
- desenho exato do Provider Registry (provavelmente parte da Skill 24);
- formato exato de armazenamento de `rawEvidenceRef` (blob storage?
  quais provedores precisam disso?).

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão:

- `allowedSourceKeys` concretos nas policies iniciais (a estrutura já
  está congelada nos Contratos);
- timeout/retry policy exata por provider;
- se/quando `requiredSourceKeys` deixa de estar vazio em alguma policy —
  só quando existir pelo menos 1 provider implementado.
