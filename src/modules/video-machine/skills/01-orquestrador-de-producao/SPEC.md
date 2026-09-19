# Skill 01 — Orquestrador de Produção

> Especificação/contrato. **Sem implementação ainda** — nenhuma migration, tabela,
> RPC, worker ou cron foi criado. Este arquivo só vira código depois da revisão
> do Claude Fable 5 Max e do GPT-6 Astra (ver `continuidade.md` da Máquina de
> Vídeos, seção 20 — protocolo de debate).
>
> Consolidado em 2026-09-17 após duas rodadas de debate ChatGPT ↔ Claude Code.
> Marcado como **1/25** após esta revisão.
>
> **🔧 Em reparo transversal (2026-09-18)**: após as 25/25 Skills serem
> aprovadas, o Claude Fable 5 Max fez uma revisão independente do conjunto
> completo e encontrou 6 falhas estruturais **nas costuras entre Skills**
> (não dentro de nenhuma Skill isolada) — 3 delas (B1, B2, B3) atingem
> diretamente o núcleo desta Skill. ChatGPT e Claude Code abriram uma
> rodada de reparo transversal (pontos A-G) pra corrigir isso antes da
> implementação. Ver `## Reparo transversal pós-revisão Fable` abaixo —
> **Ponto A (kernel de execução genérico) já aplicado.**

## Objetivo

Decidir o **próximo passo lógico** de uma `ProductionRun`, consultando guards de
política síncronos, sem executar lógica de negócio de nenhuma Skill
especializada e sem gerenciar o ciclo operacional de `Job` (isso é
responsabilidade da Skill 02 — Gestor de Fila/Jobs).

## Responsabilidades

- Criar `ProductionRun` (status `CREATED`) ao receber o comando `INICIAR
  PRODUÇÃO`.
- Consumir uma `PipelineDefinition` declarativa para saber a sequência e as
  dependências dos stages — o Orquestrador não conhece Shopee, Veo, Instagram
  etc., só a forma abstrata do pipeline.
- Em `advanceRun(runId)` (chamado por evento — caminho primário — ou pelo
  reconciliador do cron — fallback), calcular a próxima `OrchestrationDecision`
  e, dentro de uma única transação, persistir: nova versão/estado da Run +
  `AuditEvent` + `LogicalJobIntent` (outbox durável). Nunca "emite" um pedido
  de trabalho apenas em memória.
- Consultar `QuotaGuard.evaluate(...)` antes de emitir um `LogicalJobIntent`
  com custo potencial.
- Consultar `IntegrationRegistry.capabilities(...)` quando a decisão depender
  de quais providers estão disponíveis.
- Processar `RunControlCommand` (`START`/`PAUSE`/`RESUME`/`CANCEL`/`STATUS`),
  cada um identificado por `commandId` próprio (idempotência de comando não é
  a mesma coisa que idempotência de estado via `version`).
- Manter versionamento otimista da Run (campo `version`) para resolver
  corretamente dois `advanceRun()` concorrentes.
- Registrar `RunPolicyDecision` para toda decisão de guard (quota ou
  capacidade de integração).

## Não é responsabilidade

- Gerenciar o ciclo operacional de `Job` (`QUEUED → RUNNING → ...` — Skill 02).
- Chamar qualquer provider externo diretamente (Shopee, Veo, Instagram etc.).
- Decidir critério de aprovação de vídeo.
- Gerar conteúdo (roteiro, prompt, frame etc.).
- Publicar em qualquer rede.
- Calcular custo ou comissão — só reage à decisão do `QuotaGuard`.

## Quando é chamada

- Comando `INICIAR PRODUÇÃO` (cria a Run).
- `advanceRun(runId)` chamado pela Skill 02 quando um `JobResultEvent`
  terminal é consumido — **caminho primário**, orientado a evento.
- Reconciliador (Vercel Cron) chamando `advanceRun()` para Runs sem progresso
  recente — **fallback**, não gatilho primário. Frequência não fixada agora;
  vira configuração de infraestrutura.
- `RunControlCommand` do usuário/admin.

## Quem pode chamar

- Skill 02 (Gestor de Fila/Jobs), via consumo do `JobResultEvent` dela.
- Cron interno de reconciliação (`/api/internal/video-machine/reconcile`,
  protegido por `CRON_SECRET`, mesmo padrão já usado no projeto).
- Endpoint de comando (futuramente autenticado pelo admin).

## Quais Skills ela pode chamar

Nenhuma Skill de execução diretamente (Descoberta, Veo, Auditor, Publicador
etc.). Pode consultar serviços de política/guard síncronos **sem efeito
externo** (`QuotaGuard`, `IntegrationRegistry`). Comunica com a Skill 02
apenas emitindo `LogicalJobIntent` pelo outbox — nunca invoca função da
Skill 02 in-process.

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
type StageKey = string;
// PATCH (Ponto M1, reparo transversal pós-revisão Fable, 2026-09-18,
// CONTRACT_CONVENTIONS_V1, contrato completo em
// contracts/CONTRACT-CONVENTIONS.md): antes chamado PipelineStage —
// renomeado pra stageKey ser o único nome de identidade de stage no
// corpus inteiro (nunca "stage" e "stageKey" como dois campos/aliases
// pro mesmo conceito). Contrato compartilhado do módulo video-machine
// — não pertence à Skill 01 nem à Skill 02. No futuro mora em
// src/modules/video-machine/contracts/pipeline.ts.

type PipelineDefinition = {
  stages: StageDefinition[];
};

type StageDefinition = {
  stageKey: StageKey; // PATCH (Ponto M1) — antes "stage"
  dependsOn: StageKey[];
  subjectScope: "RUN" | "PRODUCT" | "VIDEO" | "PUBLICATION"; // etc.
  completionPolicy: "ALL" | "ANY" | "ALLOW_PARTIAL";
  failurePolicy: "FAIL_RUN" | "BLOCK" | "CONTINUE_PARTIAL";
  requiresApproval?: boolean;
  retryPolicy: RetryPolicy; // consumida pela Skill 02 ao criar o Job
};

// Resolução de subject (refinamento compatível, adicionado durante o
// debate da Skill 07 — não reabre a aprovação 1/25): quando um stage com
// subjectScope=PRODUCT/VIDEO/PUBLICATION exige um único subject e o
// stage upstream produziu uma coleção ordenada autoritativa, a Skill 01
// resolve o subject seguindo a ordem já definida pelo upstream — ela não
// cria um novo ranking de negócio.
//
//   sourceResultId = SEMPRE o resultado EXPLICITAMENTE vinculado à
//     execução upstream concluída deste Run — NUNCA "o resultado mais
//     recente aplicável" (isso quebraria a reprodutibilidade: um novo
//     resultado aparecendo depois não pode mudar o subject de um Run que
//     já resolveu o seu, mesmo em replay).
//   default subject = primeiro candidato ainda elegível na ordem
//     autoritativa do sourceResultId (ex.: para PRODUCT hoje,
//     OfferAnalysisResult.primaryCandidates em finalPosition ASC, depois
//     alternates em finalPosition ASC — finalPosition=1 por padrão).
//
// Esse mecanismo genérico é o mesmo para PRODUCT/VIDEO/PUBLICATION — a
// Skill 01 conhece só o binding, não a semântica comercial de cada tipo.
// A política concreta de resolução (qual Result é a fonte, o que conta
// como "candidato elegível") é específica de cada subjectScope e definida
// quando aquele scope é usado pela primeira vez — hoje só PRODUCT tem
// política concreta (via OfferAnalysisResult); VIDEO/PUBLICATION ficam
// sem política definida até serem necessários.

type StageSubjectBinding = {
  stageSubjectBindingId: string; // identidade canônica própria — outras
    // Skills (ex.: Skill 07) referenciam o binding por este ID, não por
    // runId+stageKey soltos

  runId: string;
  stageKey: string;

  stageWorkUnitIdentityHash: string; // Ponto S5 — STAGE_WORK_UNIT_IDENTITY_V1;
    // BASE também tem hash, unicidade sempre usa a mesma coluna
  stageExpansionManifestRef?: StageExpansionManifestRef; // Ponto S5 —
    // ausente quando mode=SINGLE/BASE; obrigatório quando mode=EXPANDABLE

  subjectType: "PRODUCT" | "VIDEO" | "PUBLICATION";
  subjectId: string;

  sourceResultId: string; // ex.: OfferAnalysisResult.resultId — vínculo
    // explícito e durável, nunca resolvido de novo "pelo mais recente"
  sourcePosition?: number; // ex.: finalPosition no Result de origem

  resolutionPolicyVersion: string;

  createdAt: string;
};
// UNIQUE lógico (Ponto S5): (runId, stageKey, stageWorkUnitIdentityHash)
// -> um StageSubjectBinding canônico — antes (runId, stageKey) sozinho,
// o que quebrava quando o mesmo subject precisa de bindings distintos
// por work unit (ex.: mesmo FinalizedVideo publicado em Instagram e
// TikTok). tenantId continua implícito via runId (ProductionRun),
// mesmo padrão já usado neste tipo.
// Materializado uma vez; replay do mesmo Run/stage reutiliza o
// StageSubjectBinding existente, não resolve de novo (mesmo princípio de
// idempotência de persistência das Skills 04/05/06).
//
// Fallback para o próximo subject da sequência (rank 2, 3...): a seleção
// inicial usa sempre o primeiro subject da ordem upstream. A Skill 01 só
// avança para o próximo quando uma política futura EXPLÍCITA de fallback
// determinar isso e houver evidência durável de que o subject anterior
// foi esgotado/bloqueado/tornou-se inapto segundo essa política — ainda
// não especificada. Retry técnico isolado NUNCA troca de subject: a
// falha de uma tentativa (ex.: timeout de IA) não autoriza pular para o
// próximo rank — isso confundiria falha técnica com decisão de negócio.
// IMPORTANTE: quando o fallback for especificado, ele NUNCA muta um
// StageSubjectBinding V1 existente (imutável, UNIQUE por runId+stageKey)
// — precisa introduzir uma nova instância de stage/resolution sequence
// versionada. Até lá, V1 permanece imutável por definição.

type RetryPolicy = {
  maxAttempts: number;
  backoff: "FIXED" | "EXPONENTIAL";
  // PATCH (Ponto S12, reparo transversal pós-revisão Fable, 2026-09-18):
  // retryableErrorClasses: string[] REMOVIDO — não tinha domínio
  // compartilhado (achado S12 do Fable). RetryPolicy volta a controlar
  // só mecânica (quantas Attempts, quando, backoff) — a elegibilidade de
  // retry já vem do protocolo do Ponto B (JobFailureCategory/
  // JobRetryAdvice/matriz conservadora), formalizado em
  // src/modules/video-machine/contracts/ERROR-TAXONOMY.md.
  eligibilityModel: "HANDLER_ADVICE_AND_EXECUTION_SAFETY";
};

type RunControlCommand = {
  commandId: string; // chave de idempotência do comando
  runId?: string; // PATCH (Ponto M7, reparo transversal pós-revisão
    // Fable, 2026-09-18, VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1 —
    // Trusted Run Identity Allocation): antes obrigatório em TODOS os
    // tipos, inclusive START — permitindo que o caller pré-gerasse um
    // runId arbitrário. Regra nova: obrigatório para
    // PAUSE/RESUME/CANCEL/STATUS (precisam apontar pra uma Run já
    // existente); PROIBIDO para START — nenhum caller escolhe
    // identidade de Run, Skill01 aloca o runId internamente ao
    // aceitar o comando (ver "Ponto C (parte 2)" abaixo). Se um
    // payload de START vier com runId, é campo desconhecido — segue a
    // política normal de unknown fields do boundary.
  type: "START" | "PAUSE" | "RESUME" | "CANCEL" | "STATUS";
  requestedAt: string;
  reason?: string;
  actorContext?: unknown;
};

type OrchestrationDecision =
  | { type: "REQUEST_JOB"; intent: LogicalJobIntent }
  | { type: "WAIT" }
  | { type: "PAUSE"; reason: string }
  | { type: "COMPLETE" }
  | { type: "FAIL"; reason: string };

type LogicalJobIntent = {
  intentId: string; // identidade própria da mensagem/outbox
  logicalJobKey: string; // `${runId}:${stageKey}:${subjectType}:${subjectId}:${stageWorkUnitIdentityHash}`
    // — identifica o trabalho lógico. PATCH (Ponto S5, 2026-09-18):
    // variantKey (string livre, sem gramática) substituído por
    // stageWorkUnitIdentityHash (STAGE_WORK_UNIT_IDENTITY_V1) — pré-runtime,
    // substituição direta, sem campo legado a preservar.
  payloadHash: string; // mesma logicalJobKey + payloadHash diferente = PAYLOAD_CONFLICT, nunca reuso silencioso
  tenantId: string;
  runId: string;
  stageKey: StageKey; // PATCH (Ponto M1) — antes "stage: PipelineStage"
  subjectType: string;
  subjectId: string;
  stageWorkUnitIdentityHash: string; // Ponto S5 — substitui variantKey
  payload: unknown;
  createdAt: string;
  // PATCH (Ponto S13, reparo transversal pós-revisão Fable, 2026-09-18):
  // LEGACY / NON-AUTHORITATIVE. Projection de compatibilidade do design
  // single-consumer histórico. NUNCA lido para decidir se este intent
  // deve ser entregue, reentregue ou considerado consumido — o estado
  // canônico de entrega vive exclusivamente em OutboxConsumerDelivery
  // (mesmo mecanismo do RunCancellationIntent abaixo, generalizado —
  // achado exato S13 da revisão Fable). Implementação nova NUNCA
  // escreve este campo; existe só pra leitura/migração de dados
  // antigos se necessário. Não participa de identidade/hash canônico.
  consumedAt?: string;
};

