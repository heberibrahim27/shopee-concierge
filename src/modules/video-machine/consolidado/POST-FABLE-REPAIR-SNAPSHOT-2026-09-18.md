# POST-FABLE-REPAIR SNAPSHOT — 2026-09-18

> Documento de congelamento para a re-review do Claude Fable 5 Max
> (via Codex / GPT-6 Astra). Não reexplica as 25 Skills — registra só
> o estado verificável do corpus neste momento. Se algo aqui divergir
> do corpus real, **o corpus é a fonte de verdade, não este documento**.

## ⚠️ Leia isto antes de confiar em qualquer status abaixo

O time (ChatGPT + Claude Code) marcou todos os 25 achados como
`CLOSED`. **Não confie nesse status.** Verifique contra o corpus real
— leia os `SPEC.md` reais, rode `node scripts/contract-lint.mjs` você
mesmo, confira os campos/tipos/`FATAL_ERROR` citados abaixo linha por
linha. Este documento é um mapa para navegação rápida, não uma prova.

## Fase

```text
Phase: SPECIFICATION / REVIEW
NO RUNTIME IMPLEMENTATION AUTHORIZED
```

Nenhuma migration, tabela, RPC, worker, provider ou linha de código de
runtime existe em nenhum lugar deste módulo. Tudo é contrato/tipo
TypeScript dentro de blocos de código em arquivos Markdown.

## Revisão original

```text
Original review: Claude Fable 5 Max
17 SIGNIFICANT
8 MINOR
(+ 6 achados bloqueantes B1-B6 de uma rodada estrutural anterior,
 pontos A-G abaixo — já fechados antes do início desta rodada)
```

## Status do reparo

```text
A-G      CLOSED
S1-S17   CLOSED
M1-M8    CLOSED
```

## Status de especificação das Skills

```text
Skill specification status: 25/25 specified/reviewed
NOT 25/25 runtime implemented
```

## Escopo de implementação V1

```text
Skill06 (pesquisa de tendências) = DEFERRED_V2_CONTRACT
Skill20 (gerador de variações)   = DEFERRED_V2_CONTRACT
Skill21 (relatórios)             = DEFERRED_V2_CONTRACT
Skill25 (segurança/auditoria)    = V1_REQUIRED
Skill25 custom rate-limit ledger = DEFERRED_V2_MECHANISM
```

Contrato completo: `../IMPLEMENTATION-SCOPE.md`
(`VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`).

## Arquitetura de runtime (especificada, não implementada)

```text
Vercel                    = CONTROL_PLANE
VIDEO_MACHINE_WORKER_V1   = DURABLE_WORKER
Runtime code              = NOT STARTED
```

Contrato completo: `../contracts/EXECUTION-RUNTIME.md`
(`EXECUTION_RUNTIME_V1`).

## Composição de vídeo

```text
VIDEO_COMPOSITION_V1 = single beat / complete-video candidate
No VIDEO_ASSEMBLY in V1
```

Contrato completo: `../contracts/VIDEO-COMPOSITION.md`.

## Convenções de contrato (nomenclatura/vocabulário)

Contrato completo: `../contracts/CONTRACT-CONVENTIONS.md`
(`CONTRACT_CONVENTIONS_V1`, `OPTIONAL_REFERENCE_RULE_V1`,
`EXECUTABLE_VERIFICATION_RULE_V1`).

## Última verificação executável

```text
command: node scripts/contract-lint.mjs
result: PASS
errorCount: 0
warningCount: 23 (todos GW_SPEC_TYPESCRIPT_PARSE_WARNING — exemplos de
                  valor em fences ```ts, não afetam extração real de
                  declarações nem contam para PASS/FAIL)
