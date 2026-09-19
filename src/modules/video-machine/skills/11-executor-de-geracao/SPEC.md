# Skill 11 — Executor de Geração

> **APROVADA EM ESPECIFICAÇÃO — 11/25** (2026-09-18). Especificação/
> contrato. **Sem implementação ainda** — nenhuma migration, tabela, RPC,
> worker ou provider de vídeo foi criado. Este arquivo só vira código
> depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code,
> fundamentado em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`). A auditoria confirmou:
> zero código de chamada a Veo/qualquer provider de vídeo; o padrão de
> polling assíncrono existe **só como SPEC já aprovado da Skill 02**
> (`ExternalEffectState`), nunca em código real — os 2 crons reais
> existentes (`source-deals`, `publish-product`) são síncronos
> fire-and-forget, sem loop de poll; zero uso de Supabase Storage em
> qualquer lugar do repo; zero SDK Google AI instalado; zero precedente
> de retry/backoff (o cliente Shopee não tem nenhum); zero tabela
> relacionada a generation/video/media no banco live. **Restrição técnica
> real e não-negociável:** o cron existente roda com `maxDuration=60`
> segundos (`publish-product/route.ts`) — Veo tipicamente demora minutos
> para gerar um vídeo, então esta Skill precisa ser desenhada como state
> machine multi-tick desde a V1, nunca como long-poll dentro de uma
> única invocação.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B2)**: quando esta
> Skill é chamada em decorrência de uma correção (`CorrectionDirective`
> da Skill 13), ela executa em **nova `StageExecution`/novo Job** da
> `StageIteration` corrente — nunca reutiliza Job ou Attempt da geração
> anterior. Retry técnico (multi-tick/`CONTINUE`) dentro dessa nova
> operação continua obedecendo à Skill 02 normalmente — `logicalJobKey`
> agora inclui a identidade da `StageExecution`, então a mesma geração
> em iterações diferentes nunca colide. Ver "Reparo transversal
> pós-revisão Fable → Ponto D" no `SPEC.md` da Skill 01.
>
> **🔧 Adição pós-revisão Fable (achado B6)**: `spendAuthorizationRef`
> continua existindo com esse nome, mas sua semântica normativa agora
> é `ExecutionQuotaBinding.quotaAuthorizationId` (classe
> `EXECUTION_SPEND`) — `ExecutionQuotaBinding` + `QuotaExecutionClaim`
> são obrigatórios antes de `SUBMITTING`. Ver "Ponto E" no `SPEC.md`
> da Skill 23.

## Garantia central

Submeter um `VideoPromptArtifact` exato ao provider de geração de vídeo
(Veo, inicialmente), acompanhar a operação assíncrona até conclusão ou
falha definitiva, e persistir o vídeo resultante de forma durável e
auditável — **sem jamais duplicar cobrança, sem perder rastreabilidade
do estado externo, e sem inventar sucesso/fracasso quando o estado real é
desconhecido**.

> **Princípio arquitetural central:** uma invocação da Skill 11 nunca
> espera a geração terminar. Cada invocação executa **no máximo uma
> transição externa bounded** da geração — submit, reconcile, poll ou
> materialização — persiste toda a evidência obtida e devolve o controle
> à Skill 02. Isso elimina qualquer desenho do tipo `submit → while
> (!done) sleep/poll → download` — **proibido na V1**.

## Não é responsabilidade da Skill 11

- Não decide o conteúdo do prompt (Skill 10) nem "melhora"/reescreve o
  `ProviderInstruction` — executa exatamente o que foi persistido.
- Não audita a qualidade do vídeo gerado (Skill 12).
- Não decide quota/orçamento (Skill 23) — apenas reporta metadados de
  uso suficientes para contabilização posterior.
- Não decide credenciais — resolve por handle seguro (Skill 24), nunca
  manipula secret em texto plano.
- **Não duplica o lifecycle de Job da Skill 02.** A Skill 02 continua
  dona de `QUEUED`/`RUNNING`/`WAITING_EXTERNAL`/`RETRYING`/`BLOCKED`/
  `CANCEL_REQUESTED`/`SUCCEEDED`/`FAILED`/`CANCELLED` e de
  `externalEffectState` (`NOT_STARTED`/`SUBMITTING`/`CONFIRMED`/
  `UNKNOWN`) — a Skill 11 tem um estado **próprio da execução de vídeo**,
  distinto, reportado à Skill 02.
- **Não tem retry loop infinito próprio.** Reporta estados e evidências
  duráveis para a Skill 02 decidir o próximo passo (retry, block,
  cancel).

## Divisão de responsabilidades (evita mistura com Skill 02/23)

```text
Skill11 → sabe COMO executar uma geração específica
          submit / reconcile / poll / download / materialize artefato

Skill02 → sabe COMO controlar o ciclo do Job
          lease / attempt / retry / blocked / cancellation / deadlines

Skill23 → decide se há quota/crédito/autorização para gastar
```

## Arquitetura multi-tick

```text
JobAttempt da Skill02
  ↓
Skill11 tick #1 — SUBMIT
  ↓
persist operationId
  ↓
WAITING_EXTERNAL

cron futuro / nova lease
  ↓
Skill11 tick #2 — POLL
  ↓
ainda processando → WAITING_EXTERNAL

cron futuro / nova lease
  ↓
Skill11 tick #N — POLL
  ↓
provider COMPLETED
  ↓
persist evidência remota (REMOTE_SUCCEEDED)

tick seguinte, ou mesma invocação só se houver orçamento seguro
  ↓
DOWNLOAD / MATERIALIZE
  ↓
VideoArtifact durável
```

`VideoExecutionState` (próprio da Skill 11, distinto do lifecycle de Job
da Skill 02):

```typescript
type VideoExecutionState =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'REMOTE_SUCCEEDED'
  | 'REMOTE_FAILED'
  | 'MATERIALIZING'
  | 'MATERIALIZED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';
