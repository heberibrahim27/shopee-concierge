# Skill 17 — Publicador Multicanal

> **APROVADA EM ESPECIFICAÇÃO — 17/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 (ChatGPT ↔ Claude Code). Skill
> pivotal — fecha três cadeias já aprovadas (Skill 14 →
> `FinalizedVideoRendition`, Skill 15 → `AffiliateLinkArtifact`, Skill 17
> → `SocialPublicationBinding` → Skill 16). Diferente das Skills 09-14,
> **não é greenfield**: `publish-product/route.ts` já publica imagens
> estáticas via Windsor.ai em produção real, mas o novo pipeline de
> vídeo (`FinalizedVideoRendition`) está `NOT_IMPLEMENTED` — inclui um
> patch compatível na Skill 03 (`PublicationAuthorizationResolutionRef`,
> sem reabrir 3/25) pra formalizar a revalidação atômica de
> `FIRST_REAL_PUBLISH` (mesmo método das Skills 04-16).

## Garantia central (rascunho inicial)

A Skill 17 publica o `FinalizedVideoRendition` (Skill 14) exato num
canal, embutindo o `AffiliateLinkArtifact` (Skill 15) exato — nunca um
link sem tracking — e materializa o `SocialPublicationBinding` que a
Skill 16 depende pra correlacionar comentários/DMs de volta à
publicação. Ela revalida a trava `FIRST_REAL_PUBLISH` (Skill 03) antes
de qualquer publicação real. Não decide aprovação, não gera link, não
corrige vídeo, não responde comentários.

## Auditoria real do repositório (2026-09-18)

Confirmado via agente de auditoria: **NÃO é greenfield** — já existe um
fluxo real de publicação em produção, mas image-only, com o mesmo bug de
link sem tracking já documentado nas Skills 15/16.

- **Fluxo real:** `src/app/api/cron/publish-product/route.ts` (216
  linhas). Publica **duas imagens estáticas**, nunca vídeo: `feed`
  (1080×1350) e `story` (1080×1920) via `next/og`. Provider: Windsor.ai
  (`connectors.windsor.ai/instagram/actions`). `create_image_post` →
  insere linha em `social_posts` com `media_id` extraído via regex de
  uma string em linguagem natural (`"Media id: 123."`) → se sucesso,
  `create_comment` postando `Link: ${candidate.offerLink}` — **de novo o
  mesmo `offer_link` sem tracking**, exatamente o `LEGACY_TRACKING_BYPASS`
  já documentado nas Skills 15/16 — → `create_story`.
- **`social_posts` schema real confirmado ao vivo** (sem migration
  versionada): `id`, `deal_candidate_id`, `platform` (default
  `'instagram'`), `post_type`, `image_url`, `caption`, `status`,
  `media_id`, `comment_posted`, `error`, `created_at`, `posted_at`.
- **Windsor.ai é image/story-only** — `create_image_post`/
  `create_comment`/`create_story`, nenhuma action de vídeo/Reels em
  lugar nenhum do código.
- **TikTok/Pinterest/Shopee Video confirmados `NOT_IMPLEMENTED`** — zero
  código, só menção em prosa de SPEC.md como futuro.
- **`FinalizedVideoRendition`** (Skill 14) já define explicitamente:
  "A Skill 17 não recebe `VideoArtifact` cru por padrão — recebe
  `FinalizedVideoRenditionId` + `renditionHash`."
- **Contrato já congelado pela Skill 15** (SPEC.md, verbatim): "ela
  recebe `FinalizedVideoRenditionId`+`renditionHash` +
  `AffiliateLinkArtifactId`+`artifactHash`, e valida mesmo tenant, mesmo
  `publicationTargetKey`, mesma `FinalizedVideoRendition`. Se a Skill 17
  tentar publicar `offer_snapshot.offer_link` diretamente:
  `LEGACY_TRACKING_BYPASS` — inválido no novo pipeline."
- **`SocialPublicationBindingRef`** já definido pela Skill 16 (projeção
  que a Skill 17 precisa satisfazer):
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
  A Skill 16 já registrou: "a Skill 17 não vira dona do binding" (é o
  contrário — a Skill 16 consome uma projeção do binding que a **Skill 17
  produz**) e a nuance real de **`WAIT_FOR_BINDING`**: evidência de
  correlação pode chegar no evento antes do binding estar durável por
  consistência eventual — a Skill 16 espera conforme policy/deadline em
  vez de concluir `UNRESOLVED_NO_BINDING` prematuramente. Isso significa
  que **o timing de escrita do binding pela Skill 17 tem impacto direto**
  na corrida com a Skill 16.
- **Trava `FIRST_REAL_PUBLISH` (Skill 03, já aprovada) precisa ser
  revalidada aqui.** Verbatim: "a trava não é escopada só por
  `approvalGateKey` — é escopada por `tenantId` + `publicationTargetKey`
  ... mesmo que a `ApprovalPolicy` configurada diga `AUTO`/`HYBRID` — o
  `PublishingSafetyGate` (já congelado no projeto, decisão D-012)
  prevalece." A própria Skill 03 já nomeia a Skill 17 como quem "deve
  revalidar a trava `FIRST_REAL_PUBLISH` antes de publicar de fato".

## Decisões fechadas no debate inicial (2026-09-18)

**Garantia central (fechada antes dos contratos):**

> A Skill 17 recebe uma `FinalizedVideoRendition`, um
> `AffiliateLinkArtifact` e um `CreativeCtaIntent` exatos para um único
> `publicationTargetKey`, valida sua lineage e capacidades, revalida a
> autorização da Skill 03 imediatamente antes de qualquer side effect e
> materializa uma única publicação lógica de forma idempotente. Ela
> nunca publica `VideoArtifact` cru, nunca substitui o link afiliado
> pelo `offer_link`, nunca duplica publicação por retry técnico, e só
> cria `SocialPublicationBinding` quando existe evidência externa
> estável suficiente pra correlacionar aquela publicação.

Skill 17 é a fronteira de side effect mais crítica até agora — um erro
de arquitetura aqui deixa de ser só dado errado e vira post duplicado,
link errado, ou correlação impossível pra Skill 16.

**Duas fases distintas, nunca um binding fabricado antecipadamente:**

```text
ANTES DA REDE
PublicationPlan/Reservation
→ identidade lógica congelada, rendition exata, AffiliateLinkArtifact
  exato, CreativeCtaIntent exato, target exato, approval/gates,
  provider request identity

DEPOIS DE CONFIRMAÇÃO DO PROVIDER
ProviderPublicationReceipt → IDs externos reais
→ SocialPublicationBinding canônico
```

Antes da publicação não sabemos legitimamente `providerPublicationId`/
`providerMediaId`/`providerStoryId` — criar um binding "pendente"
usando o mesmo tipo final seria perigoso, porque a Skill 16 já
interpreta esse contrato como evidência de publicação existente. A
janela `WAIT_FOR_BINDING` da Skill 16 existe justamente pra cobrir
"provider já tornou conteúdo visível → evento inbound chega rápido →
commit do binding ainda não terminou" — não tentamos eliminar essa
janela falsificando o binding antes da hora.

**Binding nasce o mais cedo possível após confirmação, na mesma
transação lógica quando possível:** `ProviderPublicationReceipt` +
`PublicationExecution → PROVIDER_CONFIRMED` + `SocialPublicationBinding`
+ `AuditEvent`. Se o provider já criou o post mas o banco cai antes do
binding: **nunca publicar de novo** — reconcile da publicação existente,
materializa o binding depois.

**`PUBLICATION_CONFIRMED` ≠ `CORRELATION_IDENTITY_CONFIRMED`.** Pode
existir publicação confirmada sem binding utilizável — ex.: Windsor diz
só "Post published successfully" sem devolver ID estável. Publicação
ocorreu, mas correlação exata pra Skill 16 fica indisponível. **Nunca
inventamos um `media_id`.**

**O regex atual do Windsor vira detalhe do adapter, não contrato de
domínio.** `raw Windsor response → WindsorPublicationAdapter →
ProviderPublicationReceipt` normalizado, com `identityEvidence`
(`STRUCTURED_PROVIDER_FIELD`/`VERSIONED_PROVIDER_RESPONSE_PARSER`/
`RECONCILED_PROVIDER_LOOKUP`/`UNAVAILABLE`). O regex pode continuar
temporariamente, mas como parser versionado + fixtures reais +
validação forte + resultado explicitamente classificado — nunca regex
espalhado dentro da Skill 17. Se o parser não extrair ID com segurança
→ `identityEvidence = UNAVAILABLE`, nunca "`mediaId` = alguma coisa".

**Capability-aware: separar legado de imagem da capacidade de vídeo,
rigorosamente.** O que existe hoje prova só Windsor+Instagram+static
image feed/story = `EXISTING/REAL`; **não prova** Instagram
video/reel, TikTok video, Pinterest video, Shopee Video — todos
`NOT_IMPLEMENTED`/`UNKNOWN`. Como a nova Skill 17 recebe
`FinalizedVideoRendition`, o fluxo de imagem atual, apesar de real,
**não satisfaz o runtime do novo pipeline de vídeo**:

```text
LEGACY_STATIC_PUBLICATION_PATH → existente, precedente operacional,
                                   fora do novo contrato FinalizedVideoRendition
VIDEO_PUBLICATION_PATH         → ainda NOT_IMPLEMENTED
```

Isso evita marcar a Skill 17 como "Instagram implementado" e depois
descobrir que ela só sabe publicar PNG. Capability granular por
**provider + target + mediaKind**, não um booleano
`instagramPublishing`: `WINDSOR`+`INSTAGRAM_REEL`+`VIDEO` →
`submitPublication NOT_IMPLEMENTED/UNVERIFIED`, enquanto
`WINDSOR`+`INSTAGRAM_FEED`+`IMAGE` → `submitPublication
VERIFIED/IMPLEMENTED`.

**Um target/superfície de publicação por Job — não um mini-orquestrador
multicanal.** Nunca "Job → Instagram + TikTok + Pinterest" — isso
destruiria isolamento de capability/approval/`FIRST_REAL_PUBLISH`/
idempotência/retry/provider failure/publication IDs/binding.
`publicationTargetKey` precisa identificar inequivocamente o destino
operacional (ex. `INSTAGRAM_REEL`/`INSTAGRAM_STORY`/`TIKTOK_VIDEO`, não
só `INSTAGRAM`). Multi-target é responsabilidade da Skill 01
(coordena Jobs separados), nunca da Skill 17.

**Comportamento composto legado (feed + comment + story numa rota) não
é copiado.** Cada superfície é um Job independente com identidade/
approval/provider request/receipt/binding próprios. Publicação
principal e efeito auxiliar (comentário com link) são side effects
**distintos**, não escondidos num `publish()` mágico único — via
`PublicationPlan` multi-step (`CREATE_MEDIA_PUBLICATION`,
`ATTACH_AFFILIATE_LINK_COMMENT`) com idempotência própria por step,
espelhando a separação `PROCESSOR_SUCCEEDED → MATERIALIZED` já usada
antes. Post criado + comment falhou → nunca cria post+comment novos,
só repete/reconcilia o comment. `SocialPublicationBinding` nasce assim
que existe identidade externa estável da publicação **principal** —
não precisa esperar o comentário auxiliar (`PRIMARY_PUBLICATION` vs.
`AUXILIARY_PUBLICATION_EFFECTS` são estados separados; a Skill 16 pode
usar o link via DM mesmo se o comentário auxiliar falhou, porque o
artifact é independente de o comentário ter sido publicado).

