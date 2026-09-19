# Audit Event — `AUDIT_EVENT_V1`

> **S11 do reparo pós-revisão Fable** (2026-09-18, ChatGPT ↔ Claude Code).
> Achado do Claude Fable 5 Max: `AuditEvent` é referenciado em 23 dos 25
> `SPEC.md` e definido em nenhum. Skill 25 introduz `SecurityAuditEvent`
> e explicitamente deixa os 22 vocabulários locais de `AuditEvent` sem
> reconciliar. O contrato mais citado do sistema não tinha forma, regra
> de tenant scoping, nem requisito próprio de persistência/atomicidade.

**Autoridade**: `PROJECT-LEVEL SHARED CONTRACT` — `AUDIT_EVENT_V1`. Não
é Skill 26.

```text
AuditEvent
  → fatos operacionais e de controle de negócio
  → usado transversalmente pelas Skills

SecurityAuditEvent
  → fatos de segurança
  → continua pertencendo exclusivamente à Skill 25
```

Um não substitui o outro.

## 1. Classes de evento

```typescript
type AuditEventClass =
  | 'OPERATIONAL'
  | 'BUSINESS_CONTROL';
```

**Não** incluir `SECURITY` — isso já possui contrato próprio na
Skill 25.

## 2. Tipos genéricos de acontecimento

```typescript
type AuditEventKind =
  | 'STATE_TRANSITION'
  | 'DECISION'
  | 'SIDE_EFFECT'
  | 'DATA_MUTATION'
  | 'DELIVERY'
  | 'CONTROL_CHECK'
  | 'OBSERVATION';
```

Isso é infraestrutura. A semântica precisa fica em `eventCode`.

## 3. `eventCode` namespaced

```typescript
type AuditEventCode = string;
```

Regra obrigatória: `SKILL<NN>.<CODE>`. Exemplos:
`SKILL02.JOB_SUCCEEDED`, `SKILL03.APPROVAL_AUTHORIZED`,
`SKILL11.PROVIDER_SUBMISSION_PREPARED`,
`SKILL17.PUBLICATION_CONFIRMED`, `SKILL23.QUOTA_AUTHORIZATION_DENIED`.
Código project-level: `PROJECT.<CODE>`.

Regex normativa: `^(SKILL(0[1-9]|1[0-9]|2[0-5])|PROJECT)\.[A-Z0-9_]+$`

Assim não criamos um enum global de centenas de eventos.

## 4. Outcome genérico

```typescript
type AuditEventOutcome =
  | 'SUCCEEDED'
  | 'DENIED'
  | 'BLOCKED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';
```

`eventCode` continua sendo a autoridade da semântica específica.

## 5. Actor

```typescript
type AuditActorRef =
  | { kind: 'USER'; actorId: string; actorContextHash?: string; }
  | { kind: 'SERVICE'; serviceKey: string; }
  | { kind: 'SYSTEM'; systemKey: string; }
  | { kind: 'EXTERNAL_PRINCIPAL'; providerKey: string; principalIdHash: string; };
```

Nada exige nome, e-mail, username ou payload pessoal.

## 6. Relação com Skill 22

Quando houver usuário/ator autenticado, `AuditActorRef.USER.actorId`
deve derivar do ator resolvido/autorizado pela Skill 22.
`actorContextHash`, quando presente, aponta para evidence/contexto
confiável correspondente. O `AuditEvent` **não autentica ninguém** —
registra o ator que a camada de autoridade já resolveu.

## 7. Resource auditado

```typescript
type AuditResourceRef =
  | { kind: 'IMMUTABLE_ARTIFACT'; ownerSkillId: string; resourceType: string; resourceId: string; resourceHash: string; }
  | { kind: 'MUTABLE_ENTITY'; ownerSkillId: string; resourceType: string; resourceId: string; resourceVersion: number; stateHash?: string; }
  | { kind: 'EXTERNAL_RESOURCE'; providerKey: string; resourceType: string; externalResourceIdHash: string; };
```