```

**Sem `SUCCEEDED` final de Job aqui.** `MATERIALIZED` significa apenas
que o vídeo tecnicamente produzido foi persistido duravelmente — a
Skill 12 ainda precisa auditá-lo antes de qualquer aprovação.

## Regra crítica de submit (invariante mais importante da Skill 11)

**Antes** da chamada externa paga, persistir duravelmente:
`providerRequestKey`, `VideoPromptArtifact` exato, provider/model/profile
exatos, generation parameters exatos, `state = SUBMITTING`, Skill 02
`externalEffectState = SUBMITTING`. **Só depois ocorre a rede.**

Resposta bem-sucedida: transação única grava `operationId`,
`state = SUBMITTED/PROCESSING`, Skill 02 `externalEffectState =
CONFIRMED`, `AuditEvent`.

Se o processo cair entre a chamada e esse commit: `SUBMITTING` sem
`operationId` persistido **não significa que o provider não recebeu o
pedido**. Resultado: `RECONCILE` ou `EXTERNAL_STATE_UNKNOWN` — **nunca**
"`operationId` está null, então submete de novo".

### `providerRequestKey`

Chave estável gerada **antes** da rede, identificando a tentativa lógica
externa (não cada HTTP request) — conceitualmente baseada em `tenantId`,
`jobId`, `attemptNumber`, `videoPromptArtifactId`,
`videoPromptArtifactHash`, `providerProfileVersion` (hash canônico exato
a definir no próximo bloco). Se o provider suportar idempotency key, ela
é enviada; se não suportar, ainda serve para reconciliação/auditoria
interna, mas não cria idempotência mágica no provider.

## Polling multi-tick

Polling pertence à **mesma** Attempt — submit = Attempt 1, poll #1/#2/#3
continuam Attempt 1. **Polling nunca incrementa `attemptNumber`.** Só uma
nova tentativa de geração autorizada pela Skill 02, após falha realmente
conhecida e política permitir, cria nova Attempt.

Nenhum `sleep()` ou backoff loop dentro da Skill 11. Ela devolve uma
diretiva:

```typescript
type VideoPollDirective = {
  pollAgain: boolean;
  nextEligiblePollAt?: string;
  providerSuggestedDelayMs?: number;
};
```

Valores concretos de delay (5s/10s/30s) não são congelados agora — sem
provider real validado.

**"Um tick = uma chamada" não é absoluto.** A regra correta: cada
invocação pode executar apenas uma fase externa bounded cujo tempo total
precisa respeitar com margem o orçamento do runtime atual. Quando um
poll retorna `COMPLETED`, pode ser seguro fazer o download na mesma
invocação se houver orçamento — mas a implementação nunca pode depender
disso. `REMOTE_SUCCEEDED` é um checkpoint durável válido por si só: se o
tempo estiver apertado, persiste `REMOTE_SUCCEEDED` e termina a
invocação; o tick seguinte faz `MATERIALIZING`. Isso torna o sistema
resiliente ao limite de 60s.

## Materialização do vídeo

Como Storage é greenfield, a URL de asset do provider **não é**
identidade do `VideoArtifact` — mesma lição da Skill 09. Fluxo: provider
informa sucesso → captura metadata/result refs → `state =
REMOTE_SUCCEEDED` → download dos bytes → validação técnica mínima →
calcula `contentHash` (`VIDEO_CONTENT_V1`, identidade binária, não
"schema hash") → persiste em storage durável → persiste metadata DB →
`state = MATERIALIZED`.

**Falha de materialização não significa nova geração.** Se o provider
concluiu com sucesso mas o download/storage falhou, o side effect caro
já ocorreu — é `REMOTE_SUCCEEDED → retry/reconcile MATERIALIZATION`,
nunca submissão de novo vídeo. `GENERATION retry` e `ARTIFACT
MATERIALIZATION retry` são conceitos separados — evita duplicação de
cobrança.

## Três grupos de resultado remoto

```text
1. Provider ainda processando (PENDING/RUNNING)
   → WAITING_EXTERNAL, próximo poll futuro

2. Provider retornou falha definitiva
   → REMOTE_FAILED, evidência durável da falha,
     reporta falha conhecida à Skill02,
     Skill02 decide retry conforme RetryPolicy

3. Estado ambíguo (timeout no submit, crash pós-submit,
   resposta ilegível sem saber se aceitou)
   → externalEffectState=UNKNOWN, JobStatus=BLOCKED,
     BlockReason=EXTERNAL_STATE_UNKNOWN, até reconciliação segura
   → NUNCA vira FAILED só para destravar retry
```

## `VideoGenerationProvider` (provider abstraction com side effects reais)

Diferente da Skill 10 (adapter puro), aqui o provider tem side effects
reais:

```typescript
interface VideoGenerationProvider {
  getCapabilities(): VideoGenerationProviderCapabilities;

  submit(input: VideoProviderSubmitInput): Promise<VideoProviderSubmitResult>;
  getStatus(input: VideoProviderStatusInput): Promise<VideoProviderStatusResult>;

  reconcile?(input: VideoProviderReconcileInput): Promise<VideoProviderReconcileResult>;
  getArtifact?(input: VideoProviderArtifactInput): Promise<VideoProviderArtifactResult>;
  cancel?(input: VideoProviderCancelInput): Promise<VideoProviderCancelResult>;
}