corpus: 25/25 SPEC.md presentes
```

**Importante**: `PASS` se refere só às regras registradas em
`scripts/contract-lint.mjs` (ver `CONTRACT-LINT.md` pra lista
completa e escopo exato de cada regra). Não prova correção de
runtime, provider, deployment ou segurança em produção — só que os
tipos/nomes/pointers/markers exigidos existem e estão consistentes
no texto do corpus.

## Busca por resíduo textual (feita antes deste snapshot, não é auditoria nova)

Grep dirigido por resíduo dos próprios reparos, não uma nova auditoria
arquitetural — cada ocorrência foi lida e classificada manualmente:

| Termo buscado | Ocorrências encontradas | Classificação |
|---|---|---|
| `poolSnapshotHash` | Só em `CONTRACT-CONVENTIONS.md` e em PATCH notes explicando a remoção (Skill04) | Histórico/explicativo — sem campo real remanescente |
| `variantKey` | Skills 01/02/10/20 — só em comentários/prosa explicando a migração do S5 (`"antes variantKey, agora..."`) e no critério de fechamento do S5 | Histórico/explicativo — sem `variantKey` como property real em nenhum `type` |
| `beatNumber` | 1 ocorrência, Skill01 linha ~1640, dentro de nota histórica entre parênteses | Histórico/explicativo — campo real é `beatIndex` |
| `VIDEO_ASSEMBLY` | Só em `VIDEO-COMPOSITION.md`, sempre em frases de proibição (`MUST NOT declarar`, `Não criar`) | Correto — são as próprias regras que proíbem isso |
| `onInsufficientEvidence` | Só em `CONTRACT-CONVENTIONS.md` e PATCH note (Skill03) explicando a remoção | Histórico/explicativo — sem property real remanescente |
| `runId` obrigatório fora de contexto de Run já existente | `RunControlCommand.runId` já é opcional (`runId?:`); os demais `runId: string` obrigatórios (`StageSubjectBinding`, `StageExecution`, `LogicalJobIntent`, `ProductionRun`) são referências a uma Run **já materializada**, nunca o campo de entrada de `START` | Correto — esse é exatamente o desenho do M7 |
| bucket de hora antigo da Skill18 (`"2026-09-18T12"` truncado) | 1 ocorrência, dentro da prosa nova do M8 explicando o que era ERRADO antes | Histórico/explicativo — o campo real agora é `scheduledOccurrenceAt` |

Nenhum resíduo real de código/contrato encontrado — todas as
ocorrências são texto histórico/explicativo legítimo sobre a própria
correção.

## Os 25 achados (tabela resumida)

| Achado | Resolução | Owner/arquivos principais | Status |
|---|---|---|---|
| A (B3) | Kernel `ProductionRun` + `SkillExecutionAdapter` | Skill01 | CLOSED |
| B (B4) | Protocolo canônico Skill02 ↔ handler (Job/Attempt/lease/fence) | Skill02 | CLOSED |
| C (B1) | `RUN_SCOPED` × `STANDALONE`, `ProductionRunStartRequest` | Skill01/02 | CLOSED |
| D (B2) | Correction loop / `StageIteration` (Attempt ≠ StageIteration) | Skill01 | CLOSED |
| E (B6) | Skill23 como única autoridade de quota | Skill23, + Skills 01/02/11 | CLOSED |
| F (B5) | Contratos dos donos materializados (result ownership) | múltiplas | CLOSED |
| G | Ferramenta `contract-lint.mjs` (verificação AST real, não grep manual) | `scripts/contract-lint.mjs` | CLOSED |
| S1 | Autenticação de ingress fail-closed / autorização por escopo exato | Skill22/24, Skill03 | CLOSED |
| S2 | `ProductVisualReferenceSet` sempre materializado, com `emptyReason` | Skill09 | CLOSED |
| S3 | `CreativeCtaIntent` — hash/ref formalizados sem novo artifact | Skill07, 16, 17 | CLOSED |
| S4 | Contrato único de evidência de aprovação (`ApprovalGateKey`/`ApprovalEvidenceBundle`) | Skill03, 12 | CLOSED |
| S5 | `variantKey` removido do kernel; `StageWorkUnitIdentity`/`StageExpansionManifest` estruturados | Skill01/02, + 10/14/17/20 | CLOSED |
| S6 | `VIDEO_COMPOSITION_V1` — single-beat V1, sem stage de assembly | Skills 08/10/11/12/13/14/17/20 | CLOSED |
| S7 | `EXECUTION_RUNTIME_V1` — Vercel = CONTROL_PLANE, worker = DURABLE_WORKER | Skill01/02, + 11/12/14/16/17 | CLOSED |
| S8 | (fechado pelo Ponto C) | Skill01/02 | CLOSED |
| S9 | `ProductUsageEvidence` — ledger canônico de uso, matriz de writers | Skill04, + 11/14/17 | CLOSED |
| S10 | `CANONICAL_SERIALIZATION_V1` | `contracts/CANONICAL-SERIALIZATION.md` | CLOSED |
| S11 | `AUDIT_EVENT_V1` | `contracts/AUDIT-EVENT.md` | CLOSED |
| S12 | Taxonomia de erro / `MachineReasonCode` | `contracts/ERROR-TAXONOMY.md` | CLOSED |
| S13 | `OutboxConsumerDelivery` como entrega canônica única | Skill01/02/03 | CLOSED |
| S14 | `RESULT_MATERIALIZATION_V1` — replay nunca recalcula | `contracts/RESULT-MATERIALIZATION.md` | CLOSED |
| S15 | Segredo nunca em contrato de domínio (`IntegrationCredentialHandleRef`) | Skill24/25 | CLOSED |
| S16 | `ResponseGuard`/`ResponseSuppressionPolicy` explícitos | Skill16 | CLOSED |
| S17 | (fechado pelo Ponto C) | Skill01/02 | CLOSED |
| M1 | `CONTRACT_CONVENTIONS_V1` — vocabulário duplicado unificado (`stageKey`, `PolicyVersion`, `EvidenceMatchJudgement`, pseudo-config removida) | Skills 01/02/03/06/07/09/12 | CLOSED |
| M2 | `OPTIONAL_REFERENCE_RULE_V1` — 3 refs opcionais defensivas removidas | Skills 05/06/07 | CLOSED |
| M3 | `poolSnapshotHash` removido (sem consumer real) | Skill04 | CLOSED |
| M4 | `EXECUTABLE_VERIFICATION_RULE_V1` — métricas só de verificação executável | `CONTRACT-CONVENTIONS.md`, `CONTRACT-LINT.md` | CLOSED |
| M5 | `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1` — Skills 06/20/21 deferidas pra V2 | `IMPLEMENTATION-SCOPE.md`, Skills 01/06/07/20/21/25 | CLOSED |
| M6 | Contrato de segurança separado de finding operacional | Skill25, `CONTINUIDADE.md` (raiz) | CLOSED |
| M7 | Trusted Run Identity Allocation — `runId` nunca vem do caller | Skill01 | CLOSED |
| M8 | Identidade determinística de `scheduleSlotKey` (ocorrência nominal, não bucket de `now()`) | Skill18 | CLOSED |

## Onde olhar (arquivos reais, não confie só neste índice)

```text
src/modules/video-machine/
├── feito.md                          — log técnico detalhado, 1 entrada por achado
├── CONTRACT-LINT.md                  — cada regra de lint, com teste empírico documentado
├── IMPLEMENTATION-SCOPE.md           — Ponto M5, escopo V1 vs V2
├── contracts/
│   ├── CANONICAL-SERIALIZATION.md    — S10
│   ├── AUDIT-EVENT.md                — S11
│   ├── ERROR-TAXONOMY.md             — S12
│   ├── RESULT-MATERIALIZATION.md     — S14
│   ├── VIDEO-COMPOSITION.md          — S6
│   ├── EXECUTION-RUNTIME.md          — S7
│   └── CONTRACT-CONVENTIONS.md       — M1, M2, M4
├── skills/
│   └── NN-nome-da-skill/SPEC.md      — 25 arquivos, um por Skill
└── consolidado/
    └── POST-FABLE-REPAIR-SNAPSHOT-2026-09-18.md  — este arquivo