## 8. Por que external ID fica hashado

Audit trail operacional não precisa armazenar indiscriminadamente
Instagram user ID, provider account ID, order ID, external customer
identifier — quando um hash estável resolve a correlação. Se outro
contrato explicitamente exigir o valor raw, esse contrato continua
responsável por sua proteção.

## 9. Correlação

Precisamos correlacionar o mesmo fato com Run/Job/Attempt/etc. sem
criar dependência estrutural com 25 tipos.

```typescript
type AuditCorrelationRef = {
  correlationKind: string;
  correlationId: string;
  correlationHash?: string;
};
```

Exemplos de `correlationKind`: `PRODUCTION_RUN`, `STAGE_ITERATION`,
`STAGE_EXECUTION`, `JOB`, `ATTEMPT`, `STANDALONE_WORK_REQUEST`,
`APPROVAL_REQUEST`, `PUBLICATION_INTENT`, `EXPERIMENT_VARIANT`.

## 10. Evidence

Reutiliza o contrato genérico já estabilizado `KernelArtifactRef` (ver
Ponto A do reparo transversal, Skill 01):

```typescript
evidenceRefs: KernelArtifactRef[];
```

Nenhum payload bruto dentro do `AuditEvent`.

## 11. Contrato central

```typescript
type AuditEvent = {
  auditEventId: string;

  tenantId: string;

  auditEventKey: string;

  sourceSkillId: string;

  eventCode: AuditEventCode;
  eventClass: AuditEventClass;
  eventKind: AuditEventKind;

  actor: AuditActorRef;
  resources: AuditResourceRef[];
  correlationRefs: AuditCorrelationRef[];

  outcome: AuditEventOutcome;

  evidenceRefs: KernelArtifactRef[];

  relatedSecurityAuditEventRef?: {
    securityAuditEventId: string;
    securityAuditEventHash: string;
  };

  occurredAt: string;
  recordedAt: string;

  auditEventHash: string;
};
```

Hash: `AUDIT_EVENT_V1` — exatamente 1 novo hash canônico.

## 12. Tenant é obrigatório

Para `AuditEvent` V1: `tenantId` obrigatório SEMPRE. Não existe
`tenantId?: string` nem `tenantId = GLOBAL`. As Skills 01-25 executam
dentro de tenant. Auditoria global de infraestrutura/projeto, se
necessária futuramente, deve ter contrato próprio. Isso elimina a
ambiguidade apontada pelo Fable.

## 13. Tenant não vem do payload auditado

O evento herda tenant de contexto confiável já resolvido
(`ProductionRun`, `Job`, `StandaloneWorkRequest`, `TrustedTenantContext`,
`IntegrationBinding`, ...). **Nunca** `body.tenantId`/`query.tenant`/
payload tenant como authority.

## 14. Resources não podem pertencer a outro tenant

Quando o resource possui ownership tenant-scoped: `resource tenant =
AuditEvent.tenantId` obrigatoriamente. Mismatch:
`AUDIT_EVENT_TENANT_MISMATCH`.

## 15. Actor também precisa pertencer ao contexto

Para actor `USER`: `actor resolved tenant = AuditEvent.tenantId` quando
esse relacionamento se aplicar. `AuditEvent` não pode ser usado pra
maquiar "actor do Tenant A → ação Tenant B".

## 16. `auditEventKey`

É a identidade idempotente do fato auditável — deve ser derivada da
identidade lógica do evento. Exemplos: `JOB_SUCCEEDED:<jobId>`,
`APPROVAL_AUTHORIZED:<approvalResolutionId>`,
`PUBLICATION_SUBMITTING:<publicationExecutionId>:<submissionSequence>`,
`QUOTA_DENIED:<authorizationId>`. **Não usar** UUID aleatório por retry
nem `Date.now()` como `auditEventKey`.

## 17. Idempotência

