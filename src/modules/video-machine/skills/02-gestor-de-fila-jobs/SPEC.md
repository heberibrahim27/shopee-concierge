# Skill 02 — Gestor de Fila / Jobs

> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC, worker ou cron foi criado. Este arquivo só vira código depois
> da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-17 após duas rodadas de debate ChatGPT ↔ Claude Code,
> com a interface Skill 01 ↔ Skill 02 congelada (ver `SPEC.md` da Skill 01).
> Marcada como **2/25**.
>
> **🔧 Em reparo transversal (2026-09-18)**: revisão independente do Claude
> Fable 5 Max (pós 25/25 Skills aprovadas) encontrou 6 falhas estruturais
> nas costuras entre Skills — o achado B4 atinge diretamente esta Skill:
> o protocolo entre Skill 02 e os handlers de execução não tinha um
> `resultRef` canônico, `BlockReason` não cobria os códigos que várias
> Skills (10/14/15/16/17/18/19/20/21) já usavam, e não havia contrato
> pra jobs multi-tick (Skill 11) reportarem progresso sem encerrar a
> `Attempt`. Ver `## Reparo transversal pós-revisão Fable` abaixo —
> **Ponto B (protocolo canônico Skill02 ↔ handler) já aplicado.**

## Garantia central

Um único `Job` lógico por `logicalJobKey`; no máximo um lease válido por vez;
múltiplos `Attempt` controlados; efeitos externos protegidos por
**idempotência nativa quando o provider suportar e, quando não suportar, por
reconciliação/bloqueio de estado incerto** (nunca "sem proteção nenhuma").
**Execução at-least-once, nunca exactly-once** — a garantia real é a
ausência de progresso duplicado no nosso lado, não a impossibilidade de um
provider externo ter recebido uma chamada duplicada em cenário de crash raro
(ver "Idempotência contra provider externo" abaixo).

## Objetivo

Possuir o ciclo operacional completo do `Job` — desde consumir um
`LogicalJobIntent` (outbox da Skill 01) até produzir um `JobResultEvent`
terminal que dispara `Skill01.advanceRun()` — e também consumir
`RunCancellationIntent` (outbox de cancelamento da Skill 01).

## Responsabilidades

- Consumir `LogicalJobIntent` pendente **atomicamente**: localizar intent
  pendente → **revalidar o estado atual da Run** → `ensureJob(logicalJobKey,
  payloadHash, intent)` → marcar intent `consumedAt` → commit, numa única
  transação. Se o `Job` já existir pela `logicalJobKey`, o intent é
  consumido apontando para esse mesmo `Job`.
- **Guarda de materialização tardia** (invariante compartilhada com a
  Skill 01 e a Skill 03): nenhum consumidor pode materializar trabalho novo
  para uma Run em `CANCEL_REQUESTED`, `CANCELLED`, `SUCCEEDED` ou `FAILED`
  — o intent pode ter sido emitido antes dessa transição e só consumido
  depois. A checagem acontece no momento da materialização, não apenas
  quando a Skill 01 emitiu o intent: se a Run não aceita mais trabalho
  novo, `ensureJob` **não roda**, o intent é marcado consumido/suprimido
  para esse efeito, e um `AuditEvent` registra a supressão — ACK
  idempotente, nunca erro nem retry infinito.
- `ensureJob` é idempotente por `logicalJobKey`. Mesma `logicalJobKey` +
  mesmo `payloadHash` → reaproveita. Mesma `logicalJobKey` + `payloadHash`
  diferente → `PAYLOAD_CONFLICT` (nunca reuso silencioso).
- Gerenciar a máquina de estados de `Job` (ver "Estados" abaixo).
- Conceder lease a um worker que pega `Job` `QUEUED`, com **fencing token**
  monotônico (`leaseFence`) — não só `workerId`+`expiresAt`. Todo
  heartbeat/relato de execução/resultado apresenta o `leaseFence` vigente;
  fence velho é rejeitado como stale (protege contra worker "zumbi"
  acordando depois da expiração do próprio lease).
- Distinguir o **motivo** da aquisição de lease: `EXECUTE_NEW_ATTEMPT`,
  `POLL_EXISTING_ATTEMPT` ou `HANDLE_CANCELLATION`. Só `EXECUTE_NEW_ATTEMPT`
  incrementa `attemptNumber`. Polling de operação externa (ex.: Veo) e
  tentativa de cancelamento permanecem no mesmo `Attempt`.
- Registrar `RetryPolicy` (de `StageDefinition`, ver Skill 01) como
  **snapshot imutável no `Job`** no momento em que ele nasce — mudança futura
  no pipeline não afeta uma Run já em andamento.
- Consultar `QuotaGuard` antes de **cada** novo `Attempt` com custo
  potencial, não só na checagem inicial feita pela Skill 01.
- Ao resultado terminal (`SUCCEEDED`|`FAILED`|`CANCELLED`), a mesma
  transação: atualiza `Job`, finaliza `JobAttempt`, cria `JobResultEvent`
  durável. Um consumidor/dispatcher separado (do outbox — distinto do
  `sweepStaleJobs()` de leases) entrega o `JobResultEvent` chamando
  `Skill01.advanceRun()`; o evento só é considerado entregue/consumido
  depois que `advanceRun()` concluir com sucesso. Se o consumidor cair
  antes disso, o mesmo `eventId` pode ser entregue novamente — entrega
  at-least-once; a idempotência/versionamento da Skill 01 absorve o
  redelivery.
- Consumir `RunCancellationIntent` (outbox de cancelamento da Skill 01):
  cancela `Job` `QUEUED` diretamente; coloca `Job` `RUNNING`/
  `WAITING_EXTERNAL` no próprio fluxo `CANCEL_REQUESTED`; disponibiliza o
  `Job` para o handler especializado do provider tentar cancelar/reconciliar.
- Staleness/recovery: nunca consulta o provider diretamente. Só olha estado
  persistido (`externalOperationId`, `nextPollAt`, `deadlineAt`, status do
  `Attempt`). Um handler especializado readquire o `Job` na hora certa e
  consulta o provider — a Skill 02 permanece agnóstica de Shopee/Veo/etc.

## Não é responsabilidade

- Decidir qual o próximo stage do pipeline (Skill 01).
- Executar a lógica de negócio do `Job` — isso é do handler de cada Skill de
  execução, que a Skill 02 só invoca via ponteiro/handler registrado.
- Aprovar vídeo, gerar conteúdo, publicar.
- Cancelar diretamente no provider externo (isso é do handler especializado,
  que a Skill 02 apenas aciona).

## Quando é chamada

- Consumo de `LogicalJobIntent` e `RunCancellationIntent` (mesmo
  tick/worker poll-based do MVP).
- Quando um worker pega `Job` (`acquireLease`).
- Quando um handler de Skill de execução termina ou reporta progresso
  (`reportExecution`).
- Reconciliação de leases expirados (`sweepStaleJobs`).

## Quem pode chamar

- Skill 01, indiretamente via outbox (`LogicalJobIntent`,
  `RunCancellationIntent`).
- Handlers de Skills de execução (via `acquireLease`/`reportExecution`).
- Cron/scheduler de reconciliação (compartilhado com o da Skill 01 no MVP —
  sem cron dedicado ainda; separa se as frequências divergirem na prática).

## Quais Skills ela pode chamar

Chama `Skill01.advanceRun(runId)` ao consumir seu próprio `JobResultEvent`
terminal. Não chama Skill de execução diretamente — elas puxam trabalho da
fila (pull), não são invocadas pela Skill 02 (push). Isso mantém a Skill 02
agnóstica de providers.

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


```ts
type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_EXTERNAL"
  | "RETRYING"
  | "BLOCKED" // ver blockReason abaixo — nunca retry automático neste estado
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

type BlockReason = "EXTERNAL_STATE_UNKNOWN" | "QUOTA_PAUSED" | "POLICY_BLOCKED";
// EXTERNAL_STATE_UNKNOWN: provider pode ter recebido/cobrado, mas não sabemos
// QUOTA_PAUSED: QuotaGuard pausou (recuperável — nunca "QUOTA_DENIED" aqui,
//   "DENIED" soaria como decisão definitiva; DENY de verdade termina o Job,
//   não bloqueia — ver "Comportamento do QuotaGuard" abaixo)
// POLICY_BLOCKED: IntegrationRegistry/policy bloqueou, exige resolução explícita
//
// PATCH (Ponto B do reparo transversal pós-Fable, ver seção no fim do
// arquivo): este enum central DEIXA DE SER autoridade — não cobria os
// blockCode namespaced que várias Skills (03/23/24/25) já produziam
// (achado B4 do Fable). Continua existindo como valor histórico/local de
// JobStatus, mas todo bloqueio real passa a ser representado por
// JobBlockDescriptor{category: JobBlockCategory, blockCode: string
// namespaced, ...}, convertido no boundary. Não expandir mais este enum.

type LeasePurpose = "EXECUTE_NEW_ATTEMPT" | "POLL_EXISTING_ATTEMPT" | "HANDLE_CANCELLATION";

type Job = {
  id: string;
  // PATCH (Reparo transversal pós-revisão Fable, Ponto D — ver
  // SPEC.md da Skill 01): pra Jobs RUN_SCOPED, logicalJobKey precisa
  // incluir a identidade da StageExecution e da PreparedSkillInvocation
  // — nunca só productionRunId+stageKey, senão a mesma stage
  // re-executada numa StageIteration diferente colidiria com a
  // execução anterior. Derivação conceitual:
  // RUN:<tenantId>:<productionRunId>:<stageExecutionId>:<preparedInvocationHash>
  // (ou canonical equivalent). Pra Jobs STANDALONE, deriva de
  // STANDALONE:<tenantId>:<standaloneWorkRequestId> (Ponto C).
  logicalJobKey: string; // UNIQUE(tenantId, logicalJobKey)
  payloadHash: string;
  tenantId: string;
  runId: string;
  stageKey: StageKey; // PATCH (Ponto M1, reparo transversal pós-revisão
    // Fable, 2026-09-18, CONTRACT_CONVENTIONS_V1) — antes "stage:
    // string" (referenciando PipelineStage). stageKey é o único nome
    // de identidade de stage no corpus; StageKey é contrato
    // compartilhado (ver Skill 01, contracts/CONTRACT-CONVENTIONS.md)
  subjectType: string;
  subjectId: string;
  stageWorkUnitIdentityHash: string; // Ponto S5 (01-orquestrador-de-producao/SPEC.md)
    // — antes variantKey (string livre, sem gramática), agora
    // STAGE_WORK_UNIT_IDENTITY_V1
  status: JobStatus;
  blockReason?: BlockReason;
  attemptCount: number;
  retryPolicy: RetryPolicy; // snapshot imutável do nascimento do Job
  leaseOwner?: string;
  leaseExpiresAt?: string;
  leaseFence: number; // monotônico por Job
  cancelRequestedAt?: string;
  cancelReason?: string;
  // metadados de escalonamento/intervenção — nunca um novo JobStatus
  blockedAt?: string;
  lastResolutionAttemptAt?: string;
  resolutionAttempts?: number;
  nextResolutionAt?: string;
  interventionRequired?: boolean;
  availableAt: string;
  version: number; // optimistic concurrency, independente do leaseFence
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

type ExternalEffectState = "NOT_STARTED" | "SUBMITTING" | "CONFIRMED" | "UNKNOWN";

type JobAttempt = {
  jobId: string;
  attemptNumber: number; // UNIQUE(jobId, attemptNumber)
  startedAt: string;
  finishedAt?: string;
  externalEffectState: ExternalEffectState;
  externalOperationId?: string;
  providerRequestKey?: string; // determinístico, quando o provider suportar idempotência nativa
  nextPollAt?: string;
  deadlineAt?: string;
  outcome?: string;
  errorCode?: string;
};

// PATCH (Ponto S12, reparo transversal pós-revisão Fable, 2026-09-18):
// JobExecutionReport é LEGACY/SUPERSEDED — protocolo canônico é
// JobExecutionResult (Ponto B, ver mais abaixo). errorClass?: string
// não tinha domínio compartilhado (achado S12 do Fable) e não
// participa do protocolo canônico; nunca ler/escrever este campo em
// código novo. Falhas usam JobFailureDescriptor.category/failureCode/
// retryAdvice, formalizados em
// src/modules/video-machine/contracts/ERROR-TAXONOMY.md.
type JobExecutionReport = {
  jobId: string;
  leaseFence: number;
  attemptNumber: number;
  outcome: "COMPLETED" | "WAITING_EXTERNAL" | "RETRYABLE_ERROR" | "FATAL_ERROR" | "BLOCKED" | "CANCELLED";
  externalOperationId?: string;
  nextPollAt?: string;
  deadlineAt?: string;
  errorClass?: string; // NON-AUTHORITATIVE LEGACY FIELD — DO NOT WRITE, DO NOT READ
  errorCode?: string;
  retryAfter?: string;
  resultPayload?: unknown;
  metadata?: unknown; // só informação específica do provider — nunca estado necessário à recuperação
};

// UNIQUE(jobId, attemptNumber) para o evento terminal deste Job/Attempt.
type JobBlockedEvent = {
  eventId: string;
  eventType: "JOB_BLOCKED"; // NÃO terminal — trabalho precisa esperar/intervenção/reconciliação
  tenantId: string;
  jobId: string;
  jobVersion: number; // Skill 1 ignora evento stale quando já existe evidência durável de versão posterior do Job
  logicalJobKey: string;
  runId: string;
  blockReason: BlockReason;
  createdAt: string;
  consumedAt?: string; // PATCH (Ponto S13): LEGACY/NON-AUTHORITATIVE — ver nota em LogicalJobIntent (Skill 01); entrega canônica é OutboxConsumerDelivery
};

type JobResultEvent = {
  eventId: string;
  eventType: "JOB_RESULT";
  tenantId: string;
  jobId: string;
  logicalJobKey: string;
  runId: string;
  outcome: "SUCCEEDED" | "FAILED" | "CANCELLED";
  attemptNumber: number;
  finishedAt: string;
  resultPayload?: unknown;
  errorCode?: string;
  createdAt: string;
  consumedAt?: string; // PATCH (Ponto S13): LEGACY/NON-AUTHORITATIVE — ver nota em LogicalJobIntent (Skill 01); entrega canônica é OutboxConsumerDelivery
};

// funções (assinaturas do contrato, não implementação):
// ensureJob(logicalJobKey, payloadHash, intent) -> Job
//   idempotente; PAYLOAD_CONFLICT se payloadHash divergir pra mesma logicalJobKey
// acquireLease(jobId, workerId, purpose: LeasePurpose, ttl, expectedVersion) -> { leaseFence } | LEASE_DENIED
// heartbeat(jobId, leaseFence)
//   renova leaseExpiresAt com WHERE leaseFence = atual; NÃO altera estado
//   lógico do Job e NÃO incrementa version (evita version churn a cada
//   heartbeat) — toda mutação lógica usa leaseFence + expectedVersion.
// reportExecution(jobId, leaseFence, expectedVersion, JobExecutionReport) -> aceito | REJECTED_STALE_FENCE
// consumeRunCancellationIntent(intent: RunCancellationIntent) -> void
```

