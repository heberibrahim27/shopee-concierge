# Skill 15 — Gerador de Link/Tracking

> **APROVADA EM ESPECIFICAÇÃO — 15/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 (ChatGPT ↔ Claude Code). Diferente
> das Skills 09-14, esta **não é greenfield**: auditoria real encontrou
> geração de link de afiliado rastreável já em produção
> (`generateAffiliateShortLink`/`affiliate_links`), desconectada do post
> real do Instagram (que hoje usa o link sem tracking) — desconexão
> documentada como `LEGACY_TRACKING_BYPASS` a corrigir em runtime (mesmo
> método das Skills 04-14).
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B6)**:
> `providerOperationAuthorizationRef` continua existindo com esse
> nome, mas sua semântica normativa agora é
> `ExecutionQuotaBinding.quotaAuthorizationId` (classe
> `PROVIDER_OPERATION` — pode ser quota puramente operacional, sem
> `MONEY`). Ver "Reparo transversal pós-revisão Fable → Ponto E" no
> `SPEC.md` da Skill 23.

## Garantia central (rascunho inicial)

A Skill 15 gera, para uma produção de vídeo específica (subject +
canal), o link de afiliado rastreável que será embutido no CTA/legenda/
comentário — carregando identidade de tracking suficiente pra
diferenciar, mais tarde, cliques/conversões vindos deste vídeo
específico dos vindos de outros canais/campanhas. Ela não decide
comissão (Skill 05), não decide estratégia de CTA (Skill 07), não
publica (Skill 17), e não mede performance (Skills 18/19) — só gera e
persiste o link com o tracking correto anexado.

## Auditoria real do repositório (2026-09-18)

Confirmado via agente de auditoria: **NÃO é greenfield** — diferente das
Skills 09-14, já existe geração real de link de afiliado rastreável no
fluxo não-vídeo (Shopee), com um problema real de desconexão já
identificado.

- **Mecanismo real:** `generateAffiliateShortLink()` em
  `src/lib/shopee/queries.ts:79-100` chama a mutation GraphQL
  `generateShortLink(input: { originUrl, subIds })` da Shopee Affiliate
  Open API → retorna `{ shortLink, longLink }`. Chamada em
  `src/app/api/cron/source-deals/route.ts:124-126` com `subIds =
  ["ig", "p1", weekToken, contentToken(itemId), "auto"]` (canal/destino/
  campanha/conteúdo/distribuição). Persistida via `saveAffiliateLink()`
  (`src/lib/db/snapshots.ts:133-157`) na tabela real `affiliate_links`
  (28 linhas em produção; `deal_candidate_id, origin_url, sub_ids
  text[], short_link, long_link`).
- **`subIds`: máximo 5 entradas, formato restrito** — a API rejeita
  tokens longos/compostos (`[11001] Params Error: invalid sub id`,
  documentado em `queries.ts:76-78` e `src/lib/site/affiliateLink.ts:9-12`,
  confirmado ao vivo). Isso restringe quanto de identidade de tracking
  cabe literalmente no link.
- **Desconexão real já existente (achado crítico):** o comentário do
  post do Instagram hoje (`publish-product/route.ts:174-178`) usa
  `snap.offer_link` de `offer_snapshots` — o link **auto-gerado, não
  rastreado**, vindo direto de `productOfferV2` — e não o
  `affiliate_links.short_link` **rastreado**. Ou seja, hoje existem dois
  caminhos paralelos e desconectados: um gera link rastreável (nunca
  usado no post real), outro publica o link errado (sem tracking). A
  Skill 15 precisa resolver essa desconexão para o pipeline de vídeo —
  nunca reproduzi-la.
- **Reverse-attribution não confirmada tecnicamente.** `getConversionReport()`/
  `conversionReport` (`queries.ts:109-145`, `types.ts:55-69`) **não**
  expõe `subId`/click-id por conversão nos campos hoje consultados — só
  `conversionId, conversionStatus, purchaseTime, clickTime,
  totalCommission, orders{orderId}`. Se o schema real da API consegue
  devolver `subId` (via introspection, nunca consultada neste repo) é
  **desconhecido** — não pode ser assumido como certo pro design da
  Skill 15 nem pras Skills 18/19 futuras.
- **Sem shortener próprio.** Único mecanismo de short-link é o
  `generateShortLink` da própria Shopee. Existe uma rota
  `/api/track-click` (`click_events`, prod live) mas é fire-and-forget
  de analytics de site (platform/product_slug/product_name/source) —
  **não é redirect, não referencia `affiliate_links`/subId/clickId**.
- **Janela de atribuição de 7 dias confirmada** — texto exato já
  registrado em `skills/05-analise-de-oferta-comissao/SPEC.md:208-249`:
  "janela de atribuição de até 7 dias... comprar qualquer produto dentro
  dessa janela — não necessariamente o produto anunciado." Esse mesmo
  trecho já nomeia a Skill 15 como dona do desenho de `subIds`/
  identidade de tracking (tenant/campanha/criativo/produto promovido/
  instância do link), e as Skills 18/19 como donas das métricas de
  conversão direta vs. assistida resultantes.
- **Skills 16 (Automação de Comentários/DM) e 17 (Publicador
  Multicanal) ainda não existem** como SPEC.md.
- Achado extra: Supabase live tem `click_events`, `page_views`,
  `search_events`, `link_checks`, `coupons`, `product_groups`,
  `social_posts` sem migration versionada (fora do escopo desta Skill,
  não investigado a fundo).

## Decisões fechadas no debate inicial (2026-09-18)

**Skill 15 vira a única autoridade do link publicável no pipeline de
vídeo.** `offer_snapshots.offer_link` passa a ser tratado só como
`originUrl`/fonte da oferta — nunca como URL monetizada pronta pra
publicação. O output publicável vem de um artefato canônico,
`AffiliateLinkArtifact`; a futura Skill 17 consome
`affiliateLinkArtifactId`+hash, nunca `snap.offer_link` diretamente. O
bug real hoje existente em `publish-product/route.ts` (usa `offer_link`
sem tracking em vez de `affiliate_links.short_link`) fica documentado
como `LEGACY_TRACKING_BYPASS` — corrigido na fase de runtime, sem mexer
no código agora.

```text
offer_snapshots.offer_link → ORIGIN URL
Skill 15 → gera/resgata affiliate URL rastreável
AffiliateLinkArtifact → PUBLISHABLE URL
Skill 17 (futura) → só publica a URL da Skill 15
```

**`subIds` carregam identidade opaca compacta, não o domínio inteiro.**
Não tentamos codificar tenant+produto+vídeo+Job+canal+Attempt nos 5
`subIds` — esse seria o erro natural aqui. Um `AffiliateTrackingIdentity`
persistido carrega os dados ricos; um `trackingToken` curto e opaco
compatível com a Shopee é o que de fato vai num dos slots. Os demais
slots podem carregar dimensões legíveis pro reporting do provider
(canal, tipo/campanha compactos), mas **não são necessários** pra
reconstruir a identidade — o token sozinho basta, resolvido no nosso
banco. Quais das 5 posições são obrigatórias **não é congelado ainda**
— falta auditar completamente o schema/reporting real de `subId` da
Shopee. `attemptNumber` **não entra** na identidade semântica — Attempt
é infraestrutura de execução, não identidade comercial da publicação.