type VideoGenerationProviderCapabilities = {
  providerKey: string;

  supportsIdempotencyKey: boolean;
  supportsReconciliationByRequestKey: boolean;
  supportsOperationLookup: boolean;
  supportsCancellation: boolean;

  resultDelivery:
    | 'POLL'
    | 'WEBHOOK'
    | 'POLL_OR_WEBHOOK';

  artifactDelivery:
    | 'TEMPORARY_URL'
    | 'DIRECT_BYTES'
    | 'PROVIDER_ASSET_ID';
};
```

Capacidades específicas de Veo não são inventadas agora. O contrato não
é hardcoded para polling-only mesmo que a V1 provavelmente use polling —
`resultDelivery` já contempla um futuro webhook (provider webhook →
atualiza execução com evidência autenticada → próximo tick materializa)
sem quebrar o modelo.

## Cancelamento

A Skill 02 já possui `CANCEL_REQUESTED` — a Skill 11 consome isso. Mas
cancelar localmente **não significa que o provider parou**. Se o
provider suporta cancelamento: `CANCEL_REQUESTED → provider.cancel(
operationId) → confirmar estado remoto → CANCELLED`. Se não suportar:
ainda é preciso saber o desfecho remoto antes de perder rastreabilidade
de um asset potencialmente cobrado — `local cancellation intent` e
`provider cancellation confirmation` são conceitos separados;
`CANCELLED` nunca é assumido automaticamente sem evidência.

## Restrição de runtime (Vercel)

> No ambiente auditado atual, as rotas cron existentes operam com
> `maxDuration=60s`. A Skill 11 V1 deve ser correta sob execuções curtas
> e interrompíveis; nenhuma transição pode depender de manter uma
> request aberta durante toda a geração de vídeo.

> A arquitetura deve permanecer válida se o limite de runtime aumentar
> futuramente; aumento de timeout pode otimizar o número de ticks, mas
> não remove os checkpoints duráveis nem transforma long-poll em
> requisito.

## Status de implementação (nesta fase de especificação)

```text
Video provider runtime            → NOT_IMPLEMENTED
Google/Veo SDK                    → NOT_INSTALLED
Video provider credentials        → NOT_CONFIGURED
Polling runtime                   → NOT_IMPLEMENTED
Video persistence tables          → NOT_IMPLEMENTED
Supabase Storage usage            → NOT_IMPLEMENTED
Video cron                        → NOT_IMPLEMENTED
Retry/backoff implementation      → NOT_IMPLEMENTED
```

Reaproveitado como modelo autoritativo já aprovado:
`Skill02 async-job contract` (`externalEffectState`, lifecycle de Job).

## Contratos canônicos

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


Princípio geral: `JobAttempt` (Skill 02) continua sendo a autoridade de
lifecycle, lease, retry e cancelamento; `VideoGenerationExecution` guarda
apenas a verdade da execução **daquele vídeo** no provider. Nenhum
contrato abaixo duplica `JobStatus`, `RetryPolicy`, `attemptsRemaining`,
`leaseOwner`, `leaseExpiresAt`, `leaseFence` ou `externalEffectState` —
esses continuam exclusivamente na Skill 02.

### `VideoGenerationExecution`

Relação V1: 1 `JobAttempt` da Skill 11 → 0..1 `VideoGenerationExecution`
(depois que a Skill 11 começa: exatamente 1). `UNIQUE` lógico:
`(jobId, attemptNumber)`.

```typescript
type VideoGenerationExecution = {
  videoGenerationExecutionId: string;

  tenantId: string;
  runId: string;

  jobId: string;
  attemptNumber: number;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  // PATCH (Ponto S2, reparo transversal pós-revisão Fable, 2026-09-18):
  // provenance explícita mesmo quando nenhuma imagem é enviada ao
  // provider (EMPTY/NO_FRAME_REQUIRED, EMPTY/REFERENCE_UNAVAILABLE,
  // EMPTY/TEXT_TO_VIDEO) — não fabricar upload de imagem/placeholder
  // pra set vazio; a ausência é explícita via content.kind='EMPTY' no
  // artifact referenciado, não por ausência deste campo.
  productVisualReferenceSetRef: ProductVisualReferenceSetRef;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerKey: string;
  modelKey: string;

  providerRequestKey: string;

  // PATCH (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18):
  // obrigatório antes da primeira operação de rede autenticada
  // (SUBMITTING). Achado S15 do Fable: a Skill 24 prometia que esta
  // Skill consumia IntegrationCredentialHandleRef, mas o campo nunca
  // existiu aqui de fato. Congela quando a operação SUBMITTING é
  // persistida — não muda depois do side effect (se outra credencial
  // precisar ser usada, é nova execução, não UPDATE deste campo).
  // Revalidado pela Skill 24 antes de cada nova chamada externa em
  // ticks de poll subsequentes, mas permanece o mesmo handle lógico
  // pra mesma provider operation (rotação de segredo não troca a
  // identidade do handle — ver Skill 24 "Credential-handle
  // consumption boundary").
  credentialHandleRef: IntegrationCredentialHandleRef; // ref cruzada, definida na Skill 24

  state: VideoExecutionState;

  providerSubmissionId?: string;
  providerOperationRecordId?: string;
  remoteGenerationResultId?: string;
  videoArtifactId?: string;

  createdAt: string;
  updatedAt: string;
};
```

`VideoExecutionState` não é cópia de `JobStatus` — responde a pergunta
"em que fase factual da execução deste vídeo estamos?", enquanto
`JobStatus` responde "o que a Skill 02 deve fazer com este Job?".

### Relação exata com `JobAttempt`

A Skill 11 sempre recebe contexto autorizado pela Skill 02:

```typescript
type VideoExecutionJobContext = {
  jobId: string;
  attemptNumber: number;

  leaseFence: number;

  leasePurpose:
    | 'EXECUTE_NEW_ATTEMPT'
    | 'POLL_EXISTING_ATTEMPT'
    | 'HANDLE_CANCELLATION';

  expectedJobVersion: number;
};
```

Regra: nenhuma transição da Skill 11 que dependa de um Job ativo pode ser
aceita se o `leaseFence` não for mais o fence corrente da Skill 02.
`EXECUTE_NEW_ATTEMPT` → PREPARED/SUBMIT; `POLL_EXISTING_ATTEMPT` →
reconcile/poll/materialization de Attempt existente (não precisa ser
literalmente HTTP poll); `HANDLE_CANCELLATION` → cancelamento
remoto/reconciliação de cancelamento.

### Correspondência com `externalEffectState` (sem segunda fonte de verdade)

`Skill02.externalEffectState` responde "sabemos se o side effect externo
ocorreu?"; `VideoExecutionState` responde "qual estágio específico da
geração conhecemos?".

```text
Skill11 (VideoExecutionState)  →  Skill02 (externalEffectState)
PREPARED                       →  NOT_STARTED
SUBMITTING                     →  SUBMITTING
SUBMITTED                      →  CONFIRMED
PROCESSING                     →  CONFIRMED
REMOTE_SUCCEEDED               →  CONFIRMED
REMOTE_FAILED                  →  CONFIRMED
MATERIALIZING                  →  CONFIRMED
MATERIALIZED                   →  CONFIRMED
estado ambíguo pós-submit      →  UNKNOWN
```

`UNKNOWN` **não** é adicionado a `VideoExecutionState` — numa
ambiguidade, a execução permanece `SUBMITTING`; quem expressa
formalmente a incerteza do efeito é a Skill 02
(`externalEffectState=UNKNOWN`, `JobStatus=BLOCKED`,
`BlockReason=EXTERNAL_STATE_UNKNOWN`). Isso evita duas fontes de verdade
para a mesma ambiguidade.

### `ProviderSubmission`

Representa a **submissão lógica**, não cada tentativa de transporte
HTTP.

```typescript
type ProviderSubmission = {
  providerSubmissionId: string;

  tenantId: string;

  videoGenerationExecutionId: string;

  providerRequestKey: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  providerKey: string;
  modelKey: string;

  requestPayloadHash: string;

  idempotencyMode:
    | 'PROVIDER_IDEMPOTENCY_KEY'
    | 'RECONCILIATION_ONLY'
    | 'NO_SAFE_RESUBMISSION';

  providerIdempotencyKey?: string;

  preparedAt: string;

  dispatchStartedAt?: string;

  providerResponseHash?: string;
  responseCapturedAt?: string;
};
```

Invariante: `UNIQUE(videoGenerationExecutionId)`,
`UNIQUE(tenantId, providerRequestKey)`. Antes da rede, já devem existir
de forma durável: `VideoGenerationExecution` + `ProviderSubmission` +
`providerRequestKey` + `requestPayloadHash` +
`execution.state=SUBMITTING` + `Skill02.externalEffectState=SUBMITTING`
— o commit vem antes da chamada paga.

Hash: `VIDEO_PROVIDER_SUBMISSION_REQUEST_V1` sobre a representação
canônica do payload a ser enviado, excluindo secret/Authorization
header/timestamps de transporte/request tracing volátil, mas incluindo
tudo que muda semanticamente a geração.

**Regra crítica:** mesmo `providerRequestKey` + `requestPayloadHash`
diferente → `VIDEO_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT` (FATAL_ERROR)
— nunca enviar uma carga diferente com a mesma chave lógica.

### Resubmissão segura

`ProviderSubmission` é uma submissão lógica — pode haver mais de um HTTP
dispatch da mesma submissão **somente** quando o provider oferece
idempotência real ou reconciliação que prove que repetir é seguro:

```text
provider suporta idempotency key
+ mesma providerRequestKey + mesmo requestPayloadHash
→ retransmissão continua sendo a MESMA ProviderSubmission, não cria
  nova Attempt

