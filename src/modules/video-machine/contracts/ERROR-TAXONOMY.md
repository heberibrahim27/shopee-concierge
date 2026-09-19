# Error Taxonomy — `ERROR_TAXONOMY_V1`

> **S12 do reparo pós-revisão Fable** (2026-09-18, ChatGPT ↔ Claude Code).
> Achado do Claude Fable 5 Max: `JobExecutionReport.errorClass?: string`
> e `RetryPolicy.retryableErrorClasses: string[]` não têm domínio
> compartilhado — o único conceito tipo-classe real é
> FATAL/RETRYABLE/BLOCKED, que o campo `outcome` já carrega. Isso
> permitia absurdos como `errorClass = "TEMP"` /
> `retryableErrorClasses = ["TRANSIENT"]` sem qualquer erro de tipo.

**Decisão**: em vez de inventar mais uma taxonomia paralela, S12
**elimina** `errorClass`/`retryableErrorClasses` e reutiliza o
protocolo já estabilizado no Ponto B (`JobExecutionResult`,
`JobFailureCategory`, `JobRetryAdvice`, `JobFailureDescriptor`,
`JobBlockDescriptor`, `JobContinuationDescriptor`) — que já resolvia
exatamente este problema, só faltava dizer isso explicitamente e
formalizar o formato do código.

**Autoridade**: `PROJECT-LEVEL SHARED CONTRACT` — `ERROR_TAXONOMY_V1`
(versão de contrato, não um canonical artifact hash — não entra na
contagem dos 255 hashes de domínio). Não é Skill 26.

## A arquitetura de 4 estados

```text
CONTINUE   → mesma Attempt ainda está em andamento
BLOCKED    → operação não pode continuar agora, mas existe condição
             conhecida que pode mudar
FAILED     → a Attempt realmente falhou
SUCCEEDED  → operação lógica terminou com sucesso
```

Somente `FAILED` participa de retry técnico.

## 1. `MachineReasonCode`

```typescript
type MachineReasonCode = string;
```

Regra normativa: `^(SKILL(0[1-9]|1[0-9]|2[0-5])|PROJECT)\.[A-Z0-9_]+$`.
Exemplos: `SKILL11.PROVIDER_TIMEOUT`, `SKILL23.QUOTA_LIMIT_EXCEEDED`,
`SKILL25.SECURITY_REQUIRED_CONTROL_UNVERIFIED`,
`PROJECT.CANONICAL_SERIALIZATION_FAILED`,
`PROJECT.AUDIT_EVENT_ATOMIC_PERSISTENCE_FAILED`. **Não** criar enum
global com ~624 códigos.

`continuationCode`/`blockCode`/`failureCode`/`reasonCode` (já
existentes como `string` em Skill 01/02 desde o Ponto A/B) passam a
tipar formalmente como `MachineReasonCode`. Nenhum novo hash — os
hashes parents existentes (`JOB_EXECUTION_RESULT_V1`,
`SKILL_EXECUTION_RESOLUTION_V1`) já incorporam o tipo semanticamente.

## 2. `JobFailureCategory` permanece a única classificação de falha

Enum já criado no Ponto B (Skill 02), agora formalmente ancorado por
este contrato — sem duplicar como `ErrorClass`/`FailureClass`/
`RetryClass`/`ExceptionClass` paralelos:

```typescript
type JobFailureCategory =
  | 'TRANSIENT_INFRASTRUCTURE'
  | 'PROVIDER'
  | 'VALIDATION'
  | 'CONTRACT'
  | 'SECURITY'
  | 'INTERNAL'
  | 'UNKNOWN';
```

- **`TRANSIENT_INFRASTRUCTURE`**: falha temporária da infraestrutura
  necessária à execução/control-plane.
- **`PROVIDER`**: provider externo falhou/rejeitou/indisponível.
- **`VALIDATION`**: input/result não satisfaz requisito determinístico.
- **`CONTRACT`**: invariante/protocolo/schema interno violado.
- **`SECURITY`**: execução falhou por violação/falha real de
  segurança; condição aguardável deve ser `BLOCKED`, não `FAILED`.
- **`INTERNAL`**: defeito interno não classificado como infra
  transitória.
- **`UNKNOWN`**: causa não classificada com segurança.

**Não inventar** `BUSINESS` (resultado de negócio negativo não é
falha — ex.: `VideoAuditResult = NON_COMPLIANT` → Job da Skill 12 é
`SUCCEEDED`, não `FAILED/BUSINESS`; o adapter decide a próxima
transição) nem `QUOTA`/`APPROVAL`/`CAPABILITY`/`POLICY`/`TIME_WINDOW`
(são `BLOCKED` com `JobBlockCategory` apropriada, nunca failure
category).