scripts/contract-lint.mjs             — a ferramenta de verificação real
CONTINUIDADE.md (raiz do repo)        — inclui a seção "🔐 Security findings
                                         rastreados" (achados operacionais
                                         concretos da Skill25, movidos lá
                                         no Ponto M6)
```

## Missão da re-review (diferente da revisão original)

Não redesenhe o sistema do zero. Audite o corpus pós-reparo como um
sistema único e procure **contradições introduzidas pelas próprias
correções** — 25 correções isoladamente corretas podem ter quebrado
alguma interface cruzada entre si.

Responda duas perguntas independentes:

```text
A. Os 25 achados anteriores estão REALMENTE resolvidos?
   (verifique contra o corpus, não aceite CLOSED por declaração)

B. As correções criaram algum problema NOVO?
```

Valide especialmente estas interfaces cruzadas entre achados
diferentes:

- **A/B/D/S5/S7**: `StageIteration`, `StageWorkUnit`, `Job`, `Attempt`,
  `CONTINUE`, lease/fence, worker execution.
- **C/M5**: `RUN_SCOPED`, `STANDALONE`, `DEFERRED_V2_CONTRACT`.
- **E/S7**: quota authorization, `Attempt`, network side effect.
- **S1/S15/S16/S25**: ingress, tenant resolution, credentials, response
  guards, security boundary.
- **S2/S3/S4/S6**: visual refs, CTA, audit evidence, single-beat
  composition.
- **S9/S14**: usage evidence, materialization/replay.
- **S11/S13**: `AuditEvent`, outbox delivery.
- **M7**: `START` idempotency, trusted `runId` allocation.
- **M8**: schedule admission, ocorrência nominal, `scheduleSlotKey`.

### Formato de relatório esperado

```text
PREVIOUS FINDINGS
S1: VERIFIED CLOSED | STILL OPEN | PARTIALLY RESOLVED
...
M8: VERIFIED CLOSED | STILL OPEN | PARTIALLY RESOLVED