provider não suporta idempotência + submit ficou ambíguo
→ NÃO cria segunda ProviderSubmission, NÃO faz submit novamente
→ reconcile ou EXTERNAL_STATE_UNKNOWN
```

Uma nova geração paga de verdade exige nova `JobAttempt` criada pela
Skill 02 e, consequentemente, nova `VideoGenerationExecution`.

### `ProviderOperation`

Só existe depois que há um handle remoto confiável.

```typescript
type ProviderOperation = {
  providerOperationRecordId: string;

  tenantId: string;

  videoGenerationExecutionId: string;
  providerSubmissionId: string;

  providerKey: string;

  providerOperationId: string; // identidade externa do provider

  acceptedAt: string;

  lastObservationId?: string;
  lastObservedAt?: string;

  createdAt: string;
};
```

Invariantes: `UNIQUE(videoGenerationExecutionId)`,
`UNIQUE(tenantId, providerKey, providerOperationId)`.
`providerOperationRecordId` é identidade interna; `providerOperationId` é
identidade externa. Se um reconcile posterior descobrir a operação
criada durante um submit ambíguo (`SUBMITTING`/`UNKNOWN` →
`reconcile(providerRequestKey)` → encontra `providerOperationId` → cria
`ProviderOperation` → `externalEffectState=CONFIRMED` → execução segue
normalmente) — **mesma Attempt, nenhuma nova geração**.

### `ProviderOperationObservation` (append-only, evidência de polling)

```typescript
type ProviderOperationObservation = {
  providerOperationObservationId: string;

  tenantId: string;

  videoGenerationExecutionId: string;
  providerOperationRecordId: string;

  remoteState:
    | 'QUEUED'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';

  providerResponseHash: string;

  providerSuggestedPollAfterMs?: number;

  observedAt: string;
};
```

Cada poll/reconcile relevante gera uma observação append-only —
`ProviderOperation.lastObservationId` é só cache/conveniência, a
evidência histórica permanece imutável (prova o que o provider respondeu
em cada tick, em vez de sobrescrever `PROCESSING → PROCESSING →
SUCCEEDED` sem histórico).

**Polling idempotente:** o mesmo status pode aparecer várias vezes — não
é erro. Observações repetidas podem existir, mas uma resposta idêntica
não causa transições lógicas repetidas (`VideoExecutionState` continua o
mesmo, nenhum `AuditEvent` lógico duplicado). Só quando o estado muda
(ex.: `PROCESSING → SUCCEEDED`) ocorre transição lógica auditável.

### `RemoteGenerationResult`

Só aparece quando o provider informou estado terminal conhecido —
discriminated union:

```typescript
type RemoteGenerationResult =
  | RemoteGenerationSucceeded
  | RemoteGenerationFailed
  | RemoteGenerationCancelled;

type RemoteGenerationSucceeded = {
  remoteGenerationResultId: string;
  resultStatus: 'SUCCEEDED';

  tenantId: string;

  videoGenerationExecutionId: string;
  providerOperationRecordId: string;

  terminalObservationId: string;
  providerResponseHash: string;

  remoteAssets: Array<{
    providerAssetId?: string;
    temporaryAssetRef?: string;

    declaredMimeType?: string;
    declaredSizeBytes?: number;
  }>;

  resultHash: string;

  observedAt: string;
};

type RemoteGenerationFailed = {
  remoteGenerationResultId: string;
  resultStatus: 'FAILED';

  tenantId: string;

  videoGenerationExecutionId: string;
  providerOperationRecordId: string;

  terminalObservationId: string;
  providerResponseHash: string;

  providerErrorCode?: string;
  providerErrorCategory?: string;
  sanitizedProviderMessage?: string;

  resultHash: string;

  observedAt: string;
};

