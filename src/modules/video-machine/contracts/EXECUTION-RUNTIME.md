# `EXECUTION_RUNTIME_V1` — contrato compartilhado de runtime de execução

> Ponto S7 do reparo transversal pós-revisão Fable (2026-09-18). Não é
> um artifact hash — é uma **versão normativa compartilhada** (mesmo
> padrão de `CANONICAL_SERIALIZATION_V1`/S10, `AUDIT_EVENT_V1`/S11,
> `RESULT_MATERIALIZATION_V1`/S14, `VIDEO_COMPOSITION_V1`/S6),
> referenciada por Skill01, Skill02, Skill11, Skill12, Skill14, Skill16,
> Skill17 e qualquer outra Skill que declare `SkillJobHandler`. Nenhuma
> dessas Skills redefine esta regra — só referenciam.

## Achado real do Fable

`Skill02 → pull worker, mas onde roda?`, `Skill11 → multi-tick/polling,
mas quem mantém o processo vivo entre ticks?`, `Skill12 → precisa de
FFmpeg, mas a Vercel roda isso?`, `Skill09/11 → download/upload de
mídia multi-MB, via API route serverless?`. Nenhuma Skill declarava
onde o `SkillJobHandler` efetivamente executa — o pipeline real (lease/
fence/Attempt/CONTINUE, já formalizado na Skill02 desde antes deste
reparo) descrevia um protocolo correto, mas sem dono de runtime.

## Decisão V1: dois runtimes, papéis fixos, sem meio-termo

A Vercel é **exclusivamente control plane** — nunca executa nenhum
`SkillJobHandler`, curto ou longo. Todo `Job` (RUN_SCOPED ou
STANDALONE, qualquer Skill) executa em um worker durável e
containerizado separado: `VIDEO_MACHINE_WORKER_V1`. Essa divisão é
deliberadamente **mais rígida** que "só Jobs pesados de FFmpeg vão pro
worker" — permitir uma exceção ("Job de 100ms roda numa API route")
criaria dois runtimes implementando a mesma semântica de Job/Attempt,
divergindo com o tempo. Um único runtime de execução, sempre.

```text
VIDEO_MACHINE_RUNTIME_V1

┌─────────────────────────────────────────────┐
│  VERCEL — CONTROL_PLANE                      │
│                                               │
│  UI / Admin / APIs                           │
│  Authenticated Webhooks (ingress only)       │
│  Approval actions                            │
│  Run commands                                │
│  Orchestration decisions (Skill01)           │
│  Short DB transactions                       │
│  Schedule admission (Vercel Cron)            │
│                                               │
│  NEVER executes Skill Jobs                   │
└───────────────────┬───────────────────────────┘
                     │
                     ▼
            Postgres / Outbox
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  VIDEO_MACHINE_WORKER_V1 — DURABLE_WORKER    │
│                                               │
│  Skill02 pull loop                           │
│  Job claim / lease / fence / Attempt         │
│  Provider calls, polling ticks               │
│  Large media download/upload                 │
│  FFmpeg / FFprobe / transcode                │
│  Todo SkillJobHandler.handle()               │
└───────────────────┬───────────────────────────┘
                     │
                     ▼
       Object Storage / External Providers
```

## 1. Dois runtimes, dois papéis

```typescript
type VideoMachineRuntime = 'CONTROL_PLANE' | 'DURABLE_WORKER';
```

`CONTROL_PLANE` = Vercel/Next.js runtime já em uso pelo projeto.
`DURABLE_WORKER` = processo Node.js Linux long-running, containerizado,
fora da Vercel.

## 2. Regra mais importante do S7

**Todo `SkillJobHandler` executa exclusivamente em `DURABLE_WORKER`.**
Sem exceção pra Jobs "rápidos" — mesmo um Job que levaria 100ms nunca
roda numa API route da Vercel. Não existe "Job pequeno pode rodar
inline" no V1.

## 3. O que a Vercel pode fazer

Operações curtas, limitadas, sem efeito colateral externo pesado:
receber requests autenticados, validar/persistir intents, admitir
schedules, criar `Job`/`StandaloneWorkRequest`/outbox entries,
short-transaction reads/writes, disparar `advanceRun()` (Skill01,
reconciliação síncrona sem lógica de negócio de Skill nenhuma).

