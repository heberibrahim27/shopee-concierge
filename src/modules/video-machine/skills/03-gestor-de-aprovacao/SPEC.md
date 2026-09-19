# Skill 03 — Gestor de Aprovação

> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC, worker ou cron foi criado. Este arquivo só vira código depois
> da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-17 após debate ChatGPT ↔ Claude Code, com a
> interface Skill 01 ↔ Skill 03 congelada (ver `SPEC.md` da Skill 01,
> incluindo o refinamento de fan-out do `RunCancellationIntent` e a guarda
> de materialização tardia, ambos aplicados retroativamente às Skills 01 e
> 02 como refinamentos compatíveis de contrato compartilhado — sem reabrir
> 1/25 nem 2/25). Revisão final em 4 partes, todas **APROVADAS**.
> **Marcada como 3/25.**

## Garantia central

// PATCH (N8, kernel repair pós re-review GPT-6 Astra, 2026-09-19):
// "versão exata do artefato" antes dizia `subjectVersion` + `artifactHash`.
// subjectVersion nunca teve produtor canônico em nenhum gate (nem
// VIDEO_COMPLIANCE, o mais antigo) — nenhum artifact do corpus
// (VideoArtifact, PublicationPlan) tem campo de revisão de conteúdo, e o
// padrão corpus-wide de referência (KernelArtifactRef, Skill01) já resolve
// identidade exata só com artifactHash (schemaVersion ali é versão do
// contrato/schema, nunca do conteúdo). Removido — ver ExactApprovalSubject
// abaixo.
Toda aprovação é vinculada ao artifact exato por `subjectType` +
`subjectId` + `artifactHash`, nunca apenas por `subjectId`. Uma aprovação
nunca autoriza um artefato diferente daquele que foi revisado. No máximo
uma `ApprovalRequest` `PENDING` por
`tenantId`+`runId`+`approvalGateKey`. Nenhuma decisão tardia (stale) altera
a `ApprovalRequest` nem a `ProductionRun` retroativamente.

## Objetivo

Possuir o ciclo de vida completo de `ApprovalRequest` e `ApprovalDecision`
— desde consumir um `ApprovalRequestIntent` (outbox da Skill 01) até
produzir um `ApprovalResolvedEvent` (durável) que a Skill 01 consome para
decidir a próxima transição da Run. A Skill 03 aplica a `ApprovalPolicy`
(MANUAL/AUTO/HYBRID) e produz decisões idempotentes e auditáveis.

## Responsabilidades

- Consumir `ApprovalRequestIntent` **atomicamente**: revalidar o estado
  atual da Run → resolver `ApprovalPolicy` vigente para o
  `approvalGateKey` → `ensureApprovalRequest(...)` → marcar intent
  consumido — numa única transação.
- Gerenciar a máquina de estados de `ApprovalRequest` (ver "Estados"
  abaixo).
- Avaliar evidências conforme a `ApprovalPolicy` e produzir um
  `AutoEvaluationOutcome` (modo `AUTO`/`HYBRID`) — o avaliador de critérios
  nunca altera a `ApprovalRequest` diretamente; a Skill 03 media
  posteriormente qual `ApprovalDecision` (se houver) o outcome permite, ou
  escalona para revisão manual.
- Aplicar `ApprovalDecision` humana ou de política de forma idempotente e
  concorrente-segura (`expectedVersion`).
- Detectar e tratar `SUPERSEDED` (nova versão do artefato invalida a
  `ApprovalRequest` ativa), `EXPIRED` (prazo vencido) e `CANCELLED`
  (cancelamento da Run) — todas como resoluções de **lifecycle**, distintas
  de uma decisão (opinião de um ator).
- Consumir `RunCancellationIntent` com `consumerKey = "APPROVAL_MANAGER"`
  (fan-out — ver `SPEC.md` da Skill 01), de forma independente do consumo
  da Skill 02.
- Ao resolver (decisão ou lifecycle), persistir `ApprovalResolvedEvent`
  (outbox durável) na mesma transação que a transição da
  `ApprovalRequest`.

## Não é responsabilidade

- Avaliar qualidade técnica do vídeo/artefato — isso é do Auditor de Vídeo
  (Skill 12). A Skill 03 só decide se as evidências produzidas por ele
  satisfazem a `ApprovalPolicy`.
- Publicar qualquer conteúdo.
- Decidir o próximo stage do pipeline — isso é da Skill 01.
- Armazenar ou gerenciar secrets.
- Definir identidade, papéis ou RBAC de reviewers — isso é da Skill 22
  (Gestor de Conta/Tenant). **Mas** a Skill 03 não pode aceitar uma decisão
  humana sem autorização verificável — ela exige e valida evidência de
  autorização confiável fornecida pela camada de identidade/autorização
  (a pessoa existe, pertence ao `tenantId`, e sua capability autoriza
  decidir **esta** `ApprovalRequest` especificamente). Uma decisão humana
  sem autorização válida nunca é aplicada. Isso mantém a fronteira certa:
  Skill 22 define quem tem qual capability, Skill 03 exige e verifica essa
  evidência antes de aplicar qualquer `ApprovalDecision` humana.

## Quando é chamada

- Consumo de `ApprovalRequestIntent` e `RunCancellationIntent`
  (`consumerKey = "APPROVAL_MANAGER"`), mesmo tick/worker poll-based do
  MVP.
- Quando um reviewer humano submete uma `ApprovalDecision`.
- Quando o handler de avaliação automática (`AUTO`/`HYBRID`) roda contra
  evidências disponíveis.
- Reconciliação de `ApprovalRequest` `PENDING` vencidas
  (`sweepExpiredApprovals`).

## Quem pode chamar

- Skill 01, indiretamente via outbox (`ApprovalRequestIntent`,
  `RunCancellationIntent`).
- Reviewer humano autenticado, pertencente ao `tenantId` da Run
  (`ApprovalDecision` com `actorType = "HUMAN"`).
- O próprio processo interno da Skill 03, avaliando `ApprovalPolicy`
  (`ApprovalDecision` com `actorType = "POLICY"` — nunca aceito de chamada
  externa alegando ser "policy").
- Cron/scheduler de reconciliação (compartilhado com o da Skill 01/02 no
  MVP — sem cron dedicado ainda).

## Quais Skills ela pode chamar

Chama `Skill01.advanceRun(runId)` indiretamente: persiste
`ApprovalResolvedEvent` (outbox), um consumidor separado tenta chamar
`advanceRun()`. Não avalia o Auditor de Vídeo diretamente — consome as
evidências que ele já produziu via `evidenceRefs`, mantendo a separação
entre auditoria técnica ("o vídeo está fiel/correto?") e autorização de
negócio ("essas evidências satisfazem a política de aprovação?").

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
type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED";
// APPROVED | REJECTED | CHANGES_REQUESTED são DECISÕES (opinião de um ator).
// EXPIRED | SUPERSEDED | CANCELLED são resoluções de LIFECYCLE — nunca
// "opiniões" de um ator, apenas o contexto mudou.
// IN_REVIEW não é estado obrigatório no MVP — ver reviewStartedAt?/claimedBy?
// no ApprovalRequest, sem aumentar a máquina de estados.

type ApprovalMode = "MANUAL" | "AUTO" | "HYBRID";
// MANUAL — exige ApprovalDecision humana válida e autorizada.
// AUTO — executa avaliação conforme a ApprovalPolicy:
//   ELIGIBLE_FOR_AUTO_APPROVAL pode resultar em APPROVED;
//   HARD_CRITERIA_FAILED pode resultar em CHANGES_REQUESTED SOMENTE quando
//     autoChangesRequestedAllowed=true e a regra for determinística;
//   INSUFFICIENT_EVIDENCE e BORDERLINE nunca são convertidos
//     automaticamente em decisão final;
//   POLICY_EVALUATION_ERROR nunca aprova;
//   o tratamento dos outcomes não decisivos segue os campos on* da policy.
// HYBRID — mesma avaliação automática de AUTO, mas outcomes não decisivos
//   (INSUFFICIENT_EVIDENCE, BORDERLINE, e HARD_CRITERIA_FAILED quando não
//   há regra determinística autorizada) escalam para humano em vez de
//   ficar parados — nunca rejeita automaticamente.
// Em ambos os casos, o AVALIADOR só informa o AutoEvaluationOutcome
// (AutoEvaluationOutcome != ApprovalDecision); é a Skill 03 quem consulta
// a policy depois e decide se aquele outcome autoriza decisão automática,
// exige humano, ou bloqueia operacionalmente.

type ApprovalModeResolution =
  | "POLICY" // mode efetivo = ApprovalPolicy.mode, sem override
  | "POLICY_GATE_RESTRICTION" // policy permitiria AUTO/HYBRID, mas
                                // autoApprovalProhibitedGateKeys restringiu
  | "GLOBAL_SAFETY_OVERRIDE"; // FIRST_REAL_PUBLISH (ou trava global
                                // equivalente) forçou MANUAL independente
                                // da policy — ver PublishingSafetyGate

type AutoEvaluationOutcome =
  | "ELIGIBLE_FOR_AUTO_APPROVAL"
  | "HARD_CRITERIA_FAILED"
  | "INSUFFICIENT_EVIDENCE"
  | "BORDERLINE"
  | "POLICY_EVALUATION_ERROR";
// Avaliação INTERMEDIÁRIA, separada da decisão final — nunca vira
// ApprovalDecision diretamente sem passar pelas regras onX da
// ApprovalPolicy (ver "Fluxo AUTO/HYBRID" abaixo).

type ApprovalRequestIntent = {
  intentId: string;
  payloadHash: string; // hash da representação canônica dos campos
                         // semanticamente relevantes — mesmo intentId +
                         // payloadHash diferente = INTENT_ID_CONFLICT
                         // (mesmo padrão do payloadHash em LogicalJobIntent,
                         // Skill 01/02)
  tenantId: string;
  runId: string;
  stageKey: StageKey; // PATCH (achado N6 da re-review GPT-6 Astra,
    // 2026-09-19) — antes "stage: PipelineStage"; PipelineStage foi
    // renomeado/removido no Ponto M1 (virou StageKey, ver SPEC.md da
    // Skill 01), mas este consumer nunca foi migrado. Contrato
    // compartilhado, ver SPEC.md da Skill 01.

  approvalGateKey: ApprovalGateKey; // PATCH (R3, kernel repair pós
    // re-review GPT-6 Astra, 2026-09-19) — antes `string` solto; o
    // arquivo já possui um closed enum V1 (ver "Gates V1 e subject
    // exato por gate" abaixo), não fazia sentido o intent continuar
    // não tipado. Identifica o ponto lógico de aprovação dentro da Run.

  subjectType: string;
  subjectId: string;
  artifactHash: string; // identifica exatamente o artefato sendo aprovado —
    // PATCH (N8, 2026-09-19): subjectVersion removido; ver
    // ExactApprovalSubject (nota no início do arquivo)

  approvalPolicyKey?: string; // Skill 01 só diz "preciso de aprovação conforme policy X";
                               // a Skill 03 é quem resolve e congela a versão usada

  createdAt: string;
  // sem consumedAt: ApprovalRequestIntent é evento/mensagem de domínio
  // imutável. A entrega segue a infraestrutura compartilhada —
  // OutboxConsumerDelivery(eventId=intentId, consumerKey="APPROVAL_MANAGER")
  // — separada da guarda de materialização tardia (que decide se o intent
  // ainda pode criar ApprovalRequest quando for efetivamente consumido).
  // O consumer pode marcar a entrega DELIVERED mesmo quando o intent foi
  // suprimido por Run já terminal — o AuditEvent registra a não-materialização.
};