type RemoteGenerationCancelled = {
  remoteGenerationResultId: string;
  resultStatus: 'CANCELLED';

  tenantId: string;

  videoGenerationExecutionId: string;
  providerOperationRecordId: string;

  terminalObservationId: string;
  providerResponseHash: string;

  resultHash: string;

  observedAt: string;
};
```

Hash: `REMOTE_GENERATION_RESULT_V1` — a mensagem original completa do
provider não entra no hash; usa versão normalizada/sanitizada.

**Uma saída por geração na V1:** `Skill 11 V1 → exatamente 1
VideoArtifact canônico por VideoGenerationExecution`, mesmo que o
contrato de provider devolva `remoteAssets[]`. Se um provider
inesperadamente devolver vários outputs sem regra determinística
previamente congelada → `VIDEO_PROVIDER_MULTIPLE_OUTPUTS_UNSUPPORTED` —
a Skill 11 nunca escolhe "o mais bonito" (isso seria decisão criativa,
não execução). A Skill 20 poderá tratar variações futuramente por
execuções distintas.

### `VideoArtifact`

Só nasce depois da materialização durável.

```typescript
type VideoArtifact = {
  videoArtifactId: string;

  tenantId: string;
  runId: string;

  jobId: string;
  attemptNumber: number;

  videoGenerationExecutionId: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerKey: string;
  modelKey: string;

  providerSubmissionId: string;
  providerOperationRecordId: string;

  remoteGenerationResultId: string;
  remoteGenerationResultHash: string;

  contentHash: string;

  storageRef: string;

  mimeType: string;
  sizeBytes: number;

  width?: number;
  height?: number;
  durationMs?: number;

  technicalValidation: {
    nonEmpty: boolean;
    decodableContainer: boolean;
    mimeTypeAllowed: boolean;
  };

  materializedAt: string;
};
```

Invariantes: `UNIQUE(videoGenerationExecutionId)`;
`technicalValidation.{nonEmpty,decodableContainer,mimeTypeAllowed} =
true`; `contentHash = sha256(bytes exatos persistidos em storageRef)`.
**Não incluído aqui:** `visualQualityScore`, `productFidelityScore`,
`creativeQuality`, `approval` — pertence à Skill 12/03.

`contentHash` é a identidade do vídeo — não se cria outro hash de
conteúdo visual. O restante da proveniência já está congelado por
`videoPromptArtifactHash` + `requestPayloadHash` (na
`ProviderSubmission`) + `remoteGenerationResultHash` + `contentHash`. Um
hash agregador adicional de `VideoArtifact` não é necessário.

**PATCH (Ponto S9 — reparo transversal pós-revisão Fable, 2026-09-18).**
Skill 11 é writer autorizado de `ProductUsageEvidence.usageKind =
'MATERIALIZED'` (contrato/owner: `04-descoberta-de-produtos/SPEC.md`,
hash `PRODUCT_USAGE_EVIDENCE_V1`) — Skill 11 nunca redeclara o tipo,
só referencia. Emite a evidência quando `Job SUCCEEDED` +
`VideoArtifact` durável realmente materializado (todos os
`technicalValidation` verdadeiros) + lineage de produto resolvida —
nunca em `ACCEPTED`/`SUBMITTING`/`externalEffectState=UNKNOWN`. Nunca
emite `PRIMARY_PUBLISHED` (fora da matriz de writers da Skill 04).
`evidenceRef` = exact `VideoArtifact` ref (`videoArtifactId` +
`contentHash`). `usedAt` deriva de `VideoArtifact.materializedAt` —
nunca outro relógio. Skill 11 não espera o veredito da Skill 12: um
vídeo pode estar `MATERIALIZED` e depois `NON_COMPLIANT`; o fato
histórico permanece verdadeiro.

**PATCH (Ponto S6 — reparo transversal pós-revisão Fable, 2026-09-18,
`VIDEO_COMPOSITION_V1`).** Redefinição normativa: `VideoArtifact`
representa um **vídeo candidato completo e semanticamente autônomo**
— nunca um clip/segmento parcial que seria concatenado posteriormente
com outros. Sem `VideoClipSet`/`BeatClipCollection`/`GeneratedSegments`
no V1. Para cada work unit (creative variant + beat único, Ponto S5):
1 `VideoGenerationExecution` → 1 `VideoArtifact`. Nunca esconder
assembly no provider adapter — proibido "adapter chama modelo N vezes,
concatena internamente, retorna 1 `VideoArtifact`" sem o pipeline
saber. Provider pode gerar múltiplos shots/movimentos internos numa
única solicitação — isso continua `single-beat/single-generation`,
perfeitamente permitido.

**PATCH (Ponto S7 — reparo transversal pós-revisão Fable, 2026-09-18,
`EXECUTION_RUNTIME_V1`, contrato completo em
`contracts/EXECUTION-RUNTIME.md`).** O `SkillJobHandler` da Skill 11
executa exclusivamente em `VIDEO_MACHINE_WORKER_V1` (`DURABLE_WORKER`)
— nunca na Vercel. O desenho oficial de polling de provider
(`submit generation → CONTINUE → release → later claim same Attempt →
poll`) já descrito acima é exatamente o mecanismo que S7 formaliza:
cada poll é um handler tick discreto da mesma `Attempt` (Ponto B da
Skill 02) — nunca um loop bloqueando o processo do worker. `CONTINUE`
libera o worker pra outro Job; a próxima elegibilidade usa
`nextPollAt` já existente (Skill 02), sem scheduler paralelo. Download
de asset remoto (bloco abaixo) usa streaming direto
provider/storage → scratch/object storage — nunca atravessa a Vercel.

### Sequência de materialização

```text
RemoteGenerationResult = SUCCEEDED
→ execution.state = REMOTE_SUCCEEDED
→ obter asset remoto
→ validar resposta/download
→ baixar bytes
→ calcular contentHash
→ persistir blob em Storage durável
→ transação DB: VideoArtifact + execution.state=MATERIALIZED +
  execution.videoArtifactId + AuditEvent
```

Mesma lição da Skill 09: blob gravou + DB falhou → blob órfão possível,
cleanup posterior, **nenhum** `VideoArtifact` canônico.
`RemoteGenerationResult=SUCCEEDED` + Storage temporariamente falhou →
**não** submeter novo vídeo, continuar a mesma Attempt, repetir somente
`MATERIALIZATION`.

**Distinção textual obrigatória:** `REMOTE_SUCCEEDED` = provider
concluiu a geração; `MATERIALIZED` = nós possuímos o vídeo de forma
durável. O sucesso terminal de Job da Skill 11 só ocorre após
`MATERIALIZED`. Ainda assim, **sucesso da Skill 11 ≠ vídeo aprovado** —
a Skill 12 ainda audita o artefato.

### `VideoExecutionDirective` (relatório da Skill 11 para a Skill 02)

A Skill 11 reporta fatos; a Skill 02 decide lifecycle. Não é outra
máquina de Job.

```typescript
type VideoExecutionDirective =
  | { kind: 'WAIT_FOR_EXTERNAL'; nextEligiblePollAt?: string }
  | { kind: 'CONTINUE_EXISTING_ATTEMPT' }
  | { kind: 'BLOCK_EXTERNAL_STATE_UNKNOWN' }
  | { kind: 'REMOTE_FAILURE_CONFIRMED'; remoteGenerationResultId: string }
  | { kind: 'MATERIALIZED'; videoArtifactId: string }
  | { kind: 'CANCELLATION_PENDING' }
  | { kind: 'CANCELLED_CONFIRMED' };
```

Correspondência: `WAIT_FOR_EXTERNAL` → Skill 02 mantém Attempt não
terminal (normalmente `WAITING_EXTERNAL`); `CONTINUE_EXISTING_ATTEMPT` →
mesma Attempt recebe novo tick, sem incrementar `attemptNumber`;
`BLOCK_EXTERNAL_STATE_UNKNOWN` → `BLOCKED`/`EXTERNAL_STATE_UNKNOWN`;
`REMOTE_FAILURE_CONFIRMED` → falha externa conhecida, Skill 02 aplica
`RetryPolicy`; `MATERIALIZED` → execução da Skill 11 concluída
tecnicamente, `JobResultEvent` de sucesso; `CANCELLED_CONFIRMED` →
evidência para a Skill 02 concluir cancelamento quando demais invariantes
permitirem.

### Nova Attempt — regra explícita

```text
VideoGenerationExecution A (jobId=J1, attemptNumber=1)
→ provider falhou definitivamente
→ Skill02 avalia RetryPolicy
→ se retry autorizado: Attempt 2
→ NOVA VideoGenerationExecution B, NOVA providerRequestKey,
  NOVA ProviderSubmission
