# Contract Lint — governança de contratos das 25 Skills

> **Ponto G do reparo transversal pós-revisão Fable** (2026-09-18).
> Resolve a segunda metade do achado B6 da revisão do Claude Fable 5 Max:
> nossas verificações A-F eram locais (arquivo por arquivo) e baseadas
> demais em grep/manual — o Fable provou que isso gera falso negativo
> (achou duplicatas reais que nenhuma das 25 aprovações individuais
> pegou). Este documento não pertence a nenhuma Skill e não cria
> "Skill 26" — é uma camada de QA da especificação inteira, desenhada
> junto ao ChatGPT.

## Regra central

```text
25 SPEC.md
  → parse estrutural (AST TypeScript real, não regex)
  → ownership
  → cross-skill references
  → hashes
  → errors
  → superseded contracts
  → zero ambiguidades
  → snapshot reproduzível

só então: "arquitetura consolidada"
```

Método: **não usar regex como verificador primário de tipos
TypeScript.** Extrair os blocos ` ```ts `/` ```typescript ` do Markdown
de cada SPEC.md e parsear com o compilador real do TypeScript (AST),
não com heurísticas de texto.

## Escopo implementado nesta rodada (V1 real, executável)

Ferramenta real em [`scripts/contract-lint.mjs`](../../../scripts/contract-lint.mjs)
(`node scripts/contract-lint.mjs`), usando a API do compilador
TypeScript (`typescript` já é dependência do projeto). Cobre:

- **G016/G017 — corpus**: exige exatamente as 25 `SPEC.md` esperadas
  (`skills/01-*` a `skills/25-*`), nem uma a menos nem uma inesperada.
- **`G_S10_CANONICAL_SERIALIZATION_REFERENCE_MISSING`** (adicionada
  2026-09-18, sugestão da seção 42 de
  [`contracts/CANONICAL-SERIALIZATION.md`](contracts/CANONICAL-SERIALIZATION.md)):
  cada um dos 25 `SPEC.md` precisa conter referência textual a
  `CANONICAL_SERIALIZATION_V1` (checagem barata, não parseia hash
  projections).
- **`G_S11_AUDIT_EVENT_REFERENCE_MISSING`** /
  **`G_S11_AUDIT_EVENT_LOCAL_REDECLARATION`** (adicionadas 2026-09-18,
  sugestão da seção 57 de
  [`contracts/AUDIT-EVENT.md`](contracts/AUDIT-EVENT.md)): todo
  `SPEC.md` que menciona o token `AuditEvent` precisa referenciar
  `AUDIT_EVENT_V1`, e nenhum pode declarar `type`/`interface
  AuditEvent` localmente.
- **`G_S12_LEGACY_ERROR_FIELD_UNMARKED`** (adicionada 2026-09-18,
  sugestão da seção 18 de
  [`contracts/ERROR-TAXONOMY.md`](contracts/ERROR-TAXONOMY.md)):
  varre `PropertySignature` do AST real por `errorClass`/
  `retryableErrorClasses` — se encontrado sem a palavra
  LEGACY/SUPERSEDED/NON-AUTHORITATIVE por perto, é erro.
- **`G_S13_CONSUMED_AT_OUTSIDE_ALLOWLIST`** /
  **`G_S13_CONSUMED_AT_UNMARKED`** (adicionadas 2026-09-18, sugestão
  das seções 39-40 do debate S13): `consumedAt` como campo só é
  permitido numa allowlist explícita de tipos legados
  (`LogicalJobIntent`, `JobBlockedEvent`, `JobResultEvent`,
  `ApprovalResolvedEvent`), sempre marcado LEGACY/NON-AUTHORITATIVE.
  Qualquer `type` **novo** com `consumedAt` é erro — impede o padrão
  single-consumer legado (a contradição que o Fable achou) de se
  espalhar de novo. Rodando esta checagem pela primeira vez, achou um
  caso real que nem o Fable nem o ChatGPT tinham citado:
  `ApprovalResolvedEvent.consumedAt` na Skill 03 — mesmo padrão de bug,
  corrigido no mesmo commit.
- **`G_S14_RESULT_MATERIALIZATION_REFERENCE_MISSING`** /
  **`G_S14_CONTRADICTORY_REPLAY_LANGUAGE`** (adicionadas 2026-09-18,
  sugestão da seção 40 do debate S14): Skills 04-08 precisam referenciar
  `RESULT_MATERIALIZATION_V1`, e nenhuma pode conter as frases
  contraditórias antigas ("resultado logicamente incompatível",
  "reexecução que produziria", "recalcula e compara") — checagem
  textual simples, sem parser semântico de prosa. Achou um terceiro
  ponto real na Skill 05 (bloco de testes críticos) que não tinha sido
  visto na primeira passada manual.
- **`G_S15_CREDENTIAL_HANDLE_MISSING`** /
  **`G_S15_PLANNING_TYPE_HAS_CREDENTIAL_HANDLE`** /
  **`G_S15_RAW_SECRET_FIELD`** (adicionadas 2026-09-18, sugestão das
  seções 48-49 do debate S15): via AST real, `VideoGenerationExecution`
  (Skill 11), `OutboundSendCheckpoint` (Skill 16) e `PublicationExecution`
  (Skill 17) precisam ter `credentialHandleRef`; `VideoProviderTarget`
  (Skill 10, planejamento) NUNCA pode ter esse campo — separação
  planning/execution. Além disso, nenhum artifact de domínio pode
  declarar um campo chamado `apiKey`/`accessToken`/`refreshToken`/
  `password`/`cookie`/`secret` etc. — segredo nunca é campo de
  contrato. Verificado manualmente que a regra `PLANNING_TYPE`
  realmente dispara (injetado um campo de teste em `VideoProviderTarget`,
  confirmado que o lint reprova, removido o teste).