type ApprovalPolicy = {
  policyId: string;
  policyKey: string; // ex.: "video-publish-default"
  policyVersion: string;
  tenantId: string;

  mode: ApprovalMode;

  autoApproveAllowed: boolean;
  autoChangesRequestedAllowed: boolean;

  requiredEvidence: string[];
  hardRequirements: unknown; // formato concreto varia por policyKey
  autoApproveCriteria: unknown; // ex.: score >= autoApproveThreshold AND
                                  // todos hardRequirements = true AND
                                  // nenhuma forbiddenCondition = true AND
                                  // evidenceCompleteness >= requiredEvidenceThreshold
                                  // margem de segurança é parâmetro explícito
                                  // aqui, nunca heurística escondida no handler

  onHardCriteriaFailure: "CHANGES_REQUESTED" | "ESCALATE_TO_MANUAL";
  // PATCH (Ponto M1, reparo transversal pós-revisão Fable, 2026-09-18,
  // CONTRACT_CONVENTIONS_V1): "onInsufficientEvidence" removido — era
  // union com um único literal possível ("ESCALATE_TO_MANUAL"), uma
  // pseudo-configuração fantasiada de opção. O comportamento vira
  // invariante normativo V1, já documentado abaixo ("INSUFFICIENT_EVIDENCE
  // → sempre escalona para humano"): evidência insuficiente nunca
  // reprova/pede mudança, e nunca auto-aprova. Não é override de hard
  // requirement — VIOLATED e INSUFFICIENT_EVIDENCE continuam distintos.
  onBorderline: "ESCALATE_TO_MANUAL";
  onEvaluationError: "ESCALATE_TO_MANUAL" | "BLOCK";

  manualFallbackAllowed: boolean;

  expiresAfterSeconds?: number;

  autoApprovalProhibitedGateKeys?: string[]; // ex.: FIRST_REAL_PUBLISH sempre
                                               // força MANUAL, independente do
                                               // mode configurado aqui — o que
                                               // se proíbe é a AUTOMAÇÃO da
                                               // aprovação, não a existência do gate

  createdAt: string;
};
// ApprovalPolicy(policyId, policyVersion) é IMUTÁVEL depois de publicada —
// SEM campo `active` aqui, para não contradizer a imutabilidade (se
// active pudesse virar false, a mesma versão deixaria de ser imutável).
// Qual policyVersion está em vigor para um tenantKey é um registro
// SEPARADO:
//
// type ApprovalPolicyBinding = {
//   tenantId: string;
//   policyKey: string;
//   activePolicyId: string;
//   activePolicyVersion: string;
//   updatedAt: string;
// };
//
// Assim: ApprovalPolicy v3 nunca muda; tenant+policyKey aponta hoje para
// v3 e amanhã pode apontar para v4; uma ApprovalRequest antiga continua
// provando que usou v3, mesmo depois do binding mudar.
//
// Mudança de threshold/regra → nova policyVersion. A ApprovalRequest guarda
// policyId + policyVersion + policySnapshotHash para provar depois
// exatamente qual regra decidiu aquela aprovação.

type ApprovalRequest = {
  id: string;
  sourceIntentId: string; // intentId do ApprovalRequestIntent que originou —
                            // mesmo intentId redelivered sempre resolve pra
                            // esta mesma ApprovalRequest (idempotência real)
  tenantId: string;
  runId: string;
  stageKey: StageKey; // PATCH (achado N6 da re-review GPT-6 Astra,
    // 2026-09-19) — antes "stage: PipelineStage" (ver nota em
    // ApprovalRequestIntent acima)
  approvalGateKey: ApprovalGateKey; // Ponto S4 — antes string solta

  subjectType: string;
  subjectId: string;
  artifactHash: string; // PATCH (N8): subjectVersion removido — ver
    // ExactApprovalSubject

  status: ApprovalStatus;
  mode: ApprovalMode; // modo EFETIVO — já considera override de autoApprovalProhibitedGateKeys
  modeResolution: ApprovalModeResolution; // POR QUE mode ficou nesse valor — auditoria
  modeOverrideReason?: string;

  policyId: string;
  policyVersion: string;
  policySnapshotHash: string; // hash de serialização CANÔNICA do snapshot
                                // efetivamente usado, incluindo todos os
                                // campos que podem alterar o comportamento
                                // da request

  expiresAt?: string; // calculado no nascimento a partir de
                        // ApprovalPolicy.expiresAfterSeconds — snapshot,
                        // nunca recalculado se a policy mudar depois

  reviewStartedAt?: string;
  claimedBy?: string; // metadados OPERACIONAIS apenas — claimedBy não
                        // concede autorização; toda decisão ainda exige
                        // evidência de autorização própria (ver Segurança)

  // PATCH (N8): decisionBlockedReason/decisionBlockedAt REMOVIDOS — a
  // única causa (SUBJECT_VERSION_CONFLICT) deixou de existir. O caso que
  // esse campo tentava proteger ("mesmo sourceIntentId, artifactHash
  // diferente") já é rejeitado antes de qualquer ApprovalRequest existir,
  // via INTENT_ID_CONFLICT no consumo do intent (payloadHash muda quando
  // artifactHash muda) — nunca precisou bloquear uma request PENDING já
  // materializada. Manter um campo com um único valor literal possível
  // seria a mesma pseudo-configuração fantasiada já banida no corpus
  // (Ponto M1, "onInsufficientEvidence").

  version: number; // optimistic concurrency

  createdAt: string;
  updatedAt: string;
};
// UNIQUE lógico: no máximo uma ApprovalRequest com status = PENDING por
// tenantId + runId + approvalGateKey (ver invariante abaixo).

type ApprovalDecision = {
  decisionId: string; // chave de idempotência
  approvalRequestId: string;
  approvalRequestVersion: number; // versão PENDING contra a qual a decisão
                                    // venceu o optimistic concurrency check
                                    // (ApprovalRequest.version avança depois
                                    // da transação) — entra no payload usado
                                    // pela idempotência de decisionId

  tenantId: string;
  runId: string;

  subjectType: string;
  subjectId: string;
  artifactHash: string; // decisão amarrada ao HASH exato — PATCH (N8):
    // subjectVersion removido, ver ExactApprovalSubject

  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

  actorType: "HUMAN" | "POLICY";
  // actorType=HUMAN: actorId E authorizationEvidenceRef obrigatórios.
  // actorType=POLICY: actorId ausente; policyId E policyVersion obrigatórios.
  actorId?: string; // reviewerId quando HUMAN; tenant-scoped, nunca de payload não autenticado
  authorizationEvidenceRef?: string; // prova de QUE ESTE humano tinha direito
                                       // de decidir ESTA request — cadeia de
                                       // confiança separada de evidenceRefs
                                       // (que prova a qualidade do artefato)

  policyId?: string;
  policyVersion?: string;
  autoEvaluationRef?: string; // qual avaliação automática sustentou a decisão POLICY
  autoEvaluationOutcome?: AutoEvaluationOutcome;
  // invariantes:
  // POLICY + APPROVED          → autoEvaluationOutcome = ELIGIBLE_FOR_AUTO_APPROVAL
  // POLICY + CHANGES_REQUESTED → autoEvaluationOutcome = HARD_CRITERIA_FAILED
  //                              E autoChangesRequestedAllowed=true na policy
  //                              E regra determinística/remediável aplicável
  // POLICY + REJECTED          → inválido por contrato (nunca ocorre)

  evidenceRefs: string[]; // evidência técnica do artefato ("por que passou/falhou")

  approvalEvidenceBundleRef: ApprovalEvidenceBundleRef; // Ponto S4 —
    // obrigatório mesmo sem evidence requirement (aponta pro bundle
    // possivelmente vazio); distinto de authorizationEvidenceRef acima
    // (Ponto S1 — autoridade do ator, nunca confundido com evidência
    // sobre o subject)

  reason?: string;
  decidedAt: string;
};
// Idempotência: mesmo decisionId + mesmo payload completo → idempotente;
// mesmo decisionId + qualquer campo relevante diferente → DECISION_ID_CONFLICT.
// As restrições condicionais acima (HUMAN vs POLICY) são parte do contrato,
// não apenas convenção de código.
// ApprovalDecision é IMUTÁVEL uma vez criada.
// POLICY (actorType = "POLICY") pode produzir:
//   - APPROVED
//   - CHANGES_REQUESTED, só quando explicitamente permitido pela policy e
//     baseado em hard criteria determinístico
// POLICY NUNCA produz REJECTED — REJECTED exige ator humano nesta primeira
// arquitetura (decisão grave demais para deixar 100% automática).

type ApprovalResolvedEvent = {
  eventId: string;
  eventType: "APPROVAL_RESOLVED";
  tenantId: string;
  runId: string;

  approvalRequestId: string;
  approvalGateKey: ApprovalGateKey; // Ponto S4

  subjectType: string;
  subjectId: string;
  artifactHash: string; // PATCH (N8): subjectVersion removido, ver
    // ExactApprovalSubject

  resolutionType: "DECISION" | "LIFECYCLE";
  outcome:
    | "APPROVED"
    | "REJECTED"
    | "CHANGES_REQUESTED"
    | "EXPIRED"
    | "SUPERSEDED"
    | "CANCELLED";

  decisionId?: string; // obrigatório para APPROVED|REJECTED|CHANGES_REQUESTED
                         // (resolutionType=DECISION); ausente para
                         // EXPIRED|SUPERSEDED|CANCELLED (resolutionType=LIFECYCLE)

  approvalRequestVersion: number; // versão RESULTANTE da transição — igual ao
                                    // padrão já usado no jobVersion do
                                    // JobBlockedEvent da Skill 02

  createdAt: string;
  // PATCH (Ponto S13, reparo transversal pós-revisão Fable, 2026-09-18):
  // LEGACY / NON-AUTHORITATIVE — achado real encontrado pela ferramenta
  // de lint durante a aplicação do S13 (não estava no texto original do
  // Fable, mas é exatamente o mesmo padrão de bug). A entrega real deste
  // evento já é OutboxConsumerDelivery(consumerKey = ORCHESTRATOR), ver
  // "Redelivery / dead-letter dos outboxes" acima — este campo nunca
  // decide entrega/reentrega/consumo.
  consumedAt?: string;
};

