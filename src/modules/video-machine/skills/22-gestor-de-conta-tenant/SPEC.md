# Skill 22 — Gestor de Conta/Tenant

> **APROVADA EM ESPECIFICAÇÃO — 22/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18, numa **única rodada condensada**
> com o ChatGPT (primeira das 4 Skills de infraestrutura — 22-25 —
> combinadas como versão mínima, diferente do padrão de 3 rodadas/100
> testes das Skills 01-21). Auditoria real do repositório prévia
> confirmou que multi-tenant é hoje puramente aspiracional
> (`tenantId` é valor único hardcoded, autenticação atual é senha
> única compartilhada, sem NextAuth/Supabase Auth), mas Skills
> 03/19/21 já têm promessas reais e vinculantes de autoridade de
> tenant/reviewer que esta Skill formaliza.

## Garantia central (rascunho inicial)


A Skill 22 é a autoridade formal de `tenantId` e identidade/papéis
(RBAC) que as Skills 01-21 já referenciam internamente como
`trustedTenantId = Job.tenantId` — sem essa Skill existir formalmente
até agora. V1 assume **um único tenant implícito** (a realidade atual
do negócio), mas formaliza o contrato de resolução de tenant e
identidade de forma que Skills futuras (e um eventual segundo tenant
real) não exijam reabrir os contratos já aprovados nas Skills 01-21.

## Auditoria real do repositório (2026-09-18)

- **Zero conceito real de multi-tenant existe hoje** — `grep -ri
  tenant src/` não retorna nada fora de SPEC.md/feito.md; nenhuma
  tabela `tenants`/`accounts`/`organizations`/`workspaces` em nenhuma
  das 5 migrations; `src/lib/admin/stats.ts` (usado pelo admin) tem
  zero referência a tenant.
- **`tenantId` hoje é valor único hardcoded** — Skill 01 SPEC.md
  (`## Segurança`, linha ~328): **"`tenant_id` nunca aceito de payload
  externo não autenticado. Hoje (1 tenant) vem de configuração
  interna; no SaaS virá do contexto autenticado."** O único mecanismo
  real hoje é `ProductionRun.tenant_id` como coluna com constraint de
  unicidade (máx. 1 Run ativo por tenant) — scaffolding
  forward-looking, sem lógica real de multi-tenant.