- **`G_S1_AUTHORIZATION_SCOPE_MISSING`** / **`G_S1_INGRESS_REQUEST_HAS_TENANT_FIELD`**
  / **`G_S1_INGRESS_RESOLUTION_MISSING_FIELD`** /
  **`G_S1_TRUSTED_TENANT_CONTEXT_HASH_WEAKENED`** (adicionadas
  2026-09-18, sugestão do debate S1 — Resource-scoped Authorization +
  Provider Account Ingress Resolution): via AST real, Skill 22
  (`TenantAuthorizationRequirement`/`TenantAuthorizationDecision`)
  precisa ter `authorizationScope` ("autorizado no tenant" ≠ "autorizado
  a decidir ESTE artefato exato" — a lacuna real que permitia
  `authorizationEvidenceRef` de uma `ApprovalRequest` autorizar a
  decisão de outra). Skill 24
  (`ProviderAccountIngressResolutionRequest`) NUNCA pode ter
  `tenantId`/`trustedTenantContextHash` — é um request de bootstrap
  emitido antes de existir qualquer tenant confiável, não pode carregar
  o que ainda não existe. Skill 24 (`ProviderAccountIngressResolution`)
  precisa ter `tenantId`/`integrationBindingRef`/`providerKey`/
  `providerAccountIdentityHash`. E
  `IntegrationBindingResolutionRequest.trustedTenantContextHash` nunca
  pode virar opcional — guarda contra "resolver" o S1 enfraquecendo o
  mecanismo já existente em vez de adicionar o bootstrap novo ao lado
  dele. Testado empiricamente: injetados os 3 tipos de violação
  (removido `authorizationScope`, adicionado `tenantId` no request de
  ingress, tornado `trustedTenantContextHash` opcional), confirmado que
  o lint reprova os 3 (`errorCount=3, FAIL`), revertido via backup —
  `errorCount=0, PASS` restaurado.
- **`G_S2_PRODUCT_VISUAL_REFERENCE_SET_MISSING_FIELD`** /
  **`G_S2_FRAME_RESULT_BRANCH_MISSING_SET_REF`** /
  **`G_S2_CONSUMER_MISSING_SET_REF`** /
  **`G_S2_NAKED_PRODUCT_VISUAL_REFERENCE_SET_FK`** /
  **`G_S2_LEGACY_REFERENCE_SET_FIELD_NAME`** (adicionadas 2026-09-18,
  sugestão do debate S2 — `ProductVisualReferenceSet` como artifact
  tenant-scoped obrigatório): via AST real, Skill 09
  (`ProductVisualReferenceSet`) precisa ter `productVisualReferenceSetId`/
  `tenantId`/`subjectRef`/`content`/`productVisualReferenceSetHash`; as
  3 branches de `FrameGenerationResult` (`Success`/`NoFrameRequired`/
  `ReferenceUnavailable`) precisam **todas** ter
  `productVisualReferenceSetRef` — o achado real do Fable era
  exatamente `NO_FRAME_REQUIRED`/`TEXT_TO_VIDEO` nunca materializando
  set nenhum, deixando Skills 10/11/12/13/20 com FK apontando pra uma
  entidade que às vezes não existia. Consumers (`VideoGenerationIntent`/
  `VideoPromptArtifact` na Skill10, `VideoGenerationExecution` na
  Skill11, `VideoAuditInput` na Skill12, `CorrectionInput` na Skill13)
  precisam ter `productVisualReferenceSetRef`. Corpus-wide: nenhum
  `type` fora do próprio `ProductVisualReferenceSet`/
  `ProductVisualReferenceSetRef` pode ter `productVisualReferenceSetId`
  solto (FK naked sem tipo/hash), e nenhum `type` pode mais usar os
  nomes pré-S2 `referenceSetId`/`referenceSetHash`. Testado
  empiricamente: injetados 3 tipos de violação (removido `tenantId` de
  `ProductVisualReferenceSet`, trocado `productVisualReferenceSetRef`
  por `productVisualReferenceSetId` solto em
  `VideoGenerationExecution`), confirmado `errorCount=3, FAIL`,
  revertido — `errorCount=0, PASS` restaurado.
- **`G_S3_BANNED_CREATIVE_CTA_INTENT_ID`** /
  **`G_S3_CREATIVE_CTA_INTENT_REF_MISSING_FIELD`** /
  **`G_S3_CREATIVE_DIRECTION_SUCCESS_MISSING_CTA_HASH`** /
  **`G_S3_CONSUMER_MISSING_CTA_REF`** (adicionadas 2026-09-18, sugestão
  do debate S3 — `CreativeCtaIntent` como sub-artifact imutável da
  Skill 07, sem identidade fictícia): corpus-wide, nenhum `type` pode
  ter `creativeCtaIntentId` — essa "identidade" nunca existiu de fato,
  era exatamente o achado do Fable (Skills 16/17 tratando um value
  object aninhado como se tivesse ID próprio). Skill 07:
  `CreativeCtaIntentRef` precisa ter `creativeDirectionResultId`/
  `creativeDirectionHash`/`creativeCtaIntentHash`;
  `CreativeDirectionSuccess` precisa ter `creativeCtaIntentHash`.
  Consumers (Skill16 `CreativeCtaMatch`/`SocialPublicationBindingRef`,
  Skill17 `PublicationInput`/`PublicationPlan`/
  `LogicalPublicationIdentity`) precisam ter `creativeCtaIntentRef`.
  Testado empiricamente: injetadas 3 violações (removido
  `creativeCtaIntentHash` de `CreativeDirectionSuccess`, trocado
  `creativeCtaIntentRef` por `creativeCtaIntentId` solto em
  `CreativeCtaMatch`), confirmado `errorCount=3, FAIL`, revertido —
  `errorCount=0, PASS` restaurado.