// Canonical outbox delivery (Ponto S13): LogicalJobIntent é a mensagem
// imutável do lado produtor. Estado de entrega é owned exclusivamente
// pela Skill 02 via OutboxConsumerDelivery — inclusive pra este intent,
// que hoje é single-consumer (Skill 02). Single-consumer NÃO é exceção
// à regra: nunca "1 consumer → consumedAt, N consumers →
// OutboxConsumerDelivery" (isso criaria dois caminhos de runtime).
//
// RunCancellationIntent tem FAN-OUT: mais de um consumidor independente
// (Skill 02/Jobs, Skill 03/Approvals, futuros). Um único `consumedAt` não
// serve mais — cada consumidor confirma entrega separadamente via
// OutboxConsumerDelivery (UNIQUE(eventId, consumerKey)), nunca sobrescrevem
// a confirmação um do outro. Não é um mecanismo "extra" pra fan-out — é
// o único mecanismo canônico, que LogicalJobIntent também usa.
type RunCancellationIntent = {
  cancelIntentId: string;
  tenantId: string;
  runId: string;
  requestedAt: string;
  reason?: string;
  createdAt: string;
  // sem consumedAt único — ver OutboxConsumerDelivery
};

type OutboxConsumerDelivery = {
  eventId: string; // ex.: cancelIntentId de um RunCancellationIntent
  consumerKey: string; // "JOB_MANAGER" (Skill 02), "APPROVAL_MANAGER" (Skill 03), etc.
  deliveryState: "PENDING" | "DELIVERED" | "DEAD_LETTER";
  deliveryAttempts: number;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  deliveredAt?: string;
  // UNIQUE(eventId, consumerKey) — a confirmação de um consumidor nunca
  // interfere na de outro.
};

// RunPolicyDecision é um contrato COMPARTILHADO de auditoria — não é
// propriedade exclusiva da Skill 01. Quem consulta o guard persiste a
// decisão: a Skill 01 na checagem inicial (orquestração), a Skill 02 antes
// de cada novo Attempt pago (reavaliação por retry — ver SPEC.md da Skill 02).
// jobId/attemptNumber ficam ausentes quando é a Skill 01 quem decide (não
// há Job ainda); presentes quando é a Skill 02 (decisão ligada exatamente
// ao Job/Attempt que ela autorizou ou bloqueou).
type RunPolicyDecision = {
  decisionId: string;
  tenantId: string;
  runId: string;
  jobId?: string;
  attemptNumber?: number;
  decidedAt: string;
  kind: "QUOTA" | "CAPABILITY";
  decision: "ALLOW" | "PAUSE" | "DENY" | "BLOCK";
  reason?: string;
  source: "QuotaGuard" | "IntegrationRegistry";
};
```

**PATCH (Reparo transversal pós-revisão Fable, Ponto E — resolve B6)**:
`kind="QUOTA"` neste tipo é **LEGACY/SUPERSEDED**. Depois deste patch,
Skill 01 não possui decisão de quota própria — quota é
exclusivamente `Skill23QuotaAuthorityPort` (ver `SPEC.md` da Skill 23,
"Ponto E"), e `PAUSE` sai completamente do vocabulário de quota (uma
negação de quota agora chega à Skill 01 como `JobExecutionResult.BLOCKED`
com `block.category='QUOTA'`, via o protocolo dos Pontos A/B, nunca
como `RunPolicyDecision.decision='PAUSE'`). `kind="CAPABILITY"`
(`source="IntegrationRegistry"`) **não é afetado** por este patch —
continua válido como está (domínio da Skill 24). Não confundir com
`RunControlCommand.PAUSE`/pausa de Run por comando humano, que também
não é afetado.

## Estados

```ts
type RunStatus =
  | "CREATED"
  | "RUNNING"
  | "PAUSED" // pause_reason separado, ex. QUOTA_LIMIT — não é status novo por motivo
  | "WAITING_APPROVAL"
  | "BLOCKED"
  | "CANCEL_REQUESTED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";
```

`JobStatus` inteiro fica sob responsabilidade da Skill 02 — o Orquestrador não
o manipula.

Transição `PARAR`: nunca vai direto a `CANCELLED`. Ao processar `CANCEL`, a
Skill 1 persiste atomicamente `ProductionRun → CANCEL_REQUESTED` + `AuditEvent`
+ `RunCancellationIntent` (outbox de cancelamento — mesmo princípio do
`LogicalJobIntent`, já que a Skill 1 nunca chama a Skill 2 diretamente). A
Skill 2 consome esse intent, cancela `Job` `QUEUED` e coloca `Job`
`RUNNING`/`WAITING_EXTERNAL` no próprio fluxo `CANCEL_REQUESTED` deles,
tratando cancelamento/reconciliação com o handler especializado do provider.
A Skill 1 só marca a Run como `CANCELLED` depois de evidência durável de que
não resta trabalho ativo.

**Guarda de materialização tardia** (invariante compartilhada com a Skill 02
e a Skill 03): um `LogicalJobIntent`/`ApprovalRequestIntent` pode ter sido
emitido antes da Run entrar em `CANCEL_REQUESTED`/`CANCELLED`/`SUCCEEDED`/
`FAILED`, mas só ser consumido depois. Por isso a checagem "a Run aceita
trabalho novo?" acontece no **momento da materialização** (dentro da
transação de `ensureJob()`/`ensureApprovalRequest()`), não apenas quando a
Skill 1 emitiu o intent. Se a Run já não aceita trabalho novo, o consumidor
**não materializa** `Job`/`ApprovalRequest`, marca o intent
consumido/suprimido, registra `AuditEvent` da supressão e faz ACK
idempotente — nunca erro, nunca retry infinito. Isso permite que a
condição "nenhum `Job`/`ApprovalRequest` não-terminal" seja suficiente para
`CANCELLED`, sem esperar a entrega física de todo intent antigo.

`PAUSAR`: soft pause no MVP — deixa o Job atual terminar e impede o próximo
`LogicalJobIntent`.

## Idempotência

`logicalJobKey = runId:stage:subjectType:subjectId:stageWorkUnitIdentityHash`
(Ponto S5 — antes `variantKey`, string livre sem gramática).
`advanceRun()` é idempotente: duas chamadas sobre o mesmo `version` da Run não
duplicam `LogicalJobIntent`. Conflito de `version` desatualizada → relê e
recalcula, não é erro fatal.

## Atomicidade

Requisito arquitetural obrigatório (implementação exata — RPC/transaction/lock
no Postgres via Supabase — fica para a fase de código). Não é verdade que toda
transição gera `LogicalJobIntent` — só quando a decisão for `REQUEST_JOB`:

> Toda transição lógica da Run deve persistir atomicamente:
> - alteração da `ProductionRun`/`version`;
> - `AuditEvent` correspondente;
> - `LogicalJobIntent`, quando a decisão for `REQUEST_JOB`;
> - `RunCancellationIntent`, quando a operação iniciar cancelamento.
>
> Não pode existir um estado em que a Run avançou mas o intent correspondente
> não foi persistido, nem o inverso.

## Erros esperados

- Conflito de versão otimista da Run → relê e recalcula, não fatal.
- Erro transitório de banco → retry com backoff simples **da política de
  infraestrutura, não infinito**. Após esgotar essa política, nenhuma
  progressão lógica é considerada concluída — o caso fica recuperável pelo
  reconciliador/alerta operacional. A transação atômica garante que não
  exista meia-progressão.
- `RunControlCommand` duplicado (mesmo `commandId`) → idempotente, não produz
  efeito duplicado. PATCH (Ponto M7): `START` nunca recebe `runId` do
  caller — Skill01 aloca um `runId` globalmente único, opaque,
  internamente, atomicamente junto com a materialização da
  `ProductionRun` aceita. `commandId` (idempotência tenant-scoped, não
  a mesma coisa que idempotência de estado via `version`) garante que
  o mesmo `START` não crie duas Runs: mesmo `commandId` + mesmo
  payload semântico → retorna o `runId` já materializado; mesmo
  `commandId` + payload diferente → conflito (`FATAL_ERROR`), nunca
  substitui a Run existente silenciosamente. Nenhum `runId` gerado é
  derivado de `commandId` (identidades com papéis diferentes,
  relacionadas por persistência explícita, nunca por hash/derivação).

## Segurança

- Rota de reconciliação protegida por `CRON_SECRET` (mesmo padrão já usado no
  projeto).
- `tenant_id` nunca aceito de payload externo não autenticado. Hoje (1
  tenant) vem de configuração interna; no SaaS virá do contexto autenticado.
- Nenhum secret de provider passa pelo Orquestrador.

## Multi-tenant futuro

`ProductionRun.tenant_id` presente desde o início. Constraint de banco garante
no máximo **1 `ProductionRun` com status ativo** (`CREATED`, `RUNNING`,
`PAUSED`, `WAITING_APPROVAL`, `BLOCKED`, `CANCEL_REQUESTED`) por tenant — regra
protegida no banco, não só em `if`. Paralelismo futuro é permitido dentro da
própria Run via múltiplos `Job`.

## Observabilidade

Log estruturado por `OrchestrationDecision` (`runId`, `fromStatus`,
`toStatus`, `decisionType`, `timestamp`). `AuditEvent` é persistido para toda
transição lógica. `RunPolicyDecision` é persistido para toda avaliação
efetivamente realizada por `QuotaGuard` ou `IntegrationRegistry` — nem todo
`advanceRun()` consulta um guard.

## Interface Skill 1 ↔ Skill 2 (congelada)

```
Skill 1 (Orquestrador)
  ProductionRun
    → OrchestrationDecision
    → transação atômica:
        update ProductionRun (status, version)
        insert AuditEvent
        insert LogicalJobIntent        (outbox, quando REQUEST_JOB)
        insert RunCancellationIntent   (outbox, quando CANCEL)

Skill 2 (Gestor de Fila/Jobs)
  consome LogicalJobIntent
    → ensureJob(logicalJobKey, payloadHash, intent)   [idempotente]
    → Job / Attempt / lease
    → ao terminal: insert JobResultEvent   (outbox)
  consome RunCancellationIntent  (consumerKey = "JOB_MANAGER")
    → cancela Jobs QUEUED
    → coloca Jobs RUNNING/WAITING_EXTERNAL em CANCEL_REQUESTED próprio
    → handler especializado tenta cancelar/reconciliar no provider

Skill 2 possui dois fluxos duráveis de eventos para a Skill 1:
  JobResultEvent  → Skill 1.advanceRun(runId)              (terminal)
  JobBlockedEvent → Skill 1 marca a Run PAUSED/BLOCKED      (não terminal)

Skill 3 (Gestor de Aprovação — em especificação) também consome
RunCancellationIntent (consumerKey = "APPROVAL_MANAGER"), de forma
independente do consumo da Skill 2 — ver OutboxConsumerDelivery acima e o
SPEC.md da Skill 03 quando existir.

Skill 1
  → decide o próximo passo
  → só marca a Run CANCELLED após evidência durável de que não resta
    trabalho ativo (nenhum Job não-terminal E nenhuma ApprovalRequest
    não-terminal)
```

Nenhum dos dois lados depende de chamada síncrona frágil para preservar
progresso — os dois lados usam outbox durável.

A entrega de `JobResultEvent` é **at-least-once**; redelivery é esperado e
absorvido pela idempotência/versionamento de `advanceRun()`. A entrega de
`RunCancellationIntent` também é **at-least-once** e agora tem **fan-out**
— cada consumidor (Skill 2, Skill 3, futuros) confirma entrega
independentemente via `OutboxConsumerDelivery`; redelivery por consumidor é
esperado e deve ser absorvido pela idempotência de cada um, sem repetir
efeitos externos de cancelamento.

`JobBlockedEvent` (contrato completo no `SPEC.md` da Skill 02) também é
entregue **at-least-once** e carrega `jobVersion`. O evento sozinho **não é
fonte suficiente de verdade** para bloquear a Run — ao consumir, a Skill 01
revalida contra a evidência durável atual do `Job`:

```
recebe JobBlockedEvent(jobVersion=N)
→ revalida Job atual

se currentJob.version > N
  → evento stale, ACK sem alterar a Run

se currentJob.version == N e Job continua BLOCKED pelo mesmo motivo
  → pode aplicar a consequência na Run