**Atribuição downstream é capability-aware, não um booleano.** Hoje
temos prova de `GENERATE_AFFILIATE_LINK_WITH_SUBIDS = IMPLEMENTED`, mas
`CONVERSION_REPORT_RETURNS_SUBID`, `CLICK_ID_TO_CONVERSION_JOIN`, e
`CREATIVE_LEVEL_CONVERSION_ATTRIBUTION` são todos `UNKNOWN` — não
auditados via introspection real da API. A Skill 15 declara capacidades
separadas em vez de um único "tracking funciona". A janela de 7 dias é
regra conhecida de atribuição da Shopee, mas **compra dentro de 7 dias
≠ prova de que um vídeo/link específico gerou aquela compra** sem uma
chave de correlação fornecida pelo provider. Taxonomia downstream pras
Skills 18/19: `DIRECT_PROVIDER_CONFIRMED` / `OWN_CLICK_CONFIRMED_ONLY` /
`PROVIDER_AGGREGATE_ONLY` / `INFERRED_HEURISTIC` / `UNATTRIBUTED` —
`INFERRED_HEURISTIC`, se um dia existir, nunca vira verdade financeira
canônica.

**Eixo de identidade: nem produto+canal (largo demais), nem Attempt
(estreito/técnico demais).** Produto+canal apagaria a distinção entre
vídeos A/B/C diferentes promovendo o mesmo produto no mesmo canal.
Attempt criaria ruído sem significado comercial (retry técnico não é
uma nova publicação). Identidade V1: `tenant` + `provider` +
`promotedProductId` + `sourceOfferSnapshotId` + `publicationTargetKey` +
`finalizedVideoRenditionHash` + `trackingPolicySnapshotHash`. Como o
`renditionHash` da Skill 14 já não inclui `jobId`/`attemptNumber`, uma
repetição técnica que gere exatamente a mesma rendition semântica pode
reutilizar o mesmo tracking identity/link — mesma tracking identity →
reutiliza `AffiliateLinkArtifact`; identidade semanticamente diferente →
novo link. Campo futuro reservado (patch aditivo, mesmo padrão das
Skills 09/10) pra quando a Skill 17 existir e publicação repetida da
mesma rendition em campanhas/horários distintos precisar de atribuição
separada: `publicationInstanceKey?: string`.

**Produto promovido ≠ produto comprado — nunca presumir.** A Skill 15
carrega `promotedProductId`+`sourceOfferSnapshotId`, mas nunca presume
que uma conversão atribuída terá `purchasedProductId =
promotedProductId` (a Shopee pode atribuir comissão a outra compra
dentro da janela/sessão) — mesmo protocolo já registrado no SPEC.md da
Skill 05. Skills 18/19 preservam essa distinção mesmo quando a
atribuição ao link estiver comprovada.

**Três identidades separadas, nunca fundidas:** `originUrl` (URL
original da oferta/produto) vs. `providerAffiliateUrl` (`short_link`
retornado por `generateShortLink`) vs. `trackingIdentity` (nossa
identidade interna explicando PARA QUÊ aquele link foi criado). O
`short_link` **não é** a identidade do tracking — é só o endereço
fornecido pelo provider; se a Shopee regenerar uma URL diferente pra
mesma identidade comercial, precisamos distinguir replay/rotação/nova
versão sem perder o lineage.

**Link ligado ao `FinalizedVideoRendition` (Skill 14), não ao
`VideoArtifact` (Skill 11)** — é o artefato específico do target que de
fato será publicado. Isso fecha a linhagem: produto promovido → vídeo
final daquele canal → link daquele conteúdo/canal → publicação futura.

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


Peça adicional necessária pra não deixar `trackingPolicySnapshotHash`
órfão: `AffiliateTrackingPolicy`/`Binding` — governa identidade/reuso,
**não** a capacidade observacional do conversion report (isso fica em
snapshot de capability separado).

```text
FinalizedVideoRendition exata + produto/oferta promovidos exatos + target
→ AffiliateTrackingPolicy
→ AffiliateTrackingIdentity
→ trackingToken opaco
→ SubIdEncodingPolicy
→ EncodedSubIdSet
→ AffiliateLinkProvider
→ AffiliateLinkArtifact
→ Skill17 futura
```

### `AffiliateLinkInput`

```typescript
type AffiliateLinkInput = {
  tenantId: string;
  runId: string;

  stageSubjectBindingId: string;

  promotedProductId: string;
  sourceOfferSnapshotId: string;

  // offer_snapshots.offer_link exato. É origem, nunca affiliate URL pronta.
  originUrl: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  publicationTargetKey: string;

  affiliateTrackingPolicyKey: string;

  // Reservado para Skill 17 futura.
  publicationInstanceKey?: string;
};
```

Invariantes: `sourceOfferSnapshotId` pertence a `promotedProductId`;
`originUrl` é exatamente a URL registrada no `sourceOfferSnapshotId`;
`FinalizedVideoRendition.publicationTargetKey = input.publicationTargetKey`;
`StageSubjectBinding` → subject `PRODUCT` correspondente ao
`promotedProductId`; tenant de toda a lineage = `Job.tenantId`. Nunca
"último offer_snapshot do produto"/"link mais recente"/"rendition mais
recente".

Hash: `AFFILIATE_LINK_INPUT_V1:sha256:<hex>` sobre `stageSubjectBindingId`,
`promotedProductId`, `sourceOfferSnapshotId`, `originUrl` exata,
`finalizedVideoRenditionId`/`hash`, `publicationTargetKey`, tracking
policy snapshot resolvida, `publicationInstanceKey?` quando presente.
Sem `jobId`/`attemptNumber`/`runId`/timestamps.

### `AffiliateTrackingPolicy` + `Binding`

```typescript
type AffiliateTrackingPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  providerKey: string;
  providerProfileKey: string;

  subIdEncodingPolicyId: string;
  subIdEncodingPolicyVersion: string;
  subIdEncodingPolicySnapshotHash: string;

  linkReuseMode: 'SEMANTIC_PUBLICATION_IDENTITY';

  publicationInstanceMode: 'IGNORE' | 'INCLUDE_WHEN_PRESENT';

  requireFinalizedRendition: true;

  createdAt: string;
};

type AffiliateTrackingPolicyBinding = {
  tenantId: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Hash: `AFFILIATE_TRACKING_POLICY_V1:sha256:<hex>`. Importante: aprender
amanhã que o `conversionReport` não retorna `subId` **não muda esta
policy automaticamente** — capacidade de atribuição fica em snapshot
separado (`AffiliateAttributionCapabilitySnapshot`).

### `AffiliateTrackingIdentity` — identidade comercial interna

```typescript
type AffiliateTrackingIdentity = {
  trackingIdentityId: string;

  tenantId: string;

  providerKey: string;

  promotedProductId: string;
  sourceOfferSnapshotId: string;

  publicationTargetKey: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  affiliateTrackingPolicyId: string;
  affiliateTrackingPolicyVersion: string;
  trackingPolicySnapshotHash: string;

  publicationInstanceKey?: string;

  // Opaco, curto e sem semântica de domínio embutida.
  trackingToken: string;

  identityHash: string;

  createdAt: string;
};
```

Hash: `AFFILIATE_TRACKING_IDENTITY_V1:sha256:<hex>` sobre `tenantId`,
`providerKey`, `promotedProductId`, `sourceOfferSnapshotId`,
`publicationTargetKey`, `finalizedVideoRenditionHash`,
`trackingPolicySnapshotHash`, `publicationInstanceKey` (só se presente e
policy mandar incluir). Sem `trackingIdentityId`/`trackingToken`/
`attemptNumber`/`jobId`/`createdAt`.

Separação importante: `identityHash` responde "qual publicação
comercial é esta?"; `trackingToken` responde "qual código curto usamos
pra referenciá-la externamente?"

### Alocação do `trackingToken`

Não derivamos o token truncando o hash da identidade — com limites
pequenos (subIds), truncamento cria risco de colisão. V1: token opaco,
imutável após alocação, criado uma vez, persistido antes de gerar o
link. Replay da mesma `identityHash` → reutiliza o mesmo `trackingToken`.
Unicidade forte: `UNIQUE(identityHash, tenantId, providerKey)` e
`UNIQUE(trackingToken)` — a segunda global na V1, mais conservador pra
eventual conta de provider compartilhada entre tenants. Colisão de token
→ gera outro token **antes** de qualquer chamada ao provider; nunca
remapeia um token já persistido.

### Verificação da política de subIds

Não precisamos conhecer todo o universo permitido pela Shopee — só
provar que o perfil que usamos é válido.

```typescript
type SubIdPolicyVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'STALE';