```

Por outro lado, poll/reconcile/download/storage retry/cancel check
**continuam na Attempt 1** — esses eventos nunca incrementam
`attemptNumber`.

### Cancelamento

`Job CANCEL_REQUESTED` → Skill 11 recebe `HANDLE_CANCELLATION`. Se a
operação ainda nem foi submetida (`PREPARED`) → pode encerrar localmente
sem side effect externo. Se o provider possui operação e
`supportsCancellation=true` → `cancel(operationId)` → registra
observação → só marca `CANCELLED` após confirmação remota. Se não
suportar: `local cancellation intent ≠ remote cancellation`. Se o vídeo
terminar mesmo após cancelamento local, pode ser necessário preservar
evidência/asset já cobrado — mas ele nunca avança o pipeline como
produção ativa de um Run cancelado (regra de materialização tardia da
Skill 01 continua valendo).

### Decisão: sem `VideoGenerationCheckpoint` separado

Um contrato genérico de checkpoint duplicaria `VideoGenerationExecution`
+ `ProviderSubmission` + `ProviderOperation` +
`ProviderOperationObservation` + `RemoteGenerationResult` +
`VideoArtifact` — esses próprios registros já são checkpoints duráveis e
semanticamente específicos.

### Cadeia canônica completa

```text
JobAttempt (Skill 02)
  ↓
VideoPromptArtifact (Skill 10)
  ↓
VideoGenerationExecution
  ↓
ProviderSubmission
  ↓
ProviderOperation
  ↓
ProviderOperationObservation[]
  ↓
RemoteGenerationResult
  ↓
VideoArtifact
```

Em paralelo, fora deste agregado: `Skill02 JobStatus / Retry / Lease /
Fence / externalEffectState`. Essa separação fecha a fronteira entre
orquestração de Attempt e evidência da execução paga no provider, sem
duas máquinas concorrentes.

## Erros

> Nota de nomenclatura: `VIDEO_CONTENT_V1` é convenção de identidade
> binária (`contentHash = sha256(bytes)`), não hash canônico de
> JSON/metadados. Os hashes canônicos propriamente ditos são
> `VIDEO_PROVIDER_SUBMISSION_REQUEST_V1` e `REMOTE_GENERATION_RESULT_V1`.

Aqui a classificação é especialmente rígida: um erro mal classificado
pode virar segunda cobrança.

### `FATAL_ERROR`

Violações de contrato, autoridade ou integridade — retry automático da
mesma Attempt não resolve.

```text
VIDEO_EXECUTION_TENANT_MISMATCH
VIDEO_EXECUTION_JOB_CONTEXT_MISMATCH
VIDEO_PROMPT_ARTIFACT_NOT_FOUND
VIDEO_PROMPT_ARTIFACT_MISMATCH
VIDEO_PROMPT_ARTIFACT_HASH_MISMATCH

VIDEO_PROVIDER_PROFILE_NOT_FOUND
VIDEO_PROVIDER_PROFILE_MISMATCH
VIDEO_PROVIDER_PROFILE_SNAPSHOT_MISMATCH

VIDEO_EXECUTION_ALREADY_EXISTS_CONFLICT
VIDEO_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT

VIDEO_PROVIDER_OPERATION_CONFLICT
VIDEO_PROVIDER_OPERATION_OWNERSHIP_MISMATCH

VIDEO_PROVIDER_PROTOCOL_INVALID
VIDEO_PROVIDER_TERMINAL_RESPONSE_INVALID
VIDEO_PROVIDER_MULTIPLE_OUTPUTS_UNSUPPORTED

VIDEO_REMOTE_RESULT_CONFLICT

VIDEO_ARTIFACT_CONTENT_HASH_CONFLICT
VIDEO_ARTIFACT_REPLAY_CONFLICT

VIDEO_INVALID_EXECUTION_STATE_TRANSITION
VIDEO_UNAUTHORIZED_EXECUTION_PHASE
```

Exemplos: mesmo `providerRequestKey` + `requestPayloadHash` diferente →
`FATAL`; mesmo `operationId` remoto tentando pertencer a outra execução
→ `FATAL`.

### `RETRYABLE_ERROR`

Só entram aqui falhas em que repetir aquela operação específica não cria
nova geração paga, ou quando há prova explícita de que o submit não foi
aceito.

```text
VIDEO_PRE_SUBMIT_TRANSIENT_ERROR

VIDEO_PROVIDER_POLL_TRANSIENT_ERROR
VIDEO_PROVIDER_RECONCILE_TRANSIENT_ERROR

VIDEO_PROVIDER_ARTIFACT_FETCH_TRANSIENT_ERROR

VIDEO_ARTIFACT_STORAGE_TRANSIENT_ERROR
VIDEO_ARTIFACT_METADATA_PERSIST_TRANSIENT_ERROR

VIDEO_PROVIDER_CANCEL_TRANSIENT_ERROR

TRANSIENT_DATASTORE_ERROR
```

`TRANSIENT_DATASTORE_ERROR` é **contextual**: antes do submit, DB falhou
→ nenhum side effect externo → retry seguro. Depois de chamar o provider
e antes de confirmar o resultado, DB falhou → **não** pode assumir retry
seguro do submit → entra na lógica de reconciliação/`UNKNOWN`.

> **Regra crítica:** a classificação `RETRYABLE_ERROR` nunca, por si só,
> autoriza repetir um submit potencialmente pago. A segurança de
> resubmissão depende de evidência de não processamento, idempotência
> real do provider ou reconciliação conclusiva.

### Estados `BLOCKED`

**Efeito externo desconhecido:**

```text
VIDEO_GENERATION_EXTERNAL_STATE_UNKNOWN
→ JobStatus=BLOCKED, BlockReason=EXTERNAL_STATE_UNKNOWN
```

Cenários: timeout no submit sem saber se o provider aceitou; crash após
dispatch antes de `operationId` persistido; resposta ambígua; provider
sem idempotência nem reconcile suficiente. **Nunca** vira `REMOTE_FAILED`
só para liberar retry.

**Asset irrecuperável:** `VIDEO_PROVIDER_ASSET_UNRECOVERABLE` — provider
= `SUCCEEDED`, asset temporário expirou, provider confirma que a geração
aconteceu, não há endpoint de recuperação. A geração já ocorreu e pode
ter sido cobrada → não gerar novamente automaticamente → `BLOCKED` →
intervenção/policy posterior.

**Cancelamento remoto desconhecido:** `VIDEO_CANCELLATION_STATE_UNKNOWN`
— somente quando o pedido de cancelamento foi enviado mas não
conseguimos determinar se o provider cancelou ou continuou. Não
transforma em `CANCELLED` sem evidência.

### Caso à parte: fence stale (não é fatal/retryable/blocked)

```text
VIDEO_STALE_LEASE_FENCE
→ leaseFence != current fence → rejeitar mutação, encerrar worker
```

Isso **não** deve falhar o Job — é proteção normal de concorrência.
Documentado como `CONCURRENCY_GUARD`/`SAFE_ABORT` e métrica operacional,
não erro de negócio.

### Falha remota conhecida não é erro interno

`RemoteGenerationResult.resultStatus='FAILED'` **não** é equivalente a
`FATAL_ERROR` da Skill 11 — significa "o provider afirmou
conclusivamente que esta geração falhou". A Skill 11 produz
`REMOTE_FAILURE_CONFIRMED` e a Skill 02 aplica `RetryPolicy`. Se uma
Attempt 2 for autorizada, aí sim temos nova geração, nova autorização de
custo, nova execution e nova submission.

## Multi-tenant

Fonte de confiança: `trustedTenantId = Job.tenantId`. Devem corresponder
obrigatoriamente: `VideoPromptArtifact`, `VideoGenerationExecution`,
`ProviderSubmission`, `ProviderOperation`, `ProviderOperationObservation`,
`RemoteGenerationResult`, `VideoArtifact`, `ProductVisualReferenceSet`
(Ponto S2 — referenciado por `productVisualReferenceSetRef`), provider
profile/configuração resolvida, credencial resolvida pela Skill 24,
autorização de custo/quota. Divergência →
`VIDEO_EXECUTION_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de
segurança).