// funções (assinaturas do contrato, não implementação):
// ensureApprovalRequest(intent: ApprovalRequestIntent) -> ApprovalRequest
//   ordem obrigatória (evita resolver ApprovalPolicyBinding, que é mutável,
//   fora da mesma unidade lógica de materialização):
//     1. revalida estado da Run (guarda de materialização tardia)
//     2. verifica request existente por sourceIntentId (idempotência de
//        redelivery — NÃO re-resolve policy se já existe)
//     3. só se for realmente criar uma request nova:
//          resolve ApprovalPolicyBinding vigente
//          carrega a policyVersion imutável referenciada
//          calcula snapshot + policySnapshotHash
//          cria ApprovalRequest
//     4. commit
// evaluateAuto(request: ApprovalRequest, evidence) -> AutoEvaluationOutcome
// applyDecision(requestId, expectedVersion, decision: ApprovalDecision)
//   -> aceito | DECISION_ID_CONFLICT | STALE_DECISION | ALREADY_RESOLVED
//      | REQUEST_EXPIRED
//   valida approvalGateKey + subjectType + subjectId + artifactHash
//   exatos contra a ApprovalRequest (PATCH N8 — antes citava subjectVersion)
// consumeRunCancellationIntent(intent, consumerKey: "APPROVAL_MANAGER") -> void
// sweepExpiredApprovals() -> void
```

## Estados

`PENDING → (APPROVED | REJECTED | CHANGES_REQUESTED | EXPIRED | SUPERSEDED
| CANCELLED)`.

Isso descreve as **transições válidas** do MVP — não significa que toda
`ApprovalRequest` possa necessariamente alcançar qualquer terminal. Por
exemplo, `REJECTED` só ocorre por decisão humana válida (`POLICY` nunca
produz `REJECTED` — ver "Contratos" acima).

Uma vez resolvida (qualquer estado terminal acima), a `ApprovalRequest`
**nunca volta para `PENDING`** — é imutável. Se ainda for necessária
aprovação, nasce uma **nova** `ApprovalRequest` com novo
`approvalRequestId`.

- `SUPERSEDED`: surgiu nova versão do mesmo `subject` para o mesmo
  `approvalGateKey` antes da decisão. A request antiga perde validade
  atomicamente.
- `CANCELLED`: a Run/processo foi cancelado; não existe mais autorização a
  conceder. Diferente de `SUPERSEDED` — aqui não há nova versão esperada.
- `EXPIRED`: prazo (`expiresAt`) vencido sem decisão. **Nunca** implica
  `APPROVED` nem `REJECTED`.

## Idempotência

// PATCH (N8, 2026-09-19): removida a regra "mesmo subjectVersion+artifactHash
// → idempotente" e todo o mecanismo SUBJECT_VERSION_CONFLICT/
// decisionBlockedReason — a premissa (subjectVersion como label do
// produtor) nunca existiu de fato (ver achado N8, nenhum produtor jamais
// definiu esse campo). A proteção que esse mecanismo tentava dar —
// "mesma identidade de intent não pode mudar de conteúdo por baixo" — já
// é coberta pelo INTENT_ID_CONFLICT abaixo, sem precisar bloquear uma
// ApprovalRequest já materializada.

ExactApprovalSubject = `subjectType` + `subjectId` + `artifactHash`.
Mesmo `subjectType`+`subjectId`+`artifactHash` → mesmo subject semântico
para aprovação; mesmo `subjectType`+`subjectId` com `artifactHash`
diferente → conteúdo diferente, aprovação anterior não satisfaz.

A idempotência real de `ensureApprovalRequest` é por **`sourceIntentId`**:

```
mesmo intentId + mesmo payloadHash (redelivery do outbox)
  → sempre resolve para a MESMA ApprovalRequest, sem re-resolver policy

mesmo intentId + payloadHash DIFERENTE
  → INTENT_ID_CONFLICT (mesma classe de erro do payloadHash em
    LogicalJobIntent — nunca reuso silencioso). Cobre também o caso
    "mesmo sourceIntentId, artifactHash diferente" — payloadHash inclui
    artifactHash na sua projeção, então um artifactHash diferente pro
    mesmo intentId já muda o payloadHash. Nenhum código novo necessário
    (achado N8).

intentId novo + mesmo ExactApprovalSubject + existe PENDING
  → não cria segunda PENDING; coalesce/idempotência lógica

intentId novo + mesmo ExactApprovalSubject + request anterior terminal
  → pode criar nova ApprovalRequest quando a Skill 01 deliberadamente
    reemite o gate (ex.: após EXPIRED)

intentId novo + ExactApprovalSubject com artifactHash diferente
  enquanto existe PENDING
  → fluxo de SUPERSEDED (é uma nova intenção legítima sobre uma nova
    versão semântica do artifact — exige nova aprovação)
```

Idempotência de `ApprovalDecision`, via `decisionId`:

```
mesmo decisionId + mesmo payload           → idempotente
mesmo decisionId + payload diferente        → DECISION_ID_CONFLICT
decisionId novo pra request já resolvida    → ALREADY_RESOLVED / STALE_DECISION
ApprovalRequest.version != expectedVersion  → STALE_DECISION
```

Não existe brecha para duas decisões concorrentes diferentes sobre a mesma
request — sempre `expectedVersion` (optimistic concurrency), nunca
last-write-wins.

## Guarda de materialização tardia

Invariante compartilhada com a Skill 01 e a Skill 02 (aplicada
retroativamente aos `SPEC.md` de ambas): um `ApprovalRequestIntent` pode
ter sido emitido antes da Run entrar em `CANCEL_REQUESTED`/`CANCELLED`/
`SUCCEEDED`/`FAILED`, mas só ser consumido depois. A checagem "a Run aceita
trabalho novo?" acontece **no momento da materialização** (dentro da
transação de `ensureApprovalRequest()`), não apenas quando a Skill 01
emitiu o intent:

```
consume ApprovalRequestIntent
  → revalida tenantId + estado atual da Run
  → se Run não aceita mais trabalho novo:
      NÃO cria ApprovalRequest
      marca intent consumido/suprimido para este efeito
      AuditEvent da supressão
      ACK idempotente — nunca erro, nunca retry infinito
```

Isso permite que a condição de `CANCELLED` na Skill 01 ("nenhum `Job`
não-terminal E nenhuma `ApprovalRequest` não-terminal") seja suficiente,
sem esperar a entrega física de todo intent antigo.

## Concorrência

Toda mutação de `ApprovalRequest` (decisão, expiração, cancelamento,
supersede) usa `expectedVersion`. Quatro forças disputam a mesma
`ApprovalRequest.version` — aprovação humana, expiração, cancelamento,
supersede — e **só uma transição vence**; as demais revalidam e retornam
`STALE_DECISION`/`ALREADY_RESOLVED`. Nunca last-write-wins.

`expiresAt` **não é verificado só pelo reconciliador**. Toda tentativa de
decisão valida o prazo dentro da mesma operação concorrente, com ordem
estrita — idempotência por `decisionId` é checada **antes** de
`expectedVersion`, porque um retry de rede de uma decisão que já venceu a
concorrência não é stale, é a mesma operação já concluída:

```
applyDecision(requestId, expectedVersion, decision)

1. resolve tenant/contexto confiável

2. procura decisionId já existente:
     mesmo decisionId + mesmo payload completo
       → retorna o resultado já aplicado (idempotência bem-sucedida —
         NÃO exige que expectedVersion ainda seja atual)
     mesmo decisionId + payload diferente
       → DECISION_ID_CONFLICT

3. carrega ApprovalRequest pelo tenantId + requestId

4. valida que ainda está PENDING;
   se já terminal → STALE_DECISION / ALREADY_RESOLVED

5. valida identidade exata: approvalRequestId, tenantId, runId,
   subjectType, subjectId, artifactHash (PATCH N8 — antes citava
   subjectVersion)

6. valida: decision.approvalRequestVersion == expectedVersion
           == ApprovalRequest.version

7. valida ator: HUMAN → actorId + authorizationEvidenceRef válidos;
   POLICY → policyId/policyVersion + AutoEvaluationOutcome válidos;
   POLICY nunca REJECTED

8. dentro da MESMA operação concorrente, se now >= expiresAt:
     PENDING → EXPIRED (atômico)
     incrementa version
     cria ApprovalResolvedEvent(LIFECYCLE, EXPIRED)
     AuditEvent
     commit
     NÃO persiste a ApprovalDecision proposta
     retorna REQUEST_EXPIRED

9. aplica a decisão:
     persiste ApprovalDecision imutável
     PENDING → APPROVED | REJECTED | CHANGES_REQUESTED
     incrementa ApprovalRequest.version
     cria ApprovalResolvedEvent(DECISION)
     AuditEvent
     tudo na mesma transação
```

**Invariante**: `ApprovalDecision` só existe para uma decisão que
efetivamente venceu a concorrência e mudou `PENDING` para um terminal de
`DECISION`. Tentativas stale, expiradas, bloqueadas ou não autorizadas
nunca geram `ApprovalDecision`.

Isso fecha a corrida de uma aprovação chegar poucos segundos depois do
vencimento só porque o cron/reconciliador ainda não rodou. O
reconciliador (`sweepExpiredApprovals`) existe apenas para limpar requests
vencidas que ninguém tentou decidir.

## Fluxo AUTO/HYBRID

```
AUTO evaluation → AutoEvaluationOutcome

ELIGIBLE_FOR_AUTO_APPROVAL
  → pode gerar ApprovalDecision(APPROVED, actorType=POLICY) se a policy permitir

HARD_CRITERIA_FAILED
  → pode gerar ApprovalDecision(CHANGES_REQUESTED, actorType=POLICY)
    SOMENTE se onHardCriteriaFailure = CHANGES_REQUESTED
    (regra determinística/remediável) — senão ESCALATE_TO_MANUAL

INSUFFICIENT_EVIDENCE
  → NUNCA reprova nem pede mudança automaticamente
  → sempre ESCALATE_TO_MANUAL
    (evita: auditor não conseguiu medir algo → sistema interpreta como
    falha → manda corrigir um vídeo que talvez esteja bom)

BORDERLINE
  → sempre ESCALATE_TO_MANUAL

POLICY_EVALUATION_ERROR
  → não aprova
  → ESCALATE_TO_MANUAL ou BLOCK, conforme onEvaluationError
```

**PATCH (Ponto S4).** `AutoEvaluationOutcome` continua a avaliação
INTERMEDIÁRIA que este fluxo consome — o que muda é que agora ela é
alimentada por um `ApprovalEvidenceEvaluationOutcome` normativo, não
mais por `evidenceRefs`/`hardRequirements` de formato `unknown`:
`ApprovalEvidenceEvaluationOutcome.SATISFIED` (+ `autoApproveCriteria`
satisfeito) → `ELIGIBLE_FOR_AUTO_APPROVAL`;
`ApprovalEvidenceEvaluationOutcome.VIOLATED` → `HARD_CRITERIA_FAILED`;
`ApprovalEvidenceEvaluationOutcome.INSUFFICIENT_EVIDENCE` →
`INSUFFICIENT_EVIDENCE`. `BORDERLINE`/`POLICY_EVALUATION_ERROR`
continuam conceitos operacionais separados (score/erro de avaliação),
fora do escopo do S4.

`HYBRID` roda a avaliação `AUTO` primeiro; qualquer resultado que não seja
`ELIGIBLE_FOR_AUTO_APPROVAL` (ou `HARD_CRITERIA_FAILED` com regra
determinística) escala para `MANUAL` — nunca rejeita automaticamente
("passar com folga" é intencionalmente evitado como conceito subjetivo; os
critérios são explícitos e versionados na `ApprovalPolicy`).

**`FIRST_REAL_PUBLISH` força `MANUAL`**: a trava não é escopada só por
`approvalGateKey` — é escopada por `tenantId` + `publicationTargetKey`
(o destino real: uma conta Instagram específica, perfil TikTok, board
etc.). Se um tenant conectar uma segunda conta Instagram, ela tem sua
própria proteção de primeiro publish, independente da primeira já
confirmada:

```
nenhum publish real confirmado ainda para tenantId + publicationTargetKey
  → GLOBAL_SAFETY_OVERRIDE
  → mode efetivo = MANUAL
  → autoApproveAllowed = false
```

**mesmo que a `ApprovalPolicy` configurada diga `AUTO`/`HYBRID`** — o
`PublishingSafetyGate` (já congelado no projeto, decisão D-012) prevalece.
Isso protege contra autoaprovação acidental da primeira publicação real
por canal/tenant, mesmo que o vídeo tenha passado em auditoria técnica.

**Invariante de marco**: o marco "primeiro publish real concluído" só muda
**depois** de confirmação durável de publicação bem-sucedida. Aprovação
manual, tentativa de publish, ou falha de publish **não removem** a
proteção. A Skill 17 (Publicador Multicanal, ainda não especificada) deve
**revalidar essa trava de novo** antes de publicar de fato — defesa em
profundidade: um bug/falha isolada na Skill 03 não pode sozinha
transformar o primeiro publish em automático.

## Criação de nova versão (SUPERSEDED)

```
chega ApprovalRequestIntent para mesma tenantId+runId+approvalGateKey,
mas com artifactHash novo (mesmo subjectType+subjectId — PATCH N8, antes
citava subjectVersion)