Unicidade: `UNIQUE(tenantId, auditEventKey)`. Mesma key + mesmo hash →
replay idempotente, reutiliza `AuditEvent` existente. Mesma key + hash
diferente → `AUDIT_EVENT_REPLAY_CONFLICT`.

## 18. Projection do `AUDIT_EVENT_V1`

**Incluir**: `tenantId`, `auditEventKey`, `sourceSkillId`, `eventCode`,
`eventClass`, `eventKind`, `actor`, `resources`, `correlationRefs`,
`outcome`, `evidenceRefs`, `relatedSecurityAuditEventRef?`,
`occurredAt`. **Não incluir**: `auditEventId`, `recordedAt`,
`auditEventHash`.

## 19. Por que `auditEventId` fica fora do hash

O fato semântico é `tenant + key + evento + resources + evidence +
occurredAt`. O ID é identidade de persistência. Excluir `auditEventId`
evita que duas reconstruções legítimas do mesmo fato produzam conteúdo
diferente apenas porque o identificador de armazenamento mudou antes do
commit.

## 20. `recordedAt` também fora

`occurredAt` = quando o fato aconteceu. `recordedAt` = quando o audit
store persistiu. Retries de persistência podem mudar `recordedAt` —
não devem mudar o hash semântico.

## 21. Serialização

Obrigatoriamente `AUDIT_EVENT_V1` + `CANONICAL_SERIALIZATION_V1` (ver
[`CANONICAL-SERIALIZATION.md`](CANONICAL-SERIALIZATION.md), Ponto S10).
S11 já nasce baseado no S10. Nenhum serializer especial.

## 22. Ordem dos arrays

- `resources`: semanticamente set-like. Antes do hash, ordenar por
  `kind`, `ownerSkillId`/`providerKey`, `resourceType`,
  `resourceId`/`externalResourceIdHash`, `resourceHash`/`resourceVersion`
  (canonical equivalent aceitável).
- `correlationRefs`: set-like. Ordenar por `correlationKind`,
  `correlationId`, `correlationHash`.
- `evidenceRefs`: set-like. Ordenar por `ownerSkillId`, `artifactType`,
  `artifactId`, `artifactHash`, `schemaVersion`.

Assim ordem de montagem não muda o audit hash.

## 23. `resources.length`

Para `AuditEvent` operacional/de negócio: `resources.length >= 1`. Não
queremos audit events sem subject. Exceções puramente de segurança
continuam na Skill 25.

## 24. Evidence pode ser vazio

Permitido `evidenceRefs = []` quando o fato é a própria transição
persistida (ex.: `Job CREATED` não precisa inventar evidence externa).

## 25. Append-only

Depois de persistido: `AuditEvent` → **IMUTÁVEL**. Nunca `UPDATE
outcome`/`UPDATE actor`/`UPDATE evidenceRefs`. Mudou o estado? Novo
evento.

## 26. Exemplo

Não: `AuditEvent JOB status=RUNNING → UPDATE status=SUCCEEDED`.
Correto: `AuditEvent #1 SKILL02.JOB_STARTED` + `AuditEvent #2
SKILL02.JOB_SUCCEEDED`.

## 27. Audit trail ≠ state table

`AuditEvent` não vira source of truth primário de `JobStatus`/
`RunStatus`/`ApprovalStatus`/`PublicationStatus`. As respectivas Skills
continuam donas do estado. `AuditEvent` é trilha append-only dos fatos
importantes.

## 28. `AuditEvent` ≠ `OperationalLog`

`OperationalLog` = diagnóstico/telemetria, pode ser sampled/best-effort,
texto técnico pode mudar. `AuditEvent` = fato de negócio/controle
declarado auditável, durável, machine-readable, idempotente,
append-only. Não transformar cada log em audit event.

## 29. `AuditEvent` ≠ `SecurityAuditEvent`

`AuditEvent` = operational/business-control fact. `SecurityAuditEvent`
= security action/control/resource/decision/evidence. Skill 25
continua dona de `SecurityAuditEvent`, sem rename e sem replacement.