## 4. O que a Vercel NÃO pode fazer

`SkillJobHandler.handle()`; FFmpeg/FFprobe/transcode; download/upload
de mídia multi-MB; provider polling loop; `sleep`/wait; pipeline de
download-upload longo; execução de Attempt; settlement de Job.

## 5. Webhook não executa trabalho

Exemplo Skill16: webhook autentica ingress, resolve
`TrustedTenantContext`, dedupe/admite evento, persiste intent durável,
responde. O worker executa o Job de verdade depois — nunca `webhook →
resolve tenant → chama IA → envia DM → espera provider → responde`
inline.

## 6. Vercel Cron também não executa Jobs

Cron só identifica schedules devidos e materializa um work
request/outbox entry durável — nunca reclama nem executa um handler
diretamente.

## 7. Cron deixa de ser requisito para processamento da fila

O worker é um pull worker long-running que encontra seu próprio
trabalho elegível. Cron indisponível não trava Jobs já materializados.

## 8. Skill02 é dona do worker execution protocol

Elegibilidade, claim, lease, fence, ciclo de vida do Attempt, invocação
de handler tick, settlement, retry scheduling, unblock — tudo isso já
pertence à Skill02 (Ponto B, ver `leaseFence`/`nextPollAt`/
`JobExecutionResult`/`JobExecutionSettlementDisposition` reais no
arquivo dela). O processo worker é só o runtime que **aplica** esse
contrato — não introduz protocolo paralelo.

## 9. Skill01 não vira scheduler físico

Skill01 continua dona de `ProductionRun`/`StageExecution`/transições de
pipeline — nunca process polling, thread management ou orquestração de
container.

## 10. Banco continua sendo a fila durável V1

Sem Redis/BullMQ/RabbitMQ/Kafka/SQS agora. Postgres + Skill02
permanece a única fila.

## 11. Claim atômico

O runtime futuro precisa implementar algo semanticamente equivalente a
`SELECT ... FOR UPDATE SKIP LOCKED` dentro de uma única transaction.
Não implementar SQL agora — só documentar o contrato.

## 12. Nunca manter transação aberta durante network

Padrão obrigatório (já usado no desenho de side-effect da Skill02/S11):

```text
BEGIN → claim → lease/fence → COMMIT
  → executa handler / network / mídia (sem transaction aberta)
BEGIN → valida fence → persiste checkpoint/resultado → settle → COMMIT
```

Proibido: manter uma transaction aberta durante uma chamada HTTP de 30s
a um provider.

## 13. Lease

O worker prova "eu sou o executor atual" durante um tick via o
mecanismo de lease já existente na Skill02.

## 14. Fence continua autoridade

Lease expirado sozinho não permite que um worker antigo persista
resultado depois. Se o worker A tinha `leaseFence=12` e, após expirar,
o worker B adquiriu `leaseFence=13`, A não consegue persistir
settlement com fence 12 — `reportExecution()` retorna
`REJECTED_STALE_FENCE` (já existe na Skill02, reutilizado sem mudança).

## 15. Heartbeat

Para operações locais longas (ex.: FFmpeg), o worker renova seu lease
periodicamente enquanto ainda detém um fence válido. Heartbeat ≠ nova
Attempt ≠ handler tick ≠ `JobExecutionResult` — é só plumbing de
runtime.

## 16. Falha de heartbeat

Se o worker perde a capacidade de renovar o lease, deve tentar
interromper a operação local e nunca continuar assumindo ownership. Se
outro worker reclamar o Job, o fence antigo vira stale.

## 17. Worker crash

Se o processo morre, o lease expira e o Job volta a ficar elegível. O
próximo worker aplica a segurança de side-effect já formalizada em
S12/S14.

## 18. Crash em computação puramente local

Exemplo: FFmpeg em 63% quando o worker morre — nenhum efeito externo
ocorreu, então após a expiração do lease uma nova Attempt pode
simplesmente repetir o processamento conforme `RetryPolicy`.

## 19. Crash após resultado já materializado