transação lógica:
  1. revalida estado da Run (guarda de materialização tardia)
  2. encontra ApprovalRequest PENDING anterior (se existir)
  3. anterior → SUPERSEDED, incrementa version
  4. cria ApprovalResolvedEvent(LIFECYCLE, SUPERSEDED) para a anterior
  5. resolve ApprovalPolicy vigente (pode ter mudado desde a anterior)
  6. cria nova ApprovalRequest com novo snapshot de policy
  7. AuditEvent(s)
  commit
```

Não existe janela em que a versão anterior e a nova estejam
simultaneamente aprováveis. Se não existe request ativa (ex.: a anterior já
foi resolvida como `CHANGES_REQUESTED` e consumida), a nova nasce
normalmente, sem supersede.

## Interface Skill 01 ↔ Skill 03

Consumo/produção de outbox segue o mesmo princípio da interface Skill
01↔02 (ver `SPEC.md` da Skill 01): a Skill 01 nunca chama a Skill 03
diretamente.

```
Skill 1 (Orquestrador)
  Run entra em stage com approvalGateKey exigido
    → transação atômica:
        ProductionRun.status = WAITING_APPROVAL
        insert AuditEvent
        insert ApprovalRequestIntent (outbox)

Skill 3 (Gestor de Aprovação)
  consome ApprovalRequestIntent
    → ensureApprovalRequest(...)   [idempotente, guarda de materialização tardia]
  ao resolver (decisão ou lifecycle):
    → insert ApprovalResolvedEvent (outbox, mesma transação da transição)
  consome RunCancellationIntent (consumerKey = "APPROVAL_MANAGER")
    → resolve TODAS as ApprovalRequest PENDING elegíveis daquela Run (pode
      haver mais de uma, em approvalGateKey diferentes) → cada uma vira
      CANCELLED + um ApprovalResolvedEvent próprio (cada evento identifica
      uma request específica)

Skill 1 consumindo ApprovalResolvedEvent (PATCH N8 — antes revalidava
subjectVersion; ver ExactApprovalSubject):
  → revalida ApprovalRequest atual (approvalRequestVersion)
  → revalida approvalGateKey + subjectType + subjectId + artifactHash
    exatos contra o artefato atual da Run
      (event.subjectType === current.subjectType
       && event.subjectId === current.subjectId
       && event.artifactHash === current.artifactHash)
  → revalida estado atual da ProductionRun
  → se qualquer um divergir: ACK como stale, não altera a Run
  → Run em CANCEL_REQUESTED|CANCELLED|SUCCEEDED|FAILED nunca é
    "ressuscitada" por aprovação tardia
  → caso contrário: advanceRun() decide a transição (nunca
    outcome → WAITING_APPROVAL diretamente; a Skill 01 continua dona da
    progressão da Run)
```

Consequência de cada `outcome` na Skill 01 (decidida dentro de
`advanceRun()`, não pelo evento isoladamente):

```
APPROVED
  → constitui EVIDÊNCIA VÁLIDA de aprovação para aquele gate/artefato,
    nada mais
  → Skill 01 chama advanceRun() só depois de todas as revalidações acima
  → é o advanceRun() quem decide SE e PARA QUAL estado/stage a Run sai
    de WAITING_APPROVAL — ApprovalResolvedEvent nunca altera a Run
    diretamente

CHANGES_REQUESTED
  → não autoriza avançar para o próximo stage
  → advanceRun() aplica o caminho de correção definido pelo pipeline
  → a correção deve produzir novo artifactHash (PATCH N8 — antes dizia
    subjectVersion/artifactHash)
  → quando esse novo artifactHash chegar de novo ao gate, gera novo
    ApprovalRequestIntent

REJECTED
  → Orquestrador aplica failurePolicy (ver StageDefinition, Skill 01)
  → NÃO implica FAILED automaticamente

EXPIRED
  → não aprova nem rejeita; Run continua sem autorização válida
  → política do Orquestrador decide: reemitir request, bloquear, ou
    exigir intervenção — mesmo espírito do failurePolicy do REJECTED

SUPERSEDED
  → nunca avança; Skill 01 espera a request da nova versão

CANCELLED
  → nunca autoriza progressão normal
  → Skill 01 reavalia as condições GLOBAIS de cancelamento — uma
    ApprovalRequest cancelada sozinha não "confirma" que a Run pode
    virar CANCELLED
  → ProductionRun só chega a CANCELLED quando TODAS as pré-condições já
    congeladas forem satisfeitas: nenhum Job não-terminal E nenhuma
    ApprovalRequest não-terminal
```

`ApprovalResolvedEvent` usa a mesma infraestrutura compartilhada de
entrega por consumidor:
`OutboxConsumerDelivery(eventId = ApprovalResolvedEvent.eventId,
consumerKey = "ORCHESTRATOR")`. É entregue **at-least-once**; redelivery
do mesmo `eventId` é absorvido por: `OutboxConsumerDelivery` por
consumidor + revalidação do estado durável (acima) + optimistic
concurrency/idempotência já existente na Skill 01. A entrega só é marcada
`DELIVERED` depois que o processamento idempotente pela Skill 01 concluir
com sucesso — isso importa porque alguns outcomes fazem o Orquestrador
emitir novo trabalho, não é só leitura.

`RunCancellationIntent` consumido pela Skill 03 usa
`consumerKey = "APPROVAL_MANAGER"` e `OutboxConsumerDelivery` (ver
`SPEC.md` da Skill 01) — entrega independente da Skill 02, redelivery do
mesmo `cancelIntentId` é idempotente (request já resolvida não é alterada
retroativamente).

## Segurança

Nenhum secret de provider passa pela Skill 03. `tenantId` presente em toda
`ApprovalRequest`/`ApprovalDecision`/`ApprovalPolicy`/evento, nunca aceito
de payload externo não autenticado. `ApprovalDecision` com
`actorType = "HUMAN"` exige `actorId` autenticado, pertencente ao
`tenantId` da Run, **com evidência verificável de que a capability desse
ator autoriza decidir especificamente esta `ApprovalRequest`** — RBAC
completo (identidade, papéis, concessão de capability) é responsabilidade
da Skill 22, mas a Skill 03 nunca aplica uma decisão humana sem essa
evidência de autorização.

`authorizationEvidenceRef` **nunca** aponta para token, cookie, JWT ou
credencial bruta — referencia uma **decisão de autorização durável e
auditável**, tomada pela camada confiável de identidade/autorização, algo
conceitualmente como `{ actorId, tenantId, capability: "APPROVE_CONTENT",
resource: approvalRequestId, decision: "ALLOW", evaluatedAt }`. A Skill 03
usa essa referência para validar a autorização, mas **não persiste**
bearer token, sessão ou secret — preserva a fronteira com a Skill 22 sem
transformar evidência de autorização em armazenamento de credenciais.

**PATCH (Ponto S1 — Resource-scoped Authorization).** Formalização do
parágrafo acima: `authorizationEvidenceRef` referencia uma
`TenantAuthorizationDecision` (Skill 22) cujo `authorizationScope` deve
ser `{ kind: 'EXACT_ARTIFACT', resourceRef: KernelArtifactRef }` com
`resourceRef` apontando exatamente pra esta `ApprovalRequest`
(`approvalRequestId` + hash). Uma `TenantAuthorizationDecision` com
`authorizationScope.kind = 'TENANT'` prova só "este ator pode aprovar
*algo* neste tenant" — nunca satisfaz a exigência desta `ApprovalDecision`
por si só; "autorizado a decidir" (autorização de acesso) também nunca se
confunde com "decisão resultou em aprovação" (o próprio `decision` acima)
— são dimensões independentes. Ver `TenantAuthorizationScope` em
`22-gestor-de-conta-tenant/SPEC.md`.

`actorType = "POLICY"` só pode ser gerado pelo próprio processo interno da
Skill 03 — isso é **regra estrutural, não só validação de campo**:
entradas externas/humanas nunca podem escolher `actorType = "POLICY"`; o
caminho interno de decisão automática é separado ou possui proveniência
confiável não controlável pelo caller externo; receber `actorType =
"POLICY"` vindo de payload externo é rejeitado, independentemente de
`policyId`/`policyVersion` fornecidos.

**Trava contra autoaprovação acidental do primeiro publish real**: ver
`FIRST_REAL_PUBLISH força MANUAL` acima — é uma regra de segurança, não só
de UX, porque a primeira publicação real por canal/tenant nunca pode ser
liberada só porque uma `ApprovalPolicy` mal configurada permitiu `AUTO`.

## Multi-tenant

`tenantId` obrigatório em `ApprovalRequest`, `ApprovalDecision`,
`ApprovalPolicy` e `ApprovalResolvedEvent`, herdado do contexto confiável
da Run/`ApprovalRequestIntent` — nunca aceito trocado depois de criado.
Mesmo invariante de isolamento da Skill 02 se aplica aqui: toda leitura,
escrita, transição de estado e evento deve ser escopado por `tenantId`;
nenhuma operação confia apenas em `runId`/`approvalRequestId` recebidos
externamente como fronteira de autorização.

## Reconciliação

`sweepExpiredApprovals()` — compartilha scheduler com o reconciliador das
Skills 01/02 no MVP (sem cron dedicado ainda). Existe apenas para limpar
`ApprovalRequest` `PENDING` vencidas que ninguém tentou decidir — a
checagem síncrona dentro de `applyDecision()` (ver Concorrência) já cobre
o caso comum. Obedece à mesma disciplina de concorrência:

```
para cada ApprovalRequest candidata:
  WHERE status = PENDING
    AND expiresAt IS NOT NULL
    AND expiresAt <= now
    AND version = expectedVersion   ← transição CONDICIONAL, nunca
                                       SELECT vencidas → UPDATE sem proteção
  → status = EXPIRED
  → version++
  → ApprovalResolvedEvent(resolutionType=LIFECYCLE, outcome=EXPIRED,
                           approvalRequestVersion=novaVersion)
  → AuditEvent (resolutionTrigger = EXPIRY_RECONCILER)
  → mesma transação
```

Se uma decisão, `SUPERSEDED` ou `CANCELLED` já venceu a corrida nesse
intervalo, o update afeta zero linhas — o reconciler trata como
stale/no-op, nunca sobrescreve a transição vencedora.

`AuditEvent` registra `resolutionTrigger`
(`APPLY_DECISION_EXPIRY_CHECK` | `EXPIRY_RECONCILER`) — informação
operacional/auditável que não entra no `ApprovalResolvedEvent`, já que o
resultado de domínio é idêntico nos dois caminhos: `PENDING` → `EXPIRED`,
sem `ApprovalDecision`.

## Redelivery / dead-letter dos outboxes

Uma única infraestrutura de entrega para os três outbox desta Skill —
`OutboxConsumerDelivery` (ver `SPEC.md` da Skill 01), mesmo quando hoje
existe apenas um consumidor. Não há dois mecanismos paralelos.

> **Ponto S13 do reparo transversal pós-revisão Fable (2026-09-18)**:
> esta Skill já descrevia corretamente o estado final desejado — o
> achado real do Fable era que Skills 01/02 ainda não cumpriam essa
> promessa (`LogicalJobIntent.consumedAt` e `OutboxDeliveryMeta`
> tratados como mecanismo alternativo válido pra single-consumer).
> Ambas patchadas para usar `OutboxConsumerDelivery` como única
> autoridade também em outbox single-consumer; `consumedAt` legado
> marcado `NON-AUTHORITATIVE`. Esta Skill não precisou de nenhuma
> mudança estrutural — só confirma o padrão.

```
ApprovalRequestIntent   → OutboxConsumerDelivery(consumerKey = APPROVAL_MANAGER)
ApprovalResolvedEvent   → OutboxConsumerDelivery(consumerKey = ORCHESTRATOR)
RunCancellationIntent   → OutboxConsumerDelivery(consumerKey = JOB_MANAGER | APPROVAL_MANAGER)
```

`OutboxDeliveryState` (`PENDING`/`DELIVERED`/`DEAD_LETTER`) continua como
enum compartilhado, mas os campos operacionais de entrega vivem só em
`OutboxConsumerDelivery`. Isso deixa as Skills 01/02/03 numa única
infraestrutura, já pronta para fan-out futuro sem migration conceitual.

Falha transitória → `PENDING` → backoff → tenta de novo; sucesso →
`DELIVERED`; falhas repetidas além da política → `DEAD_LETTER` →
`AuditEvent`/alerta operacional → não perde o evento → não altera
silenciosamente `ApprovalRequest`/`ProductionRun`. `DEAD_LETTER` pertence
ao registro de entrega, nunca ao evento de domínio — redrive é explícito,
auditado, preserva o `eventId`/`intentId` original, nunca cria efeito de
negócio novo. Dois casos precisam de tratamento explícito (mesmo cuidado
que a Skill 02 tem para não deixar falha de mensageria virar falha
fictícia do domínio):

```
ApprovalRequestIntent DEAD_LETTER (antes da materialização)
  → nenhuma ApprovalRequest artificial é criada
  → Run pode permanecer em WAITING_APPROVAL
  → alerta operacional; redrive preserva intentId