`providerRequestKey`, quando aplicável (provider com suporte a idempotência
nativa), é calculada e **persistida antes da primeira chamada externa** do
`Attempt`, e permanece imutável durante aquele `Attempt` — nunca inventada
depois da submissão, senão não protege o crash no ponto mais perigoso.

## Estados

`QUEUED → RUNNING → (WAITING_EXTERNAL | RETRYING | BLOCKED |
CANCEL_REQUESTED | SUCCEEDED | FAILED | CANCELLED)`.

- `BLOCKED` + `blockReason = EXTERNAL_STATE_UNKNOWN`: usado quando o
  provider pode ter recebido/cobrado uma operação mas o processo caiu antes
  de persistirmos o `externalOperationId`. **Nunca retry automático nesse
  estado** — precisa de reconciliação manual ou confirmação do handler.
  Emite `JobBlockedEvent` (ver "Comportamento do `QuotaGuard`" abaixo, que
  documenta as duas famílias de evento — terminal vs. não terminal).
- Cancelamento cobre **todos** os estados não terminais, não só `QUEUED`,
  `RUNNING` e `WAITING_EXTERNAL`:
  - `QUEUED → CANCELLED` (direto, nenhum efeito externo iniciado).
  - `RETRYING → CANCELLED` (direto, não há efeito externo em andamento).
  - `RUNNING → CANCEL_REQUESTED`.
  - `WAITING_EXTERNAL → CANCEL_REQUESTED`.
  - `BLOCKED (EXTERNAL_STATE_UNKNOWN) → CANCEL_REQUESTED` — nunca direto a
    `CANCELLED`, porque justamente não sabemos se existe efeito externo
    ativo.
  - Em todo caso de `CANCEL_REQUESTED`: `cancelRequestedAt` + `cancelReason`
    preenchidos, `Job` disponível para o handler especializado tentar
    cancelar/reconciliar no provider. Só depois vira `CANCELLED`.

### Máquina de estado do efeito externo (`externalEffectState`, por Attempt)

```
antes da chamada externa:
  persistir JobAttempt.externalEffectState = SUBMITTING
    (+ providerRequestKey, quando aplicável)
  → COMMIT (transação fechada, durável)
  → só depois chamar o provider (nenhuma transação de banco aberta
    atravessando a chamada de rede)

provider respondeu + operationId persistido:
  CONFIRMED

SUBMITTING + perda de lease/crash + nenhuma confirmação persistida:
  → handler tenta reconciliação quando for segura (provider com
    idempotência nativa → reconcilia/repete com a mesma
    providerRequestKey)
  → se o estado continuar indeterminável:
      JobAttempt.externalEffectState = UNKNOWN
      Job.status = BLOCKED
      Job.blockReason = EXTERNAL_STATE_UNKNOWN
      + JobBlockedEvent
    (as três mudanças acima na mesma transação lógica)
```

`SUBMITTING` significa "a partir daqui o side effect pode ter acontecido".
Commitá-lo **antes** de chamar o provider é deliberadamente conservador: se
o processo cair depois desse commit mas antes de realmente chamar um
provider sem idempotência, podemos bloquear um `Job` que na prática não foi
enviado. Esse falso positivo é aceitável — é mais seguro do que
cobrar/gerar duas vezes.

Isso fecha o cenário de crash mais perigoso: chamar o provider e cair antes
de persistir o `externalOperationId`. `providerRequestKey` sozinho não
basta quando o provider não oferece idempotência — só o marcador
`externalEffectState = SUBMITTING`, persistido **antes** do side effect,
permite detectar esse estado incerto depois.

`deadlineAt` expirar **não autoriza retry automático**. Mesmo com
`externalOperationId` vencido, o handler especializado deve
consultar/reconciliar o provider primeiro; só se continuar impossível
determinar o estado é que o `Job` vai para
`BLOCKED`/`EXTERNAL_STATE_UNKNOWN` (e o `JobAttempt` correspondente para
`UNKNOWN`). `deadlineAt` significa "hora de reconciliar agora", não
"a operação certamente morreu" nem "gerar novamente".

## Idempotência contra provider externo

`providerRequestKey` determinístico quando o provider suportar idempotência
nativa (ex.: alguns endpoints aceitam uma chave de idempotência do cliente).
Quando o provider não suportar e o estado ficar incerto após um crash (efeito
externo pode ter ocorrido, mas não persistimos o ID de confirmação), o `Job`
**não repete cegamente** — entra em `BLOCKED`/`EXTERNAL_STATE_UNKNOWN` até
confirmação.

## Concorrência

`acquireLease()` usa atualização atômica condicional, mas o predicado
depende do `LeasePurpose` — não pode aceitar só `status = 'QUEUED'`:

```
EXECUTE_NEW_ATTEMPT → status = QUEUED, ou status = RETRYING com availableAt <= now()
POLL_EXISTING_ATTEMPT → status = WAITING_EXTERNAL com nextPollAt <= now()
HANDLE_CANCELLATION → status = CANCEL_REQUESTED
```

Sempre com `AND leaseOwner IS NULL AND version = expectedVersion` — só um
worker consegue, os demais recebem `LEASE_DENIED`. Duas proteções
independentes: `leaseFence` (contra worker "zumbi" pós-expiração) e
`version` (optimistic concurrency contra atualização concorrente).

## Retry

Consome `RetryPolicy` (snapshot do `Job`, herdado da `StageDefinition` da
Skill 01: `maxAttempts`, `backoff`, `eligibilityModel` — `retryableErrorClasses`
foi removido no Ponto S12, ver `contracts/ERROR-TAXONOMY.md`).
`maxAttempts` **inclui a primeira tentativa** (evita erro off-by-one).
Elegibilidade real de retry vem de `JobFailureDescriptor.category`/
`retryAdvice` (matriz conservadora do S12), não de `RetryPolicy`. Fluxo:

```
erro retryable → status = RETRYING, availableAt = backoff calculado

quando availableAt chega:
  → acquireLease(EXECUTE_NEW_ATTEMPT)
  → incrementa attemptCount
  → RUNNING

se attemptCount >= maxAttempts:
  → FAILED
```

### Comportamento do `QuotaGuard` antes de novo `Attempt` pago

`QuotaGuard` reavaliado antes de **cada** novo `Attempt` pago (não só na
checagem inicial da Skill 01). Quatro resultados possíveis, cada um com
consequência explícita — nunca fica só "consultou o guard e não fez nada":

```
ALLOW
  → cria novo Attempt normalmente

PAUSE
  → Job BLOCKED / QUOTA_PAUSED
  → persiste JobBlockedEvent no mesmo commit
  → Skill 1 recebe e coloca a Run em PAUSED com pause_reason de quota

DENY
  → não cria novo Attempt
  → Job FAILED terminal com errorCode = QUOTA_DENIED
  → JobResultEvent terminal
  → Skill 1 decide a consequência no pipeline

BLOCK
  → Job BLOCKED / POLICY_BLOCKED
  → persiste JobBlockedEvent
  → exige resolução explícita (intervenção operacional)
```

`EXTERNAL_STATE_UNKNOWN` segue o mesmo padrão de `PAUSE`/`BLOCK`: também
emite `JobBlockedEvent`, avisando a Skill 01 que a Run deve ficar `BLOCKED`
— sem fingir que o `Job` terminou.

### Transação atômica de entrada em `BLOCKED`

A garantia atômica é **"estado durável que causou o bloqueio + evento
correspondente"** — o `JobAttempt` só entra na transação quando existe um
`Attempt` efetivamente afetado; nem toda entrada em `BLOCKED` atualiza um
`JobAttempt`:

```
EXTERNAL_STATE_UNKNOWN (existe Attempt afetado) — mesma transação:
  JobAttempt.externalEffectState = UNKNOWN
  Job.status = BLOCKED
  Job.blockReason = EXTERNAL_STATE_UNKNOWN
  incrementa Job.version
  cria JobBlockedEvent com jobVersion = nova Job.version

QUOTA_PAUSED | POLICY_BLOCKED (detectado antes de iniciar novo Attempt,
nenhum Attempt artificial criado/finalizado) — mesma transação:
  Job.status = BLOCKED
  Job.blockReason = QUOTA_PAUSED | POLICY_BLOCKED
  blockedAt / metadados aplicáveis
  incrementa Job.version
  persiste RunPolicyDecision correspondente
  cria JobBlockedEvent com jobVersion = nova Job.version
```

`JobBlockedEvent.jobVersion` é sempre a versão **resultante** da própria
transição para `BLOCKED`, nunca a versão anterior — isso torna a checagem
de evento stale (feita pela Skill 01) determinística.

Duas famílias de evento bem separadas:

```
JobResultEvent  → terminal (SUCCEEDED | FAILED | CANCELLED)
JobBlockedEvent → não terminal (trabalho precisa esperar/intervenção/reconciliação)
```

## Staleness / reconciliação

`sweepStaleJobs()` — responsabilidade conceitualmente separada, mas
compartilha scheduler com o reconciliador da Skill 01 no MVP (sem cron
dedicado ainda). `Job` é possivelmente órfão quando `leaseExpiresAt < now()`
sem heartbeat. Antes de liberar para retry, verifica estado persistido
(`externalOperationId`, `nextPollAt`, `deadlineAt`) — se há operação externa
dentro do prazo, **não** cria novo `Attempt`.

## Escalonamento de `Job` `BLOCKED` (não é dead-letter)

