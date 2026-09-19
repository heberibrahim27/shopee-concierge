# Skill 25 — Segurança/Auditoria

> **IMPLEMENTATION STATUS: `V1_REQUIRED`** (Ponto M5, reparo transversal
> pós-revisão Fable, 2026-09-18 —
> `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1`, contrato completo em
> `src/modules/video-machine/IMPLEMENTATION-SCOPE.md`). Diferente das
> Skills 06/20/21, Skill25 **inteira nunca vira `DEFERRED_V2_CONTRACT`**
> — autenticação de ingress/tenant isolation/credential handling/
> data-handling permanecem obrigatórios no V1. Exceção pontual: o custom
> rate-limit ledger (`SecurityRateLimitPolicy`/
> `SecurityRateLimitWindowState`/`SecurityRateLimitDecision`, ver seção
> própria abaixo) é `DEFERRED_V2_MECHANISM` — `SECURITY REQUIREMENT ≠
> PARTICULAR IMPLEMENTATION MECHANISM`: o requisito de proteção contra
> abuso continua, só esse mecanismo sofisticado específico sai do
> caminho crítico V1.

> **APROVADA EM ESPECIFICAÇÃO — 25/25** (2026-09-18)
>
> **🏁 Última das 25 Skills — o documento de especificação das 25
> Skills da Máquina de Vídeos está completo.**
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 2 rodadas com ChatGPT (decisões
> fundacionais + contratos centrais → patches de compatibilidade +
> finding/incident lifecycle + security gate + rate limiting +
> retention execution + erros + observabilidade + testes), com
> auditoria real do repositório prévia (mesmo método das Skills 04-24).
> Auto-verificação confirmou as condições do ChatGPT antes do carimbo:
> 0 tipos TypeScript duplicados, 20 `FATAL_ERROR`, 18 hashes canônicos
> (7 rodada 1 + 11 rodada 2), 40 testes críticos, e os 3 patches de
> compatibilidade aplicados (`SecurityFinding` imutável, freshness em
> `SecurityControlEvidence`/`SecurityControlRequirement`, invariantes
> de retenção).
>
> ⚠️ **PATCH (Ponto M6, reparo transversal pós-revisão Fable,
> 2026-09-18)**: esta SPEC não carrega mais narrativa de nenhum
> incidente operacional concreto (inclusive o achado original do
> webhook Z-API que motivou boa parte do desenho abaixo). Achados
> operacionais — presença, contenção ou resolução de qualquer
> `SEC-025-*` — são rastreados fora deste documento (ver
> `CONTINUIDADE.md`, seção "Security findings rastreados") e sua
> presença/resolução não altera os contratos normativos definidos
> aqui. Nenhum hash, `FATAL_ERROR` ou tipo foi afetado por esta
> separação; a regra genérica de autenticação de ingress fail-closed
> (ver S1 e a seção "Auditoria real do repositório" abaixo) continua
> V1 obrigatória.
>
> **Última das 25 Skills — 4ª e final das Skills de infraestrutura
> (22-25).** Diferente de Skills 22/23/24, não é dona de um objeto de
> domínio novo (tenant/quota/integração) — é **transversal**: controles
> de segurança, auditoria e detecção de exposição que atravessam as
> outras 24 Skills. Fronteira já congelada pela Skill 24 (linha 489 de
> `24-gestor-de-integracoes/SPEC.md`): *"Skill 25 audita e aplica
> segurança transversal (controles, detecção de exposição, policies
> transversais), mas ownership da credencial continua Skill 24
> (lifecycle/handle/resolution). Senão teríamos ownership quebrado."*

## Garantia central (rascunho inicial)

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
> `SecurityAuditEvent` continua sendo o contrato especializado de
> auditoria de segurança desta Skill e **NÃO é alias** de `AuditEvent`
> (S11 do reparo pós-revisão Fable, 2026-09-18 —
> `src/modules/video-machine/contracts/AUDIT-EVENT.md`).
> `AuditEvent` operacional/de negócio usa o contrato compartilhado
> `AUDIT_EVENT_V1`, não redefinido aqui. Quando o mesmo fato exigir
> ambos, eles podem ser correlacionados por
> `AuditEvent.relatedSecurityAuditEventRef`. Nenhum patch estrutural
> em `SECURITY_AUDIT_EVENT_V1` — hash já aprovado desta Skill
> permanece intocado.


```text
Skill 22 → quem é o tenant/ator autorizado
Skill 23 → pode gastar/consumir quota?
Skill 24 → qual integração/credencial/capability pertence ao tenant?
Skill 25 → segurança/auditoria transversal — nunca dona de domínio novo
```

Skill 25 é a autoridade transversal que audita, detecta exposição e
aplica policies de segurança **através** das outras 24 Skills — nunca
substitui a autoridade específica de nenhuma delas (não decide tenant,
não decide quota, não decide credencial). Formaliza o que 2 Skills já
diferiram explicitamente para ela (retenção de dados sensíveis) e o
padrão "nunca logar X" que 3 Skills (21/23/24) já reinventaram cada
uma à sua maneira.

## Auditoria real do repositório (2026-09-18)

> **PATCH (Ponto M6, reparo transversal pós-revisão Fable, 2026-09-18)**:
> esta seção continha o levantamento operacional específico deste
> repositório (arquivos, rotas, tabelas e incidentes concretos) usado
> pra desenhar os contratos das rodadas 1 e 2 abaixo. Estado
> operacional mutável não pertence ao contrato normativo de uma Skill —
> ele pode abrir, ser corrigido ou mudar de estado sem que a SPEC mude.
> O levantamento original (webhook Z-API, RLS de `product_groups`,
> `CRON_SECRET`, rotação do `MERCADOLIVRE_APP_SECRET`, ausência de
> retenção/deleção, postura de dependências/CI, mecanismo de audit-log)
> foi relocado pro acompanhamento operacional do projeto — ver
> `CONTINUIDADE.md`, seção "Security findings rastreados (Skill 25 —
> Segurança/Auditoria)". A presença ou resolução de qualquer achado
> operacional concreto não altera os contratos normativos definidos
> neste documento. Nenhum hash, `FATAL_ERROR` ou tipo foi afetado por
> esta relocação — a autoridade de ingress (S1:
> `provider ingress → authentication evidence → provider-account
> ingress resolution → Skill22 TrustedTenantContext → durable work`) e
> os contratos desta Skill abaixo continuam intactos.
>
> A metodologia usada (grep exaustivo em `skills/*/SPEC.md`, inspeção
> de rotas/migrations reais, comparação com o padrão das Skills 04-24)
> permanece válida como prática de auditoria — só o resultado factual
> específico deste repositório saiu daqui. Os compromissos genéricos
> que essa auditoria confirmou continuam válidos e estão refletidos nos
> contratos das rodadas 1 e 2 (ex.: Skill 25 é a autoridade de
> retenção/proteção que as Skills 16 e 18 já haviam deferido a ela;
> `AuditEvent` operacional de cada Skill continua distinto de
> `SecurityAuditEvent`).

## Questões reais para o debate com o ChatGPT

1. Como a Skill 25 se posiciona em relação às 22 Skills que já definem
   seu próprio `AuditEvent` local — formaliza um schema/taxonomia
   canônica que as Skills futuras (e talvez as já aprovadas, via
   patch compatível) devem seguir, ou só define a infraestrutura de
   persistência/consulta e deixa cada Skill continuar donas do
   vocabulário próprio de eventos?
2. Skills 16 e 18 já prometeram formalmente que a Skill 25 governa
   retenção/proteção de dados sensíveis (`textRaw`,
   `actorProviderId`, `recipientProviderId`, dados antifraude/
   diagnóstico) — como a Skill 25 modela isso sem virar dona de
   schema de negócio de nenhuma Skill específica?
3. As 3 listas já existentes de "nunca logar" (Skills 21/23/24) têm
   sobreposição real de categoria mas vocabulário próprio — a Skill 25
   central unifica numa taxonomia (`SecuritySensitiveDataCategory` ou
   similar) que as 3 Skills existentes passam a referenciar via patch
   compatível, ou fica só como guidance pra Skills futuras sem tocar
   nas já aprovadas?
4. Dado que zero mecanismo de audit-log de segurança/acesso existe
   hoje (só o run-log leve de `agent_runs`, sem identidade de ator),
   a Skill 25 V1 formaliza contrato completo sem implementar (mesma
   postura NOT_IMPLEMENTED das Skills 22/23/24), ou o volume de
   achados reais (RLS sem policy, cron aberto, credencial vazada sem
   rotação confirmada) justifica pelo menos um mecanismo mínimo de
   registro de "known risk"/"security finding" como parte do V1?