ApprovalResolvedEvent DEAD_LETTER
  → ApprovalRequest permanece no terminal real que já venceu
  → Run pode ainda não ter processado a resolução
  → NÃO desfazer nem repetir a decisão
  → alerta operacional; redrive preserva eventId
```

## Observabilidade

// PATCH (N8, 2026-09-19): SUBJECT_VERSION_CONFLICT/decisionBlockedReason
// removidos do log/métricas — mecanismo eliminado, ver Idempotência acima.

Log estruturado por transição de `ApprovalRequest`: `tenantId`, `runId`,
`approvalRequestId`, `approvalGateKey`, `subjectType`, `subjectId`,
`artifactHash`, `fromStatus`, `toStatus`, `actorType?`, `modeResolution?`,
`timestamp`. Campos de correlação adicionais quando aplicáveis (não
obrigatórios em todo log): `decisionId?`, `eventId?`, `sourceIntentId?`,
`policyId?`, `policyVersion?`, `errorCode?`/`conflictCode?`.

`AuditEvent` persistido para toda transição lógica (decisão e lifecycle),
incluindo supressão por guarda de materialização tardia. Tentativas
humanas **não autorizadas** também geram `AuditEvent` de
segurança/auditoria, mesmo sem transição de `ApprovalRequest` — não é
evento de mudança de estado, mas precisa ficar investigável.

Métricas: `ApprovalRequest` por status; idade média/p95 em `PENDING`;
taxa de `AUTO`/`HYBRID` que escala para `MANUAL` por `AutoEvaluationOutcome`;
taxa de `EXPIRED`; taxa de `SUPERSEDED` (indica retrabalho/correção
frequente); tempo médio até decisão humana; taxa de `DEAD_LETTER` por
outbox.

## Plano de testes

### Casos críticos (obrigatórios)

- Mesmo `intentId` + mesmo `payloadHash` (redelivery) → idempotente, mesma
  `ApprovalRequest`, sem re-resolver `ApprovalPolicyBinding`.
- Mesmo `intentId` + `payloadHash` diferente → `INTENT_ID_CONFLICT`.
- `intentId` novo + mesma identidade de artefato + `PENDING` existente →
  coalesce, não cria segunda `PENDING`.
- `intentId` novo + mesma identidade de artefato + request anterior
  terminal (reemissão deliberada pela Skill 01, ex. após `EXPIRED`) → cria
  nova `ApprovalRequest` com novo `approvalRequestId` e policy vigente.
- Mesmo `sourceIntentId`, `artifactHash` diferente na segunda entrega →
  `INTENT_ID_CONFLICT` (PATCH N8 — antes `SUBJECT_VERSION_CONFLICT`
  bloqueava a request `PENDING`; agora rejeitado na consumação do
  intent, antes de qualquer `ApprovalRequest` existir).
- `ApprovalRequestIntent` chega para Run já `CANCEL_REQUESTED`/`CANCELLED`/
  `SUCCEEDED`/`FAILED` → não materializa request, ACK idempotente +
  `AuditEvent` de supressão.
- Decisão duplicada com mesmo `decisionId` → idempotente, sem efeito
  duplicado.
- Mesmo `decisionId`, payload diferente → `DECISION_ID_CONFLICT`.
- `decisionId` novo para request já resolvida → `ALREADY_RESOLVED`/
  `STALE_DECISION`, nunca aplicada.
- Decisão chegando poucos segundos após `expiresAt` → resolve `EXPIRED`
  atomicamente dentro de `applyDecision()`, retorna `REQUEST_EXPIRED`, não
  aplica a decisão.
- `AUTO`: `INSUFFICIENT_EVIDENCE` nunca gera `CHANGES_REQUESTED`/rejeição
  automática — sempre escala para `MANUAL`.
- `AUTO`/`HYBRID`: `POLICY` tentando produzir `REJECTED` → rejeitado pelo
  contrato (só `HUMAN` pode rejeitar).
- `approvalGateKey = FIRST_REAL_PUBLISH` com `ApprovalPolicy` configurada
  como `AUTO` → modo efetivo continua `MANUAL`, `autoApproveAllowed =
  false`.
- Nova versão do artefato chega com `ApprovalRequest` anterior `PENDING` →
  anterior vira `SUPERSEDED` + nova request nasce, mesma transação, sem
  janela de dupla validade.
- `RunCancellationIntent` consumido por `APPROVAL_MANAGER` cancela
  `PENDING` daquela Run; redelivery do mesmo `cancelIntentId` é
  idempotente; não afeta requests já resolvidas.
- Corrida decisão humana × expiração × cancelamento × supersede sobre a
  mesma `ApprovalRequest.version` — só uma transição vence via
  `expectedVersion`, as demais recebem `STALE_DECISION`/
  `ALREADY_RESOLVED`.
- `ApprovalResolvedEvent` entregue duas vezes para a Skill 01 → idempotente
  via revalidação de `approvalRequestVersion`+`subjectType`+`subjectId`+
  `artifactHash`+estado atual da Run (PATCH N8 — antes citava
  `subjectVersion`).
- `ApprovalResolvedEvent` atrasado chegando quando a Run já está
  `CANCEL_REQUESTED`/`CANCELLED`/`SUCCEEDED`/`FAILED` → nunca reverte a
  Run.
- `ApprovalResolvedEvent` de uma request `SUPERSEDED` (artifactHash H1)
  chega depois que H2 já é o artefato atual da Run → Skill 01 revalida
  `approvalRequestVersion`+`approvalGateKey`+`subjectType`/`subjectId`/
  `artifactHash` (PATCH N8 — antes citava `subjectVersion`) → ACK stale,
  nenhuma alteração na `ProductionRun` (cobre o risco de um evento
  atrasado liberar ou retroceder a Run depois que um novo artifactHash
  já assumiu o gate).
- Tentativa de decisão/consulta com `tenantId` diferente do da
  `ApprovalRequest` → rejeitada.
- `ApprovalPolicy` mudando (nova `policyVersion`) enquanto uma
  `ApprovalRequest` está `PENDING` → a request em andamento continua usando
  o `policyId`+`policyVersion`+`policySnapshotHash` originais.
- Redelivery do mesmo `sourceIntentId` → resolve para a mesma
  `ApprovalRequest`, **sem re-resolver** `ApprovalPolicyBinding`.
- Decisão retry de rede (mesmo `decisionId`+payload) após já ter vencido a
  concorrência → retorna o resultado anterior, não `STALE_DECISION`.
- `sweepExpiredApprovals()` disputando `version` com uma decisão que venceu
  no mesmo instante → update do reconciler afeta zero linhas, tratado como
  no-op.
- `actorType = "POLICY"` recebido de payload externo → rejeitado
  estruturalmente, independente de `policyId`/`policyVersion` fornecidos.
- `ApprovalRequestIntent` em `DEAD_LETTER` antes de materializar → nenhuma
  `ApprovalRequest` artificial criada; Run pode permanecer
  `WAITING_APPROVAL`; redrive preserva `intentId`.
- `ApprovalResolvedEvent` em `DEAD_LETTER` → `ApprovalRequest` permanece no
  terminal já vencido; redrive não desfaz nem repete a decisão.
- Tentativa de decisão humana sem `authorizationEvidenceRef` válido →
  rejeitada; gera `AuditEvent` de segurança mesmo sem transição da
  `ApprovalRequest`.
- `authorizationEvidenceRef` existe, mas pertence a outro `tenantId` →
  rejeitada.

**N8 — provas de fechamento (`ExactApprovalSubject`, 2026-09-19):**
- Subject `A`/`H1` aprovado; artefato atual continua `A`/`H1` → decisão
  satisfaz o gate.
- Subject `A`/`H1` aprovado; artefato atual passou a ser `A`/`H2` →
  decisão NÃO satisfaz o gate (mesmo `subjectId`, `artifactHash`
  diferente = outro subject semântico).
- `sourceIntentId I1` + subject `A`/`H1` → cria `ApprovalRequest`.
- Replay de `I1` + `A`/`H1` (mesmo payload) → mesma `ApprovalRequest`,
  idempotente.
- Replay de `I1` + `A`/`H2` (mesmo `intentId`, `artifactHash` diferente)
  → `INTENT_ID_CONFLICT` — o produtor tentou reutilizar a mesma
  identidade de intent com outro conteúdo.
- Novo `sourceIntentId I2` + subject `A`/`H2` → nova `ApprovalRequest`
  válida (nova intenção legítima sobre conteúdo revisado).
- `VideoArtifact.videoArtifactId`+`contentHash` preenche
  `subjectId`+`artifactHash` sem adaptação artificial (gate
  `VIDEO_COMPLIANCE`).
- `PublicationPlan.publicationPlanId`+`planHash` preenche
  `subjectId`+`artifactHash` sem adaptação artificial (gate
  `FIRST_REAL_PUBLISH` — ver N5).
- `authorizationEvidenceRef` com capability válida para outra
  `ApprovalRequest` → rejeitada (Ponto S1: `TenantAuthorizationDecision`
  com `authorizationScope = { kind: 'EXACT_ARTIFACT', resourceRef }`
  apontando pra uma `ApprovalRequest` diferente da que está sendo
  decidida).
- `authorizationEvidenceRef` só com `authorizationScope.kind = 'TENANT'`
  (sem escopo `EXACT_ARTIFACT` nesta `ApprovalRequest`) → rejeitada
  (Ponto S1: prova "pode aprovar no tenant", não "pode aprovar esta
  request").
- `authorizationEvidenceRef` com capability diferente da exigida →
  rejeitada.
- `authorizationEvidenceRef` expirada/revogada/inválida conforme a camada
  de autorização → rejeitada. Nenhuma dessas tentativas cria
  `ApprovalDecision`; todas ficam auditáveis como evento de segurança.
- `POLICY` + `APPROVED` só ocorre com `AutoEvaluationOutcome =
  ELIGIBLE_FOR_AUTO_APPROVAL`.
- `POLICY` + `CHANGES_REQUESTED` só ocorre com `HARD_CRITERIA_FAILED` +
  `autoChangesRequestedAllowed = true` + regra determinística aplicável.
- `HARD_CRITERIA_FAILED` sem permissão da policy → escalona para humano.
- `BORDERLINE` → sempre escalona para humano.
- `INSUFFICIENT_EVIDENCE` → sempre escalona para humano.
- `POLICY_EVALUATION_ERROR` → escalona para humano ou `BLOCK`, conforme
  `onEvaluationError` da policy.
- `publicationTargetKey` A sem publish confirmado → modo `MANUAL`.
- Aprovação manual concedida no target A, mas sem publish bem-sucedido
  confirmado → continua protegido (`GLOBAL_SAFETY_OVERRIDE`).
- Tentativa de publish ou falha de publish no target A → continua
  protegido; o marco só muda com confirmação durável de sucesso.
- `publicationTargetKey` B do mesmo tenant → protegido independentemente
  do estado do target A.

**Ponto S4 (ApprovalEvidenceBundle):**

- `VIDEO_COMPLIANCE` aceita subject `VideoArtifact`; rejeita
  `PublicationPlan` (PATCH N5 — antes `PublicationIntent`).
- `FIRST_REAL_PUBLISH` aceita subject `PublicationPlan` (PATCH N5 —
  antes `PublicationIntent`); rejeita `VideoArtifact`.
- Subject com `subjectId` correto mas `artifactHash` divergente →
  `APPROVAL_GATE_SUBJECT_TYPE_MISMATCH` (PATCH N8 — antes citava
  "id/versão").
- Evidence item de tenant diferente do da `ApprovalRequest` → rejeita.
- `VideoAuditResult.verdict=COMPLIANT` → item `SATISFIES_REQUIREMENT`.
- `VideoAuditResult.verdict=NON_COMPLIANT` → item `VIOLATES_REQUIREMENT`.
- `VideoAuditResult.verdict=INCONCLUSIVE` → item `INSUFFICIENT_EVIDENCE`
  (nunca `VIOLATES_REQUIREMENT` — impede regressão).
- `NON_COMPLIANT` continua permitindo `Job SUCCEEDED` (Ponto D intacto).
- Nenhum `VideoAuditResult` fornecido →
  `coverage=MISSING_REQUIRED_EVIDENCE`.
- `VideoAuditResult` inconclusivo fornecido → `coverage=COMPLETE` +
  outcome `INSUFFICIENT_EVIDENCE` (situação distinta da anterior).
- Evidence de `VideoArtifact` diferente do exato da `ApprovalRequest` →
  `APPROVAL_EVIDENCE_SUBJECT_MISMATCH`.
- Bundle vazio válido quando gate não define evidence requirement.
- Bundle vazio para `VIDEO_COMPLIANCE` com requirement definido →
  `coverage=MISSING_REQUIRED_EVIDENCE`, nunca válido.
- Ordem de `evidenceItems` não altera `approvalEvidenceBundleHash`.
- `materializedAt` não altera `approvalEvidenceBundleHash`.
- Bundle mutado (item trocado) → novo bundle, nunca `UPDATE` do
  anterior.
- `ApprovalDecision` sempre referencia `approvalEvidenceBundleRef`
  exato.
- `authorizationEvidenceRef` (S1) nunca substitui
  `approvalEvidenceBundleRef` (S4), e vice-versa.
- `FIRST_REAL_PUBLISH` permanece `MANUAL` mesmo com evidence
  `SATISFIED`.
- Hard requirement `VIOLATED` não é ignorado por decisão manual.
- `INSUFFICIENT_EVIDENCE` nunca auto-aprova.
- Nenhum `getLatestVideoAudit()`/"latest binding" é permitido.
- Replay reutiliza bundle existente por identidade+hash.
- Bundle com mesma identidade e conteúdo divergente →
  `APPROVAL_EVIDENCE_BUNDLE_REPLAY_CONFLICT`.

### Teste real

Adiado — sem schema/migration em produção nesta fase. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `ApprovalRequestIntent`,
  `ApprovalRequest`, `ApprovalDecision`, `ApprovalPolicy`,
  `AutoEvaluationOutcome`, `ApprovalResolvedEvent` — com `version`
  (optimistic concurrency) e `decisionId` (idempotência) como proteções
  distintas.
- Toda decisão amarrada a `subjectType`+`subjectId`+`artifactHash` exatos
  (`ExactApprovalSubject`), nunca só `subjectId` (PATCH N8 — antes
  citava `subjectVersion`).
- Estados de decisão (`APPROVED`/`REJECTED`/`CHANGES_REQUESTED`)
  documentados separadamente de estados de lifecycle
  (`EXPIRED`/`SUPERSEDED`/`CANCELLED`).
- `POLICY` nunca produz `REJECTED`; `FIRST_REAL_PUBLISH` força `MANUAL`
  independente da policy configurada.
- Guarda de materialização tardia e fan-out do `RunCancellationIntent`
  (`consumerKey = "APPROVAL_MANAGER"`) documentados como invariantes
  compartilhadas com Skills 01/02.
- Corridas concorrentes (decisão × expiração × cancelamento × supersede)
  resolvidas via `expectedVersion`, nunca last-write-wins.

## Dependências

Skill 01 — Orquestrador de Produção (outbox de entrada:
`ApprovalRequestIntent`, `RunCancellationIntent` com `consumerKey =
"APPROVAL_MANAGER"`; outbox de saída consumido por ela:
`ApprovalResolvedEvent`). Skill 12 — Auditor de Vídeo (fonte normativa
de `ApprovalEvidenceKind.VIDEO_AUDIT` para `ApprovalGateKey.VIDEO_COMPLIANCE`,
formalizado no Ponto S4 abaixo — mapeamento `VideoAuditResult.verdict`
→ `ApprovalEvidenceOutcome` congelado, não "consumidor possível"). Skill 22 — Gestor de Conta/Tenant (identidade, papéis e
concessão de `authorizationEvidenceRef`, ainda não especificada). Skill 17
— Publicador Multicanal (deve revalidar a trava `FIRST_REAL_PUBLISH` antes
de publicar de fato, ainda não especificada). Interface Skill 01↔03
congelada em 2026-09-17.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão (não alteram os contratos congelados desta Skill):

- valores concretos de `hardRequirements`/`autoApproveCriteria` por
  `policyKey` (o *formato* já é normativo desde o Ponto S4 — avaliados
  exclusivamente contra `ApprovalEvidenceBundle`; só os thresholds/
  regras específicos de cada `policyKey` real ficam para a fase de
  implementação);
- `expiresAfterSeconds` padrão por `approvalGateKey`;
- frequência do reconciliador (`sweepExpiredApprovals`);
- RBAC completo de quem pode ser reviewer de um tenant (Skill 22).

## Reparo transversal pós-revisão Fable (2026-09-18)

### Ponto F1 — patch da Skill 17 finalmente escrito aqui (`FIRST_REAL_PUBLISH`)

A Skill 17 (17/25, aprovada) já citava no próprio cabeçalho "inclui um
patch compatível na Skill 03... sem reabrir 3/25" — mas o conteúdo
nunca chegou a ser escrito de fato neste arquivo (achado B5 da revisão
Fable/Claude Fable 5 Max). Debatido novamente com o ChatGPT no Ponto F
do reparo transversal (2026-09-18) — versão final, mais limpa que o
rascunho original da Skill 17 (separa `purpose` de `decision` em vez de
misturar os dois num único `status`). A Skill 03 passa a ser
formalmente dona de `PublicationAuthorizationResolutionRef`,
`FirstRealPublishClaim`, `FirstRealPublishClaimRuntimeState`,
`FirstRealPublishGateDecision`. A Skill 17 não define esses tipos, só
consome — sem reabrir 3/25, sem alterar `ApprovalRequest`/
`ApprovalDecision`/`ApprovalResolvedEvent` já congelados.

```typescript
type PublicationAuthorizationPurpose =
  | 'FIRST_REAL_PUBLISH'
  | 'POLICY_REQUIRED_APPROVAL';