`BLOCKED` já representa corretamente "o trabalho não terminou, mas não pode
continuar sozinho" — não vira um novo `JobStatus` tipo
`REQUIRES_MANUAL_REVIEW` (misturaria estado de negócio do `Job` com falha
operacional de entrega). Em vez disso, o `Job` carrega metadados de
escalonamento (`blockedAt`, `lastResolutionAttemptAt`,
`resolutionAttempts`, `nextResolutionAt`, `interventionRequired`):

```
BLOCKED / QUOTA_PAUSED
  interventionRequired = false
  nextResolutionAt = próxima janela de quota

BLOCKED / EXTERNAL_STATE_UNKNOWN, após N tentativas de reconciliação
ou prazo configurado sem resolução:
  interventionRequired = true
```

Continua não terminal até decisão concreta: reconciliou → continua/sucesso;
decidiu abandonar → `FAILED`; cancelou → `CANCELLED`.

## Redelivery / dead-letter dos outboxes

Três conceitos ficam limpos e **não se misturam**:

```
FAILED       = trabalho terminou sem sucesso
BLOCKED      = trabalho ainda não terminou, precisa esperar/resolução
DEAD_LETTER  = falhou repetidamente a ENTREGA/PROCESSAMENTO de um evento
               interno (LogicalJobIntent, RunCancellationIntent,
               JobResultEvent, JobBlockedEvent) — nunca significa que o
               Job falhou
```

### Single canonical delivery mechanism (Ponto S13, reparo transversal pós-revisão Fable, 2026-09-18)

> Todo outbox interno usa `OutboxConsumerDelivery` (definido no
> `SPEC.md` da Skill 01) como **única** fonte canônica de verdade pra
> saber se uma mensagem foi entregue a um consumer. Nenhum campo do
> lado do produtor — incluindo qualquer `consumedAt` legado — pode
> determinar delivery eligibility, idempotência, retry, redelivery ou
> conclusão de consumo. `OutboxDeliveryMeta` (abaixo) é metadata
> pertencente ao ciclo de vida de `OutboxConsumerDelivery`, nunca um
> segundo mecanismo de consumo independente. Isso vale **mesmo pra
> outbox single-consumer** — `1 consumer → consumedAt` / `N consumers →
> OutboxConsumerDelivery` criaria dois caminhos de runtime; achado
> exato S13 da revisão Fable/Claude Fable 5 Max. `RunCancellationIntent`
> (que já usava `OutboxConsumerDelivery` desde antes) não era exceção —
> era o padrão correto que faltava generalizar.

Envelope conceitual compartilhado por todo consumo de outbox:

```ts
type OutboxDeliveryState = "PENDING" | "DELIVERED" | "DEAD_LETTER";

// PATCH (Ponto S13): OutboxDeliveryMeta é metadata do ciclo de vida de
// OutboxConsumerDelivery, NÃO um mecanismo de consumo independente —
// nunca decide sozinho "consumido/não consumido".
type OutboxDeliveryMeta = {
  deliveryAttempts: number;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  deliveryState: OutboxDeliveryState;
};
```

Todo outbox — incluindo `LogicalJobIntent`/`JobResultEvent`/
`JobBlockedEvent`, hoje single-consumer — usa `OutboxConsumerDelivery`
(chaveado por `UNIQUE(eventId, consumerKey)`) como registro canônico de
entrega, com `consumerKey` estável e namespaced (ex.:
`SKILL02.JOB_MATERIALIZER`, nunca worker UUID/pod name/request id).
`RunCancellationIntent` tem **fan-out** real (Skill 02 e Skill 03
consomem independentemente) — mas isso não torna `OutboxConsumerDelivery`
um mecanismo "extra" só pra fan-out; é o único mecanismo, ponto.

Regra:

```
falha transitória → PENDING → backoff → tenta novamente
sucesso → DELIVERED em OutboxConsumerDelivery (consumedAt legado, se
  existir no artifact produtor, NÃO é escrito/lido por essa transição)
falhas repetidas além da política → DEAD_LETTER
  → AuditEvent/alerta operacional
  → não perde o evento
  → não altera silenciosamente o estado lógico do Job/Run
```

`maxDeliveryAttempts` e o `backoff` de entrega são configuração de
infraestrutura, definidos na fase de implementação — o que este SPEC fixa é
a semântica, não o número.

`DEAD_LETTER` pertence ao **registro de entrega/consumo**, nunca ao evento
de domínio em si: o mesmo `eventId` continua sendo a identidade lógica
original, `OutboxDeliveryMeta` guarda só o estado operacional daquela
entrega. Redrive é explícito e auditado, preserva o mesmo `eventId`, não
cria um novo efeito de negócio, não "zera" idempotência e não altera
sozinho `Job` ou `ProductionRun`.

Caso especialmente sensível: `LogicalJobIntent` em `DEAD_LETTER`. Se a
**entrega** desse outbox morre, a Run pode ficar parada aguardando
resolução — mas o `Job` **nunca** é marcado `FAILED` artificialmente por
isso (na prática, se a entrega nunca chegou a consumir o intent,
`ensureJob` nem rodou — não existe `Job` para marcar). O problema é de
transporte interno da Skill 02, não de execução do trabalho; resolve-se
com redrive do `LogicalJobIntent`, não com mudança de estado de negócio.

## Observabilidade

Log estruturado por transição de `Job`, com contexto suficiente para
correlação sem depender de joins/logs dispersos (campos não aplicáveis
ficam ausentes, não é preciso preencher tudo sempre):

```
tenantId
runId
jobId
logicalJobKey
fromStatus
toStatus
attemptNumber?
leaseFence?
leasePurpose?
blockReason?
errorCode?
externalEffectState?
timestamp
```

`AuditEvent` persistido para toda transição lógica do `Job`. **Heartbeat
não é transição lógica** e não gera `AuditEvent` a cada renovação — métrica
técnica agregável separada, para não poluir auditoria.

Métricas de fila:

- jobs por status;
- idade média/p95 de `Job` em `QUEUED`;
- `Job` em `WAITING_EXTERNAL` além de `nextPollAt`/`deadlineAt`;
- leases expiradas/stale por período;
- taxa de `BLOCKED` por `blockReason`; número e idade de `Job` `BLOCKED`
  com `interventionRequired = true`;
- taxa de `DEAD_LETTER` por tipo de outbox — detecta quebra de
  infraestrutura mesmo quando `Job` não aparece como `FAILED`.

## Segurança

Nenhum secret de provider passa pela Skill 02 diretamente (fica com os
handlers especializados). `tenantId` presente em todo `Job`, nunca aceito de
payload externo não autenticado.

## Multi-tenant

`tenantId` é campo obrigatório do `Job`, herdado do contexto confiável da
`Run`/`LogicalJobIntent` — nunca aceito trocado durante `ensureJob()`,
`acquireLease()`, `reportExecution()` ou consumo de eventos. Usado em toda
query e em todo evento (`JobResultEvent`, `JobBlockedEvent`).

**Invariante de isolamento** (arquitetural, ainda não comprovado por
runtime nesta fase de spec): toda leitura, escrita, transição de estado e
evento deve ser escopado por `tenantId`. Nenhuma operação pode confiar
apenas em `jobId`/`runId` recebidos externamente como fronteira de
autorização.

Unicidade do `Job` documentada com o tenant explícito na chave —
`UNIQUE(tenantId, logicalJobKey)`, não só `UNIQUE(logicalJobKey)` — mesmo
que hoje o `runId` já torne a chave efetivamente única. Isso deixa
explícito que a identidade lógica do trabalho pertence ao tenant e evita
depender para sempre de unicidade global acidental (preparação para SaaS).

## Interface Skill 01 ↔ Skill 02

Ver `SPEC.md` da Skill 01, seção "Interface Skill 1 ↔ Skill 2 (congelada)" —
fonte única da verdade sobre o fluxo de outbox nos dois sentidos.

`JobBlockedEvent` integra oficialmente essa interface: entregue
**at-least-once**, carrega `jobVersion` para a Skill 01 ignorar evento stale
quando já existir evidência durável de uma versão posterior do `Job`.
Consequência na Run:

```
QUOTA_PAUSED           → Run vai para PAUSED (pause_reason de quota)
POLICY_BLOCKED          → Run vai para BLOCKED
EXTERNAL_STATE_UNKNOWN  → Run vai para BLOCKED
```

`RunPolicyDecision` (definida no `SPEC.md` da Skill 01) deixa de ser
propriedade exclusiva da Skill 01 — é um **contrato compartilhado de
auditoria**, com `tenantId`/`runId`/`jobId?`/`attemptNumber?` para dar
contexto suficiente de auditoria em ambos os lados. Quem consulta o guard
persiste a decisão: a Skill 01 durante orquestração (checagem inicial, sem
`jobId`/`attemptNumber` — ainda não existe `Job`) e a Skill 02 antes de
cada novo `Attempt` pago (reavaliação por retry, `jobId`/`attemptNumber`
preenchidos com o `Job`/`Attempt` exato que a decisão afetou).

## Plano de testes

### Casos críticos (obrigatórios)

Cobrem as invariantes desenhadas — o número não é o que importa, a
cobertura sim:

- Worker A perde lease e tenta reportar depois do worker B (`leaseFence`
  velho rejeitado).
- Crash depois do efeito externo (provider aceitou/cobrou) e antes de
  persistir `externalOperationId` → `Job` entra em
  `BLOCKED`/`EXTERNAL_STATE_UNKNOWN`, nunca repete cego.
- Polling repetido do mesmo `externalOperationId` não incrementa
  `attemptNumber`.
- Mesma `logicalJobKey` com `payloadHash` diferente → `PAYLOAD_CONFLICT`.
- Mesma `logicalJobKey` com o **mesmo** `payloadHash` → reaproveita o mesmo
  `Job` lógico, sem conflito nem duplicação.
- Retry barrado por `QuotaGuard` antes de um `Attempt` pago.
- `CANCEL_REQUESTED` com operação externa ativa — handler tenta
  cancelar/reconciliar antes de `CANCELLED`.
- `JobResultEvent` persistido mas `advanceRun()` falhando → dispatcher do
  outbox reentrega o mesmo `eventId`, sem duplicar progressão (idempotência
  do lado da Skill 01 absorve).
- Dois workers disputando `acquireLease()` no mesmo `Job` — só um consegue.
- `reportExecution()` com `leaseFence` velho → `REJECTED_STALE_FENCE`.
- Consumo de `RunCancellationIntent` duplicado (redelivery at-least-once) —
  idempotente, não repete efeito externo de cancelamento.
- `JobBlockedEvent` atrasado com `jobVersion` menor que a versão atual do
  `Job` → ACK/ignora, não altera a Run.
- `JobBlockedEvent` chegando quando a Run já está `CANCEL_REQUESTED`,
  `CANCELLED`, `SUCCEEDED` ou `FAILED` → nunca reverte a Run.
- `QuotaGuard` testado separadamente para os quatro resultados: `PAUSE` →
  `BLOCKED`/`QUOTA_PAUSED` + `JobBlockedEvent`; `DENY` → `FAILED` +
  `JobResultEvent`; `BLOCK` → `BLOCKED`/`POLICY_BLOCKED` +
  `JobBlockedEvent`.
- `SUBMITTING` persistido e commitado antes da chamada externa; crash antes
  da chamada real produz o comportamento conservador previsto (sem retry
  cego em provider sem idempotência).
- `WAITING_EXTERNAL` com `deadlineAt` vencido → não cria novo `Attempt`;
  readquire com `POLL_EXISTING_ATTEMPT` e força reconciliação.
- Heartbeat com `leaseFence` válido renova só o lease — não incrementa
  `version` nem gera `AuditEvent`.
- Outbox chegando a `DEAD_LETTER` → `Job`/Run não mudam de estado; redrive
  explícito preserva `eventId` e não duplica efeito.
- `LogicalJobIntent` em `DEAD_LETTER` antes de `ensureJob()` → nenhum `Job`
  marcado `FAILED` artificialmente (pode nem existir `Job` ainda).
- Tentativa de consumir/alterar `Job` com `tenantId` diferente → rejeitada;
  `UNIQUE(tenantId, logicalJobKey)` respeitado.
- `BLOCKED`/`EXTERNAL_STATE_UNKNOWN` em cancelamento → passa por
  `CANCEL_REQUESTED`, nunca direto para `CANCELLED`.
- `JobBlockedEvent` criado atomicamente com a nova `jobVersion` da
  transição para `BLOCKED`.

### Teste real