**Operação remota:** nunca fazer lookup por `providerOperationId`
isoladamente — a identidade interna sempre preserva contexto
(`tenantId + providerKey + providerOperationId`), já alinhado com a
unique key congelada.

**Storage:** o artefato é tenant-scoped — `storageRef` deve pertencer ao
tenant da execução. Mesmo que dois tenants produzam `contentHash`
idêntico, V1 não autoriza dedupe cross-tenant nem compartilhar
`storageRef`.

**Credencial compartilhada de plataforma:** `PLATFORM_MANAGED` não torna
as execuções globais — mesma API key física, mas execution/quota
authorization/providerRequestKey/billing attribution/artifact/audit
continuam tenant-scoped.

**Webhook futuro e tenant:** um webhook nunca confia em `tenantId`
recebido no body como fonte de autoridade. Fluxo: verificar
autenticidade/assinatura do provider → extrair
`providerOperationId`/request identifier → resolver `ProviderOperation`
internamente → obter `tenantId` da nossa persistência → só então mutar a
execução. Webhook inválido → zero mutação.

## Fronteira Skill 11 × Skill 23 — custo e quota

**Skill 23 decide:** há quota? há crédito? o tenant pode gastar? há teto
diário/mensal? esta operação está autorizada? **Skill 11 executa:** só
responde "tenho autorização válida para executar este side effect
potencialmente pago?" — não calcula saldo, não altera limite, não decide
orçamento.

Sequência obrigatória antes de um novo submit pago:

```text
Skill02 cria/autoriza Attempt
→ Skill11 prepara payload exato
→ requestPayloadHash
→ QuotaGuard / Skill23
→ autorização durável
→ ProviderSubmission persistida
→ SUBMITTING
→ rede
```

`ProviderSubmission` ganha uma referência opaca:
`spendAuthorizationRef?: string` (sem definir agora o contrato interno
da Skill 23).

> **Invariante:** todo submit potencialmente pago deve estar ligado a
> uma autorização durável de gasto válida para aquela Attempt e payload
> lógico.

A autorização deve, no mínimo, poder ser validada contra `tenantId`,
`jobId`, `attemptNumber`, `providerKey`, `modelKey`,
`videoPromptArtifactId`, `videoPromptArtifactHash`, `requestPayloadHash`
— nunca algo genérico como "tenant tem R$50" sem vínculo com a operação.

**Retransmissão idempotente não consome nova autorização:** HTTP falha →
retransmite a MESMA submission (mesma `providerRequestKey`, mesmo
`requestPayloadHash`, mesma autorização) → não cria nova reserva só
porque houve segundo HTTP dispatch.

**Nova Attempt exige nova autorização:** Attempt 1 falha definitivamente
→ Skill 02 autoriza retry → Attempt 2 → nova
`VideoGenerationExecution`/`providerRequestKey`/`ProviderSubmission`/
autorização Skill 23. Nunca reutilizar autorização da Attempt 1 para uma
geração logicamente nova.

**Poll/materialização normalmente não consomem quota de geração** — não
são novas gerações. Extensão futura-safe nas capabilities do provider:

```typescript
type VideoProviderOperationKind =
  | 'SUBMIT'
  | 'POLL'
  | 'RECONCILE'
  | 'ARTIFACT_FETCH'
  | 'CANCEL';

// adicionado a VideoGenerationProviderCapabilities:
// potentiallyBillableOperations: VideoProviderOperationKind[];
```

Regra: qualquer operação marcada como potencialmente cobrável pelo
adapter/provider também passa pelo guard apropriado antes da rede — na
V1 real isso será preenchido quando o provider for conhecido; não
inventamos hoje que só `SUBMIT` cobra.

**Evidência de custo real:** se o provider retornar `usage`/
`creditsConsumed`/`price`/`billingUnit`, a Skill 11 pode capturar
evidência, mas não interpretá-la como saldo. Regra: "provider não
informou custo" ≠ "custo zero" → custo desconhecido, Skill 23/21
reconciliam depois. Não congelamos ainda um `ProviderBillingEvidence`
completo — pertence à especificação da Skill 23. Na Skill 11 basta
declarar que metadados de billing disponíveis são preservados de forma
sanitizada e referenciável.

**Cancelamento não presume estorno:** provider confirmou `CANCELLED` não
significa custo=0, quota devolvida ou provider estornou. A Skill 11
registra cancelamento factual; a Skill 23 decide reconciliação financeira
conforme evidência do provider.

## Observabilidade

### Logs estruturados (por tick)

`tenantId`, `runId`, `jobId`, `attemptNumber`,
`videoGenerationExecutionId`, `leasePurpose`, `leaseFence`,
`videoPromptArtifactId`, `videoPromptArtifactHash`, `providerProfileKey`,
`providerProfileVersion`, `providerKey`, `modelKey`,
`videoExecutionState`, `providerSubmissionId?`, `providerRequestKey?`,
`providerOperationRecordId?`, `remoteGenerationResultId?`,
`videoArtifactId?`, `externalEffectState`, `tickKind`
(`SUBMIT`/`RECONCILE`/`POLL`/`MATERIALIZE`/`CANCEL`), `durationMs`,
`remoteState?`, `errorCode?`.

Nunca logado por padrão: API key, OAuth token, Authorization, provider
payload completo, prompt completo, `temporaryAssetRef` completo,
`providerOperationId` bruto (usar IDs internos para operação diária).

### `AuditEvent` — só para mudança lógica

Não para todo poll repetido (isso já é coberto por
`ProviderOperationObservation[]` append-only). Criado em:
`PREPARED→SUBMITTING`, `SUBMITTING→SUBMITTED`, `SUBMITTED→PROCESSING`,
`PROCESSING→REMOTE_SUCCEEDED`, `PROCESSING→REMOTE_FAILED`,
`REMOTE_SUCCEEDED→MATERIALIZING`, `MATERIALIZING→MATERIALIZED`,
`externalEffectState→UNKNOWN`, `reconcile UNKNOWN→CONFIRMED`, cancel
request externo, cancel confirmado, tenant mismatch, payload conflict,
operation conflict, artifact conflict.