## 30. Quando um fato exige ambos

Exemplo: admin aprova primeira publicação real. Pode exigir `AuditEvent`
(business control: `SKILL03.FIRST_REAL_PUBLISH_AUTHORIZED`) e
`SecurityAuditEvent` (actor/capability/access/security-control
evidence). Se ambos forem criados,
`AuditEvent.relatedSecurityAuditEventRef` pode ligá-los.

## 31. Não obrigar duplicação para tudo

Um simples `SKILL02.JOB_SUCCEEDED` não precisa gerar
`SecurityAuditEvent`. Um `invalid webhook signature` pode gerar só
`SecurityAuditEvent`, sem `AuditEvent`.

## 32. Atomicidade — mutação interna

Se o SPEC declara um evento auditável associado a uma mutação durável
interna: `domain mutation + AuditEvent` devem persistir **na mesma
transação**. Exemplo: `Job RUNNING → SUCCEEDED` + `SKILL02.JOB_SUCCEEDED
AuditEvent` atomicamente. Nunca "commit status → depois tenta gravar
audit" quando o audit é obrigatório para aquela transição.

## 33. Falha de audit numa mutação ainda não commitada

Se `AuditEvent` obrigatório não pode ser persistido → transação não
commita. Nada de "status mudou mas audit falhou".

## 34. External side effects são diferentes

Não é possível atomicidade ACID entre Postgres e
Instagram/Shopee/Veo/etc. Portanto side effect usa duas fases
auditáveis. Antes da rede: `durable side-effect checkpoint + AuditEvent
PREPARED/SUBMITTING` na mesma transação. Só depois: `NETWORK`.

## 35. Depois da rede

Quando resultado for observado: `external effect state/result
checkpoint + AuditEvent RESULT_OBSERVED` na mesma transação local. Isso
preserva as garantias fortes que o Fable elogiou: `SUBMITTING` antes da
rede, `UNKNOWN` nunca auto-retry.

## 36. Falha de audit depois de efeito externo

Caso "provider confirmou publicação mas persistência local falhou" —
não podemos "despublicar" nem fingir atomicidade externa. Regra:
`externalEffectState` continua sujeito à reconciliação da Skill dona;
nenhuma progressão adicional dependente deve ocorrer até persistência
local/audit ser reconciliada. Nunca repetir o side effect só pra tentar
gerar o `AuditEvent`.

## 37. O que significa "auditável"

Não obrigamos cada transição de cada entidade a gerar evento. Cada
SPEC define quais fatos são auditáveis. Mas se ela disser `AuditEvent`,
esse nome agora significa exatamente este shared contract — não existe
mais liberdade para criar shape local.

## 38. Required vs best-effort

Não criar `AuditMode = REQUIRED | BEST_EFFORT` para `AuditEvent`. Se é
`AuditEvent`, é durável. Se pode ser perdido sem afetar consistência, é
`OperationalLog`/metric, não `AuditEvent`. Essa regra evita ambiguidade.

## 39. Persistência mínima

O audit store precisa suportar conceitualmente: append; get by
`auditEventId`; get by `tenantId + auditEventKey`; query by
`tenant + time range`; query by resource identity; query by correlation
identity. Não exige tabela/migration nesta fase.

## 40. Tenant isolation no store

Toda consulta: `WHERE tenant_id = trustedTenantId` conceitualmente.
Nenhum `auditEventId` sozinho deve autorizar acesso cross-tenant.

## 41. Segurança de conteúdo

`AuditEvent` é metadata-first. Proibido por padrão: raw prompt, raw
DM/message, raw webhook body, affiliate URL completa, provider
credentials, session material, access token, raw PII. Use refs/hashes.
As políticas mais restritivas da Skill 25 continuam prevalecendo.

## 42. Campo `details`

Não criar `details: Record<string, unknown>` — isso viraria depósito
de dados sensíveis e schema-less. Se uma Skill precisa de detalhes,
materializa artifact próprio → `evidenceRefs`.