Adiado — sem schema/migration em produção nesta fase. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `Job`, `JobAttempt`,
  `JobExecutionReport`, `JobResultEvent`, `JobBlockedEvent`, `JobStatus`,
  `BlockReason`, `LeasePurpose` e os contratos compartilhados de
  entrega/outbox aplicáveis (`OutboxDeliveryState`/`OutboxDeliveryMeta`,
  `RunPolicyDecision`) — com `leaseFence` e `version` como proteções
  distintas.
- `JobStatus` inclui `BLOCKED` para estados não terminais que exigem
  espera, reconciliação ou intervenção; `BlockReason` inclui
  `EXTERNAL_STATE_UNKNOWN`, `QUOTA_PAUSED` e `POLICY_BLOCKED`, distinguindo
  a causa do bloqueio.
- Consumo de `LogicalJobIntent` e `RunCancellationIntent` documentado como
  atômico e idempotente.
- Garantia central reformulada de "roda no máximo uma vez" para a versão
  tecnicamente honesta (at-least-once + idempotência/reconciliação).
- `RetryPolicy` como snapshot imutável no `Job`.

## Dependências

Skill 01 — Orquestrador de Produção (outbox de entrada:
`LogicalJobIntent`/`RunCancellationIntent`; outbox de saída consumido por
ela: `JobResultEvent`, `JobBlockedEvent`). Interface congelada em
2026-09-17.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão (não alteram os contratos congelados desta Skill):

- lease TTL;
- heartbeat interval;
- `maxDeliveryAttempts`;
- política/backoff de redelivery;
- frequências concretas dos reconciliadores;
- thresholds para escalonamento de `BLOCKED`/`interventionRequired`.

## Reparo transversal pós-revisão Fable (2026-09-18)

> Contexto: revisão independente do Claude Fable 5 Max encontrou 6
> falhas bloqueantes nas costuras entre Skills. **B4** (`resultRef` que
> Skills 04-07 esperavam não existia no tipo real da Skill 02; Skills
> 09-21 nem mencionavam o mecanismo de report; `BlockReason` que várias
> Skills usavam não estava no enum) atinge esta Skill diretamente.
> Resolvido pelo Ponto B da rodada de reparo transversal (A-G) aberta
> entre ChatGPT e Claude Code.

### Ponto B — protocolo canônico Skill 02 ↔ handler

**Resolve B4.** Regra central: Skill 02 conhece `Job`, `Attempt`,
`leaseFence`, a referência ao `PreparedSkillInvocation` (Ponto A),
versão do handler e `JobExecutionResult`/settlement/outbox — **nunca**
conhece `VideoArtifact`, `OfferAnalysisResult`, `VideoAuditResult`,
`AffiliateLinkArtifact`, `ReportSnapshot` ou qualquer resultado de
domínio. Toda Skill executada via Skill 02 fala exatamente este
protocolo.

**Correção importante em relação à premissa inicial**:
`JobExecutionResult` não pode significar "um resultado por Attempt" —
a Skill 11 já exige polling/resume de uma operação dentro da **mesma**
Attempt. Por isso ele é **um report por invocação/tick do handler**,
podendo retornar `CONTINUE` sem encerrar a Attempt.

**Nota de implementação (evita dependência circular)**: `KernelArtifactRef`
e os contratos compartilhados entre Skill 01/02 devem viver, no runtime
futuro, num módulo neutro de tipos (ex.:
`src/modules/video-machine/contracts/execution-kernel.ts`) — nunca
`Skill01 runtime imports Skill02` + `Skill02 runtime imports Skill01`.
A autoridade semântica continua sendo Skill 01/02 conforme já definido;
nenhuma nova "Skill 26" é criada.

```typescript
// B3 — handler descriptor
// PATCH (Ponto C): + executionScopeSupport, conteúdo do hash muda, nome
// do hash não muda (ainda estamos reparando spec pré-runtime, sem V2).
type SkillJobHandlerDescriptor = {
  handlerKey: string;
  handlerVersion: string;
  targetSkillId: string;
  acceptedInputContractKey: string;
  acceptedInputContractVersion: string;
  primaryResultContractKey: string;
  primaryResultContractVersion: string;
  executionScopeSupport: SkillJobExecutionScopeSupport;
  quotaIntegration: SkillJobQuotaIntegration; // PATCH (Ponto E)
  handlerDescriptorHash: string;
};
// hash: SKILL_JOB_HANDLER_DESCRIPTOR_V1

// B4 — referência congelada do handler (versão congelada quando o Job
// é materializado; proibido resolveLatestHandler(skillId) durante retries)
type SkillJobHandlerRef = {
  handlerKey: string;
  handlerVersion: string;
  handlerDescriptorHash: string;
};
// Sem hash próprio.

// B5/B6 — compatibilidade Adapter ↔ Handler (invariante, não tipo novo):
// SkillExecutionAdapterDescriptor.targetSkillId === SkillJobHandlerDescriptor.targetSkillId
// adapter.inputContractKey/version === handler.acceptedInputContractKey/version
// adapter.resultContractKey/version === handler.primaryResultContractKey/version
// Divergência é erro contratual.

// B7 — binding complementar (não reabre PreparedSkillInvocation do Ponto A)
// PATCH (Ponto C): preparedInvocationId/Hash universais saem daqui —
// PreparedSkillInvocation é naturalmente RUN_SCOPED (referencia Run/Stage)
// e um Job STANDALONE não pode fingir que a possui. Substituído por
// executionScopeRef/invocationSourceRef/inputPayloadRef/consumer.
// Nome do hash não muda.
type JobExecutionBinding = {
  jobExecutionBindingId: string;
  tenantId: string;
  jobId: string;
  targetSkillId: string;
  executionScopeRef: JobExecutionScopeRef;
  invocationSourceRef: JobInvocationSourceRef;
  inputPayloadRef: KernelArtifactRef;
  handler: SkillJobHandlerRef;
  consumer: JobExecutionConsumerRef;
  bindingHash: string;
  createdAt: string;
};
// hash: JOB_EXECUTION_BINDING_V1
// B8: Job → exatamente um JobExecutionBinding. Retry técnico não troca
// invocationSourceRef/handler version/targetSkill — se precisar trocar
// semanticamente qualquer um deles, é novo Job lógico (essencial pro
// Ponto D).

// B9 — patch ao LogicalJobIntent já existente (sem redefini-lo):
// adiciona preparedInvocationId: string; preparedInvocationHash: string;
// Passa a dizer "materialize trabalho para esta invocação de Skill já
// preparada" — Skill01 não envia payload cru de domínio pra Skill02.

// B12 — contexto de cada execução física do handler (cada tick/lease)
// PATCH (Ponto C): preparedInvocationId/Hash universais → executionScopeRef
// + invocationSourceRef. Nome do hash não muda.
type JobHandlerExecutionContext = {
  handlerInvocationKey: string; // >= tenantId+jobId+attemptNumber+leaseFence
  tenantId: string;
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  leaseFence: number;
  jobExecutionBindingId: string;
  jobExecutionBindingHash: string;
  executionScopeRef: JobExecutionScopeRef;
  invocationSourceRef: JobInvocationSourceRef;
  handler: SkillJobHandlerRef;
  inputPayloadRef: KernelArtifactRef;
  executionContextHash: string;
  createdAt: string;
};
// hash: JOB_HANDLER_EXECUTION_CONTEXT_V1
// B14: Attempt ≠ handler invocation. Skill11 exige submit → aguarda →
// polling → polling → resultado, tudo dentro da MESMA Attempt — logo
// uma Attempt pode ter várias invocações físicas (mesma Attempt + novo
// leaseFence = novo tick do handler).

// B15 — a única interface universal do handler
interface SkillJobHandler {
  readonly descriptor: SkillJobHandlerDescriptor;
  execute(context: JobHandlerExecutionContext): Promise<JobExecutionResult>;
}
// B16 — handler PODE: executar lógica da Skill, usar providers conforme
// contratos daquela Skill, materializar artifacts de domínio, persistir
// checkpoints, retornar JobExecutionResult. NÃO PODE: mudar JobStatus
// diretamente, criar Attempt diretamente, adquirir lease, decidir
// maxAttempts, marcar Job SUCCEEDED, reabrir Job. Skill02 continua
// autoridade da fila.

// B17 — o único outcome compartilhado entre handlers e Skill02
type JobExecutionOutcome = 'CONTINUE' | 'SUCCEEDED' | 'BLOCKED' | 'FAILED';
// B18: CONTINUE significa "esta Attempt ainda não terminou; o estado
// durável necessário foi preservado e Skill02 deve agendar/permitir
// outro tick da mesma Attempt" — NÃO é retry, não aumenta attemptNumber.

type JobContinuationMode = 'IMMEDIATE' | 'AFTER_TIME' | 'PROVIDER_POLL' | 'DEPENDENCY_RECHECK';

type JobContinuationDescriptor = {
  continuationCode: MachineReasonCode; // ex.: "SKILL11.PROVIDER_OPERATION_PENDING"
  mode: JobContinuationMode;
  notBefore?: string;
  checkpointRef?: KernelArtifactRef;
};
// Sem hash próprio. Skill02 não interpreta semanticamente o código — só
// mode/notBefore pra scheduling genérico.
// PATCH (Ponto S12): continuationCode agora tipa formalmente como
// MachineReasonCode (contracts/ERROR-TAXONOMY.md), mesma gramática
// SKILL<NN>.<CODE> / PROJECT.<CODE> já usada informalmente aqui.

// B21 — o antigo problema BlockReason morre aqui: enum pequeno e
// infraestrutural, nunca um enum central gigantesco
type JobBlockCategory =
  | 'DEPENDENCY'
  | 'APPROVAL'
  | 'QUOTA'
  | 'CAPABILITY'
  | 'SECURITY'
  | 'POLICY'
  | 'EXTERNAL_STATE'
  | 'MANUAL_ACTION'
  | 'TIME_WINDOW'
  | 'RESOURCE'
  | 'OTHER';

type JobBlockRecoveryMode = 'DEPENDENCY_EVENT' | 'EXTERNAL_EVENT' | 'SCHEDULED_RECHECK' | 'MANUAL_ACTION';

type JobBlockDescriptor = {
  category: JobBlockCategory;
  blockCode: MachineReasonCode; // ex.: SKILL23.QUOTA_LIMIT_EXCEEDED,
                      // SKILL03.APPROVAL_REQUIRED,
                      // SKILL24.INTEGRATION_CAPABILITY_UNVERIFIED,
                      // SKILL25.SECURITY_REQUIRED_CONTROL_UNVERIFIED —
                      // nunca free-text humano como autoridade
  recoveryMode: JobBlockRecoveryMode;
  evidenceRefs: KernelArtifactRef[];
};
// Sem hash próprio.
// B24: blockCode NÃO pertence ao enum da Skill02 — é a correção direta
// do achado do Fable. Skill02 conhece category=QUOTA mas não precisa
// mudar código toda vez que a Skill23 cria um blockCode novo namespaced.
// PATCH (Ponto S12): blockCode agora tipa formalmente como
// MachineReasonCode (contracts/ERROR-TAXONOMY.md).

type JobFailureCategory =
  | 'TRANSIENT_INFRASTRUCTURE'
  | 'PROVIDER'
  | 'VALIDATION'
  | 'CONTRACT'
  | 'SECURITY'
  | 'INTERNAL'
  | 'UNKNOWN';

type JobRetryAdvice = 'RETRYABLE' | 'NON_RETRYABLE';

type JobFailureDescriptor = {
  category: JobFailureCategory;
  failureCode: MachineReasonCode;
  retryAdvice: JobRetryAdvice;
  diagnosticRefs: KernelArtifactRef[];
};
// PATCH (Ponto S12, reparo transversal pós-revisão Fable, 2026-09-18):
// failureCode agora tipa formalmente como MachineReasonCode
// (contracts/ERROR-TAXONOMY.md). category/retryAdvice + matriz
// conservadora RETRYABLE (TRANSIENT_INFRASTRUCTURE/PROVIDER = sim;
// VALIDATION/CONTRACT/SECURITY/INTERNAL/UNKNOWN = não) são a única
// autoridade de elegibilidade de retry — RetryPolicy.eligibilityModel
// (ver Skill 01) só controla mecânica (maxAttempts/backoff), nunca
// classificação. Violação da matriz → JOB_EXECUTION_RESULT_CONTRACT_VIOLATION.
// Sem hash próprio.
// B28/B29: handler.retryAdvice=RETRYABLE significa "repetir pode ser
// semanticamente seguro segundo esta Skill" — NÃO significa que Skill02
// obrigatoriamente repetirá (ela ainda avalia RetryPolicy/maxAttempts/
// cancellation/quota/side-effect safety). NON_RETRYABLE significa Skill02
// não faz retry automático desta mesma operação; pode terminar FAILED.

// B30 — o contrato principal, o resultRef que faltava
// PATCH (Ponto C): preparedInvocationId/Hash universais → executionScopeRef.
type JobExecutionResult = {
  jobExecutionResultId: string;
  executionResultKey: string;
  tenantId: string;
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  leaseFence: number;
  handlerInvocationKey: string;
  executionContextHash: string;
  jobExecutionBindingId: string;
  jobExecutionBindingHash: string;
  executionScopeRef: JobExecutionScopeRef;
  handler: SkillJobHandlerRef;
  outcome: JobExecutionOutcome;
  resultRef?: KernelArtifactRef; // <- ESTE é o resultRef que faltava;
                                  // não haverá outro resultRef competidor
                                  // no protocolo da Skill02
  additionalResultRefs: KernelArtifactRef[];
  continuation?: JobContinuationDescriptor;
  block?: JobBlockDescriptor;
  failure?: JobFailureDescriptor;
  executionResultHash: string;
  reportedAt: string;
};
// hash: JOB_EXECUTION_RESULT_V1
```