```

Consequência na Run: `QUOTA_PAUSED → PAUSED` (mesma semântica de soft
pause da Skill 01 — não interrompe efeitos externos já em andamento);
`POLICY_BLOCKED`/`EXTERNAL_STATE_UNKNOWN → BLOCKED`.

**Precedência do estado atual da Run**: um `JobBlockedEvent` atrasado nunca
reverte uma Run que já esteja em `CANCEL_REQUESTED`, `CANCELLED`,
`SUCCEEDED` ou `FAILED` — esses estados têm precedência sobre qualquer
consequência de bloqueio chegando fora de ordem.

## Plano de testes

### Unitários

- Cálculo de `OrchestrationDecision` dado `PipelineDefinition` + estado atual.
- Idempotência do `logicalJobKey` (mesmo input não gera 2 intents).
- `PARAR` emite `CANCEL_REQUESTED`, nunca `CANCELLED` direto.
- `QuotaGuard` com decisão `DENY` não emite `LogicalJobIntent`.
- Versionamento otimista rejeita transição com `version` desatualizada.

### Integração

- Duas chamadas concorrentes de `advanceRun()` na mesma Run → só uma avança
  (conflito de versão tratado corretamente).
- Cron pode invocar `advanceRun()` sem evento entregue, mas só há progressão
  se existir evidência durável de que as dependências necessárias foram
  concluídas; caso contrário retorna `WAIT` e não cria trabalho duplicado —
  o cron **não** significa "Run está parada, então avance".
- `PARAR` com Job in-flight simulado não marca `CANCELLED` até confirmar
  drain via Skill 02 (via `RunCancellationIntent` consumido e resolvido).

### Casos críticos (obrigatórios, risco real de prejuízo)

- Dois ticks simultâneos sobre a mesma Run.
- Evento de conclusão e cron de reconciliação chegando "ao mesmo tempo".
- `LogicalJobIntent` com mesma `logicalJobKey` + mesmo `payloadHash` →
  idempotente (não duplica). Mesma `logicalJobKey` + `payloadHash` diferente
  → `PAYLOAD_CONFLICT`, nunca reuso silencioso.
- `advanceRun()` com `version` desatualizada.
- `PARAR` com operação externa (Skill 02) em andamento.
- `PAUSAR` durante Job em execução.
- Run aparentemente "sem Job" mas com lease/operação externa ainda válida na
  Skill 02 (o Orquestrador não deve pedir recriação nesse caso).
- Queda do processo entre a transição de estado, a criação do
  `LogicalJobIntent` e o `AuditEvent` (a atomicidade da transação cobre isso).
- Quota excedida exatamente antes de um `Job` com custo potencial.
- Retomada de uma Run depois de horas sem execução do cron de reconciliação.

### Teste real

Adiado — sem schema/migration em produção nesta fase. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Os 6 contratos (`PipelineDefinition`, `RunControlCommand`,
  `OrchestrationDecision`, `LogicalJobIntent`, `RunCancellationIntent`,
  `RunPolicyDecision`) completos e sem ambiguidade.
- `RunStatus` documentado separadamente de `JobStatus` (que pertence à
  Skill 02).
- Regra de 1-Run-ativa-por-tenant expressa como constraint de banco no
  design, não só validação em código de aplicação.
- Idempotência via `logicalJobKey` + `payloadHash` especificada.
- Atomicidade (transição + outbox + audit) documentada como requisito
  arquitetural.

## Dependências

Skill 02 — Gestor de Fila/Jobs é pré-requisito direto: o Orquestrador delega
todo o ciclo operacional de `Job` para ela. A interface entre as duas foi
fechada e congelada nesta mesma rodada de debate (ver seção acima).

## Questões abertas

Nenhuma no momento — todas as questões levantadas nas duas rodadas de debate
(ChatGPT ↔ Claude Code, 2026-09-17) foram resolvidas e incorporadas acima.

## Reparo transversal pós-revisão Fable (2026-09-18)

> Contexto: com as 25/25 Skills aprovadas, o Claude Fable 5 Max revisou o
> conjunto completo (30 mil linhas) e encontrou 6 falhas bloqueantes nas
> **costuras entre Skills** — não bugs de uma Skill isolada, mas do
> protocolo compartilhado entre elas. B3 (Skill 01 se declara "agnóstica
> de domínio" mas precisa montar/interpretar o payload de cada Skill
> 04-21 sem nenhum hook pra isso, e `ProductionRun` — a entidade central
> de tudo — nunca tinha sido definida em lugar nenhum) atinge o núcleo
> desta Skill diretamente. ChatGPT e Claude Code abriram uma rodada de
> reparo transversal em 7 pontos (A-G); os pontos que tocam a Skill 01
> são aplicados aqui.

### Ponto A — `ProductionRun` + kernel de execução + `SkillExecutionAdapter`

**Resolve B3.** Regra central: Skill 01 conhece `Run`, `Stage`, refs/
hashes opacos e `transitionKey` opaca — **nunca** conhece
`OfferAnalysisResult`, `CreativeDirectionResult`, `VideoAuditResult`,
`ReportSnapshot` ou qualquer payload/resultado de domínio das Skills
04-21. A tradução entre domínio e kernel passa a pertencer ao
`SkillExecutionAdapter` de cada Skill-alvo — Skill 01 nunca importa um
tipo de domínio.

```typescript
// A2 — referência opaca a artifact já materializado
type KernelArtifactRef = {
  ownerSkillId: string;
  artifactType: string; // só pra validação do adapter, nunca pra branching
  artifactId: string;
  artifactHash: string;
  schemaVersion: string;
};
// Sem hash canônico próprio — entra nos hashes dos tipos pais.
// Nunca contém payload; Skill01 nunca interpreta artifactType.

// A3 — referência opaca à origem de criação do Run
type KernelCreationRef = {
  sourceKind: string; // hoje aponta pro RunControlCommand existente
  sourceId: string;
  sourceHash: string;
};

// A4 — a entidade central, finalmente definida
type ProductionRun = {
  productionRunId: string;
  tenantId: string;
  runKey: string;
  pipelineSnapshotId: string;
  pipelineSnapshotHash: string;
  creationRef: KernelCreationRef;
  initialArtifactRefs: KernelArtifactRef[]; // ordenação canônica no hash
  productionRunHash: string;
  createdAt: string;
};
// hash: PRODUCTION_RUN_V1
// NUNCA entra no hash: status, current stage, progress, updatedAt,
// terminal reason, cancelRequested, version — tudo isso é mutável e
// vive em ProductionRunRuntimeState.

// A7 — runtime state separado (reusa o RunStatus já existente na Skill01,
// não declara outro enum)
type ProductionRunRuntimeState = {
  productionRunId: string;
  tenantId: string;
  status: RunStatus; // já existente nesta SPEC — não redefinido
  version: number;
  activeStageIterationId?: string; // PATCH (Ponto D)
  activeStageIterationHash?: string; // PATCH (Ponto D)
  activeStageExecutionIds: string[]; // V1: length <= 1, ver A49 — se
                                      // existe StageExecution ativa, ela
                                      // pertence obrigatoriamente ao
                                      // activeStageIterationId/hash atual
  terminalReasonCode?: string;
  startedAt?: string;
  terminalAt?: string;
  updatedAt: string;
};
// Mutável. Sem hash integral.
// Compatibilidade: onde SPECs anteriores diziam "ProductionRun.status"
// ou "ProductionRun.version", o significado oficial agora é
// ProductionRunRuntimeState.status / .version. ProductionRun.tenantId
// continua existindo no tipo imutável.

// A9 — idempotência de criação
// UNIQUE lógico: (tenantId, runKey)
// Mesmo runKey + mesmo ProductionRun hash → replay idempotente.
// Mesmo runKey + conteúdo diferente → RUN_CREATION_REPLAY_CONFLICT
// (entra na taxonomia FATAL formal no Ponto B/G, não agora).

// A10 — pipeline precisa ser congelado por Run (nunca "Run começou com
// pipeline V1, deploy mudou config, etapa 5 usa V2")
type ProductionPipelineSnapshot = {
  pipelineSnapshotId: string;
  pipelineKey: string;
  pipelineVersion: string;
  entryStageKey: string;
  stages: StageKernelContractRef[];
  pipelineSnapshotHash: string;
  materializedAt: string;
};
// hash: PRODUCTION_PIPELINE_SNAPSHOT_V1 — inclui a ordem canônica
// completa de stages. Depois que o Run nasce, pipelineSnapshotHash é
// imutável pra aquele Run.

type StageKernelContractRef = {
  stageKey: string;
  stageDefinitionHash: string; // referencia o StageDefinition já existente
  stageKernelContractId: string;
  stageKernelContractHash: string;
};
// Sem hash próprio.

// A13 — contrato complementar ao StageDefinition existente (não o substitui)
type StageKernelContract = {
  stageKernelContractId: string;
  stageKey: string;
  targetSkillId: string;
  executionAdapter: SkillExecutionAdapterRef;
  successTransitions: StageSuccessTransition[];
  stageKernelContractHash: string;
};
// hash: STAGE_KERNEL_CONTRACT_V1
// Invariante A15: StageDefinition.stageKey === StageKernelContract.stageKey,
// e quando StageDefinition já tiver owner/skill, StageDefinition target
// Skill === StageKernelContract.targetSkillId. Divergência é erro de
// configuração de pipeline — Skill01 nunca "escolhe qual dos dois acreditar".

type SkillExecutionAdapterRef = {
  adapterKey: string;
  adapterVersion: string;
  adapterDescriptorHash: string;
};
// Sem hash próprio.

// A16 — transição genérica: transitionKey é string opaca pra Skill01
// PATCH (Ponto D): target STAGE ganha iterationAction; RUN_TERMINAL
// nunca tem iterationAction. Continua dentro do hash
// STAGE_KERNEL_CONTRACT_V1, sem hash novo.
type StageSuccessTransition = {
  transitionKey: string;
  target:
    | { kind: 'STAGE'; nextStageKey: string; iterationAction: StageTransitionIterationAction }
    | { kind: 'RUN_TERMINAL'; terminalStatus: 'SUCCEEDED' };
};

// A19 — descriptor do adapter, versão congelada no momento do snapshot
type SkillExecutionAdapterDescriptor = {
  adapterKey: string;
  adapterVersion: string;
  targetSkillId: string;
  inputContractKey: string;
  inputContractVersion: string;
  resultContractKey: string;
  resultContractVersion: string;
  adapterDescriptorHash: string;
};
// hash: SKILL_EXECUTION_ADAPTER_DESCRIPTOR_V1
// A20/A21: cada StageKernelContract aponta pra adapterKey+adapterVersion+
// adapterDescriptorHash EXATOS, congelados no momento em que o pipeline
// snapshot é materializado. Proibido getLatestAdapter(skillId) durante
// execução de um Run já existente.

// A22 — uma etapa do pipeline pode ocorrer mais de uma vez durante um Run
// (isso é o que vai viabilizar o loop de correção no Ponto D, sem
// falsificar Attempt da Skill02)
// PATCH (Ponto D): + stageIterationId/Hash + creationRef. Hash continua
// STAGE_EXECUTION_V1.
type StageExecution = {
  stageExecutionId: string;
  productionRunId: string;
  productionRunHash: string;
  tenantId: string;
  stageIterationId: string; // PATCH (Ponto D)
  stageIterationHash: string; // PATCH (Ponto D)
  stageKey: string;
  stageWorkUnitIdentityHash: string; // PATCH (Ponto S5) — BASE também
    // tem hash, unicidade sempre usa a mesma coluna
  stageDefinitionHash: string;
  stageKernelContractId: string;
  stageKernelContractHash: string;
  executionOrdinal: number; // monotônico no RUN INTEIRO — não reinicia
                             // por iteração; NÃO é Attempt nem correction
                             // iteration, só ordem lógica
  creationRef: StageExecutionCreationRef; // PATCH (Ponto D)
  stageSubjectBindingId?: string; // StageSubjectBinding continua
  stageSubjectBindingHash?: string; // autoridade — não é redefinido aqui
  upstreamArtifactRefs: KernelArtifactRef[];
  stageExecutionHash: string;
  createdAt: string;
};
// hash: STAGE_EXECUTION_V1

type StageExecutionState =
  | 'CREATED'
  | 'PREPARING'
  | 'PREPARED'
  | 'DISPATCHED'
  | 'WAITING_EXECUTION'
  | 'INTERPRETING_RESULT'
  | 'RESOLVED'
  | 'CANCELLED';

type StageExecutionRuntimeState = {
  stageExecutionId: string;
  tenantId: string;
  state: StageExecutionState;
  version: number;
  preparedInvocationId?: string;
  preparedInvocationHash?: string;
  resolvedExecutionHash?: string;
  updatedAt: string;
};
// Mutável, sem hash integral. NÃO duplica JobStatus (Skill02) — esse
// estado responde "onde esta ocorrência do stage está no kernel?";
// JobStatus responde "onde a unidade de trabalho está na fila?". São
// dimensões diferentes.

// A28 — contexto fechado passado ao adapter (refs/hashes exatos, nunca
// "busque o latest" — se falta input obrigatório, a preparação falha,
// nunca resolve heuristicamente por latest)
// PATCH (Ponto D): + stageIterationId/Hash + iterationSeedArtifactRefs.
// Hash continua STAGE_EXECUTION_PREPARATION_CONTEXT_V1.
type StageExecutionPreparationContext = {
  stageExecutionId: string;
  stageExecutionHash: string;
  productionRunId: string;
  productionRunHash: string;
  tenantId: string;
  stageIterationId: string; // PATCH (Ponto D)
  stageIterationHash: string; // PATCH (Ponto D)
  stageKey: string;
  stageDefinitionHash: string;
  stageKernelContractHash: string;
  executionAdapter: SkillExecutionAdapterRef;
  stageSubjectBindingId?: string;
  stageSubjectBindingHash?: string;
  initialArtifactRefs: KernelArtifactRef[];
  iterationSeedArtifactRefs: KernelArtifactRef[]; // PATCH (Ponto D) — ===
                                                    // StageIteration.seedArtifactRefs
  upstreamArtifactRefs: KernelArtifactRef[];
  preparationContextHash: string;
};
// hash: STAGE_EXECUTION_PREPARATION_CONTEXT_V1