type SubIdPolicyCompleteness = 'PARTIAL' | 'COMPLETE_FOR_CONFIGURED_ENCODING';

type SubIdVerificationSource = 'OFFICIAL_DOCUMENTATION' | 'PROVIDER_API_TEST';
```

Isso acomoda o que já sabemos empiricamente (máximo 5 entradas, alguns
tokens passam, tokens compostos/longos podem retornar `[11001]`) sem
fingir que conhecemos a gramática inteira da Shopee.

### `SubIdEncodingPolicy`

```typescript
type SubIdSemantic =
  | 'CHANNEL_CODE'
  | 'TRACKING_TOKEN'
  | 'CAMPAIGN_CODE'
  | 'CONTENT_CLASS'
  | 'RESERVED';

type SubIdSlotDefinition = {
  position: 1 | 2 | 3 | 4 | 5;

  semantic: SubIdSemantic;

  required: boolean;

  encoderKey: string;
  encoderVersion: string;
};

type SubIdEncodingPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  providerKey: string;

  verification: {
    status: SubIdPolicyVerificationStatus;
    completeness: SubIdPolicyCompleteness;

    sources: Array<{
      sourceType: SubIdVerificationSource;
      evidenceRef: string;
    }>;

    verifiedAt?: string;
  };

  maxEntries: number;

  slots: SubIdSlotDefinition[];

  trackingTokenConstraints: {
    alphabetProfileKey: string;

    minLength?: number;
    maxLength?: number;

    // Só preenchido quando realmente verificado.
    providerPattern?: string;
  };

  createdAt: string;
};
```

Pra Shopee atual, registramos factual `maxEntries = 5`, mas **não
inventamos** `maxLength`/regex até estarem verificados. Hash:
`SUBID_ENCODING_POLICY_V1:sha256:<hex>`.

### `EncodedSubIdSet` — prova exata do que foi enviado à Shopee

```typescript
type EncodedSubIdSet = {
  encodedSubIdSetId: string;

  tenantId: string;

  trackingIdentityId: string;
  trackingIdentityHash: string;

  subIdEncodingPolicyId: string;
  subIdEncodingPolicyVersion: string;
  subIdEncodingPolicySnapshotHash: string;

  values: Array<{
    position: 1 | 2 | 3 | 4 | 5;
    semantic: SubIdSemantic;

    value: string;
  }>;

  encodedSubIdsHash: string;

  createdAt: string;
};
```

Invariantes: `values.length <= policy.maxEntries`; positions únicas;
`TRACKING_TOKEN` → exatamente o `trackingToken` daquela identity; cada
`value` produzido pelo encoder versionado correspondente. Hash:
`ENCODED_SUBID_SET_V1:sha256:<hex>` sobre os valores em `position` ASC.

**Semântica dos 5 slots não congelada.** Não travamos algo como
`1=ig, 2=p1, 3=week, 4=item, 5=auto` — isso é o legado atual, não
necessariamente nosso contrato novo. Única exigência arquitetural
inicial: pelo menos um slot obrigatório `TRACKING_TOKEN`. Os demais
(`CHANNEL_CODE`/`CAMPAIGN_CODE`/`CONTENT_CLASS`) continuam úteis pra
leitura humana/agregação, mas não são necessários pra reconstruir
tenant/produto/rendition.

### `AffiliateLinkProviderCapabilities`

```typescript
type CapabilityVerification = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'UNSUPPORTED';

type AffiliateLinkProviderCapabilities = {
  providerKey: string;
  capabilityVersion: string;

  linkGeneration: 'IMPLEMENTED' | 'NOT_IMPLEMENTED';

  supportsOriginUrl: CapabilityVerification;

  subIds: {
    support: CapabilityVerification;
    maxEntries?: number;
    formatConstraints: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';
  };

  supportsIdempotencyKey: boolean;
  supportsLookupByRequestIdentity: boolean;

  providerLinkExpiry: 'KNOWN' | 'UNKNOWN';

  createdAt: string;
};
```

Hash: `AFFILIATE_LINK_PROVIDER_CAPABILITIES_V1:sha256:<hex>`. Para o
estado auditado da Shopee: `linkGeneration IMPLEMENTED`,
`subIds.support VERIFIED`, `maxEntries 5`,
`formatConstraints PARTIALLY_VERIFIED` — sem inferir os demais.

### `AffiliateLinkProvider`

```typescript
interface AffiliateLinkProvider {
  getCapabilities(): AffiliateLinkProviderCapabilities;

  generateAffiliateLink(input: AffiliateLinkProviderRequest): Promise<AffiliateLinkProviderResponse>;

  lookupExistingLink?(input: AffiliateLinkProviderLookupInput): Promise<AffiliateLinkProviderLookupResult>;
}