- **Autenticação atual não é auth de usuário real** — `src/middleware.ts`
  (linhas 9-25) e `src/app/api/admin/login/route.ts`: senha única
  compartilhada (`ADMIN_PASSWORD` env var), HMAC-SHA256 em cookie
  assinado (`dc_admin_session`), sem identidade de usuário, sem
  NextAuth/Supabase Auth. Comentário literal no middleware: "Protege
  /admin/* com senha simples (temporária, ver CONTINUIDADE.md)... sem
  biblioteca de sessão... enquanto não existe autenticação de verdade
  (login por e-mail, etc)."
- **Nenhum plano concreto de segundo tenant real** — `CONTINUIDADE.md`
  só menciona `ADMIN_PASSWORD` no contexto de senha única, sem
  linguagem de roadmap SaaS/multi-cliente. A própria Skill 21 já
  rotulou o admin atual como `LEGACY_SINGLE_TENANT_ADMIN` e registrou
  explicitamente "isso não exige reescrever o admin agora" — multi-tenant
  é precaução arquitetural, não feature agendada.
- **9 menções explícitas de "Skill 22" já escritas nas Skills
  anteriores, com promessas reais e vinculantes**:
  - Skill 03 (`skills/03-gestor-de-aprovacao/SPEC.md:66,73,1065,1083`):
    "Definir identidade, papéis ou RBAC de reviewers — isso é da
    Skill 22"; "Skill 22 define quem tem qual capability, Skill 03
    exige e verifica essa [capability]"; "RBAC completo de quem pode
    ser reviewer de um tenant (Skill 22)."
  - Skill 21 (`skills/21-relatorios/SPEC.md:182-186,321`): "Autoridade
    real de tenant não é a Skill 21 — tenant vem de authenticated
    context/integration/account binding/futura Skill 22; quando a
    Skill 22 formalizar tenant/account, Skill 21 passa a reutilizar
    autoridade canônica"; ownership final "Skill22 → tenant/account
    authority futuro".
  - Skill 19: sem menção literal "Skill 22", mas usa extensivamente
    `trustedTenantId = Job.tenantId` com bloqueio
    `PERFORMANCE_TENANT_MISMATCH` — mesmo padrão de autoridade adiada,
    sem nomear a Skill 22 diretamente.

**Veredito da auditoria**: puramente aspiracional/greenfield. `tenantId`
é hoje um valor único hardcoded, não há auth tenant-aware, não há
segundo tenant real no horizonte — mas Skills 03/19/21 têm promessas
reais e vinculantes (identidade/RBAC de reviewer, autoridade de
`trustedTenantId`, autoridade de tenant/account binding) que um stub
mínimo ainda precisa satisfazer formalmente.

## Respostas às 5 perguntas + spec completa (rodada única — debate com ChatGPT, 2026-09-18)

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

ChatGPT fechou a Skill 22 inteira numa única rodada condensada — a
auditoria mostra que construir um SaaS multi-tenant agora seria
prematuro, mas **não é prematuro formalizar a autoridade de tenant e
de reviewer**, porque Skills 03/19/21 já dependem disso. A Skill 22
mínima resolve exatamente duas perguntas: **qual tenant esta execução
está autorizada a representar?** e **qual ator está agindo e quais
capabilities ele possui nesse tenant?** Não cria autenticação, SaaS,
usuários reais ou tabela de tenants agora.

1. **Definimos `TenantIdentity`/`TenantContext` agora?** Sim — não como
   feature multi-cliente, mas como contrato de autoridade. Hoje haverá
   exatamente um tenant configurado; amanhã o resolver pode mudar sem
   reescrever Skills 01-21.
2. **Como cumprir Skill 03 sem auth real?** Não fingimos que
   `ADMIN_PASSWORD` identifica uma pessoa. O operador atual vira um
   principal explícito `LEGACY_SHARED_ADMIN_SESSION`, com
   `identityAssurance=SHARED_CREDENTIAL`. Ele pode possuir capabilities
   específicas, definidas por policy, nunca um rótulo genérico "admin".
3. **Relação com a senha atual?** `TenantAuthorityResolution` resolve
   trivialmente pro único tenant hoje, preparando substituição futura
   sem reescrever nada agora.
4. **Toca código/schema agora?** Não. SPEC 100% contrato, como as
   demais. Na implementação futura, o primeiro adapter pode continuar
   configuration-based e single-tenant — não cria tabela `tenants` com
   uma linha só enquanto não houver segunda organização, usuário
   nominal ou necessidade real de administração persistente.
5. **Quantas rodadas?** Uma — fecha contratos + integrações + erros +
   ~30 testes juntos.

### Garantia central

A Skill 22 resolve, a partir exclusivamente de fontes confiáveis, a
identidade do tenant e do ator que podem participar de uma operação,
produzindo contexto tenant-scoped e decisões explícitas de capability.
Ela nunca aceita `tenantId`, papel ou capability fornecidos por
payload não confiável como autoridade, nunca confunde credencial
compartilhada com identidade humana individual e bloqueia fail-closed
qualquer operação cross-tenant ou não autorizada.

```text
Skill22 resolve identidade/autorização ≠ Skill22 autentica senha/OAuth
```

### Contratos

```typescript
type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
// ACTIVE: operação normal conforme capability.
// SUSPENDED: nenhuma nova operação com side effect; leitura/auditoria
// pode ser permitida.
// DISABLED: nenhuma operação de negócio, só fluxos administrativos/
// security explicitamente autorizados. Não deixa cada Skill inventar
// o significado de SUSPENDED.

type TenantIdentity = {
  tenantId: string;
  tenantKey: string;
  status: TenantStatus;
  displayName?: string; // legal/CNPJ/plano/billing/endereço/branding
  // ficam fora do escopo mínimo — dados de conta real, não autoridade
  identityHash: string;
};
// hash: TENANT_IDENTITY_V1

type ActorIdentityKind = 'LEGACY_SHARED_ADMIN_SESSION' | 'USER' | 'SERVICE';
type ActorIdentityAssurance = 'SHARED_CREDENTIAL' | 'NAMED_AUTHENTICATED_USER' | 'TRUSTED_INTERNAL_SERVICE';

type ActorIdentity = {
  actorId: string;
  kind: ActorIdentityKind;
  assurance: ActorIdentityAssurance;
  identityHash: string;
};
// hash: ACTOR_IDENTITY_V1
```

**Regra importante do admin atual**: o cookie atual pode provar
"alguém apresentou a credencial administrativa válida", não prova
"foi Héber"/"foi usuário X". O ator atual é
`kind=LEGACY_SHARED_ADMIN_SESSION`, `assurance=SHARED_CREDENTIAL`.

```typescript
type TenantCapability = 'TENANT_ADMIN' | 'APPROVAL_REVIEW' | 'PIPELINE_OPERATE'
  | 'INTERNAL_REPORT_VIEW' | 'EXTERNAL_REPORT_DELIVER';
// lista mínima V1 — extensível, mas capability é sempre explícita, nunca "admin" genérico.

type TenantActorBindingStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

type TenantActorBinding = {
  tenantId: string;
  actorId: string; actorIdentityHash: string;
  capabilities: TenantCapability[]; // ordenadas canonicamente
  status: TenantActorBindingStatus;
  bindingVersion: number;
  bindingHash: string;
};
// hash: TENANT_ACTOR_BINDING_V1
```

**Binding não transforma shared credential em usuário** — exemplo
válido: `actor=legacy-admin`, `capabilities=[APPROVAL_REVIEW,
PIPELINE_OPERATE, INTERNAL_REPORT_VIEW, EXTERNAL_REPORT_DELIVER,
TENANT_ADMIN]`, mas continua `assurance=SHARED_CREDENTIAL`. Capability
e identity assurance são dimensões diferentes.

```typescript
type TenantContextSource = 'INTERNAL_JOB' | 'LEGACY_ADMIN_SESSION' | 'AUTHENTICATED_USER_SESSION' | 'PROVIDER_ACCOUNT_INGRESS';
// o terceiro e o quarto são contrato futuro, não implementação atual
// (implementação atual = single tenant, ver "Resolução atual" abaixo).
// PROVIDER_ACCOUNT_INGRESS (Ponto S1): bootstrap de TrustedTenantContext
// a partir de webhook/ingress de provider externo (ex.: Instagram),
// quando ainda não existe sessão de usuário nem job interno confiável.

type TrustedTenantContext = {
  tenantId: string;
  tenantStatus: TenantStatus;
  actor: ActorIdentity;
  capabilities: TenantCapability[];
  source: TenantContextSource;
  resolutionHash: string;
};
// hash: TRUSTED_TENANT_CONTEXT_V1
```

**Toda Skill 01-21 sempre recebe `trusted tenantId ← Skill22
resolver`**, nunca `req.body.tenantId`/`req.query.tenantId`/header
arbitrário/form/LLM output. **Payload pode conter `tenantId` só como
consistency assertion** — se alguma API já carrega `tenantId`, compara
`payload.tenantId === TrustedTenantContext.tenantId` → segue; se
divergir → `TENANT_CONTEXT_TENANT_MISMATCH`. Igualdade nunca concede
autoridade.

### Resolução atual (single tenant)

```typescript
type TenantContextResolutionInput =
  | { source: 'INTERNAL_JOB'; trustedJobTenantId: string; }
  | { source: 'LEGACY_ADMIN_SESSION'; validatedAuthEvidenceRef: string; }
  | { source: 'AUTHENTICATED_USER_SESSION'; authenticatedSubjectRef: string; }
  | {
      source: 'PROVIDER_ACCOUNT_INGRESS';
      providerAccountIngressResolutionRef: {
        providerAccountIngressResolutionId: string;
        providerAccountIngressResolutionHash: string; // = PROVIDER_ACCOUNT_INGRESS_RESOLUTION_V1
      };
      ingressAuthenticationEvidenceRef: KernelArtifactRef;
      inboundEventRef: KernelArtifactRef;
    };

interface TenantContextResolver {
  resolve(input: TenantContextResolutionInput): Promise<TrustedTenantContext>;
}
```

`validatedAuthEvidenceRef` é opaco — nunca senha/cookie bruto dentro
da Skill 22.

**PATCH (Ponto S1 — Provider Account Ingress, Parte B).** Resolver de
`PROVIDER_ACCOUNT_INGRESS` NÃO aceita `providerAccountIngressResolutionRef`
sozinho como prova de tenant — ele é apenas a ligação (binding)
`providerAccountId → tenantId`, resolvida pela Skill 24 (ver
`ProviderAccountIngressResolution` no SPEC da Skill 24). Autoridade real
vem de três checagens obrigatórias, todas com fail-closed:

1. `ingressAuthenticationEvidenceRef` prova criptograficamente que o
   evento veio do provider (ex.: assinatura `X-Hub-Signature-256`
   validada) — sem isso, `PROVIDER_ACCOUNT_INGRESS_EVIDENCE_MISSING`.
2. O provider/conta identificados na evidência de autenticação devem
   bater exatamente com o provider/conta usados na resolução da Skill 24
   — qualquer divergência → `TENANT_CONTEXT_INGRESS_IDENTITY_MISMATCH`.
3. `inboundEventRef` deve ser o mesmo evento inbound que originou a
   resolução — nunca um evento reaproveitado de outra requisição.

Resolução da Skill 24 sem evidência de autenticação **nunca** satisfaz
`TrustedTenantContextSource`. Nunca existe fallback de "usar o binding
mais recente" quando a resolução é ambígua ou ausente — nesse caso o
resolver falha fechado, não adivinha.

```text
Adapter formal: LEGACY_SINGLE_TENANT_CONFIGURATION

Fluxo admin:
signed admin session validada → legacy resolver → único configured
tenant → LEGACY_SHARED_ADMIN_SESSION actor → TrustedTenantContext

Fluxo Jobs:
trusted internal Job + Job.tenantId → internal resolver →
TenantIdentity correspondente → SERVICE actor → TrustedTenantContext
```

**Isso não exige reescrever auth atual** — Skill 22 não precisa tocar
`ADMIN_PASSWORD`/HMAC cookie/login route/middleware agora; no futuro
substituímos por auth real sem mudar a interface consumida pelas
Skills.

### Autorização de capability

**PATCH (Ponto S1, reparo transversal pós-revisão Fable, 2026-09-18)**:
achado do Claude Fable 5 Max — `TenantAuthorizationDecision` provava
"este ator pode exercer a capability X", mas nunca "pode exercer X
sobre ESTA `ApprovalRequest` específica" (achado exato citado pela
própria Skill 03, seção "Rejeição" — `authorizationEvidenceRef` válida
pra outra `ApprovalRequest` já era um caso de teste esperado, mas nunca
tinha formalização no tipo). Corrigido com um `scope` discriminado e
**obrigatório**:

```typescript
type TenantAuthorizationScope =
  | { kind: 'TENANT'; }
  | { kind: 'EXACT_ARTIFACT'; resourceRef: KernelArtifactRef; };

type TenantAuthorizationRequirement = {
  tenantId: string;
  capability: TenantCapability;
  authorizationScope: TenantAuthorizationScope;
  minimumActorAssurance?: 'SHARED_CREDENTIAL' | 'NAMED_AUTHENTICATED_USER';
};

type TenantAuthorizationDecision = {
  tenantId: string;
  actorId: string; actorIdentityHash: string; actorBindingHash: string;
  capability: TenantCapability;
  authorizationScope: TenantAuthorizationScope;
  decision: 'AUTHORIZED' | 'DENIED';
  reason: 'CAPABILITY_GRANTED' | 'TENANT_SUSPENDED' | 'TENANT_DISABLED'
    | 'ACTOR_BINDING_INACTIVE' | 'CAPABILITY_NOT_GRANTED' | 'IDENTITY_ASSURANCE_INSUFFICIENT';
  decisionHash: string;
  decidedAt: string;
};
```
Hash: `TENANT_AUTHORIZATION_DECISION_V1` (patch in-place do projection —
`authorizationScope` passa a participar do hash; pré-runtime, sem V2
artificial). **0 hashes novos** — `TenantAuthorizationScope` é value
type, não ganha hash próprio (usa `KernelArtifactRef`, já hashado, pra
identidade do artifact específico via S10).

**Regras**: existem capabilities legítimas tenant-wide (ver dashboard,
listar integrações, papel administrativo amplo) — essas usam
`{kind:'TENANT'}`. Mas quando a operação sensível é sobre um recurso
específico (decidir UMA `ApprovalRequest`), **`EXACT_ARTIFACT` é
obrigatório e `TENANT` nunca satisfaz esse requirement** — não existe
"`TENANT` é mais amplo, então vale" nesse boundary; exact significa
exact. `requirement.authorizationScope` e `decision.authorizationScope`
precisam concordar pela identidade canônica do scope — uma
`TenantAuthorizationDecision` resolvendo `ApprovalRequest A` nunca
autoriza `ApprovalRequest B`, mesmo com mesmo tenant/ator/capability, e
mesmo se `B` for uma "praticamente a mesma aprovação" semanticamente —
uma nova request exige nova decision. O sistema pode usar um papel
amplo (`TENANT`) como base pra *gerar* a decisão específica, mas nunca
pula a checagem do artifact exato. `DENY` nunca satisfaz
`authorizationEvidenceRef` — mas "autorizado a decidir" (`decision =
AUTHORIZED`) é distinto de "decisão de negócio = aprovado"
(`ApprovalRequest.outcome = APPROVED`); a Skill 03 pode registrar uma
rejeição humana com a `TenantAuthorizationDecision` continuando
`AUTHORIZED` pra exercer a ação de decidir.

Reviewer `legacy-admin` pedindo `APPROVAL_REVIEW` — se a policy aceitar
operador compartilhado, `SHARED_CREDENTIAL` satisfaz. Mas se a
approval policy exigir `minimumActorAssurance=NAMED_AUTHENTICATED_USER`
→ `IDENTITY_ASSURANCE_INSUFFICIENT` — não fingimos ter reviewer humano
nominal. **Esse é o fechamento correto da dívida da Skill 03.**

**Capability precisa ser revalidada no boundary sensível** — um
`TrustedTenantContext` antigo não é licença eterna (ex.: contexto
resolvido às 08:00, binding revogado às 08:05, aprovação tenta ocorrer
às 08:10 — no boundary de side-effect/approval, `Skill03 → Skill22
authorization atual` deve negar). Identidade/lineage pode permanecer
congelada; autorização é point-in-time.

### Integração com Skills existentes

- **Skill 19**: hoje `trustedTenantId = Job.tenantId`; no modelo final,
  `Job.tenantId + internal trusted execution → Skill22 resolves
  TenantContext`. Skill 19 continua exigindo `all analysis sources
  tenantId === TrustedTenantContext.tenantId` — nenhuma mudança
  analítica.
- **Skill 21**: admin atual — `validatedAuthEvidenceRef` aponta pro
  cookie assinado atual.
- **Skill 24 (futura)**: `TenantActorBinding ≠ provider account
  binding` — credenciais/contas/capabilities de Instagram/Shopee/
  Z-API continuam pertencendo à Skill 24, não à Skill 22.

### Idempotência e lifecycle

**Idempotência mínima**: resolver novamente a mesma evidência
confiável enquanto `TenantIdentity`/`ActorIdentity`/`TenantActorBinding`
não mudaram deve produzir o mesmo conteúdo semântico de contexto —
`resolvedAt` não entra na identidade semântica.

**Revogação**: se binding muda `bindingVersion 4 → 5 REVOKED`, novas
decisões usam V5; contextos históricos com V4 permanecem auditáveis,
mas não autorizam novas ações.

**Tenant suspension**: mesmo ator com `APPROVAL_REVIEW` não consegue
aprovar se o tenant estiver `SUSPENDED`/`DISABLED` para operação
side-effecting — capability nunca supera tenant status.

**Fail closed**: se a Skill 22 não consegue resolver inequivocamente
tenant/actor/binding/capability, não existe fallback pra "default
tenant"/"admin global"/"primeiro tenant encontrado". Exceção única: o
adapter explicitamente configurado como
`LEGACY_SINGLE_TENANT_CONFIGURATION` é ele próprio a autoridade atual,
não um bypass silencioso — se um dia existir mais de um tenant, essa
exceção deixa de valer e persistência real passa a ser necessária.

### Erros

**FATAL_ERROR (10):**

```text
TENANT_CONTEXT_TENANT_MISMATCH
TENANT_CONTEXT_ACTOR_MISMATCH
TENANT_CROSS_TENANT_BINDING
TENANT_IDENTITY_HASH_MISMATCH
ACTOR_IDENTITY_HASH_MISMATCH
TENANT_ACTOR_BINDING_HASH_MISMATCH
TENANT_CAPABILITY_ESCALATION_ATTEMPT
TENANT_UNTRUSTED_AUTHORITY_ATTEMPT
TENANT_CONTEXT_INGRESS_IDENTITY_MISMATCH
PROVIDER_ACCOUNT_INGRESS_EVIDENCE_MISSING
```

`TENANT_CONTEXT_INGRESS_IDENTITY_MISMATCH` e
`PROVIDER_ACCOUNT_INGRESS_EVIDENCE_MISSING` (Ponto S1): source
`PROVIDER_ACCOUNT_INGRESS` sem evidência de autenticação válida, ou com
provider/conta divergente entre a evidência e a resolução da Skill 24
— nunca BLOCKED, porque significa que o mecanismo de bootstrap está
sendo usado fora de suas invariantes (dado corrompido ou tentativa de
falsificação), não uma decisão de autorização legítima negada.

**BLOCKED** (resultados esperados de autorização, não corrupção):

```text
TENANT_NOT_CONFIGURED
TENANT_SUSPENDED
TENANT_DISABLED
ACTOR_IDENTITY_UNRESOLVED
ACTOR_BINDING_NOT_FOUND
ACTOR_BINDING_SUSPENDED
ACTOR_BINDING_REVOKED
TENANT_CAPABILITY_NOT_GRANTED
TENANT_NAMED_IDENTITY_REQUIRED
```

**RETRYABLE_ERROR** (só infraestrutura):

```text
TENANT_CONTEXT_RESOLUTION_TRANSIENT_ERROR
TENANT_AUTHORIZATION_STORE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Nunca retry pra `capability denied`/`tenant disabled`/`binding
revoked`.

### Observabilidade

Logs: `tenantId`, `actorId`, `actorKind`, `actorAssurance`,
`contextSource`, `tenantStatus`, `requestedCapability?`,
`authorizationDecision?`, `reason?`, `durationMs`, `errorCode?`. O
penúltimo campo é útil: deixa explícito quando uma approval foi
autorizada por credencial compartilhada.

Audit events: `TrustedTenantContext resolved`, `authorization denied`,
`capability escalation attempt blocked`, `cross-tenant attempt
blocked`, `binding revoked`.

### Hashes canônicos (5)

```text
TENANT_IDENTITY_V1
ACTOR_IDENTITY_V1
TENANT_ACTOR_BINDING_V1
TRUSTED_TENANT_CONTEXT_V1
TENANT_AUTHORIZATION_DECISION_V1
```

"Não precisamos criar 20 hashes para uma Skill aspiracional."

### Plano de testes — 30 casos críticos

**Tenant authority (1-5)**: configured single tenant resolve
corretamente; `tenantId` vindo de payload não concede autoridade;
payload `tenantId` divergente é bloqueado; `INTERNAL_JOB` usa trusted
Job tenant; ausência de tenant configurado falha fechado.

**Actor/legacy auth (6-10)**: sessão admin validada resolve legacy
shared actor; Skill 22 nunca recebe `ADMIN_PASSWORD` bruto; legacy
actor possui `SHARED_CREDENTIAL` assurance; legacy actor nunca aparece
como named authenticated user; auth evidence inválida não produz
TenantContext.

**Binding/capability (11-15)**: binding ACTIVE + capability concede
autorização; capability ausente nega; binding SUSPENDED nega; binding
REVOKED nega; binding de outro tenant é fatal.

**Skill03/reviewer (16-20)**: `APPROVAL_REVIEW` autoriza reviewer
legacy quando policy permite shared credential; reviewer sem
`APPROVAL_REVIEW` é bloqueado; policy que exige named user rejeita
legacy actor; `TenantAuthorizationDecision` registra actor/binding
exatos; capability revogada depois invalida nova approval.

**Tenant lifecycle/isolation (21-25)**: ACTIVE permite operação
autorizada; SUSPENDED bloqueia novo side effect; DISABLED bloqueia
operação de negócio; capability não supera tenant suspension;
contexto tenant A nunca autoriza source/actor do tenant B.

**Integration/security (26-30)**: Skill 19 pode validar Job tenant
pelo TrustedTenantContext; Skill 21 ignora `tenantId` arbitrário do
browser; provider account não é resolvida pela Skill 22; logs não
expõem senha/cookie/token; resolução ambígua nunca cai silenciosamente
para default tenant.

### Cinco fechamentos conceituais (ChatGPT)

1. O sistema continua fisicamente single-tenant hoje, mas deixa de
   tratar `tenantId` como um valor informal: a Skill 22 passa a ser a
   autoridade contratual para determinar qual tenant uma execução pode
   representar.
2. A senha administrativa compartilhada pode conceder capabilities a
   um principal legacy, mas nunca será representada como identidade
   humana nominal. Policies que exigirem identidade individual falham
   fechado até existir autenticação real.
3. Capabilities, e não o rótulo "admin", são a base de autorização.
   Isso satisfaz a dependência da Skill 03 sem construir um RBAC
   empresarial prematuramente.
4. Skill 22 não cria tabelas, autenticação ou SaaS nesta fase. O modo
   atual pode ser resolvido por configuração single-tenant;
   persistência real de tenants/users/memberships só passa a ser
   necessária quando houver necessidade concreta.
5. Skill 22 é responsável por tenant/actor authority. Credenciais,
   contas e capabilities de Instagram, Shopee, Z-API e outros
   provedores continuam pertencendo à Skill 24.