// A30 — o adapter materializa o payload de domínio; Skill01 só vê a referência
type PreparedSkillInvocation = {
  preparedInvocationId: string;
  tenantId: string;
  productionRunId: string;
  productionRunHash: string;
  stageExecutionId: string;
  stageExecutionHash: string;
  targetSkillId: string;
  executionAdapter: SkillExecutionAdapterRef;
  invocationKey: string; // determinística: tenantId+productionRunId+
                          // stageExecutionId+adapterDescriptorHash+
                          // preparationContextHash — mesma key + conteúdo
                          // diferente = replay conflict
  inputPayloadRef: KernelArtifactRef; // ex.: artifactType=OfferAnalysisInput
                                       // — Skill01 não sabe nem precisa saber
  preparationContextHash: string;
  preparedInvocationHash: string;
  preparedAt: string;
};
// hash: PREPARED_SKILL_INVOCATION_V1

// A33 — a ÚNICA interface que Skill01 precisa conhecer sobre domínio
interface SkillExecutionAdapter {
  readonly descriptor: SkillExecutionAdapterDescriptor;

  // PODE: ler artifacts referenciados, validar hash/schema, transformar
  // deterministicamente, materializar payload tipado.
  // NÃO PODE: chamar provider externo, criar Job, decidir quota,
  // publicar, buscar "latest", alterar Run/StageExecution.
  prepareInvocation(
    context: StageExecutionPreparationContext
  ): Promise<PreparedSkillInvocation>;

  // PODE: ler resultado exato referenciado, validar contra contract da
  // Skill, traduzir domínio → kernel disposition/transitionKey.
  // NÃO PODE: executar próxima Skill, criar Job, modificar Run, decidir
  // retry, chamar provider.
  interpretResult(
    input: SkillExecutionInterpretationInput
  ): Promise<SkillExecutionResolution>;
}

// A36 — referência opaca ao report da execução (o formato exato do
// handlerExecutionReportRef será ligado ao protocolo Skill02↔handler no
// Ponto B; não antecipamos o formato aqui)
type SkillExecutionInterpretationInput = {
  interpretationInputId: string;
  tenantId: string;
  productionRunId: string;
  productionRunHash: string;
  stageExecutionId: string;
  stageExecutionHash: string;
  preparedInvocationId: string;
  preparedInvocationHash: string;
  executionAdapter: SkillExecutionAdapterRef;
  handlerExecutionReportRef: KernelArtifactRef;
  interpretationInputHash: string;
  createdAt: string;
};
// hash: SKILL_EXECUTION_INTERPRETATION_INPUT_V1

// A37 — resultado normalizado do adapter
type KernelExecutionDisposition = 'SUCCEEDED' | 'BLOCKED' | 'FAILED';

// PATCH (Ponto D): + successorIterationSeedRefs. Hash continua
// SKILL_EXECUTION_RESOLUTION_V1.
type SkillExecutionResolution = {
  skillExecutionResolutionId: string;
  tenantId: string;
  productionRunId: string;
  productionRunHash: string;
  stageExecutionId: string;
  stageExecutionHash: string;
  preparedInvocationId: string;
  preparedInvocationHash: string;
  executionAdapter: SkillExecutionAdapterRef;
  handlerExecutionReportRef: KernelArtifactRef;
  disposition: KernelExecutionDisposition;
  transitionKey?: string; // obrigatório se SUCCEEDED, proibido senão
  primaryResultRef?: KernelArtifactRef;
  additionalResultRefs: KernelArtifactRef[];
  successorIterationSeedRefs: KernelArtifactRef[]; // PATCH (Ponto D) —
                                                     // [] salvo SUCCEEDED+
                                                     // START_NEXT_ITERATION
                                                     // (aí length>=1 obrigatório)
  reasonCode?: string; // obrigatório se BLOCKED/FAILED, proibido se SUCCEEDED
                        // — NUNCA vira enum global (ex.: "SKILL12.AUDIT_INPUT_MISSING",
                        // "SKILL17.PROVIDER_CAPABILITY_BLOCKED"); Skill01 só
                        // registra/propaga, nunca interpreta semanticamente
  resolutionHash: string;
  resolvedAt: string;
};
// hash: SKILL_EXECUTION_RESOLUTION_V1
```

**Invariantes da `SkillExecutionResolution`**: `SUCCEEDED` exige
`transitionKey` (com `reasonCode` opcional); `BLOCKED`/`FAILED` proíbem
`transitionKey` e exigem `reasonCode`. Para `SUCCEEDED`, `transitionKey`
**precisa** casar
exatamente com uma entrada de `StageKernelContract.successTransitions`
— caso contrário é violação de contrato do kernel. Nunca "default para
próxima etapa" silenciosamente.

**Como isso resolve o coração do B3** — antes: `Skill01: if
audit.verdict === NON_COMPLIANT → chamar Skill13` (proibido, domínio
vazando pro orquestrador). Depois: `Skill12ExecutionAdapter` interpreta
o resultado de domínio e emite `transitionKey = "AUDIT_NON_COMPLIANT"`;
Skill 01 só procura essa key na tabela `successTransitions` já
congelada e segue o `target` configurado — nunca sabe o que
"NON_COMPLIANT" significa.

**Fluxo completo do kernel:**

```text
ProductionRun
  → ProductionPipelineSnapshot
  → StageKernelContract
  → StageExecution
  → StageExecutionPreparationContext
  → SkillExecutionAdapter.prepareInvocation()
  → PreparedSkillInvocation
  → [Skill 02 / handler — formato exato fechado no Ponto B]
  → handlerExecutionReportRef
  → SkillExecutionAdapter.interpretResult()
  → SkillExecutionResolution
  → disposition + transitionKey
  → StageKernelContract.successTransitions
  → próxima StageExecution ou Run terminal
```

**Divisão de responsabilidade**: Skill 01 é dona de `ProductionRun`
lifecycle, pipeline snapshot, criação de `StageExecution`, resolução do
adapter, tabela de transição e seleção da próxima etapa. O adapter é
dono da construção do input de domínio e da interpretação do resultado
de domínio. Skill 02 (Ponto B) é dona de queue/job/attempt/transporte
de execução. A Skill específica é dona do handler de domínio e do
artifact de domínio.

**Critério verificável**: o módulo futuro da Skill 01 não pode importar
tipos como `OfferAnalysisResult`/`CreativeDirectionResult`/
`VideoAuditResult`/`ReportSnapshot`/`AffiliateLinkArtifact`. Só pode
importar `ProductionRun`/`StageExecution`/`PreparedSkillInvocation`/
`SkillExecutionResolution`/`KernelArtifactRef` e afins. Um adapter
específico (ex.: `Skill12ExecutionAdapter`) **pode** importar `VideoAuditResult`
— essa é justamente sua função; o Orchestrator central, nunca.

`SkillExecutionAdapter` **não é** um provider adapter — não confundir
com `VeoProviderAdapter`/`ShopeeProviderAdapter`/`InstagramProviderAdapter`
(esses traduzem domínio ↔ provider externo; o `SkillExecutionAdapter`
traduz kernel ↔ domínio da Skill — camadas distintas).

**V1 permanece sequencial**: no máximo 1 `StageExecution` não-terminal
ativa por `ProductionRun` (`activeStageExecutionIds.length <= 1`). Isso
não impede jobs standalone/background — eles serão tratados no Ponto C
e não são `StageExecution` deste Run. `StageExecution` resolvida nunca
reabre — uma correção futura (Ponto D) cria **outra** `StageExecution`,
nunca reabre a anterior. `PreparedSkillInvocation` e
`SkillExecutionResolution` também são imutáveis — qualquer mudança gera
novo artifact, nunca `UPDATE`.

**Invariantes críticas do kernel** (congeladas):
1. `ProductionRun` sempre referencia pipeline snapshot exato.
2. Run nunca resolve adapter "latest" depois de criado.
3. Skill 01 nunca interpreta payload/result de domínio.
4. Toda construção de input de domínio passa pelo `SkillExecutionAdapter` da Skill-alvo.
5. Toda interpretação de resultado de domínio passa pelo mesmo adapter/version congelado.
6. `StageExecutionPreparationContext` só contém refs exatas, nunca "latest".
7. `SUCCEEDED` exige `transitionKey`.
8. `transitionKey` deve existir no `StageKernelContract`.
9. `BLOCKED`/`FAILED` nunca escolhem a próxima etapa por lógica de domínio dentro da Skill 01.
10. `StageExecution` resolvida nunca reabre.
11. Adapter nunca cria Job nem chama provider.
12. `StageExecution` V1 tem no máximo uma ocorrência ativa por `ProductionRun`.

**Compatibilidade com contratos já aprovados** — mantidos sem
substituição: `RunStatus`, `RunControlCommand`, `StageDefinition`,
`StageSubjectBinding`, `LogicalJobIntent`, Outbox, versionamento
otimista, cancellation intent. Mapeamento conceitual:
`RunStatus`/`version` → `ProductionRunRuntimeState`; `StageDefinition`
+ `StageKernelContract` juntos = definição completa de execução do
stage; `LogicalJobIntent` vai receber `PreparedSkillInvocation`
(fechado no Ponto B). Neste ponto, Skill 02 só ganha uma regra nova:
**não recebe payload de domínio construído pela Skill 01 — recebe
referência a `PreparedSkillInvocation`.**

**9 hashes canônicos novos do Ponto A**: `PRODUCTION_RUN_V1`,
`PRODUCTION_PIPELINE_SNAPSHOT_V1`, `STAGE_KERNEL_CONTRACT_V1`,
`STAGE_EXECUTION_V1`, `SKILL_EXECUTION_ADAPTER_DESCRIPTOR_V1`,
`STAGE_EXECUTION_PREPARATION_CONTEXT_V1`, `PREPARED_SKILL_INVOCATION_V1`,
`SKILL_EXECUTION_INTERPRETATION_INPUT_V1`, `SKILL_EXECUTION_RESOLUTION_V1`.
Sem hash próprio (entram nos hashes dos tipos pais):
`KernelArtifactRef`, `KernelCreationRef`, `StageKernelContractRef`,
`SkillExecutionAdapterRef`, `StageSuccessTransition`. Mutáveis sem hash
integral: `ProductionRunRuntimeState`, `StageExecutionRuntimeState`.

### Ponto C (parte 2) — `ProductionRunStartRequest`

**Resolve a segunda metade do B1**: `ProductionRun` não pode depender
só de `START` humano — Skill 20, por exemplo, precisa poder solicitar
um `ProductionRun` internamente pra executar de fato uma variante pelo
pipeline de produção (ver detalhe completo, incluindo
`WorkOriginKind`/`WorkOriginRef`, na seção "Reparo transversal" da
Skill 02, Ponto C).

```typescript
type ProductionRunStartRequest = {
  productionRunStartRequestId: string;
  tenantId: string;
  startRequestKey: string;
  trustedTenantContextHash: string;
  origin: WorkOriginRef; // definido na Skill 02, Ponto C — reusado aqui
  pipelineSnapshotId: string;
  pipelineSnapshotHash: string;
  initialArtifactRefs: KernelArtifactRef[];
  startRequestHash: string;
  requestedAt: string;
};
// hash: PRODUCTION_RUN_START_REQUEST_V1
```

`RunControlCommand START` existente vira **um** produtor de
`ProductionRunStartRequest` (`RunControlCommand START →
validate/authorize → ProductionRunStartRequest → ProductionRun`) —
não o produtor exclusivo. Origens não-humanas usam `origin.kind =
INTERNAL_SERVICE`/`SYSTEM_EVENT`/`SCHEDULE`/`WEBHOOK` (com gate
`ALLOW` da Skill 25 + `TrustedTenantContext` da Skill 22 quando for
`WEBHOOK`) — nenhuma origem tem bypass da regra "máx 1 `ProductionRun`
ativo/tenant". Idempotência: `(tenantId, startRequestKey)`. Patch em
`ProductionRun.creationRef` (definido acima): pra novos Runs, aponta
pra `{sourceKind: 'PRODUCTION_RUN_START_REQUEST', sourceId:
productionRunStartRequestId, sourceHash: startRequestHash}` — sem
mudança no hash/tipo de `ProductionRun` em si.

**PATCH (Ponto M7).** `ProductionRunStartRequest` nunca carrega
`runId` (confirmado — nenhum campo desse tipo aqui), exatamente porque
essa identidade ainda não existe nesse momento: `Skill01` aloca o
`runId` (globalmente único, opaque, nunca derivado de `commandId`/
`startRequestKey`/timestamp/tenant) atomicamente junto com a
materialização da `ProductionRun`, dentro do boundary confiável —
nunca antes da validação do `START`, nunca a partir de payload de
origem nenhuma (humana, `WEBHOOK`, `SYSTEM_EVENT`, `SCHEDULE`,
`INTERNAL_SERVICE`). Colisão do gerador (extremamente improvável, mas
semanticamente possível) é problema de infraestrutura de identity
allocation, não replay de `START` — trata-se com retry limitado de
alocação antes de tornar a Run visível, nunca alterando uma Run já
existente; não introduz `FATAL_ERROR` de domínio novo. `STANDALONE`
work (Ponto C) continua sem `ProductionRun`/`runId` — não criamos Run
artificial só porque Skill01 agora é autoridade de alocação de
identidade.

### Ponto D — correction loop / `StageIteration`

**Resolve B2.** O erro estrutural que o Fable encontrou: Skill 13
falava em "nova Attempt" quando a Skill 12 reprova um vídeo e pede
correção, mas o Job da Skill 11 já estava `SUCCEEDED` — um Job
concluído nunca reabre. A correção estrutural:

```text
Attempt        → retry técnico da MESMA operação lógica / MESMO input
StageExecution → uma execução semântica de uma stage
StageIteration → uma revisão semântica do produto dentro do MESMO ProductionRun
```

Logo: **"gere novamente com correção" ≠ nova Attempt.** *"gere
novamente com correção" = nova `StageIteration` + nova
`StageExecution` + novo Job + `Attempt #1` desse novo Job.*

