# POST-ASTRA-REREVIEW-REPAIR SNAPSHOT — 2026-09-19

> Documento de congelamento para uma futura nova rodada de revisão
> independente (Fable/GPT-6 Astra). Não reexplica as 25 Skills — registra
> só o estado verificável do corpus neste momento. Se algo aqui divergir
> do corpus real, **o corpus é a fonte de verdade, não este documento**.

## ⚠️ Leia isto antes de confiar em qualquer status abaixo

O time (ChatGPT + Claude Code) marcou todos os achados desta rodada
como `CLOSED`. **Não confie nesse status.** Verifique contra o corpus
real — leia os `SPEC.md` reais, rode `node scripts/contract-lint.mjs`
você mesmo, confira os campos/tipos/`FATAL_ERROR` citados abaixo linha
por linha. Este documento é um mapa para navegação rápida, não uma
prova.

## Status oficial (framing explícito do ChatGPT, não inventado por mim)

```text
SPEC REPAIR COMPLETE
ALL KNOWN RE-REVIEW FINDINGS CLOSED
AWAITING INDEPENDENT RE-REVIEW
RUNTIME NOT IMPLEMENTED
```

**NUNCA declarar `IMPLEMENTABLE CONFIRMED`** a partir deste documento —
isso só pode vir de uma revisão externa independente. "CLOSED" abaixo
significa "corrigimos o achado no corpus e protegemos com lint/provas
onde aplicável", nunca "o comportamento existe em runtime".

## Fase

```text
Phase: SPECIFICATION / REVIEW
NO RUNTIME IMPLEMENTATION AUTHORIZED
```

Nenhuma migration, tabela, RPC, worker, provider ou linha de código de
runtime existe em nenhum lugar deste módulo. Tudo é contrato/tipo
TypeScript dentro de blocos de código em arquivos Markdown.

## Histórico das duas rodadas de revisão

```text
Rodada 1 — Claude Fable 5 Max (2026-09-18):
  17 SIGNIFICANT + 8 MINOR + 6 achados estruturais A-G
  → todos CLOSED, verificados via contract-lint.mjs

Rodada 2 — GPT-6 Astra, via Codex (2026-09-18/19):
  Corpus da rodada 1 enviado por ZIP (git archive do commit b48a78c,
  já que o push nunca foi autorizado — commit local-only)
  Veredito recebido: "not implementable no estado recebido"
  7 achados novos (N1-N7) + 6 pendências reabertas (R1-R6)
  + 1 achado adicional descoberto NO MEIO do reparo (N8)
  → todos CLOSED nesta madrugada (2026-09-19), verificados via
    contract-lint.mjs + fault injection em cada lint rule nova
```

## Status do reparo (rodada 2 — Astra)

```text
R1  → CLOSED   (Skill02: checkpoint SUBMITTING sem fencing → beginExternalSubmission)
R2  → CLOSED   (Skill02: Job sem autoridade real de executionScope → união discriminada)
R3  → CLOSED   (Skill01: approval-gate genérico → StageApprovalRequirement + subject resolution determinística)
R4  → CLOSED   (Skill07: inferenceProvenance ausente em CreativeDirectionSuccess)
R5  → CLOSED como DEFERRED_V2_CONTRACT (Skill20↔Skill07 VariationDirective — dívida V2 legítima, não contrato quebrado)
R6  → CLOSED   (Skill07: TREND_EVIDENCE exigindo evidenceHash exato)

N1  → CLOSED   (Skill01: logicalJobKey RUN_SCOPED colidindo entre StageIteration)
N2  → CLOSED   (Skill01: StageSubjectBinding sem escopo de iteration)
N3  → CLOSED   (Skill01: StageKernelContract/StageTransitionResolution sem fan-out real — só comentário)
N4  → CLOSED   (Skill07: trendResearchResultId deveria ser opcional)
N5  → CLOSED   (Skill03/17: PublicationIntent nunca declarado → PublicationPlan é o owner real)
N6  → CLOSED   (Skill03: stage:PipelineStage nunca migrado pra stageKey:StageKey)
N7  → CLOSED   (contract-lint.mjs: bug de CRLF-blindness na extração de fences)
N8  → CLOSED   (Skill03: subjectVersion sem produtor canônico em nenhum gate — removido, ExactApprovalSubject)

B/B4 → CLOSED  (pré-existente, reconfirmado coerente)
C/B1 → CLOSED  (pré-existente, reconfirmado coerente)
D/B2 → CLOSED  (pré-existente, reconfirmado coerente)
F/B5 → CLOSED  (travado em PARTIALLY RESOLVED até N5 fechar; agora CLOSED por completo)
G    → CLOSED  (pré-existente, reconfirmado coerente)
```