type AffiliateLinkProviderRequest = {
  providerKey: string;

  providerRequestKey: string;

  originUrl: string;

  encodedSubIds: string[];

  trackingIdentityHash: string;
  encodedSubIdsHash: string;
};
```

Hash: `AFFILIATE_LINK_PROVIDER_REQUEST_V1:sha256:<hex>` sobre
`providerKey`, `originUrl` exata, `encodedSubIds` em ordem,
`trackingIdentityHash`, `encodedSubIdsHash`. Sem secret.

```typescript
type AffiliateLinkProviderResponse = {
  providerRequestId?: string;

  providerAffiliateUrl: string;

  providerLinkId?: string;

  normalizedProviderMetadata?: Record<string, unknown>;

  providerResponseHash: string;
};
```

Hash: `AFFILIATE_LINK_PROVIDER_RESPONSE_V1:sha256:<hex>` sobre a
resposta semântica normalizada. Não inclui timestamp de rede, latência,
headers, trace id.

### `AffiliateLinkArtifact` — o único link publicável do pipeline

```typescript
type AffiliateLinkArtifact = {
  affiliateLinkArtifactId: string;

  tenantId: string;
  runId: string;

  materializedByJobId: string;
  materializedByAttemptNumber: number;

  providerKey: string;

  promotedProductId: string;
  sourceOfferSnapshotId: string;

  publicationTargetKey: string;

  finalizedVideoRenditionId: string;
  finalizedVideoRenditionHash: string;

  trackingIdentityId: string;
  trackingIdentityHash: string;

  trackingToken: string;

  affiliateTrackingPolicyId: string;
  affiliateTrackingPolicyVersion: string;
  trackingPolicySnapshotHash: string;

  subIdEncodingPolicyId: string;
  subIdEncodingPolicyVersion: string;
  subIdEncodingPolicySnapshotHash: string;

  encodedSubIdSetId: string;
  encodedSubIdsHash: string;

  originUrl: string;

  // ÚNICA URL publicável.
  providerAffiliateUrl: string;

  providerRequestHash: string;
  providerResponseHash: string;

  publicationInstanceKey?: string;

  artifactHash: string;

  createdAt: string;
};
```

Hash: `AFFILIATE_LINK_ARTIFACT_V1:sha256:<hex>` sobre `providerKey`,
`promotedProductId`, `sourceOfferSnapshotId`, `publicationTargetKey`,
`finalizedVideoRenditionHash`, `trackingIdentityHash`, `trackingToken`,
`trackingPolicySnapshotHash`, `subIdEncodingPolicySnapshotHash`,
`encodedSubIdsHash`, `originUrl`, `providerAffiliateUrl`,
`providerRequestHash`, `providerResponseHash`, `publicationInstanceKey?`
quando aplicável. Sem artifact ID/`jobId`/`attemptNumber`/`runId`/
`createdAt`.

**Identidade comercial vs. materialização.** Regra V1: mesmo
`AffiliateTrackingIdentity.identityHash` → reutiliza
`AffiliateLinkArtifact` já existente — nunca gera de novo só porque
houve Job retry/novo worker/novo attempt técnico. `materializedByAttemptNumber`
é só provenance do primeiro materializador; não entra no hash.

**`providerAffiliateUrl` não é a identidade.** `trackingIdentityHash` =
identidade comercial; `providerAffiliateUrl` = endereço emitido pelo
provider; `AffiliateLinkArtifact` prova a relação entre os dois. Se a
Shopee rotacionar/reemitir URL pra mesma identidade no futuro, isso
exige política explícita de rotação — nunca sobrescrever silenciosamente
a URL de um artifact imutável.

### Capability snapshot de atribuição — independente da capacidade de gerar link

```typescript
type AffiliateAttributionCapabilityStatus = 'VERIFIED' | 'UNVERIFIED' | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';

type AffiliateAttributionCapabilitySnapshot = {
  capabilitySnapshotId: string;

  providerKey: string;
  capabilityVersion: string;

  providerSubIdSupport: AffiliateAttributionCapabilityStatus;
  providerConversionReturnsSubId: AffiliateAttributionCapabilityStatus;
  providerConversionReturnsClickId: AffiliateAttributionCapabilityStatus;
  providerClickToConversionJoin: AffiliateAttributionCapabilityStatus;
  providerCreativeLevelAttribution: AffiliateAttributionCapabilityStatus;
  providerAggregateConversionReporting: AffiliateAttributionCapabilityStatus;
  ownedAffiliateClickTracking: AffiliateAttributionCapabilityStatus;

  evidenceRefs: string[];

  capabilitySnapshotHash: string;

  observedAt: string;
};
```

Hash: `AFFILIATE_ATTRIBUTION_CAPABILITY_V1:sha256:<hex>`. Estado
auditado hoje: `providerSubIdSupport VERIFIED`,
`providerConversionReturnsSubId UNVERIFIED`,
`providerConversionReturnsClickId UNVERIFIED`,
`providerClickToConversionJoin UNVERIFIED`,
`providerCreativeLevelAttribution UNVERIFIED`,
`providerAggregateConversionReporting VERIFIED`,
`ownedAffiliateClickTracking NOT_IMPLEMENTED` (a rota `/api/track-click`
existente não conta — está desconectada da `AffiliateTrackingIdentity`).

**Capability snapshot não muda retroativamente.** Se amanhã
introspection revelar que a Shopee retorna `subId`, isso **não** muta o
snapshot antigo — cria um novo capability snapshot/version, preservando
historicamente "nesta data, essa capacidade ainda não havia sido
comprovada".

### Nível de atribuição e evidência

```typescript
type AffiliateAttributionLevel =
  | 'DIRECT_PROVIDER_CONFIRMED'
  | 'OWN_CLICK_CONFIRMED_ONLY'
  | 'PROVIDER_AGGREGATE_ONLY'
  | 'INFERRED_HEURISTIC'
  | 'UNATTRIBUTED';
```

Sem score numérico artificial. Contrato de evidência (compartilhável
futuramente pelas Skills 18/19 — a Skill 15 não precisa materializar
conversões hoje):

```typescript
type AffiliateAttributionEvidence = {
  attributionEvidenceId: string;

  tenantId: string;

  providerKey: string;

  attributionLevel: AffiliateAttributionLevel;

  // Pode faltar nos níveis aggregate/unattributed.
  trackingIdentityId?: string;
  trackingIdentityHash?: string;

  affiliateLinkArtifactId?: string;
  affiliateLinkArtifactHash?: string;

  providerConversionId?: string;
  providerClickId?: string;

  providerSubIdsObserved?: string[];

  promotedProductId?: string;

  // Nunca inferir igualdade com promotedProductId.
  purchasedProductId?: string;

  providerPurchaseTime?: string;
  providerClickTime?: string;

  financialEvidence?: {
    source: 'PROVIDER_REPORTED';
    totalCommission?: number;
    currency?: string;
  };

  sourceEvidenceRefs: string[];

  attributionEvidenceHash: string;

  observedAt: string;
};
```

Hash: `AFFILIATE_ATTRIBUTION_EVIDENCE_V1:sha256:<hex>`.

**Regras fortes por nível:**

```text
DIRECT_PROVIDER_CONFIRMED
  Exige prova direta do provider correlacionando a conversão a uma
  identidade: subId/token retornado, OU clickId correlacionável, OU
  outra chave oficial equivalente. Timing sozinho não basta.

OWN_CLICK_CONFIRMED_ONLY
  Sabemos que alguém clicou neste link. NÃO significa que essa pessoa
  comprou, nem que a comissão veio deste clique.

PROVIDER_AGGREGATE_ONLY
  Pode carregar comissão real de provider (R$ X no período), mas não
  pode preencher trackingIdentityId como confirmado para uma venda
  específica.

INFERRED_HEURISTIC
  Ex.: clique 14:00 + compra 14:20 + produto parecido = ainda inferência.
  Nunca vira DIRECT_PROVIDER_CONFIRMED automaticamente, nem é usado como
  verdade canônica de atribuição financeira por criativo.

UNATTRIBUTED
  Conversão/comissão observada, mas nenhuma identidade de publicação
  pode ser provada.