## 3. A categoria não decide retry sozinha

```text
JobFailureCategory ≠ retry decision
```

`PROVIDER` pode ser HTTP 503 (`RETRYABLE`) ou "rejected unsupported
model" (`NON_RETRYABLE`). A categoria serve para observabilidade,
agrupamento, diagnóstico, política conservadora — não decide sozinha
se deve repetir.

## 4. `JobRetryAdvice` continua autoridade semântica do handler

```typescript
type JobRetryAdvice = 'RETRYABLE' | 'NON_RETRYABLE';
```

O handler responde apenas: "repetir a mesma operação lógica pode fazer
sentido e é semanticamente permitido?". Ele **não cria Attempt** —
Skill 02 continua decidindo se de fato haverá retry.

## 5. Matriz conservadora obrigatória

| `JobFailureCategory` | `RETRYABLE` permitido? |
|---|---|
| `TRANSIENT_INFRASTRUCTURE` | sim |
| `PROVIDER` | sim |
| `VALIDATION` | não |
| `CONTRACT` | não |
| `SECURITY` | não |
| `INTERNAL` | não |
| `UNKNOWN` | não |

Isso evita auto-retry perigoso. `VALIDATION + RETRYABLE` (e o mesmo
para `CONTRACT`/`SECURITY`/`INTERNAL`/`UNKNOWN`) → contract violation
(`JOB_EXECUTION_RESULT_CONTRACT_VIOLATION`, já existente na Skill 02).

**Por que `VALIDATION` não é retry técnico**: se prompt inválido/frame
incompatível/artifact não satisfaz schema, repetir o mesmo payload não
muda nada. Se o sistema precisar produzir entrada diferente → nova
operação semântica → novo `StageExecution`/Job (Ponto D), nunca
`Attempt #2`.

**`SECURITY`**: condição conhecida e recuperável (ex.: controle
obrigatório ainda não verificado) deve retornar `BLOCKED`/`category=SECURITY`
via `JobBlockDescriptor`, não `FAILED`. `FAILED/SECURITY` fica
reservado para falha real de execução/contrato de segurança — sempre
`NON_RETRYABLE`.

**`INTERNAL`**: se é realmente transitório (database temporariamente
indisponível, timeout de control-plane), usar
`TRANSIENT_INFRASTRUCTURE`. `INTERNAL` representa bug/falha interna
não classificada como transitória → sempre `NON_RETRYABLE`.

**`UNKNOWN`** é fail-safe → sempre `NON_RETRYABLE`. Nunca "não sei o
que aconteceu → tenta de novo", principalmente em Skills com side
effect.

## 6. Novo modelo do `RetryPolicy`

Remove `retryableErrorClasses: string[]` do tipo existente (Skill 01).
**Não substituir** por `retryableFailureCategories: ...` — isso
reconstruiria o problema em outra forma. Adiciona apenas a semântica
explícita:

```typescript
type RetryEligibilityModel =
  | 'HANDLER_ADVICE_AND_EXECUTION_SAFETY';

// Patch no RetryPolicy existente (Skill 01):
type RetryPolicy = {
  maxAttempts: number;
  backoff: 'FIXED' | 'EXPONENTIAL';
  eligibilityModel: 'HANDLER_ADVICE_AND_EXECUTION_SAFETY';
};
```

Nenhum hash novo — `RetryPolicy` já pertence a um parent hash
existente. `RetryPolicy` passa a controlar apenas: quantas Attempts
podem existir, quando a próxima Attempt pode começar, backoff, limites
temporais, jitter (se já existir). **Não classifica erros.**

## 7. Fórmula canônica de retry

Skill 02 só pode criar `RETRY_NEW_ATTEMPT` se **todas** forem
verdadeiras:

1. `JobExecutionResult.outcome = FAILED`
2. `failure.retryAdvice = RETRYABLE`
3. `failure.category` admite `RETRYABLE` (matriz da seção 5)
4. `attemptsUsed < RetryPolicy.maxAttempts`
5. Job não está `CANCEL_REQUESTED`
6. `JobExecutionBinding` permanece idêntico
7. `inputPayloadRef` permanece idêntico
8. operação continua semanticamente a mesma
9. side-effect safety permite nova Attempt
10. nenhuma regra específica da Skill proíbe retry

Falhou qualquer item → não cria retry automático.

## 8. Side-effect safety continua superior