**Invariantes por outcome** (B32-B36):
- `CONTINUE`: `continuation` obrigatório; `resultRef`/`block`/`failure`
  proibidos. `additionalResultRefs` pode carregar checkpoints/evidence.
- `SUCCEEDED`: `resultRef` obrigatório (aponta pro artifact principal da
  Skill); `continuation`/`block`/`failure` proibidos.
- `BLOCKED`: `block` obrigatório; `resultRef`/`continuation`/`failure`
  proibidos. Evidence pode aparecer em `block.evidenceRefs` ou
  `additionalResultRefs`.
- `FAILED`: `failure` obrigatório; `resultRef`/`continuation`/`block`
  proibidos. Resultado parcial nunca vira `resultRef` — só
  `additionalResultRefs`; `resultRef` é reservado ao resultado primário
  válido de `SUCCEEDED`.

**Validação do resultado primário** (B37/B38): pra `SUCCEEDED`,
`resultRef.ownerSkillId === JobExecutionBinding.targetSkillId` e
`resultRef.artifactType/schemaVersion` precisa ser compatível com
`SkillJobHandlerDescriptor.primaryResultContractKey/version`.
`additionalResultRefs` não precisam pertencer à Skill executora (podem
incluir evidence de quota/integração/segurança das Skills 23/24/25) —
só o `resultRef` primário tem ownership estrito do handler.

**Replay e stale worker** (B39/B40): unicidade lógica
`(tenantId, handlerInvocationKey)` — mesma key + mesmo hash → replay
idempotente; mesma key + conteúdo diferente → `FATAL`. Antes de aceitar
um resultado, Skill 02 valida `jobId`/`attemptId`/`attemptNumber`/
`leaseFence` atual/binding hash/prepared invocation hash/handler
descriptor hash — se `leaseFence` não é mais atual, resultado
**rejeitado**, nunca altera o Job (preserva a fencing guarantee já
aprovada).

```typescript
// B41 — o handler não decide o estado do Job; Skill02 materializa isso
type JobExecutionSettlementDisposition =
  | 'CONTINUE_SAME_ATTEMPT'
  | 'JOB_SUCCEEDED'
  | 'JOB_BLOCKED'
  | 'RETRY_NEW_ATTEMPT'
  | 'JOB_FAILED_TERMINAL';

type JobExecutionConsumerVisibility = 'EMIT' | 'SUPPRESS';

type JobExecutionSettlement = {
  jobExecutionSettlementId: string;
  settlementKey: string; // unicidade (tenantId, settlementKey), deriva
                          // de JobExecutionResult — mesmo result/hash =
                          // mesmo settlement; outro conteúdo = FATAL
  tenantId: string;
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  jobExecutionResultId: string;
  jobExecutionResultHash: string;
  disposition: JobExecutionSettlementDisposition;
  consumerVisibility: JobExecutionConsumerVisibility;
  nextAttemptNumber?: number;
  continuationNotBefore?: string;
  settlementHash: string;
  settledAt: string;
};
// hash: JOB_EXECUTION_SETTLEMENT_V1
```

**Mapeamento outcome → settlement**:
- `CONTINUE` → `CONTINUE_SAME_ATTEMPT` + `SUPPRESS` (mesma Attempt
  continua; Skill 01 não recebe nada ainda — cobre Skill 11: `tick A
  submit→CONTINUE, tick B provider pending→CONTINUE, tick C provider
  completed→SUCCEEDED`, só existe `attemptNumber=1` nos três ticks).
- `SUCCEEDED` → `JOB_SUCCEEDED` + `EMIT` (Job vira `SUCCEEDED` conforme
  `JobStatus` já existente; nada reabre esse Job depois).
- `BLOCKED` → `JOB_BLOCKED` + `EMIT` (a Attempt atual termina; unblock
  **não reabre** a Attempt antiga — cria nova Attempt do mesmo Job
  lógico, mantendo histórico monotônico; se a nova Attempt puder gerar
  gasto, exige nova autorização da Skill 23, como a Skill 11 já
  prometeu).
- `FAILED` + `retryAdvice=RETRYABLE` + attempts disponíveis →
  `RETRY_NEW_ATTEMPT` + `SUPPRESS` (`nextAttemptNumber=N+1`; Skill 01
  não vê falha intermediária).
- `FAILED` + `RETRYABLE` sem attempts restantes, ou
  `NON_RETRYABLE` → `JOB_FAILED_TERMINAL` + `EMIT`.

**Patch interpretativo no Ponto A** (B48/B49): `SkillExecutionResolution.disposition
= BLOCKED` **não** implica `StageExecutionRuntimeState = RESOLVED` — ela
fica `WAITING_EXECUTION` enquanto o Job estiver bloqueado. Quando o
mesmo Job for desbloqueado, a nova Attempt pode terminar `SUCCEEDED` e
gerar nova interpretação; só então `StageExecutionRuntimeState →
RESOLVED` se houver transição válida. Isso não viola "StageExecution
RESOLVED nunca reabre" (é a mesma `StageExecution`, ainda não
resolvida, não uma reabertura).

**`consumerVisibility` — por que existe** (B53/B54): porque no Ponto C
nem todo Job terá a Skill 01 como consumidor (poderá ser
scheduler/webhook/background coordinator) — por isso o campo se chama
`consumerVisibility`, não `orchestratorVisibility`. Só reports `EMIT`
chegam ao consumer: `CONTINUE`→SUPPRESS, retry com nova Attempt
permitida→SUPPRESS, `SUCCEEDED`/`BLOCKED`/falha terminal→EMIT.

**Ligação exata com o Ponto A** (B55-B61): pra um Job Run-scoped com
`consumerVisibility=EMIT`, o `JobExecutionResult` é representado como
`KernelArtifactRef{ownerSkillId:'02', artifactType:'JobExecutionResult',
artifactId: jobExecutionResultId, artifactHash: executionResultHash,
schemaVersion:'V1'}` e vira
`SkillExecutionInterpretationInput.handlerExecutionReportRef`. O
`SkillExecutionAdapter.interpretResult()` recebe exatamente esse
protocolo — nunca o Job/Attempt/lease/provider state cru. Se receber
`CONTINUE` ou um retry intermediário como consumer-visible, isso é
`kernel contract violation` — deveriam ter `consumerVisibility=SUPPRESS`.

**`BLOCKED` vs `FAILED`, `CONTINUE` vs retry** (B70/B71): `BLOCKED` =
"operação não deve continuar agora, mas existe condição conhecida que
pode torná-la válida"; `FAILED` = "a tentativa de execução falhou".
`CONTINUE` = "mesma Attempt ainda está viva"; `RETRY_NEW_ATTEMPT` =
"Attempt anterior falhou; Skill02 decidiu tentar novamente a mesma
operação lógica" — não são sinônimos. **Isso prepara o Ponto D**:
correção semântica que muda prompt/input não pode ser
`RETRY_NEW_ATTEMPT`, porque o `PreparedSkillInvocation` vai mudar — vai
exigir um **novo Job lógico**.

**Bloqueios das Skills 03/23/24/25 — sem duplicação de tipos** (B68/B69):
os tipos dessas Skills continuam proprietários. Ex.: `QuotaAuthorizationDecision
DENIED` é traduzido pelo handler pra
`JobExecutionResult{outcome:'BLOCKED', block:{category:'QUOTA',
blockCode:'SKILL23.QUOTA_LIMIT_EXCEEDED', ...}}`. Se a `Skill24`
capability está stale e a policy exige refresh antes de trabalhar,
isso é `BLOCKED/CAPABILITY/SKILL24.INTEGRATION_CAPABILITY_STALE` —
nunca `FAILED/PROVIDER` (a condição é recuperável por mudança de estado
externo, não uma falha de tentativa).

**Patch pras Skills executáveis** (B65-B67): Skills 04-07 — onde hoje
esperavam algo como `resultRef` solto, passa oficialmente a significar
`JobExecutionResult.resultRef`; não mantêm `resultRef` paralelo/local.
Skills 08-21 — cada SPEC executável ganha a frase: *"Quando executada
através da Skill 02, esta Skill recebe seu input pela
`PreparedSkillInvocation` vinculada ao `JobExecutionBinding` e reporta
cada tick exclusivamente por `JobExecutionResult`. Resultado de domínio
bem-sucedido é materializado antes do report e referenciado em
`JobExecutionResult.resultRef`. A Skill nunca altera diretamente
`JobStatus`, `Attempt` ou lease."* Esse patch não cria tipos novos nos
arquivos das Skills. Artifacts de side-effect próprios (ex.:
`ProviderSubmission`, `PublicationIntent`, `DeliveryAttempt`) continuam
existindo — podem aparecer em `continuation.checkpointRef` ou
`additionalResultRefs`; o protocolo Skill 02 não os substitui.

**Atomicidade e outbox** (B63/B64): `validate leaseFence → persist
JobExecutionSettlement → transition Job/Attempt → materialize outbox
when EMIT → commit`, nunca `Job SUCCEEDED` sem settlement
correspondente. Reusa `OutboxConsumerDelivery` já aprovado — não cria
segunda infraestrutura de eventos; o payload do outbox contém refs pra
`JobExecutionSettlement`/`JobExecutionResult`/`PreparedSkillInvocation`,
consumido idempotentemente.

**Fluxo Run-scoped completo (A+B):**

```text
ProductionRun → StageExecution → SkillExecutionAdapter.prepareInvocation
  → PreparedSkillInvocation → LogicalJobIntent → Skill02 Job
  → JobExecutionBinding → Attempt / leases / handler ticks
  → JobExecutionResult → JobExecutionSettlement → OutboxConsumerDelivery
  → SkillExecutionAdapter.interpretResult → SkillExecutionResolution
  → Stage transition
```

### 10 `FATAL_ERROR` novos do Ponto B

```text
JOB_EXECUTION_BINDING_REPLAY_CONFLICT
JOB_HANDLER_DESCRIPTOR_CONTRACT_MISMATCH
JOB_HANDLER_VERSION_UNAVAILABLE
JOB_HANDLER_EXECUTION_CONTEXT_MISMATCH
JOB_EXECUTION_STALE_LEASE_FENCE
JOB_EXECUTION_RESULT_REPLAY_CONFLICT
JOB_EXECUTION_RESULT_CONTRACT_VIOLATION
JOB_EXECUTION_RESULT_ARTIFACT_MISMATCH
JOB_EXECUTION_SETTLEMENT_REPLAY_CONFLICT
JOB_EXECUTION_INVALID_STATE_TRANSITION
```

**PATCH (Ponto S12, reparo transversal pós-revisão Fable, 2026-09-18)**:
`JOB_EXECUTION_RESULT_CONTRACT_VIOLATION` passa a cobrir também os
casos do S12 (`contracts/ERROR-TAXONOMY.md`) — `failure.retryAdvice =
RETRYABLE` numa `category` que a matriz conservadora não permite
(`VALIDATION`/`CONTRACT`/`SECURITY`/`INTERNAL`/`UNKNOWN`),
`failureCode`/`blockCode`/`continuationCode` fora do formato
`MachineReasonCode`, ou `outcome`/descriptor incompatíveis (ex.:
`BLOCKED` com `failure` preenchido). **0 `FATAL_ERROR` novos** — o
código existente já cobre.