**Regra central**: depois que um Job termina `SUCCEEDED`, ele nunca
reabre. Depois que uma `StageExecution` termina `RESOLVED`, ela nunca
reabre. Se o domínio pede uma nova versão do resultado → nova
`StageExecution`. Se essa nova versão representa correção/revisão do
ciclo anterior → nova `StageIteration`.

**O fluxo de correção completo:**

```text
StageIteration #1
  Skill09 frame → Skill10 prompt → Skill11 geração → Skill12 auditoria
  → NON_COMPLIANT
  ──────────────── START_NEXT_ITERATION ────────────────
StageIteration #2
  Skill13 correção
    correction scope: FRAME→Skill09 | PROMPT→Skill10 | VIDEO→Skill11
  → Skill12 → COMPLIANT?
  → se NON_COMPLIANT de novo: StageIteration #3
```

Nunca `Attempt #2` do Job antigo da Skill 11. **O boundary da nova
iteração começa exatamente em `Skill12 NON_COMPLIANT → START_NEXT_ITERATION
→ Skill13`** (mais limpo que começar depois da Skill 13) — a `Iteration
N` contém o vídeo que foi auditado; a `Iteration N+1` começa pela
interpretação/correção desse audit e produz a revisão seguinte. A
Skill 13 pertence semanticamente à nova revisão.

```typescript
type StageIterationKind = 'INITIAL' | 'REVISION';
// Sem hash próprio. Skill01 NÃO conhece CORRECTION/NON_COMPLIANT/
// VIDEO_RETRY como tipos de iteração — só INITIAL e REVISION.

type StageIterationTriggerRef =
  | { kind: 'RUN_ENTRY'; productionRunId: string; productionRunHash: string }
  | { kind: 'STAGE_TRANSITION'; stageTransitionResolutionId: string; stageTransitionResolutionHash: string };
// Sem hash próprio.

type StageIteration = {
  stageIterationId: string;
  tenantId: string;
  productionRunId: string;
  productionRunHash: string;
  iterationNumber: number;
  kind: StageIterationKind;
  predecessorStageIterationId?: string;
  predecessorStageIterationHash?: string;
  triggerRef: StageIterationTriggerRef;
  seedArtifactRefs: KernelArtifactRef[];
  stageIterationHash: string;
  createdAt: string;
};
// hash: STAGE_ITERATION_V1
```

**Iteração inicial** (obrigatório): `iterationNumber=1`, `kind=INITIAL`,
`predecessorStageIterationId/Hash` ausentes, `triggerRef.kind=RUN_ENTRY`,
`seedArtifactRefs=[]` (os artifacts iniciais continuam em
`ProductionRun.initialArtifactRefs` — não duplicados aqui). **Iteração
de revisão** (obrigatório): `iterationNumber>=2`, `kind=REVISION`,
`predecessorStageIterationId/Hash` obrigatórios,
`triggerRef.kind=STAGE_TRANSITION`, `seedArtifactRefs.length>=1`, e
`iterationNumber = predecessor.iterationNumber + 1`.

**V1 continua linear** — um `StageIteration` pode ter no máximo um
sucessor dentro do mesmo `ProductionRun` (sem branching de revisions
tipo `Iteration 1 → {2A, 2B}` na V1). Idempotência: `UNIQUE(tenantId,
productionRunId, iterationNumber)` — mesmo número + mesmo hash → replay
idempotente; conteúdo divergente → `FATAL`.

**Patches aos contratos do Ponto A** (mesmos hashes, sem V2 — ainda
pré-runtime):

```typescript
// Patch em ProductionRunRuntimeState (Ponto A):
// + activeStageIterationId?: string;
// + activeStageIterationHash?: string;
// Mantém activeStageExecutionIds: string[] (invariante V1: length <= 1;
// se existe StageExecution ativa, ela pertence obrigatoriamente ao
// activeStageIterationId/hash atual).

type StageExecutionCreationRef =
  | { kind: 'RUN_ENTRY'; stageIterationId: string; stageIterationHash: string }
  | { kind: 'STAGE_TRANSITION'; stageTransitionResolutionId: string; stageTransitionResolutionHash: string };
// Sem hash próprio.

// Patch em StageExecution (Ponto A) — hash continua STAGE_EXECUTION_V1:
// + stageIterationId: string;
// + stageIterationHash: string;
// + creationRef: StageExecutionCreationRef;
```

**Uma stage work unit só executa uma vez por iteração** (invariante
crítica): `UNIQUE(tenantId, productionRunId, stageIterationId,
stageKey, stageWorkUnitIdentityHash)` (Ponto S5 — antes só
`stageKey`, sem a coluna de work unit; refinado pra permitir siblings
planejados dentro da mesma stage/iteração, ver Ponto S5 abaixo). Dentro
da mesma iteração, se a Skill 11 já executou aquela work unit
específica, não pode simplesmente executar de novo — se precisa gerar
semanticamente outra versão, é nova `StageIteration`. Isso separa
retry de revisão de forma verificável:

```text
Retry técnico:      mesma StageIteration + mesma StageExecution + mesmo Job + mesmo PreparedSkillInvocation + nova Attempt
Correção semântica: nova StageIteration + nova StageExecution + novo PreparedSkillInvocation + novo Job + Attempt #1
```

`StageExecution.executionOrdinal` (já aprovado no Ponto A) permanece
monotônico no **Run inteiro**, não reinicia por iteração (ex.:
Iteration 1 usa ordinais 1-4, Iteration 2 continua em 5-8).

```typescript
// Patch em StageExecutionPreparationContext (Ponto A) — hash continua
// STAGE_EXECUTION_PREPARATION_CONTEXT_V1:
// + stageIterationId: string;
// + stageIterationHash: string;
// + iterationSeedArtifactRefs: KernelArtifactRef[];
```

Invariante: `StageExecutionPreparationContext.iterationSeedArtifactRefs
=== StageIteration.seedArtifactRefs` pra toda `StageExecution` daquela
iteração — o contexto de correção continua disponível durante toda a
revisão. Exemplo: Iteration 1 tem `FrameArtifact F1 + VideoPromptArtifact
P1 + VideoArtifact V1 + VideoAuditResult A1(NON_COMPLIANT)`; Iteration
2 nasce com seeds exatos `[A1, F1, P1, V1]`; Skill 13 produz
`CorrectionResult C2 (scope=PROMPT)`; Skill 10 da Iteration 2 recebe
`initialArtifactRefs + iterationSeedArtifactRefs + upstreamArtifactRefs
(contendo C2)` e constrói `P2` — **nada busca "último frame/prompt/vídeo"**.
Mesma lógica pra `scope=VIDEO` (correção aponta direto pra Skill 11 na
mesma Iteration 2) ou `scope=FRAME` (aponta pra Skill 09, depois segue
09→10→11→12 normal). Skill 01 continua sem conhecer `CorrectionScope`
— só enxerga `transitionKey` (`CORRECTION_REGENERATE_FRAME`/
`_PROMPT`/`_VIDEO`) e consulta o `StageKernelContract`; a semântica
desses nomes continua domínio/adapter.

```typescript
type StageTransitionIterationAction = 'CONTINUE_CURRENT_ITERATION' | 'START_NEXT_ITERATION';
// Sem hash próprio.
```

`StageSuccessTransition` já foi patchada in-place (ver definição acima,
próxima ao `A16`) pra incluir `iterationAction` no `target.kind='STAGE'`
— não redeclarada aqui. Continua dentro do hash
`STAGE_KERNEL_CONTRACT_V1`, sem hash novo. `RUN_TERMINAL` nunca tem
`iterationAction` — proibido `RUN_TERMINAL + START_NEXT_ITERATION` (não
existe próximo ciclo depois de terminalizar).

`CONTINUE_CURRENT_ITERATION` = criar nova `StageExecution` no **mesmo**
`StageIteration` (ex.: Skill 13 → Skill 10 na iteração de revisão).
`START_NEXT_ITERATION` = criar `StageIteration N+1` + sua primeira
`StageExecution` (ex.: Skill 12 `NON_COMPLIANT` → Skill 13). Exemplos
concretos:

```typescript
// Audit NON_COMPLIANT (Skill 12)
{ transitionKey: 'AUDIT_NON_COMPLIANT', target: { kind: 'STAGE', nextStageKey: 'CORRECT', iterationAction: 'START_NEXT_ITERATION' } }
// Audit COMPLIANT (Skill 12)
{ transitionKey: 'AUDIT_COMPLIANT', target: { kind: 'STAGE', nextStageKey: 'FINALIZE', iterationAction: 'CONTINUE_CURRENT_ITERATION' } }
// Correção de prompt (Skill 13)
{ transitionKey: 'CORRECTION_REGENERATE_PROMPT', target: { kind: 'STAGE', nextStageKey: 'PROMPT', iterationAction: 'CONTINUE_CURRENT_ITERATION' } }
```

`CorrectionResult` chega na nova `StageExecution` (Skill 10) como
`upstreamArtifactRefs`, distinto de `iterationSeedArtifactRefs` (audit
+ artifacts anteriores) — separa bem "contexto herdado da revisão" de
"resultado da stage imediatamente anterior".

```typescript
// Patch em SkillExecutionResolution (Ponto A) — hash continua
// SKILL_EXECUTION_RESOLUTION_V1:
// + successorIterationSeedRefs: KernelArtifactRef[];
```

Invariantes de `successorIterationSeedRefs`: `disposition=BLOCKED` ou
`FAILED` → `[]` obrigatório. Sucesso + `CONTINUE_CURRENT_ITERATION` →
`[]`. Sucesso + `RUN_TERMINAL` → `[]`. Sucesso + `START_NEXT_ITERATION`
→ `length>=1` obrigatório — esses refs viram exatamente
`StageIteration.seedArtifactRefs` da nova iteração. **O adapter é quem
seleciona os seeds** (mantém Skill 01 agnóstica — ela nunca pergunta
"qual frame reutilizar?"), **mas não pode inventar refs**: todo
`successorIterationSeedRef` precisa vir de um conjunto autorizado —
`ProductionRun.initialArtifactRefs`, `current
StageIteration.seedArtifactRefs`, `current
StageExecution.upstreamArtifactRefs`, `JobExecutionResult.resultRef`,
ou `JobExecutionResult.additionalResultRefs`. Nunca "query latest" ou
"lookup arbitrary artifact". Skill 01 valida isso genericamente
comparando `artifactId`/`artifactHash` contra os conjuntos exatos —
não precisa entender o artifact; ref sem provenance → `FATAL`.

**Audit `NON_COMPLIANT` é um resultado de domínio bem-sucedido** — o
Job da Skill 12 termina `SUCCEEDED` (`outcome=SUCCEEDED,
resultRef=VideoAuditResult`); o fato do vídeo estar ruim **não
significa Job `FAILED`**. O adapter da Skill 12 lê `VideoAuditResult.verdict`
e traduz:

```typescript
{
  disposition: 'SUCCEEDED',
  transitionKey: 'AUDIT_NON_COMPLIANT',
  primaryResultRef: auditResultRef,
  successorIterationSeedRefs: [auditResultRef, exactFrameRef, exactPromptRef, exactVideoRef],
}
```

```typescript
type StageTransitionResolvedTarget =
  | { kind: 'STAGE'; nextStageKey: string; iterationAction: StageTransitionIterationAction }
  | { kind: 'RUN_TERMINAL'; terminalStatus: 'SUCCEEDED' };

type StageTransitionResolution = {
  stageTransitionResolutionId: string;
  transitionResolutionKey: string;
  tenantId: string;
  productionRunId: string;
  productionRunHash: string;
  sourceStageExecutionId: string;
  sourceStageExecutionHash: string;
  sourceStageIterationId: string;
  sourceStageIterationHash: string;
  stageKernelContractId: string;
  stageKernelContractHash: string;
  skillExecutionResolutionId: string;
  skillExecutionResolutionHash: string;
  transitionKey: string;
  resolvedTarget: StageTransitionResolvedTarget;
  successorIterationSeedRefs: KernelArtifactRef[];
  transitionResolutionHash: string;
  resolvedAt: string;
};
// hash: STAGE_TRANSITION_RESOLUTION_V1
```