Mesmo `failure.retryAdvice = RETRYABLE` não autoriza repetir network se
`externalEffectState = UNKNOWN` e a Skill não conseguiu reconciliar. A
garantia forte já elogiada pelo Fable permanece: `UNKNOWN` nunca
auto-retry do side effect. `retryAdvice` é **advice**, não **decision**
— `handler RETRYABLE + maxAttempts acabou → terminal FAILED`; `handler
RETRYABLE + side effect UNKNOWN → não retry`.

## 9. `BLOCKED` e `CONTINUE` nunca usam `RetryPolicy`

`BLOCKED` (quota `DENIED`, approval required, capability unavailable,
security gate pending, time window) usa o mecanismo já existente do
Ponto B: condição muda → nova Attempt — isso é **unblock**, não
failure retry. `CONTINUE` (provider processing, quota authorization
reconciliation, claim reconciliation, dependency recheck dentro da
mesma operação) é a mesma Attempt — não consome `maxAttempts`.

## 10. `FATAL_ERROR` local não é `errorClass`

Os `FATAL_ERROR` dos 25 SPECs são invariant/contract identifiers da
Skill — não são um `errorClass`. Quando um `FATAL` precisar aparecer na
execução: `outcome = FAILED`, `retryAdvice = NON_RETRYABLE`, e a
categoria adequada será normalmente `CONTRACT`/`SECURITY`/`INTERNAL`/
`VALIDATION` conforme o caso.

**Códigos locais não precisam ser reescritos em massa** — se a
Skill 09 tem `FRAME_REQUIREMENT_UNSATISFIABLE` na sua própria lista
`FATAL_ERROR`, essa lista não muda. No boundary compartilhado (dentro
de `failureCode`/`blockCode`/`continuationCode`/`reasonCode`), o código
recebe o prefixo do owner: `local owner code + owner SkillNN →
SKILLNN.<LOCAL_CODE>`. Não precisamos transformar as ~624 ocorrências
locais existentes.

Erros compartilhados dos contratos S10/S11 seguem o mesmo padrão:
`CANONICAL_SERIALIZATION_FAILED → PROJECT.CANONICAL_SERIALIZATION_FAILED`,
`AUDIT_EVENT_ATOMIC_PERSISTENCE_FAILED →
PROJECT.AUDIT_EVENT_ATOMIC_PERSISTENCE_FAILED`.

## 11. Regras de nomeação de código

- Dentro do mesmo namespace (`SKILL11.X`), uma única semântica —
  nunca reaproveitar `X` pra dois significados diferentes.
- Code não carrega estado de retry (`SKILL11.RETRYABLE_PROVIDER_TIMEOUT`
  proibido) — retry é o campo separado `retryAdvice`.
- Code também não carrega outcome (`SKILL23.BLOCKED_QUOTA_LIMIT`
  proibido quando `SKILL23.QUOTA_LIMIT_EXCEEDED` já descreve a causa —
  o envelope já informa `BLOCKED`).
- HTTP status não é error taxonomy — nunca `failureCode = "429"`;
  correto é `failureCode = SKILL11.PROVIDER_RATE_LIMITED` (status raw
  pode permanecer como diagnostic evidence).

## 12. Telemetria e logging

Labels seguras: `failureCategory`, `retryAdvice`,
`settlementDisposition`, `sourceSkillId` (e `failureCode` se a
cardinalidade permanecer controlada). **Nunca** usar provider raw
message/`exception.message`/payload/URL como label. Raw exception/SDK
error pode existir em `OperationalLog` sob políticas da Skill 25, mas
não vira automaticamente `failureCode` — códigos são controlados pelo
domínio. Adapter do provider traduz erro raw pra algo como
`SKILL11.PROVIDER_RATE_LIMITED` antes de atravessar o boundary.

## 13. `JobExecutionReport` legado

O `JobExecutionReport` pré-Ponto-B (com `errorClass?: string`) é
`LEGACY/SUPERSEDED` — o protocolo canônico é `JobExecutionResult`
(Ponto B). `errorClass` não participa do protocolo canônico; não criar
adaptação `JobExecutionReport.errorClass → JobFailureCategory` (isso
manteria dois envelopes). A autoridade já é `JobExecutionResult`.

## 14. Nenhuma mudança em `JobExecutionSettlement`

Já possui `CONTINUE_SAME_ATTEMPT`/`JOB_SUCCEEDED`/`JOB_BLOCKED`/
`RETRY_NEW_ATTEMPT`/`JOB_FAILED_TERMINAL`, suficiente. Retry é
derivado: `FAILED + RETRYABLE + eligibility completa → RETRY_NEW_ATTEMPT`,
caso contrário `JOB_FAILED_TERMINAL`.

## 15. Retry decision deve ser reproduzível