Exemplo: `FinalizedVideoRendition` persistido, worker crasha antes do
settlement — por S14, o replay encontra o resultado existente e **não**
reexecuta FFmpeg; settla usando o `resultRef` já existente.

## 20. External side effect é diferente

Exemplo Skill17: `SUBMITTING` persistido → chamada de publish → worker
crasha. Se não sabemos se o provider realmente publicou:
`externalEffectState = UNKNOWN` → reconciliação, nunca retry cego.
Retry nunca significa "repita network" — process lifetime não é
authority de retry; Skill02 + checkpoint state decidem.

## 21. `CONTINUE` não mantém worker preso

Quando o provider responde `PROCESSING`, o handler retorna `CONTINUE`.
O worker persiste a continuation, define a próxima elegibilidade,
libera o lease e vai executar outro Job.

## 22. Nada de loop de polling segurando processo

Proibido:

```typescript
while (providerProcessing) {
  await sleep(5000);
  await provider.poll();
}
```

por minutos. Cada poll é um handler tick da mesma Attempt (Ponto B).

## 23. Próximo poll

Persistir/reutilizar o campo já existente na Skill02
(`nextPollAt`) — nunca criar um scheduler paralelo equivalente.

## 24. Tick seguinte

Quando `now >= nextPollAt`, o worker pode reclamar novamente o mesmo
Job/Attempt — ainda a mesma Attempt, até acontecer
failure/success/block conforme Ponto B.

## 25. Poll não consome `maxAttempts`

Já fechado na Skill02: `CONTINUE` ≠ retry. Poll #17 ainda pode estar
dentro da Attempt 1.

## 26. Worker não dorme esperando `nextPollAt`

Libera o Job e procura outro trabalho — nunca bloqueia o processo
esperando o próprio Job ficar elegível de novo.

## 27. Poll interval não é contrato de negócio

O intervalo interno da fila (1s/2s/5s) é deployment tuning — não
congelar em hash/spec de domínio.

## 28. Pull loop, `wakeup` opcional

Conceitualmente: `while healthy: claim eligible work; if work: execute;
sleep bounded interval + jitter`. Sem busy loop. Futuramente Postgres
`NOTIFY`, webhook interno ou mecanismo semelhante pode acordar o
worker, mas `wakeup ≠ source of truth` — a fonte de verdade é o Job
persistido; se uma notification for perdida, o pull loop ainda encontra
o trabalho.

## 29. Não depender de in-memory queue

Se o worker reinicia, zero trabalho durável pode desaparecer — toda
unidade necessária já está persistida.

## 30. `RUN_SCOPED` e `STANDALONE` usam o mesmo worker

Ponto C permanece: nenhum background runtime separado — ambos os tipos
de Job convergem pro mesmo `VIDEO_MACHINE_WORKER_V1`.

## 31. Standalone schedules e event-driven standalone

Skills 18/19/21 continuam podendo ser `StandaloneWorkRequest`,
processados como Jobs pela Skill02. Recorrência por horário: `Vercel
Cron → short schedule-admission transaction → StandaloneWorkRequest →
return`; o worker faz o resto. Sem recorrência: `domain event/outbox →
StandaloneWorkRequest → worker` — não precisa de Cron.

## 32. FFmpeg fica exclusivamente no worker

Skills 12/14, onde houver FFmpeg/FFprobe/transcode/media inspection,
executam somente dentro de `VIDEO_MACHINE_WORKER_V1`.

## 33. Worker image precisa conter media tooling

A futura imagem container deve possuir versões aprovadas de
FFmpeg/FFprobe e dependências de codec exigidas pelas Specs. Não
implementar imagem agora. Versão do FFmpeg precisa ser controlada
(pin de `container image version` + `ffmpeg major/minor/build`,
exposta como runtime evidence/diagnostics) — nunca "whatever apt
installed today" em produção. Mas versão do FFmpeg **não** entra em
domain hashes, a menos que um artifact owner declare que tooling
version é semantic provenance necessária — S7 não espalha
`ffmpegVersion` por todos os artifacts.

## 34. Filesystem local é scratch