`JOB_EXECUTION_STALE_LEASE_FENCE` é fatal **para aquele report ser
aceito**, não necessariamente pro Job inteiro — stale worker report →
reject report → preserva estado atual do Job → audit; não destrói a
operação válida que outro worker possui. Codes namespaced inválidos
(ex.: `blockCode="sem quota"`, `failureCode="deu ruim"`) →
`JOB_EXECUTION_RESULT_CONTRACT_VIOLATION` — os códigos são
machine-readable, nunca free-text.

### 5 hashes canônicos novos do Ponto B

`SKILL_JOB_HANDLER_DESCRIPTOR_V1`, `JOB_EXECUTION_BINDING_V1`,
`JOB_HANDLER_EXECUTION_CONTEXT_V1`, `JOB_EXECUTION_RESULT_V1`,
`JOB_EXECUTION_SETTLEMENT_V1`. Sem hash próprio (entram nos artifacts
pais): `SkillJobHandlerRef`, `JobExecutionOutcome`,
`JobContinuationDescriptor`, `JobBlockDescriptor`/`JobBlockCategory`,
`JobFailureDescriptor`/`JobFailureCategory`/`JobRetryAdvice`,
`JobExecutionSettlementDisposition`/`JobExecutionConsumerVisibility`.

### Critérios globais que passam a valer (18, congelados)

1. Nenhuma Skill altera `JobStatus` diretamente.
2. Nenhuma Skill cria `Attempt` diretamente.
3. Todo handler da Skill 02 fala `JobExecutionResult`.
4. Todo sucesso possui `resultRef` canônico.
5. `resultRef` aponta para artifact já persistido.
6. `BLOCKED` usa `category` estável + `blockCode` namespaced.
7. Não existe enum global de todos os `BlockReason`.
8. `FAILED` usa `failureCode` namespaced.
9. Handler informa `retryAdvice`; Skill 02 decide retry.
10. `CONTINUE` nunca cria nova Attempt.
11. Retry após falha cria nova Attempt.
12. Unblock cria nova Attempt do mesmo Job.
13. Correção semântica que muda input **não** é retry do mesmo Job.
14. Retry intermediário não chega ao consumer.
15. Poll intermediário não chega ao consumer.
16. Skill 01 nunca interpreta `JobExecutionResult` diretamente — passa
    pelo `SkillExecutionAdapter`.
17. Job `SUCCEEDED` nunca reabre.
18. `StageExecution` `BLOCKED` pode permanecer `WAITING`, mas
    `StageExecution` `RESOLVED` nunca reabre.

### Critério específico de fechamento do achado B4

Considerado resolvido quando o grep confirmar: Skills 04-07 sem nenhum
`resultRef` esperado fora do `JobExecutionResult`; Skills 08-21
executadas via Skill 02 referenciando explicitamente
`JobExecutionResult`; Skill 02 possuindo `resultRef` canônico; Skills
que bloqueiam não dependendo de um enum `BlockReason` global
incompleto; Skills que fazem polling usando `CONTINUE`, não nova
Attempt por poll.

### Ponto C — `RUN_SCOPED` × `STANDALONE`

**Resolve B1.** Skills 16/18/19/20/21 (webhooks, schedulers, background
work) não tinham como pedir trabalho à Skill 02 sem um `ProductionRun`
ativo — o modelo assumia "todo Job pertence a um Run" e só aceitava
`START` humano. Esse patch elimina o B1 **sem enfraquecer** a regra de
`ProductionRun`.

**Patch necessário no Ponto B**: `PreparedSkillInvocation` é
naturalmente `RUN_SCOPED` (referencia Run/Stage) — um job `STANDALONE`
não pode fingir que a possui. O protocolo da Skill 02 passa a aceitar
duas origens de invocação sem criar `ProductionRun` sintético (ver
patches já aplicados acima em `SkillJobHandlerDescriptor`,
`JobExecutionBinding`, `JobHandlerExecutionContext`,
`JobExecutionResult`).

```typescript
type JobExecutionScope = 'RUN_SCOPED' | 'STANDALONE';
// Sem terceiro modo na V1. Sem hash próprio.
```

- **`RUN_SCOPED`**: pertence a `ProductionRun` + `StageExecution`;
  input veio de `PreparedSkillInvocation`; terminal result volta pra
  Skill 01.
- **`STANDALONE`**: **não** pertence a `ProductionRun`; **não** cria
  `StageExecution`; **não** ocupa o slot "1 ProductionRun ativo/tenant";
  input vem de `StandaloneWorkRequest`; terminal result pode voltar ao
  requester ou não exigir consumer.

Isso mata diretamente a falsa equivalência **todo Job ≠ todo
ProductionRun**.

```typescript
type JobExecutionScopeRef =
  | {
      executionScope: 'RUN_SCOPED';
      productionRunId: string;
      productionRunHash: string;
      stageExecutionId: string;
      stageExecutionHash: string;
    }
  | {
      executionScope: 'STANDALONE';
      standaloneWorkRequestId: string;
      standaloneWorkRequestHash: string;
    };
// Sem hash próprio.
```

**Patch ao `Job` existente**: adiciona `executionScope:
JobExecutionScope` e `executionScopeRef: JobExecutionScopeRef`, com
invariante `Job.executionScope === Job.executionScopeRef.executionScope`.
Se o `Job` antigo tinha campos tipo `productionRunId`/`stageExecutionId`/
`runId`/`stageId` obrigatórios pra **todo** Job, eles deixam de ser
autoridade universal — a autoridade passa a ser `Job.executionScopeRef`
(não precisa apagar imediatamente campos legados referenciados em
outras seções, mas marcar como `legacy / RUN_SCOPED-only /
non-authoritative`).

**Proibido resolver standalone fabricando `ProductionRun`/`Stage`
falsos** — isso só esconderia o B1. O caminho correto é
`webhook/scheduler/system → StandaloneWorkRequest → Skill02 Job
STANDALONE`.

```typescript
type WorkOriginKind = 'USER_COMMAND' | 'SYSTEM_EVENT' | 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL_SERVICE';

type WorkOriginRef = {
  kind: WorkOriginKind;
  ownerSkillId: string;
  sourceId: string;
  sourceHash: string;
};
// Sem hash próprio. Reusado tanto em StandaloneWorkRequest (aqui) quanto
// em ProductionRunStartRequest (Skill 01) — nasceu como
// "StandaloneWorkOriginRef" mas é renomeado antes de consolidar porque
// hoje serve os dois caminhos; não manter os dois nomes.
```

**O origin é evidence, não authority de tenant** — proibido
`webhook body.tenantId → autoridade`. Todo `StandaloneWorkRequest`
exige contexto de tenant já resolvido pela Skill 22.

```typescript
type StandaloneWorkRequest = {
  standaloneWorkRequestId: string;
  tenantId: string;
  workRequestKey: string;
  trustedTenantContextHash: string;
  origin: WorkOriginRef;
  targetSkillId: string;
  inputPayloadRef: KernelArtifactRef;
  completionPolicy: StandaloneCompletionPolicy;
  securityGateDecisionRef?: {
    securityGateDecisionId: string;
    securityGateDecisionHash: string;
  };
  standaloneWorkRequestHash: string;
  requestedAt: string;
};
// hash: STANDALONE_WORK_REQUEST_V1

type StandaloneCompletionPolicy =
  | { mode: 'DELIVER_TO_CONSUMER'; consumer: StandaloneWorkConsumerRef }
  | { mode: 'NO_DELIVERY' };

type StandaloneWorkConsumerRef = {
  consumerSkillId: string;
  consumerKey: string;
  correlationRef?: { correlationId: string; correlationHash: string };
};
// Sem hash próprio.
```

Exemplo `NO_DELIVERY`: scheduler da Skill 18 coleta métricas e o
resultado é `NO_DELIVERY` porque os artifacts já foram persistidos —
não significa sem histórico: `Job`/`Attempt`/`JobExecutionResult`/
`JobExecutionSettlement` continuam existindo; só não se cria entrega de
conclusão pra outro consumer.

**Input standalone já precisa ser materializado** —
`StandaloneWorkRequest.inputPayloadRef` aponta pra um artifact válido
**antes** do Job nascer (Skill 02 não monta input de domínio — mesma
regra do B3: Skill 02 transporta referência, a Skill-alvo conhece o
contrato). Quem produz esse input é a Skill dona do
workflow/requester, conforme o public input contract da Skill-alvo
(ex.: scheduler da Skill 18 materializa `MetricCollectionRequest` →
`StandaloneWorkRequest{targetSkillId: '18'}`; Skill 20 materializa
`PerformanceAnalysisInput` válido da Skill 19 →
`StandaloneWorkRequest{targetSkillId: '19'}`). Na materialização,
`inputPayloadRef.artifactType/schemaVersion` precisa bater com
`SkillJobHandlerDescriptor.acceptedInputContractKey/version` — senão,
`FATAL` de contract mismatch.

```typescript
// Patch ao SkillJobHandlerDescriptor (ver contrato já patchado acima)
type SkillJobExecutionScopeSupport = 'RUN_SCOPED_ONLY' | 'STANDALONE_ONLY' | 'RUN_SCOPED_AND_STANDALONE';
// Handler deve rejeitar scope não suportado (ex.: handler RUN_SCOPED_ONLY
// + StandaloneWorkRequest → JOB_HANDLER_EXECUTION_SCOPE_UNSUPPORTED,
// nunca "tenta mesmo assim").

type JobInvocationSourceRef =
  | { kind: 'PREPARED_SKILL_INVOCATION'; preparedInvocationId: string; preparedInvocationHash: string }
  | { kind: 'STANDALONE_WORK_REQUEST'; standaloneWorkRequestId: string; standaloneWorkRequestHash: string };
// Sem hash próprio.

type JobExecutionConsumerRef =
  | { kind: 'RUN_STAGE'; productionRunId: string; productionRunHash: string; stageExecutionId: string; stageExecutionHash: string }
  | { kind: 'STANDALONE_CONSUMER'; consumerSkillId: string; consumerKey: string; correlationRef?: { correlationId: string; correlationHash: string } }
  | { kind: 'NONE' };
// Sem hash próprio.
```

**Mapping obrigatório**: pra `RUN_SCOPED`, o consumer obrigatoriamente
é `RUN_STAGE`. Pra `STANDALONE`, consumer pode ser
`STANDALONE_CONSUMER` ou `NONE`. Nunca `STANDALONE → RUN_STAGE` nem
`RUN_SCOPED → NONE` na V1.

**Ligação Run-scoped** (invariante): `Job.executionScope=RUN_SCOPED`
exige `JobExecutionScopeRef.RUN_SCOPED` +
`JobInvocationSourceRef.PREPARED_SKILL_INVOCATION` +
`JobExecutionConsumerRef.RUN_STAGE`, todos os IDs/hashes apontando pro
mesmo `ProductionRun`/`StageExecution`/`PreparedSkillInvocation`.
`PreparedSkillInvocation` continua exatamente artifact run-scoped — o
Ponto A não muda pra esse caminho.

**Ligação standalone** (invariante): `Job.executionScope=STANDALONE`
exige `JobExecutionScopeRef.STANDALONE` +
`JobInvocationSourceRef.STANDALONE_WORK_REQUEST` + consumer
`STANDALONE_CONSUMER` ou `NONE`.

```typescript
type StandaloneWorkMaterialization = {
  standaloneWorkMaterializationId: string;
  tenantId: string;
  standaloneWorkRequestId: string;
  standaloneWorkRequestHash: string;
  logicalJobKey: string;
  jobId: string;
  jobExecutionBindingId: string;
  jobExecutionBindingHash: string;
  materializationHash: string;
  materializedAt: string;
};
// hash: STANDALONE_WORK_MATERIALIZATION_V1
```

**Exatamente um Job lógico por request**: `(tenantId,
standaloneWorkRequestId)` → exatamente um logical Job; retry de
materialização → mesmo Job, mesmo `JobExecutionBinding`.
`logicalJobKey` deriva canonicamente de
`STANDALONE:<tenantId>:<standaloneWorkRequestId>` (ou equivalente) —
nunca gera UUID diferente a cada retry.