Skill 02 precisa conseguir explicar por que criou a nova Attempt usando
`JobExecutionResult` + `RetryPolicy` snapshot + Attempt count +
side-effect state/evidence + cancellation state. Não depende de
"string magic" / `if errorClass === ...`.

`RetryPolicy` precisa estar congelada no Job — se já existe snapshot/
versão, preservar; se não estiver explícito, adicionar regra: Job usa
retry policy snapshot/version congelada quando o Job é materializado
(deploy posterior não muda Attempt 1 com policy antiga vs. Attempt 2
com policy nova do mesmo Job). O mesmo Job não troca
`eligibilityModel` entre Attempts.

## 16. `FATAL_ERROR` e hashes novos

**0 hashes novos.** S12 é consolidação semântica do protocolo já
definido — não precisa de outro artifact só pra corrigir strings mal
tipadas. **0 shared errors novos** — `JOB_EXECUTION_RESULT_CONTRACT_VIOLATION`
(já existente na Skill 02) já cobre: invalid category/advice matrix,
invalid reason code format, outcome/descriptor mismatch.

## 17. Testes críticos (20)

```text
1. errorClass não existe no protocolo canônico.
2. retryableErrorClasses não existe no RetryPolicy canônico.
3. MachineReasonCode namespaced válido passa.
4. code sem namespace rejeita.
5. SKILL26.* rejeita.
6. PROJECT.* válido passa.
7. FAILED exige JobFailureDescriptor.
8. RETRYABLE+TRANSIENT_INFRASTRUCTURE permitido.
9. RETRYABLE+PROVIDER permitido.
10. RETRYABLE+VALIDATION rejeitado.
11. RETRYABLE+CONTRACT rejeitado.
12. RETRYABLE+SECURITY rejeitado.
13. RETRYABLE+INTERNAL rejeitado.
14. RETRYABLE+UNKNOWN rejeitado.
15. NON_RETRYABLE em qualquer category é permitido.
16. BLOCKED não consulta RetryPolicy.
17. CONTINUE não consulta RetryPolicy.
18. retries esgotados → terminal mesmo com RETRYABLE.
19. side-effect UNKNOWN impede retry automático.
20. semantic input change nunca usa nova Attempt.
```

## 18. Lint barato

Três checagens baratas pra ferramenta real, análogas ao S10/S11:

1. Nenhuma declaração canônica (Skill 01/02) pode ter o campo
   `errorClass` — pode existir textualmente dentro de uma seção
   `LEGACY/SUPERSEDED`, mas o AST não pode encontrar esse property name
   em tipos canônicos ativos.
2. Nenhuma declaração canônica de `RetryPolicy` pode ter o campo
   `retryableErrorClasses`.
3. `MachineReasonCode` deve existir uma única vez nos contratos
   compartilhados, e `JobFailureDescriptor.failureCode`/
   `JobBlockDescriptor.blockCode`/`JobContinuationDescriptor.continuationCode`
   devem referenciá-lo.

## Estado final da taxonomia

```text
                           JobExecutionResult
                                  │
             ┌────────────────────┼─────────────────────┐
             │                    │                     │
         CONTINUE              BLOCKED               FAILED
             │                    │                     │
 continuationCode            blockCode              failureCode
             │               block.category          failure.category
 same Attempt              recoveryMode            retryAdvice
                                                        │
                                                        ↓
                                                Skill02 RetryPolicy
                                                        +
                                                side-effect safety
                                                        │
                                          ┌─────────────┴────────────┐
                                          │                          │
                                   RETRY_NEW_ATTEMPT         FAILED_TERMINAL
```

Não existe mais um eixo paralelo chamado `errorClass`.

## Critério de fechamento do S12

Marcar S12 `CLOSED` apenas quando: (1) este arquivo existe; (2)
`MachineReasonCode` possui gramática única; (3) `JobFailureCategory`
continua único; (4) `JobRetryAdvice` continua único; (5) `errorClass`
foi removido/marcado legacy no protocolo canônico; (6)
`retryableErrorClasses` foi removido do `RetryPolicy` canônico; (7)
`RetryPolicy` controla mecânica, não classificação; (8) category nunca
decide retry sozinha; (9) matriz `RETRYABLE` está formalizada; (10)
`BLOCKED` não é failure retry; (11) `CONTINUE` não é failure retry;
(12) `FATAL_ERROR` local não é `errorClass`; (13) shared project errors
recebem `PROJECT.*` no boundary; (14) Skill-local codes recebem
`SKILLNN.*` no boundary; (15) side-effect `UNKNOWN` permanece
non-auto-retry; (16) lint não encontra os dois campos legacy em AST
canônico; (17) contract lint permanece `PASS`.