```

**Evidência financeira ≠ evidência de criativo:**

> Um valor de comissão reportado oficialmente pelo provider pode ser
> financeiramente autoritativo mesmo quando a atribuição ao criativo,
> link ou produto promovido permanece desconhecida.

Provider diz comissão R$12,00 → evidência financeira real; mas se não
retorna `subId`/`clickId` → `PROVIDER_AGGREGATE_ONLY` ou `UNATTRIBUTED`
— nunca inventamos qual vídeo ganhou os R$12.

**Promovido ≠ comprado, sempre separados.** Ausência de
`purchasedProductId` → `UNKNOWN`, nunca
`purchasedProductId = promotedProductId`. Mesmo com
`DIRECT_PROVIDER_CONFIRMED`, a confirmação pode ser "esta conversão foi
atribuída ao link" sem significar "o usuário comprou exatamente o
produto do vídeo".

**Janela de 7 dias:** a Skill 15 pode referenciar a regra conhecida de
atribuição do provider em policy/capability, mas click+compra dentro de
7 dias é apenas *compatível* com a janela — não é evidência suficiente
de `DIRECT_PROVIDER_CONFIRMED`. Essa distinção precisa chegar intacta às
Skills 18/19.

### Relação com `affiliate_links` existente e com a Skill 17

`affiliate_links` (tabela real hoje) é classificada como
`EXISTING / REUSABLE CONCEPTUALLY` — sem assumir que o schema atual já
atende aos contratos novos. Na implementação futura, decide-se entre
evoluir `affiliate_links` ou manter legacy + criar entidades
normalizadas novas. Sem migrations agora.

Contrato já congelado pra Skill 17 futura: ela recebe
`FinalizedVideoRenditionId`+`renditionHash` +
`AffiliateLinkArtifactId`+`artifactHash`, e valida mesmo tenant, mesmo
`publicationTargetKey`, mesma `FinalizedVideoRendition`. Se a Skill 17
tentar publicar `offer_snapshot.offer_link` diretamente:
`LEGACY_TRACKING_BYPASS` — inválido no novo pipeline.

### Hashes canônicos consolidados

```text
AFFILIATE_LINK_INPUT_V1                     → input semântico congelado
AFFILIATE_TRACKING_POLICY_V1                → comportamento de tracking/reuso
AFFILIATE_TRACKING_IDENTITY_V1              → identidade comercial da publicação
SUBID_ENCODING_POLICY_V1                    → regras versionadas de encoding
ENCODED_SUBID_SET_V1                        → valores exatos enviados
AFFILIATE_LINK_PROVIDER_CAPABILITIES_V1     → capacidades de geração do provider
AFFILIATE_LINK_PROVIDER_REQUEST_V1          → request exato
AFFILIATE_LINK_PROVIDER_RESPONSE_V1         → resposta normalizada
AFFILIATE_LINK_ARTIFACT_V1                  → link publicável + lineage
AFFILIATE_ATTRIBUTION_CAPABILITY_V1         → capacidade conhecida de provar atribuição
AFFILIATE_ATTRIBUTION_EVIDENCE_V1           → evidência concreta futura de atribuição
```

`trackingToken` é uma chave opaca persistida, não um hash semântico.

### Cadeia final

```text
OfferSnapshot.offer_link → originUrl

FinalizedVideoRendition + produto promovido + target
→ AffiliateTrackingPolicy
→ AffiliateTrackingIdentity
→ opaque trackingToken
→ SubIdEncodingPolicy
→ EncodedSubIdSet
→ AffiliateLinkProvider
→ providerAffiliateUrl
→ AffiliateLinkArtifact
→ Skill17

futuramente:
provider conversion/click evidence
→ AffiliateAttributionEvidence
→ Skills18/19
```

### `AffiliateProviderProfileResolution` — patch antes do fechamento

`providerProfileKey` sozinho não é suficiente pra replay: se a
configuração Shopee mudar depois (conta, app, adapter, endpoint
lógico), uma Attempt antiga não pode resolver silenciosamente o profile
novo.

```typescript
type AffiliateProviderProfileResolution = {
  tenantId: string;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;

  providerKey: string;

  credentialScope: 'TENANT_BYO' | 'PLATFORM_MANAGED';

  resolvedAt: string;

  resolutionHash: string;
};
```

Hash: `AFFILIATE_PROVIDER_PROFILE_RESOLUTION_V1:sha256:<hex>`. Sem
secret. `AffiliateTrackingPolicy` continua apontando pra
`providerProfileKey`, mas a execução e o `AffiliateLinkArtifact`
congelam `version`+`snapshotHash`+`resolutionHash`.

## Idempotência

A identidade principal não é o Job — é
`AffiliateTrackingIdentity.identityHash`. Antes de qualquer chamada à
Shopee: resolver input/upstreams → resolver `TrackingPolicy` →
construir `identityHash` → procurar `AffiliateLinkArtifact` canônico
dessa identity. Se existir e compatível → reutiliza, zero
`generateShortLink()` — mesmo com Job novo, Attempt nova, worker
diferente, cron diferente.

> Uma mesma identidade comercial não deve gerar múltiplos links apenas
> por repetição técnica da Skill 15.

`UNIQUE` lógico: `(tenantId, providerKey, trackingIdentityHash)` → no
máximo 1 `AffiliateLinkArtifact` canônico ativo na V1. Nunca
`(jobId, attemptNumber)` como identidade comercial.

**Idempotência do `trackingToken`:** alocação acontece antes do
provider — `identityHash` → lookup token existente; se existe, reutiliza
exatamente; se não, aloca → persiste → só depois codifica `subIds`.
Nunca "crash → gerar token diferente → chamar Shopee de novo".
Invariantes: mesma `identityHash` → mesmo `trackingToken`; token
persistido nunca remapeado pra outra identity. Colisão antes de
qualquer vínculo → gera outro token; token já ligado a outra identity →
`AFFILIATE_TRACKING_TOKEN_CONFLICT` (FATAL_ERROR).

**`EncodedSubIdSet` também idempotente:** pra mesma `trackingIdentityHash`
+ `SubIdEncodingPolicy` snapshot, o resultado é determinístico — mesma
identity+policy → mesmo `encodedSubIdsHash`, mesmos valores nas mesmas
posições. Nenhum encoder usa `Date.now()`/`random()`/`attemptNumber`/
`jobId`, exceto o `trackingToken` já congelado como dado de entrada. Se
o mesmo identity/policy gerar outro conjunto →
`AFFILIATE_SUBID_ENCODING_REPLAY_CONFLICT` (FATAL_ERROR).

### Checkpoint da chamada externa

`generateShortLink()` é side effect externo cuja resposta pode se
perder — exige checkpoint.

```typescript
type AffiliateLinkGenerationCheckpointState =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'RESPONSE_CAPTURED'
  | 'VALIDATED'
  | 'REJECTED';