**Por que esse artifact existe**: sem ele, `SkillExecutionResolution →
lookup no pipeline → cria stage` deixaria uma janela de crash/replay
ambígua; com ele, `domain resolution → transition resolution imutável
→ materialização idempotente do próximo estado`. `resolvedTarget` é
uma **cópia congelada** da transition correspondente do
`StageKernelContract` exato da source `StageExecution` — deploy
posterior não muda routing de Run antigo. Idempotência:
`UNIQUE(tenantId, sourceStageExecutionId)` pra stages `SINGLE` (uma
`StageExecution` resolvida produz no máximo uma transição); pra
stages `EXPANDABLE` (Ponto S5), `UNIQUE(tenantId,
stageExpansionManifestId)` — o conjunto completo de siblings
resolvidos produz no máximo uma transição stage-level, materializada
só depois do barrier fechar (ver Ponto S5). Mesmo source(s) + mesmo
hash → mesma resolution; conteúdo divergente → `FATAL`.
`transitionResolutionKey`
deriva deterministicamente de `tenantId + productionRunId +
sourceStageExecutionId + skillExecutionResolutionHash` — sem UUID
aleatório a cada replay. Se o adapter retorna um `transitionKey` que o
`StageKernelContract` congelado não possui → `FATAL` (nunca "default
transition").

**Seed refs propagam em cadeia**: se `START_NEXT_ITERATION`,
`StageTransitionResolution.successorIterationSeedRefs ===
SkillExecutionResolution.successorIterationSeedRefs`, e depois `new
StageIteration.seedArtifactRefs === StageTransitionResolution.successorIterationSeedRefs`
— lineage completa. Se `CONTINUE_CURRENT_ITERATION`,
`successorIterationSeedRefs=[]` e a próxima `StageExecution` usa
`sourceStageIterationId/hash`.

**Atomicidade lógica pra `START_NEXT_ITERATION`**: `1. materialize
StageTransitionResolution → 2. materialize StageIteration N+1 → 3.
materialize first StageExecution in N+1 → 4. update
ProductionRunRuntimeState.activeStageIterationId/hash → 5. update
activeStageExecutionIds → 6. mark source StageExecution RESOLVED → 7.
outbox/commit`. **Replay-safe contra crash**: se crash ocorre depois do
transition artifact mas antes da nova `StageExecution`, replay
encontra a mesma transition e materializa só o que falta — nunca cria
`Iteration N+2`. Mesma-iteração também é replay-safe: como existe
`UNIQUE(stageIterationId, stageKey, stageWorkUnitIdentityHash)` (Ponto
S5), replay não duplica a work unit.

**Proibida reentrada silenciosa na mesma stage work unit**: se
`CONTINUE_CURRENT_ITERATION` aponta pra um `(stageKey,
stageWorkUnitIdentityHash)` que já possui `StageExecution` naquela
mesma iteração → `STAGE_ITERATION_STAGE_REENTRY_WITHOUT_REVISION`
(isso seria uma revisão sem nova `StageIteration`). Exemplo agora
proibido: `Iteration #1: Skill11 → Skill12 → NON_COMPLIANT → Skill11
de novo (mesma work unit)` com `CONTINUE_CURRENT_ITERATION` —
inválido; o caminho correto é `NON_COMPLIANT →
START_NEXT_ITERATION`. **Permitido desde o Ponto S5**: `Skill11
(work unit target=Instagram) → Skill11 (work unit target=TikTok)` na
mesma iteração — siblings planejados via `StageExpansionManifest`,
nunca reentrada.

**Attempt permanece exatamente como a Skill 02 já definiu** — nada
muda pra `Job Attempt 1 → transient failure → Attempt 2` quando é
mesmo Job/mesmo `JobExecutionBinding`/mesmo `inputPayloadRef`/mesma
`StageExecution`/mesma semântica. **Mudança semântica de input proíbe
retry do mesmo Job** — se houve mudança em frame/prompt/correction
context/generation intent/exact payload, isso não é `RetryPolicy`, é
novo trabalho semântico: novo `StageExecution` → novo
`PreparedSkillInvocation` → novo `LogicalJobIntent` → novo Job.

**Patch crítico na derivação de `logicalJobKey`** (Skill 02): pra Jobs
`RUN_SCOPED`, `logicalJobKey` precisa incluir a identidade da
`StageExecution` e da `PreparedSkillInvocation` — não pode ser só
`productionRunId + stageKey`, senão Skill 11 da Iteration #2 colidiria
com Skill 11 da Iteration #1. Derivação conceitual:
`RUN:<tenantId>:<productionRunId>:<stageExecutionId>:<preparedInvocationHash>`
(ou canonical equivalent). Consequência desejada: Skill 11/Iteration #1
→ Job J1; Skill 11/Iteration #2 → Job J2; `J1 ≠ J2` mesmo com
`stageKey`/`provider`/`model` iguais. Cada Job começa em `Attempt #1` —
`J1 Attempt 1/2` podem ser retries técnicos da geração original; `J2
Attempt 1` é nova geração semântica.

**Skill 23 encaixa corretamente**: Skill 11 original `J1 Attempt 1 →
authorization A1`; retry técnico `J1 Attempt 2 → nova authorization
A2` (já prometido pela Skill 23); correção semântica `J2 Attempt 1 →
authorization A3` — também nova. Nenhuma autorização antiga atravessa
a revisão. `ProviderSubmission` também fica correto: a operação
corrigida possui novo `jobId`, `attemptNumber=1`, novo
`requestPayloadHash` — sem risco de confundir "retransmit same
provider call" com "generate a different video".

**Patches obrigatórios de texto em outras Skills** (não criam tipos
novos):
- **Skill 13**: qualquer frase equivalente a "Skill13 cria nova
  Attempt"/"correção gera próxima Attempt"/"retry corrigido usa nova
  Attempt" deve ser substituída por: *"Uma correção semântica nunca
  cria nova Attempt do Job já concluído. O ciclo de correção é
  representado por nova StageIteration; cada stage reexecutada nessa
  revisão cria nova StageExecution, nova PreparedSkillInvocation e
  novo Job lógico. Attempt permanece reservado a retries técnicos da
  mesma operação lógica e do mesmo input."*
- **Skill 12**: adicionar: *"NON_COMPLIANT é um resultado de domínio
  bem-sucedido da auditoria e portanto o Job da Skill12 termina
  SUCCEEDED. Seu SkillExecutionAdapter traduz o verdict para uma
  transitionKey; quando essa transition estiver configurada como
  START_NEXT_ITERATION, a Skill01 cria nova StageIteration. O Job de
  auditoria concluído nunca é reaberto."*
- **Skills 09/10/11**: adicionar: *"Quando chamadas em decorrência de
  uma correção, estas Skills executam em nova StageExecution/novo Job
  da StageIteration corrente. Não reutilizam Job ou Attempt da geração
  anterior. Retry técnico dentro dessa nova operação continua
  obedecendo à Skill02 normalmente."*
- **Skill 20**: a decisão já aprovada "correções permanecem na mesma
  variante" ganha concretização: `same Experiment + same variant
  identity + same ProductionRun + new StageIteration` — nunca
  `correction → new variant`. `StageIteration` **não** muda subject:
  criar nova `StageIteration` ≠ novo produto ≠ nova variante ≠ novo
  `ProductionRun` ≠ novo `StageSubjectBinding` automaticamente — ela
  preserva a mesma linhagem factual (se uma stage da revisão usa
  subject binding, reutiliza o binding factual exato aplicável).
- **Skill 13 `NO_PROGRESS`**: não deve causar `START_NEXT_ITERATION`
  automaticamente — precisa produzir o disposition/transition
  apropriado conforme a policy da Skill 13. Skill 01 não inventa mais
  uma revisão só porque uma correção falhou.

**Sem limite fictício de revisões**: `Skill02.maxAttempts` (retries
técnicos por Job) é separado de "quantidade de `StageIteration`"
(revisões semânticas do Run) — não reutilizar `maxAttempts` como
máximo de correções. Como as Skills de correção já têm suas próprias
políticas/anti-loop e `NO_PROGRESS`, nenhum `maxStageIterations` é
inventado sem base agora — mas `iterationNumber` fica explícito,
auditável e disponível pra policy futura (se Fable/Astra exigir um
limite global, ele pode entrar no pipeline snapshot sem redefinir
`Attempt`).

**Validação upfront vs. runtime**: ao materializar
`ProductionPipelineSnapshot`, validar que todo `transitionKey` é único
dentro de cada `StageKernelContract`, todo `nextStageKey` existe no
snapshot, todo `target RUN_TERMINAL` é válido, e `iterationAction`
está presente em todo `target STAGE` — evita descobrir routing
inválido só em produção. Reentry validation é runtime: antes de
`CONTINUE_CURRENT_ITERATION → X`, Skill 01 verifica que não existe
`StageExecution` com `current stageIterationId + X`; se existir,
`FATAL`. (Nota: `START_NEXT_ITERATION` pode legitimamente apontar pra
um `stageKey` já executado na iteração anterior — a unicidade é por
`stageIterationId + stageKey`, não pelo Run inteiro.)

**Observabilidade**: `productionRunId`, `stageIterationId`,
`iterationNumber`, `iterationKind`, `stageExecutionId`, `stageKey`,
`executionOrdinal`, `transitionKey`, `iterationAction`,
`sourceStageIterationId`, `successorStageIterationId?`,
`successorSeedCount`, `jobId`, `attemptNumber` — torna visível "retry
técnico" vs. "nova correção". Métricas:
`production_stage_iteration_created_total`,
`production_revision_iteration_created_total`,
`production_stage_transition_total`,
`production_stage_transition_revision_total`,
`production_stage_reentry_blocked_total`. Nunca `productId`/prompt
text/provider payload como labels.

O que nunca acontece: `Job SUCCEEDED → RUNNING` de novo;
`StageExecution RESOLVED → PREPARING` de novo; `Attempt 2` com payload
semanticamente diferente; `NON_COMPLIANT → Job FAILED`;
`correction → new experiment variant` automaticamente.

### 10 `FATAL_ERROR` novos do Ponto D

```text
STAGE_ITERATION_REPLAY_CONFLICT
STAGE_ITERATION_LINEAGE_MISMATCH
STAGE_ITERATION_NUMBER_MISMATCH
STAGE_ITERATION_SEED_PROVENANCE_VIOLATION
STAGE_EXECUTION_ITERATION_MISMATCH
STAGE_ITERATION_STAGE_REENTRY_WITHOUT_REVISION
STAGE_TRANSITION_RESOLUTION_REPLAY_CONFLICT
STAGE_TRANSITION_KEY_NOT_FOUND
STAGE_TRANSITION_ITERATION_ACTION_MISMATCH
STAGE_RESOLVED_REOPEN_ATTEMPT
```

Guard adicional na Skill 02 (regra: `nova Attempt + inputPayloadRef
diferente do JobExecutionBinding → fatal`) — **não** vira novo código
`JOB_SEMANTIC_REEXECUTION_AS_RETRY_ATTEMPT`; coberto pela invariante
já existente `JOB_EXECUTION_BINDING_REPLAY_CONFLICT`/contract
violation, pra não alterar a contagem de 10 FATAL_ERROR já
verificada do Ponto B.

### 2 hashes canônicos novos do Ponto D

`STAGE_ITERATION_V1`, `STAGE_TRANSITION_RESOLUTION_V1`. **Conteúdo
alterado por patch de compatibilidade** (nomes não mudam, sem V2):
`STAGE_KERNEL_CONTRACT_V1` (`StageSuccessTransition` ganha
`iterationAction`), `STAGE_EXECUTION_V1` (+`stageIteration` +
`creationRef`), `STAGE_EXECUTION_PREPARATION_CONTEXT_V1` (+seed refs),
`SKILL_EXECUTION_RESOLUTION_V1` (+`successorIterationSeedRefs`). Sem
hash próprio: `StageIterationKind`, `StageIterationTriggerRef`,
`StageExecutionCreationRef`, `StageTransitionIterationAction`,
`StageTransitionResolvedTarget`.

### State machine completa da correção

```text
Iteration N
  Generate Job J1 → SUCCEEDED
  Audit Job J2 → VideoAuditResult NON_COMPLIANT (Job J2 remains SUCCEEDED)
  Skill12 Adapter → SkillExecutionResolution
    transitionKey=AUDIT_NON_COMPLIANT, seedRefs=[exact artifacts]
  → StageTransitionResolution: START_NEXT_ITERATION
Iteration N+1
  Correct Job J3 → CorrectionResult
  Skill13 Adapter → transitionKey=FRAME/PROMPT/VIDEO
  → CONTINUE_CURRENT_ITERATION
  → new StageExecution → new Job J4, Attempt 1
  → ...
```

```text
ProductionRun
  ├── StageIteration #1
  │      ├── StageExecution
  │      │      └── Job
  │      │            ├── Attempt 1
  │      │            └── Attempt 2  ← retry técnico
  │      └── ...
  └── StageIteration #2             ← revisão semântica
         ├── StageExecution
         │      └── NOVO Job
         │             └── Attempt 1
         └── ...
```

### Critérios de fechamento do B2 (15, congelados)

1. `NON_COMPLIANT` pode retornar por um Job `SUCCEEDED`.
2. Skill 01 possui caminho explícito pra `START_NEXT_ITERATION`.
3. `StageIteration` possui lineage exata.
4. Nova iteração cria nova `StageExecution`.
5. Nova `StageExecution` cria nova `PreparedSkillInvocation`.
6. Nova `PreparedSkillInvocation` cria novo Job lógico.
7. Esse Job começa em `Attempt #1`.
8. Job antigo `SUCCEEDED` nunca reabre.
9. `StageExecution` antiga `RESOLVED` nunca reabre.
10. Retry técnico continua usando Attempt do mesmo Job.
11. Stage já executada não pode reaparecer na mesma iteração.
12. Skill 13 pode rotear FRAME/PROMPT/VIDEO sem Skill 01 conhecer
    `CorrectionScope`.
13. Nova revisão preserva mesmo `ProductionRun`/variant/subject
    lineage.
14. Skill 23 recebe nova autorização quando a nova execução paga
    chegar ao provider.
15. Audit da nova geração é novo Job, não Attempt do audit antigo.

### Ponto S5 — `variantKey` deixa de ser coordenada do kernel

Achado real do Fable: `variantKey` era uma string livre carregada por
`LogicalJobIntent`/`logicalJobKey` sem gramática formal — diferentes
Skills comprimiam nela significados diferentes (`Skill10 → "beat:2"`,
`Skill14/17 → target embutido`, `Skill20 →
compact(experimentVariantIdentityHash)`). Formalizar uma gramática pra
essa string **cristalizaria o erro** em vez de corrigi-lo. Decisão:
`variantKey` deixa de existir como coordenada de execução do kernel —
as três dimensões que hoje eram comprimidas numa string passam a ser
representadas separadamente. Um `variantKey` de negócio pode continuar
existindo em algum tipo puramente de domínio, desde que **não**
determine identidade/scheduling de `StageExecution`.

```text
Stage
  └─ 1..N work units
        ├─ creative variant
        ├─ beat
        └─ publication target
```

Owner de toda a mecânica: **Skill 01** (kernel/`ProductionRun`). As
Skills 10/14/17/20 fornecem as identidades de domínio que alimentam os
eixos, mas não são donas da mecânica de fan-out.

#### Eixos V1 fechados

```typescript
type StageWorkUnitAxis =
  | 'CREATIVE_VARIANT'
  | 'BEAT'
  | 'PUBLICATION_TARGET';
// V1 fechado — nunca `string` livre. Se surgir outro eixo (idioma,
// aspect ratio etc.), é adicionado explicitamente aqui, nunca
// inferido de uma convenção de nomes.
```

#### Identidade estruturada da work unit

```typescript
type StageSubvalueIdentity = {
  sourceArtifactRef: KernelArtifactRef;
  valueIdentityHash: string;
};
// "o subvalor identificado por este hash dentro deste artifact pai
// exato" — o hash sozinho nunca basta, sempre amarrado ao parent.

type StageBeatIdentity = {
  scriptResultRef: KernelArtifactRef;
  beatIndex: number; // inteiro >= 0 (mesma convenção 0-based real já
                       // usada por ScriptBeat.beatIndex nas Skills
                       // 08/09/10/12 — checado antes de aplicar, não
                       // "beatNumber" 1-based inventado), identifica o
                       // beat exato dentro deste ScriptResult
};
// Beat não ganha artifact próprio nesta rodada — value identity basta.

type StageWorkUnitIdentity =
  | { kind: 'BASE'; }
  | {
      kind: 'DIMENSIONAL';
      creativeVariant?: StageSubvalueIdentity;
      beat?: StageBeatIdentity;
      publicationTarget?: StageSubvalueIdentity;
    };
// DIMENSIONAL vazio (nenhum dos três campos) é inválido — pelo menos
// um eixo é obrigatório. Objeto estruturado, não array `axes[]`:
// evita ordem/duplicata/sorting ambíguos — cada dimensão aparece no
// máximo uma vez e a composição é inequívoca.

// hash: STAGE_WORK_UNIT_IDENTITY_V1 (via CANONICAL_SERIALIZATION_V1)
// — value hash, não artifact persistido novo.
```

Exemplos:

```text
Stage sem fan-out:               { kind: 'BASE' }
Prompt do beat de índice 1:       { kind: 'DIMENSIONAL', beat: { scriptResultRef: SCRIPT_X, beatIndex: 1 } }
Variante B, beat de índice 1:     { kind: 'DIMENSIONAL', creativeVariant: {...VARIANT_B_HASH}, beat: {...beatIndex:1} }
Publication target Instagram:     { kind: 'DIMENSIONAL', publicationTarget: { sourceArtifactRef: TARGET_PLAN_X, valueIdentityHash: INSTAGRAM_TARGET_HASH } }
```

Nunca `"variant-B:beat-2:instagram"` como string composta. **Combinações
não são inferidas automaticamente** — se há 2 creative variants × 2
beats × 3 targets, o kernel não calcula `2×2×3=12` sozinho; o adapter
enumera explicitamente os work units requeridos (evita produzir 12
vídeos por acidente).

#### `StageKernelContract` declara capacidade

```typescript
type StageWorkUnitMode = 'SINGLE' | 'EXPANDABLE';

type StageWorkUnitContract = {
  mode: StageWorkUnitMode;
  allowedAxes: StageWorkUnitAxis[];
};
// PATCH em StageKernelContract (patch in-place, hash continua
// STAGE_KERNEL_CONTRACT_V1): + workUnitContract: StageWorkUnitContract;
```

`mode='SINGLE'` → exatamente uma work unit `BASE`, nenhum
`StageExpansionManifest`, nenhum eixo dimensional (regra forte: SINGLE
nunca usa DIMENSIONAL). `mode='EXPANDABLE'` → `StageExpansionManifest`
obrigatório, 1..N work units — mas **pode conter só `[BASE]`** quando
o adapter de um stage expansível produzir exatamente uma operação sem
dimensão naquele Run (evita dois protocolos pro mesmo stage
dependendo do input). Eixos fora de `allowedAxes` são rejeitados antes
de criar `StageExecution` (`STAGE_WORK_UNIT_IDENTITY_INVALID`). Sem
`requiredAxes` estático — o mesmo stage pode operar com ou sem
experimento em Runs diferentes; o manifest concreto da Run define
quais dimensões existem.

#### `StageExpansionManifest` — congela o fan-out antes da execução

```typescript
type StageExpansionManifest = {
  stageExpansionManifestId: string;

  tenantId: string;
  runId: string;
  stageIterationId: string;
  stageKey: string;

  expansionSourceRefs: KernelArtifactRef[]; // de onde veio a
    // enumeração (ex.: ScriptResult→beats, ExperimentPlan→variants,
    // PublicationTargetPlan→targets) — nunca enumera consultando fonte
    // mutável "ao vivo" depois

  workUnits: Array<{
    identity: StageWorkUnitIdentity;
    stageWorkUnitIdentityHash: string;
  }>;

  materializedAt: string;
  stageExpansionManifestHash: string; // STAGE_EXPANSION_MANIFEST_V1
};

type StageExpansionManifestRef = {
  stageExpansionManifestId: string;
  stageExpansionManifestHash: string;
};
// Sem hash próprio.
```

Fluxo: `immutable upstream inputs → adapter enumera work units (puro,
sem side effect — nunca post/publish/generate/send) → Skill 01
materializa StageExpansionManifest → só então cria
StageSubjectBindings/StageExecutions`. Depois de materializado, **o
manifest não muda** — nada de adicionar um target no meio (ex.:
Pinterest aparecendo depois de Instagram+TikTok já materializados é
mudança semântica, exige nova `StageIteration`). Sources precisam ser
`exact immutable artifacts` — nunca "quais targets existem agora?"/
"quantos beats o banco mostra agora?" sem snapshot. Replay segue S14:
manifest existente → reuse, nunca reenumera. Uma identidade não pode
apontar pra subvalor inexistente (`valueIdentityHash` precisa existir
dentro do `sourceArtifactRef`; `beatIndex` precisa existir no
`ScriptResult` exato) — não basta receber hashes arbitrários do
caller. Todos os `sourceArtifactRef` tenant-scoped precisam pertencer
ao `tenantId` do manifest — cross-tenant é fail closed.

Hash `STAGE_EXPANSION_MANIFEST_V1` (1 hash novo, via
`CANONICAL_SERIALIZATION_V1`) — projection inclui `tenantId`/`runId`/
`stageIterationId`/`stageKey`/`expansionSourceRefs`/`workUnits`;
exclui `stageExpansionManifestId`/`materializedAt`/
`stageExpansionManifestHash`. `workUnits` é semanticamente set-like:
calcula `STAGE_WORK_UNIT_IDENTITY_V1` de cada unit, ordena
lexicograficamente pelo hash antes de hashear o manifest; hash
duplicado entre work units é `STAGE_WORK_UNIT_IDENTITY_INVALID`.
`expansionSourceRefs` também canonical-sorted (set-like), salvo se
algum source tiver ordem semanticamente necessária (não é o caso
identificado agora).

#### `StageSubjectBinding` muda de cardinalidade

**Segundo coração do S5.** A regra antiga `UNIQUE(runId, stageKey) →
um StageSubjectBinding canônico` não pode continuar — quebrava
justamente quando `FinalizedVideo X` precisa de bindings distintos
pra `target Instagram` e `target TikTok` sobre o **mesmo** subject.

```typescript
// PATCH em StageSubjectBinding (patch in-place):
// + stageWorkUnitIdentityHash: string;
// + stageExpansionManifestRef?: StageExpansionManifestRef; // ausente
//   quando mode=SINGLE/BASE; obrigatório quando mode=EXPANDABLE
```

Nova identidade lógica: `UNIQUE(runId, stageKey,
stageWorkUnitIdentityHash)` — substitui o `UNIQUE(runId, stageKey)`
antigo (`tenantId` continua implícito via `runId`, mesmo padrão já
usado neste tipo). O binding **não** duplica os eixos inteiros
(`creativeVariant`/`beat`/`publicationTarget`) dentro de si — o
manifest já é a autoridade; o binding carrega só `manifestRef` +
`stageWorkUnitIdentityHash` + o subject binding atual
(`subjectType`/`subjectId`/`sourceResultId` etc., inalterados). `Subject`
e `work unit` são conceitos diferentes e nunca se fundem:
`StageSubjectBinding` responde "qual artifact exato este trabalho
processa?"; `StageWorkUnitIdentity` responde "qual coordenada
semântica dentro deste stage está sendo executada?". Subjects
diferentes também podem existir entre siblings (ex.: `beat 1 →
PromptArtifact A`, `beat 2 → PromptArtifact B`) — o kernel não exige
que todos os siblings tenham o mesmo subject. A garantia forte já
existente (`sourceResultId`/`sourceResultHash` exatos, nunca "latest
result") **não muda**.

#### `StageExecution` e `LogicalJobIntent`

```typescript
// PATCH em StageExecution (patch in-place, hash continua STAGE_EXECUTION_V1):
// + stageWorkUnitIdentityHash: string; // BASE também tem hash, calculado
//   por STAGE_WORK_UNIT_IDENTITY_V1 — a unicidade sempre usa a mesma coluna
```

Cada `StageExecution` agora executa **uma work unit exata**, nunca "o
stage inteiro implicitamente". A invariante crítica muda de
`UNIQUE(tenantId, productionRunId, stageIterationId, stageKey)` para:

```text
UNIQUE(tenantId, productionRunId, stageIterationId, stageKey, stageWorkUnitIdentityHash)
```

Logo `same stage + different target` é permitido dentro da mesma
`StageIteration` — passam a ser **siblings planejados**, nunca
"reentrada ilegal". A regra "Proibida reentrada silenciosa" (acima, no
Ponto D) continua valendo, mas agora por work unit: se
`CONTINUE_CURRENT_ITERATION` aponta pra um `(stageKey,
stageWorkUnitIdentityHash)` que já possui `StageExecution` naquela
mesma iteração → `STAGE_ITERATION_STAGE_REENTRY_WITHOUT_REVISION`
(reaproveitado, mesmo código já existente — a violação é a mesma
categoria, só a chave de unicidade ficou mais fina).

`LogicalJobIntent` perde `variantKey: string` e o template antigo
`logicalJobKey = runId:stage:subjectType:subjectId:variantKey`. Novo
template: `logicalJobKey =
runId:stageKey:subjectType:subjectId:stageWorkUnitIdentityHash`
(`stage` renomeado pra `stageKey` no Ponto M1, depois deste ponto S5).
Pré-runtime — substituição direta, sem campo legado a preservar.

`variantKey` some do kernel em: `StageSubjectBinding`, `StageExecution`,
scheduling, identidade de transição. Skills 10/14/17/20 (ver "Migração
por Skill" abaixo) não codificam mais eixo nenhum em string —
`executionOrdinal`/`Attempt` continuam cronologia/retry técnico, nunca
identidade de work unit (`executionOrdinal 31 → beat2` é só ordem
cronológica global do Run, não numeração de beat).

#### Execução V1 é sequencial

Preservada a regra A já existente: **no máximo uma `StageExecution`
non-terminal ativa por `ProductionRun`**. Fan-out V1, portanto, é
sequencial (`beat1 → beat2 → beat3`, não paralelo), o que reduz o
risco operacional do V1 — `StageExpansionManifest` permite N work
units, mas não obriga N workers simultâneos (paralelismo é evolução
futura). Ordem determinística: `next work unit = menor
stageWorkUnitIdentityHash ainda não iniciado` (lexicográfica) — evita
depender de ordem de `SELECT`/array original/race. Trocar a ordem
operacional nunca altera o `stageExpansionManifestHash` (o set já é
canonically sorted); a regra lexicográfica é só scheduler
determinístico do V1, não semântica.

#### Barrier de stage (`EXPANDABLE`)

Um stage `EXPANDABLE` não termina só porque uma work unit terminou.

```text
STAGE COMPLETE somente quando TODAS as work units do exact
StageExpansionManifest estão resolvidas com sucesso E todos os
sibling transitionKeys concordam entre si.
```

`BLOCKED` numa work unit mantém o barrier fechado (não avança nem
falha). Qualquer work unit `FAILED` propaga a falha do
stage/Run conforme as regras já existentes — não existe "3 targets
deram certo, então stage sucesso" por default. Nenhuma unidade pode
ficar omitida silenciosamente: se um target legitimamente não exige
trabalho, o adapter ainda produz um outcome/resultado que resolve
aquela unit (no-op é sucesso explícito, não ausência). Divergência de
`transitionKey` entre siblings bem-sucedidos (ex.: Instagram →
`NEXT_STAGE`, TikTok → `SKIP_TO_PUBLISH` na mesma expansão) é
**contract violation** (`STAGE_EXPANSION_TRANSITION_CONFLICT`) — nunca
"o último executado decide".

Quando todos os work units resolvem com sucesso e `transitionKey`
uniforme, a Skill 01 materializa **uma única**
`StageTransitionResolution` no nível do stage (não N transições) —
não criamos um novo artifact agregador (`StageAggregateResult`) pra
isso:

```typescript
// PATCH em StageTransitionResolution (patch in-place, hash continua
// STAGE_TRANSITION_RESOLUTION_V1): pra stages EXPANDABLE, a resolução
// stage-level referencia o conjunto de sources, não uma única execução:
// + sourceStageExecutionIds?: string[];   // presente quando EXPANDABLE
// + stageExpansionManifestRef?: StageExpansionManifestRef; // idem
// sourceStageExecutionId/Hash (já existentes) continuam usados como
// hoje para stages SINGLE — nunca os dois simultaneamente.
```

A resolução prova: "este transition foi calculado depois da conclusão
deste conjunto exato de work units." Correção/`START_NEXT_ITERATION`
pode short-circuitar: quando uma work unit aciona legitimamente
`START_NEXT_ITERATION`, a `StageIteration` atual encerra
semanticamente e as work units ainda não iniciadas daquele manifest
**não são executadas** — nunca marcadas como sucesso; ficam
historicamente como "planned but not executed because iteration was
superseded" (reaproveitar status de superseded/abandoned já existente
no corpus, se houver — nunca inventar `SUCCEEDED`). A nova iteration
reenumera usando seus próprios immutable inputs e materializa outro
`StageExpansionManifest` — mesmo que as work units resultantes sejam
idênticas às da iteration anterior, é um novo manifest (ligado à nova
`stageIterationId`), nunca reaberto o antigo. Proibido: `StageExecution`
de `Iteration N` sendo carregada pra `Iteration N+1`.

#### `enumerateStageWorkUnits` — protocolo do adapter

```typescript
interface StageWorkUnitEnumerator {
  enumerateStageWorkUnits(context: unknown): {
    expansionSourceRefs: KernelArtifactRef[];
    workUnits: StageWorkUnitIdentity[];
  }; // retorno efêmero, sem hash próprio
}
```

Puro em relação aos immutable inputs — nunca side effect (`post`/
`publish`/`generate`/`send`), nunca consulta estado mutável de
provider. Skill 01 valida e materializa o manifest a partir do
retorno. Replay não chama o enumerator de novo — manifest já existe →
skip enumeration (mesma disciplina S14).

#### Migração por Skill (nenhuma redesenha conteúdo, só identidade)

- **Skill 10**: toda regra onde `variantKey = "beat:n"` vira
  `StageWorkUnitIdentity{ kind:'DIMENSIONAL', beat: { scriptResultRef,
  beatIndex: n } }` (mesmo `beatIndex` 0-based já usado por
  `VideoGenerationIntent`/`VideoPromptArtifact`). Se a geração de prompt também estiver dentro de
  experimento, `creativeVariant` entra junto — nunca concatenado numa
  string.
- **Skill 20**: `compact(experimentVariantIdentityHash)` como
  `variantKey` deixa de ser scheduler identity — passa a ser
  `creativeVariant.valueIdentityHash = experimentVariantIdentityHash`
  (hash real da Skill 20 reaproveitado, nenhum novo experiment-variant
  hash). O planning/avaliação de experimento continua podendo ser
  `STANDALONE` (Ponto C) — `StageWorkUnitIdentity` só entra quando a
  variante está sendo produzida dentro de um `ProductionRun`.
- **Skills 14/17**: deixam de codificar target numa string; passam a
  usar `publicationTarget: { sourceArtifactRef: exact artifact que
  define o target; valueIdentityHash: exact target identity hash }`.
  Reaproveitar hash de target já existente nessas Skills
  (`targetIdentityHash`/`publicationTargetHash`/
  `integrationTargetHash` — grep antes de inventar
  `PUBLICATION_TARGET_IDENTITY_V1`).

Nenhuma Skill consumidora redeclara `StageWorkUnitIdentity`/
`StageExpansionManifest` — só referencia (owner é a Skill 01).

#### O que NÃO fazer

Não formalizar uma gramática pra `variantKey`
(`creative=<x>;beat=<y>;target=<z>` ou JSON dentro de string) — isso
cristalizaria o erro em vez de corrigi-lo. Não inferir cross-product
automaticamente. Não usar `executionOrdinal`/`Attempt`/nome de
target/username/channel label como work-unit identity. Não permitir
append dinâmico ao manifest. Não avançar stage após o primeiro
sibling. Não usar "last sibling transition wins".

#### Relação com S6 e S7

S5 resolve **só** "quantas unidades semânticas existem e como
identificá-las corretamente" — não decide se o V1 vai suportar
múltiplos beats formando um vídeo final montado (isso é S6) nem onde
essas execuções realmente rodam (isso é S7). `support in identity
model ≠ V1 production capability enabled`: mesmo que S6 decida "V1 = 1
beat por vídeo final", o kernel já fica preparado pro futuro sem
`variantKey`, evitando refazer o kernel depois do S6.
`StageExpansionManifest` é kernel metadata/artifact — não tem
`Attempt`/`RetryPolicy`/`QuotaOperation` próprios; Jobs continuam
surgindo por work unit/`StageExecution`. Quota (Ponto E/S23) continua
por Attempt/operação — N work units podem gerar N operações
autorizadas separadamente, sem quota única implícita só por
pertencerem ao mesmo manifest. Credential handle (S15) idem — cada
execução externa resolve sua própria credencial; o manifest nunca
contém secrets/handles.

#### `FATAL_ERROR` novos (4) — grep prévio, resto reaproveitado

```text
STAGE_WORK_UNIT_IDENTITY_INVALID
  → DIMENSIONAL vazio, subvalor/beat inexistente no parent, ou axis
    fora do allowedAxes do stage

STAGE_EXPANSION_MANIFEST_REPLAY_CONFLICT
  → mesma identidade lógica de manifest, work unit set divergente

STAGE_WORK_UNIT_NOT_IN_MANIFEST
  → StageSubjectBinding/StageExecution referencia
    stageWorkUnitIdentityHash ausente do manifest exato, ou subject
    não corresponde à entrada do manifest

STAGE_EXPANSION_TRANSITION_CONFLICT
  → sibling work units bem-sucedidos com transitionKey divergente
```

`STAGE_ITERATION_STAGE_REENTRY_WITHOUT_REVISION` (já existente, Ponto
D) é reaproveitado para work unit duplicada na mesma iteração — mesma
categoria de violação, chave de unicidade só ficou mais fina. **O que
NÃO é erro**: manifest com 1 work unit; dois work units com mesmo
`subjectRef`; dois work units com mesmo beat e targets diferentes —
todos válidos.

#### Hashes

**2 novos:** `STAGE_WORK_UNIT_IDENTITY_V1`, `STAGE_EXPANSION_MANIFEST_V1`.
**Patch in-place** (nomes não mudam, sem V2, pré-runtime):
`STAGE_KERNEL_CONTRACT_V1` (+`workUnitContract`), `STAGE_EXECUTION_V1`
(+`stageWorkUnitIdentityHash`), `STAGE_TRANSITION_RESOLUTION_V1`
(+`sourceStageExecutionIds?`/`stageExpansionManifestRef?`), e o hash
real de `StageSubjectBinding` se ele possuir um
(+`stageWorkUnitIdentityHash`/`stageExpansionManifestRef?`).
Possivelmente `SKILL_EXECUTION_ADAPTER_DESCRIPTOR_V1` se
`workUnitContract` acabar morando lá em vez do
`StageKernelContract` — decisão de implementação, não estrutural. Sem
hash próprio: `StageWorkUnitAxis`, `StageWorkUnitContract`,
`StageSubvalueIdentity`, `StageBeatIdentity`,
`StageExpansionManifestRef`.

#### Plano de testes — Ponto S5 (36 testes)

**Identidade (1-15):** (1) `BASE` possui hash determinístico. (2)
`DIMENSIONAL` vazio é inválido. (3) creative variant sozinho válido.
(4) beat sozinho válido. (5) publication target sozinho válido. (6)
combinação creative+beat válida. (7) combinação beat+target válida.
(8) combinação dos três válida. (9) mesmos eixos em ordem conceitual
diferente produzem mesmo hash. (10) `beatIndex` negativo rejeitado. (11)
beat inexistente no `ScriptResult` rejeitado. (12) variant hash
inexistente no parent rejeitado. (13) target hash inexistente no
parent rejeitado. (14) source cross-tenant rejeitado. (15) `SINGLE`
aceita `BASE`, rejeita `DIMENSIONAL`.

**Manifest (16-24):** (16) `EXPANDABLE` exige manifest. (17) manifest
aceita 1 work unit. (18) duplicate work-unit hash rejeitado. (19)
ordem do array não muda `stageExpansionManifestHash`. (20) source ref
diferente muda o hash. (21) `StageSubjectBinding` aceita mesmo subject
em targets diferentes. (22) `same stage`/work-unit na mesma iteration
duplica e é rejeitado. (23) `same stage` com work units diferentes na
mesma iteration é permitido. (24) mesma work unit em nova
`StageIteration` é permitido.

**Execução/barrier (25-36):** (25) Attempt retry não cria
`StageExecution` novo. (26) manifest existente não é reenumerado em
replay. (27) work unit fora do manifest rejeita. (28) `BLOCKED` mantém
barrier aberto. (29) qualquer `FAILED` impede sucesso agregado. (30)
todos successful + mesmo `transitionKey` liberam o stage. (31)
successful siblings com `transitionKey` divergente rejeitam. (32)
`START_NEXT_ITERATION` short-circuita siblings não iniciados. (33)
ordem de execução V1 é determinística. (34) Skill 10 não usa mais
`beat:n` como kernel identity. (35) kernel não contém `variantKey`.
(36) lint protege o kernel contra regressão pra `variantKey`.

#### Critério de fechamento do Ponto S5

```text
1.  variantKey deixa de ser scheduling identity no kernel.
2.  StageWorkUnitAxis é fechado em 3 eixos V1.
3.  StageWorkUnitIdentity estruturado existe.
4.  STAGE_WORK_UNIT_IDENTITY_V1 existe.
5.  SINGLE vs EXPANDABLE é formalizado.
6.  StageExpansionManifest existe.
7.  STAGE_EXPANSION_MANIFEST_V1 existe.
8.  manifest congela 1..N work units antes da execução.
9.  expansion usa exact immutable source refs.
10. manifest é imutável e replay-safe.
11. StageSubjectBinding cardinality inclui work-unit hash.
12. StageExecution cardinality inclui work-unit hash.
13. mesma stage pode ter vários siblings na mesma iteration.
14. mesma work unit não pode reentrar na mesma iteration.
15. one-active-StageExecution-per-Run V1 permanece.
16. barrier exige todos os siblings.
17. BLOCKED não fecha barrier.
18. FAILED não vira sucesso parcial.
19. sibling success transitionKeys precisam concordar.
20. correction pode short-circuitar e iniciar nova iteration.
21. Skill 10 troca beat:n por BEAT estruturado.
22. Skill 20 usa creativeVariant estruturado.
23. Skills 14/17 usam publicationTarget estruturado.
24. nenhum cross-product é inferido automaticamente.
25. nenhuma unidade fora do manifest pode executar.
26. nenhum "latest target/variant/beat" entra na resolução.
27. no máximo 2 hashes novos.
28. lint protege o kernel contra regressão pra variantKey.
29. contract lint termina PASS.

### Ponto S7 — runtime de execução (`EXECUTION_RUNTIME_V1`, reparo transversal pós-revisão Fable, 2026-09-18)

Contrato compartilhado completo em `contracts/EXECUTION-RUNTIME.md`.
Skill 01 **não vira scheduler físico**: continua dona apenas de
`ProductionRun`/`StageExecution`/transições de pipeline
(`advanceRun()`) — nunca process polling, thread management ou
orquestração de container. O reconciliador citado acima (Vercel Cron
chamando `advanceRun()` para Runs sem progresso, rota protegida por
`CRON_SECRET`) é `CONTROL_PLANE`: só dispara uma decisão de
orquestração síncrona e sem efeito colateral externo — nunca reclama
nem executa um `SkillJobHandler` diretamente. Toda execução de
`SkillJobHandler` (curta ou longa, de qualquer Skill que Skill01
orquestre) acontece exclusivamente em `VIDEO_MACHINE_WORKER_V1`
(`DURABLE_WORKER`), fora da Vercel — protocolo já descrito no Ponto B
da Skill02, aplicado pelo worker.

**0 `FATAL_ERROR` novos, 0 hashes novos, 0 artifacts novos** para
Skill01 neste ponto — puramente declarativo. Ver critério de
fechamento (29 itens) em `contracts/EXECUTION-RUNTIME.md`.
```