// sem hash próprio.

type PublicationAuthorizationEffectiveDecision =
  | 'AUTHORIZED' | 'DENIED' | 'EXPIRED';

type PublicationAuthorizationResolutionRef = {
  authority: 'SKILL03';

  purpose: PublicationAuthorizationPurpose;

  approvalResolutionId: string;
  approvalResolutionHash: string;

  approvalSubjectHash: string;

  firstRealPublishClaimId?: string;
  firstRealPublishClaimHash?: string;

  decision: PublicationAuthorizationEffectiveDecision;
};
// sem hash próprio — é uma ref/projection sobre a autoridade já
// existente da Skill 03, não uma segunda ApprovalDecision.
```

**Invariante**: se `purpose = FIRST_REAL_PUBLISH`, então
`firstRealPublishClaimId`/`firstRealPublishClaimHash` são obrigatórios;
se `purpose = POLICY_REQUIRED_APPROVAL`, podem estar ausentes.
`AUTHORIZED` não significa publicação realizada — significa apenas "a
Skill 03 autorizou esta publicação exata segundo a approval policy
aplicável"; provider recebeu request / publicação ocorreu / publicação
foi confirmada continuam fatos da Skill 17.

#### `FirstRealPublishClaim` — claim atômico

Problema real de concorrência: publication A e publication B do mesmo
`(tenantId, integrationBindingId, publicationChannelKey)` não podem
observar simultaneamente "nenhuma publicação real ainda" e ambas
concluir que são "a primeira".

```typescript
type FirstRealPublishScope = {
  tenantId: string;

  integrationBindingId: string;
  integrationBindingHash: string; // da Skill 24

  publicationChannelKey: string; // ex. INSTAGRAM, TIKTOK, PINTEREST
};
// sem hash próprio. Skill 03 não interpreta semântica de canal.

type FirstRealPublishClaim = {
  firstRealPublishClaimId: string;

  claimKey: string;

  scope: FirstRealPublishScope;

  publicationPlanId: string; // PATCH (N5, kernel repair pós re-review
    // GPT-6 Astra, 2026-09-19) — antes publicationIntentId; PublicationIntent
    // nunca foi declarado em nenhuma Skill, PublicationPlan (Skill17) é o
    // artifact real
  publicationPlanHash: string; // PATCH (N5) — antes publicationIntentHash

  manualApprovalRequired: true;

  claimHash: string;

  claimedAt: string;
};
```

Hash: `FIRST_REAL_PUBLISH_CLAIM_V1:sha256:<hex>`. `publicationPlanId`/
`publicationPlanHash` são carregados como campos opacos — a Skill 03
não importa nem interpreta `PublicationPlan` (evita circularidade
runtime).

**Unicidade**: UNIQUE lógico `(tenantId, integrationBindingId,
publicationChannelKey)`. Enquanto o claim estiver `CLAIMED` ou
`CONFIRMED`, não pode nascer outro claim concorrente para aquele scope.

```typescript
type FirstRealPublishClaimStatus =
  | 'CLAIMED' | 'CONFIRMED' | 'RELEASED';

