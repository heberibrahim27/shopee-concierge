# Skill 16 — Automação de Comentários/DM

> **APROVADA EM ESPECIFICAÇÃO — 16/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 (ChatGPT ↔ Claude Code). Diferente
> das Skills 09-14, esta **não é greenfield**: já existe um webhook real
> em produção (`src/app/api/webhook/instagram/route.ts`) respondendo
> "QUERO" por DM, mas com keyword matching simplificado, link sem
> tracking hardcoded, zero correlação com o vídeo/produto que motivou a
> mensagem, e dedupe só em memória — hoje limitado a contas testadoras
> por bloqueio real de Tech Provider/CNPJ (mesmo método das Skills
> 04-15).

## Garantia central (rascunho inicial)

A Skill 16 detecta a intenção de conversão declarada pela Skill 07
(`CreativeCtaIntent`, mecanismo `COMMENT_KEYWORD`) num evento real de
comentário/DM do Instagram, e entrega ao usuário o
`AffiliateLinkArtifact` (Skill 15) correto — o link rastreável exato do
vídeo/produto que motivou o comentário. Ela não decide a keyword nem o
mecanismo de CTA (Skill 07), não gera o link (Skill 15), e não publica o
vídeo (Skill 17).

## Auditoria real do repositório (2026-09-18)

Confirmado via agente de auditoria: **NÃO é greenfield** — já existe um
webhook real de automação QUERO em produção, mas com lacunas
arquiteturais sérias que a Skill 16 precisa resolver.

- **Webhook real:** `src/app/api/webhook/instagram/route.ts` (114
  linhas). Valida `X-Hub-Signature-256` via HMAC-SHA256 (`timingSafeEqual`).
  Escuta `entry[].messaging[]` — é o webhook de **DM** do Instagram
  (alguém responde "QUERO" a um Story vira mensagem direta), não um
  webhook de comentário público. Match hoje é
  `text.toLowerCase().includes("quero")` — substring simples, **não**
  segue o contrato de normalização NFKC que a Skill 07 já definiu em
  `CreativeCtaIntent.keywordNormalized`. Em match, chama
  `sendInstagramMessage()` com `REPLY_TEXT` **hardcoded** contendo
  `https://descontochegando.com.br/hoje` — um link **sem tracking**, não
  vindo de nenhum `AffiliateLinkArtifact`. Sempre responde `200` (mesmo
  em falha de envio), por semântica de retry da Meta.