5. Como a Skill 25 trata achados de segurança já reais e abertos hoje
   (RLS desabilitado em `product_groups`, `CRON_SECRET` possivelmente
   não aplicado em produção, rotação de credencial não confirmada) —
   ela vira o lugar formal que rastreia esses "known findings" como
   dado de primeira classe, ou isso fica inteiramente fora de escopo
   da spec e continua só em `CONTINUIDADE.md`?
6. Cabe fechar em rodada única condensada como a Skill 22 (mais
   próxima em natureza — transversal, mecanismo real ausente), ou o
   volume de compromissos + achados reais (2 deferimentos vinculantes,
   3 taxonomias de "nunca logar" já existentes, 4 incidentes reais
   documentados) justifica 2 rodadas como as Skills 23/24 tiveram?

## Rodada 1 — decisões e contratos (debate com ChatGPT, 2026-09-18)

**Decisão de escopo**: **2 rodadas compactas**. Skill 25 é a última,
mas a auditoria encontrou **segurança real em produção**, não só
arquitetura futura — rodada 1 fecha autoridade/taxonomia/contratos
centrais; rodada 2 fecha enforcement/state machines/incidentes/
retenção operacional/erros/~40 testes.

> ⚠️ **Contenção imediata, fora da SPEC** (ChatGPT, verbatim): *"o
> webhook Z-API público sem autenticação, capaz de disparar o
> Concierge e mensagens reais, não deveria permanecer exposto
> esperando Fable/Astra. O mínimo é fail-closed ou desabilitá-lo até
> existir validação confiável. Isso é correção de exposição ativa,
> não implementação completa da Skill 25."* **Esta correção é
> operacional/urgente, separada da spec, e requer decisão do usuário
> antes de qualquer mudança em código de produção** — não foi
> aplicada automaticamente.

### Correção de baseline

`/api/cobrador` **NÃO EXISTE** neste repositório — removido de
qualquer finding/risco desta codebase; não carrega esse achado
(possivelmente de outro projeto) pra Fable/Astra.

### Garantia central (proposta, congelada após rodada 1)

A Skill 25 é a autoridade transversal para requisitos mínimos de
segurança, classificação e proteção de dados, retenção, evidência de
auditoria e registro de incidentes. Ela produz decisões **fail-closed**
quando um controle obrigatório não está comprovado, mantém audit trail
estruturado e minimizado, e **nunca** transforma logs operacionais em
substituto para auditoria de segurança. Ela **não** assume ownership
de autenticação, integrações, quota, aprovação ou lógica de negócio
pertencentes às outras Skills.

Fronteiras:

```text
Skill 22 → identidade do tenant/ator, capability authorization
Skill 23 → quota/spend authorization
Skill 24 → integration binding, credential handles/revisions
Skill 25 → controles transversais, security evidence, security audit,
           data classification, redaction, retention/deletion
           requirements, security findings/incidents
```

### Decisões fundacionais (rodada 1)

1. **Findings reais precisam ser classificados corretamente, sem
   inflar nem minimizar.** Exemplo de classificação aplicada durante a
   auditoria original deste repositório (PATCH, Ponto M6, 2026-09-18:
   estado atual de cada achado vive em `CONTINUIDADE.md`, não aqui):
   - Webhook sem authentication evidence comprovada, com efeitos
     colaterais reais possíveis (ex.: disparo de mensagem) →
     `OPEN SECURITY FINDING`.
   - Webhook Instagram: `HMAC validation=PRODUCTION_VALIDATED`.
   - `CRON_SECRET`: secret existe, mas deployment/aplicação real no
     Vercel é `UNVERIFIED` — logo a proteção de cron deve ser tratada
     como `UNVERIFIED`, não `VERIFIED`.
   - `product_groups`: RLS genuinamente desativado + exposição via
     anon key → `OPEN SECURITY FINDING`.
   - As outras 7 tabelas: RLS habilitado, sem policy, acesso só via
     `service_role` — **NÃO equivalente a "RLS desativado"**. Essa
     distinção precisa permanecer; `service_role` bypassar RLS é
     propriedade arquitetural que exige proteção server-side, mas as
     7 tabelas não devem ser registradas como públicas só por não
     terem policy.
2. **`product_groups` precisa de decisão explícita de exposição, nunca
   "provavelmente está tudo bem".** Skill 25 exige classificação
   `PUBLIC_BY_DESIGN` ou `NOT_PUBLIC`. Se `NOT_PUBLIC`: acesso anon =
   violação de segurança. Se realmente precisa ser pública: exige
   policy explícita + campos/ações permitidos explícitos + evidência
   auditável. Nunca exposição por acidente virando arquitetura oficial.
3. **CRON precisa ser fail-closed, sempre.** Regra forte: `rota exige
   CRON_SECRET + CRON_SECRET ausente/não configurado → REJECT`. Nunca
   `if CRON_SECRET exists: validate else: allow` — exatamente o tipo
   de fallback que a Skill 25 deve proibir. O secret ter sido gerado
   localmente não prova proteção no deployment real.
4. **Secret vazado de um provider continua incidente mesmo sem
   consumer ativo.** Um dead-end de integração não reduz a relevância
   do vazamento. Exemplo de classificação: `compromise evidence
   exists, rotation confirmation missing → SECURITY_FINDING OPEN`
   (estado atual de achados concretos vive em `CONTINUIDADE.md`, ver
   Ponto M6). Skill 25 não gira a credencial (isso é Skill 24), mas
   pode exigir que a revisão não seja considerada confiável pra uso
   futuro até a Skill 24 registrar evidência de substituição/
   revogação. Nunca presumir rotação só porque alguém pretendia
   fazê-la.
5. **Log operacional e audit trail de segurança são produtos
   diferentes.** Hoje só existe run-log leve (`agent_runs`) — isso não
   é audit trail de segurança. `OperationalLog ≠ SecurityAuditEvent`.
   Operational log serve pra debug/latência/estado de worker/provider
   errors. Security audit serve pra responder: quem/qual serviço fez?
   em qual tenant? qual ação? sobre qual recurso? qual controle foi
   avaliado? qual decisão? qual evidência? quando?
6. **Audit event aceita a limitação real do admin compartilhado.** Com
   a Skill 22 (`actorKind=LEGACY_SHARED_ADMIN_SESSION,
   actorAssurance=SHARED_CREDENTIAL`), o audit trail pode provar "uma
   sessão administrativa compartilhada autorizada executou a ação" —
   nunca "pessoa física X executou a ação". Essa limitação precisa
   sobreviver até existir auth nominal.
7. **Hash de evento é integrity-verifiable, nunca "tamper-proof".** Se
   alguém controla banco + código, pode alterar ambos. Terminologia
   correta: `integrity-verifiable`. Hash-chain/digest externo pode ser
   evolução futura — não complicar a V1 com blockchain/WORM.