**Idempotência do `StandaloneWorkRequest`**: unicidade
`(tenantId, workRequestKey)` — mesma key + mesmo hash → mesmo request;
mesma key + conteúdo divergente → `FATAL`. **Idempotência por
origem**: webhook → identidade do provider/evento; schedule →
identidade + slot exato (**nunca `Date.now()` como identidade** —
permitiria duplicação arbitrária; correto é algo como
`SKILL18:DAILY_METRICS:2026-09-18`); system event → identidade do
evento; user command → identidade do comando. Webhook duplicado
(ex.: Meta/Z-API reenviando o mesmo evento 3x) → mesmo
`workRequestKey` → mesmo `StandaloneWorkRequest` → mesmo Job, nunca
três respostas externas.

**Segurança pra origem `WEBHOOK`**: se `origin.kind = WEBHOOK`, então
`securityGateDecisionRef` é **obrigatório** e a decisão da Skill 25
precisa ser `ALLOW` pra aquele ingress/evento — sem isso, nenhum
`StandaloneWorkRequest` válido. `SCHEDULE`/`INTERNAL_SERVICE` não são
webhooks públicos e não exigem esse campo, mas ainda exigem
`trustedTenantContextHash` e seus próprios controles apropriados.
Skill 22 continua autoridade de tenant:
`TrustedTenantContext.tenantId === StandaloneWorkRequest.tenantId`,
mismatch é `FATAL` — o caller nunca escolhe tenant pelo payload de
domínio.

**A regra "1 ProductionRun ativo/tenant" permanece intacta e passa a
significar exatamente isso** — nunca "1 Job ativo/tenant" nem "1
atividade em background". Válido simultaneamente: `ProductionRun R1`
ativo + Job standalone de métricas (Skill 18) + Job standalone de
relatório agendado (Skill 21) + Job standalone de processamento
inbound (Skill 16), todos sujeitos às políticas normais de
fila/concorrência/quota. V1 não impõe "1 standalone Job por tenant" —
se uma Skill específica precisar serialização, isso é uma policy/
concurrency key daquela operação, não regra global de tenant.

**Standalone não escapa de nenhuma autoridade existente**: não escapa
da Skill 23 (se o handler cruza uma operação controlada, autorização
normal); não escapa da Skill 24 (provider call → binding/capability/
credential igual a Job run-scoped); não escapa da Skill 25 (ingress/
security/data policies continuam valendo — webhook sempre passa pelo
gate primeiro); não escapa de approval (`Standalone Job` pode retornar
`BLOCKED/APPROVAL` — não há "background bypass").

**Terminal report standalone**: quando `consumerVisibility=EMIT` e
`JobExecutionConsumerRef=STANDALONE_CONSUMER`, Skill 02 cria
`OutboxConsumerDelivery` pra esse consumer, com payload contendo refs
exatas pra `StandaloneWorkRequest`/`JobExecutionResult`/
`JobExecutionSettlement` — o consumer decide sua própria lógica; Skill
02 nunca interpreta domínio. Se `consumer.kind=NONE`, um terminal
settlement (`SUCCEEDED`/`BLOCKED`/`FAILED`) permanece
persistido/auditável, mas nunca é emitido pra consumer externo.
**Regra**: `BLOCKED + recoveryMode=MANUAL_ACTION` exige `consumer ≠
NONE` — senão ninguém receberia a necessidade de intervenção
(`contract violation` caso contrário). Um consumer standalone pode
solicitar outro standalone job (ex.: Skill 18 termina coleta → aciona
Skill 19 → Skill 19 materializa input → nova
`StandaloneWorkRequest`) — são dois Jobs distintos com lineage
explícita, nunca uma mega-Attempt atravessando Skills.

**Isso também proíbe scheduler chamando funções diretamente.**
Proibido como arquitetura oficial: `cron route → await
collectMetrics() → await analyzePerformance() → await report()` pra
workflow durável relevante. Correto: `cron → request durable work →
Skill02`. Webhook não precisa ficar com a conexão HTTP aberta
esperando o Job terminar — fluxo correto:
`authenticate → validate/dedupe → persist canonical event/request →
materialize standalone work → acknowledge ingress` (Skill 02 trabalha
assincronamente depois — reduz timeout/retry duplicado de webhook).
Cada slot de schedule recorrente cria um request novo (`09:00 slot A →
request A → Job A`; `10:00 slot B → request B → Job B`) — nunca "um Job
eterno do scheduler", preservando histórico e idempotência. Não
confundir com `CONTINUE`/`PROVIDER_POLL` do Ponto B — polling interno
de provider continua sendo o mesmo Job, mesma Attempt, novo handler
tick.

**Lineage mínima standalone, completa e auditável**: `WorkOriginRef →
StandaloneWorkRequest → StandaloneWorkMaterialization → Job → Attempt
→ JobExecutionResult`.

### O segundo pedaço do B1 — `ProductionRun` não pode depender só de `START` humano

Skill 20 tem duas coisas diferentes: planejamento/análise do
experimento (`STANDALONE` quando apropriado) e executar de fato uma
variante através do pipeline de produção real (precisa de
`ProductionRun`). Isso exige que `ProductionRun` possa nascer sem
fingir usuário humano.

`ProductionRunStartRequest` (hash `PRODUCTION_RUN_START_REQUEST_V1`) é
**definido na Skill 01** (não redefinido aqui) — `origin: WorkOriginRef`
reusa exatamente o tipo definido nesta seção da Skill 02. Ver a seção
"Ponto C (parte 2)" no `SPEC.md` da Skill 01 pro contrato completo.

O `RunControlCommand START` existente se torna **um** produtor de
`ProductionRunStartRequest` (`RunControlCommand START → validate/authorize
→ ProductionRunStartRequest → ProductionRun`) — não o produtor
exclusivo. Skill 20 pode produzir `origin.kind=INTERNAL_SERVICE,
ownerSkillId='20'` e solicitar o Run necessário à variante; um
scheduler futuro poderia produzir `SCHEDULE`; `WEBHOOK` iniciando um
Run é permitido arquiteturalmente (com gate `ALLOW` da Skill 25 +
`TrustedTenantContext` da Skill 22) mas não necessário pro MVP atual —
o kernel simplesmente não fica preso a humano. **Nenhuma origem tem
bypass** da regra "máx 1 `ProductionRun` ativo/tenant" — se outro Run
já está ativo, a request pode aguardar a policy/orquestração já
existente (não rejeitada só por não ser humana, mas também não cria
concorrência proibida; detalhamento de fila de espera fica fora deste
blocker). Idempotência: `(tenantId, startRequestKey)`, mesma key +
mesmo hash → mesmo request/mesmo `ProductionRun`; conteúdo diferente →
`FATAL`. O request já carrega `pipelineSnapshotId`/`pipelineSnapshotHash`
exatos, então replay nunca muda de pipeline por causa de um deploy no
meio. `ProductionRun.creationRef` (Ponto A), pra novos Runs, passa a
apontar pra `{sourceKind: 'PRODUCTION_RUN_START_REQUEST', sourceId:
productionRunStartRequestId, sourceHash: startRequestHash}` — sem
mudança no hash/tipo de `ProductionRun`.

**Dois entry points oficiais da Skill 02, nenhum terceiro caminho ad
hoc**: `LogicalJobIntent → RUN_SCOPED` (via `ProductionRun →
StageExecution → PreparedSkillInvocation`, sem regressão) e
`StandaloneWorkRequest → STANDALONE` — `StandaloneWorkRequest` nunca
passa pela Skill 01 fabricando um Stage falso. `LogicalJobIntent`
permanece **RUN_SCOPED-only** (o patch B9 continua válido); não
generalizar pra standalone agora — mantém as responsabilidades claras.

```text
                  trabalho de domínio
                          │
           ┌──────────────┴──────────────┐
           │                             │
     PRODUCTION PIPELINE             BACKGROUND
           │                             │
ProductionRunStartRequest        StandaloneWorkRequest
           │                             │
       Skill01                         Skill02
           │                             │
     ProductionRun                     Job STANDALONE
           │                             │
    StageExecution                       │
           │                             │
PreparedSkillInvocation                  │
           │                             │
   LogicalJobIntent                      │
           └──────────────┬──────────────┘
                           ↓
                        Skill02
                           ↓
                  JobExecutionBinding
                           ↓
                        Attempt
                           ↓
                       Handler
```

O limite "1 `ProductionRun` ativo por tenant" continua protegendo a
máquina de produção, sem bloquear coleta de métricas, webhooks,
análise, relatórios ou outros workers.

### Patches mínimos nas Skills afetadas por B1

- **Skill 16**: inbound/background execution PODE usar
  `StandaloneWorkRequest`; NÃO PODE exigir `ProductionRun` só pra obter
  execução da Skill 02. Webhook público precisa do gate `ALLOW` da
  Skill 25 primeiro.
- **Skill 18**: scheduled collection / refresh request / background
  pagination kickoff → `StandaloneWorkRequest`. Provider polling
  interno continua `CONTINUE`, não novo Job standalone.
- **Skill 19**: background/reanalysis request → `StandaloneWorkRequest`
  — não precisa `ProductionRun` pra análise isolada.
- **Skill 20**: distinção explícita — planning/evaluation work →
  `STANDALONE` quando apropriado; variant production execution →
  `ProductionRunStartRequest → Skill01`.
- **Skill 21**: scheduled report materialization/delivery kickoff →
  `StandaloneWorkRequest`; cada schedule slot cria request distinto,
  nunca Job eterno.

### 10 `FATAL_ERROR` novos do Ponto C

```text
JOB_EXECUTION_SCOPE_MISMATCH
JOB_RUN_SCOPED_REFERENCE_MISMATCH
JOB_STANDALONE_REFERENCE_MISMATCH
JOB_INVOCATION_SOURCE_SCOPE_MISMATCH
JOB_EXECUTION_CONSUMER_SCOPE_MISMATCH
JOB_HANDLER_EXECUTION_SCOPE_UNSUPPORTED
STANDALONE_WORK_REQUEST_REPLAY_CONFLICT
STANDALONE_WORK_TENANT_MISMATCH
STANDALONE_WORK_MATERIALIZATION_REPLAY_CONFLICT
PRODUCTION_RUN_START_REQUEST_REPLAY_CONFLICT
```

Não duplicar `SECURITY_WEBHOOK_AUTHENTICATION_REQUIRED` da Skill 25 —
se a Skill 02 recebe request standalone `WEBHOOK` sem `ALLOW`, usa a
evidence/erro da Skill 25 ou contract violation apropriada, nunca
reinventa taxonomia de segurança aqui.

### 3 hashes canônicos novos do Ponto C

`STANDALONE_WORK_REQUEST_V1`, `STANDALONE_WORK_MATERIALIZATION_V1`,
`PRODUCTION_RUN_START_REQUEST_V1` (este último definido/vive na
Skill 01). **Conteúdo alterado por patch de compatibilidade** (nomes
não mudam, sem V2 — ainda pré-runtime): `SKILL_JOB_HANDLER_DESCRIPTOR_V1`,
`JOB_EXECUTION_BINDING_V1`, `JOB_HANDLER_EXECUTION_CONTEXT_V1`,
`JOB_EXECUTION_RESULT_V1`. Sem hash próprio:
`JobExecutionScope`/`JobExecutionScopeRef`, `WorkOriginKind`/`WorkOriginRef`,
`StandaloneCompletionPolicy`/`StandaloneWorkConsumerRef`,
`JobInvocationSourceRef`/`JobExecutionConsumerRef`,
`SkillJobExecutionScopeSupport`.

### Critérios de fechamento do B1 (12, congelados)

1. `Job` possui `executionScope` canônico.
2. Job standalone não exige `ProductionRun`.
3. Job standalone não exige `StageExecution`.
4. Skill 02 aceita `StandaloneWorkRequest` diretamente.
5. Run ativo não bloqueia criação de standalone work.
6. Schedule possui idempotência por slot.
7. Webhook possui idempotência por evento.
8. Webhook standalone exige gate `ALLOW` da Skill 25.
9. Skills 16/18/19/21 conseguem executar background work sem Skill 01.
10. Skill 20 consegue (a) background planning standalone e (b)
    solicitar `ProductionRun` internamente pra executar variante.
11. Run `START` não é exclusivo de usuário humano.
12. A regra "1 `ProductionRun` ativo/tenant" permanece intacta.

### Ponto E — Skill 23 como única autoridade de quota