type FirstRealPublishClaimRuntimeState = {
  firstRealPublishClaimId: string;

  status: FirstRealPublishClaimStatus;

  version: number;

  updatedAt: string;
};
// mutável, sem hash integral.
```

**`CLAIMED`**: esta publicação possui exclusivamente a tentativa de
ocupar o gate daquele scope; ainda precisa de aprovação manual antes da
publicação real.

**`CONFIRMED`**: só a Skill 17 pode fornecer evidência de que a
publicação externa foi confirmada. Fluxo: `Skill03 claim → manual
approval → PublicationAuthorizationResolutionRef AUTHORIZED → Skill17
controlled publish → external publication CONFIRMED → claim →
CONFIRMED`. Depois disso, `FIRST_REAL_PUBLISH` não é mais exigido para
aquele scope (outras approval policies continuam valendo normalmente).

**`RELEASED`**: só quando houver evidência confiável de `NO_SIDE_EFFECT`
antes da primeira publicação real ser confirmada (aprovação rejeitada
antes da rede, publicação abandonada explicitamente antes do submit, ou
operação de provider provada sem efeito). **`UNKNOWN` nunca libera o
claim** — se a Skill 17 chegou a `SUBMITTING` e depois o efeito externo
vira `UNKNOWN`, o claim permanece `CLAIMED` (nunca liberar outra
publicação virar "a primeira" por incerteza). Cancelamento depois do
submit também não libera sem evidência.

#### `FirstRealPublishGateDecision`

```typescript
type FirstRealPublishGateDecision = {
  firstRealPublishGateDecisionId: string;

  tenantId: string;

  firstRealPublishClaimId: string;
  firstRealPublishClaimHash: string;

  approvalResolutionId: string;
  approvalResolutionHash: string;

  decision: 'AUTHORIZED' | 'DENIED' | 'EXPIRED';

  gateDecisionHash: string;

  decidedAt: string;
};
```

Hash: `FIRST_REAL_PUBLISH_GATE_DECISION_V1:sha256:<hex>`. **Regra
forte**: para um claim ainda `CLAIMED`, a publicação `FIRST_REAL_PUBLISH`
só pode chegar ao submit boundary com `FirstRealPublishGateDecision.decision
= AUTHORIZED`. Independentemente da policy normal do tenant, a primeira
publicação real exige sempre `MANUAL` (nunca `AUTO`/`HYBRID` auto
branch) — depois de `CONFIRMED`, a policy normal da Skill 03 volta a
governar.

Novos `FATAL_ERROR` (3, vocabulário desta Skill, consumido pela
Skill 17): `PUBLICATION_AUTHORIZATION_RESOLUTION_MISMATCH` (a resolução
consumida não bate com o `publicationPlanHash`/scope esperado — PATCH N5),
`FIRST_REAL_PUBLISH_CLAIM_REPLAY_CONFLICT` (mesma `claimKey`, conteúdo
divergente) e `FIRST_REAL_PUBLISH_GATE_REPLAY_CONFLICT` (reaquisição de
claim incompatível com o estado atual).

Ver também "Reparo transversal pós-revisão Fable → Ponto F1" no
`SPEC.md` da Skill 17, que passa a referenciar estes tipos como
`REFERENCE ONLY` (dono canônico agora é este arquivo; qualquer definição
local concorrente na Skill 17 foi removida).

### Ponto S4 — `ApprovalEvidenceBundle` encerra o "depende da Skill 12"

Achado real do Fable: esta Skill e a Skill 12 se citavam mutuamente sem
nunca fechar o contrato — "Questões abertas" deixava o formato de
`hardRequirements`/`autoApproveCriteria` condicionado a uma decisão de
estruturação de evidências que a Skill 12 nunca tinha tomado, e a
Skill 12 só apontava a Skill 03 como possível consumidora, sem
compromisso normativo do outro lado. Decisão:
**Skill 03 é dona do contrato de evidência de aprovação.** A Skill 12
continua dona de `VideoAuditResult` e fornece a evidência-fonte — ela
não ganha um segundo sistema de aprovação. Isso fecha o acoplamento
circular sem criar um novo.

Duas perguntas que a Skill 03 sempre mantém separadas (não uma
substitui a outra):

```text
Ponto S1: "este ator tem autoridade para decidir ESTA ApprovalRequest?"
          → authorizationEvidenceRef (Skill 22)

Ponto S4: "quais evidências existem sobre o subject desta ApprovalRequest?"
          → approvalEvidenceBundleRef (Skill 03, este ponto)
```

#### Gates V1 e subject exato por gate

Resolve a pergunta central do Fable — "qual `artifactHash` está sendo
aprovado?":

```typescript
type ApprovalGateKey =
  | 'VIDEO_COMPLIANCE'
  | 'FIRST_REAL_PUBLISH';
// V1 não permite gate arbitrário configurado por admin — só os dois
// conhecidos aqui. Policy configura CRITÉRIOS dentro do gate, nunca
// redefine o que o subject do gate significa. Novo gate exige: novo
// ApprovalGateKey + owner do subject + tipo exato do subject artifact +
// evidence kinds válidos + automation constraints, tudo explícito.
```

`ApprovalRequest.approvalGateKey` já tipado `ApprovalGateKey` (Ponto
S4/R3). Tabela normativa de subject — sempre `subjectType`/`subjectId`/
`artifactHash` exatos (PATCH N8 — antes citava `subjectVersion`; campos
já existentes em `ApprovalRequest`/`ApprovalDecision`, nunca um
`subjectHash` solto sem tipo):

| Gate | `subjectType` esperado |
| --- | --- |
| `VIDEO_COMPLIANCE` | `VideoArtifact` (exato — id+hash) |
| `FIRST_REAL_PUBLISH` | `PublicationPlan` (exato — id+hash) |

Combinação diferente → fail closed
(`APPROVAL_GATE_SUBJECT_TYPE_MISMATCH`).

**Por que `VIDEO_COMPLIANCE` aprova `VideoArtifact`, não
`VideoAuditResult`:** a Skill 12 audita o vídeo — o audit é *evidência*,
o subject é o `VideoArtifact` em si. `VideoArtifact V` auditado por
`VideoAuditResult A` → evidência → `ApprovalRequest` para `V` (nunca
para `A`).

**Por que `FIRST_REAL_PUBLISH` aprova `PublicationPlan`, não
`FinalizedRendition`** (PATCH N5, kernel repair pós re-review GPT-6
Astra, 2026-09-19 — antes dizia `PublicationIntent`, um artifact que
nunca foi declarado em nenhuma Skill; comparação dos 4 candidatos reais
da Skill17 — `PublicationPlan`, `LogicalPublicationIdentity`,
`PublicationExecution`, `PublicationReservation` — confirmou que
`PublicationPlan` é o único imutável, pré-side-effect e completo o
suficiente pra aprovação; ver `feito.md` da Skill de vídeo pra detalhe
completo do achado): a publicação inclui mais do que os bytes do vídeo
— o `PublicationPlan` já se compromete com: `publicationTargetKey`
(target de negócio), `finalizedVideoRenditionId`/`Hash` (rendition
final), `creativeCtaIntentRef` (CTA, Ponto S3), `affiliateLinkArtifactId`/
`Hash` (affiliate/link binding), e `steps`/`semanticPayload` completo
(qualquer payload/config que afete o publicado). O subject `FIRST_REAL_PUBLISH`
contém a identidade do target de negócio (`publicationTargetKey`) por
meio do `PublicationPlan`. `providerKey`/`providerAccountId`
**deliberadamente não fazem parte** da identidade semântica do subject
aprovado — são resolvidos e revalidados separadamente na execução,
conforme os contratos de integração e o `FirstRealPublishClaim`/F1 já
existentes (mesmo racional do `LogicalPublicationIdentity`: "a
identidade representa O QUE pretendemos publicar, não COMO vamos
executar"). Aprovar um `PublicationPlan` **não significa "qualquer
provider/account pode publicar isso"** — a Skill 17 ainda passa pela
resolução/revalidação de integração e pelo `FirstRealPublishClaim`
antes do side effect; são duas garantias distintas, ambas exigidas.
**`FIRST_REAL_PUBLISH` continua `MANUAL` sempre** (regra F1 preservada)
— mesmo com evidence bundle `SATISFIED` e audit `COMPLIANT`, nunca
auto-publica a primeira publicação real. S4 não enfraquece F1.

#### `ApprovalEvidenceOutcome` — nível do item de evidência, não da decisão

```typescript
type ApprovalEvidenceOutcome =
  | 'SATISFIES_REQUIREMENT'
  | 'VIOLATES_REQUIREMENT'
  | 'INSUFFICIENT_EVIDENCE';
// Nunca "APPROVED"/"REJECTED" aqui — isso é decisão da ApprovalRequest
// (ApprovalDecision.decision), outro domínio.

type ApprovalEvidenceKind =
  | 'VIDEO_AUDIT';
// V1 tem só uma fonte real. Quando outro producer de evidência real
// existir, amplia-se explicitamente — não abrir enum genérico agora.

type ApprovalEvidenceItem = {
  requirementKey: string; // reaproveita a key já estável dentro de
    // hardRequirements/autoApproveCriteria daquele policyKey; se hoje
    // só existir como texto sem key formal, formalizar dentro desses
    // tipos existentes — não criar sistema de policy paralelo

  evidenceKind: ApprovalEvidenceKind;

  subjectRef: KernelArtifactRef; // exato — precisa bater com o
    // subjectType/subjectId/artifactHash da ApprovalRequest sendo
    // avaliada (PATCH N8 — antes citava subjectVersion). Nada de versão
    // sintética.

  sourceEvidenceRef: KernelArtifactRef; // exato VideoAuditResult, etc.

  outcome: ApprovalEvidenceOutcome;
};
// Sem hash próprio.
```

**Evidência precisa apontar pro subject exato.** Se
`ApprovalRequest.subject = VideoArtifact V1/hash1` mas o
`VideoAuditResult` auditou `V2/hash2`, o item é inválido — mesmo que
mesma Run/produto/stage, não conta. Nunca `getLatestVideoAudit()` como
autoridade para uma `ApprovalRequest` existente — o bundle usa o
`sourceEvidenceRef` exato escolhido explicitamente pelo caller/adapter
(V1 é determinístico: **exatamente um** evidence item por
`requirementKey` satisfeito/materializado; se existirem dois audits
candidatos, quem monta o bundle escolhe explicitamente qual usar, a
Skill 03 nunca escolhe "o mais recente").

#### Mapeamento normativo Skill 12 → Skill 03

Precisa existir literalmente nas duas SPEC.md como referência cruzada
(ver também Skill 12):

```text
VideoAuditResult.verdict = COMPLIANT     → SATISFIES_REQUIREMENT
VideoAuditResult.verdict = NON_COMPLIANT → VIOLATES_REQUIREMENT
VideoAuditResult.verdict = INCONCLUSIVE  → INSUFFICIENT_EVIDENCE
```

**Crítico:** `INCONCLUSIVE ≠ NON_COMPLIANT`. `INCONCLUSIVE` nunca vira
`VIOLATES_REQUIREMENT` — o audit ocorreu corretamente, só não
conseguiu concluir; `Job = SUCCEEDED`, `domain verdict = INCONCLUSIVE`,
`approval evidence = INSUFFICIENT_EVIDENCE`. `NON_COMPLIANT` continua
sendo `Job SUCCEEDED` normalmente (Ponto D intacto) — o adapter ainda
pode iniciar nova `StageIteration`/correção; S4 só formaliza que, se
aquele audit for usado como evidência de aprovação, ele significa
`VIOLATES_REQUIREMENT`.

#### `ApprovalEvidenceCoverage` — separado de `outcome`

```typescript
type ApprovalEvidenceCoverage =
  | 'COMPLETE'
  | 'MISSING_REQUIRED_EVIDENCE';
```

Evita confundir "não existe evidência" com "existe evidência, mas é
inconclusiva":

```text
Caso A: nenhum VideoAuditResult fornecido
        → coverage MISSING_REQUIRED_EVIDENCE

Caso B: VideoAuditResult existe, verdict=INCONCLUSIVE
        → coverage COMPLETE
        → outcome do item INSUFFICIENT_EVIDENCE
```

#### `ApprovalEvidenceBundle` (novo artifact, owner Skill 03)

```typescript
type ApprovalEvidenceBundle = {
  approvalEvidenceBundleId: string;

  tenantId: string;

  approvalRequestRef: KernelArtifactRef; // exact ApprovalRequest

  gateKey: ApprovalGateKey;
  subjectRef: KernelArtifactRef; // = ApprovalRequest.subject exato

  approvalPolicySnapshotRef: KernelArtifactRef; // = policyId+policyVersion+policySnapshotHash já existentes

  evidenceItems: ApprovalEvidenceItem[];
  missingRequirementKeys: string[];

  coverage: ApprovalEvidenceCoverage;

  materializedAt: string;

  approvalEvidenceBundleHash: string; // APPROVAL_EVIDENCE_BUNDLE_V1
};