## 43. Erros compartilhados

```text
AUDIT_EVENT_REPLAY_CONFLICT
AUDIT_EVENT_TENANT_MISMATCH
AUDIT_EVENT_CODE_INVALID
AUDIT_EVENT_RESOURCE_REQUIRED
AUDIT_EVENT_ATOMIC_PERSISTENCE_FAILED
```

São contract-level errors. Não aumentam contagem `FATAL_ERROR` de
nenhuma Skill automaticamente.

## 44. Consumers podem mapear erro

Exemplo Skill 17: `AUDIT_EVENT_ATOMIC_PERSISTENCE_FAILED` antes da rede
→ não publica. A Skill pode mapear para seu `FATAL_ERROR` interno se
quiser, mas não redefine o shared error.

## 45. Patch nos 23 SPECs

Onde existe referência a `AuditEvent`, adicionar uma única nota
normativa:

> `AuditEvent` neste SPEC referencia exclusivamente o contrato
> compartilhado `AUDIT_EVENT_V1`, definido em
> `src/modules/video-machine/contracts/AUDIT-EVENT.md`. Este SPEC pode
> definir seus `eventCode` namespaced e os fatos que exigem auditoria,
> mas não pode redefinir o shape, tenant scoping, idempotência,
> persistência ou atomicidade de `AuditEvent`.

Não precisa reescrever os 23 arquivos inteiros.

## 46. Local event vocabulary continua permitido

Exemplo, códigos de audit da Skill 17: `SKILL17.PUBLICATION_INTENT_CREATED`,
`SKILL17.PUBLICATION_SUBMITTING`, `SKILL17.PUBLICATION_CONFIRMED` —
isso é permitido. O que não pode existir é um `type AuditEvent = {
publicationId: ... }` local.

## 47. Skill 25

Adicionar apenas a nota: `SecurityAuditEvent` continua sendo o
contrato especializado de auditoria de segurança da Skill 25 e NÃO é
alias de `AuditEvent`. `AuditEvent` operacional/de negócio usa
`AUDIT_EVENT_V1`. Quando o mesmo fato exigir ambos, eles podem ser
correlacionados por `AuditEvent.relatedSecurityAuditEventRef`. Nenhum
patch estrutural obrigatório em `SECURITY_AUDIT_EVENT_V1` — não mexemos
no hash já aprovado da Skill 25.

## 48. Não transformar `SecurityAuditEvent` em subtype

Não fazer `interface SecurityAuditEvent extends AuditEvent` — isso
misturaria tenant operacional, security control, incident data, access
evidence, e criaria coupling desnecessário. Contratos irmãos, não
herança.

## 49-55. Orientação por Skill (não normativa, exemplos de vocabulário local)

- **Skill 02**: auditar pelo menos os boundaries fortes — Job
  materialized, Attempt started, Job terminal transition, BLOCKED
  transition, external-effect uncertainty quando gerida pela fila. Não
  precisa gerar evento pra cada lease heartbeat/poll.
- **Skill 03**: `APPROVAL_REQUEST_CREATED`, `APPROVAL_AUTHORIZED`,
  `APPROVAL_DENIED`, `APPROVAL_EXPIRED`, `FIRST_REAL_PUBLISH_CLAIMED`,
  `FIRST_REAL_PUBLISH_CONFIRMED`. Approval state continua source of
  truth da Skill 03.
- **Skills 11/15/16/17/21**: side-effecting skills seguem `checkpoint
  local + AuditEvent → commit → network` quando o evento é auditável —
  encaixa no protocolo que já temos.
- **Skill 23**: quota ledger continua source of truth de quota;
  `AuditEvent` registra fatos como `AUTHORIZATION_GRANTED`,
  `AUTHORIZATION_DENIED`, `EXECUTION_CLAIMED`, `SETTLEMENT_RECORDED`,
  sem substituir o ledger.