**`FIRST_REAL_PUBLISH`: Skill 03 continua autoridade — sem duplicar
lógica.**

> Skill 17 não decide se uma publicação merece aprovação. Ela exige uma
> autorização válida produzida pela autoridade da Skill 03 e a revalida
> imediatamente antes do side effect externo.

Fluxo: `PublicationPlan` exato (PATCH N5, 2026-09-19 — antes
`PublicationIntent`, artifact nunca declarado; ver "Gates V1 e subject
exato por gate", skills/03-gestor-de-aprovacao/SPEC.md) → Skill 03
authority →
`PublicationAuthorizationResolution`
(`AUTHORIZED`/`WAITING_APPROVAL`/`REJECTED`/`BLOCKED`), provando que
`FIRST_REAL_PUBLISH` foi respeitado pra `tenantId`+`publicationTargetKey`
naquele momento — "estava aprovado há 20 minutos" não basta sozinho.
**Corrida real a proteger:** duas primeiras publicações do mesmo target
processadas simultaneamente, ambas concluindo "nenhuma publicação real
ainda" — a trava precisa ser adquirida/revalidada transacionalmente,
nunca `SELECT count(...); if 0`. Se necessário, a Skill 03 recebe um
patch compatível pra produzir essa `PublicationAuthorizationResolution`
— mesmo padrão dos patches anteriores, sem reabrir 3/25.

**Identidade da publicação — `LogicalPublication`.** Retry técnico
nunca significa post novo. Identidade semântica:
`tenantId`+`publicationTargetKey`+`FinalizedVideoRenditionHash`+
`AffiliateLinkArtifactHash`+`CreativeCtaIntentHash`+
`publicationPolicySnapshotHash`+`publicationInstanceKey?` (futuro). Sem
`jobId`/`attemptNumber`/`worker`/timestamp de retry. Attempt 1 timeout →
Attempt 2 encontra a mesma `LogicalPublication` → reconcile, nunca cria
outra postagem cegamente.

**`publicationInstanceKey` finalmente ganha dono: a Skill 17 — mas não
ativado na V1.** Há um problema de ordenação: a Skill 15 gera o link
**antes** da Skill 17 publicar; se a Skill 17 inventasse a instance key
só na hora de publicar, a Skill 15 não conseguiria incorporá-la. V1:
`publicationInstanceKey` ausente/`tracking policy IGNORE` — uma mesma
identidade semântica de rendition+target+link+CTA representa uma única
publicação lógica. Quando quisermos repost consciente do mesmo vídeo no
mesmo target: `publicationInstanceKey` obrigatório, pré-alocado pelo
planejamento de publicação da Skill 01, repassado pra Skill 15 e depois
pra Skill 17 — extensão futura, sem reabrir 15/25 agora.

**`SocialPublicationBinding` é artefato final de correlação, imutável —
nunca um log de execução.** Precisa satisfazer exatamente o contrato já
congelado na Skill 16. Se `providerMediaId` for corrigido após
reconciliação, nunca sobrescrever silenciosamente o binding antigo —
V1 prefere só materializar o binding quando a identity evidence é
considerada válida. Nunca "pegue o `media_id` mais recente desse
produto" — sempre `PublicationExecution → ProviderPublicationReceipt
exato → SocialPublicationBinding exato`.

**`social_posts` classificado `EXISTING/LEGACY/REUSABLE CONCEPTUALLY`**
— sem assumir que o schema atual suporta run/job lineage, rendition
hash, `AffiliateLinkArtifact`, CTA, publication target, provider
response identity, approval, idempotência, ou binding. Sem migrations
agora — decisão de evoluir `social_posts` vs. manter legado + entidades
normalizadas novas fica pra implementação.

**`LEGACY_TRACKING_BYPASS` vira invariante formal da Skill 17.** Valida
`FinalizedVideoRenditionId`/`hash` + `AffiliateLinkArtifactId`/`hash`,
garante mesmo tenant/`publicationTargetKey`/rendition. URL publicável é
sempre `AffiliateLinkArtifact.providerAffiliateUrl` — nunca
`offer_snapshots.offer_link`/`candidate.offerLink`. Qualquer tentativa
do adapter novo de tratar `originUrl` como URL afiliada →
`LEGACY_TRACKING_BYPASS` (integrity violation).

**Onde o link vai não é universal — vem de policy, não de suposição.**
Hoje o legado sempre coloca o link em comentário; isso é comportamento
específico do Instagram legado, não uma verdade universal. Policy de
placement: `AFFILIATE_LINK_PLACEMENT` = `CAPTION`/`FIRST_COMMENT`/
`DESCRIPTION`/`PLATFORM_LINK_FIELD`/`NOT_SUPPORTED` — capability/policy
verificada decide, nunca inventamos agora quais canais suportam quais
placements.

### Divisão de responsabilidades

```text
Skill03 → autorização / FIRST_REAL_PUBLISH
Skill07 → CreativeCtaIntent
Skill14 → FinalizedVideoRendition
Skill15 → AffiliateLinkArtifact
Skill17 → publication planning, provider side effect, reconciliation,
          publication identity, SocialPublicationBinding
Skill16 → consome SocialPublicationBinding, inbound correlation/DM
Skill18/19 → performance
```

Skill 17 nunca: gera vídeo, finaliza vídeo, gera link afiliado,
reescreve CTA, decide aprovação, ou atribui conversão.

### Respostas diretas às 5 perguntas do debate

1. **Binding antes ou depois?** `PublicationPlan`/`Reservation` antes
   da rede; `SocialPublicationBinding` final nasce depois da confirmação
   externa e de identificadores suficientemente confiáveis.
   `WAIT_FOR_BINDING` cobre a janela real — nunca binding fictício
   antecipado.
2. **Capability-aware pra vídeo?** Por provider+`publicationTargetKey`+
   mediaKind+action. Capacidade de imagem atual é legado real, mas não
   prova capacidade de vídeo — runtime de publicação de
   `FinalizedVideoRendition` está hoje `NOT_IMPLEMENTED`.
3. **`FIRST_REAL_PUBLISH`?** Skill 03 continua autoridade; Skill 17
   revalida/enforce a decisão imediatamente antes da rede usando a
   mesma autoridade/contrato — nunca implementação redundante da regra.
   Precisa preservar atomicidade contra duas "primeiras publicações"
   simultâneas.
4. **Um canal por Job?** Sim — mais precisamente, um target/superfície
   de publicação por Job. Multi-target é responsabilidade da Skill 01.
5. **`media_id` via regex?** Vira responsabilidade do provider adapter.
   Preferência por campo estruturado; se só houver linguagem natural,
   parser versionado e validado. Sem identidade confiável, registramos
   publicação sem capacidade de correlação exata — nunca inventamos ID.

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


Decisão adicional antes dos tipos: `LogicalPublicationIdentity` **não**
inclui `providerKey`/`jobId`/`attemptNumber` nem o
`publicationPolicySnapshotHash` inteiro — o provider é meio de
execução, e uma mudança operacional de policy não pode transformar um
retry em "autorização" pra criar outro post. A identidade representa
**o que** pretendemos publicar, não **como** vamos executar.

```text
PublicationInput
→ resolve PublicationPolicy
→ PublicationPlan determinístico
→ publicationSemanticPayloadHash
→ LogicalPublicationIdentity
── fronteira de stage (Ponto N11) ──
→ reservation/execution
→ provider
→ receipt
→ SocialPublicationBinding
```

### Duas stages conceituais: `PLANNING` e `EXECUTION` (PATCH N11, kernel repair pós re-review GPT-6 Astra, 2026-09-19)

**Achado real corrigido aqui**: o gate `FIRST_REAL_PUBLISH` (Skill01,
"Approval subject resolution") exige que o subject exato (`PublicationPlan`)
já exista como `upstreamArtifactRef` da `StageExecution` sendo gated —
mas antes deste patch, o `PublicationPlan` só nascia DENTRO do mesmo
Job/`StageExecution` que o gate estava bloqueando (fluxo original:
"Um Job da Skill 17 trata exatamente um target", sem fronteira entre
planejamento e execução). Isso é circular: o gate precisa do plano pra
aprovar, mas nada materializava esse plano antes do Job gated existir.

**A solução não é** relaxar o algoritmo de subject resolution da
Skill01 pra permitir "buscar o `PublicationPlan` mais recente"
(quebraria a garantia de refs exatas/nunca-latest que R3 formalizou),
**nem** deixar `SkillExecutionAdapter.prepareInvocation()` materializar
artifacts fora do seu escopo (violaria a invariante já congelada no
Ponto A da Skill01 — adapter só transforma, nunca cria efeito/artifact
persistido fora do que o kernel já autorizou). A solução correta é
**separar planejamento de execução em duas stages/`StageExecution`
distintas**, ambas owned pela Skill 17 (não cria Skill nova):

```text
PUBLICATION PLANNING (stage 1)
  → puro/determinístico: PublicationInput → resolve PublicationPolicy
    → PublicationPlan → publicationSemanticPayloadHash →
    LogicalPublicationIdentity
  → PROIBIDO nesta stage: provider mutation, publication reservation,
    publication execution, qualquer external side effect
  → termina com a materialização determinística e durável do
    PublicationPlan — Job desta stage conclui com sucesso nesse ponto

PUBLICATION EXECUTION (stage 2)
  → recebe o PublicationPlan EXATO (publicationPlanId+planHash) como
    upstreamArtifactRef, herdado da StageTransitionResolution normal
    entre stage 1 e stage 2 — nunca "buscar latest"
  → gated por FIRST_REAL_PUBLISH quando aplicável (Skill01/Skill03,
    Ponto S4/F1) — só a partir daqui side effects são permitidos
  → reservation/execution → provider → receipt → SocialPublicationBinding
```

Fluxo completo:

```text
finalized video / CTA / affiliate / target
  → Skill17 stage PLANNING
  → PublicationPlan P (publicationPlanId/planHash)
  → StageTransitionResolution normal (mesmo mecanismo genérico de
    qualquer stage — nenhum caso especial no kernel)
  → Skill17 stage EXECUTION, upstreamArtifactRefs inclui P/planHash
  → Skill01 approval subject resolution encontra P como candidato
    real (já existe, não é mais circular)
  → FIRST_REAL_PUBLISH subject = exact PublicationPlan P
  → ApprovalRequestIntent → APPROVED (P/planHash)
  → Skill17 stage EXECUTION prossegue: revalidação imediatamente
    antes do side effect → reservation/execution/provider
```

Isso preserva todas as decisões já tomadas: `PublicationPlan` continua
representando **O QUE** será publicado; `providerKey`/`providerAccountId`
continuam fora da identidade (**COMO** será executado); o algoritmo de
subject resolution da Skill01 (R3) permanece intacto — "candidatos
SOMENTE das refs canônicas já existentes da StageExecution" volta a
ser verdade de fato, porque agora o `PublicationPlan` realmente existe
antes da stage gated. `prepareInvocation()` continua puro. Mudança
semântica `P1/hash1 aprovado → P2/hash2` continua exigindo nova
aprovação (N8/`ExactApprovalSubject` já garante isso).

A stage `EXECUTION` deve referenciar o `PublicationPlan` exato via
`publicationPlanId`+`publicationPlanHash` (o mesmo par já usado em
`FirstRealPublishClaim`, Skill03) — nunca uma busca por "o plano mais
recente daquele target".

### `PublicationInput`

Consumido pela stage `PLANNING`. Um Job desta stage trata exatamente um target.

```typescript
type PublicationInput = {
  tenantId: string;
  runId: string;

  stageSubjectBindingId: string;

  promotedProductId: string;

  finalizedVideoRenditionId: string; // Ponto S6 (VIDEO_COMPOSITION_V1)
    // — sempre exatamente 1 rendition como asset principal, nunca
    // array de clips pro provider montar
  finalizedVideoRenditionHash: string;

  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3

  publicationTargetKey: string;

  publicationPolicyKey: string;

  resolvedPolicy: {
    policyId: string;
    policyVersion: string;
    policySnapshotHash: string;
    bindingResolutionHash: string;
  };

  publicationInstanceKey?: string;
};
```

Invariantes: `FinalizedVideoRendition.publicationTargetKey =
PublicationInput.publicationTargetKey`;
`AffiliateLinkArtifact.publicationTargetKey` idem;
`AffiliateLinkArtifact.finalizedVideoRenditionId/hash` = rendition
exata do input; `AffiliateLinkArtifact.promotedProductId =
input.promotedProductId`; `CreativeCtaIntent` pertence à mesma lineage
criativa; tenant de todos os artefatos = `Job.tenantId`.
`publicationInstanceKey` **deve estar ausente na V1**, enquanto o modo
de repost independente não estiver ativado.

Hash: `PUBLICATION_INPUT_V1:sha256:<hex>` sobre os hashes/IDs
semânticos exatos e a resolução congelada da policy. Sem `runId`/Job/
Attempt/timestamps.

### `PublicationPolicy`

Governa publicação — não formato técnico de vídeo (isso já foi
resolvido pela Skill 14).

```typescript
type AffiliateLinkPlacement = 'CAPTION' | 'FIRST_COMMENT' | 'DESCRIPTION' | 'PLATFORM_LINK_FIELD' | 'NOT_SUPPORTED';
type PublicationCorrelationRequirement = 'REQUIRE_STABLE_EXTERNAL_ID' | 'ALLOW_PUBLICATION_WITHOUT_CORRELATION_ID';
type AuxiliaryEffectFailurePolicy = 'REQUIRE_SUCCESS' | 'ALLOW_PRIMARY_SUCCESS_WITH_AUXILIARY_FAILURE';

type PublicationPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  publicationTargetKey: string;

  mediaKind: 'VIDEO';

  providerProfileKey: string;

  affiliateLinkPlacement: AffiliateLinkPlacement;

  correlationRequirement: PublicationCorrelationRequirement;

  auxiliaryEffectFailurePolicy: AuxiliaryEffectFailurePolicy;

  approvalEnforcement: {
    authority: 'SKILL03';
    requireImmediatePreSideEffectRevalidation: true;
    enforceFirstRealPublishGate: true;
  };

  artifactRequirements: {
    requireFinalizedVideoRendition: true;
    requireAffiliateLinkArtifact: true;
    requireCreativeCtaIntent: true;

    allowRawVideoArtifact: false;
    allowOriginOfferUrlAsAffiliateUrl: false;
  };

  publicationInstanceMode: 'DISABLED_V1' | 'INCLUDE_WHEN_PRESENT';

  metadataTemplates?: {
    captionTemplateKey?: string;
    captionTemplateVersion?: string;
    captionTemplateHash?: string;

    descriptionTemplateKey?: string;
    descriptionTemplateVersion?: string;
    descriptionTemplateHash?: string;

    affiliateCommentTemplateKey?: string;
    affiliateCommentTemplateVersion?: string;
    affiliateCommentTemplateHash?: string;
  };

  createdAt: string;
};
```

Hash: `PUBLICATION_POLICY_V1:sha256:<hex>` sobre todos os campos
comportamentais. Templates são determinísticos — a Skill 17 não pede a
um LLM pra inventar caption.

### `PublicationPolicyBinding` + resolução congelada

```typescript
type PublicationPolicyBinding = {
  tenantId: string;

  publicationTargetKey: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Mutável — sem hash canônico do binding inteiro.

```typescript
type PublicationPolicyBindingResolution = {
  tenantId: string;

  publicationTargetKey: string;
  policyKey: string;

  policyId: string;
  policyVersion: string;
  policySnapshotHash: string;

  resolvedAt: string;

  bindingResolutionHash: string;
};
```

Hash: `PUBLICATION_POLICY_BINDING_RESOLUTION_V1:sha256:<hex>`. Replay
usa a resolução antiga, nunca o binding atual.

### `PublicationCapabilityStatus`

```typescript
type PublicationCapabilityStatus = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';
```

Nunca um booleano genérico.

### `PublicationProviderCapabilities`

Capability específica pra **provider + `publicationTargetKey` +
mediaKind**.

```typescript
type PublicationProviderCapabilities = {
  providerKey: string;
  capabilityVersion: string;

  publicationTargetKey: string;

  mediaKind: 'VIDEO' | 'IMAGE';

  primaryPublication: {
    submit: PublicationCapabilityStatus;
    supportsRemoteMediaUrl: PublicationCapabilityStatus;
    supportsBinaryUpload: PublicationCapabilityStatus;
    asynchronousProcessing: PublicationCapabilityStatus;
  };

  externalIdentity: {
    returnsStablePublicationId: PublicationCapabilityStatus;
    returnsStableMediaId: PublicationCapabilityStatus;
    returnsStableStoryId: PublicationCapabilityStatus;

    supportsLookupAfterSubmit: PublicationCapabilityStatus;
    supportsLookupByRequestKey: PublicationCapabilityStatus;
  };

  idempotency: {
    supportsIdempotencyKey: PublicationCapabilityStatus;
  };

  auxiliaryEffects: {
    firstComment: PublicationCapabilityStatus;
  };

  affiliateLinkPlacement: {
    caption: PublicationCapabilityStatus;
    firstComment: PublicationCapabilityStatus;
    description: PublicationCapabilityStatus;
    platformLinkField: PublicationCapabilityStatus;
  };

  responseContract: {
    mode: 'STRUCTURED' | 'VERSIONED_TEXT_PARSER' | 'MIXED' | 'UNKNOWN';
    parserKey?: string;
    parserVersion?: string;
  };

  cancellation: {
    supportsDeleteOrUndo: PublicationCapabilityStatus;
  };

  createdAt: string;
};
```

Hash: `PUBLICATION_PROVIDER_CAPABILITIES_V1:sha256:<hex>`. Estado
auditado hoje: Windsor+Instagram+`IMAGE` = precedente operacional real;
novo pipeline `FinalizedVideoRendition`+`VIDEO` =
`NOT_IMPLEMENTED`/`UNVERIFIED` conforme capability específica —
**imagem não promove vídeo pra `VERIFIED`**.

### `PublicationPlanStep` — multi-step formalizado

```typescript
type PublicationEffectClass = 'PRIMARY_PUBLICATION' | 'AUXILIARY_PUBLICATION_EFFECT';
type PublicationEffectKind = 'CREATE_MEDIA_PUBLICATION' | 'ATTACH_AFFILIATE_LINK_COMMENT';

type PublicationPlanStep = {
  stepKey: string;
  stepIndex: number;

  effectClass: PublicationEffectClass;
  effectKind: PublicationEffectKind;

  dependsOnStepKeys: string[];

  requiredCapabilityKeys: string[];

  semanticPayload: {
    media?: {
      finalizedVideoRenditionId: string;
      finalizedVideoRenditionHash: string;
    };

    text?: string;
    textContentHash?: string;

    affiliateLink?: {
      affiliateLinkArtifactId: string;
      affiliateLinkArtifactHash: string;
      providerAffiliateUrl: string;
    };

    creativeCtaIntentRef?: CreativeCtaIntentRef; // Ponto S3
  };

  failurePolicy: 'FAIL_PRIMARY' | 'FOLLOW_AUXILIARY_POLICY';
};
```

V1: exatamente 1 `PRIMARY_PUBLICATION`, 0..N
`AUXILIARY_PUBLICATION_EFFECT` (hoje o único auxiliar comprovado
conceitualmente é `FIRST_COMMENT`).

**Link placement determina o plano.** `affiliateLinkPlacement =
FIRST_COMMENT` → Step 1 `PRIMARY_PUBLICATION`/
`CREATE_MEDIA_PUBLICATION`, Step 2
`AUXILIARY_PUBLICATION_EFFECT`/`ATTACH_AFFILIATE_LINK_COMMENT`
dependendo do Step 1. Se `CAPTION`/`DESCRIPTION`/`PLATFORM_LINK_FIELD`,
o link faz parte do payload semântico do step primário. Nada é
presumido por canal — policy + capability precisam concordar.

### `publicationSemanticPayloadHash`

Peça importante pra não transformar versão operacional de policy em
nova identidade comercial.

Hash: `PUBLICATION_SEMANTIC_PAYLOAD_V1:sha256:<hex>` sobre o conteúdo
externamente relevante: `publicationTargetKey`,
`FinalizedVideoRenditionHash`, `AffiliateLinkArtifactHash`,
`CreativeCtaIntentHash`, affiliate link placement, texto/caption/
description exatos quando existentes, steps semanticamente visíveis em
ordem canônica. Sem `providerKey`/provider profile/capability
snapshot/approval IDs/Job/Attempt/retry policy.

### `PublicationPlan`

```typescript
type PublicationPlan = {
  publicationPlanId: string;

  tenantId: string;

  publicationInputHash: string;

  publicationTargetKey: string;

  publicationPolicyId: string;
  publicationPolicyVersion: string;
  publicationPolicySnapshotHash: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3

  promotedProductId: string;

  steps: PublicationPlanStep[];

  primaryStepKey: string;

  publicationSemanticPayloadHash: string;

  planHash: string;

  createdAt: string;
};
```

Hash: `PUBLICATION_PLAN_V1:sha256:<hex>` sobre `publicationInputHash`,
policy snapshot hash, `steps` ordenados, `primaryStepKey`,
`publicationSemanticPayloadHash`. Sem timestamp/ID do plano.

### `LogicalPublicationIdentity`

```typescript
type LogicalPublicationIdentity = {
  logicalPublicationIdentityId: string;

  tenantId: string;

  publicationTargetKey: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3

  promotedProductId: string;

  publicationSemanticPayloadHash: string;

  publicationInstanceKey?: string;

  identityHash: string;

  createdAt: string;
};
```

Hash: `LOGICAL_PUBLICATION_IDENTITY_V1:sha256:<hex>` sobre `tenantId`,
`publicationTargetKey`, `renditionHash`, `affiliateLinkArtifactHash`,
`creativeCtaIntentRef.creativeCtaIntentHash`, `promotedProductId`,
`publicationSemanticPayloadHash`, `publicationInstanceKey` (só quando
modo futuro permitir). Sem `providerKey`/`providerProfile`/policy
snapshot inteiro/Job/Attempt/approval/timestamp — deliberado.

**Por que provider fica fora da identidade:** se Windsor falhar
ambiguamente e futuramente pudermos reconciliar/failover pra provider
oficial, mesmo conteúdo + mesmo target + mesma publicação pretendida
continua sendo a mesma `LogicalPublication`. Trocar mecanismo de
execução não concede permissão pra duplicar o post.

**Unicidade V1:** `UNIQUE` lógico `(tenantId,
logicalPublicationIdentity.identityHash)`. Nova Attempt da Skill 17
encontra essa identidade — não cria outra só porque `attemptNumber`
mudou, worker reiniciou, provider mudou, ou policy operacional foi
reversionada sem mudar payload semântico.

`LogicalPublicationIdentity → PublicationReservation` existe **antes**
da primeira chamada de rede — protege contra Job A e Job B publicando a
mesma `LogicalPublication` simultaneamente (estrutura completa no bloco
final de idempotência).

### `PublicationExecutionState`

Evitamos `FAILED`/`BLOCKED` aqui — a Skill 02 continua dona do
lifecycle do Job.

```typescript
type PublicationExecutionState =
  | 'PREPARED'
  | 'AUTHORIZATION_VALIDATED'
  | 'PRIMARY_SUBMITTING'
  | 'PRIMARY_RESPONSE_CAPTURED'
  | 'PRIMARY_WAITING_PROVIDER'
  | 'PRIMARY_PUBLISHED'
  | 'AUXILIARY_EXECUTING'
  | 'COMPLETED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';
```

`PRIMARY_PUBLISHED` significa evidência suficiente de que a publicação
principal existe — **não** significa `SocialPublicationBinding` existe,
auxiliares concluíram, ou usuário viu.

### `PublicationStepExecution`

Auxiliares são side effects separados — execution carrega estado por
step.

```typescript
type PublicationStepExecutionState = 'PENDING' | 'SUBMITTING' | 'RESPONSE_CAPTURED' | 'WAITING_PROVIDER' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED';
```

> A definição completa de `PublicationStepExecution` (incluindo
> `externalEffectState`/`submissionSequence`) está consolidada mais
> abaixo, na seção "Patch em `PublicationStepExecution`" — sem essa
> distinção, retry técnico e nova submissão externa ficariam
> indistinguíveis.

`primary CONFIRMED` + `comment REJECTED` não apaga a existência do
post.

### `PublicationExecution`

```typescript
type PublicationExecution = {
  publicationExecutionId: string;

  tenantId: string;
  runId: string;

  jobId: string;
  attemptNumber: number;

  publicationInputHash: string;

  publicationPlanId: string;
  publicationPlanHash: string;

  logicalPublicationIdentityId: string;
  logicalPublicationIdentityHash: string;

  publicationTargetKey: string;

  providerKey: string;
  providerAccountId: string;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerCapabilitiesHash: string;

  // PATCH (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18):
  // obrigatório pra execução real autenticada (não precisa existir em
  // planejamento puramente DRY_RUN sem provider call, se o type já
  // discrimina esse caso). Achado S15 do Fable — a Skill 24 prometia
  // consumo aqui, campo nunca existiu. Imutável depois da chamada
  // externa ocorrer — se outra credencial precisar ser usada, é nova
  // execução autorizada, nunca UPDATE deste campo.
  credentialHandleRef?: IntegrationCredentialHandleRef; // ref cruzada, definida na Skill 24

  publicationPolicyId: string;
  publicationPolicyVersion: string;
  publicationPolicySnapshotHash: string;

  latestAuthorizationResolutionId?: string;
  latestAuthorizationResolutionHash?: string;

  executionContextHash: string;

  state: PublicationExecutionState;

  steps: PublicationStepExecution[];

  socialPublicationBindingId?: string;
  socialPublicationBindingHash?: string;

  createdAt: string;
  updatedAt: string;
};
```

Sem hash do objeto mutável inteiro. Hash do contexto imutável:
`PUBLICATION_EXECUTION_CONTEXT_V1:sha256:<hex>` sobre
`publicationInputHash`, `publicationPlanHash`,
`logicalPublicationIdentityHash`, target, `providerKey`/
`providerAccountId`/provider profile snapshot, provider capabilities
snapshot, publication policy snapshot. Estado/timestamps/receipt atual
não entram.

**Authorization não entra no execution context hash** — a Skill 17
revalida a Skill 03 imediatamente antes do side effect, e essa
autorização pode mudar sem mudar a identidade da publicação.
`latestAuthorizationResolutionId/hash` é evidência operacional
atualizável, fora de `LogicalPublicationIdentity` e
`PUBLICATION_EXECUTION_CONTEXT_V1` — senão uma nova `ApprovalDecision`
criaria artificialmente outra execução semântica.

### `ProviderPublicationReceipt` — imutável, append-only por observação

```typescript
type ProviderPublicationObservationKind = 'SUBMIT_RESPONSE' | 'STATUS_LOOKUP' | 'RECONCILIATION';
type ProviderPublicationStatus = 'ACCEPTED' | 'PUBLISHED' | 'REJECTED';
type PublicationIdentityEvidence = 'STRUCTURED_PROVIDER_FIELD' | 'VERSIONED_PROVIDER_RESPONSE_PARSER' | 'RECONCILED_PROVIDER_LOOKUP' | 'UNAVAILABLE';

type ProviderPublicationReceipt = {
  providerPublicationReceiptId: string;

  tenantId: string;

  publicationExecutionId: string;

  logicalPublicationIdentityId: string;
  logicalPublicationIdentityHash: string;

  stepKey: string;

  providerKey: string;
  providerAccountId: string;

  providerRequestKey: string;
  providerRequestHash: string;

  observationKind: ProviderPublicationObservationKind;

  status: ProviderPublicationStatus;

  providerPublicationId?: string;
  providerMediaId?: string;
  providerStoryId?: string;

  identityEvidence: PublicationIdentityEvidence;

  parser?: {
    parserKey: string;
    parserVersion: string;
  };

  normalizedProviderResponseHash: string;

  receiptHash: string;

  observedAt: string;
};
```

Hash: `PROVIDER_PUBLICATION_RECEIPT_V1:sha256:<hex>` sobre
`logicalPublicationIdentityHash`, `stepKey`, `providerKey`/`account`,
request hash, `observationKind`, `status`, external IDs,
`identityEvidence`, parser key/version quando houver,
`normalizedProviderResponseHash`. `observedAt` não entra no hash
semântico.

**`ACCEPTED` ≠ `PUBLISHED`:** `ACCEPTED` = provider aceitou a operação;
`PUBLISHED` = existe evidência suficiente de que o primary post foi
criado. Se processamento assíncrono: `submit → ACCEPTED →
PRIMARY_WAITING_PROVIDER → lookup/reconcile → PUBLISHED`.

**`PUBLISHED` ≠ correlation identity confirmada.** Receipt pode ser
`status = PUBLISHED` + `identityEvidence = UNAVAILABLE` →
`PUBLICATION_CONFIRMED = true`, `CORRELATION_IDENTITY_CONFIRMED =
false`. Nenhum binding é inventado.

**Regra de validade de identidade externa** pra materializar binding:
`receipt.status = PUBLISHED` + `identityEvidence != UNAVAILABLE` + pelo
menos uma chave externa aceita + policy de correlação satisfeita.
Dependendo do target, `providerPublicationId` OU `providerMediaId` OU
`providerStoryId` pode ser suficiente — não congelamos universalmente
qual campo é obrigatório pra todos os canais; a policy/capability
daquele target decide.

**Regex do Windsor:** se necessário manter temporariamente,
`identityEvidence = VERSIONED_PROVIDER_RESPONSE_PARSER` exige
`parserKey`/`parserVersion`/fixtures reais/validação de formato (ex.:
`WINDSOR_NATURAL_LANGUAGE_MEDIA_ID_PARSER` version 1) — continua sendo
evidência mais frágil que `STRUCTURED_PROVIDER_FIELD`, classificação
permanece no receipt.

### `SocialPublicationBinding` — artefato canônico da Skill 17

```typescript
type SocialPublicationBinding = {
  socialPublicationBindingId: string;

  tenantId: string;

  logicalPublicationIdentityId: string;
  logicalPublicationIdentityHash: string;

  publicationExecutionId: string;

  providerPublicationReceiptId: string;
  providerPublicationReceiptHash: string;

  providerKey: string;
  providerAccountId: string;

  publicationTargetKey: string;

  providerPublicationId?: string;
  providerMediaId?: string;
  providerStoryId?: string;

  correlationIdentityEvidence: 'STRUCTURED_PROVIDER_FIELD' | 'VERSIONED_PROVIDER_RESPONSE_PARSER' | 'RECONCILED_PROVIDER_LOOKUP';

  publicationInstanceKey?: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;

  creativeCtaIntentRef: CreativeCtaIntentRef; // Ponto S3

  promotedProductId: string;

  socialPublicationBindingHash: string;

  // Hash exato da projeção consumida pela Skill 16.
  bindingRefHash: string;

  createdAt: string;
};
```

Hash canônico da entidade: `SOCIAL_PUBLICATION_BINDING_V1:sha256:<hex>`
sobre `logicalPublicationIdentityHash`, provider receipt hash,
`providerKey`/`providerAccountId`/`publicationTargetKey`, IDs externos
presentes, `correlationIdentityEvidence`, `publicationInstanceKey?`
quando existir, `renditionHash`, `affiliateLinkArtifactHash`,
`creativeCtaIntentRef.creativeCtaIntentHash`, `promotedProductId`. Sem binding ID/execution
ID operacional por si só/`createdAt`.

**`bindingRefHash` reutiliza o contrato já aprovado da Skill 16** — a
Skill 17 deriva a projeção exata (`SocialPublicationBinding →
SocialPublicationBindingRef`) e calcula usando o hash já congelado lá,
`SOCIAL_PUBLICATION_BINDING_REF_V1:sha256:<hex>`.
`socialPublicationBindingHash` = identidade/proveniência completa da
entidade Skill 17; `bindingRefHash` = identidade da projeção que a
Skill 16 consome — hashes distintos e legítimos, sem redefinir o
contrato da Skill 16.

**Binding só nasce do step primário.** Um receipt de
`ATTACH_AFFILIATE_LINK_COMMENT` **nunca** cria
`SocialPublicationBinding` — só `effectClass = PRIMARY_PUBLICATION` +
`effectKind = CREATE_MEDIA_PUBLICATION` pode originar binding. Isso
impede um `commentId` de virar acidentalmente o identificador da
publicação que a Skill 16 tenta correlacionar.

**Imutabilidade do binding.** Depois de nascido, `providerMediaId = X`
nunca vira `UPDATE providerMediaId = Y` silenciosamente. Evidência
conflitante → `SOCIAL_PUBLICATION_BINDING_IDENTITY_CONFLICT`. V1 não
sobrescreve — supersession/versionamento fica pra mecanismo futuro (a
menos que decidamos esperar todas as chaves necessárias antes da
primeira materialização).

**Quando correlação é obrigatória:** se
`PublicationPolicy.correlationRequirement = REQUIRE_STABLE_EXTERNAL_ID`
e o post foi publicado mas nenhuma identidade confiável foi obtida:
publicação existe, binding não existe, **Skill 17 não publica de
novo**. Resultado operacional sinaliza
`PUBLICATION_PUBLISHED_CORRELATION_UNAVAILABLE` pra reconciliação/
observabilidade — muito diferente de "publicação falhou", porque
repetir publicação seria perigoso.

**Auxiliary failure não afeta o binding.** `primary PUBLISHED` + binding
criado + `FIRST_COMMENT` falhou → post existe, binding existe,
`AffiliateLinkArtifact` continua válido. Retry atua **só** no auxiliary
step, nunca volta pra `CREATE_MEDIA_PUBLICATION` — separação explícita
em `PublicationExecution.steps`.

**`LEGACY_TRACKING_BYPASS` antes do `PublicationPlan`.** Validar que a
affiliate URL usada no payload = `AffiliateLinkArtifact.providerAffiliateUrl`.
Qualquer caminho tentando fornecer `offer_snapshots.offer_link`/
`candidate.offerLink`/`originUrl` como affiliate URL →
`LEGACY_TRACKING_BYPASS` (integrity violation, nunca fallback).

### Hashes canônicos deste bloco

```text
PUBLICATION_INPUT_V1                        → input exato da Skill 17
PUBLICATION_POLICY_V1                       → comportamento imutável de publicação
PUBLICATION_POLICY_BINDING_RESOLUTION_V1    → resolução congelada do binding mutável
PUBLICATION_PROVIDER_CAPABILITIES_V1        → capacidades específicas provider+target+mediaKind
PUBLICATION_SEMANTIC_PAYLOAD_V1             → conteúdo externamente significativo planejado
PUBLICATION_PLAN_V1                         → plano multi-step determinístico
LOGICAL_PUBLICATION_IDENTITY_V1             → identidade comercial/operacional da publicação pretendida
PUBLICATION_EXECUTION_CONTEXT_V1            → contexto imutável da execução
PROVIDER_PUBLICATION_RECEIPT_V1             → observação imutável do provider
SOCIAL_PUBLICATION_BINDING_V1               → binding canônico produzido pela Skill 17
```

Reutilizado sem redefinir: `SOCIAL_PUBLICATION_BINDING_REF_V1`
(projeção já congelada pela Skill 16). `PublicationPolicyBinding` e
`PublicationExecution` não recebem hash do objeto mutável inteiro.

### Cadeia canônica

```text
FinalizedVideoRendition + AffiliateLinkArtifact + CreativeCtaIntent
→ PublicationInput
→ PublicationPolicy resolution
→ PublicationPlan
→ publicationSemanticPayloadHash
→ LogicalPublicationIdentity
→ PublicationReservation
→ Skill03 revalidation
→ PublicationExecution
→ PRIMARY SUBMIT
→ ProviderPublicationReceipt
→ PUBLISHED?
    ├── não → wait/reconcile/reject
→ external identity confiável?
    ├── não → publicação existe, binding indisponível
→ SocialPublicationBinding
→ Skill16

em paralelo/depois: AUXILIARY steps → comentário/link/etc.
```

> `LogicalPublicationIdentity` identifica a publicação pretendida
> independentemente do mecanismo usado pra executá-la;
> `ProviderPublicationReceipt` prova o que o provider observou;
> `SocialPublicationBinding` só nasce quando essas duas coisas podem
> ser ligadas por uma identidade externa confiável.

## Patch compatível na Skill 03: autorização de publicação

> **`REFERENCE ONLY` — dono canônico é a Skill 03.** A Skill 03 é
> formalmente dona de `PublicationAuthorizationResolutionRef`,
> `FirstRealPublishClaim`, `FirstRealPublishClaimRuntimeState`,
> `FirstRealPublishGateDecision` — ver "Reparo transversal pós-revisão
> Fable → Ponto F1" no `SPEC.md` da Skill 03 pra definição completa dos
> tipos, hashes (`FIRST_REAL_PUBLISH_CLAIM_V1`,
> `FIRST_REAL_PUBLISH_GATE_DECISION_V1`) e `FATAL_ERROR`. Até
> 2026-09-18 o conteúdo só existia aqui (rascunho local, com nomes
> diferentes dos finais) e nunca havia sido escrito no `SPEC.md` real da
> Skill 03 — achado exato B5 da revisão Fable/Claude Fable 5 Max. A
> Skill 17 **não define esses tipos, só consome**; nenhuma definição
> local concorrente permanece neste arquivo.

Fluxo consumido pela Skill 17 (resumo, sem redeclarar tipos; PATCH N5,
2026-09-19 — antes dizia `PublicationIntent`):
`PublicationPlan` exato → se for a primeira publicação real do
`(tenantId, integrationBindingId, publicationChannelKey)`:
`FirstRealPublishClaim` (Skill 03) → aprovação manual (sempre `MANUAL`
pra esse gate, nunca `AUTO`/`HYBRID`) → `PublicationAuthorizationResolutionRef`
com `decision = AUTHORIZED` → `FirstRealPublishGateDecision = AUTHORIZED`
→ só então a Skill 17 pode submeter ao provider. A Skill 17 nunca
calcula essa decisão sozinha — pede à autoridade da Skill 03 "esta
publicação exata pode causar side effect real agora?" e revalida
imediatamente antes da rede. Depois de evidência durável de publicação
confirmada, a Skill 17 reporta de volta e o claim vira `CONFIRMED`
(deixa de exigir `FIRST_REAL_PUBLISH` pra aquele scope); `UNKNOWN` pós-
submit nunca libera o claim para outra publicação virar "a primeira".

## Idempotência

### `PublicationReservation`

```typescript
type PublicationReservationState = 'RESERVED' | 'PRIMARY_EXTERNAL_UNKNOWN' | 'PRIMARY_PUBLISHED' | 'RELEASED';

type PublicationReservation = {
  publicationReservationId: string;

  tenantId: string;

  logicalPublicationIdentityId: string;
  logicalPublicationIdentityHash: string;

  publicationTargetKey: string;

  state: PublicationReservationState;

  reservationVersion: number;

  activePublicationExecutionId?: string;

  primaryProviderPublicationReceiptId?: string;
  primaryProviderPublicationReceiptHash?: string;

  socialPublicationBindingId?: string;
  socialPublicationBindingHash?: string;

  createdAt: string;
  updatedAt: string;
};
```

Unicidade: `UNIQUE` lógico `(tenantId, logicalPublicationIdentityHash)`.
Mutável — sem hash do objeto inteiro.

**Aquisição** (antes de qualquer rede): `LogicalPublicationIdentity →
atomic acquire PublicationReservation` — resultados possíveis
`ACQUIRED_NEW`/`REUSED_EXISTING`/`ALREADY_PUBLISHED`/
`HELD_EXTERNAL_UNKNOWN`, materializados como decisão imutável:

```typescript
type PublicationReservationDecision = {
  publicationReservationDecisionId: string;

  tenantId: string;

  logicalPublicationIdentityHash: string;

  publicationReservationId: string;

  outcome: 'ACQUIRED_NEW' | 'REUSED_EXISTING' | 'ALREADY_PUBLISHED' | 'HELD_EXTERNAL_UNKNOWN';

  observedReservationVersion: number;

  decisionHash: string;

  decidedAt: string;
};
```

Hash: `PUBLICATION_RESERVATION_DECISION_V1:sha256:<hex>` — aqui
`decidedAt` pode entrar, porque a decisão observa um estado mutável em
determinado instante.

**Eixo de idempotência ponta a ponta:** `LogicalPublicationIdentity.identityHash`
— nunca `jobId`/`attemptNumber`/`provider`/`worker`/`cron invocation`.
Mesma `LogicalPublication` → mesma `PublicationReservation` → nunca
primary publish concorrente. Uma nova Attempt técnica reabre a mesma
reservation.

### Patch em `PublicationStepExecution` — distinguir retry de nova submissão

```typescript
type PublicationExternalEffectState = 'NOT_STARTED' | 'SUBMITTING' | 'CONFIRMED' | 'UNKNOWN';

type PublicationStepExecution = {
  stepKey: string;

  state: PublicationStepExecutionState;

  externalEffectState: PublicationExternalEffectState;

  submissionSequence: number;

  providerRequestKey?: string;
  providerRequestHash?: string;

  providerOperationId?: string;

  latestProviderReceiptId?: string;
  latestProviderReceiptHash?: string;
};
```

`submissionSequence` inicia em 1 e **não incrementa por retry de
processo**. Só incrementa quando a submissão anterior conclusivamente
não criou side effect **e** a `RetryPolicy` da Skill 02 autorizou nova
tentativa externa (ex.: `REJECTED` sem post criado + erro retryable +
Skill02 autoriza → nova submissão legítima). Timeout após submit não
incrementa — primeiro reconcile.

Isso evita usar `attemptNumber` como repost: Job Attempt 1
`submissionSequence 1`, processo reinicia, Job Attempt 2 continua
`submissionSequence 1` porque ainda recuperamos a mesma operação
externa. Só evidência de no-effect + nova autorização produz
`submissionSequence 2`.

### `PublicationProviderProfileResolution`

```typescript
type PublicationProviderProfileResolution = {
  tenantId: string;

  providerKey: string;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerAccountId: string;

  credentialScope: 'TENANT_BYO' | 'PLATFORM_MANAGED';

  resolutionHash: string;

  resolvedAt: string;
};
```

Hash: `PUBLICATION_PROVIDER_PROFILE_RESOLUTION_V1:sha256:<hex>`. Sem
credenciais. Replay não volta ao profile atual.

### `PublicationProvider`

```typescript
interface PublicationProvider {
  getCapabilities(): PublicationProviderCapabilities;

  executeStep(input: PublicationProviderStepRequest): Promise<PublicationProviderStepObservation>;

  lookupByRequestKey?(input: PublicationProviderLookupInput): Promise<PublicationProviderStepObservation>;
  getStatus?(input: PublicationProviderStatusInput): Promise<PublicationProviderStepObservation>;
  reconcile?(input: PublicationProviderReconcileInput): Promise<PublicationProviderStepObservation>;
}
```

Não presumimos que Windsor suporte hoje todos esses métodos —
capabilities reais decidem.

```typescript
type PublicationProviderStepRequest = {
  tenantId: string;

  logicalPublicationIdentityHash: string;

  publicationExecutionId: string;

  stepKey: string;
  effectClass: PublicationEffectClass;
  effectKind: PublicationEffectKind;

  submissionSequence: number;

  providerKey: string;
  providerAccountId: string;

  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerRequestKey: string;

  stepSemanticPayloadHash: string;

  media?: {
    finalizedVideoRenditionId: string;
    finalizedVideoRenditionHash: string;
    storageRef: string;
  };

  text?: {
    content: string;
    contentHash: string;
  };

  affiliateLink?: {
    affiliateLinkArtifactId: string;
    affiliateLinkArtifactHash: string;
    providerAffiliateUrl: string;
  };
};
```

Hash: `PUBLICATION_PROVIDER_STEP_REQUEST_V1:sha256:<hex>` sobre o
payload exato, profile snapshot, `submissionSequence`. Sem secrets.

**`providerRequestKey`** representa uma submissão externa lógica
daquele step: derivado de `tenantId`+`providerKey`+
`providerAccountId`+`logicalPublicationIdentityHash`+`stepKey`+
`submissionSequence`+`providerProfileSnapshotHash`. Restart técnico →
mesma key; `submissionSequence` nova → nova key.

**Pre-network rule:** antes de cada side effect, `PublicationStepExecution
.externalEffectState = SUBMITTING` + `providerRequestKey`/`hash`
persistidos + `PublicationExecution` persistido + `leaseFence` Skill02
validado + (pro primary) `PublicationAuthorizationResolutionRef.decision =
AUTHORIZED` (Skill 03) revalidada imediatamente antes da rede. Só depois
`provider.executeStep()`.

**Granularidade factual não é um booleano global da Skill 02.** A
Skill 17 tem vários side effects por Attempt (primary, comment, outros
futuros) — a granularidade vive em
`PublicationStepExecution.externalEffectState`. Skill 02 continua dona
do Job/leases/Attempts/RetryPolicy. Se qualquer step estiver `UNKNOWN`,
a Skill 17 reporta `EXTERNAL_STATE_UNKNOWN` ao JobManager, sem tentar
representar múltiplas operações num único campo global.

### `PublicationProviderStepObservation`

```typescript
type PublicationProviderStepObservation = {
  status: 'ACCEPTED' | 'PUBLISHED' | 'REJECTED';

  providerOperationId?: string;

  providerPublicationId?: string;
  providerMediaId?: string;
  providerStoryId?: string;

  identityEvidence: PublicationIdentityEvidence;

  parser?: {
    parserKey: string;
    parserVersion: string;
  };

  normalizedResponseHash: string;

  rejectionCode?: string;
};
```

Depois materializamos o `ProviderPublicationReceipt` imutável já
definido.

## Replay por estado/step

```text
PRIMARY_PUBLISHED
  → nunca submit primary novamente; binding existe → reutiliza; binding
    não existe → tenta materializar/reconciliar, sem novo post

PRIMARY_RESPONSE_CAPTURED
  REJECTED → classificar rejeição, zero nova rede até RetryPolicy decidir
  ACCEPTED → WAITING_PROVIDER/lookup
  PUBLISHED → PRIMARY_PUBLISHED
  (nenhum novo submit)

PRIMARY_WAITING_PROVIDER
  → getStatus/lookup/reconcile, mesma submissionSequence, mesma Attempt
    lógica externa — nunca cria novo post

PRIMARY_SUBMITTING ambíguo (pós crash/timeout)
  supportsLookupByRequestKey → lookup
  supportsIdempotencyKey VERIFIED → retransmissão da MESMA request pode
    ser permitida
  supportsReconcile → reconcile
  nenhum confiável → PublicationReservation → PRIMARY_EXTERNAL_UNKNOWN,
    step.externalEffectState → UNKNOWN, Job → BLOCKED/EXTERNAL_STATE_UNKNOWN
    (nunca failover pra outro provider nessa condição)
```

**Failover de provider é conceitualmente possível** (provider ficou
fora da `LogicalPublicationIdentity`), mas só quando o provider
anterior está comprovadamente `NO_SIDE_EFFECT`. Se `UNKNOWN`, failover
é proibido — senão "Windsor talvez publicou + provider oficial também
publica = duplicação". `provider-independent identity` não significa
`provider failover irrestrito`.

**Replay dos auxiliares:** cada step tem identidade própria
(`LogicalPublication`+`stepKey`+`submissionSequence`). `primary =
CONFIRMED`, `comment = SUBMITTING`, crash → replay: primary intocado,
só comment é reconciliado. Nunca reinicia o `PublicationPlan` do zero.

**Auxiliary `REJECTED`:** se `auxiliaryEffectFailurePolicy =
ALLOW_PRIMARY_SUCCESS_WITH_AUXILIARY_FAILURE`, resultado pode ser
`primary PUBLISHED` + `binding AVAILABLE` + `auxiliary FAILED/REJECTED`
sem tornar a publicação inexistente. Se `REQUIRE_SUCCESS`, o Job pode
não ser considerado completamente sucedido, mas o primary continua
publicado — retry futuro age só no auxiliary.

### `PublicationOutcome` — resultado factual, não só `JobStatus`

```typescript
type PublicationOutcome = 'PUBLISHED_WITH_BINDING' | 'PUBLISHED_WITHOUT_CORRELATION' | 'PRIMARY_PUBLISHED_AUXILIARY_INCOMPLETE' | 'NOT_AUTHORIZED' | 'CANCELLED_BEFORE_PRIMARY';
```

Job pode terminar problemático, mas o post pode existir — `JobStatus`
sozinho não descreve o mundo externo.

**`PUBLISHED_WITHOUT_CORRELATION`:** `primary PUBLISHED` + identity
evidence insuficiente → `PUBLICATION_PUBLISHED_CORRELATION_UNAVAILABLE`.
Se policy `ALLOW_PUBLICATION_WITHOUT_CORRELATION_ID` → `PublicationOutcome
= PUBLISHED_WITHOUT_CORRELATION`, sem binding — a Skill 16 não terá
`RESOLVED_EXACT` por esse caminho.

**Se policy exige stable ID** (`REQUIRE_STABLE_EXTERNAL_ID`) e o post
existe mas identidade confiável não foi obtida: não republicar — a
Skill 17 entra em `PUBLICATION_PUBLISHED_CORRELATION_UNAVAILABLE` e
tenta só lookup/reconciliation; sem capability de recuperar identidade
→ Job `BLOCKED`/`EXTERNAL_STATE_UNKNOWN` (side effect real existe, mas
não podemos concluir o estado correlacionável).

### Commit do `SocialPublicationBinding`

Assim que `primary PUBLISHED` + `identityEvidence` válida, idealmente
numa única transação: `ProviderPublicationReceipt` persistido +
`PublicationExecution PRIMARY_PUBLISHED` + `PublicationReservation
PRIMARY_PUBLISHED` + `FirstRealPublishClaim CONFIRMED` (Skill 03, quando
aplicável) + `SocialPublicationBinding` + `AuditEvent`. Se a Skill 03 estiver
fisicamente em outro boundary de persistência, sem fingir transação
distribuída — outbox/idempotent command
(`FIRST_REAL_PUBLISH_CONSUME_REQUEST`), Skill 03 consome
idempotentemente pelo receipt hash. Regra semântica permanece a mesma.

**PATCH (Ponto S9 — reparo transversal pós-revisão Fable, 2026-09-18).**
Skill 17 é a **única writer V1** de
`ProductUsageEvidence.usageKind = 'PRIMARY_PUBLISHED'`
(contrato/owner: `04-descoberta-de-produtos/SPEC.md`, hash
`PRODUCT_USAGE_EVIDENCE_V1`) — Skill 17 nunca redeclara o tipo, só
referencia. Materializa a evidência no mesmo commit acima, quando
`primary PUBLISHED` + `identityEvidence` válida + classificação
`PRIMARY` (nunca `SECONDARY`/`REPOST`/`DERIVATIVE`/`TEST` em V1).
`evidenceRef` = exact `ProviderPublicationReceipt` ref
(`providerPublicationReceiptId` + `receiptHash`). `usedAt` deriva de
`ProviderPublicationReceipt.observedAt` (timestamp real da observação
que confirmou a publicação) — nunca
`submittedAt`/`plannedAt`/`approvedAt`/`requestSentAt`. **Nunca**
emitido em `SUBMITTING`/provider `ACCEPTED`/`externalPublicationId` não
confirmado/timeout/`externalEffectState=UNKNOWN` — preserva
`ACCEPTED ≠ PUBLISHED ≠ confirmado`. Nunca emite `MATERIALIZED` (fora
da matriz de writers da Skill 04) — a evidência de publicação já é mais
forte, não "preenche buraco" com uma linha sintética adicional.
`FirstRealPublishClaim CONFIRMED` (acima) e
`ProductUsageEvidence.PRIMARY_PUBLISHED` podem compartilhar o mesmo
evento/fato externo de confirmação como provenance, mas são fatos de
**dimensões diferentes** — `FirstRealPublishClaim` é controle de
segurança/governança da integração (Skill 03/Ponto S1);
`ProductUsageEvidence` é o papel daquela publicação na
produção/campanha (Skill 04). Nunca usar o `FirstRealPublishClaim` em
si como prova de publicação para o S9 — usar o
`ProviderPublicationReceipt` real. Sem rollback: se a publicação
externa aconteceu mas falha local ocorreu antes de registrar a
evidência, nunca republicar só pra gerar `ProductUsageEvidence` —
primeiro reconciliar o estado de publicação, depois materializar a
partir do fato confirmado existente.

**A corrida `WAIT_FOR_BINDING` da Skill 16 permanece — de propósito.**
Provider torna post visível → pessoa responde imediatamente → inbound
chega → binding ainda não commitou → `Skill16 → WAIT_FOR_BINDING`. A
Skill 17 não tenta criar binding antes da confirmação só pra eliminar
essa janela.

**PATCH (Ponto S7 — reparo transversal pós-revisão Fable, 2026-09-18,
`EXECUTION_RUNTIME_V1`, contrato completo em
`contracts/EXECUTION-RUNTIME.md`).** O `SkillJobHandler` de publicação
(submissão ao provider, aguardar `ProviderPublicationReceipt`) executa
exclusivamente em `VIDEO_MACHINE_WORKER_V1` (`DURABLE_WORKER`) — nunca
na Vercel. O checkpoint `SUBMITTING`-antes-da-network já usado no fluxo
de publicação é exatamente o padrão `BEGIN → SUBMITTING checkpoint →
AuditEvent → COMMIT → NETWORK → BEGIN → observed outcome checkpoint →
AuditEvent → COMMIT` formalizado pelo S7 — nunca uma transaction aberta
durante a chamada ao provider. Se o provider suportar webhook de
confirmação de publicação, esse webhook (`CONTROL_PLANE`) só persiste
evidence/evento durável — quem confirma o settlement é sempre o worker,
nunca a rota de webhook diretamente (evita duas authorities
concorrendo pelo mesmo `Job`).

### Unicidade dos IDs externos

`UNIQUE` conceitual: `tenantId`+`providerKey`+`providerAccountId`+
`externalIdentityKind`+`externalIdentityValue` pros IDs usados como
chave de correlação. `providerMediaId X` já pertence ao binding A e
execução B tenta reivindicá-lo → `SOCIAL_PUBLICATION_EXTERNAL_ID_CONFLICT`
(FATAL_ERROR).

## Cancelamento

**Antes do primary side effect** (`PREPARED`/`AUTHORIZATION_VALIDATED`,
nenhum step `SUBMITTING`): `→ CANCELLED`, reservation pode ser
`RELEASED`, `FIRST_REAL` gate claim pode ser `RELEASED` (se Skill 03
confirmar liberação segura). Resultado: `CANCELLED_BEFORE_PRIMARY`.

**Durante `PRIMARY_SUBMITTING`:** não significa "não publique" (request
pode já ter saído). `CANCEL_REQUESTED → reconcile`; se provider tem
cancelamento verificado e operação ainda não publicou, pode solicitar
cancelamento idempotente — só se capability permitir. Se não sabemos →
external unknown, gate permanece segurado.

**Depois de `PUBLISHED`:**

> Cancelar a execução não apaga uma publicação já criada.

V1: `primary PUBLISHED` + `CANCEL` → não executa novos auxiliary
effects, mas mantém primary post/receipt/binding/`FIRST_REAL` gate
consumido.

```typescript
type PublicationCancellationDisposition = 'NOT_REQUESTED' | 'CANCELLED_BEFORE_PRIMARY' | 'PRIMARY_PRESERVED_AUXILIARIES_STOPPED' | 'EXTERNAL_STATE_UNKNOWN';
```

Adicionado ao `PublicationExecution`: `cancellationDisposition`.

**Sem auto-delete na V1.** Mesmo com `supportsDeleteOrUndo = VERIFIED`,
não usamos `DELETE` como implementação de `CANCEL` — excluir conteúdo
público é outro side effect com riscos próprios. Futuramente:
`DeletePublicationIntent` com approval/idempotency/audit próprios, sem
misturar com cancelamento de Job.

**Semântica de `CANCELLED` (patch):** `CANCELLED` só significa "nenhum
primary side effect ocorreu" — depois de `primary PUBLISHED`, a
execution nunca vira `CANCELLED`; termina `COMPLETED` +
`cancellationDisposition = PRIMARY_PRESERVED_AUXILIARIES_STOPPED`. Isso
evita um registro dizendo "cancelled" pra algo que continua público.

## Erros

### `FATAL_ERROR` (32 códigos)

```text
PUBLICATION_TENANT_MISMATCH
PUBLICATION_PROVIDER_ACCOUNT_TENANT_MISMATCH

PUBLICATION_RENDITION_NOT_FOUND
PUBLICATION_RENDITION_HASH_MISMATCH
PUBLICATION_RENDITION_TARGET_MISMATCH

PUBLICATION_AFFILIATE_LINK_NOT_FOUND
PUBLICATION_AFFILIATE_LINK_HASH_MISMATCH
PUBLICATION_AFFILIATE_LINK_LINEAGE_MISMATCH

PUBLICATION_CTA_INTENT_NOT_FOUND
PUBLICATION_CTA_INTENT_HASH_MISMATCH
PUBLICATION_CTA_LINEAGE_MISMATCH
```

**PATCH (Ponto S3).** Com `creativeCtaIntentRef` (parent
`CreativeDirectionResult` exato + `creativeCtaIntentHash`) substituindo
o par solto anterior, os 3 códigos já existentes continuam cobrindo
tudo sem alteração de significado: `PUBLICATION_CTA_INTENT_NOT_FOUND`
(parent não resolve), `PUBLICATION_CTA_INTENT_HASH_MISMATCH` (subhash
recomputado diverge do `ref`, ou `parent.creativeCtaIntentHash` diverge
do `ref`), `PUBLICATION_CTA_LINEAGE_MISMATCH` (CTA de subject/produto
diferente do que está sendo publicado). **0 `FATAL_ERROR` novos.**

```text

PUBLICATION_POLICY_NOT_FOUND
INVALID_PUBLICATION_POLICY

PUBLICATION_PROVIDER_PROFILE_REFERENCE_CORRUPT
INVALID_PUBLICATION_PROVIDER_CAPABILITIES

PUBLICATION_PLAN_INTEGRITY_VIOLATION
PUBLICATION_SEMANTIC_PAYLOAD_CONFLICT

LOGICAL_PUBLICATION_IDENTITY_CONFLICT

PUBLICATION_RESERVATION_KEY_CONFLICT
PUBLICATION_RESERVATION_STATE_CORRUPT

PUBLICATION_AUTHORIZATION_INTEGRITY_VIOLATION

LEGACY_TRACKING_BYPASS

PUBLICATION_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT
PUBLICATION_PROVIDER_RESPONSE_CONFLICT
PUBLICATION_PROVIDER_RESPONSE_INVALID
PUBLICATION_PROVIDER_PARSER_INVALID

PUBLICATION_RECEIPT_CONFLICT

SOCIAL_PUBLICATION_BINDING_LINEAGE_MISMATCH
SOCIAL_PUBLICATION_BINDING_IDENTITY_CONFLICT
SOCIAL_PUBLICATION_EXTERNAL_ID_CONFLICT

PUBLICATION_INVALID_STATE_TRANSITION
PUBLICATION_STEP_STATE_CORRUPT
```

### `RETRYABLE_ERROR`

Só quando repetir aquela fase é seguro:

```text
PUBLICATION_PROVIDER_TEMPORARILY_UNAVAILABLE
PUBLICATION_PROVIDER_RATE_LIMITED

PUBLICATION_PROVIDER_LOOKUP_TRANSIENT_ERROR
PUBLICATION_PROVIDER_STATUS_TRANSIENT_ERROR
PUBLICATION_PROVIDER_RECONCILE_TRANSIENT_ERROR

PUBLICATION_BINDING_PERSISTENCE_TRANSIENT_ERROR

PUBLICATION_FIRST_REAL_GATE_SYNC_TRANSIENT_ERROR

TRANSIENT_DATASTORE_ERROR
```

Uma falha de `executeStep()` só é tratada como retryable de submit se
houver prova de `NO_SIDE_EFFECT`. Caso contrário, não é retry simples.

### `BLOCKED`

```text
Configuração/capability:
PUBLICATION_POLICY_NOT_CONFIGURED               → POLICY_BLOCKED
PUBLICATION_PROVIDER_PROFILE_NOT_CONFIGURED      → POLICY_BLOCKED
PUBLICATION_VIDEO_CAPABILITY_NOT_IMPLEMENTED     → POLICY_BLOCKED
PUBLICATION_CAPABILITY_UNVERIFIED                → POLICY_BLOCKED
PUBLICATION_TARGET_UNSUPPORTED                   → POLICY_BLOCKED
PUBLICATION_LINK_PLACEMENT_UNSUPPORTED           → POLICY_BLOCKED
PUBLICATION_PROVIDER_AUTHORIZATION_REVOKED       → POLICY_BLOCKED

Ambiguidade externa:
PUBLICATION_EXTERNAL_STATE_UNKNOWN               → EXTERNAL_STATE_UNKNOWN
PUBLICATION_PUBLISHED_CORRELATION_UNAVAILABLE
  (quando stable ID obrigatório e não reconciliável) → EXTERNAL_STATE_UNKNOWN
```

### O que NÃO é erro nem `BLOCKED`

Resultados/controle normais: `WAITING_APPROVAL`;
`WAITING_FIRST_REAL_PUBLISH_GATE`; `NOT_AUTHORIZED`/approval
`REJECTED`; `PUBLISHED_WITHOUT_CORRELATION` quando policy permite;
`PRIMARY_PUBLISHED_AUXILIARY_INCOMPLETE` quando policy permite;
`CANCELLED_BEFORE_PRIMARY`. Não transformamos decisão de negócio em
falha técnica.

### Capability atual da Skill 17 — estado honesto

```text
LEGACY_STATIC_PUBLICATION_PATH (Windsor + Instagram + IMAGE) → EXISTING/REAL
VIDEO_PUBLICATION_PATH (FinalizedVideoRendition)              → NOT_IMPLEMENTED
TikTok video / Pinterest video / Shopee Video                 → NOT_IMPLEMENTED
```

A spec pode ser aprovada sem afirmar runtime de vídeo que não existe.

## Multi-tenant

Fonte de autoridade: `trustedTenantId = Job.tenantId`. Precisam
corresponder: `PublicationInput`, `StageSubjectBinding`,
`FinalizedVideoRendition`, `AffiliateLinkArtifact`, `CreativeCtaIntent`,
`PublicationPolicyBinding`/`Policy`,
`PublicationProviderProfileResolution`, `LogicalPublicationIdentity`,
`PublicationReservation`, `PublicationExecution`,
`PublicationAuthorizationResolution`, `ProviderPublicationReceipt`,
`SocialPublicationBinding`. Divergência → `PUBLICATION_TENANT_MISMATCH`
(FATAL_ERROR + security AuditEvent).

**Provider account precisa pertencer ao tenant/contexto autorizado.** A
futura Skill 24 será autoridade dessa associação; até lá,
`providerKey`+`providerAccountId` → profile resolution → tenant
authorization. Nunca escolher provider account por
`publicationTargetKey` sozinho, última conta usada, ou default global
implícito.

**Conta compartilhada `PLATFORM_MANAGED`:** mesmo que fisicamente vários
tenants usem a mesma integração, `LogicalPublicationIdentity`/
`Reservation`/`Execution`/`Binding`/`AffiliateLinkArtifact` continuam
tenant-scoped — sem dedupe cross-tenant.

**External IDs não pesquisados globalmente:** ao correlacionar
`providerMediaId = 123`, a chave de lookup interna carrega
`tenantId`+`providerKey`+`providerAccountId` (ou chave equivalente que
preserve o account scope) — mantém compatibilidade com a Skill 16.

## Observabilidade

### Logs

Por tick/step: `tenantId`, `runId`, `jobId`, `attemptNumber`,
`publicationTargetKey`, `logicalPublicationIdentityId`/`hash`,
`publicationReservationId`/`reservationState`/`reservationVersion`,
`publicationPlanId`/`hash`/`publicationSemanticPayloadHash`,
`primaryStepKey`/`currentStepKey`/`effectClass`/`effectKind`,
`stepState`/`externalEffectState`/`submissionSequence`,
`providerKey`/`providerAccountId`/`providerProfileVersion`/
`providerProfileSnapshotHash`/`providerCapabilitiesHash`,
`providerRequestKey?`/`hash?`, `providerOperationId?`,
`latestReceiptId?`/`hash?`/`providerStatus?`/`identityEvidence?`,
`authorizationDecision`/`approvalResolutionHash?`/
`firstRealPublishClaimId?`, `socialPublicationBindingId?`/`hash?`,
`publicationOutcome?`, `cancellationDisposition`, `durationMs`,
`errorCode?`. Não logar: `providerAffiliateUrl` completo, signed media
URL, access token, `Authorization`, raw Windsor response inteira,
caption/texto bruto completo por padrão.

### `AuditEvent`

`LogicalPublicationIdentity` criada; `PublicationReservation`
`ACQUIRED`/`REUSED`/`PRIMARY_EXTERNAL_UNKNOWN`/`PRIMARY_PUBLISHED`;
`FIRST_REAL` authorization obtida/waiting/consumed/released; primary
`PREPARED→SUBMITTING`/response captured/`ACCEPTED`/`PUBLISHED`;
`SocialPublicationBinding` criado; auxiliary
`SUBMITTING`/`CONFIRMED`/`REJECTED`; external state unknown; cancel
before/after primary; `LEGACY_TRACKING_BYPASS`; external ID conflict;
provider request conflict; receipt conflict; tenant mismatch. Não criar
`AuditEvent` a cada poll.

### Métricas

```text
publication_logical_identity_total
publication_reservation_acquired_total
publication_reservation_reused_total

publication_primary_submit_total
publication_primary_accepted_total
publication_primary_published_total
publication_primary_external_unknown_total

publication_auxiliary_submit_total
publication_auxiliary_confirmed_total
publication_auxiliary_rejected_total

first_real_publish_gate_acquired_total
first_real_publish_gate_wait_total
first_real_publish_gate_consumed_total
first_real_publish_gate_released_total
first_real_publish_gate_external_unknown_total

social_publication_binding_created_total
publication_published_without_correlation_total
publication_identity_evidence_total{structured/parser/reconciled/unavailable}

publication_capability_blocked_total
publication_video_not_implemented_total
publication_target_unsupported_total
publication_link_placement_unsupported_total

publication_replay_reuse_total
publication_primary_duplicate_prevented_total
publication_provider_reconcile_total
publication_request_payload_conflict_total
publication_external_id_conflict_total
```

`first_real_publish_gate_*` serão úteis pra testar D-012 de verdade.
Não usar `providerMediaId` como label. `publication_primary_duplicate_prevented_total`
é especialmente importante nesta Skill. Separar claramente
`legacy_image_publication` de `video_publication` nos dashboards.

**Sem métrica comercial aqui:** a Skill 17 não calcula CTR/conversion/
ROAS/revenue attributed/best creative (isso é Skills 18/19) — mede
"publicou? onde? qual ID? duplicou? conseguiu correlacionar?".

## Plano de testes

100 casos críticos, em 10 blocos de 10.

**1-10 — Input e lineage:** (1) rendition inexistente → fatal. (2)
rendition hash divergente → fatal. (3) rendition target divergente →
fatal. (4) `AffiliateLinkArtifact` inexistente → fatal. (5) affiliate
artifact hash divergente → fatal. (6) affiliate artifact ligado a outra
rendition → fatal. (7) `promotedProductId` divergente → fatal. (8)
`CreativeCtaIntent` inexistente → fatal. (9) CTA hash/lineage
divergente → fatal. (10) qualquer upstream de outro tenant → fatal.

**11-20 — Policy/capability:** (11) `PublicationPolicyBinding` ausente
→ policy blocked. (12) binding aponta pra policy inexistente → fatal.
(13) policy estruturalmente inválida → fatal. (14) provider profile
ainda não configurado → blocked. (15) profile resolution congelada é
reutilizada em replay. (16) capability `VIDEO = NOT_IMPLEMENTED` →
blocked. (17) capability `UNVERIFIED` → blocked. (18) target
`UNSUPPORTED` → blocked. (19) link placement não suportado → blocked.
(20) capability `IMAGE` real não promove `VIDEO` pra `VERIFIED`.

**21-30 — Plan/identity:** (21) mesmo input/policy → mesmo
`PublicationPlan` hash. (22) steps ordenados deterministicamente. (23)
exatamente um `PRIMARY`. (24) `FIRST_COMMENT` gera auxiliary dependente
do primary. (25) `CAPTION` incorpora link no payload primary. (26)
payload usando `originUrl` → `LEGACY_TRACKING_BYPASS`. (27)
`providerAffiliateUrl` exata passa. (28) mudança puramente operacional
de provider não muda `LogicalPublicationIdentity`. (29) Attempt
diferente não muda `identityHash`. (30) mudança semântica real no
payload muda `identityHash`.

**31-40 — Reservation/concorrência:** (31) primeira execução adquire
reservation. (32) replay reutiliza reservation. (33) duas execuções
concorrentes da mesma identity → uma reservation. (34) nova Attempt não
cria segunda reservation. (35) reservation `PUBLISHED` impede novo
primary submit. (36) reservation `EXTERNAL_UNKNOWN` impede nova
submissão. (37) reservation corrupta → fatal. (38) `identityHash`
conflitante na mesma key → fatal. (39) reservation release só ocorre
com no-side-effect comprovado. (40) provider failover é proibido
enquanto reservation está external unknown.

**41-50 — `FIRST_REAL_PUBLISH`:** (41) primeira publicação exige
autoridade Skill 03. (42) `AUTO`/`HYBRID` não bypassa D-012. (43) duas
primeiras publicações concorrentes → apenas uma adquire gate. (44)
outra recebe `WAITING_FIRST_REAL_PUBLISH_GATE`. (45) `AUTHORIZED` é
revalidado imediatamente antes da rede. (46) approval `REJECTED` →
nenhuma chamada ao provider. (47) gate não é consumido em `ACCEPTED`.
(48) gate é consumido somente em `PUBLISHED`. (49) rejection conclusiva
sem side effect libera gate. (50) submit ambíguo mantém gate
`HELD_EXTERNAL_UNKNOWN`.

**51-60 — Provider submit/replay:** (51) step `SUBMITTING` persiste
antes da rede. (52) `providerRequestKey`/`hash` persistem antes da
rede. (53) restart técnico reutiliza `submissionSequence` e request
key. (54) request key igual + payload diferente → fatal. (55) response
`ACCEPTED` vira receipt imutável. (56) `ACCEPTED` não vira `PUBLISHED`.
(57) `RESPONSE_CAPTURED` é reutilizada sem novo submit. (58)
`WAITING_PROVIDER` só faz lookup/status. (59) timeout pós-submit usa
reconcile/idempotency. (60) sem reconcile/idempotency →
`EXTERNAL_STATE_UNKNOWN`, nunca submit cego.

**61-70 — Submission sequence/auxiliares:** (61) nova Attempt sozinha
não incrementa `submissionSequence`. (62) retry autorizado após
no-effect comprovado incrementa sequence. (63) nova sequence gera nova
`providerRequestKey`. (64) primary `PUBLISHED` nunca ganha nova
sequence. (65) auxiliary possui estado independente. (66) comment falha
→ primary não é repetido. (67) auxiliary retry atua só naquele step.
(68) `ALLOW_PRIMARY_SUCCESS_WITH_AUXILIARY_FAILURE` preserva primary.
(69) `REQUIRE_SUCCESS` pode manter Job incompleto sem apagar fato do
primary. (70) receipt auxiliar nunca cria `SocialPublicationBinding`.

**71-80 — Receipt/binding/correlação:** (71) `PUBLISHED` + structured
external ID → binding. (72) `PUBLISHED` + parser versionado válido →
binding. (73) `PUBLISHED` + reconciled lookup → binding. (74)
`PUBLISHED` + `UNAVAILABLE` → nenhum binding. (75)
`REQUIRE_STABLE_EXTERNAL_ID` + unavailable → reconcile/block, sem
republish. (76) `ALLOW_WITHOUT_CORRELATION` →
`PUBLISHED_WITHOUT_CORRELATION`. (77) binding só usa receipt do
`PRIMARY`. (78) binding satisfaz exatamente `SocialPublicationBindingRef`
da Skill 16. (79) external ID já pertencente a outro binding → fatal.
(80) binding existente nunca é sobrescrito silenciosamente.

**81-90 — Cancelamento:** (81) cancel antes de qualquer primary effect
→ `CANCELLED_BEFORE_PRIMARY`. (82) cancel antes do submit pode liberar
reservation. (83) cancel antes do submit pode liberar `FIRST_REAL` gate
de forma segura. (84) cancel durante `SUBMITTING` exige reconcile. (85)
timeout + cancel não permite assumir que post não existe. (86) cancel
capability inexistente não gera request inventado. (87) primary
`PUBLISHED` + cancel preserva post. (88) primary `PUBLISHED` + cancel
pula auxiliares ainda não iniciados. (89) execution não vira `CANCELLED`
depois de primary `PUBLISHED`. (90) cancel nunca auto-executa `DELETE`
na V1.

**91-100 — Multi-tenant/observabilidade/integridade:** (91)
`Job.tenantId` é autoridade inicial. (92) provider account incompatível
com tenant → fatal. (93) plataforma shared account não compartilha
reservations entre tenants. (94) mesmo `providerMediaId` em outro
account scope não colide indevidamente. (95) lookup externo sempre
inclui provider/account scope. (96) logs não expõem
`providerAffiliateUrl` completo por padrão. (97) logs não expõem signed
media URL/secrets. (98) `PRIMARY_PUBLISHED` gera `AuditEvent` lógico
uma única vez. (99) `ACCEPTED` nunca alimenta métrica `published`.
(100) retry técnico comprovadamente não aumenta contador de publicação
primary real.

### Testes futuros reais do primeiro provider de vídeo

Quando houver capability de vídeo real: `DRY_RUN → payload validation →
MANUAL_APPROVAL → FIRST_REAL_PUBLISH gate → controlled publish →
capture provider IDs → SocialPublicationBinding → confirm post/permalink`.
Testes de falha artificial em cada ponto (após reservation/
authorization/`SUBMITTING`/provider aceitar/`PUBLISHED`/antes do
binding/após binding/antes do auxiliary) — em cada reinício, provar no
máximo 1 primary publication real.

**Teste real crítico de Windsor atual:** capturar respostas Windsor
reais → testar parser versionado → provar quando "Media id: 123." é
extraído → provar rejeição de strings ambíguas → provar que o parser
nunca inventa ID. Define se o precedente atual pode ser reutilizado no
adapter futuro.

**Teste crítico Skill 16 ↔ Skill 17:** Skill 17 publica → primary
`PUBLISHED`; antes do binding commit, simular inbound → Skill 16
`WAIT_FOR_BINDING`; depois do binding, retry resolution →
`RESOLVED_EXACT` → `AffiliateLinkArtifact` correto. Prova exatamente a
corrida que motivou o contrato.

### Hashes novos deste bloco

```text
PUBLICATION_RESERVATION_DECISION_V1       → decisão imutável de aquisição/reuso da reservation
PUBLICATION_PROVIDER_PROFILE_RESOLUTION_V1 → profile/account congelados
PUBLICATION_PROVIDER_STEP_REQUEST_V1      → request exato de cada side effect
```

`FirstRealPublishClaim` tem hash próprio (`FIRST_REAL_PUBLISH_CLAIM_V1`)
e `FirstRealPublishGateDecision` também (`FIRST_REAL_PUBLISH_GATE_DECISION_V1`)
— ambos owned pela Skill 03 (Ponto F1). `PublicationAuthorizationResolutionRef`
e `FirstRealPublishClaimRuntimeState` não têm hash próprio (ref/projection
e estado runtime mutável, respectivamente). Nesta Skill, não criamos
hash integral de `PublicationReservation`/`PublicationExecution`/
`PublicationStepExecution` (objetos mutáveis). `submissionSequence`
também não precisa de hash próprio — entra no request hash.

## Fechamento conceitual

1. Retry técnico nunca significa nova publicação; a identidade lógica
   da publicação sobrevive a Jobs, Attempts, workers, e providers.
2. `FIRST_REAL_PUBLISH` é decidido pela Skill 03 e aplicado
   atomicamente na última milha pela Skill 17; duas "primeiras
   publicações" simultâneas nunca podem atravessar o gate.
3. Depois que existe possibilidade de side effect externo, ausência de
   registro local não é prova de ausência de publicação. Reconciliar
   vem antes de repetir.
4. Uma publicação confirmada e uma publicação correlacionável são fatos
   distintos; `SocialPublicationBinding` só existe quando há identidade
   externa confiável.
5. Cancelar o trabalho não reescreve o mundo externo: um post já
   publicado permanece publicado até que exista, futuramente, uma
   operação explícita e auditada de remoção.

## Status de implementação (nesta fase de especificação)

```text
Skill 17 publishing pipeline → NOT_IMPLEMENTED
(publish-product/route.ts → JÁ EXISTE, mas image-only via Windsor.ai,
 com o mesmo bug de link sem tracking (LEGACY_TRACKING_BYPASS), zero
 vídeo, zero SocialPublicationBinding, zero revalidação de
 FIRST_REAL_PUBLISH explícita)
```