8. **Taxonomia única pra "nunca logar", sem alterar hashes já
   aprovados.** Skills 21/23/24 já criaram listas próprias — elas não
   estão erradas, só falta vocabulário comum. Duas dimensões
   independentes: `SecurityConfidentialityClass`
   (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`/`SECRET`) e
   `SecurityDataCategory` (10 categorias, contrato abaixo). Exemplo:
   API token → `SECRET`+`AUTH_CREDENTIAL`; mensagem WhatsApp →
   `CONFIDENTIAL`+`MESSAGE_CONTENT`; `runId` →
   `INTERNAL`+`OPERATIONAL_METADATA`.
9. **Regras das Skills antigas continuam válidas — regra mais
   restritiva sempre vence.** `Skill-specific restriction + Skill 25
   global policy → aplicar a regra mais restritiva`. Ex.: Skill 21 já
   diz "canonical free text não logar por padrão" — Skill 25 não pode
   flexibilizar isso globalmente.
10. **Redaction é centralizada semanticamente, cada Skill não
    reinventa `"***"`.** Para `SECRET`, `logging=PROHIBITED` é o
    default correto — nunca armazenar hash/fingerprint derivado de
    segredo como alternativa automática (mesma regra já congelada na
    Skill 24).
11. **Retenção precisa nascer agora, porque Skills 16/18 já
    delegaram isso.** A ausência atual de deleção não deve virar
    `RETENTION=FOREVER` por acidente. Três modos:
    `DELETE_AFTER`/`RETAIN_WHILE_OPERATIONALLY_REQUIRED`/
    `LONG_TERM_AUDIT`.
12. **Não inventar números de retenção agora.** Não há base auditada
    pra dizer "mensagens=30 dias, métricas=365". A SPEC suporta
    configuração, mas valores reais ficam `NOT_CONFIGURED` até decisão
    de negócio/legal. **Importante: `NOT_CONFIGURED` ≠ retain
    forever** — deve aparecer como finding/configuration block quando
    dados sensíveis estão envolvidos.
13. **Deletion evidence precisa existir, sem preservar o dado
    apagado.** No runtime futuro não basta `DELETE FROM table` e
    esquecer — precisamos saber que uma ação de retenção ocorreu, sem
    guardar IDs sensíveis individualizados quando não necessário.
14. **Audit logs também precisam de retenção — "é auditoria" não
    significa retenção infinita automática.** Pode existir
    `LONG_TERM_AUDIT` com prazo/configuração apropriados, mas sempre
    policy explícita.
15. **Ingress security modelada por tipo de entrada, nunca um
    middleware genérico universal.** Tipos: `PUBLIC_WEBHOOK`/
    `ADMIN_COOKIE_ROUTE`/`CRON_ROUTE`/`PUBLIC_API`/`INTERNAL_SERVICE`
    — cada um exige controles diferentes.
16. **Webhook policy — `PUBLIC_WEBHOOK` exige**: source authentication
    obrigatória, replay/dedupe quando aplicável, body size limit,
    rate/abuse control, fail closed. Providers diferentes comprovam
    isso de formas diferentes (ex.: HMAC de assinatura, shared secret
    em header) — o requisito é sempre "evidência de autenticação
    verificada ou fail closed", nunca a implementação específica de um
    provider (estado real de cada webhook deste projeto vive em
    `CONTINUIDADE.md`, ver Ponto M6).
17. **URL secreta não é autenticação.** Nenhum webhook pode se apoiar
    em "é um endpoint secreto porque a URL ninguém sabe". V1 exige
    forma configurada de signature/shared secret/token ou outro
    mecanismo suportado pelo provider, validado antes do pipeline. Se
    não houver mecanismo seguro disponível pra um provider: `endpoint
    DISABLED/BLOCKED` é melhor que aceitar qualquer POST.
18. **Cron security**: `CRON_ROUTE → secret authentication REQUIRED`;
    `secret missing → fail closed`. Apenas colocar uma env no projeto
    local não satisfaz controle de produção.
19. **Admin cookie routes têm requisitos mínimos, sem criar auth
    nominal.** Signed session validation, secure cookie attributes,
    CSRF protection pra requests state-changing, rate limiting no
    login. Skill 22 continua dona da identidade — Skill 25 não cria
    autenticação nominal aqui.
20. **CSRF é dívida real, precisa de estratégia explícita.** Pra
    endpoints state-changing autenticados por cookie
    (`POST`/`PUT`/`PATCH`/`DELETE`): estratégia anti-CSRF explícita —
    pode ser same-site + Origin validation + CSRF token — sem
    congelar tecnologia específica na SPEC.
21. **CORS: ausência de config não é automaticamente vulnerabilidade.**
    Regra correta: same-origin default, qualquer cross-origin exige
    allowlist explícita. Nunca `Access-Control-Allow-Origin: *` +
    credentials. Não adicionar CORS global só "pra ter CORS".
22. **CSP é exigível sem congelar diretivas agora.** Skill 25 pode
    exigir "production CSP configured", mas não precisa definir cada
    directive agora — configuração real na fase de runtime/review
    conforme assets/scripts reais.
23. **Rate limiting é por superfície, nunca um número universal.**
    Boundaries principais: admin login, public webhook, public
    concierge ingress, expensive public endpoint. Policy-driven:
    scope, window, maximum requests, identity basis, action when
    exceeded.
24. **Nem tudo vira P0.** "Zero CSP" é dívida de hardening, não
    equivalente ao webhook público com side effect real. Mesma coisa
    pra CORS — evitar lista em que tudo vira crítico.
25. **Skills 16/18 ficam finalmente fechadas quanto à retenção.**
    Elas produzem conteúdo sensível (Skill 16: interações; Skill 18:
    métricas/commercial evidence) — podem registrar `dataCategory` +
    `retentionPolicyRef`, ou deixar a classificação ser resolvida pela
    Skill 25, mas **não definem prazo por conta própria**. Skill 25 é
    autoridade.
26. **Skills 21/23/24 não têm hash alterado — só mapeamento.** No SPEC
    da Skill 25, registra mapeamento de cada never-log set existente
    pra `SecurityDataCategory`. Em runtime: `global Skill25 policy +
    consumer-specific prohibition → regra mais restritiva`.
27. **Skill 25 não tem acesso irrestrito a conteúdo só porque é
    "segurança".** Audit trail prefere metadata/IDs/hashes/reason
    codes — nunca copia mensagem WhatsApp/prompt/provider raw payload
    pra um segundo banco "de segurança". Senão aumenta a superfície de
    vazamento.
28. **RLS baseline V1**: *"Toda tabela acessível através de credencial
    client-side/anon deve possuir uma decisão explícita de exposição e
    controles correspondentes; ausência de RLS/policy não pode ser
    usada como mecanismo implícito de publicação."* Pra tabelas
    server-only usando `service_role`: RLS enabled/no policy pode ser
    postura válida, desde que `service_role` nunca saia do servidor.
29. **`SUPABASE_SERVICE_ROLE_KEY` é finding fatal se exposta.**
    Classificação: `SECRET` + `AUTH_CREDENTIAL`, `logging=PROHIBITED`,
    `client exposure=PROHIBITED`. Skill 25 deve ter finding fatal se
    detectado em bundle/browser/log.
30. **Skill 25 V1 não é um DLP scanner completo.** Define
    `secret exposure = security violation` como conceito, mas a
    prevenção concreta (server-only boundaries, redaction, static
    checks, runtime guards) fica pra implementação/review.
31. **Prioridade estrutural entre classes de controle** (critério de
    ChatGPT, não hierarquia arbitrária, PATCH Ponto M6 2026-09-18 —
    lista de achados concretos priorizados neste projeto num dado
    momento vive em `CONTINUIDADE.md`, não nesta SPEC):

    ```text
    IMMEDIATE CONTAINMENT
    — achados com efeito colateral real e ativo: ingress capaz de
      disparar ação de negócio sem autenticação comprovada, dado
      tenant-scoped exposto por engano a credencial anônima,
      credencial comprometida sem rotação/revogação confirmada.

    HARDENING / GOVERNANCE
    — dívida de controle sem exploração conhecida: security audit
      trail, data classification/redaction taxonomy,
      retention/deletion, rate limiting, CSRF, CSP / explicit CORS
      policy.
    ```

    Achados de `IMMEDIATE CONTAINMENT` sempre têm prioridade de
    contenção acima de itens de `HARDENING / GOVERNANCE`.

### Contratos centrais (rodada 1)

```typescript
type SecurityConfidentialityClass =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'SECRET';

type SecurityDataCategory =
  | 'AUTH_CREDENTIAL'
  | 'SESSION_MATERIAL'
  | 'PERSONAL_IDENTIFIER'
  | 'MESSAGE_CONTENT'
  | 'CANONICAL_FREE_TEXT'
  | 'PROVIDER_RAW_PAYLOAD'
  | 'FINANCIAL_DATA'
  | 'AFFILIATE_TRACKING_DATA'
  | 'OPERATIONAL_METADATA'
  | 'SECURITY_AUDIT_METADATA';
// As duas dimensões são independentes. Ex.: API token → SECRET +
// AUTH_CREDENTIAL; WhatsApp message body → CONFIDENTIAL +
// MESSAGE_CONTENT; runId → INTERNAL + OPERATIONAL_METADATA.

type SecurityAuditOutcome = 'ALLOWED' | 'DENIED' | 'BLOCKED' | 'OBSERVED';

type SecurityAuditEvent = {
  securityAuditEventId: string;
  tenantId?: string;

  actor?: {
    actorId: string;
    actorIdentityHash: string;
    actorKind: string;
    actorAssurance: string;
  };

  eventKey: string;
  eventType: string;
  securityDomain: string;

  subjectRefs: Array<{
    subjectKind: string;
    subjectId: string;
    subjectHash?: string;
  }>;

  outcome: SecurityAuditOutcome;
  reasonCodes: string[];
  evidenceRefs: string[];

  correlationRefs: {
    runId?: string;
    jobId?: string;
    attemptNumber?: number;
  };

  eventHash: string;
  occurredAt: string;
};
// hash: SECURITY_AUDIT_EVENT_V1 — append-only. Sem segredo, payload
// bruto ou conteúdo de mensagem.

type SecurityDataHandlingPolicy = {
  policyId: string;
  policyVersion: string;

  confidentialityClass: SecurityConfidentialityClass;
  dataCategory: SecurityDataCategory;

  logging: 'PROHIBITED' | 'REDACTED_ONLY' | 'METADATA_ONLY' | 'ALLOWED';
  auditStorage: 'PROHIBITED' | 'METADATA_ONLY' | 'ALLOWED';

  retentionPolicyKey: string;

  policyHash: string;
};
// hash: SECURITY_DATA_HANDLING_POLICY_V1

type SecurityRedactionAction = 'REMOVE' | 'MASK' | 'METADATA_ONLY';
// Para SECRET, logging=PROHIBITED é o default — nunca hash/fingerprint
// derivado de segredo como alternativa automática.

type RetentionMode =
  | 'DELETE_AFTER'
  | 'RETAIN_WHILE_OPERATIONALLY_REQUIRED'
  | 'LONG_TERM_AUDIT';

type DataRetentionPolicy = {
  retentionPolicyId: string;
  tenantId?: string;

  policyKey: string;
  policyVersion: string;

  dataCategory: SecurityDataCategory;
  mode: RetentionMode;

  maximumRetentionDays?: number;
  deletionRequired: boolean;

  policyHash: string;
};
// hash: DATA_RETENTION_POLICY_V1
// Valores reais ficam NOT_CONFIGURED até decisão de negócio/legal —
// NOT_CONFIGURED ≠ retain forever.

type DataDeletionEvidence = {
  dataDeletionEvidenceId: string;
  tenantId?: string;

  retentionPolicyHash: string;
  subjectCategory: SecurityDataCategory;

  deletedRecordCount: number;
  deletionScopeHash: string;

  evidenceHash: string;
  deletedAt: string;
};
// hash: DATA_DELETION_EVIDENCE_V1 — sem IDs sensíveis individualizados
// quando não necessário.

type SecurityControlRequirement = {
  controlKey: string; // ex.: ingress.webhook.authentication, admin.csrf
  subjectKind: string;
  enforcement: 'REQUIRED' | 'OPTIONAL';
  failureMode: 'FAIL_CLOSED' | 'OBSERVE_ONLY';
  maximumEvidenceAgeSeconds?: number; // PATCH (rodada 2): freshness
  requirementHash: string;
};
// Exemplos de controlKey: ingress.webhook.authentication,
// ingress.cron.authentication, admin.csrf, admin.login.rate_limit,
// browser.csp, data.rls, logging.secret_redaction,
// retention.sensitive_data.
// PATCH (rodada 2): se maximumEvidenceAgeSeconds é exigido e a
// evidence correspondente venceu, ela não é VERIFIED pra aquele gate.

type SecurityControlEvidence = {
  securityControlEvidenceId: string;
  controlKey: string;

  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE';

  evidenceBasis:
    | 'PRODUCTION_TEST'
    | 'CONFIGURATION_INSPECTION'
    | 'REPOSITORY_INSPECTION'
    | 'MANUAL_VERIFICATION';

  evidenceRefs: string[];
  evidenceHash: string;
  observedAt: string;
  validUntil?: string; // PATCH (rodada 2): freshness
};
// hash: SECURITY_CONTROL_EVIDENCE_V1
// Resolve CRON_SECRET corretamente: controlKey=ingress.cron.authentication,
// environment=PRODUCTION, status=UNVERIFIED — nunca VERIFIED só porque
// o secret existe em algum lugar.

type SecurityControlDecision = {
  securityControlDecisionId: string;
  tenantId?: string;

  controlKey: string;
  evidenceHash?: string;

  decision: 'ALLOW' | 'DENY';
  reason:
    | 'CONTROL_VERIFIED'
    | 'CONTROL_NOT_CONFIGURED'
    | 'CONTROL_UNVERIFIED'
    | 'CONTROL_FAILED'
    | 'POLICY_VIOLATION';

  decisionHash: string;
  decidedAt: string;
};
// hash: SECURITY_CONTROL_DECISION_V1
// Fail-closed real: REQUIRED+FAIL_CLOSED com status VERIFIED → prossegue;
// UNVERIFIED/FAILED/NOT_CONFIGURED → DENY. Nunca "warning + continua".

type SecurityFindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type SecurityFinding = {
  securityFindingId: string;
  findingKey: string;

  severity: SecurityFindingSeverity;

  controlKey: string;
  affectedSubjectRefs: string[];
  evidenceRefs: string[];

  findingHash: string;
  detectedAt: string;
};
// hash: SECURITY_FINDING_V1 — PATCH (rodada 2): status saiu deste tipo
// imutável. SecurityFindingStatus (4 estados, rodada 1) é substituído
// por SecurityFindingLifecycleStatus (5 estados, rodada 2), vivendo em
// SecurityFindingLifecycle (mutável, sem hash integral).
// NOTA (ChatGPT, auto-flagrada): "status é mutável, então o finding
// factual original e o lifecycle precisam ser separados se formos
// rigorosos no bloco operacional" — será formalizado como identidade
// imutável + runtime state mutável na rodada 2, mesmo guardrail já
// aplicado como patch de compatibilidade na Skill 24.
```

**Distinção fundamental**: `SecurityAuditEvent` (algo aconteceu) ≠
`SecurityFinding` (existe uma condição de risco que precisa ser
resolvida) — precisamos dos dois.

### Baseline inicial de findings (registrado conceitualmente)

> **PATCH (Ponto M6, reparo transversal pós-revisão Fable, 2026-09-18)**:
> o desenho de `SecurityFinding`/`findingKey` foi validado contra 5
> achados reais deste repositório (`SEC-025-ZAPI-WEBHOOK-AUTH`,
> `SEC-025-PRODUCT-GROUPS-ANON-RLS`, `SEC-025-CRON-PRODUCTION-AUTH`,
> `SEC-025-ML-SECRET-ROTATION`, `SEC-025-RETENTION-NOT-CONFIGURED`) —
> isso deu rastreabilidade real pra Fable/Astra durante a revisão. Os
> identificadores acima servem só de exemplo de formato de
> `findingKey`; o status atual de cada um (`OPEN`/`CONTAINED`/etc.) é
> estado operacional mutável e vive fora desta SPEC — ver
> `CONTINUIDADE.md`, seção "Security findings rastreados".

### Fechamentos da rodada 1

- Segurança não será inferida da ausência de erro. Um controle
  obrigatório só é considerado satisfeito quando existe evidência
  compatível com o ambiente e freshness exigidos.
- Logging operacional e audit trail são produtos diferentes. O audit
  trail registra ator/tenant/ação/decisão/evidência com minimização de
  dados; não replica payloads sensíveis.
- As listas "nunca logar" já existentes (Skills 21/23/24) continuam
  vinculantes. Skill 25 cria a taxonomia comum e aplica sempre a regra
  mais restritiva.
- Retenção infinita nunca é o default implícito. Ausência de retention
  policy é uma lacuna configuracional, não autorização pra manter
  dados indefinidamente.
- RLS ligado sem policies em tabelas server-only não será confundido
  com RLS desligado. Já uma tabela acessível por anon precisa de
  exposição pública explicitamente intencional e controlada.
- Webhook, cron ou outra entrada protegida falha fechado quando sua
  autenticação obrigatória está ausente ou não comprovada.
- Skill 25 registra e exige mitigação de credencial comprometida, mas
  revogação/rotação do segredo continua sendo responsabilidade
  operacional da Skill 24.

## Rodada 2 — state machines, incidentes, enforcement, testes (debate com ChatGPT, 2026-09-18)

### Patches de compatibilidade ao bloco 1 (não reabrem os hashes da rodada 1)

- **Patch 1 — `SecurityFinding` imutável.** `status` sai do tipo
  hasheado (mesmo guardrail já aplicado como patch na Skill 24):
  `SecurityFinding` mantém só `securityFindingId`, `findingKey`,
  `severity`, `controlKey`, `affectedSubjectRefs`, `evidenceRefs`,
  `findingHash`, `detectedAt`. `SECURITY_FINDING_V1` continua sendo o
  hash canônico. Status operacional vai pro lifecycle separado
  (contrato abaixo). `SecurityFindingStatus` (4 estados, rodada 1) é
  substituído por `SecurityFindingLifecycleStatus` (5 estados).
- **Patch 2 — freshness de `SecurityControlEvidence`.** Adiciona
  `validUntil?: string` à evidence e `maximumEvidenceAgeSeconds?:
  number` ao `SecurityControlRequirement`. Se o controle exige
  evidence fresca e ela venceu, não é `VERIFIED` pra aquele gate.
- **Patch 3 — retenção configurável nunca significa retenção
  infinita.** Invariantes congeladas: `mode=DELETE_AFTER →
  maximumRetentionDays obrigatório + deletionRequired=true`;
  `maximumRetentionDays` ausente nunca significa `FOREVER`; retenção
  necessária + policy não configurada → `BLOCKED`/finding.

### Decisões fundacionais (rodada 2)

1. **`CONTAINED` ≠ `RESOLVED`.** Exemplo Z-API: endpoint desabilitado
   → `CONTAINED`. Só depois, com autenticação implementada + teste de
   produção comprovado → `RESOLVED`. Evita fechar finding só porque o
   endpoint foi tirado do ar temporariamente.
2. **`ACCEPTED_RISK` precisa ser explícito, nunca implícito.** Nunca
   "ninguém corrigiu há 3 meses → implicitamente accepted".
   `ACCEPTED_RISK` deve gerar audit event + evidence de decisão
   administrativa — preservando `actorAssurance=SHARED_CREDENTIAL`
   quando aplicável (sem depender de identidade nominal enquanto só
   existe credencial compartilhada).
3. **Os 5 findings iniciais permanecem — nenhum é resolvido
   automaticamente pela SPEC.** `SEC-025-ZAPI-WEBHOOK-AUTH`,
   `SEC-025-PRODUCT-GROUPS-ANON-RLS`, `SEC-025-CRON-PRODUCTION-AUTH`,
   `SEC-025-ML-SECRET-ROTATION`, `SEC-025-RETENTION-NOT-CONFIGURED`.
4. **Finding ≠ Incident.** Finding = condição de risco. Incident =
   exposição/comprometimento/exploração ou evento de segurança que
   requer coordenação. Webhook sem auth: `finding=sim,
   incident=somente se houver evidência de abuso/exploração`. Secret
   conhecido como vazado (Mercado Livre): `finding=sim,
   incident=apropriado`.
5. **Incident nunca apaga finding — lifecycles relacionados, mas
   independentes.** Mesmo quando incident chega a `RESOLVED`, o
   finding correspondente só passa a `RESOLVED` quando o controle
   vulnerável também estiver corrigido e comprovado.
6. **Comprometimento de credential vira handoff formal pra Skill 24.**
   Skill 25 detecta/exige mitigação; Skill 24 continua dona de
   credential lifecycle/rotation/revocation. Skill 25 **nunca**
   recebe o secret comprometido — o handoff contém IDs/hashes/
   provider/revision identity, nunca API key/token/password.
7. **Secret comprometido sem binding Skill 24 resolvido**:
   `SECURITY_CREDENTIAL_BINDING_UNRESOLVED` — não impede que o
   incident exista, mas o incident não pode ser declarado resolvido
   até haver evidência suficiente da mitigação apropriada. Skill 25
   nunca gira a chave — fluxo: `Skill25 Incident →
   SecurityCredentialCompromiseHandoff → Skill24
   CredentialLifecycleCommand → rotation/revocation → Skill24
   evidence → Skill25 incident transition`.
8. **Gate é AND, nunca "maioria".** Se a surface exige `webhook auth +
   rate limit + body limit` e temos `auth VERIFIED, body VERIFIED,
   rate limit FAILED` → resultado `DENY`. Um controle aprovado não
   compensa outro obrigatório que falhou.
9. **Evidence vencida nunca satisfaz o gate.** Se `validUntil < now`,
   não reaproveitar "foi verificado mês passado" pra sempre.
10. **Gate replay idempotente.** Unicidade `gateRequestKey`. Mesma
    key + mesmo request hash → mesma decisão. Mesma key + outro
    conteúdo/evidence → `FATAL_ERROR`.
11. **Aplicação concreta do gate a dois providers de exemplo.** Um
    webhook com evidence de autenticação verificada (ex.: HMAC válido)
    satisfaz `webhook.source_authentication`. Um webhook cujo
    `source auth evidence` está `FAILED`/`NOT_CONFIGURED` recebe
    `SecurityGateDecision=DENY` até existir mecanismo confiável — nunca
    "warning + pipeline de negócio continua" (estado real de cada
    webhook deste projeto vive em `CONTINUIDADE.md`, ver Ponto M6).
12. **Cron formaliza o fail-closed.** `CRON_ROUTE` requer
    `cron.authentication`; se production secret não foi comprovado →
    `DENY` pra rota protegida.
13. **Admin cookie mutation exige sessão válida E CSRF — sessão
    sozinha não basta.** `ADMIN_COOKIE_MUTATION` requer
    `admin.session_validation` + `admin.csrf` (+ rate limit opcional
    conforme policy da rota).
14. **Login precisa de rate-limit mesmo sem ator autenticado ainda.**
    `ADMIN_LOGIN → rate-limit obrigatório` — precisa funcionar antes
    da Skill 22 resolver identidade.
15. **Rate limit nunca guarda IP puro.** Pra limitação baseada em
    IP/rede, o runtime produz `opaque subject key` — não se guarda IP
    puro na ledger de rate limit; a derivação concreta fica pra
    implementação segura.
16. **Counter de rate limit precisa ser atômico.** Duas requisições
    concorrentes não podem ambas ler `99/100` e ambas serem
    autorizadas como request 100. Operação lógica:
    `lock/CAS → increment → compare limit → decision`.
17. **Rate limiting não é autenticação.** Request dentro do limite mas
    não autenticada continua negada no webhook — rate limit só reduz
    abuso, não comprova origem.
18. **Cutoff de retenção vem sempre da policy, nunca de "mais ou menos
    30 dias" escolhido pelo worker.** Deriva de `DataRetentionPolicy +
    current evaluation time`.
19. **Deletion plan não persiste conteúdo sensível.** O plan precisa
    provar qual scope/cutoff/quantas linhas — nunca duplicar
    mensagens/PII numa tabela de deleção. Detalhes internos
    transitórios podem existir no executor, não no artifact canônico.
20. **Deleção precisa verificar, nunca assumir sucesso total.** Fluxo:
    `plan → delete → verify scope → DataDeletionEvidence`. Se só
    parte foi removida: `PARTIAL` — nunca registrar falsamente a
    quantidade planejada como deletada.
21. **Replay de deleção não recalcula cutoff.** Mesmo
    `executionRequestKey` não cria outra deletion independente. Se
    crash ocorrer depois do `DELETE` mas antes do evidence: retry
    verifica o mesmo scope/plan e materializa evidence restante.
22. **Retention policy ausente pra categoria obrigatória vira finding,
    nunca "guardar até alguém decidir".**
    `SECURITY_RETENTION_POLICY_NOT_CONFIGURED` + finding.
23. **Audit é append-only, sempre.** `SecurityAuditEvent`: nunca
    `UPDATE`, nunca `DELETE` comum (salvo futura política explícita).
    Replay por `(event scope, eventKey)`: mesmo hash → mesmo evento;
    hash divergente → `FATAL_ERROR`.
24. **Falha ao gravar audit obrigatório é conservadora — pode ser
    fail-open pra observabilidade, nunca pra segurança crítica.** Pra
    eventos `SECURITY_CRITICAL_AUDIT_REQUIRED`: falha de persistência
    → bloqueia o side effect (permitir operação sensível sem trilha
    quando policy exige audit seria fail-open). Pra observabilidade
    não crítica: pode retry sem bloquear — controlado pela
    requirement/policy.
25. **Audit trail nunca vira segunda cópia de dados sensíveis.**
    Continua proibido: mensagem WhatsApp, prompt, API token, raw
    webhook body, provider payload. Usa metadata, hashes canônicos já
    existentes, reason codes, resource refs.
26. **Finding resolution técnico exige evidence, nunca fechamento
    manual sem prova.** Nenhum `status=RESOLVED` manual sem evidence
    correspondente quando o finding é sobre controle técnico
    verificável (ex.: cron — `production auth VERIFIED → pode
    resolver`).
27. **`ACCEPTED_RISK` pra exposição pública exige due diligence, nunca
    atalho.** Se alguém decidir deixar `product_groups` pública, isso
    precisa primeiro ser `PUBLIC_BY_DESIGN` + security policy
    correspondente + accepted exposure explicitamente documentada —
    nunca `ACCEPTED_RISK` só pra contornar exposição acidental sem
    entender os dados.
28. **CSP/CORS/RLS reutilizam os contratos genéricos, sem state
    machine própria.** `browser.csp`, `cross_origin.policy`,
    `data.client_exposure_explicit`, `data.rls_enabled`,
    `data.anon_access_intended`, `service_role.server_only` usam
    `SecurityControlRequirement`/`SecurityControlEvidence`/
    `SecurityFinding` — Skill 25 avalia evidence, não substitui o
    Supabase.
29. **Eventos das Skills 22-24 podem gerar audit, sem duplicar tudo.**
    Ex.: capability authorization denied, quota bypass blocked,
    credential revoked, cross-tenant integration denied — só eventos
    que a policy classifica como relevantes.

### Contratos centrais (rodada 2)

```typescript
type SecurityFindingLifecycleStatus =
  | 'OPEN'
  | 'CONTAINED'
  | 'REMEDIATING'
  | 'RESOLVED'
  | 'ACCEPTED_RISK';

type SecurityFindingLifecycle = {
  securityFindingId: string;
  status: SecurityFindingLifecycleStatus;
  version: number;
  updatedAt: string;
};
// Mutável, sem hash integral.

type SecurityFindingTransitionReason =
  | 'FINDING_CREATED'
  | 'IMMEDIATE_CONTAINMENT_APPLIED'
  | 'REMEDIATION_STARTED'
  | 'CONTROL_VERIFIED_FIXED'
  | 'RISK_FORMALLY_ACCEPTED'
  | 'RISK_ACCEPTANCE_REVOKED';

type SecurityFindingTransition = {
  securityFindingTransitionId: string;
  securityFindingId: string;
  findingHash: string;
  fromStatus?: SecurityFindingLifecycleStatus;
  toStatus: SecurityFindingLifecycleStatus;
  reason: SecurityFindingTransitionReason;
  evidenceRefs: string[];
  versionBefore: number;
  versionAfter: number;
  transitionHash: string;
  transitionedAt: string;
};
// hash: SECURITY_FINDING_TRANSITION_V1

type SecurityIncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

type SecurityIncident = {
  securityIncidentId: string;
  incidentKey: string;
  severity: SecurityIncidentSeverity;
  incidentType:
    | 'CREDENTIAL_COMPROMISE'
    | 'UNAUTHORIZED_ACCESS'
    | 'UNAUTHENTICATED_SIDE_EFFECT'
    | 'DATA_EXPOSURE'
    | 'SECRET_EXPOSURE'
    | 'CONTROL_BYPASS'
    | 'OTHER_SECURITY_EVENT';
  relatedFindingHashes: string[];
  affectedSubjectRefs: string[];
  evidenceRefs: string[];
  incidentHash: string;
  detectedAt: string;
};
// hash: SECURITY_INCIDENT_V1

type SecurityIncidentLifecycleStatus =
  | 'OPEN'
  | 'CONTAINED'
  | 'REMEDIATING'
  | 'MONITORING'
  | 'RESOLVED';

type SecurityIncidentLifecycle = {
  securityIncidentId: string;
  status: SecurityIncidentLifecycleStatus;
  version: number;
  updatedAt: string;
};
// Mutável.

type SecurityIncidentTransition = {
  securityIncidentTransitionId: string;
  securityIncidentId: string;
  incidentHash: string;
  fromStatus?: SecurityIncidentLifecycleStatus;
  toStatus: SecurityIncidentLifecycleStatus;
  reason:
    | 'INCIDENT_OPENED'
    | 'CONTAINMENT_APPLIED'
    | 'REMEDIATION_STARTED'
    | 'ROTATION_REQUESTED'
    | 'ROTATION_CONFIRMED'
    | 'MONITORING_STARTED'
    | 'RESOLUTION_VERIFIED';
  evidenceRefs: string[];
  versionBefore: number;
  versionAfter: number;
  transitionHash: string;
  transitionedAt: string;
};
// hash: SECURITY_INCIDENT_TRANSITION_V1

type SecurityCredentialCompromiseHandoff = {
  securityCredentialCompromiseHandoffId: string;
  handoffKey: string;
  securityIncidentId: string;
  securityIncidentHash: string;
  providerKey: string;
  integrationBindingId?: string;
  integrationBindingHash?: string;
  credentialHandleId?: string;
  credentialHandleHash?: string;
  compromisedCredentialRevisionId?: string;
  requestedAction: 'REVOKE' | 'ROTATE_AND_REVOKE';
  targetAuthority: 'SKILL24';
  handoffHash: string;
  createdAt: string;
};
// hash: SECURITY_CREDENTIAL_COMPROMISE_HANDOFF_V1
// Nunca contém: API key vazada, token, password — só IDs/hashes/
// provider/revision identity.

type RequestSecurityEvidenceKind =
  | 'WEBHOOK_SOURCE_AUTHENTICATION'
  | 'CRON_AUTHENTICATION'
  | 'ADMIN_SESSION_VALIDATION'
  | 'CSRF_VALIDATION'
  | 'ORIGIN_VALIDATION'
  | 'BODY_SIZE_VALIDATION'
  | 'RATE_LIMIT_VALIDATION';

type RequestSecurityEvidence = {
  requestSecurityEvidenceId: string;
  evidenceKey: string;
  endpointKey: string;
  kind: RequestSecurityEvidenceKind;
  result: 'VERIFIED' | 'FAILED' | 'NOT_APPLICABLE';
  verificationMechanism?: string;
  evidenceHash: string;
  observedAt: string;
};
// hash: REQUEST_SECURITY_EVIDENCE_V1 — sem payload/body/secret.

type SecurityIngressSurface =
  | 'PUBLIC_WEBHOOK'
  | 'CRON_ROUTE'
  | 'ADMIN_COOKIE_MUTATION'
  | 'ADMIN_LOGIN'
  | 'PUBLIC_API'
  | 'INTERNAL_SERVICE';

type SecurityGateRequest = {
  securityGateRequestId: string;
  gateRequestKey: string;
  tenantId?: string;
  ingressSurface: SecurityIngressSurface;
  endpointKey: string;
  requiredControls: string[];
  requestEvidenceRefs: string[];
  trustedTenantContextHash?: string;
  requestHash: string;
  requestedAt: string;
};
// hash: SECURITY_GATE_REQUEST_V1

type SecurityGateRunState =
  | 'PREPARED'
  | 'RESOLVING_REQUIREMENTS'
  | 'RESOLVING_CONTROL_EVIDENCE'
  | 'VALIDATING_REQUEST_EVIDENCE'
  | 'DECIDING'
  | 'DECISION_MATERIALIZED'
  | 'COMPLETED';
// Gate não é cancelável depois que uma requisição chegou ao boundary —
// só ALLOW ou DENY.

type SecurityGateDecision = {
  securityGateDecisionId: string;
  gateRequestKey: string;
  gateRequestHash: string;
  tenantId?: string;
  controlDecisionHashes: string[];
  requestEvidenceHashes: string[];
  decision: 'ALLOW' | 'DENY';
  reasonCodes: string[];
  decisionHash: string;
  decidedAt: string;
};
// hash: SECURITY_GATE_DECISION_V1

// PATCH (Ponto M5, reparo transversal pós-revisão Fable, 2026-09-18,
// VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1): este ledger (SecurityRateLimitPolicy/
// SecurityRateLimitWindowState/SecurityRateLimitDecision) é DEFERRED_V2_MECHANISM
// — continua especificado, mas não exige runtime V1. O requisito de
// proteção (public ingress must be subject to bounded abuse/rate
// controls before production exposure) permanece; no V1, um mecanismo
// mais simples de infraestrutura pode satisfazê-lo sem este ledger
// durável completo. Nenhuma outra Skill do corpus referencia estes
// tipos — relaxar o requisito de runtime aqui não quebra contrato
// documentado de nenhuma outra Skill.
type SecurityRateLimitIdentityBasis =
  | 'OPAQUE_NETWORK_SUBJECT'
  | 'ACTOR'
  | 'TENANT'
  | 'ENDPOINT'
  | 'PROVIDER_SOURCE';

type SecurityRateLimitPolicy = {
  rateLimitPolicyId: string;
  policyKey: string;
  policyVersion: string;
  endpointKey: string;
  identityBasis: SecurityRateLimitIdentityBasis[];
  maximumRequests: number;
  windowSeconds: number;
  exceedAction: 'DENY';
  policyHash: string;
};
// hash: SECURITY_RATE_LIMIT_POLICY_V1
// Nada de raw IP persistido — runtime produz opaque subject key.

type SecurityRateLimitWindowState = {
  rateLimitPolicyId: string;
  subjectKey: string;
  windowKey: string;
  requestCount: number;
  version: number;
  updatedAt: string;
};
// Mutável, sem hash integral.

type SecurityRateLimitDecision = {
  securityRateLimitDecisionId: string;
  tenantId?: string;
  rateLimitPolicyHash: string;
  subjectKey: string;
  windowKey: string;
  countBefore: number;
  countAfter: number;
  maximumRequests: number;
  decision: 'ALLOW' | 'DENY';
  decisionHash: string;
  decidedAt: string;
};
// hash: SECURITY_RATE_LIMIT_DECISION_V1
// Counter atômico: lock/CAS → increment → compare limit → decision.

type DataRetentionExecutionRequest = {
  dataRetentionExecutionRequestId: string;
  executionRequestKey: string;
  tenantId?: string;
  retentionPolicyId: string;
  retentionPolicyHash: string;
  dataCategory: SecurityDataCategory;
  cutoffAt: string;
  targetResourceKey: string;
  requestHash: string;
  requestedAt: string;
};
// hash: DATA_RETENTION_EXECUTION_REQUEST_V1
// Cutoff sempre deriva de DataRetentionPolicy + current evaluation
// time — nunca "worker escolhe mais ou menos 30 dias".

type DataDeletionPlan = {
  dataDeletionPlanId: string;
  tenantId?: string;
  retentionExecutionRequestHash: string;
  targetResourceKey: string;
  dataCategory: SecurityDataCategory;
  cutoffAt: string;
  selectionScopeHash: string;
  candidateRecordCount: number;
  planHash: string;
  plannedAt: string;
};
// hash: DATA_DELETION_PLAN_V1
// Não persiste a lista inteira de conteúdo sensível — só scope/
// cutoff/contagem.

type DataRetentionExecutionRunState =
  | 'PREPARED'
  | 'RESOLVING_POLICY'
  | 'PLANNING_DELETION'
  | 'DELETING'
  | 'VERIFYING'
  | 'EVIDENCE_MATERIALIZED'
  | 'COMPLETED'
  | 'PARTIAL';
// Se só parte foi removida: PARTIAL — nunca registra falsamente a
// quantidade planejada como deletada.
```

**Não recebem hash integral** (mutáveis): `SecurityFindingLifecycle`,
`SecurityIncidentLifecycle`, `SecurityGateRun`,
`SecurityRateLimitWindowState`, `DataRetentionExecutionRun`.

### Cadeias operacionais

**Ingress de segurança:**

```text
incoming request
      ↓
request-local evidence
      ↓
rate-limit decision
      ↓
SecurityGateRequest
      ↓
control requirements + environment evidence + request evidence
      ↓
SecurityGateDecision
   ├── DENY → audit → stop
   └── ALLOW → audit → business pipeline
```

Exemplo: pra qualquer webhook com `authentication missing`, o gate
produz `DENY` — o pipeline de negócio não deveria iniciar até o
controle estar implementado e comprovado (estado real de cada webhook
deste projeto vive em `CONTINUIDADE.md`, ver Ponto M6).

**Finding/incident:**

```text
SecurityControlEvidence / runtime event → finding detected
  → SecurityFinding → CONTAINED → REMEDIATING → verified fix → RESOLVED

Se houver comprometimento real:
  Finding → SecurityIncident → containment
    → Skill24 handoff (quando credential) → remediation evidence
    → monitoring → RESOLVED
```

**Retenção:**

```text
DataRetentionPolicy → retention due → DataRetentionExecutionRequest
  → DataDeletionPlan → delete → verify → DataDeletionEvidence → audit
```

Não existe `cron DELETE WHERE created_at < ...` sem policy/audit/
evidence como arquitetura oficial.

### Erros (rodada 2)

**20 `FATAL_ERROR`:**

```text
SECURITY_TENANT_MISMATCH
SECURITY_AUDIT_EVENT_REPLAY_CONFLICT
SECURITY_AUDIT_INTEGRITY_VIOLATION
SECURITY_CONTROL_EVIDENCE_REPLAY_CONFLICT
SECURITY_CONTROL_DECISION_REPLAY_CONFLICT
SECURITY_GATE_REQUEST_REPLAY_CONFLICT
SECURITY_GATE_DECISION_REPLAY_CONFLICT
SECURITY_REQUEST_EVIDENCE_REPLAY_CONFLICT
SECURITY_FINDING_REPLAY_CONFLICT
SECURITY_FINDING_LIFECYCLE_CONFLICT
SECURITY_INCIDENT_REPLAY_CONFLICT
SECURITY_INCIDENT_LIFECYCLE_CONFLICT
SECURITY_CREDENTIAL_COMPROMISE_HANDOFF_CONFLICT
SECURITY_RATE_LIMIT_DECISION_REPLAY_CONFLICT
SECURITY_RATE_LIMIT_COUNTER_INTEGRITY_VIOLATION
SECURITY_RETENTION_EXECUTION_REPLAY_CONFLICT
SECURITY_DELETION_PLAN_REPLAY_CONFLICT
SECURITY_DELETION_EVIDENCE_REPLAY_CONFLICT
SECURITY_SECRET_EXPOSURE_ATTEMPT
SECURITY_UNTRUSTED_CONTROL_BYPASS_ATTEMPT
```

**`RETRYABLE_ERROR`:**

```text
SECURITY_CONTROL_EVIDENCE_LOOKUP_TRANSIENT_ERROR
SECURITY_AUDIT_PERSISTENCE_TRANSIENT_ERROR
SECURITY_GATE_PERSISTENCE_TRANSIENT_ERROR
SECURITY_RATE_LIMIT_STORE_TRANSIENT_ERROR
SECURITY_RETENTION_SELECTION_TRANSIENT_ERROR
SECURITY_DELETION_TRANSIENT_ERROR
SECURITY_DELETION_VERIFICATION_TRANSIENT_ERROR
SECURITY_INCIDENT_PERSISTENCE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

**`BLOCKED`:**

```text
SECURITY_REQUIRED_CONTROL_NOT_CONFIGURED
SECURITY_REQUIRED_CONTROL_UNVERIFIED
SECURITY_REQUIRED_CONTROL_FAILED
SECURITY_REQUIRED_CONTROL_STALE
SECURITY_WEBHOOK_AUTHENTICATION_REQUIRED
SECURITY_CRON_AUTHENTICATION_REQUIRED
SECURITY_CSRF_VALIDATION_REQUIRED
SECURITY_RATE_LIMIT_EXCEEDED
SECURITY_RETENTION_POLICY_NOT_CONFIGURED
SECURITY_CREDENTIAL_REMEDIATION_REQUIRED
SECURITY_PUBLIC_DATA_EXPOSURE_NOT_APPROVED
SECURITY_CRITICAL_AUDIT_UNAVAILABLE
```

**Domain results:**

```text
SECURITY_GATE_ALLOWED
SECURITY_GATE_DENIED
SECURITY_AUDIT_EVENT_ALREADY_EXISTS
SECURITY_FINDING_ALREADY_OPEN
SECURITY_FINDING_CONTAINED
SECURITY_FINDING_RESOLVED
SECURITY_INCIDENT_OPENED
SECURITY_INCIDENT_CONTAINED
SECURITY_INCIDENT_RESOLVED
SECURITY_CREDENTIAL_HANDOFF_CREATED
SECURITY_RATE_LIMIT_ALLOWED
SECURITY_RATE_LIMIT_DENIED
SECURITY_RETENTION_NOT_DUE
SECURITY_RETENTION_EXECUTION_PARTIAL
SECURITY_RETENTION_EXECUTION_COMPLETED
```

### Observabilidade

- **Gates**: `tenantId?`, `endpointKey`, `ingressSurface`,
  `requiredControlCount`, `verifiedControlCount`,
  `failedControlCount`, `staleControlCount`, `gateDecision`,
  `reasonCodes`, `durationMs`, `errorCode?`.
- **Findings/incidents**: `findingKey`, `severity`, `findingStatus`,
  `incidentType`, `incidentSeverity`, `incidentStatus`,
  `containmentApplied`, `remediationStarted`, `resolutionVerified`,
  `credentialHandoffCreated`.
- **Retention**: `dataCategory`, `retentionPolicyKey`,
  `targetResourceKey`, `candidateRecordCount`,
  `actualDeletedRecordCount`, `deletionOutcome`, `durationMs`,
  `errorCode?`. **Nunca conteúdo deletado.**
- **Rate limit**: `endpointKey`, `policyKey`, `decision`,
  `windowSeconds`, `maximumRequests`, `rateLimitExceeded`. **Nunca**
  raw IP/telefone como metric label.
- **Métricas**: `security_gate_total`, `security_gate_denied_total`,
  `security_required_control_failed_total`,
  `security_audit_event_total`,
  `security_audit_persistence_failure_total`,
  `security_finding_open_total`, `security_incident_open_total`,
  `security_credential_compromise_handoff_total`,
  `security_rate_limit_denied_total`,
  `security_retention_execution_total`,
  `security_retention_partial_total`,
  `security_secret_exposure_block_total`,
  `security_control_bypass_block_total`.
- **Audit events**: security gate allowed/denied; required control
  missing/stale/failed; security finding created/contained/
  remediation started/resolved; risk accepted; security incident
  opened/contained/resolved; credential compromise handoff created;
  rate limit exceeded; retention execution started/partial; retention
  deletion verified; secret exposure attempt blocked; control bypass
  attempt blocked.

### "Nunca logar" — taxonomia final aplicada

```text
SECRET + AUTH_CREDENTIAL       → PROHIBITED
SESSION_MATERIAL               → PROHIBITED
MESSAGE_CONTENT                → METADATA_ONLY por default
CANONICAL_FREE_TEXT            → consumer-specific + Skill25 policy → mais restritiva
PROVIDER_RAW_PAYLOAD           → PROHIBITED ou REDACTED_ONLY
PERSONAL_IDENTIFIER            → METADATA_ONLY / REDACTED_ONLY conforme policy
```

### 40 testes críticos

**1–5 · Findings / incidents**
1. Finding nasce `OPEN`.
2. Containment não equivale a `RESOLVED`.
3. Finding técnico só resolve com evidence apropriada.
4. Incident pode existir ligado a finding sem alterar finding
   automaticamente.
5. Incident `RESOLVED` não resolve finding automaticamente.

**6–10 · Audit trail**
6. `SecurityAuditEvent` replay idempotente reutiliza evento.
7. Mesma `eventKey` com conteúdo divergente → fatal.
8. Actor legacy preserva `SHARED_CREDENTIAL` no audit.
9. Audit event não contém message body/secret/raw payload.
10. Falha de audit obrigatório bloqueia side effect quando requirement
    exige.

**11–15 · Security gate**
11. Todos os required controls `VERIFIED` → `ALLOW`.
12. Um required control `FAILED` → `DENY`.
13. Required control `UNVERIFIED` → `DENY`.
14. Evidence vencida → `DENY` quando freshness requerida.
15. Retry do mesmo `gateRequestKey` reutiliza decisão.

**16–20 · Webhook / cron / CSRF**
16. Instagram webhook com HMAC válido satisfaz source authentication.
17. Webhook Z-API sem auth evidence é negado.
18. `CRON` secret não comprovado em production nega rota protegida.
19. Admin cookie mutation com sessão válida mas sem CSRF é negada.
20. Rate limit aprovado não substitui webhook authentication.

**21–25 · Rate limiting**
21. Counter increment é atômico.
22. Request abaixo do limite é `ALLOW`.
23. Request acima do limite é `DENY`.
24. Duas requisições concorrentes não ultrapassam limite por race.
25. Raw IP nunca entra em artifact/audit como subject key obrigatório.

**26–30 · Retention/deletion**
26. `DELETE_AFTER` exige `maximumRetentionDays`.
27. Retenção não configurada não vira `FOREVER`.
28. Deletion plan congela cutoff e scope.
29. Crash após delete reaproveita mesmo execution request/plan.
30. Execução parcial nunca produz evidence de deleção completa.

**31–35 · Credential compromise / Skill 24**
31. Credential compromise gera handoff sem incluir secret.
32. Skill 25 não executa rotation diretamente.
33. Skill 24 rotation/revocation evidence pode avançar incident
    lifecycle.
34. Rotação não confirmada impede resolver incident de secret
    vazado.
35. Compromised credential sem binding resolvido permanece incident
    aberto.

**36–40 · Data exposure / boundaries**
36. `product_groups` anon exposure não é considerada pública por
    acidente.
37. RLS enabled sem policy server-only não é classificado como RLS
    disabled.
38. `service_role` client exposure é security violation.
39. Lista never-log de Skill específica prevalece quando mais
    restritiva.
40. Skill 25 não assume ownership de auth, quota, integration
    secrets ou business approval.

### Hashes novos da rodada 2 (11)

```text
SECURITY_FINDING_TRANSITION_V1
SECURITY_INCIDENT_V1
SECURITY_INCIDENT_TRANSITION_V1
SECURITY_CREDENTIAL_COMPROMISE_HANDOFF_V1
REQUEST_SECURITY_EVIDENCE_V1
SECURITY_GATE_REQUEST_V1
SECURITY_GATE_DECISION_V1
SECURITY_RATE_LIMIT_POLICY_V1
SECURITY_RATE_LIMIT_DECISION_V1
DATA_RETENTION_EXECUTION_REQUEST_V1
DATA_DELETION_PLAN_V1
```

ChatGPT deliberadamente não fixou total global — instruiu contar via
grep (hashes rodada 1 + 11 novos) e registrar o total real.

### Estado dos findings reais ao fim da SPEC

Mesmo com a Skill 25 aprovada, **nenhum finding fecha
automaticamente** — `CONTAINED`/`RESOLVED`/`ACCEPTED_RISK` sempre
exigem evidência real, nunca "a spec existe agora".

> **PATCH (Ponto M6, reparo transversal pós-revisão Fable, 2026-09-18)**:
> o estado atual de cada um dos 5 achados originais que validaram este
> desenho (webhook, RLS de `product_groups`, `CRON_SECRET`, rotação de
> secret de provider, retenção) é rastreado em `CONTINUIDADE.md`,
> seção "Security findings rastreados" — não nesta SPEC. Esse estado
> pode mudar (abrir, ser contido, ser resolvido) sem exigir revisão
> deste documento; o inverso também vale — nenhuma dessas mudanças
> altera os contratos normativos definidos aqui.

### Estado real de implementação

| Item | Estado |
|---|---|
| Skill 25 runtime | `NOT_IMPLEMENTED` |
| `SecurityAuditEvent` persistence | `NOT_IMPLEMENTED` |
| `SecurityGate` | `NOT_IMPLEMENTED` |
| Rate limiting | `NOT_IMPLEMENTED` |
| CSRF enforcement | `NOT_IMPLEMENTED` |
| Retention policies | `NOT_CONFIGURED` |
| Deletion runner | `NOT_IMPLEMENTED` |
| Incident system | `NOT_IMPLEMENTED` |
| Finding lifecycle runtime | `NOT_IMPLEMENTED` |
| CSP | `NOT_CONFIGURED` |
| Explicit CORS policy | `NOT_CONFIGURED` |

> **PATCH (Ponto M6, reparo transversal pós-revisão Fable, 2026-09-18)**:
> esta tabela cobre só o runtime da própria Skill 25 (mecanismos como
> `SecurityGate`/audit persistence/rate limiting — todos ainda
> `NOT_IMPLEMENTED`). O estado de implementação de achados operacionais
> específicos de outros componentes do projeto (ex.: autenticação do
> webhook, aplicação de secret de cron em produção) vive em
> `CONTINUIDADE.md`, não nesta tabela.

### Fechamentos finais (ChatGPT, rodada 2)

Um controle obrigatório só libera uma operação quando existe evidence
apropriada e suficientemente fresca; ausência de evidence nunca é
convertida em sucesso por ausência de erro. Security audit,
operational logging, finding e incident são quatro conceitos
distintos: logs ajudam a operar; audit prova decisões; findings
registram condições de risco; incidents coordenam eventos de
segurança reais. Ingress sensível é fail-closed — webhook sem
autenticação, cron sem autenticação comprovada ou mutação por cookie
sem proteção CSRF não avança pro pipeline de negócio. Retenção passa
a ser deliberada e auditável — ausência de policy nunca equivale a
retenção infinita, e deleção produz evidence sem copiar pro audit
trail o conteúdo que deveria desaparecer. Skill 25 identifica
credential compromise e exige mitigação, mas secrets e seus
lifecycles continuam pertencendo à Skill 24. As regras "nunca logar"
das Skills anteriores permanecem válidas; Skill 25 cria a taxonomia
comum e nunca enfraquece uma restrição mais forte já definida pelo
consumidor. A Skill 25 não promete segurança perfeita nem audit trail
tamper-proof — ela cria enforcement fail-closed, evidence verificável,
minimização de dados e fronteiras claras de responsabilidade.

**Aprovação condicional do ChatGPT**: *"Com essa rodada integrada, a
Skill25 fica arquiteturalmente fechada. A auto-verificação final deve
confirmar: 0 tipos duplicados + 20 FATAL_ERROR + 11 hashes novos desta
rodada + 40 testes e validar os três patches iniciais (SecurityFinding
imutável, freshness dos controles e invariantes de retention). Se isso
bater, aí sim eu carimbo oficialmente Skill25 APROVADA EM
ESPECIFICAÇÃO — 25/25, fechando as 25 Skills."*