- `eventCode` não deve carregar IDs (errado:
  `SKILL17.PUBLICATION_abc123_CONFIRMED`; correto:
  `SKILL17.PUBLICATION_CONFIRMED` — IDs ficam em `resources`/
  `correlationRefs`).
- `occurredAt` deve vir do fato semântico (ex.: `Job
  settlement.settledAt → AuditEvent.occurredAt`), nunca recomputar
  `new Date()` em cada replay.
- `recordedAt` é preenchido pelo audit store quando a linha é
  persistida — não participa do semantic hash.

## 56. Testes críticos (24)

```text
1. tenantId obrigatório.
2. eventCode válido passa.
3. eventCode sem namespace rejeitado.
4. resource obrigatório.
5. immutable resource exige hash.
6. mutable resource exige version.
7. tenant mismatch rejeitado.
8. mesmo auditEventKey+mesmo hash é replay.
9. mesmo key+hash diferente é conflict.
10. auditEventId não altera auditEventHash.
11. recordedAt não altera auditEventHash.
12. occurredAt altera hash.
13. resources em ordens diferentes → mesmo hash.
14. correlations em ordens diferentes → mesmo hash.
15. evidenceRefs em ordens diferentes → mesmo hash.
16. append-only: mutation rejeitada.
17. raw undefined rejeitado via S10.
18. AuditEvent usa CANONICAL_SERIALIZATION_V1.
19. internal mutation+required audit persistem atomicamente.
20. audit persistence failure impede internal commit.
21. pre-network audit ocorre antes da chamada externa.
22. post-network audit não provoca replay automático do side effect.
23. AuditEvent e SecurityAuditEvent permanecem tipos distintos.
24. security link opcional preserva correlação sem fundir contratos.
```

## 57. Lint barato

Extensão pequena da ferramenta real, análoga à do S10: para cada
`SPEC.md` contendo o token `AuditEvent` → deve conter referência
normativa a `AUDIT_EVENT_V1`; e nenhum `SPEC.md` pode declarar `type
AuditEvent`/`interface AuditEvent`/`enum AuditEvent` local — a única
definição fica no shared contract. Isso não exige o registry G002+.

## 58. Auto-verificação

Após aplicação: `AUDIT-EVENT.md` existe; `type AuditEvent` exatamente 1
no projeto compartilhado; `AuditEventClass`/`AuditEventKind`/
`AuditEventOutcome`/`AuditActorRef`/`AuditResourceRef`/
`AuditCorrelationRef` cada 1; `AUDIT_EVENT_V1` 1 definição canônica; as
23 SPECs que usam `AuditEvent` → 23 referências a `AUDIT_EVENT_V1`;
declarações locais de `AuditEvent` → 0; `SecurityAuditEvent` da
Skill 25 → continua exatamente 1.

## 59. Critério de fechamento do S11

S11 fica fechado quando: (1) `AuditEvent` possui definição real
compartilhada; (2) `tenantId` é obrigatório; (3) `actor` possui forma
compartilhada; (4) `resource` possui identidade explícita; (5)
`eventCode` é namespaced; (6) `outcome` possui vocabulário
compartilhado; (7) evidence é por refs, não payload raw; (8)
`AuditEvent` é append-only; (9) `auditEventKey` possui idempotência;
(10) `AUDIT_EVENT_V1` usa S10; (11) persistência de mutação interna +
audit é atômica; (12) side effects usam pre/post audit sem fingir ACID
externo; (13) `OperationalLog` permanece separado; (14)
`SecurityAuditEvent` permanece separado; (15) os 23 consumidores
apontam para o shared contract; (16) zero definição local concorrente;
(17) lint confirma isso.

## Resultado arquitetural

O problema original — "23 Skills usam `AuditEvent`, mas o que é isso?"
— vira:

```text
Skills01–25 → AUDIT_EVENT_V1 → tenant-scoped, append-only, idempotent,
              canonical-hashed, metadata-first, durable

Skill25 → SecurityAuditEvent (responsabilidades distintas, contratos irmãos)
```