`local disk → temporary working storage only`, nunca fonte canônica.
Worker precisa ser reiniciável: tudo necessário para retomar uma
execução precisa existir fora do filesystem local. Temp directory por
execution (conceitualmente `/tmp/video-machine/<job>/<attempt>/<fence>/`
ou equivalente — path literal não precisa ser congelado no contrato; a
propriedade necessária é isolamento). Nenhum Attempt presume que o
`/tmp` de um Attempt anterior existe. Cleanup: após
`SUCCEEDED`/`BLOCKED`/`FAILED`/cancellation o worker tenta apagar
scratch, e também executa cleanup de diretórios órfãos em
startup/maintenance. Falha de cleanup não muda resultado de domínio —
falha ao apagar arquivo temporário é `OperationalLog`/security hygiene,
nunca transforma um vídeo publicado com sucesso em Job `FAILED`.

## 35. Storage canônico

Bytes duráveis vão para o artifact/object storage já adotado pelo
projeto (reutilizar Supabase Storage se já em uso — não criar segundo
store só por S7). Postgres guarda metadata, não blobs grandes — usar
refs/checksums/storage identifiers, nunca vídeo multi-MB direto em rows
de Job/result.

## 36. Mídia grande não atravessa a Vercel

Downloads e uploads grandes não passam por `provider → Vercel API →
worker`. Padrão: `worker: provider/storage → stream direto →
scratch/object storage`. Worker deve usar streaming — evitar `await
response.arrayBuffer()` pra vídeos grandes se isso exige carregar tudo
em RAM.

## 37. Media input validation

Antes de FFmpeg: size limits, content type quando confiável, container
probe, checksum/integrity — segundo as Skills relevantes. Nunca confiar
apenas na extensão `.mp4`.

## 38. Timeout e cancellation

Toda operação de network tem timeout explícito — nunca HTTP request
infinita. Worker precisa impor deadline configurável por operação, mas
o valor (30s/5m/20m) é budget de config de Skill/runtime, não constante
normativa compartilhada. Se já houver handler policy/provider
profile/execution policy, usar esse mecanismo — não criar sistema
paralelo só pra timeout. Kill de FFmpeg em timeout/cancel:
conceitualmente `SIGTERM → grace period → SIGKILL` — nunca deixar child
process órfão. Cancellation: antes de iniciar um tick o worker verifica
cancellation state; durante uma operação local longa pode observar
cancellation e interromper de forma segura. Cancellation não pode
fingir desfazer um external side effect — se o publish já aconteceu,
cancel ≠ rollback da publicação, segue o contrato da Skill17.

## 39. Worker concurrency

No V1, concurrency é deployment configuration, não domain contract —
mas deve respeitar "at most one non-terminal StageExecution active per
Run" do Ponto A. Vários Runs podem rodar em paralelo (Run A, Run B,
Standalone C simultaneamente) se permitido pelo modelo tenant/global
existente — não globalizar desnecessariamente a regra de um ativo.
Recomendação inicial de deployment: concurrency de mídia baixa por
CPU/RAM — não hardcode no SPEC. Um único worker (1 container) já é
válido no V1, desde que lease/fence estejam corretos — isso permite
escalar pra N workers sem mudar protocolo; a spec precisa ser correta
pra N workers simultâneos (`SKIP LOCKED`/lease/fence protegem
concorrência).

## 40. Worker identity