## Última execução do contract-lint.mjs

```text
node scripts/contract-lint.mjs
errorCount=0
warningCount=23
PASS
```

25/25 SPEC.md presentes, nenhuma inesperada. **PASS só cobre as regras
já registradas** — não é prova de completude, é prova de que as
invariantes conhecidas continuam satisfeitas.

## O que mudou de mais estrutural nesta rodada (resumo técnico)

- **"Kernel de identidade" unificado (N1+N2+N3)**: `Stage →
  StageIteration → StageWorkUnitIdentity → StageSubjectBinding →
  StageExecution → Job` — `logicalJobKey` RUN_SCOPED passou a incluir
  `stageExecutionId`/`preparedInvocationHash` (não só a coordenada da
  work unit); `StageSubjectBinding` ganhou `stageIterationId`/`Hash`;
  `StageTransitionResolution` virou discriminated union real
  (SINGLE/EXPANDABLE) em vez de comentário nunca aplicado ao type.
- **`Job` (Skill02) virou união discriminada real** por `executionScope`
  (`RUN_SCOPED`/`STANDALONE`) — antes era impossível representar um Job
  standalone sem violar o próprio type ou fabricar dados falsos (R2).
- **Approval gate (Skill01↔Skill03) ganhou wiring real** —
  `StageApprovalRequirement` referencia `ApprovalGateKey` (owned pela
  Skill03), com algoritmo determinístico de resolução do subject (0 ou
  >1 candidatos = fail-closed) e `OrchestrationDecision.REQUEST_APPROVAL`
  real (R3).
- **`ExactApprovalSubject` substitui identidade quebrada** —
  `subjectVersion` (nunca teve produtor canônico em nenhum gate) saiu
  do contrato de aprovação; identidade agora é
  `subjectType+subjectId+artifactHash` (N8).
- **`PublicationPlan` formalizado como o subject real de
  `FIRST_REAL_PUBLISH`** — `PublicationIntent`, citado ~13x, nunca
  tinha sido declarado em nenhuma Skill (N5).
- **`beginExternalSubmission` fenced (Skill02)** protege o checkpoint
  `SUBMITTING` contra workers zumbis (lease expirado) — limite físico
  reconhecido explicitamente (R1).

## Lint rules novas desta rodada

```text
G000_ZERO_DECLARATIONS_EXTRACTED (N7, defesa em profundidade)
G_N123_STAGE_KERNEL_WORK_UNIT_CONTRACT_MISSING
G_N123_BINDING_ITERATION_IDENTITY_MISSING
G_N123_EXPANDABLE_TRANSITION_BRANCH_MISSING
G_N123_LEGACY_LOGICAL_JOB_KEY_TEMPLATE_CONFLICT
G_R1_FENCED_EXTERNAL_SUBMISSION_OPERATION_MISSING
G_R1_UNGUARDED_SUBMITTING_TRANSITION
G_R2_JOB_EXECUTION_SCOPE_MISSING
G_R2_JOB_SCOPE_UNION_MISSING
G_R2_STANDALONE_RUN_COORDINATES_NOT_FORBIDDEN
G_R2_BACKGROUND_RUN_ID_REQUIRED_BANNED
G_R3_LEGACY_REQUIRES_APPROVAL_BANNED
G_R3_STAGE_APPROVAL_REQUIREMENT_MISSING
G_R3_REQUEST_APPROVAL_DECISION_MISSING
G_R3_APPROVAL_GATE_KEY_MUST_USE_ENUM
G_N8_APPROVAL_SUBJECT_VERSION_BANNED
G_N8_APPROVAL_EXACT_SUBJECT_HASH_REQUIRED
G_N5_UNDECLARED_PUBLICATION_INTENT_BANNED
G_N5_FIRST_REAL_PUBLISH_SUBJECT_MUST_BE_PUBLICATION_PLAN
G_R5_SKILL07_V1_VARIATION_DIRECTIVE_DEPENDENCY_BANNED
G_R5_V1_CREATIVE_VARIANT_WORK_UNIT_BANNED
```