type AffiliateLinkGenerationCheckpoint = {
  affiliateLinkGenerationCheckpointId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  trackingIdentityId: string;
  trackingIdentityHash: string;

  encodedSubIdSetId: string;
  encodedSubIdsHash: string;

  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;
  providerProfileResolutionHash: string;

  providerRequestKey: string;
  providerRequestHash: string;

  providerKey: string;

  state: AffiliateLinkGenerationCheckpointState;

  providerRequestId?: string;
  providerResponseHash?: string;

  normalizedProviderResponse?: AffiliateLinkProviderResponse;

  rejectionCode?: string;

  createdAt: string;
  updatedAt: string;
};
```

`UNIQUE` lógico: `(tenantId, trackingIdentityHash)` — uma geração
lógica por identidade.

**Antes da rede:** `AffiliateTrackingIdentity` persistida +
`trackingToken` persistido + `EncodedSubIdSet` persistido + provider
profile resolution congelada + checkpoint `PREPARED` +
`providerRequestKey`+`providerRequestHash`. Depois: checkpoint →
`SUBMITTING`, só então `generateShortLink(originUrl, subIds)` — porque a
resposta pode morrer no caminho entre o provider gerar o link e nós
recebermos a confirmação.

### Replay por estado

```text
VALIDATED           → reutiliza AffiliateLinkArtifact, zero provider call
RESPONSE_CAPTURED   → valida resposta já persistida, materializa artifact, zero provider call
REJECTED            → não chama provider novamente escondido
PREPARED            → pode iniciar submit
SUBMITTING          → NÃO assumir que provider não processou
```

`SUBMITTING` ambíguo: provider suporta lookup/reconcile seguro →
reconcile; suporta idempotency key real → retransmissão da mesma
logical request pode ser segura; nenhum dos dois →
`BLOCKED`/`EXTERNAL_STATE_UNKNOWN`. Nunca "não achei `short_link` no
banco, chama `generateShortLink` de novo".

**Por que ambiguidade importa mesmo sem cobrança:** mesmo que
`generateShortLink()` não seja pago, duplicá-lo pode produzir URL A e
URL B pra mesma identidade — fragmentando cliques, subId reporting,
atribuição futura e auditoria. A disciplina de não-duplicação continua
necessária.

**`providerRequestKey`:** chave estável da submissão lógica — não
inclui `attemptNumber` como componente semântico. Derivável de
tenant+provider+`trackingIdentityHash`+`encodedSubIdsHash`+
`providerProfileSnapshotHash`. Mesmo `providerRequestKey` com request
diferente → `AFFILIATE_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT`
(FATAL_ERROR).

**Resposta válida:** `providerAffiliateUrl` presente → normalizar →
`providerResponseHash` → checkpoint `RESPONSE_CAPTURED` → validar →
`AffiliateLinkArtifact` → checkpoint `VALIDATED` — `AffiliateLinkArtifact`
+ checkpoint `VALIDATED` + `AuditEvent` na mesma transação de banco.

**Provider rejeita subIds** (`[11001] invalid sub id`): se a rede
funcionou e o provider rejeitou conclusivamente, **não** é
`EXTERNAL_STATE_UNKNOWN` — é falha conhecida:
`AFFILIATE_PROVIDER_SUBID_REJECTED` (FATAL_ERROR daquela
configuração/policy — repetir os mesmos subIds não resolve). Emite
métrica de drift `subid_policy_provider_rejection_total` (pode
significar policy marcada `VERIFIED` mas provider deixou de aceitar —
provavelmente precisa ser marcada `STALE`/revalidada futuramente, mas a
Skill 15 não muta a policy automaticamente).

## Erros

### `FATAL_ERROR`

```text
AFFILIATE_LINK_TENANT_MISMATCH

AFFILIATE_PRODUCT_NOT_FOUND
AFFILIATE_OFFER_SNAPSHOT_NOT_FOUND
AFFILIATE_OFFER_PRODUCT_MISMATCH
AFFILIATE_ORIGIN_URL_MISMATCH

AFFILIATE_RENDITION_NOT_FOUND
AFFILIATE_RENDITION_HASH_MISMATCH
AFFILIATE_RENDITION_TARGET_MISMATCH

AFFILIATE_TRACKING_POLICY_NOT_FOUND
INVALID_AFFILIATE_TRACKING_POLICY

AFFILIATE_PROVIDER_PROFILE_MISMATCH

AFFILIATE_TRACKING_IDENTITY_CONFLICT
AFFILIATE_TRACKING_TOKEN_CONFLICT

AFFILIATE_SUBID_POLICY_NOT_FOUND
INVALID_SUBID_ENCODING_POLICY
AFFILIATE_SUBID_ENCODING_REPLAY_CONFLICT

AFFILIATE_PROVIDER_CAPABILITY_UNSUPPORTED
AFFILIATE_PROVIDER_REQUEST_KEY_PAYLOAD_CONFLICT
AFFILIATE_PROVIDER_SUBID_REJECTED
AFFILIATE_PROVIDER_ORIGIN_URL_REJECTED
AFFILIATE_PROVIDER_RESPONSE_INVALID

AFFILIATE_LINK_ARTIFACT_REPLAY_CONFLICT

AFFILIATE_ATTRIBUTION_LEVEL_INTEGRITY_VIOLATION

OWNED_AFFILIATE_CLICK_EVENT_REPLAY_CONFLICT
```

`AFFILIATE_ATTRIBUTION_LEVEL_INTEGRITY_VIOLATION` protege, por exemplo,
`attributionLevel = DIRECT_PROVIDER_CONFIRMED` sem provider evidence
direta, caso esse contrato seja materializado futuramente.

### `RETRYABLE_ERROR`

Só falhas transitórias em que repetir a fase é seguro:

```text
AFFILIATE_PROVIDER_TEMPORARILY_UNAVAILABLE
AFFILIATE_PROVIDER_RATE_LIMITED
AFFILIATE_PROVIDER_REQUEST_TRANSIENT_ERROR
AFFILIATE_PROVIDER_RECONCILE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Regra: `RETRYABLE_ERROR` não autoriza sozinho repetir
`generateShortLink()` se a chamada anterior pode ter sido processada.
Antes do submit: retry seguro. Depois de submit ambíguo:
reconcile/idempotency ou `BLOCKED`.

### `BLOCKED`

```text
Estado externo ambíguo
→ AFFILIATE_LINK_EXTERNAL_STATE_UNKNOWN → BLOCKED/EXTERNAL_STATE_UNKNOWN
  (timeout pós-submit, crash após request sair e antes da resposta
  persistir, provider sem lookup/idempotency suficiente)

Policy/subId não operacional
→ AFFILIATE_TRACKING_POLICY_NOT_CONFIGURED → POLICY_BLOCKED
  (AFFILIATE_TRACKING_POLICY_BINDING_NOT_FOUND — binding inexistente em
  ambiente ainda não configurado; AFFILIATE_SUBID_POLICY_NOT_VERIFIED —
  SubIdEncodingPolicy.status = UNVERIFIED; AFFILIATE_PROVIDER_PROFILE_NOT_FOUND
  — provider profile ainda não conectado)
```

Distinção central: "integração ainda não configurada" (binding/profile
inexistente, policy nunca verificada) → `BLOCKED`/`POLICY_BLOCKED`,
nunca `FATAL_ERROR`. "Referência que deveria existir por contrato mas
sumiu/corrompeu" (binding aponta pra um `policyId` que não existe mais,
ou a policy existe mas é estruturalmente inválida) → `FATAL_ERROR`
(`AFFILIATE_TRACKING_POLICY_NOT_FOUND`/`AFFILIATE_SUBID_POLICY_NOT_FOUND`/
`INVALID_AFFILIATE_TRACKING_POLICY`/`INVALID_SUBID_ENCODING_POLICY`) —
mesma distinção já usada na Skill 14.

### O que NÃO é erro da Skill 15

Atribuição downstream desconhecida (`providerConversionReturnsSubId =
UNVERIFIED`) **não** impede gerar link — não é erro, não é `BLOCKED`. A
Skill 15 pode produzir link publicável mesmo sem garantia de atribuição
criativo→conversão; apenas registra honestamente a capability.

> A existência de `AffiliateLinkArtifact` prova que foi gerado um link
> afiliado associado à identidade interna de tracking; **não** prova que
> o provider conseguirá posteriormente devolver essa identidade em cada
> conversão.

## Multi-tenant