- **`G_S4_APPROVAL_GATE_KEY_INCOMPLETE`** /
  **`G_S4_APPROVAL_EVIDENCE_BUNDLE_MISSING_FIELD`** /
  **`G_S4_APPROVAL_DECISION_MISSING_BUNDLE_REF`** /
  **`G_S4_MUTUAL_DEFER_LANGUAGE`** /
  **`G_S4_SKILL12_MAPPING_MISSING`** (adicionadas 2026-09-18, sugestão
  do debate S4 — `ApprovalEvidenceBundle` encerra o "depende da
  Skill 12" mútuo entre Skill 03/Skill 12): Skill 03
  `ApprovalGateKey` precisa conter `VIDEO_COMPLIANCE` e
  `FIRST_REAL_PUBLISH`; `ApprovalEvidenceBundle` precisa ter os 10
  campos do contrato; `ApprovalDecision` precisa ter
  `approvalEvidenceBundleRef`. Textual, nas duas Skills: bane as frases
  de defer mútuo que o Fable encontrou ("depende de como a Skill 12
  estrutura suas evidências" / "consumidor possível: Skill 03") — achado
  real: ao escrever a correção, a própria prosa explicando o que foi
  corrigido citava essas frases verbatim e disparava a checagem contra
  si mesma (mesmo padrão do S14); corrigido parafraseando em vez de
  citar. Skill 12 precisa referenciar o mapeamento normativo
  `verdict`→`ApprovalEvidenceOutcome`
  (`SATISFIES_REQUIREMENT`/`VIOLATES_REQUIREMENT`/
  `INSUFFICIENT_EVIDENCE`). Testado empiricamente: injetada a violação
  estrutural (removido `approvalEvidenceBundleRef` de
  `ApprovalDecision`), confirmado `errorCount=1, FAIL`, revertido —
  `errorCount=0, PASS` restaurado.
- **`G_S9_PRODUCT_USAGE_EVIDENCE_MISSING_FIELD`** /
  **`G_S9_WRITER_MISSING_REFERENCE`** (adicionadas 2026-09-18, sugestão
  do debate S9 — `ProductUsageEvidence` como ledger canônico de uso de
  produto, pra Skill 04 parar de "adivinhar" uso olhando artifacts
  espalhados): Skill 04 `ProductUsageEvidence` precisa ter os 8 campos
  do contrato; Skills 11/14/17 (writers autorizados) precisam
  referenciar textualmente `PRODUCT_USAGE_EVIDENCE_V1`. A checagem de
  matriz de writers (Skill11/14 só `MATERIALIZED`, Skill17 só
  `PRIMARY_PUBLISHED`) foi **deliberadamente não implementada** via
  regex nesta rodada — o próprio debate avisou que um regex ingênuo
  citando os literais baniria a própria prosa explicando a regra
  ("Skill 11 nunca emite PRIMARY_PUBLISHED" contém o literal
  `PRIMARY_PUBLISHED`), mesmo problema já visto no S4/S14; um AST
  semântico capaz de distinguir "emissão real" de "proibição em prosa"
  fica fora do escopo desta V1. Testado empiricamente: injetadas 2
  violações (removido `recordedAt` de `ProductUsageEvidence`, removida
  a referência a `PRODUCT_USAGE_EVIDENCE_V1` na Skill11), confirmado
  `errorCount=2, FAIL`, revertido — `errorCount=0, PASS` restaurado.
- **`G_S5_BANNED_VARIANT_KEY_IN_KERNEL`** /
  **`G_S5_STAGE_WORK_UNIT_AXIS_INCOMPLETE`** /
  **`G_S5_STAGE_EXPANSION_MANIFEST_MISSING_FIELD`** /
  **`G_S5_STAGE_SUBJECT_BINDING_MISSING_WORK_UNIT_HASH`** /
  **`G_S5_STAGE_EXECUTION_MISSING_WORK_UNIT_HASH`** (adicionadas
  2026-09-18, sugestão do debate S5 — `variantKey` deixa de ser
  coordenada de execução do kernel): Skills 01/02 (kernel) nunca podem
  ter `variantKey` como `PropertySignature` em nenhum `type` — usar
  `stageWorkUnitIdentityHash`. Skill 01: `StageWorkUnitAxis` precisa
  conter os 3 eixos V1; `StageExpansionManifest` precisa ter os 9
  campos do contrato; `StageSubjectBinding`/`StageExecution` precisam
  ter `stageWorkUnitIdentityHash`. Rodando pela primeira vez, achou um
  caso real que a própria implementação tinha deixado passar: os
  patches de `StageSubjectBinding`/`StageExecution` tinham sido
  documentados como comentário ("PATCH em StageSubjectBinding: +
  stageWorkUnitIdentityHash...") mas não aplicados de fato ao corpo do
  `type` — o lint pegou antes de qualquer teste manual, mesmo padrão
  do achado real do S13 (`ApprovalResolvedEvent.consumedAt`). Testado
  empiricamente depois da correção: injetado `variantKey` em
  `StageSubjectBinding` (Skill 01) e `Job` (Skill 02), confirmado
  `errorCount=2, FAIL`, revertido — `errorCount=0, PASS` restaurado.
- **`G_S6_VIDEO_COMPOSITION_REFERENCE_MISSING`** /
  **`G_S6_SCRIPT_RESULT_BEAT_CARDINALITY_MISSING`** /
  **`G_S6_FINALIZATION_MISSING_CONCAT_PROHIBITION`** (adicionadas
  2026-09-18, sugestão do debate S6 — `VIDEO_COMPOSITION_V1`, decisão
  de não adicionar stage de `VIDEO_ASSEMBLY` no V1): Skills
  08/10/11/12/13/14/17/20 precisam referenciar `VIDEO_COMPOSITION_V1`
  (`contracts/VIDEO-COMPOSITION.md`, versão normativa compartilhada,
  não hash de artifact). Skill 08 precisa formalizar
  `beats.length === 1`. Skill 14 precisa ter a proibição explícita de
  concatenação multi-source. Testado empiricamente: injetadas 2
  violações (removida a formalização de cardinalidade na Skill08,
  removida a prosa de proibição na Skill14), confirmado
  `errorCount=2, FAIL`, revertido — `errorCount=0, PASS` restaurado.
- **`G_S7_EXECUTION_RUNTIME_REFERENCE_MISSING`** /
  **`G_S7_SKILL02_WORKER_OWNERSHIP_MISSING`** /
  **`G_S7_SKILL11_CONTINUE_RELEASE_MISSING`** /
  **`G_S7_MEDIA_PROCESSING_MISSING_DURABLE_WORKER`** (adicionadas
  2026-09-18, sugestão do debate S7 — `EXECUTION_RUNTIME_V1`, Vercel
  exclusivamente `CONTROL_PLANE`, todo `SkillJobHandler` executa em
  `VIDEO_MACHINE_WORKER_V1`/`DURABLE_WORKER`, mais rígido que "só Jobs
  pesados vão pro worker" pra evitar dois runtimes implementando a
  mesma semântica de Job/Attempt): Skills 01/02/11/12/14/16/17
  precisam referenciar `EXECUTION_RUNTIME_V1`
  (`contracts/EXECUTION-RUNTIME.md`, versão normativa compartilhada,
  não hash de artifact). Skill 02 precisa afirmar `DURABLE_WORKER` +
  `VIDEO_MACHINE_WORKER_V1` como dona do worker execution protocol.
  Skill 11 precisa formalizar que `CONTINUE` libera o worker pra outro
  Job (não segura o processo em loop de polling). Skills 12/14
  precisam referenciar `DURABLE_WORKER` perto de FFmpeg/media
  processing. Duas checagens sugeridas pelo próprio debate foram
  **deliberadamente não implementadas** via regex nesta rodada: (1)
  banir "handler execution atribuída a Vercel function/API
  route/cron/webhook" — um regex ingênuo baniria a própria prosa que
  PROÍBE isso (mesmo problema self-triggering do S4/S14, evitado antes
  no S9 pelo mesmo motivo); (2) banir menção a Redis/BullMQ/broker — o
  termo aparece legitimamente numa seção "not used in V1" e geraria
  falso positivo. Testado empiricamente: injetadas 4 violações
  (removida a referência a `EXECUTION_RUNTIME_V1` na Skill02, removida
  a afirmação `DURABLE_WORKER` na Skill02 mantendo a referência ao
  contrato, removida a linguagem de liberação do worker no `CONTINUE`
  da Skill11, removida a afirmação `DURABLE_WORKER` na Skill12),
  confirmado `errorCount=1, FAIL` em cada injeção isolada, revertido —
  `errorCount=0, PASS` restaurado ao final.
- **`G_M1_BANNED_STAGE_ALIAS`** / **`G_M1_POLICY_VERSION_WRONG_TYPE`** /
  **`G_M1_PSEUDO_CONFIG_SINGLE_LITERAL`** (adicionadas 2026-09-18,
  sugestão do debate M1 — primeiro dos 8 achados MINOR,
  `CONTRACT_CONVENTIONS_V1`, o mesmo conceito representado por
  tipos/vocabulários diferentes em contratos diferentes): Skills 01/02
  não podem ter `PropertySignature` `stage` nos tipos kernel/scheduling
  conhecidos (`StageDefinition`/`LogicalJobIntent`/`Job`) — usar
  `stageKey: StageKey`. Skill 09 não pode ter `policyVersion` tipado
  como `number` — só `string`/`PolicyVersion`. Skill 03
  (`ApprovalPolicy`) não pode ter `onInsufficientEvidence` como
  property. Achados reais confirmados por grep antes de aplicar (só 1
  ocorrência real de cada violação no corpus inteiro — nada
  hipotético): `Job.stage`/`StageDefinition.stage`/
  `LogicalJobIntent.stage` (3 sites, Skills 01/02), 1 ocorrência de
  `policyVersion: number` (Skill 09, de ~50 ocorrências totais — todas
  as outras já eram `string`), 1 `onInsufficientEvidence` de literal
  único (Skill 03). Checagens de `TrendEvidenceRef`/
  `EvidenceMatchJudgement` **deliberadamente não implementadas** via
  AST genérico — achados pontuais de 1 ocorrência cada já corrigidos
  diretamente; um lint genérico exigiria distinguir "fato canônico
  validado" de "proposta bruta de provider" (`CreativeProviderProposal`
  mantém `referencedTrendEvidenceIds` naked de propósito — provider não
  tem como conhecer um hash), julgamento semântico fora do alcance de
  checagem estrutural, mesmo limite já documentado no `G_S9`. Testado
  empiricamente: injetadas 3 violações isoladas (renomeado
  `stageKey`→`stage` na Skill02, `policyVersion: PolicyVersion`→`number`
  na Skill09, reintroduzido `onInsufficientEvidence` na Skill03),
  confirmado `errorCount=1, FAIL` em cada injeção, revertido —
  `errorCount=0, PASS` restaurado ao final.
- **`G_M2_BANNED_REDUNDANT_DEFENSIVE_REF`** (adicionada 2026-09-18,
  sugestão do debate M2 — segundo dos 8 achados MINOR,
  `OPTIONAL_REFERENCE_RULE_V1`, refs opcionais que só existem para "se
  vier, eu confiro" sem representar uma escolha real de domínio): guarda
  de regressão pros 3 campos removidos no M2 —
  `OfferAnalysisInput.candidateRefs` (Skill 05),
  `TrendResearchInput.candidateRefs` (Skill 06),
  `CreativeDirectionInput.subjectRef` (Skill 07). Achado real de corpus
  confirmado por grep textual (`"OPCIONAL, defensivo"`) antes de
  aplicar: as 3 ocorrências existiam de fato, com a própria prosa da
  spec já admitindo que a ausência não mudava nenhum comportamento
  ("se ausente, a Skill05 simplesmente reabre o
  ProductDiscoveryResult") — confirmando que eram
  `REDUNDANT_DEFENSIVE_REFERENCE`, não controle de segurança real (a
  authority real sempre foi `discoveryResultId`/`offerAnalysisResultId`/
  `stageSubjectBindingId`). Removidos os 3 campos + os 3
  `FATAL_ERROR` que só existiam para validá-los
  (`DISCOVERY_CANDIDATE_SET_MISMATCH`/`OFFER_CANDIDATE_SET_MISMATCH`/
  `CREATIVE_SUBJECT_MISMATCH`, confirmado por grep que cada um só tinha
  essa única razão de existir). Testado empiricamente: injetado cada
  campo de volta isoladamente nas 3 Skills, confirmado `errorCount=1,
  FAIL` em cada injeção, revertido — `errorCount=0, PASS` restaurado ao
  final.
- **`G_M3_POOL_SNAPSHOT_HASH_BANNED`** (adicionada 2026-09-18, sugestão
  do debate M3 — terceiro dos 8 achados MINOR): `poolSnapshotHash`
  (`04-descoberta-de-produtos/SPEC.md`, `ProductDiscoveryResult`)
  removido — campo existia sem consumer real, e a própria spec já
  admitia "NÃO é lock otimista nem garante que o catálogo não mudou
  depois". Regra geral fixada em `CONTRACT-CONVENTIONS.md`: hash sem
  papel em provenance/replay/concorrência/decisão de domínio/validação
  efetiva não deve existir no contrato. Ban via AST corpus-wide
  (qualquer type de qualquer Skill), não textual — evita o mesmo risco
  self-triggering já visto no S4/S9/S14/M1. Testado empiricamente:
  injetado o campo de volta em `ProductDiscoveryResult`, confirmado
  `errorCount=1, FAIL`, revertido — `errorCount=0, PASS` restaurado.
- **`G_M5_DEFERRED_MARKER_MISSING`** / **`G_M5_SKILL25_MUST_STAY_V1_REQUIRED`**
  / **`G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING`** /
  **`G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING_SKILL_REF`** (adicionadas
  2026-09-18, sugestão do debate M5 — quinto dos 8 achados MINOR,
  `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`, contenção de
  over-engineering, o maior achado MINOR desta rodada): Skills
  06/20/21 precisam conter o marker `DEFERRED_V2_CONTRACT` — no V1
  runtime, essas três Skills não têm handler/Job/migration/adapter,
  apenas continuam especificadas/revisáveis pra V2. Skill25 precisa
  conter `V1_REQUIRED` (nunca virar `DEFERRED_V2_CONTRACT` inteira —
  só o rate-limit ledger interno é `DEFERRED_V2_MECHANISM`). Check
  global: `src/modules/video-machine/IMPLEMENTATION-SCOPE.md` precisa
  existir e referenciar `Skill06`/`Skill20`/`Skill21`. Investigação de
  dependências reais feita **antes** de aplicar (via agente Explore
  dedicado, grep completo dos 25 SPECs por menções cruzadas às três
  Skills): achou exatamente **1 dependência hard real** —
  `07-direcao-criativa/SPEC.md` `CreativeDirectionInput.trendResearchResultId`
  era campo obrigatório com `CREATIVE_TREND_RESULT_NOT_FOUND` como
  `FATAL_ERROR`, o que bloquearia 100% dos `ProductionRun`s com
  Skill06 deferida (nenhum `TrendResearchResult` jamais existiria).
  Corrigido: campo virou opcional, ausência tratada com a mesma
  semântica de `NO_SOURCES_AVAILABLE`/EVERGREEN já existente (nunca
  erro) — os 3 `FATAL_ERROR` relacionados (`CREATIVE_TREND_RESULT_NOT_FOUND`/
  `CREATIVE_TREND_TENANT_MISMATCH`/`CREATIVE_UPSTREAM_RESULT_MISMATCH`)
  continuam existindo, só passam a disparar apenas quando o ref é
  fornecido. Nenhuma outra dependência hard real encontrada sobre
  Skill20 (`experimentVariant*` não existe em nenhum campo das Skills
  11/12/14/17 — a única plumbing existente é condicional, owned pela
  Skill01) nem sobre Skill21 (nenhuma Skill trata o report como
  dependência funcional). Deliberadamente **não** construído um grafo
  automático de dependências entre as 25 Skills — isso seria o próprio
  over-engineering que este ponto elimina. **0 artifacts novos, 0
  hashes novos, 0 `FATAL_ERROR` novos, 0 runtime code.** Testado
  empiricamente: removido o marker `DEFERRED_V2_CONTRACT` da Skill06
  (`FAIL`), removido temporariamente `IMPLEMENTATION-SCOPE.md`
  (`FAIL`), removido o marker `V1_REQUIRED` da Skill25 (`FAIL`) — os 3
  cenários revertidos, `errorCount=0, PASS` restaurado.
- **`G_M7_RUN_CONTROL_COMMAND_RUN_ID_MUST_BE_OPTIONAL`** /
  **`G_M7_START_REQUEST_RUN_ID_BANNED`** (adicionadas 2026-09-18,
  sugestão do debate M7 — sétimo dos 8 achados MINOR, Trusted Run
  Identity Allocation): achado real confirmado antes de aplicar —
  `01-orquestrador-de-producao/SPEC.md` `RunControlCommand.runId` era
  `string` obrigatório em TODOS os tipos de comando (inclusive
  `START`), e a prosa da própria SPEC confirmava literalmente "START é
  sempre associado a um runId pré-gerado antes da criação" —
  exatamente o anti-padrão apontado pelo Fable (`commandId` só protege
  contra duplicação do MESMO comando, nunca prova que um `runId`
  escolhido externamente não pertence a outra operação). Corrigido:
  `runId?: string` — obrigatório só pra
  `PAUSE`/`RESUME`/`CANCEL`/`STATUS` (precisam apontar pra uma Run já
  existente), proibido pra `START` (Skill01 aloca internamente,
  atomicamente com a materialização da `ProductionRun`, nunca derivado
  de `commandId`/`startRequestKey`/timestamp/tenant).
  `ProductionRunStartRequest` já não tinha `runId` (confirmado por
  grep antes de aplicar — nada a corrigir ali, só guarda de regressão
  via lint). **0 artifacts novos, 0 hashes novos, 0 `FATAL_ERROR`
  novos.** Testado empiricamente: `runId` tornado obrigatório de novo
  em `RunControlCommand` (`FAIL`), `runId` injetado em
  `ProductionRunStartRequest` (`FAIL`) — os 2 cenários revertidos,
  `errorCount=0, PASS` restaurado.
- **`G_M8_SCHEDULE_SLOT_SEMANTICS_MISSING`** /
  **`G_M8_SCHEDULED_OCCURRENCE_FIELD_MISSING`** (adicionadas
  2026-09-18, sugestão do debate M8 — oitavo e **último** dos 8
  achados MINOR, identidade determinística de `scheduleSlotKey`):
  achado real confirmado por grep antes de aplicar —
  `18-coletor-de-metricas/SPEC.md`
  `MetricCollectionTrigger.SCHEDULED` só tinha
  `schedulePolicyKey`/`scheduleSlotKey`, sem nenhum campo
  representando a ocorrência nominal, e o exemplo real de
  `collectionRequestKey` mostrava literalmente um bucket de hora
  truncada (`"2026-09-18T12"`) — arredondamento indefinido, exatamente
  o achado do Fable (o problema não era "qual função de arredondamento
  usar", era eliminar o arredondamento por completo). Corrigido:
  adicionado `scheduledOccurrenceAt` (instante nominal RFC3339 UTC,
  precisão de milissegundos, sufixo `Z` — nunca `now()`/horário de
  execução observado) ao `MetricCollectionTrigger`; `scheduleSlotKey`
  passa a derivar de `(schedulePolicyKey, scheduledOccurrenceAt)`.
  Corrigidos também o exemplo de `collectionRequestKey` (não mais um
  bucket de hora) e a prosa de admissão do cron, com a regra literal
  `scheduleSlotKey MUST NOT be derived by rounding, flooring or
  ceiling the observed/execution time`. **0 artifacts novos, 0 hashes
  novos, 0 `FATAL_ERROR` novos** — patch in-place de projection
  existente. Lint ganhou 2 checagens novas — testadas empiricamente
  (2 injeções isoladas: regra normativa removida, campo
  `scheduledOccurrenceAt` renomeado — cada uma confirmou
  `errorCount=1, FAIL`, revertido). `errorCount=0, PASS`. **Com isso,
  os 8/8 achados MINOR e os 17/17 achados SIGNIFICANT do Claude Fable 5
  Max estão fechados em especificação.**
- **G001 — `DUPLICATE_SYMBOL_WITHIN_SPEC`**: `type`/`interface`
  declarado mais de uma vez dentro do MESMO `SPEC.md`, via AST real
  (não `^type \w+` de regex — que tem um ponto cego real: não pega
  declaração indentada dentro de um bloco de lista numerada, que foi
  exatamente como `MetricSnapshot`/Skill 18 e `ComparisonEligibility`/
  Skill 19 escaparam da autoverificação manual dos Pontos A-F e das
  aprovações individuais 1-25).
- **G012 — `FATAL_ERROR_DUPLICATE_WITHIN_SKILL`**: código `FATAL_ERROR`
  listado mais de uma vez dentro do mesmo `SPEC.md` (achou
  `FRAME_REQUIREMENT_UNSATISFIABLE` duplicado na Skill 09).

Rodado sobre o corpus real em 2026-09-18: **25/25 SPEC.md presentes,
errorCount=0, PASS.** 3 duplicatas reais encontradas e corrigidas nesta
mesma rodada (`MetricSnapshot`/Skill 18, `ComparisonEligibility`/
Skill 19, `FRAME_REQUIREMENT_UNSATISFIABLE`/Skill 09) — nenhuma delas
havia sido pega pela autoverificação manual (`grep '^type \w+'`) usada
nos Pontos A-F nem nas aprovações individuais das 25 Skills, porque
todas as três estavam indentadas dentro de blocos de texto/lista, fora
do padrão `^type` no início da linha. **Isso confirma exatamente o
diagnóstico do ChatGPT**: grep-only tem ponto cego estrutural real.

`G021_SPEC_TYPESCRIPT_PARSE_ERROR` foi rebaixado para
`GW_SPEC_TYPESCRIPT_PARSE_WARNING` (não bloqueia `PASS`): vários blocos
` ```ts ` do corpus contêm exemplos de **valor** (object literals
ilustrativos de fluxo, ex. `{ transitionKey: 'X', target: {...} }`),
não declarações de tipo — sintaticamente ambíguos como statement
top-level isolado, mas o parser do TypeScript é error-tolerant e ainda
extrai corretamente as declarações reais do mesmo bloco/arquivo (a
contagem de declarações não é afetada). Reescrever dezenas de snippets
ilustrativos só para satisfazer parsing estrito de "programa completo"
não teria ganho arquitetural — decisão técnica registrada aqui em vez
de silenciosa.

## Escopo NÃO implementado nesta rodada — documentado para expansão futura

O ChatGPT desenhou um ruleset bem mais amplo (G002-G090, 21
`LINT_ERROR` no total, 5 `WARNING` rules, 32 testes) cobrindo um
**registry de ownership cross-skill** formal com os seguintes
conceitos — mantidos aqui como especificação, não como código:

- `CrossSkillContractRegistry`/`CrossSkillContractRegistryEntry` — um
  índice de "symbol X é owned pela Skill Y, consumido por [Z,...]",
  com detecção de:
  - `G002_SHARED_SYMBOL_MULTIPLE_OWNERS` — mesmo símbolo cross-skill
    declarado em mais de uma Skill dona.
  - `G003_SHARED_SYMBOL_OWNER_DECLARATION_MISSING` — registry diz que
    Skill X é dona, mas o AST não encontra a declaração lá (teria
    detectado o B5 do Fable — "patch prometido nunca escrito" —
    automaticamente, antes da revisão externa).
  - `G005_CROSS_SKILL_CONSUMER_REDECLARATION` — uma Skill consumidora
    redeclara localmente um contrato que não é dela.
  - `G006_UNREGISTERED_CROSS_SKILL_REFERENCE` — uso de símbolo de outra
    Skill sem entrada correspondente no registry (contrato compartilhado
    não pode nascer "por acidente").
- `SpecContractSymbolDeclaration`/`declarationDigest` — hash normalizado
  (ignora whitespace/indentação/comentários/posição; preserva
  nome/union members/campos/optionality/tipos/valores literais) para
  detectar mudança silenciosa de contrato compartilhado
  (`G015_SHARED_DECLARATION_DIGEST_MISMATCH`).
- `SpecCanonicalHashBinding` — binding formal `hashName ↔ symbolName ↔
  ownerSkillId`, com `G009_CANONICAL_HASH_OWNER_CONFLICT` (mesmo
  `_V1` usado por dois symbols diferentes) e
  `G010_CANONICAL_HASH_BINDING_MISSING`.
- `SupersededContractRule`/`SupersededContractEnforcement` — forma
  verificável de aposentar nomes antigos (ex.
  `PublicationAuthorizationStatus`/Skill 03,
  `FirstRealPublishGateClaim`/Skill 03 — os nomes stale que existiram
  brevemente nesta mesma rodada de reparo antes da correção do
  Ponto F — e `RunPolicyDecision.kind=QUOTA`/`BlockReason` legados,
  intencionalmente preservados como não-autoritativos) com
  `G013_SUPERSEDED_SYMBOL_DECLARATION_FORBIDDEN`/
  `G014_SUPERSEDED_SYMBOL_CANONICAL_REFERENCE`.
- `SkillSpecInventory`/`GlobalContractLintReport`/
  `ContractLintBaseline` — snapshot determinístico por Skill + report
  global + baseline hash para enviar ao Fable/Astra ("exatamente qual
  corpus foi revisado").
- Meta-hashes propostos: `CROSS_SKILL_CONTRACT_REGISTRY_V1`,
  `SKILL_SPEC_INVENTORY_V1`, `SPEC_DOCUMENT_SNAPSHOT_V1`,
  `GLOBAL_CONTRACT_LINT_REPORT_V1`, `CONTRACT_LINT_BASELINE_V1`.

**Por que não implementado agora**: construir o registry completo exige
primeiro um bootstrap manual de ownership para todas as 25 Skills (o
próprio ChatGPT recusou inventar essa lista sem os arquivos completos
em mãos), mais uma infraestrutura de baseline/CI que ainda não tem
consumidor real (nenhum runtime existe, nenhum CI está rodando specs
ainda). O valor imediato e concreto que a revisão Fable expôs —
símbolo duplicado dentro do mesmo arquivo, achado sem dono nunca
escrito — já está coberto pela V1 real (G001/G012) rodada sobre o
corpus verdadeiro, com resultado `PASS`. Regras G002+ ficam
especificadas aqui prontas para implementação quando o projeto entrar
de fato em CI/runtime, sem precisar redesenhar do zero.

Regras não implementadas (lista completa do ruleset do ChatGPT, pra
referência futura): G002 a G020 (exceto G001/G012 já cobertos), G021
(rebaixado a warning), G033-G090 (superseded contracts, inventory,
snapshot, baseline, report format, os 5 meta-hashes, e os 32 testes
propostos do próprio Contract Lint).

## Assertions específicas dos reparos A-F (verificação manual, não pelo script V1)

O ChatGPT pediu assertions explícitas de ownership antes do PASS. A
V1 do script não checa ownership cross-skill (ver seção acima), então
isto foi conferido manualmente nos próprios `SPEC.md` — todas
verdadeiras em 2026-09-18:

```text
A: ProductionRun owner = Skill01; SkillExecutionAdapter owner = Skill01
B: JobExecutionResult owner = Skill02; resultRef canônico existe
C: StandaloneWorkRequest owner = Skill02; ProductionRunStartRequest owner = Skill01
D: StageIteration owner = Skill01; StageTransitionResolution owner = Skill01
E: QuotaOperationIdentity owner = Skill23; ExecutionQuotaBinding owner = Skill02;
   zero autoridade de decisão de quota em Skill01/02 (QuotaGuard = nome de
   checkpoint, sem lógica própria concorrente)
F: PublicationAuthorizationResolutionRef owner = Skill03;
   OwnedAffiliateClickEvent owner = Skill15;
   MetricRefreshRequest owner = Skill18
```

Nomes stale registrados como superseded (preservados no texto como
histórico/legado, sem autoridade, sem consumidor canônico novo):
`PublicationAuthorizationStatus`/`FirstRealPublishGateClaim` (existiram
brevemente na Skill 03 antes da correção do Ponto F, já removidos),
`RunPolicyDecision.kind=QUOTA` (Skill 01, marcado LEGACY/SUPERSEDED no
Ponto E), `BlockReason` (Skill 02, marcado não-autoritativo no Ponto B).

## Authority of reported metrics (Ponto M4, reparo transversal pós-revisão Fable, 2026-09-18)

> Quarto dos 8 achados MINOR. Regra completa em
> `contracts/CONTRACT-CONVENTIONS.md`
> (`EXECUTABLE_VERIFICATION_RULE_V1`) — resumo operacional aqui.

The linter's reported counts are authoritative only for implemented
rules and parsed declarations. Manual counts, rounded counts and prose
scenario counts MUST NOT be presented as executable verification
results. `PASS` means only: all registered `contract-lint.mjs` rules
passed — it does **not** mean runtime correctness, security validation,
provider compatibility, or production readiness. Duplicate-count claims
must respect the real scope of the check (`0 duplicate declarations
within same SPEC` ≠ `0 duplicate semantics across entire project`). No
`G_M4_*` lint rule was created — regex-matching prose numbers
(`"0 duplicatas"`/`"40 testes"`) would be fragile and false-positive
prone; this is a reporting/process rule, not an AST check.

## Fechamento do Ponto G

```text
errorCount = 0
warningCount = 23 (todos GW_SPEC_TYPESCRIPT_PARSE_WARNING — exemplos de
                    valor em fences ```ts, não afetam extração real de
                    declarações nem contam para PASS/FAIL)
PASS
```

Com isso, os 6 achados bloqueantes (B1-B6) do Claude Fable 5 Max estão
fechados em nível de especificação:

```text
B1 → CLOSED — StandaloneWorkRequest / ProductionRunStartRequest (Ponto C)
B2 → CLOSED — StageIteration semantics (Ponto D)
B3 → CLOSED — ProductionRun + SkillExecutionAdapter kernel (Ponto A)
B4 → CLOSED — JobExecutionResult protocol (Ponto B)
B5 → CLOSED — contratos dos donos materializados (Ponto F)
B6 → CLOSED — Skill 23 como autoridade única de quota (Ponto E) +
              Contract Lint real rodado sobre o corpus (Ponto G)
```

Nenhuma Skill perde seu número de aprovação (`N/25`) — os reparos A-G
são patches compatíveis, não reaberturas. O estado de implementação
runtime continua `NOT_IMPLEMENTED` em todas as 25 Skills (fase
deliberada de especificação) — a única exceção é a própria ferramenta
de lint (`scripts/contract-lint.mjs`), que precisa existir e rodar de
verdade para que o Ponto G tenha valor real, em vez de repetir o mesmo
erro de "grep parece certo" que ele existe para corrigir.