NEW FINDINGS
BLOCKER: ...
SIGNIFICANT: ...
MINOR: ...
NOTE: ...

FINAL: implementable / not implementable
(parecer sobre a especificação — nunca autorização de runtime)
```

### Regra para reabrir um achado antigo

Um achado antigo só pode ser reaberto se o relatório citar **arquivo +
contrato/tipo/campo concreto + regra atualmente violada**. Não vale:

```text
"S5 ainda parece ambíguo"
```

Vale:

```text
"Skill01 StageTransitionResolution permite X, enquanto Skill02 Job
settlement exige Y, portanto o estado Z não tem transição legal."
```

## Commit de referência

```text
reviewSnapshotCommit: 37cda13
branch: main
```

Commit dedicado criado capturando exatamente este estado do corpus
(`feat(video-machine): fecha os 25 achados da revisão Fable`,
40 arquivos, todo o módulo `src/modules/video-machine/` +
`scripts/contract-lint.mjs` + a seção de security findings movida
para `CONTINUIDADE.md`). É esta a versão exata que deve ser entregue
ao Codex/GPT-6 Astra para a re-review — se o corpus mudar depois
deste commit, este documento precisa ser atualizado com o novo SHA
antes de reenviar. Até o relatório da re-review voltar, nenhuma
mudança arquitetural deveria ser feita nesse snapshot — correções
externas urgentes de produção (ex.: bot do WhatsApp) podem continuar
em outro commit/branch sem contaminar silenciosamente este corpus em
revisão.