Cada uma testada por fault injection real (campo/branch removido →
`FAIL` confirmado → revertido → `PASS` confirmado), não só por
inspeção.

## Escopo de implementação V1 (sem mudança desde a rodada 1)

```text
Skill06 (pesquisa de tendências) = DEFERRED_V2_CONTRACT
Skill20 (gerador de variações)   = DEFERRED_V2_CONTRACT
Skill21 (relatórios)             = DEFERRED_V2_CONTRACT
Skill25 (segurança/auditoria)    = V1_REQUIRED
Skill25 custom rate-limit ledger = DEFERRED_V2_MECHANISM
```

## Arquivos alterados nesta rodada (working tree, ainda não commitados)

```text
CONTINUIDADE.md
scripts/contract-lint.mjs
src/modules/video-machine/IMPLEMENTATION-SCOPE.md
src/modules/video-machine/feito.md
src/modules/video-machine/skills/01-orquestrador-de-producao/SPEC.md
src/modules/video-machine/skills/02-gestor-de-fila-jobs/SPEC.md
src/modules/video-machine/skills/03-gestor-de-aprovacao/SPEC.md
src/modules/video-machine/skills/04-descoberta-de-produtos/SPEC.md
src/modules/video-machine/skills/07-direcao-criativa/SPEC.md
src/modules/video-machine/skills/16-automacao-de-comentarios-dm/SPEC.md
src/modules/video-machine/skills/17-publicador-multicanal/SPEC.md
src/modules/video-machine/skills/18-coletor-de-metricas/SPEC.md
src/modules/video-machine/skills/19-analista-de-performance/SPEC.md
src/modules/video-machine/skills/20-gerador-de-variacoes/SPEC.md
```

## Commit de referência

```text
reviewSnapshotCommit: 4689f1b
branch: main
zipFile: shopee-concierge-4689f1b.zip
zipSha256: 9c012c791433a7d886b6c66548e6650905b46d2982ceeb82dc765ade91a0508a
```

Commit local (**nunca enviado ao GitHub** — nenhum push foi autorizado).
O ZIP entregue junto com este documento foi gerado via
`git archive --format=zip 4689f1b`, 296 arquivos, verificado sem
`.env`/`node_modules` (só `.env.example`). O SHA acima e o SHA-256 do
ZIP são coerentes entre si por construção — evita repetir a
inconsistência `37cda13` vs `b48a78c` que bloqueou a revisão anterior.

## Missão da próxima revisão externa (se/quando o Heber autorizar)

1. Auditar se as correções de R1-R6/N1-N8 introduziram alguma nova
   contradição transversal entre Skills (não confiar no `CLOSED` acima
   sem reverificar).
2. Confirmar que nenhum campo/type "documentado em comentário, nunca
   aplicado ao type real" sobrou em qualquer lugar do corpus — esse foi
   o padrão de bug mais recorrente desta rodada inteira (S5, N1, N2,
   N3, N5, R2, R3 todos tinham essa mesma classe de defeito).
3. Validar que `contract-lint.mjs` continua `errorCount=0, PASS` contra
   o corpus exato do commit/ZIP entregue.