**Resolve o componente de quota do B6** (ver contrato completo e
matriz de decisão no `SPEC.md` da Skill 23, "Ponto E"). Regra central:
depois deste patch, **não existe mais um segundo sistema de
autorização de quota dentro desta Skill**. `QuotaGuard` deixa de ser
uma autoridade/contrato próprio — vira só o nome informal do
checkpoint que chama `Skill23QuotaAuthorityPort`.

**Skill 02 deixa de ser autoridade de quota.** Superseded qualquer
lógica `Skill02 → calcula saldo → ALLOW/DENY/PAUSE`. Skill 02 não
calcula saldo/budget/crédito/limite/dinheiro — tudo pertence à Skill
23. **Skill 02 não faz quota preflight antes do handler** — pra Skills
11/12/14/15 o dado essencial (payload exato, `requestPayloadHash`,
provider/model/operation exatos) só existe depois que o handler
prepara a operação:

```text
Skill02 dispatch → handler → prepare exact operation → Skill23 authorization
```

Nunca `Skill02 quota-check genérico → handler descobre depois qual
operação seria feita`.

```typescript
type SkillJobQuotaIntegration =
  | { mode: 'NONE' }
  | { mode: 'SKILL23_OPERATION_SCOPED'; allowedAuthorizationClasses: QuotaAuthorizationClass[] };
// Sem hash próprio. mode=NONE significa "este handler não possui uma
// operação controlada pela Skill23 segundo o contrato V1" — NUNCA
// significa "provider é grátis" ou "não há custo externo", é só
// declaração arquitetural. allowedAuthorizationClasses nunca contém
// PLANNING_ADMISSION num handler de execução (isso pertence à Skill
// 20 antes da execução). Um handler não pode inventar classe fora da
// declarada — se tenta, contract violation.

// PATCH em SkillJobHandlerDescriptor (Ponto B/C, ver acima) — hash
// continua SKILL_JOB_HANDLER_DESCRIPTOR_V1:
// + quotaIntegration: SkillJobQuotaIntegration;
```

```typescript
type ExecutionQuotaBinding = {
  executionQuotaBindingId: string;
  tenantId: string;
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  jobExecutionBindingId: string;
  jobExecutionBindingHash: string;
  quotaAuthorizationClass: QuotaAuthorizationClass;
  quotaOperationIdentityHash: string;
  quotaSubjectHash: string;
  requestPayloadHash: string;
  quotaAuthorizationId: string;
  quotaAuthorizationHash: string;
  quotaExecutionClaimId: string;
  quotaExecutionClaimHash: string;
  claimingHandlerInvocationKey: string;
  executionQuotaBindingHash: string;
  boundAt: string;
};
// hash: EXECUTION_QUOTA_BINDING_V1
```

**O que `ExecutionQuotaBinding` significa**: pra este Job/Attempt
exato, esta operação de quota exata foi autorizada pela Skill 23 e
recebeu `ExecutionClaim` válido antes do side effect. Ele **não decide
quota** — só registra a costura entre `Job/Attempt` e a autorização/
claim da Skill 23.

**Fluxo obrigatório de criação**: `QuotaAuthorization AUTHORIZED →
executor materializa execution record → QuotaExecutionClaimRequest →
Skill23 QuotaExecutionClaim → ExecutionQuotaBinding → SUBMITTING →
NETWORK`. **Proibido criar o binding só depois do side effect**
(`network → provider respondeu → agora registra quota` é errado) — o
binding precisa existir antes de `SUBMITTING`/`NETWORK`. Binding só
nasce pra autorização efetiva — nunca existe pra `DENIED`/`EXPIRED`.
Um Attempt pode ter mais de um binding se executar operações
controladas distintas de verdade (cada uma com `QuotaOperationIdentity`
diferente). Idempotência: `UNIQUE(tenantId, jobId, attemptNumber,
quotaOperationIdentityHash)` — mesmo conteúdo → replay idempotente;
divergente → `FATAL`.

**Validações cruzadas**: `ExecutionQuotaBinding.quotaAuthorizationClass`
precisa existir em
`SkillJobHandlerDescriptor.quotaIntegration.allowedAuthorizationClasses`
(senão `JOB_QUOTA_AUTHORIZATION_CLASS_MISMATCH`). Skill 02 valida
genericamente `jobId`/`attemptNumber` do binding contra a lineage de
`QuotaOperationIdentity`/`QuotaAuthorization`/`QuotaExecutionClaim` —
sem precisar interpretar provider/model. Handler com
`quotaIntegration.mode=NONE` que materializa um `ExecutionQuotaBinding`
→ contract violation. Handler quota-scoped que tenta cruzar
`SUBMITTING` sem `QuotaExecutionClaim` + `ExecutionQuotaBinding` →
`FATAL` contract violation (sem bypass). **Skill 02 é dona semântica
do artifact** (liga Job/Attempt ↔ Skill 23 authorization/claim), mas
quem possui os dados suficientes pra criar é o executor/handler — nem
Skill 01 nem Skill 02 o criam diretamente.

**Se `AUTHORIZED`**: `QuotaAuthorizationResolutionRef.decision=AUTHORIZED`
→ o handler continua `execution record → claim request →
Skill23.claimExecution() → ExecutionQuotaBinding → SUBMITTING →
network`. **Se `DENIED`**: o handler **não** faz network — retorna
`{outcome: 'BLOCKED', block: {category: 'QUOTA', blockCode:
'SKILL23.<EXACT_REASON_CODE>', recoveryMode: ..., evidenceRefs:
[exactQuotaAuthorizationEvidenceRef]}}`. `DENIED` nunca vira `FAILED`
— se a Skill 23 negou corretamente por policy/quota, isso não é falha
do handler, é `BLOCKED`. **Se `EXPIRED`** (antes do claim): sem
network, mapeia pra `BLOCKED/QUOTA/SKILL23.QUOTA_AUTHORIZATION_EXPIRED`.
Auth expirada não pode ser substituída dentro da mesma Attempt — o Job
precisa prosseguir por nova Attempt, e então nova quota identity/auth.

**Isso é o que elimina `PAUSE`**: o comportamento que o `QuotaGuard`
antigo chamava de `PAUSE` agora é `Skill23 → DENIED/EXPIRED → Skill
handler → JobExecutionResult.BLOCKED → Skill02 → Job BLOCKED →
Skill01 → StageExecution WAITING_EXECUTION`. Cada camada faz seu
trabalho. Recovery mode não pertence à Skill 23 — ela decide
`AUTHORIZED`/`DENIED`/`EXPIRED` e fornece reasons/evidence; a Skill
executora mapeia a condição conhecida pra
`DEPENDENCY_EVENT`/`EXTERNAL_EVENT`/`SCHEDULED_RECHECK`/`MANUAL_ACTION`
(Skill 02 continua sem interpretar `blockCode`). Exemplos: hard limit
diário → `DENIED/QUOTA_LIMIT_EXCEEDED` → handler
`BLOCKED/QUOTA/SKILL23.QUOTA_LIMIT_EXCEEDED/SCHEDULED_RECHECK`; policy
ausente → `BLOCKED/QUOTA/SKILL23.QUOTA_POLICY_NOT_CONFIGURED/MANUAL_ACTION`;
unknown cost sob hard limit →
`BLOCKED/QUOTA/SKILL23.QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY/MANUAL_ACTION`
(nunca `PAUSE`).

**Lineage do binding no protocolo (Ponto B)**: quando uma operação
controlada cruza side effect, o ref do `ExecutionQuotaBinding` deve
aparecer em `JobExecutionResult.additionalResultRefs` — ao menos no
primeiro report após o claim e no terminal report relacionado à
operação (nunca cria outro binding pro mesmo terminal). Ex.: Skill 11
com `submit aceito, provider ainda processando` retorna
`CONTINUE/PROVIDER_POLL` incluindo o ref do binding em
`additionalResultRefs`.

**Legacy `QuotaGuard` types** — grep obrigatório por `QuotaGuard`/
`QuotaDecision`/`QuotaGuardDecision`/`quotaOperationKey`/`quotaGuardKey`/
`PAUSE` nesta Skill (e na Skill 01). **Não apagar cegamente** —
classificar cada ocorrência: o que representa quota authority/decision/
`PAUSE`-específico-de-quota/identidade de operação paralela fica
`LEGACY/SUPERSEDED` e aponta pra
`Skill23.QuotaOperationIdentity`/`QuotaAuthorizationRequest`/
`QuotaAuthorizationResolutionRef`. **O que NÃO marcar superseded**:
`RunControlCommand.PAUSE`/`RunStatus` relacionado a pause (pausa de Run
por comando humano), provider operation key de idempotência,
`logicalJobKey`, `handlerInvocationKey`, `requestPayloadHash` — são
conceitos diferentes. Ver `type BlockReason` acima (já marcado
`PATCH (Ponto B)` como não-mais-autoridade) e a seção "Comportamento
do `QuotaGuard`" abaixo, que precisa ser lida à luz deste patch —
`QUOTA_PAUSED` como `BlockReason` fica **legado/superseded**: o
resultado real de uma negação de quota passa a ser
`JobBlockDescriptor{category: 'QUOTA', blockCode:
'SKILL23.<reason>', ...}` (Ponto B), nunca mais um `PAUSE` específico
de quota.

### 8 `FATAL_ERROR` novos do Ponto E

```text
JOB_QUOTA_INTEGRATION_MODE_VIOLATION
JOB_QUOTA_OPERATION_IDENTITY_MISMATCH
JOB_QUOTA_AUTHORIZATION_ATTEMPT_MISMATCH
JOB_QUOTA_AUTHORIZATION_CLASS_MISMATCH
JOB_QUOTA_EXECUTION_CLAIM_MISMATCH
JOB_EXECUTION_QUOTA_BINDING_REPLAY_CONFLICT
JOB_QUOTA_SIDE_EFFECT_WITHOUT_EXECUTION_BINDING
JOB_QUOTA_CONTROL_BYPASS_ATTEMPT
```

### 1 hash canônico novo do Ponto E

`EXECUTION_QUOTA_BINDING_V1`. Patchado sem V2:
`SKILL_JOB_HANDLER_DESCRIPTOR_V1` (+`quotaIntegration`). Sem hash
próprio: `SkillJobQuotaIntegration`.

### Ponto S7 — runtime de execução (`EXECUTION_RUNTIME_V1`, reparo transversal pós-revisão Fable, 2026-09-18)

Contrato compartilhado completo em `contracts/EXECUTION-RUNTIME.md`.
Skill 02 é a **dona do worker execution protocol** já descrito nos
Pontos B/C/E acima (elegibilidade, claim, `leaseFence`, `nextPollAt`,
ciclo de vida do `Attempt`, invocação de handler tick, settlement,
retry scheduling, unblock) — S7 não cria protocolo novo aqui, só
declara normativamente **onde** esse protocolo executa.

**Regra normativa**: todo `SkillJobHandler` (qualquer Skill, qualquer
duração, `RUN_SCOPED` ou `STANDALONE`) executa exclusivamente em
`VIDEO_MACHINE_WORKER_V1` (`DURABLE_WORKER`, `EXECUTION_RUNTIME_V1`).
A Vercel (`CONTROL_PLANE`) nunca executa `SkillJobHandler.handle()` —
nem para Jobs que levariam 100ms. Isso vale mesmo para o reconciliador
de Cron (`sweepStaleJobs()`/`advanceRun()`, Skill01): Cron só admite
schedule/materializa work request, nunca reclama nem executa um
handler diretamente.

Campos/tipos já existentes que **são** o mecanismo de runtime (sem
alteração nesta seção): `leaseFence` (identidade de ownership durante
um tick), `nextPollAt` (equivalente exato ao `nextEligibleAt` do
desenho do S7 — reutilizado sem novo campo), `JobExecutionResult`/
`JobExecutionSettlementDisposition`/`REJECTED_STALE_FENCE` (validação
de fence stale antes de aceitar resultado). O processo worker é apenas
o runtime que aplica esse protocolo já formalizado nos Pontos B/C/E —
não introduz um segundo caminho de execução.

**0 `FATAL_ERROR` novos, 0 hashes novos, 0 artifacts novos** — S7 é
puramente declarativo sobre runtime; `REJECTED_STALE_FENCE` e
equivalentes já cobrem o vocabulário necessário. Ver critério de
fechamento (29 itens) em `contracts/EXECUTION-RUNTIME.md`.