type ApprovalEvidenceBundleRef = {
  approvalEvidenceBundleId: string;
  approvalEvidenceBundleHash: string;
};
// Sem hash próprio.
```

Hash `APPROVAL_EVIDENCE_BUNDLE_V1` (1 hash novo, via
`CANONICAL_SERIALIZATION_V1`) — projection inclui `tenantId`,
`approvalRequestRef`, `gateKey`, `subjectRef`,
`approvalPolicySnapshotRef`, `evidenceItems`, `missingRequirementKeys`,
`coverage`; exclui `approvalEvidenceBundleId`/`materializedAt`/
`approvalEvidenceBundleHash`. `evidenceItems` é set-like para hashing —
ordenar por `requirementKey`, `evidenceKind`, representação canônica de
`sourceEvidenceRef` antes do hash; `missingRequirementKeys` ordenado
lexicograficamente; sem duplicatas.

**Bundle vazio é válido** quando o policy snapshot daquele gate não
define evidence requirements (ex.: `FIRST_REAL_PUBLISH` manual-only
sem requirement adicional) → `evidenceItems=[]`,
`missingRequirementKeys=[]`, `coverage=COMPLETE`. Isso **não** implica
auto-approval. `VIDEO_COMPLIANCE` não pode ter bundle vazio se o gate
exige `VIDEO_AUDIT` e nenhum foi fornecido →
`missingRequirementKeys` contém o requirement,
`coverage=MISSING_REQUIRED_EVIDENCE`.

**Bundle é snapshot imutável.** Depois de criado: nunca adicionar/
remover item, nunca trocar `sourceEvidenceRef`/`outcome`. Evidência
mudou → novo bundle (novo id+hash), nunca `UPDATE` do antigo — mesma
disciplina S14. Uma mesma `ApprovalRequest` pode ser avaliada contra
bundles sucessivos antes da resolução final, mas cada decisão registra
o `ApprovalEvidenceBundleRef` exato usado.

#### Avaliação agregada (alimenta `AutoEvaluationOutcome` já existente)

```typescript
type ApprovalEvidenceEvaluationOutcome =
  | 'SATISFIED'
  | 'VIOLATED'
  | 'INSUFFICIENT_EVIDENCE';
// Value type — sem artifact/hash próprio.
// Regra: qualquer item VIOLATES_REQUIREMENT → VIOLATED;
//        senão, qualquer requirement missing ou INSUFFICIENT_EVIDENCE
//          → INSUFFICIENT_EVIDENCE;
//        senão → SATISFIED.
```

Isso **não é** `ApprovalDecision`. Evidence pode ser `SATISFIED` e o
gate ainda assim exigir `MANUAL` (`FIRST_REAL_PUBLISH`) — "autorizado a
decidir" (Ponto S1) e "evidência satisfaz o requisito" (Ponto S4) nunca
se confundem com "decisão foi aprovar" (o `decision` da
`ApprovalDecision`).

`hardRequirements`/`autoApproveCriteria` (já existentes em
`ApprovalPolicy`, hoje tipados `unknown`) passam a ser avaliados
**exclusivamente** contra o `ApprovalEvidenceBundle` materializado
segundo os contratos acima — a antiga nota em "Questões abertas", que
condicionava o formato a uma estruturação de evidências ainda
indefinida pela Skill 12, deixa de valer; ver correção abaixo.

**Regra de avaliação de hard requirement:**

```text
required evidence ausente                    → INSUFFICIENT_EVIDENCE
required evidence = VIOLATES_REQUIREMENT      → requirement violado
required evidence = INSUFFICIENT_EVIDENCE     → requirement não comprovado
todos required = SATISFIES_REQUIREMENT        → hard requirements satisfeitos
```

**Nunca auto-aprova:** `INCONCLUSIVE`/`INSUFFICIENT_EVIDENCE` (V1
seguro: auto approve proibido; manual resolution permitida só se o
policy snapshot explicitamente disser que manual review pode resolver
insuficiência — nunca presumir), `NON_COMPLIANT`/`VIOLATES_REQUIREMENT`.
Hard requirement `VIOLATED` **nunca** é ignorado por aprovação manual —
se a policy chama algo de `hardRequirement`, é hard de verdade; um
mecanismo de override explícito é feature de governança futura, fora
do S4. `VIDEO_COMPLIANCE` V1: único audit verdict suficiente pra
satisfazer automaticamente é `COMPLIANT` (`SATISFIES_REQUIREMENT`).

Skill 03 só pode auto-aprovar quando **simultaneamente**: (1) gate
permite `AUTO`/`HYBRID`; (2) hard requirements `SATISFIED`; (3)
`autoApproveCriteria` `SATISFIED`; (4) `coverage=COMPLETE`; (5) nenhum
item `INSUFFICIENT_EVIDENCE`; (6) subject/gate/policy hashes exatos;
(7) demais invariantes já existentes (`AutoEvaluationOutcome =
ELIGIBLE_FOR_AUTO_APPROVAL`, etc.) satisfeitas.

#### `ApprovalDecision` ganha `approvalEvidenceBundleRef` (obrigatório)

```typescript
// PATCH em ApprovalDecision (já existente): novo campo obrigatório
approvalEvidenceBundleRef: ApprovalEvidenceBundleRef;
```

Obrigatório mesmo quando a resolução não tinha nenhum evidence
requirement — ainda aponta pro bundle (possivelmente vazio), pra
distinguir "não havia requirement" de "esqueceram de coletar evidência".
`ApprovalDecision` passa a carregar **dois refs distintos e
obrigatórios conforme o caso**, nunca confundidos:

```text
authorizationEvidenceRef → Skill 22 → ator podia decidir ESTA request (Ponto S1)
approvalEvidenceBundleRef → Skill 03 → evidências sobre o subject (Ponto S4)
```

Proibido misturar `TenantAuthorizationDecision` como evidência de que o
vídeo está compliant — são domínios diferentes.

#### Lineage `FIRST_REAL_PUBLISH`

PATCH (N5, 2026-09-19): esta seção citava `PublicationIntent`, um
artifact nunca declarado em nenhuma Skill — `PublicationPlan` (Skill17)
é o owner real (ver "Gates V1 e subject exato por gate" acima).

```text
ApprovalRequest subject = PublicationPlan
  → FinalizedRendition, AffiliateLink, CreativeCtaIntentRef (S3), PublicationTarget
```

desde que o hash do `PublicationPlan` (`planHash`) se comprometa com
essa lineage. `FirstRealPublishGateDecision` (Ponto F1) exige/referencia
uma `ApprovalDecision` cujo `gateKey=FIRST_REAL_PUBLISH` e
`subjectRef` = exato mesmo `PublicationPlan` — nunca um segundo approval
path. `PublicationAuthorizationResolutionRef.purpose =
FIRST_REAL_PUBLISH` ganha a invariante: o `approvalResolutionId/Hash`
subjacente tem `gateKey=FIRST_REAL_PUBLISH` e mesmo subject exato.
Aprovação é sempre do `PublicationPlan` (nunca só `PublicationExecution`)
— aprovação precisa ocorrer antes do submit boundary; `PublicationExecution`
é a execução operacional posterior. Se o `PublicationPlan` mudar depois
da aprovação (rendition/payload/CTA/affiliate link/target/binding mudam
e isso muda `planHash`) → a aprovação antiga não serve, nova
request/evidence/resolution conforme policy. Mudança de metadata fora
do hash não invalida o subject — quem decide o que é semântico é o
próprio projection do `PublicationPlan` (`publicationSemanticPayloadHash`/
`planHash`).

#### Replay

Mesma identidade lógica + mesmo hash → reuse (S14). Mesma identidade +
conteúdo/provenance incompatível →
`APPROVAL_EVIDENCE_BUNDLE_REPLAY_CONFLICT`. `materializedAt` não entra
no hash, replay não recalcula timestamp. Se a fonte de evidência
existia mas o storage está corrompido/ausente, isso **não** vira
`INSUFFICIENT_EVIDENCE` silenciosamente — é falha de
integridade/storage, tratada pelos mecanismos já existentes do kernel,
não reinterpretada como outcome de domínio.

#### Correção das frases de acoplamento circular

Substituídas as duas frases abertas que o Fable encontrou:

- "Questões abertas" (formato de `hardRequirements`/
  `autoApproveCriteria` condicionado a uma estruturação de evidências
  que a Skill 12 nunca tinha definido) → removida; o formato agora é
  normativo: avaliados exclusivamente contra `ApprovalEvidenceBundle`
  conforme definido acima.
- Menção à Skill 12 em "Dependências" que a descrevia apenas como fonte
  possível de evidências, sem compromisso normativo → removida a
  incerteza; ver a versão normativa
  espelhada na Skill 12 ("VideoAuditResult É uma fonte válida de
  ApprovalEvidenceKind.VIDEO_AUDIT para ApprovalGateKey.VIDEO_COMPLIANCE,
  seguindo o mapeamento definido pela Skill 03" — sem "talvez").

#### `FATAL_ERROR` novos (3, vocabulário desta Skill)

Grep prévio confirmou: nenhum equivalente existente nesta Skill (que
usa o vocabulário `*_CONFLICT`/`*_MISMATCH` já estabelecido, não um
bloco `FATAL_ERROR` formal, mesmo padrão do Ponto F1 acima).

```text
APPROVAL_GATE_SUBJECT_TYPE_MISMATCH
  → subjectType da ApprovalRequest não bate com o exigido pelo gateKey

APPROVAL_EVIDENCE_SUBJECT_MISMATCH
  → evidence item aponta para subject diferente do exato da ApprovalRequest

APPROVAL_EVIDENCE_BUNDLE_REPLAY_CONFLICT
  → mesma identidade lógica de bundle, conteúdo/provenance incompatível
```

`INCONCLUSIVE`/`MISSING_REQUIRED_EVIDENCE`/`NON_COMPLIANT` **nunca**
viram `FATAL_ERROR` — são outcomes normais de domínio/evidência, não
corrupção.

#### Critério de fechamento do Ponto S4

```text
1.  Skill 03 é owner do contrato de approval evidence.
2.  ApprovalGateKey enumera VIDEO_COMPLIANCE e FIRST_REAL_PUBLISH.
3.  VIDEO_COMPLIANCE vincula exact VideoArtifact.
4.  FIRST_REAL_PUBLISH vincula exact PublicationPlan (PATCH N5).
5.  VideoAuditResult é evidence, nunca subject do gate.
6.  ApprovalEvidenceOutcome existe e nunca reusa APPROVED/REJECTED.
7.  Mapeamento COMPLIANT/NON_COMPLIANT/INCONCLUSIVE é normativo nas duas specs.
8.  INCONCLUSIVE = INSUFFICIENT_EVIDENCE, nunca VIOLATES.
9.  ApprovalEvidenceItem existe, aponta pro subject exato.
10. ApprovalEvidenceBundle existe, tenant-scoped, imutável.
11. bundle referencia exact ApprovalRequest.
12. bundle referencia exact policy snapshot.
13. bundle subject = ApprovalRequest subject.
14. coverage distingue missing de inconclusive.
15. ApprovalDecision referencia exact bundle (obrigatório).
16. authorizationEvidenceRef (S1) continua separado de approvalEvidenceBundleRef.
17. FIRST_REAL_PUBLISH continua manual-only.
18. nenhum "latest audit"/"latest binding" é permitido.
19. nenhuma frase de defer mútuo 03↔12 permanece em nenhum dos dois arquivos.
20. no máximo 1 hash novo: APPROVAL_EVIDENCE_BUNDLE_V1.
21. lint valida mappings/gates/refs.
22. contract lint termina PASS.
```