Fonte de autoridade: `trustedTenantId = Job.tenantId`. Precisam
corresponder: `AffiliateLinkInput`, `StageSubjectBinding`,
OfferSnapshot/promoted product context, `FinalizedVideoRendition`,
`AffiliateTrackingPolicyBinding`, `AffiliateTrackingPolicy`,
`AffiliateProviderProfileResolution`, `AffiliateTrackingIdentity`,
`SubIdEncodingPolicy`, `EncodedSubIdSet`, checkpoint,
`AffiliateLinkArtifact`, `AffiliateAttributionEvidence` quando existir.
Divergência → `AFFILIATE_LINK_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent
de segurança).

**Conta Shopee compartilhada não torna tracking global:** mesmo com
`PLATFORM_MANAGED` (mesma AppID/Secret física), continuam tenant-scoped:
tracking identity, token, artifact, publication lineage, analytics,
attribution evidence. O `trackingToken` globalmente único reduz risco de
colisão entre tenants que compartilhem a mesma conta provider.

**Sem dedupe cross-tenant:** mesmo produto/offer/rendition
bytes/canal — se tenant diferente, `AffiliateTrackingIdentity` diferente,
artifact diferente.

**Cross-target também não reutiliza identidade:** Instagram vs. TikTok
pra mesma rendition visual → `publicationTargetKey` diferente →
`trackingIdentityHash` diferente → links distintos (desejado, pra
tracking por destino).

## Reparo transversal pós-revisão Fable (2026-09-18)

### Ponto F2 — `OwnedAffiliateClickEvent` (dono canônico: Skill 15)

A Skill 18 já apontava, em duas notas de texto diferentes (uma delas
literalmente com o header `(patch da Skill 15)`), que este conceito
deveria ser dono da Skill 15 — mas nunca chegou a existir aqui, e a
Skill 18 acabou com duas declarações divergentes do mesmo tipo no
próprio arquivo (duplicata real, achado da revisão Fable). Este é o
contrato canônico, definido uma única vez, nesta Skill:

```typescript
type OwnedAffiliateClickCaptureBasis =
  | 'OWNED_REDIRECT_SURFACE';
// V1: só cobre clique que passou pela nossa superfície de redirect
// própria (rota/redirect que emite o AffiliateLinkArtifact). Futuras
// superfícies (ex. app nativo, bot) exigem novo valor + nova Skill
// que sabe emitir com evidência real — nunca se assume retroativo.

type OwnedAffiliateClickSourceRef =
  | { kind: 'SOCIAL_PUBLICATION'; publicationBindingId: string; publicationBindingHash: string; }
  | { kind: 'OWNED_SURFACE'; sourceId: string; sourceHash: string; };
// sem hash próprio — existe só dentro de OwnedAffiliateClickEvent.

type OwnedAffiliateClickEvent = {
  ownedAffiliateClickEventId: string;
  tenantId: string;
  clickEventKey: string; // estável, produzido pela superfície emissora
  affiliateLinkArtifactId: string;
  affiliateLinkArtifactHash: string;
  captureBasis: OwnedAffiliateClickCaptureBasis;
  sourceRef?: OwnedAffiliateClickSourceRef;
  trackingIdentityHash: string;
  eventHash: string;
  occurredAt: string;
};
// hash: OWNED_AFFILIATE_CLICK_EVENT_V1:sha256:<hex> sobre tenantId,
// clickEventKey, affiliateLinkArtifactHash, captureBasis, sourceRef,
// trackingIdentityHash, occurredAt.
```

**Idempotência**: UNIQUE lógico `(tenantId, clickEventKey)`. Mesmo
evento reenviado → mesmo `OwnedAffiliateClickEvent`; nunca deduplicar
por heurística (mesmo usuário/mesmo segundo/mesmo produto) — apagaria
cliques reais. Conflito de payload sob a mesma chave →
`OWNED_AFFILIATE_CLICK_EVENT_REPLAY_CONFLICT` (FATAL_ERROR).

**Regras centrais** (fecham exatamente o que a Skill 18 já vinha
apontando, agora com dono formal):
- Nunca derivado de estimativas do provider, impressões, ou atribuição
  heurística — só nasce quando a superfície emissora conhece
  `AffiliateLinkArtifact`/tracking identity antes do clique acontecer.
- `trackingIdentityHash` nunca contém subId/token/querystring/URL bruto
  se a classificação de dado (Skill 25) marcar como sensível.
- Não exige PII (IP, telefone, username, user-agent, fingerprint) —
  identidade comercial não depende disso; se dado antifraude for
  necessário no futuro, Skill 25 governa retenção/proteção à parte.
- Este evento **não é** conversão, pedido, comissão, nem atribuição de
  compra.
- Este evento **não é** clique confirmado pelo provider —
  `AffiliateAttributionEvidence`/evidência de provider é um artefato
  separado, e nunca reescreve retroativamente este evento histórico.
- A Skill 18 pode consumir este evento numa observation de métrica, mas
  nunca pode "promover" um clique próprio para
  `attributionLevel = DIRECT_PROVIDER_CONFIRMED` só por causa dele.

Novo `FATAL_ERROR`: `OWNED_AFFILIATE_CLICK_EVENT_REPLAY_CONFLICT`
(adicionar à lista de `FATAL_ERROR` acima).

Ver também "Reparo transversal pós-revisão Fable → Ponto F2" no
`SPEC.md` da Skill 18 (marca as duas declarações antigas como
`REFERENCE ONLY`, dono canônico agora é este arquivo).

**`publicationInstanceKey`:** ausente hoje (Skill 17 não existe) não é
erro. Quando presente futuramente e a policy disser
`INCLUDE_WHEN_PRESENT`, passa a integrar a identity — mas nunca muda
retroativamente identities antigas.

## Fronteira de custo/quota

A Skill 15 não decide orçamento nem quota global — isso é Skill 23; a
Skill 15 só executa quando permitido. Como `generateShortLink`
provavelmente não é "cobrança por link", não criamos
`spendAuthorizationRef` obrigatório agora, mas reservamos
`providerOperationAuthorizationRef?: string` caso a Skill 23 futuramente
controle rate limit/daily API quota/tenant provider quota — sem inventar
custo financeiro inexistente.

## Observabilidade

### Logs

Por execução: `tenantId`, `runId`, `jobId`, `attemptNumber`,
`promotedProductId`, `sourceOfferSnapshotId`, `publicationTargetKey`,
`finalizedVideoRenditionId`/`hash`, `trackingPolicyId`/`version`/
`snapshotHash`, `trackingIdentityId`/`hash`, `trackingToken?`
(idealmente mascarado/parcial no log), `subIdEncodingPolicyId`/`version`,
`encodedSubIdsHash`, `providerProfileKey`/`version`, `providerKey`,
`checkpointState`, `providerRequestKey`/`hash`, `providerResponseHash?`,
`affiliateLinkArtifactId?`/`artifactHash?`, `capabilitySnapshotHash?`,
`durationMs`, `errorCode?`. Não logar `providerAffiliateUrl` completo
por padrão (pode conter parâmetros/token que não precisam se espalhar em
logs) — persistido no artifact, mas no log operacional só ID/hash.

**Logs de subIds:** não despejar todos os valores indiscriminadamente —
preferir `encodedSubIdsHash`, `slotCount`, semantic slots utilizados; se
debug realmente exigir valores, precisa ser logging sanitizado/
controlado.

### `AuditEvent`

Criado em: `TrackingIdentity` criada, `trackingToken` alocado,
`EncodedSubIdSet` materializado, transições de checkpoint
(`PREPARED→SUBMITTING→RESPONSE_CAPTURED→VALIDATED/REJECTED`),
`AffiliateLinkArtifact` criado, external state unknown, provider subId
rejection, tracking token conflict, request payload conflict, artifact
replay conflict, tenant mismatch. Não precisa evento separado por slot.

### Métricas

```text
affiliate_link_generation_total
affiliate_link_generation_success_total
affiliate_link_generation_reused_total