- **Bloqueio real de produção confirmado (2026-09-17,
  `CONTINUIDADE.md:19-40`):** pra avançar além de contas testadoras,
  qualquer permissão de Instagram/mensagens em App Review dispara
  exigência de virar **"Tech Provider"** — a Meta documenta
  explicitamente como **irreversível**
  ("This decision cannot be reversed after you've been identified as a
  Tech Provider"), exigindo verificação de empresa/CNPJ antes até do App
  Review. **Decisão registrada do usuário: não prosseguir agora** — dono
  não tem CNPJ hoje. Nada foi clicado/comprometido ainda ("100%
  reversível ainda").
- **ReplyRush é só ideia, sem código real.** Documentado
  (`CONTINUIDADE.md:42-61`) como ferramenta externa alternativa (já
  passou pela revisão Tech Provider da própria Meta, 1500 DMs grátis/mês)
  — próximo passo é "guiar o usuário a criar conta", nunca integração de
  código.
- **Zero correlação hoje entre o comentário/DM e o vídeo/produto que o
  motivou.** `social_posts` (tabela real sem migration versionada) grava
  `deal_candidate_id`/`post_type`/`media_id`/`caption`/`status`/
  `posted_at` via `publish-product/route.ts` — mas o webhook nunca
  consulta essa tabela; o evento de mensagem só carrega `sender.id`/
  `recipient.id`/`message.mid`/`text`. A resposta hoje é genérica (mesmo
  link `/hoje` pra todo mundo), **não** sabe qual Story/produto/vídeo
  gerou o "QUERO".
- **Proteção contra duplicidade só parcial.** `src/lib/dedupe.ts` é um
  `Map` em memória (TTL 10min, reaproveitado do webhook Z-API/WhatsApp)
  que só evita **reprocessar o mesmo `mid`** (retry da Meta) — não evita
  responder duas vezes ao mesmo comentarista em mensagens "QUERO"
  diferentes, não persiste (reseta em cold start/rotação de instância
  serverless), e não tem lógica de rate-limit/spam nenhuma.
- **`CreativeCtaIntent`** (Skill 07, `SPEC.md:293-303`) já nomeia
  explicitamente a Skill 16 como consumidora fazendo "matching
  sofisticado" (acentos, pontuação, "eu quero") sobre
  `keywordNormalized`:
  ```typescript
  type CreativeCtaIntent =
    | {
        mechanism: "COMMENT_KEYWORD";
        keyword: string;           // forma exibida, preservada
        keywordNormalized: string; // trim -> Unicode NFKC -> lowercase Unicode
        purpose: "AFFILIATE_LINK_DELIVERY";
      }
    | { mechanism: "DIRECT_LINK"; purpose: "AFFILIATE_LINK_VISIT" }
    | { mechanism: "NONE" };
  ```
- **`AffiliateLinkArtifact`** (Skill 15) já existe com todos os campos
  de lineage (`affiliateLinkArtifactId`, `finalizedVideoRenditionId`/
  `hash`, `promotedProductId`, `providerAffiliateUrl`, `artifactHash`
  etc.) — a Skill 16 precisa resolver, a partir do evento de
  comentário/DM, exatamente qual artifact entregar.
- **Skill 17 (Publicador Multicanal) ainda não existe** como SPEC.md.

## Decisões fechadas no debate inicial (2026-09-18)

**Garantia central (revisada):** A Skill 16 recebe uma interação social
autenticada, normaliza e classifica o conteúdo segundo o
`CreativeCtaIntent` exato, resolve o contexto de publicação **somente
quando existe evidência determinística suficiente**, seleciona o
`AffiliateLinkArtifact` exato associado àquela publicação, e executa no
máximo uma resposta lógica autorizada. Ela nunca adivinha produto/
publicação, nunca gera link, nunca publica conteúdo, e nunca presume
capacidade de produção que a integração não possui.

```text
Provider webhook
→ InboundInteraction
→ durable event dedupe
→ CtaMatcher
→ PublicationContextResolver
→ exact SocialPublicationBinding?
→ exact AffiliateLinkArtifact?
→ ResponseIntent
→ durable business dedupe
→ OutboundMessagingProvider
```

**A descoberta principal desta auditoria** (registrada explicitamente
pra Fable/Astra):

> Um binding perfeito na Skill 17 não resolve correlação se o evento
> inbound não contiver uma chave que possa chegar até esse binding.
> Correlação exige evidência nos dois lados da relação.

Isso evita a suposição futura de "tem `media_id` no banco, então
conseguimos descobrir de qual Story veio qualquer DM" — não
necessariamente. A Skill 17 (futura) precisa fornecer um
`SocialPublicationBinding` (media/story/publication ID ↔
`finalizedVideoRenditionId` ↔ `AffiliateLinkArtifact` ↔
`CreativeCtaIntent`), **mas** o evento inbound também precisa trazer uma
chave correlacionável — sem isso, resultado é `UNRESOLVED`, **nunca**
"último post"/"produto mais recente"/qualquer heurística.

**Link só sai após resolução exata.** Quando `RESOLVED_EXACT`, a
Skill 16 abre exatamente `SocialPublicationBinding` →
`AffiliateLinkArtifactId`+hash, valida mesmo tenant/target/rendition/
lineage, usa `AffiliateLinkArtifact.providerAffiliateUrl`. Nunca
`offer_link`, nunca o `/hoje` hardcoded, nunca "último affiliate link do
produto". Sem resolução exata, uma policy futura decide entre
`NO_RESPONSE` ou `GENERIC_NON_AFFILIATE_RESPONSE` —
**nunca** `GENERIC_AFFILIATE_RESPONSE` (misturaria link e produto sem
lineage). O `/hoje` atual pode sobreviver temporariamente só como
`GENERIC_NON_AFFILIATE_RESPONSE`, explicitamente marcado como fallback,
nunca como resposta específica ao produto.

**Migração do `includes("quero")` sem quebrar testadoras.** A Skill 16
consome a mesma normalização congelada pela Skill 07
(`CreativeCtaIntent.keywordNormalized`) via `CtaMatchingPolicy` com
`strategy` (`LEGACY_SUBSTRING`/`NORMALIZED_TOKEN`/`NORMALIZED_PHRASE`) e
`migrationMode` (`ACTIVE`/`SHADOW_COMPARE`). V1 é token/phrase-aware, não
substring puro — `includes("quero")` gera falso positivo em
"querosene". Migração: `SHADOW_COMPARE` roda o legado
(`includes`) determinando a resposta real enquanto o novo matcher
normalizado só registra divergência; depois que fixtures/testes
mostrarem paridade aceitável, `NORMALIZED_TOKEN` vira `ACTIVE`. O SPEC
não exige alterar hoje o webhook existente.

**Três camadas de dedupe distintas — o `Map` de 10min vira só a
primeira:**

```text
1. Event dedupe (transport)     — InboundInteraction UNIQUE(tenantId,
                                    providerKey, providerMessageId)
                                    substitui o Map em memória

2. Business-response dedupe     — ResponseGuard, chave lógica
                                    tenant+provider+actor+publication+
                                    CTA+responseAction; evita reenviar o
                                    mesmo link pro mesmo QUERO repetido,
                                    mas permite resposta nova se for
                                    publicação diferente

3. External-send idempotency    — ResponseIntent checkpoint
                                    (PREPARED→SUBMITTING→SENT), mesma
                                    disciplina das Skills 11/15;
                                    SUBMITTING ambíguo →
                                    EXTERNAL_STATE_UNKNOWN/BLOCKED,
                                    nunca reenvio cego (evita mandar
                                    duas DMs por timeout)
```

**Capability-aware por integração, não um booleano `instagramEnabled`.**

```typescript
type MessagingCapabilityStatus =
  | 'VERIFIED'
  | 'TESTER_ONLY'
  | 'UNVERIFIED'
  | 'UNSUPPORTED'
  | 'NOT_IMPLEMENTED'
  | 'BLOCKED_BY_ACCOUNT_REQUIREMENT';

type MessagingAutomationCapabilitySnapshot = {
  capabilitySnapshotId: string;

  tenantId: string;

  providerKey: string;
  providerAccountId: string;

  capabilityVersion: string;

  inboundDirectMessage: MessagingCapabilityStatus;
  inboundStoryReply: MessagingCapabilityStatus;
  inboundPublicComment: MessagingCapabilityStatus;

  outboundDirectMessage: MessagingCapabilityStatus;
  outboundCommentReply: MessagingCapabilityStatus;

  publicationContextReference: MessagingCapabilityStatus;

  publicProductionAccess: MessagingCapabilityStatus;

  evidenceRefs: string[];

  capabilitySnapshotHash: string;

  observedAt: string;
};
```

Fotografia auditada hoje: `inboundDirectMessage`/`outboundDirectMessage
= TESTER_ONLY`; `inboundPublicComment`/`outboundCommentReply =
NOT_IMPLEMENTED`; `publicProductionAccess =
BLOCKED_BY_ACCOUNT_REQUIREMENT`; `publicationContextReference =
UNVERIFIED` no payload atual (não confirmamos se o Story Reply real traz
referência de mídia — fica pra auditoria de payload bruto na fase de
runtime). ReplyRush: adapter `NOT_IMPLEMENTED`, capabilities
`UNVERIFIED`.

Hash: `MESSAGING_AUTOMATION_CAPABILITY_V1:sha256:<hex>` sobre
`providerKey`, `providerAccountId`, `capabilityVersion`, todos os
campos `MessagingCapabilityStatus`, `evidenceRefs`. Sem
`capabilitySnapshotId`/`observedAt`. **Este tipo não é owned por
nenhuma Skill anterior já aprovada** — a futura Skill 24 (Gestor de
Integrações) poderá vir a possuir formalmente o conceito de
integração/capacidade por provider, mas ainda não foi especificada;
até lá, `MessagingAutomationCapabilitySnapshot` é definido aqui, na
Skill 16, como o consumidor real.

> Skill 16 nunca tenta contornar requisitos de autorização da
> plataforma. Um provider só pode executar capacidades que o snapshot
> vigente declare como autorizadas para aquele tenant/ambiente.

O bloqueio real de Tech Provider/CNPJ vira uma capacidade concreta
bloqueada (`DIRECT_META`+`PUBLIC_PRODUCTION`) — **não** torna a Skill 16
inteira `BLOCKED`. Isso permite contas testadoras, fixtures, dry-run,
simulação, e um futuro provider externo autorizado (ou Meta produção, se
a decisão empresarial mudar), sem mentir sobre o estado atual.

**Comentário e DM são tipos de evento distintos**, não um "message"
genérico: `SocialInteractionType`
(`DIRECT_MESSAGE`/`STORY_REPLY`/`PUBLIC_COMMENT`) e
`SocialResponseAction` (`SEND_DIRECT_MESSAGE`/`REPLY_PUBLIC_COMMENT`). O
adapter transforma o payload específico do provider nesses contratos
neutros — hoje: Instagram adapter cobre `DIRECT_MESSAGE`/possivelmente
`STORY_REPLY` quando comprovável; `PUBLIC_COMMENT` ainda
`NOT_IMPLEMENTED`. Assim "Comentários/DM" no título continua correto sem
fingir que comentários já funcionam.

**Divisão de responsabilidades congelada:**

```text
Skill07 → define CreativeCtaIntent + keywordNormalized
Skill15 → fornece AffiliateLinkArtifact exato
Skill16 → recebe interação, faz match CTA, resolve publicação,
          decide resposta operacional, dedupe, envia resposta
Skill17 (futura) → publica, materializa SocialPublicationBinding
Skills18/19 → métricas/performance
```

Skill 16 nunca: escolhe produto, gera affiliate link, altera CTA, cria
publicação, ou atribui venda.

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


Ajuste no fluxo: pra resposta afiliada específica, o `CreativeCtaMatch`
precisa estar ligado ao `CreativeCtaIntent` da **publicação resolvida**
— matching de "QUERO" sozinho não identifica produto. A condição de
envio específico é sempre:

```text
PublicationContextResolution = RESOLVED_EXACT
+ CreativeCtaMatch = MATCHED contra o CreativeCtaIntent daquele binding
+ AffiliateLinkArtifact exato
+ capability autorizada
+ ResponsePolicy
```

### `InboundInteraction` — evento neutro pós-validação do webhook

```typescript
type SocialInteractionType = 'DIRECT_MESSAGE' | 'STORY_REPLY' | 'PUBLIC_COMMENT';

type InboundInteraction = {
  inboundInteractionId: string;

  tenantId: string;

  providerKey: string;
  providerAccountId: string;

  // ID estável fornecido pelo provider para a interação. Meta DM atual: mid.
  providerInteractionId: string;

  providerEventId?: string;

  actorProviderId: string;
  recipientProviderId: string;

  interactionType: SocialInteractionType;

  textRaw: string;
  textNormalized: string;

  publicationContext: {
    providerPublicationId?: string;
    providerMediaId?: string;
    providerStoryId?: string;

    correlationEvidence:
      | 'PROVIDER_PUBLICATION_REFERENCE'
      | 'PROVIDER_MEDIA_REFERENCE'
      | 'PROVIDER_STORY_REFERENCE'
      | 'CTA_CORRELATION_TOKEN'
      | 'NONE';
  };

  trust: {
    source: 'PROVIDER_VERIFIED' | 'TEST_FIXTURE';

    verificationEvidenceRef?: string;

    providerPayloadHash?: string;
  };

  interactionHash: string;

  receivedAt: string;
};
```

Regra de produção: side effect externo real exige `trust.source =
PROVIDER_VERIFIED`; `TEST_FIXTURE` percorre o pipeline em dry-run/testes,
mas nunca envia DM real.

Hash: `INBOUND_INTERACTION_V1:sha256:<hex>` sobre `providerKey`,
`providerAccountId`, `providerInteractionId`, `providerEventId?`,
`actorProviderId`, `recipientProviderId`, `interactionType`,
`textNormalized`, `publicationContext` normalizado, `trust.source`. Sem
`inboundInteractionId`/`receivedAt`. `providerPayloadHash` é evidência
de transporte — não entra no hash semântico (envelope de retry pode
variar sem mudar a interação lógica).

**Dedupe primário:** `UNIQUE` lógico `(tenantId, providerKey,
providerAccountId, providerInteractionId)`. Meta entregar o mesmo `mid`
dez vezes → um único `InboundInteraction`. Mesmo ID com conteúdo
semanticamente incompatível → `SOCIAL_INBOUND_INTERACTION_REPLAY_CONFLICT`
(nunca sobrescrever silenciosamente).

### `CtaMatchingPolicy` — migração formalizada

```typescript
type CtaMatcherStrategy = 'LEGACY_SUBSTRING' | 'NORMALIZED_TOKEN' | 'NORMALIZED_PHRASE';
type CtaMatcherMigrationMode = 'SHADOW_COMPARE' | 'ACTIVE';

type CtaMatchingPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  normalizerKey: string;
  normalizerVersion: string;

  canonicalStrategy: 'NORMALIZED_TOKEN' | 'NORMALIZED_PHRASE';

  migrationMode: CtaMatcherMigrationMode;

  shadowLegacyStrategy?: 'LEGACY_SUBSTRING';

  createdAt: string;
};
```

Hash: `CTA_MATCHING_POLICY_V1:sha256:<hex>`. Nenhum algoritmo de
matching é escolhido dinamicamente por LLM.

### `CreativeCtaMatch` — avalia interação contra o `CreativeCtaIntent` exato

```typescript
type CreativeCtaMatch = {
  creativeCtaMatchId: string;

  tenantId: string;

  inboundInteractionId: string;
  inboundInteractionHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3 — id+hash do CreativeDirectionResult exato + creativeCtaIntentHash (CREATIVE_CTA_INTENT_V1)

  ctaMatchingPolicyId: string;
  ctaMatchingPolicyVersion: string;
  ctaMatchingPolicySnapshotHash: string;

  candidateNormalized: string;
  expectedKeywordNormalized: string;

  canonicalEvaluation: {
    strategy: 'NORMALIZED_TOKEN' | 'NORMALIZED_PHRASE';
    matched: boolean;
  };

  shadowEvaluation?: {
    strategy: 'LEGACY_SUBSTRING';
    matched: boolean;
  };

  decisionSource: 'CANONICAL' | 'LEGACY_MIGRATION';

  matched: boolean;

  divergenceObserved: boolean;

  matchHash: string;

  createdAt: string;
};
```

Durante `SHADOW_COMPARE` podemos registrar `legacy=true`/`canonical=false`
sem esconder a divergência. Migrado pra `ACTIVE` → `decisionSource =
CANONICAL`.

Hash: `CREATIVE_CTA_MATCH_V1:sha256:<hex>` sobre `inboundInteractionHash`,
`creativeCtaIntentRef.creativeCtaIntentHash`, `matchingPolicySnapshotHash`,
`candidateNormalized`, `expectedKeywordNormalized`,
`canonicalEvaluation`, `shadowEvaluation?`, `decisionSource`, `matched`,
`divergenceObserved`. Sem IDs operacionais/timestamp.

**Match não é correlação:** mesmo `CreativeCtaMatch.matched = true` não
significa "sei qual produto enviar" — ainda exige
`PublicationContextResolution.status = RESOLVED_EXACT` pra resposta
afiliada específica.

### `SocialPublicationBindingRef` — projeção mínima que a Skill 16 exige

A Skill 16 não vira dona do binding; a Skill 17 futura será. Aqui só a
projeção mínima:

```typescript
type SocialPublicationBindingRef = {
  socialPublicationBindingId: string;
  socialPublicationBindingHash: string;

  tenantId: string;

  providerKey: string;
  publicationTargetKey: string;

  providerAccountId: string;

  providerPublicationId?: string;
  providerMediaId?: string;
  providerStoryId?: string;

  publicationInstanceKey?: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3

  promotedProductId: string;

  bindingRefHash: string;
};
```

Hash: `SOCIAL_PUBLICATION_BINDING_REF_V1:sha256:<hex>` sobre a projeção
inteira, exceto `bindingRefHash`. Quando a Skill 17 nascer, precisa
produzir um binding capaz de satisfazer esse contrato.

### `SocialPublicationContextResolution`

```typescript
type PublicationContextResolutionStatus =
  | 'RESOLVED_EXACT'
  | 'UNRESOLVED_MISSING_CONTEXT'
  | 'UNRESOLVED_NO_BINDING'
  | 'AMBIGUOUS';

type PublicationCorrelationEvidence = {
  evidenceType:
    | 'PROVIDER_PUBLICATION_REFERENCE'
    | 'PROVIDER_MEDIA_REFERENCE'
    | 'PROVIDER_STORY_REFERENCE'
    | 'CTA_CORRELATION_TOKEN';

  providerValue: string;
};

type SocialPublicationContextResolution = {
  resolutionId: string;

  tenantId: string;

  inboundInteractionId: string;
  inboundInteractionHash: string;

  providerKey: string;
  providerAccountId: string;

  evidence: PublicationCorrelationEvidence[];

  resolutionPolicyKey: string;
  resolutionPolicyVersion: string;
  resolutionPolicySnapshotHash: string;

  status: PublicationContextResolutionStatus;

  bindingRef?: SocialPublicationBindingRef;

  candidateCount: number;

  resolutionHash: string;

  createdAt: string;
};
```

Invariantes: `RESOLVED_EXACT` exige `bindingRef` obrigatório,
`candidateCount = 1`, evidência explícita suficiente. `AMBIGUOUS` exige
`candidateCount > 1`, `bindingRef` ausente. `UNRESOLVED_*` exige
`bindingRef` ausente.

Hash: `SOCIAL_PUBLICATION_CONTEXT_RESOLUTION_V1:sha256:<hex>`.

**Zero heurística de "último post" — invariante formal:**
`SocialPublicationContextResolution` **nunca** usa como evidência:
latest publication, most recent product, latest `AffiliateLinkArtifact`,
same user interacted recently, same keyword, same category. Esses dados
podem servir futuramente pra análise, nunca pra `RESOLVED_EXACT`.

### `ResponsePolicy`

```typescript
type UnresolvedContextAction = 'NO_RESPONSE' | 'GENERIC_NON_AFFILIATE_RESPONSE';
type SocialResponseAction = 'SEND_DIRECT_MESSAGE' | 'REPLY_PUBLIC_COMMENT';

type ResponsePolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  providerKey: string;

  allowedInteractionToAction: Array<{
    interactionType: SocialInteractionType;
    responseAction: SocialResponseAction;
  }>;

  specificAffiliateResponse: {
    requireExactPublicationResolution: true;
    requireCreativeCtaMatch: true;
    requireAffiliateLinkArtifact: true;

    templateKey: string;
    templateVersion: string;
    templateHash: string;
  };

  unresolvedContext: {
    action: UnresolvedContextAction;

    genericTemplateKey?: string;
    genericTemplateVersion?: string;
    genericTemplateHash?: string;

    affiliateLinkAllowed: false;
  };

  businessDedupe: {
    scope: 'ACTOR_PUBLICATION_CTA_ACTION';

    // PATCH (Ponto S16, reparo transversal pós-revisão Fable,
    // 2026-09-18): suppressionWindowMs?: number removido — opcional
    // sem mode carregava duas semânticas ambíguas (achado S16 do
    // Fable). Substituído por ResponseSuppressionPolicy (discriminada,
    // obrigatória — ver "ResponseGuard" abaixo), que este campo agora
    // referencia diretamente.
    suppressionPolicy: ResponseSuppressionPolicy;
  };

  maxLogicalResponsesPerInteraction: 1;

  createdAt: string;
};
```

Nenhum valor concreto de cooldown precisa ser inventado no SPEC — a
policy real, quando configurada, traz o valor. Hash:
`SOCIAL_RESPONSE_POLICY_V1:sha256:<hex>`.

**Template não é copy criada pela Skill 16:**

```typescript
type SocialResponseTemplateRef = {
  templateKey: string;
  templateVersion: string;
  templateHash: string;

  allowedVariables: Array<'AFFILIATE_URL' | 'PRODUCT_NAME'>;
};
```

A Skill 16 só faz render determinístico de template congelado — nunca
pede a um LLM "escreva uma resposta legal" na V1. Se `PRODUCT_NAME` não
estiver em fonte upstream autorizada, não pode ser inventado.

### `ResponseIntentDisposition` — três classes de decisão sem ambiguidade

```typescript
type ResponseIntentDisposition =
  | 'SEND_SPECIFIC_AFFILIATE_RESPONSE'
  | 'SEND_GENERIC_NON_AFFILIATE_RESPONSE'
  | 'NO_RESPONSE';
```

### `ResponseIntent`

```typescript
type ResponseIntent = {
  responseIntentId: string;

  tenantId: string;
  runId: string;

  inboundInteractionId: string;
  inboundInteractionHash: string;

  providerKey: string;
  providerAccountId: string;

  actorProviderId: string;

  interactionType: SocialInteractionType;

  responsePolicyId: string;
  responsePolicyVersion: string;
  responsePolicySnapshotHash: string;

  publicationResolutionId: string;
  publicationResolutionHash: string;

  creativeCtaMatchId?: string;
  creativeCtaMatchHash?: string;

  disposition: ResponseIntentDisposition;

  responseAction?: SocialResponseAction;

  binding?: {
    socialPublicationBindingId: string;
    socialPublicationBindingHash: string;
  };

  affiliateLink?: {
    affiliateLinkArtifactId: string;
    affiliateLinkArtifactHash: string;
    providerAffiliateUrl: string;
  };

  renderedContent?: {
    templateKey: string;
    templateVersion: string;
    templateHash: string;

    text: string;
    contentHash: string;
  };

  businessResponseKey?: string;

  noResponseReason?: string;

  intentHash: string;

  createdAt: string;
};
```

Hash: `SOCIAL_RESPONSE_INTENT_V1:sha256:<hex>` sobre
`inboundInteractionHash`, `responsePolicySnapshotHash`,
`publicationResolutionHash`, `creativeCtaMatchHash?`, `disposition`,
`responseAction?`, binding hash?, `affiliateLinkArtifactHash?`, rendered
content hash?, `businessResponseKey?`, `noResponseReason?`. Sem
`responseIntentId`/`runId`/`createdAt`.

**Invariantes por disposição:**

```text
SEND_SPECIFIC_AFFILIATE_RESPONSE exige:
  publicationResolution = RESOLVED_EXACT
  CreativeCtaMatch.matched = true
  binding presente
  AffiliateLinkArtifact presente e exatamente o artifact daquele binding
  responseAction presente
  renderedContent presente
  businessResponseKey presente

SEND_GENERIC_NON_AFFILIATE_RESPONSE exige:
  affiliateLink ausente
  binding pode estar ausente
  generic template exato
  businessResponseKey presente

NO_RESPONSE exige:
  responseAction ausente
  affiliateLink ausente
  renderedContent ausente
  businessResponseKey ausente
  noResponseReason presente
```

### `businessResponseKey` — segunda camada de dedupe

**Patch crítico:** o guard precisa identificar a mesma *oportunidade
lógica* de resposta, independente da versão da policy que está aplicando
o cooldown. Se `responsePolicySnapshotHash`/`templateHash` entrassem no
hash, um simples deploy de `ResponsePolicy` V2 mudaria a
`businessResponseKey` e furaria o anti-spam (usuário já recebeu o link →
deploy de policy nova → chave muda → recebe o mesmo link de novo). Por
isso, pra resposta específica:

```text
SOCIAL_BUSINESS_RESPONSE_KEY_V1 = hash(
  tenantId,
  providerKey,
  providerAccountId,
  actorProviderId,
  socialPublicationBindingId,
  creativeCtaIntentRef.creativeCtaIntentHash,
  responseAction
)
```

Pra fallback genérico:

```text
SOCIAL_GENERIC_RESPONSE_KEY_V1 = hash(
  tenantId,
  providerKey,
  providerAccountId,
  actorProviderId,
  responseAction,
  "GENERIC_NON_AFFILIATE"
)
```

A `ResponsePolicy` usada continua registrada na decisão do guard, mas
**não redefine a identidade do dedupe**. Sem
`providerInteractionId`/`mid`/`jobId`/`attemptNumber`. Mesmo
usuário+mesma publicação+mesmo CTA+nova mensagem QUERO → mesma
`businessResponseKey`; outra publicação → outra key. Cooldown/suppression
decidido pela policy (evita "QUERO QUERO QUERO" virar três mensagens em
segundos).

### Capability antes do intent executável

Mesmo que a policy permita DM, `ResponseIntent SEND` só prossegue pro
envio se o capability snapshot vigente pro tenant/provider/ambiente
permitir aquela ação. Ex.: Direct Meta + tester account → pode ter
capacidade tester-only; Direct Meta + produção pública →
`BLOCKED_BY_ACCOUNT_REQUIREMENT`. A Skill 16 nunca transforma
`TESTER_ONLY` em `VERIFIED PUBLIC`.

```typescript
type OutboundMessagingProviderCapabilities = {
  providerKey: string;
  capabilityVersion: string;

  supportedActions: SocialResponseAction[];

  supportsIdempotencyKey: boolean;

  supportsLookupByRequestKey: boolean;
  supportsOutboundMessageLookup: boolean;

  supportsDeliveryReceipt: boolean;

  accessMode: 'PUBLIC_PRODUCTION' | 'TESTER_ONLY' | 'UNAVAILABLE';

  createdAt: string;
};
```

Hash: `OUTBOUND_MESSAGING_PROVIDER_CAPABILITIES_V1:sha256:<hex>`.

### `OutboundMessagingProvider`

```typescript
interface OutboundMessagingProvider {
  getCapabilities(): OutboundMessagingProviderCapabilities;

  sendResponse(input: OutboundMessagingProviderRequest): Promise<OutboundMessagingProviderResponse>;

  lookupByRequestKey?(input: OutboundMessagingProviderLookupInput): Promise<OutboundMessagingProviderLookupResult>;
  getMessageStatus?(input: OutboundMessagingProviderStatusInput): Promise<OutboundMessagingProviderStatusResult>;
}
```

Não assumimos hoje que a Meta suporta lookup/idempotency — a capability
real dirá.

```typescript
type OutboundMessagingProviderRequest = {
  providerKey: string;
  providerAccountId: string;

  providerRequestKey: string;

  responseIntentId: string;
  responseIntentHash: string;

  responseAction: SocialResponseAction;

  recipientProviderId: string;

  replyContext: {
    providerInteractionId: string;
    providerPublicationId?: string;
    providerMediaId?: string;
    providerStoryId?: string;
  };

  renderedContent: {
    text: string;
    contentHash: string;
  };
};
```

Hash: `OUTBOUND_MESSAGING_PROVIDER_REQUEST_V1:sha256:<hex>` sobre
`providerKey`, `providerAccountId`, `responseIntentHash`,
`responseAction`, `recipientProviderId`, `replyContext`, rendered
content hash. Sem secrets.

**`providerRequestKey`** representa a mesma resposta lógica, não a
Attempt técnica — derivado de tenant+provider+providerAccount+
`responseIntentHash`+`businessResponseKey`. Retry de infraestrutura
mantém a mesma request key.

```typescript
type OutboundMessagingProviderResponse = {
  providerRequestId?: string;

  status: 'ACCEPTED' | 'REJECTED';

  providerOutboundMessageId?: string;

  normalizedProviderMetadata?: Record<string, unknown>;

  rejectionCode?: string;

  responseHash: string;
};
```

Hash: `OUTBOUND_MESSAGING_PROVIDER_RESPONSE_V1:sha256:<hex>`.

> `ACCEPTED` significa somente que o provider aceitou a operação de
> envio conforme a evidência disponível; **nunca** significa
> `DELIVERED`, `READ`, ou conversão. Não chamamos `ACCEPTED` de
> `DELIVERED`: provider aceitou a chamada ≠ usuário recebeu/leu.

### Checkpoint de envio

Objeto mutável — mesma disciplina da Skill 14, sem hash do checkpoint
inteiro.

```typescript
type OutboundSendCheckpointState =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'RESPONSE_CAPTURED'
  | 'ACCEPTED'
  | 'REJECTED';

type OutboundSendCheckpoint = {
  outboundSendCheckpointId: string;

  tenantId: string;
  runId: string;

  firstMaterializedByJobId: string;
  firstMaterializedByAttemptNumber: number;

  responseIntentId: string;
  responseIntentHash: string;

  businessResponseKey: string;

  providerKey: string;
  providerAccountId: string;

  providerRequestKey: string;
  providerRequestHash: string;

  // PATCH (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18):
  // obrigatório pra variante autenticada de provider antes de
  // SUBMITTING (achado S15 do Fable — a Skill 24 prometia consumo
  // aqui, campo nunca existiu). Resolvido pela Skill 24 a partir do
  // IntegrationBinding confiável — nunca de payload.credentialHandleId
  // vindo de webhook inbound (inbound ≠ outbound credential).
  credentialHandleRef: IntegrationCredentialHandleRef; // ref cruzada, definida na Skill 24

  sendContextHash: string;

  state: OutboundSendCheckpointState;

  providerRequestId?: string;
  providerOutboundMessageId?: string;

  providerResponseHash?: string;

  rejectionCode?: string;

  createdAt: string;
  updatedAt: string;
};
```

Hash do contexto imutável: `OUTBOUND_MESSAGE_SEND_CONTEXT_V1:sha256:<hex>`
sobre `responseIntentHash`, `businessResponseKey`, `providerKey`,
`providerAccountId`, `providerRequestKey`, `providerRequestHash`,
`credentialHandleRef` (Ponto S15 — faz parte da provenance da operação
realizada, nunca o segredo em si, ver S10 pra regra de serialização).
`state`, timestamps, e `providerOutboundMessageId` não entram.

**Identidade do checkpoint:** não usamos `UNIQUE(jobId, attemptNumber)`
— uma nova Attempt técnica não deve mandar outra DM. `UNIQUE` lógico
`(tenantId, responseIntentHash)`, mais proteção forte por
`businessResponseKey` conforme a janela da `ResponsePolicy`. Attempt 1
timeout → Attempt 2 encontra o mesmo checkpoint, não cria novo envio.

**State machine:**

```text
Normal:    PREPARED → SUBMITTING → RESPONSE_CAPTURED → ACCEPTED
Rejeição:  RESPONSE_CAPTURED → REJECTED (provider respondeu
           conclusivamente que não aceitou — não é ambiguidade)
```

**Antes da rede:** persistir `ResponseIntent` + `businessResponseKey` +
`ResponseGuard`/reservation + `OutboundSendCheckpoint PREPARED` +
`providerRequestKey`+`providerRequestHash`. Depois: checkpoint →
`SUBMITTING`, só então rede — evita "mandou DM, crash, nenhum registro,
retry, mandou outra DM".

**`RESPONSE_CAPTURED`:** após retorno, resposta normalizada +
`providerResponseHash` + `providerOutboundMessageId?` são persistidos
primeiro; depois validamos `ACCEPTED`/`REJECTED` — idealmente na mesma
transação quando possível.

**Delivery receipt é futuro, não V1.** Se um provider futuramente tiver
receipt real, isso não se mistura com o checkpoint de submit V1 — pode
surgir depois como `OutboundDeliveryObservation`
(`ACCEPTED`/`DELIVERED`/`READ`/`FAILED_AFTER_ACCEPTANCE`), sem fingir
essa capacidade hoje.

### Cadeia causal completa (resposta específica)

```text
provider webhook autenticado
→ InboundInteraction → durable event dedupe
→ SocialPublicationContextResolution → RESOLVED_EXACT
→ SocialPublicationBindingRef (CreativeCtaIntent + AffiliateLinkArtifact)
→ CreativeCtaMatch → MATCHED
→ ResponsePolicy
→ ResponseIntent → businessResponseKey/guard
→ capability check
→ OutboundSendCheckpoint
→ OutboundMessagingProvider → provider ACCEPTED

Se faltar correlação:
UNRESOLVED → policy decide → NO_RESPONSE ou
GENERIC_NON_AFFILIATE_RESPONSE
Nunca: UNRESOLVED → pegar qualquer AffiliateLinkArtifact
```

### Hashes canônicos deste bloco

```text
INBOUND_INTERACTION_V1                        → interação normalizada
CTA_MATCHING_POLICY_V1                        → comportamento/versionamento do matcher
CREATIVE_CTA_MATCH_V1                         → resultado exato do CTA match
SOCIAL_PUBLICATION_BINDING_REF_V1             → projeção do binding da futura Skill17
SOCIAL_PUBLICATION_CONTEXT_RESOLUTION_V1      → resolução determinística da publicação
SOCIAL_RESPONSE_POLICY_V1                     → regras de decisão/resposta/dedupe
SOCIAL_RESPONSE_INTENT_V1                     → intenção lógica de responder ou não
SOCIAL_BUSINESS_RESPONSE_KEY_V1               → dedupe específico por ator/publicação/CTA/ação
SOCIAL_GENERIC_RESPONSE_KEY_V1                → dedupe de fallback genérico
OUTBOUND_MESSAGING_PROVIDER_CAPABILITIES_V1   → capacidades técnicas do adapter
OUTBOUND_MESSAGING_PROVIDER_REQUEST_V1        → request exato de envio
OUTBOUND_MESSAGING_PROVIDER_RESPONSE_V1       → resposta normalizada do provider
OUTBOUND_MESSAGE_SEND_CONTEXT_V1              → contexto imutável do checkpoint
```

`OutboundSendCheckpoint` não recebe hash do objeto mutável inteiro.

## Idempotência ponta a ponta

A Skill 16 tem **três identidades independentes**, nenhuma substitui a
outra:

```text
1. evento recebido          → providerInteractionId
2. oportunidade lógica de resposta → businessResponseKey
3. operação externa de envio → providerRequestKey
```

```text
webhook autenticado → InboundInteraction → event dedupe
→ context resolution + CTA match → ResponseIntent
→ businessResponseKey → ResponseGuard → OutboundSendCheckpoint
→ providerRequestKey → envio externo
```

**PATCH (Ponto S7 — reparo transversal pós-revisão Fable, 2026-09-18,
`EXECUTION_RUNTIME_V1`, contrato completo em
`contracts/EXECUTION-RUNTIME.md`).** A rota de webhook (`CONTROL_PLANE`,
Vercel) só executa a fatia inicial do fluxo acima até persistir o
`InboundInteraction` durável (autenticação de ingress, dedupe, admissão
de evento) — sempre uma transaction curta, sem efeito colateral
externo. Todo o resto (context resolution/CTA match/`ResponseIntent`/
`ResponseGuard`/envio externo ao provider) é um `SkillJobHandler`
executado exclusivamente em `VIDEO_MACHINE_WORKER_V1`
(`DURABLE_WORKER`) — nunca inline na própria rota de webhook, mesmo
quando a resposta seria rápida. Isso é o exemplo canônico do S7:
`webhook → resolve tenant → chama IA → envia DM → espera provider →
responde` inline é proibido.

**Replay do `InboundInteraction`:** unicidade lógica
`(tenantId, providerKey, providerAccountId, providerInteractionId)`.
Replay compatível (mesmo ID + mesmo `interactionHash`) → retorna
existente, zero reprocessamento. Replay incompatível (mesmo ID + hash
diferente) → `SOCIAL_INBOUND_INTERACTION_REPLAY_CONFLICT` (FATAL_ERROR),
nunca sobrescrever.

**Replay do `CreativeCtaMatch`:** unicidade lógica
`inboundInteractionHash`+`creativeCtaIntentHash`+
`ctaMatchingPolicySnapshotHash`. Registro incompatível existente →
`CTA_MATCH_REPLAY_CONFLICT` (FATAL_ERROR). `SHADOW_COMPARE` também
reprodutível — `legacy`/`canonical`/`divergenceObserved` não mudam em
replay.

**Replay da resolução de publicação:** identidade lógica
`inboundInteractionHash`+`resolutionPolicySnapshotHash`. Depois de
materializada (`RESOLVED_EXACT`/`UNRESOLVED_MISSING_CONTEXT`/
`UNRESOLVED_NO_BINDING`/`AMBIGUOUS`), é **imutável** — nunca "ontem era
UNRESOLVED, hoje apareceu binding, replay silencioso vira RESOLVED_EXACT"
(isso reescreveria o passado).

### Corrida com a Skill 17 — `WAIT_FOR_BINDING`

Nuance real: o evento pode trazer chave de correlação válida, mas o
`SocialPublicationBinding` ainda não foi persistido por eventual
consistência. Nesse caso, a Skill 16 **não** materializa
`UNRESOLVED_NO_BINDING` imediatamente se: evidência de correlação válida
presente + binding ainda não encontrado + resolution policy permite
aguardar. Retorna operacionalmente `WAIT_FOR_BINDING` pra Skill 02, sem
criar resolução final. Quando a policy/deadline determinar que não deve
mais esperar → materializa `UNRESOLVED_NO_BINDING`. Não inventamos
quantos segundos/minutos esperar agora — isso vem de policy futura.
Regra: `MISSING_CONTEXT` nunca espera por binding (a chave nunca chegou
no evento); `NO_BINDING` pode ter pequena janela de reconciliação antes
do resultado final (a chave chegou).

**Replay do `ResponseIntent`:** identidade
`inboundInteractionHash`+`responsePolicySnapshotHash`+
`publicationResolutionHash`+`creativeCtaMatchHash?`. Replay compatível →
mesmo `ResponseIntent`/`intentHash`; conflito →
`SOCIAL_RESPONSE_INTENT_REPLAY_CONFLICT` (FATAL_ERROR). Importante:
`ResponseIntent` = vontade lógica de responder — o `ResponseGuard` ainda
pode decidir que essa resposta não deve ser executada por já ter
ocorrido recentemente.

## `ResponseGuard` — substituto real do `Map` de 10 minutos

**PATCH (Ponto S16, reparo transversal pós-revisão Fable, 2026-09-18)**:
achado do Claude Fable 5 Max — `suppressUntil?: string` era opcional
tentando carregar duas semânticas diferentes ("ausente = nunca mais
responde" ou "ausente = responde imediatamente de novo"), e a política
de supressão real nunca ficou explícita em lugar nenhum. Corrigido
tornando a política **discriminada e obrigatória**:

```typescript
type ResponseSuppressionPolicy =
  | { mode: 'ONCE_PER_GUARD'; }
  | { mode: 'WINDOWED'; suppressionWindowMs: number; };
```

`ResponseGuard` nunca infere política a partir da ausência de um
campo. Para V1, **não existe modo `NONE`** — permitiria o mesmo
gatilho gerar respostas repetidas sem qualquer freio temporal; se
houver caso legítimo futuro, entra como nova política explícita. Pra
`WINDOWED`, `suppressionWindowMs > 0` é obrigatório — proibidos `0`,
negativo, `NaN`, `Infinity` (nunca usar `0` como alias de "sem
supressão").

```typescript
type ResponseGuardState = 'AVAILABLE' | 'RESERVED' | 'SATISFIED' | 'HELD_EXTERNAL_UNKNOWN';

type ResponseGuard = {
  responseGuardId: string;

  tenantId: string;

  providerKey: string;
  providerAccountId: string;

  businessResponseKey: string;

  suppressionPolicy: ResponseSuppressionPolicy;

  guardVersion: number;

  state: ResponseGuardState;

  activeReservation?: {
    reservationId: string;

    responseIntentId: string;
    responseIntentHash: string;

    reservedAt: string;

    outboundSendCheckpointId?: string;
  };

  lastAcceptedResponseIntentId?: string;
  lastAcceptedResponseIntentHash?: string;

  lastAcceptedAt?: string;

  // suppressUntil é MUTUAMENTE EXCLUSIVO com o mode da policy:
  //   ONCE_PER_GUARD → suppressUntil DEVE estar ausente (SATISFIED já
  //     é terminal para este guard — "para sempre" nunca é
  //     representado como data artificial tipo 9999-12-31)
  //   WINDOWED + SATISFIED → suppressUntil DEVE existir, derivado
  //     deterministicamente de confirmedResponseAt + suppressionWindowMs
  //     (nunca now + suppressionWindowMs — replay não pode renovar a
  //     janela)
  suppressUntil?: string;

  updatedAt: string;
};
```

Recomendação operacional pra V1: `ONCE_PER_GUARD` pro fluxo atual
(comentou "QUERO" numa publicação → aquele CTA daquela publicação não
dispara repetidamente pro mesmo ator, mesmo com webhook duplicado ou
comentário repetido) — mas a política continua tendo que estar
materializada explicitamente no guard, nunca um default invisível.
`WINDOWED` fica disponível pra casos futuros legítimos (usuário pode
solicitar de novo após 24h, alertas recorrentes) quando configurado
explicitamente.

`ONCE_PER_GUARD` é "uma vez para a identidade **daquele guard**", nunca
"uma vez na vida do usuário" — nova publicação/CTA semanticamente
diferente é outro guard (identidade já cobre isso via
`businessResponseKey`/`providerKey`/`providerAccountId`). Cooldown
acabar (`now >= suppressUntil` em `WINDOWED`) nunca cria autorização de
negócio por si só — ainda passam `tenant authority`/`provider
capability`/`response policy`/`credential handle`/`side-effect safety`
normalmente; CTA/publicação expirados continuam impedindo resposta
mesmo com a janela vencida.

`UNIQUE (tenantId, providerKey, providerAccountId, businessResponseKey)`.
Objeto mutável — **sem hash canônico do `ResponseGuard` inteiro**.

**Aquisição precisa ser atômica.** Nunca "SELECT guard; if livre: INSERT
reservation" sem exclusão/controle concorrente — a aquisição é
transacional/CAS (`guardVersion` esperado → reservar → `guardVersion+1`).
Duas mensagens "QUERO" simultâneas: mensagem A → `ACQUIRED`; mensagem B
→ vê reservation existente. Nunca duas reservas.

### `ResponseGuardDecision`

```typescript
type ResponseGuardDecisionOutcome =
  | 'ACQUIRED'
  | 'REUSED_EXISTING_RESERVATION'
  | 'SUPPRESSED_RECENT_RESPONSE'
  | 'HELD_EXTERNAL_UNKNOWN';

type ResponseGuardDecision = {
  responseGuardDecisionId: string;

  tenantId: string;

  businessResponseKey: string;

  responseIntentId: string;
  responseIntentHash: string;

  responsePolicyId: string;
  responsePolicyVersion: string;
  responsePolicySnapshotHash: string;

  outcome: ResponseGuardDecisionOutcome;

  reservationId?: string;

  evaluatedAt: string;

  currentSuppressUntil?: string;

  decisionHash: string;
};
```

Hash: `SOCIAL_RESPONSE_GUARD_DECISION_V1:sha256:<hex>` sobre
`businessResponseKey`, `responseIntentHash`,
`responsePolicySnapshotHash`, `outcome`, `reservationId?`,
`evaluatedAt`, `currentSuppressUntil?`. `evaluatedAt` entra no hash aqui
— tempo faz parte da decisão de cooldown.

### Transições do guard

```text
Primeiro envio:                    AVAILABLE → RESERVED
Provider aceita:                   RESERVED → SATISFIED
                                    (lastAcceptedAt = momento confirmado;
                                     mode=ONCE_PER_GUARD → suppressUntil
                                       ausente, terminal;
                                     mode=WINDOWED → suppressUntil =
                                       lastAcceptedAt + suppressionWindowMs,
                                       determinístico)
Provider rejeita conclusivamente:  RESERVED → AVAILABLE
Envio externo ambíguo:             RESERVED → HELD_EXTERNAL_UNKNOWN
                                    (nunca liberar automaticamente)
```

**PATCH (Ponto S16)**: o texto anterior a este patch dizia "se `now >=
suppressUntil`, uma nova aquisição pode transicionar" sem tratar o caso
de `suppressUntil` ausente — exatamente a ambiguidade que o Fable
apontou. Substituído por branch explícito por `mode`:

```text
mode = ONCE_PER_GUARD:
  state = SATISFIED → SUPPRESS permanentemente para este guard
  state ≠ SATISFIED → avalia normalmente

mode = WINDOWED:
  state ≠ SATISFIED → avalia normalmente
  state = SATISFIED e now < suppressUntil → SUPPRESS
  state = SATISFIED e now >= suppressUntil → pode reavaliar/reservar
    (mas isso ainda depende de: interação válida, CTA ainda válido,
    publicação ativa, integração disponível, policy ainda permite —
    janela vencer nunca cria autorização de negócio sozinha)
```

Reprocessamento do mesmo resultado de envio (replay) nunca recalcula a
janela com `now + suppressionWindowMs` — isso prolongaria o bloqueio
indefinidamente; a base é sempre o `lastAcceptedAt` real da confirmação
original. Falha comprovada sem side effect (`NO_SIDE_EFFECT` pelo
protocolo de outbound) pode devolver o guard à condição anterior sem
esperar a janela, porque nenhuma resposta de fato aconteceu — usando
evidência forte da execução, nunca inferência por timeout.

**Reservation abandonada antes da rede:** `ResponseGuard = RESERVED` +
`checkpoint = PREPARED` + processo morto → a reserva pode ser recuperada
após a semântica de lease da Skill 02 permitir (sabemos que a rede ainda
não começou). Mas `checkpoint = SUBMITTING` **nunca** é liberado
automaticamente só por ter passado tempo — pode já ter enviado DM.

**Ambiguidade de envio segura:** `SUBMITTING` + timeout/crash → provider
suporta `lookupByRequestKey` → reconcile; suporta idempotency key real →
retransmitir mesma operação lógica pode ser permitido; nenhum dos dois →
`HELD_EXTERNAL_UNKNOWN`/Job `BLOCKED`. Nunca "passaram 10 minutos, libera
e manda outra".

**Commit após `ACCEPTED`:** atomicamente `OutboundSendCheckpoint →
ACCEPTED` + `ResponseGuard → SATISFIED` + `lastAcceptedAt`/`suppressUntil`
+ `AuditEvent` — evita janela onde "DM já aceita + guard parece livre".
Se cair depois de persistir `RESPONSE_CAPTURED` mas antes de
`ACCEPTED`+guard `SATISFIED`, o replay usa a resposta já persistida, zero
nova chamada externa.

## Capabilities: separar tecnologia de autorização

`OutboundMessagingProviderCapabilities` responde "o adapter sabe fazer
`SEND_DIRECT_MESSAGE`?" — mas também precisamos responder "este
tenant/conta está autorizado a fazer isso neste ambiente?". São fatos
diferentes.

**Snapshot de capacidade operacional imutável:**
`MESSAGING_AUTOMATION_CAPABILITY_V1:sha256:<hex>`. Novo App Review, nova
permissão, novo provider, ou mudança de conta → novo snapshot. Nunca
editar retroativamente o antigo.

### Resolução de capability

```typescript
type MessagingExecutionMode = 'DRY_RUN' | 'TESTER' | 'PUBLIC_PRODUCTION';

type MessagingCapabilityDecision =
  | 'ALLOWED'
  | 'BLOCKED_TESTER_ONLY'
  | 'BLOCKED_ACCOUNT_REQUIREMENT'
  | 'BLOCKED_UNVERIFIED'
  | 'BLOCKED_UNSUPPORTED'
  | 'BLOCKED_NOT_IMPLEMENTED'
  | 'BLOCKED_NOT_CONFIGURED';

type MessagingCapabilityResolution = {
  messagingCapabilityResolutionId: string;

  tenantId: string;

  providerKey: string;
  providerAccountId: string;

  requestedAction: SocialResponseAction;

  executionMode: MessagingExecutionMode;

  capabilitySnapshotId: string;
  capabilitySnapshotHash: string;

  providerCapabilitiesHash: string;

  decision: MessagingCapabilityDecision;

  testerEligibilityEvidenceRef?: string;

  resolutionHash: string;

  createdAt: string;
};
```

Hash: `MESSAGING_CAPABILITY_RESOLUTION_V1:sha256:<hex>`.

**Regras por modo:** `DRY_RUN` percorre todo o pipeline, mas **nunca**
chama `sendResponse()`. `TESTER` exige `capability = TESTER_ONLY` ou
superior + evidência de que o destinatário está dentro do escopo
autorizado de testes. `PUBLIC_PRODUCTION` exige capability explicitamente
verificada pra produção pública — estado Meta atual:
`publicProductionAccess = BLOCKED_BY_ACCOUNT_REQUIREMENT` → `BLOCKED`,
nenhuma chamada real, não tentamos contornar.

**Patch no checkpoint:** `OutboundSendCheckpoint` ganha
`messagingCapabilityResolutionId`/`hash`, `capabilitySnapshotId`/`hash`,
`executionMode` — assim uma Attempt antiga não passa a usar
silenciosamente permissões novas ou revogadas. Capability antiga não
muda: checkpoint do dia 18 continua dizendo `TESTER_ONLY` mesmo se a
conta ganhar nova permissão no dia 20; nova operação usa novo capability
snapshot; não reescrevemos o passado.

**`TEST_FIXTURE` — regra rígida:** `InboundInteraction.trust.source =
TEST_FIXTURE` pode match/resolver fixture binding/criar
`ResponseIntent`/testar guard/validar payload, mas **nunca**
`provider.sendResponse` real. Tentativa →
`SOCIAL_UNAUTHORIZED_REAL_SEND_FROM_TEST_FIXTURE` (FATAL_ERROR/integrity
violation).

## Erros

### `FATAL_ERROR` (26 códigos)

```text
SOCIAL_TENANT_MISMATCH
SOCIAL_PROVIDER_ACCOUNT_TENANT_MISMATCH

SOCIAL_INBOUND_INTERACTION_REPLAY_CONFLICT
SOCIAL_INBOUND_TRUST_INTEGRITY_VIOLATION

CTA_MATCHING_POLICY_NOT_FOUND
INVALID_CTA_MATCHING_POLICY

CREATIVE_CTA_INTENT_NOT_FOUND
CREATIVE_CTA_INTENT_HASH_MISMATCH
CTA_MATCH_REPLAY_CONFLICT
```

**PATCH (Ponto S3).** `CREATIVE_CTA_INTENT_NOT_FOUND` cobre falha ao
resolver `creativeCtaIntentRef.creativeDirectionResultId` (parent
inexistente/hash divergente) OU tenant do parent divergente.
`CREATIVE_CTA_INTENT_HASH_MISMATCH` cobre qualquer uma das duas
checagens de integridade — `canonicalHash(CREATIVE_CTA_INTENT_V1,
parent.direction.ctaIntent) ≠ ref.creativeCtaIntentHash` **ou**
`parent.creativeCtaIntentHash ≠ ref.creativeCtaIntentHash` — nunca
"CTA bateu, então ignora divergência do parent" (nem o inverso).
**0 `FATAL_ERROR` novos** para o Ponto S3 — os dois códigos já
existentes cobrem exatamente os casos que a formalização do `Ref`
introduziu.

```text

SOCIAL_PUBLICATION_BINDING_HASH_MISMATCH
SOCIAL_PUBLICATION_BINDING_LINEAGE_MISMATCH
SOCIAL_PUBLICATION_RESOLUTION_REPLAY_CONFLICT

SOCIAL_RESPONSE_POLICY_NOT_FOUND
INVALID_SOCIAL_RESPONSE_POLICY
SOCIAL_RESPONSE_TEMPLATE_HASH_MISMATCH

SOCIAL_RESPONSE_INTENT_INTEGRITY_VIOLATION
SOCIAL_RESPONSE_INTENT_REPLAY_CONFLICT

SOCIAL_AFFILIATE_LINK_BINDING_MISMATCH

SOCIAL_RESPONSE_GUARD_KEY_CONFLICT
SOCIAL_RESPONSE_GUARD_STATE_CORRUPT

OUTBOUND_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT
OUTBOUND_PROVIDER_RESPONSE_CONFLICT
OUTBOUND_PROVIDER_RESPONSE_INVALID
OUTBOUND_INVALID_STATE_TRANSITION

MESSAGING_CAPABILITY_SNAPSHOT_INTEGRITY_VIOLATION

SOCIAL_UNAUTHORIZED_REAL_SEND_FROM_TEST_FIXTURE
```

**PATCH (Ponto S16, reparo transversal pós-revisão Fable, 2026-09-18)**:
0 `FATAL_ERROR` novos — reaproveitados os já existentes acima (mesmo
padrão do S12/S13/S15: antes de criar código bonito novo, verificar se
já existe equivalente). `INVALID_SOCIAL_RESPONSE_POLICY` cobre
`ResponsePolicy.businessDedupe.suppressionPolicy` ausente,
`WINDOWED` sem `suppressionWindowMs`, ou `suppressionWindowMs <= 0`
(validação estrutural da policy, `category=CONTRACT`/
`retryAdvice=NON_RETRYABLE` — retry não resolve policy inválida, ver
S12). `SOCIAL_RESPONSE_GUARD_STATE_CORRUPT` cobre `suppressUntil`
incompatível com o `mode` num `ResponseGuard` já existente (ex.:
`ONCE_PER_GUARD` com `suppressUntil` presente, ou `WINDOWED/SATISFIED`
sem `suppressUntil`) — corrupção de estado de um guard real, distinto
de policy inválida.

### `RETRYABLE_ERROR`

Só quando repetir a fase é seguro:

```text
SOCIAL_PUBLICATION_BINDING_LOOKUP_TRANSIENT_ERROR

OUTBOUND_PROVIDER_TEMPORARILY_UNAVAILABLE
OUTBOUND_PROVIDER_RATE_LIMITED

OUTBOUND_PROVIDER_REQUEST_TRANSIENT_ERROR
OUTBOUND_PROVIDER_LOOKUP_TRANSIENT_ERROR
OUTBOUND_PROVIDER_STATUS_TRANSIENT_ERROR

TRANSIENT_DATASTORE_ERROR
```

`OUTBOUND_PROVIDER_REQUEST_TRANSIENT_ERROR` só autoriza nova chamada se
houver prova de que o request não foi aceito/enviado. Situação ambígua
→ não é retry simples, é reconcile ou `BLOCKED`.

### `BLOCKED`

```text
MESSAGING_INTEGRATION_NOT_CONFIGURED               → POLICY_BLOCKED
MESSAGING_CAPABILITY_TESTER_ONLY                   → POLICY_BLOCKED
MESSAGING_PUBLIC_ACCESS_BLOCKED_BY_ACCOUNT_REQUIREMENT → POLICY_BLOCKED
MESSAGING_CAPABILITY_UNVERIFIED                    → POLICY_BLOCKED
MESSAGING_ACTION_NOT_IMPLEMENTED                   → POLICY_BLOCKED
MESSAGING_ACTION_UNSUPPORTED                       → POLICY_BLOCKED
MESSAGING_PROVIDER_AUTHORIZATION_REVOKED           → POLICY_BLOCKED

SOCIAL_OUTBOUND_EXTERNAL_STATE_UNKNOWN             → EXTERNAL_STATE_UNKNOWN
SOCIAL_RESPONSE_GUARD_HELD_EXTERNAL_UNKNOWN        → EXTERNAL_STATE_UNKNOWN
```

Pro Meta atual em produção pública:
`MESSAGING_PUBLIC_ACCESS_BLOCKED_BY_ACCOUNT_REQUIREMENT` é o resultado
correto.

### O que NÃO é erro

Não são `FATAL`, `RETRYABLE` nem `BLOCKED` — resultados normais de
domínio: CTA não deu match; `UNRESOLVED_MISSING_CONTEXT`;
`UNRESOLVED_NO_BINDING` depois da política de espera; `AMBIGUOUS`;
`ResponsePolicy` decidiu `NO_RESPONSE`; decidiu
`GENERIC_NON_AFFILIATE_RESPONSE`; `ResponseGuard` retornou
`SUPPRESSED_RECENT_RESPONSE`.

**`REJECTED` do provider também não é automaticamente fatal** — o
adapter classifica o motivo: payload nosso inválido → `FATAL`; permissão
não disponível → `BLOCKED`; rate limit conhecido, nada enviado →
`RETRYABLE`; recipient não elegível pra aquela ação → terminal
conhecido/no-send; timeout sem saber se enviou →
`EXTERNAL_STATE_UNKNOWN`. Não transformar todo HTTP 4xx/5xx na mesma
coisa.

### Mesma Attempt vs. nova Attempt

Continuam na mesma Attempt: lookup/reconcile, status check, finalização
de `RESPONSE_CAPTURED`, retry de datastore. Uma nova Attempt da Skill 02
**não** é nova oportunidade de DM — precisa encontrar o mesmo
`ResponseIntent`/`businessResponseKey`/`ResponseGuard`/
`OutboundSendCheckpoint`/`providerRequestKey` quando estiver retomando a
mesma resposta lógica.

## Multi-tenant

**Diferença importante em relação às Skills anteriores:** o webhook
chega **antes** de necessariamente termos um Job — não podemos começar
com `trustedTenantId = Job.tenantId`.

**PATCH (Ponto S1 — Provider Account Ingress).** Correção de linguagem:
Skill 16 **nunca** resolve tenant sozinha a partir de
`(providerKey, providerAccountId)` — ela não é autoridade de tenant.
O fluxo real é: Skill 16 valida a assinatura do webhook (evidência de
autenticação do provider), então pede à Skill 24 uma
`ProviderAccountIngressResolution` (que localiza o binding candidato
`providerAccountId → tenantId`), e então passa essa resolução + a
evidência de autenticação + o evento inbound pra Skill 22, que — e só
ela — decide se emite um `TrustedTenantContext` com
`source: 'PROVIDER_ACCOUNT_INGRESS'`. Skill 16 consome esse
`TrustedTenantContext` já validado; nunca monta `tenantIdFromPayload`/
`trustedPayloadTenantId` nem qualquer campo equivalente que trate o
binding da Skill 24 sozinho como prova de tenant. Nunca confiar em
`tenantId` enviado pelo usuário, `sender.id`, query parameter público,
ou body não autenticado pra escolher tenant.

**Depois que o Job existe:** `Job.tenantId = TrustedTenantContext.tenantId`
emitido pela Skill 22 (nunca inferido diretamente do
`providerAccountId`), e toda a cadeia deve corresponder
(`InboundInteraction`, `CreativeCtaIntent`, `CtaMatchingPolicy`,
`SocialPublicationBindingRef`, `AffiliateLinkArtifact`, `ResponsePolicy`,
`ResponseIntent`, `ResponseGuard`, `MessagingCapabilitySnapshot`,
provider profile/account, `OutboundSendCheckpoint`). Divergência →
`SOCIAL_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de segurança).

`actorProviderId` não é chave de tenant — mesmo identificador externo de
usuário não pode procurar dados fora da conta/tenant de origem;
consultas carregam no mínimo `tenantId`+`providerKey`+
`providerAccountId` antes de usar `actorProviderId`.

**Cross-tenant response guard proibido:** mesmo ator aparecendo em
tenant A e tenant B → guards independentes — nunca compartilhar
suppression state, publication binding, affiliate link, response intent,
outbound checkpoint.

**Privacidade operacional** (retenção completa fica pra Skill 25):
`textRaw`, `actorProviderId`, `recipientProviderId` são dados
potencialmente sensíveis/identificadores operacionais — persistência
pode ser necessária pra execução/auditoria, mas logs não os despejam por
padrão; `textRaw` nunca vira label de métrica.

## Observabilidade

### Logs

Por interação/tick: `tenantId`, `providerKey`, `providerAccountId`,
`inboundInteractionId`, `interactionHash`, `interactionType`,
`providerInteractionIdHash`, `actorProviderIdHash`,
`correlationEvidenceTypes`, `publicationResolutionStatus`, `bindingId?`
quando resolvido, `creativeCtaIntentRef.creativeCtaIntentHash?`, `ctaMatchingPolicyVersion?`,
`canonicalMatch?`, `legacyShadowMatch?`, `divergenceObserved?`,
`responsePolicyVersion`, `responseDisposition`, `businessResponseKey`,
`responseGuardDecision`, `guardState`, `messagingCapabilitySnapshotHash`,
`executionMode`, `capabilityDecision`, `outboundSendCheckpointId?`,
`checkpointState?`, `providerRequestKey?`/`hash?`,
`providerResponseHash?`, `durationMs`, `errorCode?`. Não logar por
padrão: texto cru da DM, `providerAffiliateUrl`, token de acesso,
`Authorization`, `actorProviderId` cru, `recipientProviderId` cru,
payload bruto completo da Meta.

### `AuditEvent`

Criado pra mudanças lógicas importantes: `InboundInteraction`
materializada; CTA shadow divergence detectada; publication
`RESOLVED_EXACT`/`AMBIGUOUS`/final `UNRESOLVED`; `ResponseIntent`
`SEND_SPECIFIC`/`SEND_GENERIC`/`NO_RESPONSE`; `ResponseGuard`
`ACQUIRED`/`SUPPRESSED`/`HELD_EXTERNAL_UNKNOWN`; capability blocked;
checkpoint `PREPARED→SUBMITTING→RESPONSE_CAPTURED→ACCEPTED/REJECTED`;
tenant mismatch; request key payload conflict; provider response
conflict; external state unknown. Não precisa `AuditEvent` em cada
lookup/retry técnico.

### Métricas

```text
social_inbound_interaction_total
social_inbound_duplicate_total
social_inbound_by_type_total

social_cta_match_total
social_cta_no_match_total
social_cta_shadow_divergence_total

social_publication_resolved_exact_total
social_publication_unresolved_missing_context_total
social_publication_unresolved_no_binding_total
social_publication_ambiguous_total
social_publication_binding_wait_total

social_response_specific_intent_total
social_response_generic_intent_total
social_response_no_response_total

social_response_guard_acquired_total
social_response_guard_suppressed_total
social_response_guard_external_unknown_total

social_outbound_submit_total
social_outbound_accepted_total
social_outbound_rejected_total
social_outbound_rate_limited_total
social_outbound_external_state_unknown_total
social_outbound_reconcile_total

messaging_capability_blocked_total
messaging_tester_only_blocked_total
messaging_public_account_requirement_blocked_total
messaging_action_not_implemented_total
```

`social_publication_binding_wait_total` é especialmente útil pra
detectar a corrida Skill17→Skill16. **Nunca**
`social_outbound_delivered_total` a menos que exista receipt real —
`ACCEPTED` não pode alimentar métrica chamada `delivered`. ReplyRush
hoje: `adapter runtime NOT_IMPLEMENTED`, `production capability
UNVERIFIED` — nenhuma métrica finge o contrário.

## Plano de testes

94 casos críticos.

**Inbound/event dedupe (1-10):** (1) mesmo `mid` duas vezes → um
`InboundInteraction`. (2) mesmo `mid` com conteúdo incompatível → replay
conflict. (3) mesmo `mid` em outra `providerAccountId` → interação
distinta. (4) `DIRECT_MESSAGE` e `STORY_REPLY` distintos alteram
identity. (5) `receivedAt` diferente não muda `interactionHash`. (6)
envelope/payloadHash diferente em retry não muda identidade lógica. (7)
`ProviderAccountIngressResolution` + evidência de autenticação válidas →
Skill 22 emite `TrustedTenantContext` com o tenant correto (Ponto S1:
Skill 16 nunca resolve sozinha). (8) account sem binding não cria tenant
por inferência. (9) `TEST_FIXTURE` percorre pipeline em
dry-run. (10) `TEST_FIXTURE` não pode gerar envio real.

**CTA matching (11-20):** (11) NFKC equivalente produz mesma
normalização. (12) diferença de caixa não quebra keyword. (13)
whitespace equivalente não quebra match. (14) "QUERO" casa. (15) "eu
quero" casa segundo `NORMALIZED_TOKEN`/`PHRASE`. (16) "querosene" não
casa com "quero". (17) `SHADOW_COMPARE` calcula legacy e canonical. (18)
divergência shadow é persistida. (19) `ACTIVE` usa canonical. (20)
mesmo input+policy produz mesmo `matchHash`.

**Publication resolution (21-32):** (21) `providerMediaId` + um binding
→ `RESOLVED_EXACT`. (22) `providerPublicationId` + binding →
`RESOLVED_EXACT`. (23) `providerStoryId` + binding → `RESOLVED_EXACT`.
(24) CTA correlation token válido → `RESOLVED_EXACT`. (25) nenhuma
evidence → `UNRESOLVED_MISSING_CONTEXT`. (26) evidence válida + binding
temporariamente ausente → `WAIT_FOR_BINDING`. (27) deadline/policy
expira → `UNRESOLVED_NO_BINDING`. (28) dois bindings candidatos →
`AMBIGUOUS`. (29) latest publication nunca é usada como heurística. (30)
histórico recente do usuário nunca resolve publicação. (31) binding
hash/lineage incompatível → fatal. (32) resolução final antiga não muda
em replay porque apareceu binding novo.

**ResponseIntent/templates (33-45):** (33) no match não gera affiliate
response. (34) exact+match+artifact correto → specific affiliate
intent. (35) `AffiliateLinkArtifact` errado pra binding → fatal. (36)
generic fallback não contém affiliate link. (37) `NO_RESPONSE` não
contém conteúdo/action. (38) generic policy nunca autoriza affiliate
URL. (39) `templateHash` divergente → fatal. (40) Skill 16 não chama
LLM pra criar copy. (41) `PRODUCT_NAME` só pode vir de upstream
autorizado. (42) `maxLogicalResponsesPerInteraction=1` respeitado. (43)
mesmo input gera mesmo `intentHash`. (44) `ResponseIntent` incompatível
no replay → fatal. (45) match deve corresponder ao `CreativeCtaIntent`
do binding exato.

**ResponseGuard (46-58):** (46) primeira oportunidade adquire
reservation. (47) duas aquisições concorrentes → somente uma vence. (48)
replay do mesmo intent reutiliza reservation. (49) mensagem nova do
mesmo usuário/publicação/CTA dentro do cooldown → suppressed. (50)
mesma pessoa em outra publicação → chave diferente. (51) mesmo binding
com outro CTA intent → chave diferente. (52) mudança de `ResponsePolicy`
não muda `businessResponseKey`. (53) mudança de template não muda
generic response key. (54) `ACCEPTED` transforma guard em `SATISFIED`.
(55) `REJECTED` conhecido libera reservation. (56) external state
unknown mantém guard travado. (57) `PREPARED` abandonado pode ser
recuperado de forma segura. (58) `SUBMITTING` abandonado nunca é
liberado automaticamente.

**Capability/tester-only (59-69):** (59) `PUBLIC_PRODUCTION` +
`BLOCKED_BY_ACCOUNT_REQUIREMENT` → blocked. (60) `TESTER_ONLY` +
`executionMode TESTER` + evidence válida → permitido. (61)
`TESTER_ONLY` + `PUBLIC_PRODUCTION` → blocked. (62) capability
`UNVERIFIED` → blocked. (63) capability `UNSUPPORTED` → blocked. (64)
capability `NOT_IMPLEMENTED` → blocked. (65) `DRY_RUN` nunca chama
provider. (66) `TEST_FIXTURE` nunca chama provider real. (67) adapter
suporta DM mas conta não tem autorização → blocked. (68) conta tem
autorização mas adapter não suporta ação → blocked. (69) capability
snapshot novo não altera checkpoint antigo.

**Outbound/checkpoint (70-84):** (70) `ResponseGuard`/reservation
existe antes da rede. (71) checkpoint `PREPARED` existe antes da rede.
(72) `SUBMITTING` é persistido antes de `sendResponse()`. (73) resposta
normalizada é persistida em `RESPONSE_CAPTURED`. (74) `ACCEPTED` não é
`DELIVERED`. (75) `REJECTED` conhecido não vira `ACCEPTED`. (76) replay
de checkpoint `ACCEPTED` → zero novo envio. (77) crash pós-submit/pré-
response → reconcile ou unknown. (78) provider com idempotency real
pode retransmitir mesma request. (79) provider sem idempotency/lookup →
`BLOCKED` em ambiguidade. (80) mesma request key com payload diferente
→ fatal. (81) duas respostas incompatíveis pra mesma operação → fatal.
(82) rate limit comprovadamente pré-envio pode ser retryable. (83)
`RESPONSE_CAPTURED` após crash finaliza sem novo envio. (84) nova
Attempt técnica reutiliza a mesma operação lógica.

**Multi-tenant/segurança/observabilidade (85-94):** (85) tenant inbound
vem de `TrustedTenantContext` emitido pela Skill 22 a partir da
`ProviderAccountIngressResolution` + evidência de autenticação (Ponto
S1), nunca do binding sozinho. (86) `Job.tenantId` divergente do
`TrustedTenantContext` → fatal. (87) actor de tenant A não resolve
binding de B. (88) `AffiliateLinkArtifact` cross-tenant → fatal. (89)
`providerAccountId` de outro tenant → fatal. (90) logs não contêm
affiliate URL completa por padrão. (91) logs não contêm
`actorProviderId` cru por padrão. (92) logs não contêm texto cru da
mensagem por padrão. (93) external state unknown e tenant mismatch
geram `AuditEvent`. (94) métrica `ACCEPTED` nunca é registrada como
`DELIVERED`.

### Testes reais futuros com Meta tester

```text
Story/DM tester → "QUERO" → webhook assinado → InboundInteraction
→ match → correlation se payload tiver evidence → binding
→ AffiliateLinkArtifact → guard → send
```

Testes obrigatórios: reenviar exatamente o mesmo webhook → nenhuma
segunda DM; mandar dois QUERO com `mid`s diferentes pra mesma publicação
dentro da janela → uma resposta lógica; reiniciar processo após
`SUBMITTING` → nunca mandar novamente cegamente; conta fora do tester
scope → bloqueada antes do provider send. Teste mais importante de
correlação: capturar payload real de Story Reply/DM → verificar se
existe de fato referência recuperável à story/media/publication. Se não
houver, `RESOLVED_EXACT` via aquele mecanismo não está disponível — e
não inventamos. Nenhum teste público fora de testadoras enquanto o
bloqueio empresarial da Meta permanecer.

### Hashes novos deste bloco

```text
SOCIAL_RESPONSE_GUARD_DECISION_V1   → decisão imutável do business guard
MESSAGING_AUTOMATION_CAPABILITY_V1  → snapshot de autorização/capacidade conhecida
MESSAGING_CAPABILITY_RESOLUTION_V1  → decisão de execução para ação+ambiente
```

`ResponseGuard` continua sem hash do objeto inteiro (mutável).
`OutboundSendCheckpoint` também continua sem hash integral — usa
`OUTBOUND_MESSAGE_SEND_CONTEXT_V1` já definido.

## Fechamento conceitual

1. Receber "QUERO" prova intenção textual; não prova qual produto
   motivou a mensagem. Link específico só existe após correlação exata
   com a publicação.
2. Dedupe de webhook, anti-spam de negócio e idempotência de envio
   externo são três problemas diferentes e têm identidades diferentes.
3. Uma nova Attempt técnica nunca é justificativa pra mandar outra
   mensagem ao usuário.
4. Capabilities reais limitam a execução: tester-only continua
   tester-only, e ausência de autorização pública nunca é convertida em
   capacidade presumida.

## Status de implementação (nesta fase de especificação)

```text
Skill 16 automation pipeline → NOT_IMPLEMENTED
(webhook QUERO→DM → JÁ EXISTE em produção, mas com keyword matching
 simplificado, link sem tracking hardcoded, zero correlação com
 vídeo/produto, e dedupe só em memória — limitado a contas testadoras
 por bloqueio real de Tech Provider/CNPJ)
```