### Métricas

```text
Submit:
video_submit_total
video_submit_confirmed_total
video_submit_ambiguous_total
video_submit_reconciliation_success_total
video_duplicate_submit_prevented_total

Polling:
video_poll_total
video_poll_processing_total
video_poll_terminal_total
video_poll_transient_error_total

Tempos:
video_submit_to_operation_confirmed_duration
video_operation_to_remote_terminal_duration
video_remote_success_to_materialized_duration
video_total_execution_duration

Materialização:
video_materialization_total
video_materialization_success_total
video_materialization_retry_total
video_materialization_failure_total
video_orphan_blob_detected_total

Integridade:
video_external_state_unknown_total
video_provider_asset_unrecoverable_total
video_payload_conflict_total
video_operation_conflict_total
video_artifact_replay_conflict_total
video_stale_fence_rejected_total

Quota/custo:
video_quota_blocked_total
video_spend_authorization_missing_total
video_provider_billing_evidence_available_rate
```

Sem calcular receita/lucro aqui.

## Plano de testes

**Autoridade/contratos:** (1) Job aponta para `VideoPromptArtifact`
inexistente → fatal. (2) `videoPromptArtifactHash` divergente → fatal.
(3) provider profile inexistente → fatal. (4) provider profile snapshot
divergente → fatal. (5) tenant do artifact diferente do
`Job.tenantId` → fatal. (6) tenant do provider profile divergente →
fatal. (7) Attempt incorreta → rejeita. (8) `leasePurpose` incompatível
com a operação → rejeita. (9) `leaseFence` stale → `SAFE_ABORT`, sem
falhar Job.

**Criação da execução:** (10) primeira execução cria exatamente um
`VideoGenerationExecution`. (11) replay compatível reutiliza execution
existente. (12) mesma `(jobId, attemptNumber)` com artifact diferente →
conflict. (13) execution não persiste `JobStatus`/`RetryPolicy`/lease.

**Submit seguro:** (14) `ProviderSubmission` persiste antes da rede.
(15) `providerRequestKey` existe antes da rede. (16) `requestPayloadHash`
existe antes da rede. (17) Skill 02 `externalEffectState=SUBMITTING`
antes da chamada. (18) mesmo request key + mesmo payload é compatível.
(19) mesmo request key + payload diferente →
`VIDEO_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT`. (20) submit confirmado
cria `ProviderOperation`. (21) `operationId` só fica `CONFIRMED` após
persistência durável.

**Ambiguidade:** (22) timeout durante submit sem idempotência → não
resubmete. (23) crash após provider aceitar e antes do DB commit →
`UNKNOWN`/reconcile. (24) reconcile encontra `operationId` → mesma
Attempt volta a `CONFIRMED`. (25) reconcile confirma que nenhuma operação
ocorreu e provider garante segurança → submit pode ser retomado conforme
policy. (26) provider sem reconcile/idempotência →
`BLOCKED`/`EXTERNAL_STATE_UNKNOWN`. (27) `UNKNOWN` nunca é convertido
artificialmente em `REMOTE_FAILED`.

**Idempotência do provider:** (28) provider com idempotency key recebe
retransmissão com mesma key/payload → mesma logical submission. (29)
retransmissão idempotente não cria nova Attempt. (30) retransmissão
idempotente não consome nova autorização de geração.

**Poll:** (31) poll `PROCESSING` mantém mesma Attempt. (32) vários polls
`PROCESSING` criam observations append-only. (33) polls repetidos não
geram transição lógica/AuditEvent duplicado. (34) poll `SUCCEEDED` cria
terminal observation e `RemoteGenerationSucceeded`. (35) poll `FAILED`
cria `RemoteGenerationFailed`. (36) poll `CANCELLED` cria
`RemoteGenerationCancelled`.

**Saída remota:** (37) provider retorna dois vídeos quando V1 exige um →
`VIDEO_PROVIDER_MULTIPLE_OUTPUTS_UNSUPPORTED`. (38) terminal result
conflitante com terminal result já persistido → fatal. (39) provider
failure confirmado retorna `REMOTE_FAILURE_CONFIRMED`, não erro interno
fabricado.

**Materialização:** (40) `REMOTE_SUCCEEDED` sem download concluído não
cria `VideoArtifact`. (41) falha transitória de download repete só
artifact fetch. (42) falha Storage repete só materialização. (43) falha
Storage nunca dispara nova geração. (44) bytes persistidos geram
`contentHash` correto. (45) blob salvo + transação DB falha → blob
órfão, nenhum artifact canônico. (46) `VideoArtifact` só nasce com
validação técnica mínima válida. (47) artifact já existente + conteúdo
diferente → replay conflict. (48) `MATERIALIZED` gera sucesso técnico da
Skill 11, mas não aprovação do vídeo.

**Ponto S2 (49-51):** (49) `VideoGenerationExecution` sempre carrega
`productVisualReferenceSetRef`, mesmo quando `content.kind='EMPTY'`.
(50) set `EMPTY` (qualquer `emptyReason`) nunca gera upload de
imagem/placeholder fabricado ao provider. (51)
`productVisualReferenceSetRef` de tenant diferente →
`VIDEO_EXECUTION_TENANT_MISMATCH`.

**Testes de integração** (quando runtime começar): cron/tick termina
abaixo do budget seguro de 60s; tick interrompido em qualquer checkpoint
→ próxima invocação consegue retomar; nova Attempt após `REMOTE_FAILED` →
nova execution/submission/auth; mesmo poll executado concorrentemente
por worker antigo → `leaseFence` impede mutação tardia; Run
`CANCEL_REQUESTED` durante geração → nenhum resultado tardio avança
pipeline; webhook futuro autenticado → resolve tenant internamente pelo
operation record; webhook inválido → zero mutação.

**Para 00B** (após as revisões): 1 submit real → `operationId` durável;
process restart → poll continua; provider conclui → download; process
restart → materialização continua; `VideoArtifact` final → `contentHash`
reproduzível. Esse teste real é o que finalmente valida que o contrato
multi-tick funciona de ponta a ponta.

## Fechamento arquitetural

1. Uma Attempt lógica nunca é repetida apenas porque uma resposta
   externa se perdeu.
2. Uma geração remotamente concluída nunca é regenerada apenas porque
   download ou Storage falharam.
3. Nenhum side effect potencialmente pago ocorre sem autorização de
   quota/custo aplicável àquela operação.
4. A Skill 11 termina quando existe evidência técnica durável da
   execução; ela não decide se o vídeo é bom, publicável ou
   comercialmente eficaz.