affiliate_link_provider_request_total
affiliate_link_provider_transient_error_total
affiliate_link_provider_rate_limited_total

affiliate_link_external_state_unknown_total

affiliate_tracking_identity_created_total
affiliate_tracking_token_collision_total

affiliate_subid_encoding_total
affiliate_subid_provider_rejected_total

legacy_tracking_bypass_detected_total

affiliate_attribution_capability_status
```

`legacy_tracking_bypass_detected_total` só passa a ter sentido quando o
runtime validar isso. `affiliate_attribution_capability_status` melhor
como gauge/telemetria controlada, não labels explosivas.

**Sem métricas de negócio inventadas:** a Skill 15 mede links
gerados/reutilizados, subIds rejeitados, capability conhecida/
desconhecida — nunca `creative_conversion_rate`, `video_revenue`, ou
ROAS por vídeo sem evidência downstream adequada.

## Plano de testes

72 casos críticos (62 principais + 10 de atribuição/capability), além
dos testes futuros com Shopee real.

**Input e lineage:** (1) produto inexistente → fatal. (2) snapshot
inexistente → fatal. (3) snapshot pertence a outro produto → fatal. (4)
`originUrl` diverge do snapshot → fatal. (5) rendition inexistente →
fatal. (6) `renditionHash` divergente → fatal. (7) target da rendition
diverge do input → fatal. (8) `StageSubjectBinding` aponta pra outro
produto → fatal. (9) tenant divergente → fatal.

**Tracking policy/profile:** (10) tracking policy binding ausente →
policy blocked. (11) policy ausente/inválida → fatal/configuração. (12)
provider profile inexistente → blocked/configuração. (13) replay usa
profile resolution congelada. (14) mudança posterior de profile não
altera artifact antigo.

**Tracking identity:** (15) mesmos campos semânticos → mesmo
`identityHash`. (16) mudar produto → `identityHash` muda. (17) mudar
offer snapshot → muda. (18) mudar target → muda. (19) mudar
`renditionHash` → muda. (20) mudar policy snapshot → muda. (21)
`attemptNumber` diferente não muda `identityHash`. (22) `jobId`
diferente não muda `identityHash`. (23) `publicationInstanceKey`
ignorada quando `policy=IGNORE`. (24) `publicationInstanceKey` incluída
quando `policy=INCLUDE_WHEN_PRESENT`.

**Token:** (25) identity nova aloca um token. (26) replay reutiliza o
mesmo token. (27) token não é derivado obrigatoriamente de truncamento
do hash. (28) colisão antes do vínculo gera outro token. (29) token já
ligado a outra identity → fatal. (30) token nunca é remapeado.

**SubIds:** (31) `values.length` nunca excede 5. (32) posições são
únicas. (33) `TRACKING_TOKEN` obrigatório está presente. (34) slot
`TRACKING_TOKEN` contém exatamente o token da identity. (35) mesma
identity/policy → mesmo `encodedSubIdsHash`. (36) tentativa de inserir
domínio inteiro excedendo policy é rejeitada localmente. (37) policy
`UNVERIFIED` → não chama provider. (38) provider retorna `[11001]` →
`AFFILIATE_PROVIDER_SUBID_REJECTED`. (39) rejection conhecida não vira
`EXTERNAL_STATE_UNKNOWN`.

**Idempotência:** (40) artifact já existente pra identity → zero
provider call. (41) retry técnico do Job reutiliza artifact. (42) mesma
identity não cria segunda URL silenciosamente. (43) request key igual +
payload diferente → fatal. (44) replay de checkpoint
`RESPONSE_CAPTURED` → zero chamada. (45) replay `VALIDATED` → mesmo
artifact. (46) artifact replay incompatível → fatal.

**Chamada externa:** (47) `PREPARED` existe antes da rede. (48)
`SUBMITTING` persiste antes da chamada. (49) resposta válida vira
`RESPONSE_CAPTURED`. (50) response capturada + validação cria artifact.
(51) crash pós-submit pré-response-persist → reconcile/`UNKNOWN`. (52)
sem idempotency/lookup → `BLOCKED`, nunca retry cego. (53) provider
idempotent permite retransmitir mesma request lógica. (54) rate limit
antes de confirmação do side effect pode ser retryable.

**Artifact:** (55) `providerAffiliateUrl` é a única URL publicável. (56)
`originUrl` nunca é tratado como affiliate URL. (57) `attemptNumber` não
entra em `artifactHash`. (58) `artifactHash` muda se
`providerAffiliateUrl` mudar. (59) artifact carrega lineage da rendition
exata. (60) tenants diferentes nunca compartilham artifact. (61) targets
diferentes geram identities distintas. (62) Skill 17 futura consegue
validar rendition target + artifact target.

### Testes de atribuição/capability (conceitualmente importantes)

(63) `providerConversionReturnsSubId=UNVERIFIED` não bloqueia geração do
link. (64) capability snapshot antigo não é mutado quando nova
capability é descoberta. (65) `DIRECT_PROVIDER_CONFIRMED` sem chave
oficial de correlação → integrity violation. (66) timestamp dentro de 7
dias sozinho não permite `DIRECT_PROVIDER_CONFIRMED`. (67)
`OWN_CLICK_CONFIRMED_ONLY` não pode preencher conversion como provada.
(68) `PROVIDER_AGGREGATE_ONLY` pode ter comissão real sem
trackingIdentity. (69) `INFERRED_HEURISTIC` nunca promove
automaticamente pra direto. (70) `purchasedProductId` ausente permanece
`UNKNOWN`. (71) `purchasedProductId` diferente do `promotedProductId` é
permitido. (72) comissão oficial sem subId continua financeiramente
real, mas não atribuída ao criativo.

### Testes futuros com Shopee real

```text
identity → token → subIds → generateShortLink → short_link
→ persist → restart → replay → mesmo artifact
```

Teste obrigatório: matar o processo imediatamente após `generateShortLink`
retornar mas antes do commit final, provando que a recuperação não gera
outro link cegamente. Mais adiante, auditoria específica da API Shopee
(introspection GraphQL/documentação oficial: `conversionReport` possui
`subId`? possui `clickId`? existe join oficial?) — isso altera apenas o
capability snapshot, não a identidade de tracking já congelada.

## Fechamento conceitual

1. `offer_snapshots.offer_link` é origem da oferta; somente
   `AffiliateLinkArtifact.providerAffiliateUrl` é link afiliado
   publicável no novo pipeline.
2. Retry técnico não cria nova identidade comercial, novo tracking
   token, ou novo link.
3. Gerar um link com subIds prova que enviamos uma identidade de
   tracking ao provider; não prova que o provider devolverá essa
   identidade numa conversão futura.
4. Comissão real e atribuição ao criativo são fatos distintos: nunca
   atribuímos receita a um vídeo sem evidência suficiente pro nível
   declarado.

## Status de implementação (nesta fase de especificação)

```text
Skill 15 tracking pipeline → NOT_IMPLEMENTED
(mecanismo Shopee generateShortLink → JÁ EXISTE, mas desconectado do
 pipeline de vídeo e do post real do Instagram)
```