Cada processo/instance possui `workerInstanceId` para lease
ownership/operational logs/diagnostics — não é domain identity. Não
entra nos artifacts semânticos (não queremos "mesmo resultado executado
em container diferente → hash diferente"). Restart gera novo instance
ID — perfeitamente normal.

## 41. Deployment provider não entra no domínio

O contrato diz `durable long-running Linux container`, nunca
"Railway-specific Job"/"Fly-specific X" — permite trocar o mesmo worker
entre Railway/Fly.io/Render/VPS/container host sem mudar nenhuma Skill.

## 42. Isso ainda é runtime suficientemente especificado

O Fable pediu um named runtime, não necessariamente vendor lock-in.
Temos `CONTROL_PLANE_V1 → Vercel Next.js runtime` e
`VIDEO_MACHINE_WORKER_V1 → long-running Linux container / processo
Node.js`, com responsabilidades exatas — isso é implementável.
Recomendação futura de deployment (fora do escopo desta spec): 1
serviço container contínuo + auto restart + persistent environment
secrets + Supabase/Postgres connectivity + FFmpeg baked into image, sem
Kubernetes.

## 43. Não usar Vercel Functions como worker fallback

Se o durable worker estiver fora do ar, Jobs ficam pendentes — nunca
"roda temporariamente no `/api/process-job`". Isso destruiria a
garantia de runtime único.

## 44. Superfície de rede do worker

Preferência: `no public ingress required` — o worker puxa do banco e
fala outbound com providers/storage. Menor superfície de ataque: sem
endpoint público de worker, `internet → execute Job` deixa de ser
possível. Pode expor/registrar liveness/readiness/last successful claim
pra operação, mas nunca um endpoint público que permita "execute job by
id" sem controles fortes.

## 45. Control plane não manda payload diretamente ao worker

Proibido `POST worker/run-this { job: ... }`. A comunicação canônica é
`persist Job/outbox in DB → worker pulls`. Notification (ex.: Postgres
`NOTIFY`) pode ser só otimização futura — nunca vira o transporte
canônico de payload.

## 46. Outbox e side-effect settlement continuam com o dono existente

Produção/consumo de outbox interno continua usando
`OutboxConsumerDelivery` como única autoridade — worker não cria
`consumedAt` alternativo. A mesma instância/container pode ter loops
lógicos pra outbox materialization e job execution, desde que use os
protocolos owner corretos (não precisa de dois serviços no MVP), mas
não misturar estados: `OutboxConsumerDelivery` e `Job`/`Attempt` são
ledgers diferentes mesmo no mesmo processo. `ProductUsageEvidence`
(S9): worker de Skill11/14/17 pode produzir durable intent/outbox pra
evidence conforme S9 — nada de callback in-memory.

## 47. Large provider polling e webhook completion

Desenho oficial (Skill11): `submit generation → CONTINUE → release →
later claim same Attempt → poll`. Se o provider suporta webhook de
completion: `Vercel ingress → auth → durable event` pode tornar o Job
elegível mais cedo, mas a Vercel não executa settlement completo — só
persiste evidence/evento; o worker consome e confirma. Isso evita duas
authorities: webhook e poller não competem pra terminar o Job por
caminhos diferentes — ambos alimentam a mesma state machine. Poll e
webhook podem coexistir: worker polla como fallback, webhook pode
antecipar `nextPollAt` ou materializar evento que torna o Job elegível,
mas o settlement continua único.

## 48. Skills12/14 e ASYNC_PROCESSOR

Se Skill12 usa frame extraction/FFprobe/audio probe, é worker-local.
Skill14 transcode também é worker-local — nunca usar APIs Vercel pra
executar binários pesados. Se a Skill14 já menciona `ASYNC_PROCESSOR`,
formaliza que no V1 isso significa operação `DURABLE_WORKER` quando o
processamento é interno; se for provider externo, `submit + CONTINUE
ticks` pelo mesmo worker.

## 49. Resource starvation e observabilidade

Worker não deve manter CPU-heavy FFmpeg e centenas de polls simultâneos
sem limite — mas isso é deployment config; o contrato só exige
`bounded concurrency` por worker. Não criar algoritmo de fair
scheduling sofisticado. `nextPollAt` e status eliminam Jobs presos em
loop bloqueado no mesmo Job/retry. Eligibility query só considera Jobs
`ready`/`not terminal`/`not blocked without unblock`/`nextPollAt <=
now`/`lease absent or expired` — detalhes exatos usam os estados já
existentes da Skill02.

## 50. Quota S23 e cancellation

Worker obtém autorização/claim imediatamente antes do efeito cobrado —
nunca "Vercel reserves quota → worker executes 20 min later" se a
autorização puder expirar. Payload final conhecido → quota claim →
network side effect, no worker (segue Ponto E). Se cancelado antes do
side effect: não executar; tratamento do claim segue Skill23.

## 51. Reconciliation e maintenance

Se houver trabalho de reconciliar `UNKNOWN` side effect, ele também é
Job/StandaloneWork no mesmo worker — não criar um "reconciliation
daemon" ad hoc fora do kernel. Atividades como stale lease
recovery/orphan scratch cleanup/health metrics podem existir como
runtime maintenance, mas não podem alterar domain state fora dos
contratos Skill02/etc. Lease recovery não cria Attempt automaticamente
— lease expirado só volta o Job a ser claimable; a state machine
decide se é same-Attempt tick, nova Attempt, ou terminal/block, nunca o
janitor.

## 52. Observabilidade e falhas técnicas

Métricas runtime úteis: eligible jobs, claimed jobs, active leases,
lease expirations, stale-fence rejects, handler tick duration,
`CONTINUE` count, retry count, media processing duration, queue
latency, worker heartbeat. Métricas/logs/dashboard não substituem
Postgres state como source of truth. Erros técnicos do processo (child
stderr, network stack trace, disk cleanup failure) podem ir ao
`OperationalLog`, sujeitos à Skill25. Domain failure sempre atravessa o
protocolo já existente (`JobFailureDescriptor`/`MachineReasonCode`
conforme S12) — nunca `exception.message` como `failureCode`. Uma
exceção não capturada não pode magicamente marcar o Job `FAILED` sem
contexto/fence — o processo morre ou o boundary captura e produz um
descriptor controlado; lease recovery protege.

## 53. Graceful shutdown

Ao receber shutdown: parar de claimar novos Jobs e tentar terminar ou
interromper de forma segura os ticks atuais antes do prazo do host. Não
transferir lease manualmente — se não consegue terminar, deixa o lease
expirar (ou release controlado se o protocolo existente permitir e for
seguro), nunca "passar" execução em memória pra outro processo. Mesmo
comportamento durante deploy/FFmpeg: Process A pode morrer no
deployment, lease/fence garante recuperação. Deploy durante publish: se
caiu numa janela externa, `UNKNOWN → reconciliation`, nunca blind
retry.

## 54. Versionamento do worker e compatibilidade de adapter

`workerBuildId` pode ir pra diagnostics/audit metadata quando útil —
nunca domain hash. O Ponto A já definiu
`SkillExecutionAdapterDescriptor` frozen/versioned per Run — um worker
novo não pode executar semanticamente "latest adapter" se a Run aponta
pra outro. Worker precisa suportar a adapter version exigida pelo
Job/Run; se não suporta, `BLOCK`/`FAIL closed` conforme contrato —
nunca executar "versão mais parecida". Pode haver dois builds de worker
durante rolling deploy — por isso adapter descriptor/fence/contract
version precisam ser explícitos; nada de `import latestHandler`
ignorando descriptor. Control plane deployment também não altera Run
congelada — deploy novo da Vercel não deve mudar `ProductionPipeline`/
`Snapshot` de Run existente.

## 55. Shared runtime contract pointers

Specs que executam Jobs devem referenciar `EXECUTION_RUNTIME_V1` — não
precisa espalhar o pointer mecanicamente nas ~25 Skills. Exigir
explicitamente em Skill01, Skill02, Skill11, Skill12, Skill14, Skill16,
Skill17 e em outras Skills que descrevem execução/background longa. Se
Skill09/frame handling envolve download/upload pesado, também
`DURABLE_WORKER` — mas como todo Job já é worker-only, não precisa
exceção. Se Skills04-10 são Jobs, também rodam worker — não precisamos
escrever a mesma frase oito vezes; um pointer global ao S7 na Skill02
basta pra execution ownership.

## 56. `SkillJobHandlerDescriptor` não ganha campo redundante

Preferência (mesma filosofia usada no S6 pra `compositionMode`): como
V1 não possui outra opção de runtime pra handler, `EXECUTION_RUNTIME_V1`
define normativamente todo `SkillJobHandler` como `DURABLE_WORKER`, sem
campo `runtime: 'DURABLE_WORKER'` redundante em 25 descriptors. Se um
dia existir `GPU_WORKER`/`MEDIA_WORKER`/`EDGE_WORKER`, aí sim criamos
runtime selection explícita — não antecipar agora.

## 57. Long task semantics

Worker ser durável não significa que uma handler function pode rodar
por horas sem checkpoint. Preferência continua: operations decomposed,
checkpoints, `CONTINUE` quando há espera externa. FFmpeg é exceção
natural — um processo FFmpeg local pode rodar por vários minutos dentro
de um handler tick, com lease heartbeat, bounded timeout e cancellation
support, porque não há provider polling a externalizar. Download/upload
também podem estar no mesmo tick, desde que bounded — se o workflow
virar grande demais, pode ser quebrado no futuro em operações duráveis;
não criar micro-Jobs preventivamente. Memory/disk constraints:
implementação futura deve streamar mídia e limitar concurrency (nunca
arquivo inteiro em memória por conveniência); antes de iniciar Job
media-heavy o worker pode verificar capacidade local — se insuficiente,
`transient infrastructure failure`/`block` conforme semântica escolhida
(nunca corromper output).

## 58. Artifact publication order

Pra outputs grandes: `process local → upload bytes → verify
upload/checksum → persist domain artifact`. Não persistir artifact que
aponta pra upload ainda incompleto. Upload crash (bytes subiram mas
artifact não foi persistido) pode criar blob órfão — cleanup posterior
pode removê-lo; não significa domain result existente. Artifact
persisted depois de upload: replay encontra o artifact e S14 impede
refazer o trabalho. Object storage URL expiration: artifacts não devem
depender semanticamente de signed URL temporária — persistir storage
identity/ref, gerar signed URL só no runtime de acesso quando
necessário. Se a mídia do provider usa URL temporária, o worker deve
baixar/materializar de forma durável quando o contrato da Skill exige
preservar o artifact — não contar com a URL amanhã.

## 59. Networking e DB connectivity

Worker precisa de outbound internet — não precisa de inbound público
(configuração recomendada). Worker precisa de conexão adequada pra
processo persistente; na implementação, usar pool pequeno/bounded, não
abrir uma conexão por poll sem limite. Como é container long-running,
pode usar connection pooling normal — não precisa tratar worker como
serverless. Vercel continua serverless/stateless — nada de `global
variable = queue` no control plane. Não precisamos de ledger
domain-level de workers — health/operations bastam. Worker offline por
20 min: Jobs permanecem duráveis; quando volta, retoma claims.

## O que NÃO fazer agora

Isso continua sendo **SPECIFICATION ONLY**. Não criar agora: Dockerfile,
projeto Railway/Fly/Render, `worker.ts`, SQL claim RPC, migration
Supabase, instalação de FFmpeg, configuração de Vercel Cron real,
deployment. Isso fica pra depois de: M1–M8 → consolidação → re-review
Fable → correções → Astra.

## Erros

**0 `FATAL_ERROR` novos esperados.** `stale lease`, `contract
mismatch`, `retry`, `worker execution failure`, `side-effect
uncertainty` já possuem vocabulário nas Skills 02/11/12/14/17 (ver
`REJECTED_STALE_FENCE` e equivalentes, já existentes). Se aparecer
alguma lacuna real após grep, avaliar especificamente — não criar
`WORKER_CRASHED` como domain FATAL; crash de processo é runtime event,
não domain failure automático.

## Lint (`G_S7_*`)

1. Skill02 deve referenciar `EXECUTION_RUNTIME_V1` e afirmar
   normativamente que todo `SkillJobHandler` executa em
   `DURABLE_WORKER`.
2. Buscar nas Specs por padrões que atribuam execução de Job a Vercel
   function/API route/cron handler/webhook handler, e bloquear apenas
   em contextos normativos de execution — cuidado pra não banir prosa
   que diga explicitamente "não executar na Vercel" (mesma armadilha
   self-triggering do S4/S14).
3. Skill11 precisa conter normativamente que `CONTINUE` libera
   worker/lease após settlement, ou equivalente (`provider polling is
   discrete handler ticks`).
4. Skills12/14 precisam referenciar `DURABLE_WORKER` explicitamente
   pra FFmpeg/media processing.
5. Garantir definição única de `EXECUTION_RUNTIME_V1` e
   `VIDEO_MACHINE_WORKER_V1` no contrato compartilhado (este arquivo).
6. **Não** criar lint genérico contra Redis/BullMQ/broker — o termo
   pode aparecer legitimamente numa seção "not used in V1" e gerar
   falso positivo; documentação normativa já basta (mesma decisão do
   S9 de não implementar um certo regex).

Teste empírico recomendado: injetar temporariamente na Skill02
`SkillJobHandler may execute in a Vercel API route` e confirmar que a
checagem targeted reconhece a violação (`FAIL`); reverter.

## Testes críticos (32)

1. Vercel pode criar durable Job intent.
2. Vercel não executa `SkillJobHandler`.
3. Vercel webhook não executa Job inline.
4. Vercel Cron não executa Job inline.
5. Worker reclama Job elegível.
6. Dois workers não possuem lease válido simultaneamente.
7. Fence antigo não consegue settle.
8. Worker crash libera trabalho após lease expiry.
9. Local compute crash pode retry conforme S12.
10. Persisted result após crash é reutilizado via S14.
11. External side-effect `UNKNOWN` não é reexecutado automaticamente.
12. `CONTINUE` mantém mesma Attempt.
13. `CONTINUE` libera worker.
14. Polling posterior reutiliza mesma Attempt.
15. Polling não consome `maxAttempts`.
16. `BLOCKED` não é polled continuamente.
17. FFmpeg executa somente worker.
18. FFmpeg timeout mata processo local.
19. Scratch loss não perde source-of-truth.
20. Canonical artifact nunca depende de temp path.
21. Large download não atravessa Vercel.
22. Large upload não atravessa Vercel.
23. Object upload é confirmado antes do domain artifact.
24. Job pode sobreviver a worker deployment/restart.
25. Rolling deployment preserva fence semantics.
26. `RUN_SCOPED` e `STANDALONE` usam mesmo worker protocol.
27. Provider completion webhook apenas materializa durable
    signal/state.
28. Webhook e poll convergem para uma única settlement path.
29. Quota é reclamada no worker imediatamente antes do side effect.
30. Credential handle é resolvido no worker sem persistir raw secret.
31. Outbox continua usando `OutboxConsumerDelivery`.
32. Nenhuma queue in-memory é source of truth.

## Critério de fechamento do S7 (29 itens)

1. `EXECUTION-RUNTIME.md` existe.
2. `EXECUTION_RUNTIME_V1` existe.
3. Vercel é formalmente `CONTROL_PLANE`.
4. `VIDEO_MACHINE_WORKER_V1` é formalmente `DURABLE_WORKER`.
5. Todo `SkillJobHandler` executa somente no worker.
6. Webhook não executa Job inline.
7. Cron não executa Job inline.
8. Postgres/Skill02 continua sendo fila durável V1.
9. Worker usa pull/claim atômico.
10. Lease/fence continua authority de ownership.
11. Nenhuma transaction fica aberta durante network.
12. Worker crash é recuperável via lease.
13. `CONTINUE` vira tick discreto, não loop de espera.
14. Polling libera worker entre ticks.
15. FFmpeg/FFprobe ficam no worker.
16. Mídia grande não atravessa Vercel.
17. Filesystem local é scratch.
18. Canonical outputs ficam em durable object storage.
19. External-effect `UNKNOWN` continua sem auto-retry.
20. Side-effect checkpoint segue `SUBMITTING`-before-network.
21. `RUN_SCOPED` e `STANDALONE` usam mesmo runtime.
22. Não existe Redis/BullMQ/broker adicional no V1.
23. Worker não precisa de ingress público.
24. Control plane comunica trabalho via estado durável, não POST
    direto ao worker.
25. Runtime permanece container-portable.
26. 0 artifacts novos.
27. 0 canonical hashes novos.
28. Lint protege a separação control-plane/worker.
29. Contract lint termina PASS.

S7 fica **CLOSED** quando os 29 itens acima são verificados. Com isso,
**17/17 achados SIGNIFICANT do Fable ficam fechados em especificação**
— ainda falta atacar os 8 MINOR (M1–M8) antes da consolidação e
re-review do Fable.

## Hashes e artifacts

**0 artifacts novos. 0 canonical hashes novos.** `EXECUTION_RUNTIME_V1`
é versão normativa compartilhada (como este próprio documento), nunca
entra na contagem de hashes canônicos.
