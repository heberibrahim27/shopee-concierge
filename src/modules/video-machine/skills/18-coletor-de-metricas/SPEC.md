# Skill 18 — Coletor de Métricas

> **APROVADA EM ESPECIFICAÇÃO — 18/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 3 rodadas com ChatGPT (decisões
> fundacionais → contratos centrais → fechamento operacional/erros/
> testes), com auditoria real do repositório prévia (mesmo método das
> Skills 04-17). A Skill 18 terminou sem misturar três coisas que
> precisavam permanecer separadas: métrica observada, correlação
> determinística e atribuição comercial. O patch `OwnedAffiliateClickEvent`
> na Skill 15 também fica aprovado como extensão contratual compatível,
> sem reabrir a aprovação da Skill 15.

## Garantia central (congelada após rodada 1 de debate)

A Skill 18 coleta, normaliza e persiste observações imutáveis de
métricas e evidências provenientes de fontes autorizadas, ligando-as a
uma publicação, link ou contexto comercial somente quando existe uma
chave determinística suficiente. Ela preserva a evolução temporal dos
valores e o nível real de evidência, nunca transforma proximidade
temporal em atribuição, nunca presume que produto promovido = produto
comprado e nunca interpreta se o desempenho foi bom ou ruim — isso
pertence à Skill 19.

Cadeia geral:

```text
SocialPublicationBinding → identidade externa exata → MetricCollectionPolicy
  → provider read → raw observation → normalização
  → append-only MetricSnapshot → Skill19

Shopee conversion report → CommerceObservation
  → capability/attribution rules da Skill15 → AffiliateAttributionEvidence
  → Skill19
```

## Decisões fundacionais (rodada 1 — debate com ChatGPT, 2026-09-18)

1. **Windsor não é VERIFIED nem UNVERIFIED como bloco único.** Capability
   granular por campo: `MetricReadCapabilityStatus = VERIFIED |
   PARTIALLY_VERIFIED | UNVERIFIED | UNSUPPORTED | NOT_IMPLEMENTED`.
   Hoje: `schemaDiscovery=VERIFIED`, mas `mediaMetricRead`,
   `storyMetricRead`, `accountMetricRead`, `mediaIdentityJoin` todos
   `UNVERIFIED` até uma consulta real por `providerMediaId`/
   `providerStoryId` específico provar o join. Campo existir no schema
   prova disponibilidade declarada, não prova leitura/granularidade/
   correlação funcionando.
2. **Toda métrica declara escopo de entidade e chave de identidade.**
   `MetricEntityScope = PUBLICATION | MEDIA | STORY | ACCOUNT |
   AFFILIATE_CONVERSION | AFFILIATE_ACCOUNT`. Regra: uma métrica só
   pode ser ligada a um `SocialPublicationBinding` se a granularidade
   dela bater exatamente com o escopo/chave (ex.: `media_views` exige
   `providerMediaId` comprovado; `user_insights_day_total_value` é
   `ACCOUNT`, nunca atribuível a um vídeo específico).
3. **`SocialPublicationBinding` é a autoridade de correlação orgânica.**
   Quando o join é exato (`providerKey`/`providerAccountId`/
   `providerMediaId`/`providerStoryId`), métricas orgânicas podem ser
   legitimamente associadas a `FinalizedVideoRendition`/
   `AffiliateLinkArtifact`/`promotedProductId`/`CreativeCtaIntent` via
   lineage do binding — mas "8.000 views" (métrica direta) e "R$ 42 de
   comissão" (comercial) são domínios de evidência diferentes e não
   compartilham contrato.
4. **Duas famílias formais de observação** (resposta à pergunta 5):
   `PublicationPerformanceObservation` (métricas orgânicas ligadas
   exatamente ao post via binding — zero ambiguidade de atribuição,
   apenas possível ambiguidade de semântica da métrica) vs.
   `CommerceObservation` (dados Shopee: `conversionId`,
   `conversionStatus`, `purchaseTime`, `clickTime`, `totalCommission`,
   `orderIds` — fatos reais do provider, mas hoje não ligáveis a
   `trackingIdentity`/`AffiliateLinkArtifact`/`SocialPublicationBinding`/
   vídeo). "Comissão observada ≠ comissão atribuída ao criativo" — a
   separação vive no modelo de dados, não só na documentação.
5. **Skill 18 (não Skill 19) protege o nível de evidência.** Skill 18
   coleta e materializa a evidência factual; quando determinístico
   pelas regras da Skill 15, também materializa
   `AffiliateAttributionEvidence` no nível apropriado
   (`UNATTRIBUTED`/`PROVIDER_AGGREGATE_ONLY` conforme o contrato
   final). Skill 19 nunca pode elevar silenciosamente o nível de
   evidência — pode apenas dizer "há correlação temporal possível"
   para análise heurística futura, sem alterar a evidência canônica.
6. **A janela de 7 dias da Shopee não é chave de atribuição — é regra.**
   `AttributionRule`/`ProviderRule`, não `AttributionEvidence`. Ajuda a
   determinar possibilidade temporal, nunca cria a relação. Quase-
   invariante: produto promovido ≠ produto comprado; conversão dentro
   da janela ≠ prova de qual publicação originou o clique.
7. **Gap de `click_events` não fica assim para sempre, mas Skill 18 não
   "inventa" tracking retroativo.** Skill 15 já é dona de
   `AffiliateTrackingIdentity`/`trackingToken`/`AffiliateLinkArtifact`,
   logo é dona natural do novo contrato **`OwnedAffiliateClickEvent`**
   (dono canônico: Skill 15 — `REFERENCE ONLY` aqui, ver "Reparo
   transversal pós-revisão Fable → Ponto F2" no `SPEC.md` da Skill 15
   para a definição completa, incluindo `OwnedAffiliateClickCaptureBasis`
   e `OwnedAffiliateClickSourceRef`; esta Skill não redeclara o tipo).
   O emissor runtime pode ser site/redirect route/bot, mas a identidade
   vem da Skill 15; Skill 18 apenas consome/normaliza/agrega, nunca
   gera identidade retroativamente. `click_events` legado (tabela real)
   fica classificado explicitamente `EXISTING / LEGACY /
   UNCORRELATED_TO_AFFILIATE_IDENTITY` — sem migration fictícia; nenhum
   registro histórico pode ser retroativamente associado a um
   `AffiliateLinkArtifact` sem evidência real.
8. **Limitação física real:** se o clique acontece direto do Instagram
   pro `providerAffiliateUrl` da Shopee (Instagram → Shopee), nosso
   site não está no caminho — não existe evento nosso, a menos que o
   provider reporte ou usemos futuramente uma rota intermediária
   própria permitida pelas regras do programa de afiliados (não se
   presume isso hoje sem verificação de compliance). `OwnedAffiliateClickEvent`
   resolve cliques que passam pela nossa superfície, não todos os
   cliques do ecossistema — a capability declara isso.
9. **Cadência híbrida — só Skill 18 toca o provider.** Event-triggered
   scheduling + cron reconciler + on-demand freshness request. Skill 19
   nunca chama Windsor/Shopee diretamente. Cadência concreta (ex.: "1h
   por 24h depois 6h") não é congelada agora — vira
   `MetricCollectionPolicy` versionada/configurável via
   `MetricCollectionCadenceBand { publicationAgeMinMs,
   publicationAgeMaxMs?, minimumRefreshIntervalMs }`. Cron é
   reconciler ("quais séries estão due?"), não relógio da verdade — se
   atrasar, não inventamos snapshot intermediário, só coletamos o
   valor observado quando de fato lemos. Leitura on-demand também
   persiste resultado (nunca é efêmera) — garante replay/auditoria.
10. **Métricas mutáveis viram série append-only** (resposta à pergunta
    4): nunca sobrescrevemos snapshot anterior — cada leitura nova gera
    um novo `MetricSnapshot`, nunca `version 1,2,3` como significado
    temporal (isso parece revisão de documento); usamos
    `observedAt`/`providerDataAsOf` (este último `unknown` se o
    provider não fornecer — nunca default pra `observedAt` por
    conveniência). Contrato completo de `MetricSnapshot` (hash
    `METRIC_SNAPSHOT_V1`) definido mais abaixo — não redeclarado aqui.
11. **Semântica por métrica, não assumida pelo nome do campo.**
    `MetricValueSemantics = CUMULATIVE_COUNTER | PERIOD_COUNTER | GAUGE
    | RATIO | DIMENSIONED_VALUE` — classificação concreta de cada campo
    Windsor só após verificação real, nunca só pelo nome. Delta é
    derivado pela Skill 19 quando `semantics=CUMULATIVE_COUNTER`,
    Skill 18 não salva `deltaViews` como verdade primária.
12. **Nunca existe "métrica definitiva".** Série tem
    `MetricSeriesCollectionState = ACTIVE | QUIESCENT |
    CLOSED_BY_POLICY` — `CLOSED_BY_POLICY` significa que paramos de
    coletar automaticamente, não que o valor nunca mais mudará.
    Identidade de série = tenant + provider + providerAccount +
    `SocialPublicationBinding` + `MetricEntityScope` + identidade da
    métrica + dimensões (ex.: vídeo A + views + demographic age=18-24
    só é série própria se essa granularidade for realmente suportada).
13. **Evidência bruta do provider sobrevive à normalização** — lineage
    obrigatório (provider field, hash da resposta normalizada,
    identidade da query, capability snapshot, tempo de coleta, chave de
    entidade usada), não necessariamente o payload bruto completo pra
    sempre (retenção/privacidade fica pra depois).
14. **Ownership final congelado:** Skill 15 = identidade de
    link/tracking + regras/capabilities de atribuição +
    `OwnedAffiliateClickEvent`; Skill 17 = identidade de publicação/
    `SocialPublicationBinding`; **Skill 18 = coleta + normalização +
    séries temporais + evidência observada + materialização
    determinística de `AffiliateAttributionEvidence`**; Skill 19 =
    análise/comparação/interpretação; Skill 21 = apresentação/
    relatórios. Isso impede Skill 19 de virar um "coletor improvisado".

### Cinco garantias fundacionais (ChatGPT, fechamento da rodada 1)

1. Um campo existir no schema do provider prova disponibilidade
   declarada; não prova que a leitura, granularidade e correlação
   daquela métrica funcionam até uma consulta real validada.
2. Métricas orgânicas diretamente ligadas à identidade externa da
   publicação e dados comerciais de afiliado pertencem a domínios de
   evidência distintos.
3. Cada coleta é uma observação temporal imutável; valores novos não
   sobrescrevem o passado e nenhum snapshot é chamado de "definitivo"
   sem evidência explícita.
4. A janela de atribuição define possibilidade temporal, não
   causalidade. Comissão real pode existir sem qualquer criativo
   individual ser comprovadamente responsável por ela.
5. Skill 18 coleta e preserva evidência; Skill 19 interpreta. Nenhuma
   análise posterior pode elevar silenciosamente o nível de atribuição
   que a evidência coletada suporta.

## Contratos centrais (rodada 2 — debate com ChatGPT, 2026-09-18)

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


Decisão estrutural: `MetricCollectionInput` é uma **união discriminada
por domínio**, não um objeto com campos opcionais — coleta orgânica,
relatório comercial Shopee e ingestão de clique próprio têm
autoridades/granularidades diferentes. Um `MetricCollectionRun`
representa uma oportunidade lógica de leitura de um único
domínio/fonte, com `collectionRequestKey` estável: retry técnico
reutiliza o mesmo Run; uma coleta futura legítima recebe outra
`collectionRequestKey`. Isso resolve a tensão entre idempotência e
série temporal — não duplicamos por retry, mas não impedimos novas
observações futuras.

### Domínios e input

```typescript
type MetricCollectionDomain =
  | 'PUBLICATION_PERFORMANCE'
  | 'ACCOUNT_PERFORMANCE'
  | 'AFFILIATE_COMMERCE'
  | 'OWNED_AFFILIATE_CLICK';

type MetricCollectionTrigger =
  | { type: 'SCHEDULED';
      schedulePolicyKey: string;
      scheduledOccurrenceAt: string; // PATCH (Ponto M8, reparo
        // transversal pós-revisão Fable, 2026-09-18): instante nominal
        // em que ESSA ocorrência do schedule deveria acontecer — RFC3339
        // UTC, precisão de milissegundos, sufixo Z (ex.:
        // "2026-09-18T22:00:00.000Z"). Nunca o horário em que o
        // cron/worker realmente acordou/processou. Capturado no momento
        // em que a admissão do schedule identifica a ocorrência devida
        // (o valor de `nextEligibleCollectionAt` naquele instante) — uma
        // vez capturado pra uma ocorrência, é imutável.
      scheduleSlotKey: string; // deriva de (schedulePolicyKey,
        // scheduledOccurrenceAt) — NUNCA de round(now)/floor(now/
        // interval)/current minute/qualquer timestamp operacional
        // (createdAt/requestedAt/receivedAt/startedAt). Duas instâncias
        // admitindo a MESMA ocorrência sempre produzem a MESMA key.
    }
  | { type: 'ON_DEMAND_REFRESH'; refreshRequestId: string; }
  | { type: 'EVENT_DRIVEN'; sourceEventId: string; }
  | { type: 'RECONCILIATION'; reconciliationKey: string; };

type MetricCollectionInputBase = {
  tenantId: string;
  runId: string;
  collectionDomain: MetricCollectionDomain;
  collectionRequestKey: string;
  trigger: MetricCollectionTrigger;
  metricCollectionPolicyKey: string;
  resolvedPolicy: {
    policyId: string;
    policyVersion: string;
    policySnapshotHash: string;
    bindingResolutionHash: string;
  };
};

type PublicationPerformanceCollectionInput = MetricCollectionInputBase & {
  collectionDomain: 'PUBLICATION_PERFORMANCE';
  socialPublicationBindingId: string;
  socialPublicationBindingHash: string;
  providerKey: string;
  providerAccountId: string;
  publicationTargetKey: string;
  providerPublicationId?: string;
  providerMediaId?: string;
  providerStoryId?: string;
  promotedProductId: string;
};

type AccountPerformanceCollectionInput = MetricCollectionInputBase & {
  collectionDomain: 'ACCOUNT_PERFORMANCE';
  providerKey: string;
  providerAccountId: string;
  metricWindow: { startAt: string; endAt: string; };
};

type AffiliateCommerceCollectionInput = MetricCollectionInputBase & {
  collectionDomain: 'AFFILIATE_COMMERCE';
  affiliateProviderKey: string;
  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;
  reportWindow: { startAt: string; endAt: string; };
  attributionCapabilitySnapshotId: string;
  attributionCapabilitySnapshotHash: string;
};

type OwnedAffiliateClickCollectionInput = MetricCollectionInputBase & {
  collectionDomain: 'OWNED_AFFILIATE_CLICK';
  ownedAffiliateClickEventId: string;
  ownedAffiliateClickEventHash: string;
};

type MetricCollectionInput =
  | PublicationPerformanceCollectionInput
  | AccountPerformanceCollectionInput
  | AffiliateCommerceCollectionInput
  | OwnedAffiliateClickCollectionInput;
// hash: METRIC_COLLECTION_INPUT_V1:sha256:<hex>
// inclui todo conteúdo semântico da variante (collectionRequestKey,
// policy congelada, subject exato, janela quando houver) — não inclui
// runId nem timestamps operacionais.
```

Na V1, `OWNED_AFFILIATE_CLICK` trata principalmente ingestão de eventos
já correlacionados pela Skill 15 (não gera identidade).

**`collectionRequestKey`**: `tenant + binding + policy + scheduleSlotKey`.
PATCH (Ponto M8): exemplo corrigido — `scheduleSlotKey` deriva da
ocorrência nominal `2026-09-18T12:00:00.000Z`, não de "12h" como bucket
arredondado de `now()`. Cron chegando às 12:00:07, 12:01:43 ou um retry
às 12:03 sempre calculam a mesma ocorrência nominal → mesmo
`scheduleSlotKey` → mesmo `K1` (mesmo `MetricCollectionRun`). A
ocorrência nominal seguinte do mesmo schedule (ex.: 18:00:00.000Z) vira
`K2` (nova observação temporal legítima) — a diferença nunca vem de
"quanto tempo passou desde a última", vem da definição do schedule.
On-demand: `refreshRequestId` determina nova `collectionRequestKey` —
pedir refresh duas vezes com o mesmo `refreshRequestId` não produz duas
leituras lógicas.

### Capability granular

```typescript
type MetricReadCapabilityStatus =
  | 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED'
  | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';

type MetricEntityScope =
  | 'PUBLICATION' | 'MEDIA' | 'STORY' | 'ACCOUNT'
  | 'AFFILIATE_CONVERSION' | 'AFFILIATE_ACCOUNT';

type MetricValueSemantics =
  | 'CUMULATIVE_COUNTER' | 'PERIOD_COUNTER' | 'GAUGE'
  | 'RATIO' | 'DIMENSIONED_VALUE' | 'UNKNOWN';
// UNKNOWN permitido enquanto a semântica real não for verificada.

type MetricFieldCapability = {
  providerField: string;
  canonicalMetricKey: string;
  entityScope: MetricEntityScope;
  readStatus: MetricReadCapabilityStatus;
  identityJoinStatus: MetricReadCapabilityStatus;
  valueSemantics: MetricValueSemantics;
  unit: 'COUNT' | 'PERCENT' | 'CURRENCY' | 'MILLISECONDS' | 'OTHER';
  supportsDimensions: MetricReadCapabilityStatus;
  verifiedDimensionKeys?: string[];
  evidenceRefs: string[];
  // PATCH (Ponto F3, reparo transversal pós-revisão Fable, 2026-09-18):
  // opcional de propósito — snapshots antigos não têm este campo, e a
  // ausência deve ser tratada como UNVERIFIED/legado-desconhecido, nunca
  // como disponível. `readStatus` = consigo ler a métrica hoje;
  // `historicalReadStatus` = consigo pedir ao provider um ponto
  // histórico válido (são perguntas diferentes — um provider pode
  // permitir métrica atual mas não consulta histórica arbitrária).
  // Tipo dedicado (não reaproveita MetricReadCapabilityStatus, que só
  // descreve leitura atual). Ver "Reparo transversal pós-revisão Fable
  // → Ponto F3" mais abaixo.
  historicalReadStatus?: MetricHistoricalReadStatus;
};

type MetricProviderCapabilities = {
  providerKey: string;
  schemaDiscovery: MetricReadCapabilityStatus;
  publicationRead: MetricReadCapabilityStatus;
  mediaRead: MetricReadCapabilityStatus;
  storyRead: MetricReadCapabilityStatus;
  accountRead: MetricReadCapabilityStatus;
  publicationIdentityJoin: MetricReadCapabilityStatus;
  mediaIdentityJoin: MetricReadCapabilityStatus;
  storyIdentityJoin: MetricReadCapabilityStatus;
  pagination: MetricReadCapabilityStatus;
  providerDataAsOfSupport: MetricReadCapabilityStatus;
  metricFields: MetricFieldCapability[];
  evidenceRefs: string[];
  capabilitySnapshotHash: string;
  observedAt: string;
};
// hash: METRIC_PROVIDER_CAPABILITIES_V1 — snapshot imutável; nova
// chamada real cria outro snapshot, nunca altera o antigo.
```

Estado real hoje (Windsor): `schemaDiscovery=VERIFIED`,
`connector/auth account=VERIFIED` (evidência de integração),
`publicationRead`/`mediaRead`/`storyRead`/`*IdentityJoin`=`UNVERIFIED`
até consulta validada.

### Policy de coleta

```typescript
type MetricCollectionCadenceBand = {
  publicationAgeMinMs: number;
  publicationAgeMaxMs?: number;
  minimumRefreshIntervalMs: number;
};

type MetricCollectionDefinition = {
  canonicalMetricKey: string;
  providerField: string;
  entityScope: MetricEntityScope;
  expectedValueSemantics: MetricValueSemantics;
  required: boolean;
  allowedDimensionKeys: string[];
};

type MetricCollectionPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;
  collectionDomain: MetricCollectionDomain;
  providerKey: string;
  metricDefinitions: MetricCollectionDefinition[];
  cadence?: {
    bands: MetricCollectionCadenceBand[];
    collectionStatePolicy: 'CONTINUE_WHILE_DUE' | 'CLOSE_BY_POLICY';
    onDemand?: { minimumRefreshIntervalMs?: number; };
  };
  providerWindowPolicy?: { lookbackMs?: number; overlapMs?: number; };
  attributionMaterialization: {
    enabled: boolean;
    allowHeuristicCanonicalEvidence: false;
  };
  createdAt: string;
};
// hash: METRIC_COLLECTION_POLICY_V1

type MetricCollectionPolicyBinding = {
  tenantId: string;
  collectionDomain: MetricCollectionDomain;
  providerKey: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
}; // mutável, sem hash integral

type MetricCollectionPolicyBindingResolution = {
  tenantId: string;
  collectionDomain: MetricCollectionDomain;
  providerKey: string;
  policyKey: string;
  policyId: string;
  policyVersion: string;
  policySnapshotHash: string;
  resolvedAt: string;
  bindingResolutionHash: string;
};
// hash: METRIC_COLLECTION_POLICY_BINDING_RESOLUTION_V1
```

### Identidade de entidade e série

```typescript
type MetricEntityRef =
  | { scope: 'MEDIA'; socialPublicationBindingId: string; socialPublicationBindingHash: string; providerMediaId: string; }
  | { scope: 'STORY'; socialPublicationBindingId: string; socialPublicationBindingHash: string; providerStoryId: string; }
  | { scope: 'ACCOUNT'; providerKey: string; providerAccountId: string; };
// evita colar media_views num post sem saber qual entidade o
// provider realmente mediu.

type MetricDimension = { key: string; value: string; };
// ordenadas por key ASC, keys únicas, values normalizados; nenhuma
// dimensão arbitrária de provider entra sem policy/capability permitindo.

type MetricSeriesIdentity = {
  metricSeriesIdentityId: string;
  tenantId: string;
  providerKey: string;
  providerAccountId: string;
  entityRef: MetricEntityRef;
  canonicalMetricKey: string;
  providerField: string;
  valueSemantics: MetricValueSemantics;
  unit: 'COUNT' | 'PERCENT' | 'CURRENCY' | 'MILLISECONDS' | 'OTHER';
  dimensions: MetricDimension[];
  metricDefinitionHash: string;
  seriesIdentityHash: string;
  createdAt: string;
};
// hash: METRIC_SERIES_IDENTITY_V1 — inclui tenant/provider/account,
// entityRef, canonicalMetricKey, providerField, valueSemantics, unit,
// dimensões canônicas, metricDefinitionHash. Não inclui timestamp/ID.
```

Se `metricDefinitionHash` mudar (ex.: descobrimos que
`media_engagement` não significa o que pensávamos), nasce uma **nova**
`MetricSeriesIdentity` — nunca reinterpretamos snapshots históricos
silenciosamente.

### Collection run

```typescript
type MetricCollectionRunState =
  | 'PREPARED' | 'QUERYING' | 'RESPONSE_CAPTURED'
  | 'NORMALIZING' | 'OBSERVATIONS_MATERIALIZED' | 'COMPLETED';
// sem FAILED/BLOCKED aqui — Skill02 continua dona do Job lifecycle.

type MetricCollectionRun = {
  metricCollectionRunId: string;
  tenantId: string;
  collectionRequestKey: string;
  collectionDomain: MetricCollectionDomain;
  providerKey: string;
  providerAccountId?: string;
  policyId: string;
  policyVersion: string;
  policySnapshotHash: string;
  capabilitySnapshotId: string;
  capabilitySnapshotHash: string;
  state: MetricCollectionRunState;
  collectionContextHash: string;
  queryStartedAt?: string;
  responseCapturedAt?: string;
  normalizedProviderResponseHash?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};
// hash imutável METRIC_COLLECTION_RUN_CONTEXT_V1 sobre
// collectionRequestKey + input hash + domain + provider/account +
// policy snapshot + capability snapshot (não o objeto mutável inteiro).
```

**Idempotência**: UNIQUE lógico `(tenantId, collectionRequestKey)`.
Mesmo request → mesmo Run. Mesma key com outro input hash →
`METRIC_COLLECTION_REQUEST_REPLAY_CONFLICT` (nunca sobrescrever).

**`RESPONSE_CAPTURED` é a fronteira temporal**: uma coleta passa a
representar uma observação específica quando a resposta do provider é
capturada de forma durável. A partir daí, replay não substitui essa
resposta por uma leitura mais recente — se cair antes de capturar, uma
nova leitura ainda pertence ao mesmo Run; se cair depois, usa a
resposta já capturada. Nunca volta ao provider só porque o processo
reiniciou.

### Observação e snapshot

```typescript
type MetricObservationStatus =
  | 'OBSERVED_VALUE' | 'EXPLICIT_ZERO' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE';
// nunca converter ausência em zero.

type MetricNumericValue = {
  representation: 'INTEGER' | 'DECIMAL';
  canonicalValue: string;
};

type MetricObservation = {
  metricObservationId: string;
  tenantId: string;
  metricCollectionRunId: string;
  metricSeriesIdentityId: string;
  metricSeriesIdentityHash: string;
  canonicalMetricKey: string;
  providerField: string;
  status: MetricObservationStatus;
  value?: MetricNumericValue;
  unit: 'COUNT' | 'PERCENT' | 'CURRENCY' | 'MILLISECONDS' | 'OTHER';
  currency?: string;
  dimensions: MetricDimension[];
  providerDataAsOf?: string;
  sourceEvidenceHash: string;
  observationHash: string;
};
// hash: METRIC_OBSERVATION_V1. Invariantes: OBSERVED_VALUE exige
// value; EXPLICIT_ZERO exige value = zero canônico;
// NOT_AVAILABLE/NOT_APPLICABLE exigem value ausente. observedAt não
// precisa existir em cada observation (pertence ao snapshot/run) —
// providerDataAsOf pode variar por métrica, então vive na observation.

type MetricSnapshot = {
  metricSnapshotId: string;
  tenantId: string;
  metricCollectionRunId: string;
  collectionRequestKey: string;
  collectionDomain: 'PUBLICATION_PERFORMANCE' | 'ACCOUNT_PERFORMANCE';
  subject: {
    socialPublicationBindingId?: string;
    socialPublicationBindingHash?: string;
    providerKey: string;
    providerAccountId: string;
  };
  observedAt: string;
  providerDataAsOf?: string;
  normalizedProviderResponseHash: string;
  metricObservationIds: string[];
  metricObservationHashes: string[];
  snapshotHash: string;
  createdAt: string;
};
// hash: METRIC_SNAPSHOT_V1 — inclui collectionRequestKey, subject,
// observedAt, providerDataAsOf?, provider response hash, observations
// ordenadas canonicamente por seriesIdentityHash. observedAt entra de
// propósito: o tempo é parte da identidade da observação temporal.
```

**Idempotência do snapshot (V1)**: UNIQUE lógico
`(metricCollectionRunId, collectionDomain)` quando um Run representa
exatamente um subject. Mesmo run → mesmo snapshot; novo schedule slot →
novo run → novo snapshot. Nenhum `UPDATE views=...`.

**Nunca existe `latestValue` como autoridade dentro da Skill 18** —
pode-se consultar o snapshot mais recente como conveniência, mas o
modelo canônico continua `S1, S2, S3...`; uma eventual tabela
materializada de "current metrics" é cache/projeção reconstruível, não
verdade primária.

### CommerceObservation

O relatório Shopee não vira `MetricObservation` de publicação — cada
conversão/report row é fato comercial. Identidade interna: provider +
provider account/profile + `conversionId` (quando existir).

```typescript
type CommerceObservation = {
  commerceObservationId: string;
  tenantId: string;
  metricCollectionRunId: string;
  collectionRequestKey: string;
  affiliateProviderKey: string;
  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;
  providerConversionId: string;
  conversionStatus: string;
  clickTime?: string;
  purchaseTime?: string;
  commission?: { canonicalAmount: string; currency: string; };
  providerOrderIds: string[];
  normalizedProviderRecordHash: string;
  observationHash: string;
  observedAt: string;
};
// hash: COMMERCE_OBSERVATION_V1 — inclui o estado comercial observado
// naquele momento.
```

Mesma conversão pode gerar várias observações ao longo do tempo (ex.:
`C1 PENDING R$4,80` em 18/09, `C1 VALIDATED R$5,20` em 21/09) — nunca
update destrutivo, duas `CommerceObservation` com o mesmo
`providerConversionId`.

**Idempotência comercial**: dentro do mesmo run, UNIQUE lógico
`(metricCollectionRunId, affiliateProviderKey, providerConversionId)`.
Mesma resposta com C1 idêntico duas vezes → uma observation; C1 com
conteúdos incompatíveis na mesma resposta →
`COMMERCE_PROVIDER_RECORD_CONFLICT`. Em coleta futura, nova
`CommerceObservation` é permitida. Não preencher campos que o provider
não entrega (hoje `promotedProductId`/`commission`/`purchase` não
vêm como atribuídos — é evidência de clique, não de venda).

### OwnedAffiliateClickEvent — `REFERENCE ONLY`, dono canônico Skill 15

> **Duplicata real corrigida durante o Ponto F2 do reparo transversal
> pós-revisão Fable (2026-09-18).** Este tipo estava declarado duas
> vezes neste arquivo (achado exato da revisão Fable/Claude Fable 5
> Max). A definição canônica agora vive só na Skill 15 — ver "Reparo
> transversal pós-revisão Fable → Ponto F2" no `SPEC.md` da Skill 15
> (`OwnedAffiliateClickEvent`, `OwnedAffiliateClickCaptureBasis`,
> `OwnedAffiliateClickSourceRef`, hash `OWNED_AFFILIATE_CLICK_EVENT_V1`,
> `FATAL_ERROR OWNED_AFFILIATE_CLICK_EVENT_REPLAY_CONFLICT`). Esta Skill
> apenas consome/normaliza/agrega — nunca redeclara o tipo nem gera
> identidade retroativamente.

**O clique já precisa nascer correlacionado** — o emissor precisa
conhecer `trackingToken`/`AffiliateLinkArtifact` antes de materializar
o evento. Skill 18 nunca faz "click_events antigo + timestamp + produto
→ adivinhar tracking identity"; o legado permanece
`UNCORRELATED_TO_AFFILIATE_IDENTITY`.

**Privacidade**: o contrato canônico de tracking não inclui
obrigatoriamente IP/user agent/cookie/email/account ID — se dado
antifraude/diagnóstico for necessário no futuro, Skill 25 governa
retenção/proteção; não é necessário para a identidade comercial.

Ao ingerir `OWNED_AFFILIATE_CLICK`, `MetricCollectionInput` referencia
o `OwnedAffiliateClickEvent` exato, valida hash/tenant e
persiste/normaliza evidência para analytics — não gera outra click
identity; a fonte canônica continua o evento da Skill 15.

### Materialização de AffiliateAttributionEvidence

```typescript
type AttributionEvidenceMaterializationResult = {
  materializationResultId: string;
  tenantId: string;
  commerceObservationId?: string;
  commerceObservationHash?: string;
  ownedAffiliateClickEventId?: string;
  ownedAffiliateClickEventHash?: string;
  attributionCapabilitySnapshotId: string;
  attributionCapabilitySnapshotHash: string;
  result: 'EVIDENCE_MATERIALIZED' | 'INSUFFICIENT_FOR_DIRECT_ATTRIBUTION' | 'NO_ATTRIBUTABLE_IDENTITY';
  attributionLevel: 'DIRECT_PROVIDER_CONFIRMED' | 'OWN_CLICK_CONFIRMED_ONLY' | 'PROVIDER_AGGREGATE_ONLY' | 'UNATTRIBUTED';
  affiliateAttributionEvidenceId?: string;
  affiliateAttributionEvidenceHash?: string;
  rationaleCode: string;
  materializationHash: string;
  createdAt: string;
};
// hash: ATTRIBUTION_EVIDENCE_MATERIALIZATION_V1
```

`INFERRED_HEURISTIC` fica **fora** da materialização canônica —
reservado para análises explícitas futuras da Skill 19, sempre
separado da evidência factual; Skill 19 nunca substitui o
`AffiliateAttributionEvidence` canônico por essa inferência.

- **`DIRECT_PROVIDER_CONFIRMED`**: só nasce com `CommerceObservation` +
  capability snapshot `VERIFIED` + chave oficial observada que resolve
  deterministicamente `trackingIdentity`/`AffiliateLinkArtifact`
  (ex.: subId/token oficial, clickId oficial com join verificado).
  Exige `providerConversionId` + `trackingIdentityHash` +
  `AffiliateLinkArtifactHash` + evidência correspondente. Timing não
  basta.
- **`OWN_CLICK_CONFIRMED_ONLY`**: afirma apenas que um clique em
  superfície própria está ligado deterministicamente ao tracking
  identity/link — nasce de `OwnedAffiliateClickEvent`, não confirma
  comissão/compra (evidência de clique, não de venda).
- **`PROVIDER_AGGREGATE_ONLY`**: quando há comissão/conversão real do
  provider mas não há identidade externa suficiente pra ligar à
  publicação/link — preserva `totalCommission`/`conversionId`/`orderIds`
  sem preencher `trackingIdentityId`/`AffiliateLinkArtifactId` como
  confirmados.
- **`UNATTRIBUTED`**: conversão real existe mas nenhuma identidade
  comercial é comprovável — melhor materializar como `UNATTRIBUTED` do
  que descartar a conversão.
- **Janela de 7 dias**: pode aparecer em `sourceEvidenceRefs`/regra do
  provider, mas nunca entra na derivação como "se dentro de 7 dias →
  `DIRECT_PROVIDER_CONFIRMED`". Única conclusão permitida:
  "temporalmente compatível com a regra de atribuição do provider" —
  não causal.
- **Nova capability não reabre o passado silenciosamente**: se em
  18/09 `C1` foi coletada com capability `UNVERIFIED` →
  `UNATTRIBUTED`, e em outubro a capability muda para `VERIFIED` com
  evidência direta, nasce um **novo** `AffiliateAttributionEvidence`
  `DIRECT_PROVIDER_CONFIRMED` — o resultado antigo permanece
  historicamente correto para a informação disponível naquele momento.

**Idempotência da materialização**: chave lógica `source
observation/event hash + attribution capability snapshot hash`. Mesma
`CommerceObservation` + mesmo capability snapshot → mesmo
materialization result; capability nova → nova avaliação permitida
(desejável).

### Hashes canônicos deste bloco

```text
METRIC_COLLECTION_INPUT_V1                        oportunidade lógica de coleta
METRIC_PROVIDER_CAPABILITIES_V1                   capacidade observada da fonte
METRIC_COLLECTION_POLICY_V1                       regras de coleta/freshness/cadência
METRIC_COLLECTION_POLICY_BINDING_RESOLUTION_V1    resolução congelada da policy
METRIC_SERIES_IDENTITY_V1                         identidade da série temporal
METRIC_COLLECTION_RUN_CONTEXT_V1                  contexto imutável do run
METRIC_OBSERVATION_V1                             observação individual
METRIC_SNAPSHOT_V1                                snapshot agregado de um run
COMMERCE_OBSERVATION_V1                            estado comercial observado
OWNED_AFFILIATE_CLICK_EVENT_V1                    patch Skill15 / clique próprio correlacionado
ATTRIBUTION_EVIDENCE_MATERIALIZATION_V1           decisão determinística da Skill18

# reutilizados sem redefinir (owned pela Skill 15):
AFFILIATE_ATTRIBUTION_CAPABILITY_V1
AFFILIATE_ATTRIBUTION_EVIDENCE_V1
```

`MetricCollectionRun` não recebe hash do objeto mutável inteiro.

### Cadeias finais

```text
Orgânica:
SocialPublicationBinding → MetricCollectionInput → Policy+Capability snapshots
  → MetricCollectionRun → provider read → RESPONSE_CAPTURED
  → MetricSeriesIdentity → MetricObservation[] → MetricSnapshot → Skill19

Comercial:
Shopee conversion report → MetricCollectionRun → CommerceObservation[]
  → AffiliateAttributionCapabilitySnapshot → AttributionEvidenceMaterializationResult
  → AffiliateAttributionEvidence → Skill19

Clique próprio (separado):
OwnedAffiliateClickEvent → OWN_CLICK_CONFIRMED_ONLY (sem inventar uma compra)
```

## Fechamento (rodada 3 — debate com ChatGPT, 2026-09-18)

Três regras congeladas antes do bloco operacional:

1. A Skill 18 pode repetir uma leitura remota enquanto nenhuma resposta
   daquela coleta foi capturada duravelmente. Depois de
   `RESPONSE_CAPTURED`, replay usa exatamente a resposta já capturada;
   uma nova leitura exige uma nova `collectionRequestKey`.
2. Janelas sobrepostas de coleta são permitidas e desejáveis para
   providers comerciais — encontrar de novo a mesma conversão não é
   duplicação se for uma nova observação temporal; duplicação só existe
   dentro da mesma coleta lógica.
3. Freshness é propriedade da observação disponível para uma
   finalidade, não do fato externo — um snapshot pode estar velho para
   análise operacional e continuar historicamente correto.

### Provider query/response

```typescript
type MetricProviderQuery =
  | PublicationMetricProviderQuery
  | AccountMetricProviderQuery
  | AffiliateCommerceProviderQuery;

type PublicationMetricProviderQuery = {
  queryType: 'PUBLICATION_METRICS';
  tenantId: string;
  providerKey: string;
  providerAccountId: string;
  collectionRequestKey: string;
  socialPublicationBindingId: string;
  socialPublicationBindingHash: string;
  entity: {
    scope: 'PUBLICATION' | 'MEDIA' | 'STORY';
    providerPublicationId?: string;
    providerMediaId?: string;
    providerStoryId?: string;
  };
  requestedFields: string[];
  capabilitySnapshotId: string;
  capabilitySnapshotHash: string;
  queryHash: string;
};

type AccountMetricProviderQuery = {
  queryType: 'ACCOUNT_METRICS';
  tenantId: string;
  providerKey: string;
  providerAccountId: string;
  collectionRequestKey: string;
  window: { startAt: string; endAt: string; };
  requestedFields: string[];
  capabilitySnapshotId: string;
  capabilitySnapshotHash: string;
  queryHash: string;
};

type AffiliateCommerceProviderQuery = {
  queryType: 'AFFILIATE_COMMERCE';
  tenantId: string;
  affiliateProviderKey: string;
  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string;
  collectionRequestKey: string;
  reportWindow: { startAt: string; endAt: string; };
  attributionCapabilitySnapshotId: string;
  attributionCapabilitySnapshotHash: string;
  queryHash: string;
};
// hash: METRIC_PROVIDER_QUERY_V1
```

Provider nunca retorna `MetricObservation` diretamente — primeiro
capturamos uma resposta normalizada, ainda fiel à fonte:

```typescript
type MetricProviderResponseStatus = 'SUCCESS' | 'PARTIAL' | 'EMPTY';

type MetricProviderResponse = {
  metricProviderResponseId: string;
  tenantId: string;
  metricCollectionRunId: string;
  providerKey: string;
  queryHash: string;
  status: MetricProviderResponseStatus;
  providerDataAsOf?: string;
  records: MetricProviderRecord[];
  pagination?: { hasMore: boolean; nextCursor?: string; };
  normalizedResponseHash: string;
  capturedAt: string;
};

type MetricProviderRecord = {
  providerRecordKey?: string;
  entityIdentity?: {
    providerPublicationId?: string;
    providerMediaId?: string;
    providerStoryId?: string;
    providerConversionId?: string;
  };
  fields: Record<string, string | number | null>;
  dimensions?: Record<string, string>;
  recordHash: string;
};
// hash: METRIC_PROVIDER_RESPONSE_V1 — o raw payload pode ter retenção
// separada; o contrato canônico é a resposta normalizada.
```

**Paginação**: uma coleta lógica paginada continua sendo o mesmo
`MetricCollectionRun` — páginas 1/2/3 não viram runs separados.

```typescript
type MetricProviderPageCapture = {
  pageCaptureId: string;
  metricCollectionRunId: string;
  queryHash: string;
  pageSequence: number;
  requestCursor?: string;
  responseCursor?: string;
  normalizedPageHash: string;
  capturedAt: string;
};
// hash: METRIC_PROVIDER_PAGE_CAPTURE_V1
```

Só depois de todas as páginas necessárias: `QUERYING → RESPONSE_CAPTURED`
(resposta agregada recebe `normalizedResponseHash`). Replay de
paginação reutiliza páginas já capturadas e continua do cursor
conhecido — nunca substitui página já capturada por valores novos. Se
o provider não oferece cursor estável e não há garantia de
consistência entre páginas, a capability deve refletir isso.

### Freshness e scheduling

```typescript
type MetricFreshnessAssessment = 'FRESH' | 'STALE' | 'MISSING' | 'UNKNOWN';

type MetricFreshnessResolution = {
  freshnessResolutionId: string;
  tenantId: string;
  collectionDomain: MetricCollectionDomain;
  subjectIdentityHash: string;
  assessment: MetricFreshnessAssessment;
  resolutionHash: string;
};
// hash: METRIC_FRESHNESS_RESOLUTION_V1
```

Skill 19 pode pedir "preciso de dados com freshness ≤ policy", mas não
calcula a coleta por conta própria.

```typescript
type MetricCollectionScheduleState = 'ACTIVE' | 'QUIESCENT' | 'CLOSED_BY_POLICY';

type MetricCollectionSchedule = {
  metricCollectionScheduleId: string;
  tenantId: string;
  collectionDomain: MetricCollectionDomain;
  subjectIdentityHash: string;
  policyId: string;
  policyVersion: string;
  policySnapshotHash: string;
  state: MetricCollectionScheduleState;
  nextEligibleCollectionAt?: string;
  lastCollectionRequestKey?: string;
  lastObservedAt?: string;
  updatedAt: string;
}; // mutável, sem hash integral
```

Cron encontra schedule `ACTIVE` com `nextEligibleCollectionAt ≤ now`.
**PATCH (Ponto M8).** O problema original não era "qual função de
arredondamento usar" — é eliminar o arredondamento por completo.
`scheduledOccurrenceAt` = o valor de `nextEligibleCollectionAt` no
momento em que a admissão identifica a ocorrência devida (a ocorrência
nominal planejada, nunca `now()`); `scheduleSlotKey` deriva de
`(schedulePolicyKey, scheduledOccurrenceAt)`. Regra explícita:

```text
scheduleSlotKey MUST NOT be derived by rounding, flooring or
ceiling the observed/execution time (round(now), floor(now / interval),
current minute, worker claimedAt, request receivedAt).
```

Isso resolve jitter, retry, cron duplicado e execução atrasada de uma
vez: dois cron workers vendo a mesma coleta vencida sempre calculam a
mesma identidade, porque ambos leem o mesmo `scheduledOccurrenceAt`
nominal — nunca o horário em que cada um realmente acordou. Execução
atrasada (schedule às 15:00, worker só disponível às 15:43) preserva
`scheduledOccurrenceAt = 15:00` — o atraso não muda a identidade. Não
precisa ser entidade persistida separada na V1, mas a derivação deve
ser determinística e nunca depender de `now()` além de decidir *quais*
ocorrências estão devidas (`now()` decide elegibilidade, nunca constrói
a key). Timezone/DST: se o schedule de negócio usa horário local
(ex.: `America/Bahia`), a resolução timezone→instante exato acontece
antes da slot identity — `scheduleSlotKey` sempre usa o instante UTC já
resolvido, nunca a string local concorrente.

**On-demand refresh**: não deve furar a política indiscriminadamente —
se um snapshot já é suficientemente fresco, `REUSED_FRESH_SNAPSHOT`
(sem provider call); se estiver stale, gera nova
`collectionRequestKey` e coleta.

```typescript
type MetricRefreshDecision =
  | 'REUSED_FRESH_SNAPSHOT'
  | 'COLLECTION_REQUIRED'
  | 'COLLECTION_ALREADY_IN_PROGRESS';
```

Duas requisições on-demand concorrentes para o mesmo subject/policy/
freshness need podem usar um refresh coalescing key (tenant + subject +
domain + policy snapshot + freshness bucket) — tratado como otimização
de scheduling, sem virar identidade histórica da observação.

### Comportamento temporal — orgânico e comercial

- Idempotência orgânica dentro de um run: `MetricSeriesIdentity X` →
  no máximo uma `MetricObservation` por normalized provider
  entity/dimension. Provider retornando o mesmo field/dimension duas
  vezes com valores diferentes na mesma resposta →
  `METRIC_PROVIDER_FIELD_CONFLICT` (`FATAL_ERROR`) — nunca "escolher o
  último".
- Idempotência do `MetricSnapshot`: mesmo run + mesma resposta → mesmo
  snapshot. Crash depois de criar 8 de 10 observations: replay
  encontra as 8 compatíveis, materializa as 2 faltantes, não duplica
  as anteriores.
- **Materialização parcial**: observations individuais podem existir
  antes, mas o snapshot final só nasce quando a normalização de todo o
  run terminou — Skill 19 nunca lê metade da coleta.
- Campo `required=true` ausente não vira zero — vira
  `MetricObservation` com `status=NOT_AVAILABLE` se a ausência for
  estado válido do provider/capability; se a capability dizia
  `VERIFIED + provider promises field` e a resposta viola o contrato
  estrutural, é `METRIC_PROVIDER_CONTRACT_VIOLATION` (a diferença é
  semântica do provider vs. payload inválido).
- Capability snapshot antigo permanece histórico — se `media_views`
  era `UNVERIFIED` ontem e vira `VERIFIED` hoje, o run de ontem
  continua ligado ao snapshot antigo; capability nova não reinterpreta
  silenciosamente o run anterior.
- Sobreposição de janela Shopee: policy comercial permite
  `lookbackMs`/`overlapMs` porque uma conversão antiga pode mudar de
  `PENDING → VALIDATED`; runs com janelas sobrepostas são aceitáveis;
  a mesma `conversionId` reaparecer não é bug.
- `CommerceObservation` é append-only: mesma `C1` idêntica em duas
  coletas → nova observação temporal idêntica na V1 (opção mais
  simples, preserva "o provider continuava reportando esse estado
  naquela coleta"; dedupe histórica por conteúdo pode virar otimização
  de armazenamento depois). `C1 PENDING, PENDING, VALIDATED` pode
  produzir três `CommerceObservation`; Skill 19 escolhe a mais recente
  por `providerConversionId` quando quiser o estado atual, mas o
  histórico permanece. Regressão do provider (`VALIDATED → CANCELLED`)
  também é fato — não é corrupção automática, persiste nova observação.

### Erros

**FATAL_ERROR (31):**

```text
METRIC_TENANT_MISMATCH
METRIC_PROVIDER_ACCOUNT_TENANT_MISMATCH
METRIC_COLLECTION_INPUT_HASH_MISMATCH
METRIC_COLLECTION_REQUEST_REPLAY_CONFLICT
METRIC_POLICY_NOT_FOUND
INVALID_METRIC_COLLECTION_POLICY
METRIC_CAPABILITY_SNAPSHOT_HASH_MISMATCH
INVALID_METRIC_PROVIDER_CAPABILITIES
METRIC_PUBLICATION_BINDING_NOT_FOUND
METRIC_PUBLICATION_BINDING_HASH_MISMATCH
METRIC_PUBLICATION_BINDING_LINEAGE_MISMATCH
METRIC_ENTITY_IDENTITY_MISMATCH
METRIC_SERIES_IDENTITY_CONFLICT
METRIC_DEFINITION_CONFLICT
METRIC_PROVIDER_QUERY_HASH_CONFLICT
METRIC_PROVIDER_RESPONSE_CONFLICT
METRIC_PROVIDER_RESPONSE_INVALID
METRIC_PROVIDER_PAGE_CONFLICT
METRIC_PROVIDER_FIELD_CONFLICT
METRIC_PROVIDER_CONTRACT_VIOLATION
METRIC_OBSERVATION_REPLAY_CONFLICT
METRIC_SNAPSHOT_REPLAY_CONFLICT
COMMERCE_PROVIDER_RECORD_CONFLICT
COMMERCE_OBSERVATION_REPLAY_CONFLICT
OWNED_AFFILIATE_CLICK_HASH_MISMATCH
OWNED_AFFILIATE_CLICK_REPLAY_CONFLICT
ATTRIBUTION_CAPABILITY_HASH_MISMATCH
ATTRIBUTION_EVIDENCE_INTEGRITY_VIOLATION
ATTRIBUTION_MATERIALIZATION_REPLAY_CONFLICT
METRIC_INVALID_STATE_TRANSITION
METRIC_REFRESH_REQUEST_REPLAY_CONFLICT
```

**RETRYABLE_ERROR** (leitura é side-effect-free, mais permissivo):

```text
METRIC_PROVIDER_TEMPORARILY_UNAVAILABLE
METRIC_PROVIDER_RATE_LIMITED
METRIC_PROVIDER_TIMEOUT
METRIC_PROVIDER_PAGINATION_TRANSIENT_ERROR
METRIC_PROVIDER_LOOKUP_TRANSIENT_ERROR
METRIC_RESPONSE_PERSISTENCE_TRANSIENT_ERROR
METRIC_OBSERVATION_PERSISTENCE_TRANSIENT_ERROR
METRIC_SNAPSHOT_PERSISTENCE_TRANSIENT_ERROR
AFFILIATE_COMMERCE_PROVIDER_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Depois de `RESPONSE_CAPTURED`, retry técnico não refaz o provider read
— apenas persistência/normalização.

**BLOCKED:**

```text
METRIC_POLICY_NOT_CONFIGURED               → POLICY_BLOCKED
METRIC_PROVIDER_NOT_CONFIGURED             → POLICY_BLOCKED
METRIC_PROVIDER_IDENTITY_UNAVAILABLE       → POLICY_BLOCKED
METRIC_PROVIDER_AUTHORIZATION_REVOKED      → POLICY_BLOCKED
METRIC_ENTITY_JOIN_UNVERIFIED              → POLICY_BLOCKED (quando policy exige VERIFIED)
METRIC_FIELD_UNSUPPORTED                   → POLICY_BLOCKED (quando required)
METRIC_ATTRIBUTION_CAPABILITY_INSUFFICIENT → POLICY_BLOCKED (quando operação exige nível superior)
```

Atenção: coletar commerce não deve ser bloqueado só porque a
atribuição é fraca.

**Resultados de domínio, não erros:**

```text
NO_DATA_RETURNED
SNAPSHOT_ALREADY_FRESH
COLLECTION_ALREADY_IN_PROGRESS
NO_REQUIRED_METRICS_CHANGED
PUBLISHED_WITHOUT_METRIC_IDENTITY   (binding existe mas provider não oferece join válido)
NO_ATTRIBUTABLE_IDENTITY
INSUFFICIENT_FOR_DIRECT_ATTRIBUTION
PROVIDER_AGGREGATE_ONLY
UNATTRIBUTED
```

`NO_DATA_RETURNED` é especialmente importante — zero resultados de
relatório não é erro. Se o provider devolver exatamente os mesmos
valores de antes, a nova coleta ainda é observação legítima — não
impede o `MetricSnapshot` (pode registrar `NO_REQUIRED_METRICS_CHANGED`
como flag/derivação, mas a observação temporal permanece).

### Multi-tenant

Publicação: `trustedTenantId = Job.tenantId`, e precisam bater
`MetricCollectionInput`/`SocialPublicationBinding`/
`MetricCollectionPolicy`/`MetricProviderCapabilities`/provider account
binding/`MetricSeriesIdentity`/`MetricCollectionRun`/
`MetricObservation`/`MetricSnapshot`. Comercial:
`Job.tenantId = provider profile tenant = attribution capability
tenant`. Clique próprio: `Job.tenantId = OwnedAffiliateClickEvent.tenantId
= AffiliateLinkArtifact.tenantId = TrackingIdentity.tenantId`. Qualquer
divergência → `METRIC_TENANT_MISMATCH` (`FATAL_ERROR` + security
`AuditEvent`).

Nunca consultar `providerMediaId=X` globalmente — sempre
`tenantId + providerKey + providerAccountId + providerMediaId` (mesma
regra para story IDs). Conversão Shopee também carrega profile/account
scope — `conversionId` sozinho não é chave global presumida; identidade
interna: `tenant + affiliateProviderKey + providerProfile +
providerConversionId`.

### Observabilidade

Logs por run: `tenantId`, `jobId`, `attemptNumber`,
`collectionDomain`, `collectionRequestKey`, `providerKey`, `queryHash`,
`responseCaptured?`, `normalizedResponseHash?`,
`socialPublicationBindingId?`, `metricSeriesCount`,
`metricObservationCount`, `metricSnapshotId?`, `commerceRecordCount?`,
`commerceObservationCount?`, `ownedClickEventId?`,
`attributionMaterializationCount`, `attributionLevelsCount`,
`durationMs`, `errorCode?`. **Nunca logar**: `trackingToken` cru,
`providerAffiliateUrl`, raw payload integral, order IDs por padrão,
provider profile secrets, demografia individualizada.

Audit events: `MetricCollectionRun created`, `provider response
captured`, `snapshot materialized`, `commerce report captured`,
`capability verification upgraded/downgraded` (quando ocorrer por
evidência real), `publication identity join blocked`, `field contract
violation`, `provider record conflict`, `tenant mismatch`,
`AffiliateAttributionEvidence materialized`, `attribution level
changed` em nova materialização. Não precisa `AuditEvent` para cada
métrica de views.

Métricas operacionais: `metric_collection_run_total`,
`metric_collection_success_total`, `metric_collection_empty_total`,
`metric_snapshot_reuse_total`, `metric_stale_snapshot_total`,
`metric_identity_join_blocked_total`,
`commerce_observation_created_total`,
`owned_affiliate_click_ingested_total`,
`attribution_evidence_materialized_total`, e por nível
`attribution_evidence_level_total{direct_provider_confirmed,
own_click_confirmed_only, provider_aggregate_only, unattributed}`.
Nunca criar label com conversion ID, media ID ou tracking token.

### Plano de testes — 100 casos críticos, 10 blocos

1–10 Input/policy/capability: input publication/commerce/owned-click
válidos; mesma `collectionRequestKey`+input reutiliza run; mesma
key+input diferente → fatal; policy ausente → blocked; policy corrupta
→ fatal; capability hash divergente → fatal; capability `UNVERIFIED`
bloqueia só quando policy exige `VERIFIED`; `schemaDiscovery VERIFIED`
não promove `mediaRead` automaticamente.

11–20 Identidade da publicação: binding exato resolve MEDIA por
`providerMediaId`/STORY por `providerStoryId`; account metric não vira
publication metric; `providerMediaId` ausente quando obrigatório →
blocked; `identityJoin UNVERIFIED` → blocked quando required; binding
hash divergente → fatal; binding de outro tenant → fatal; account
scope sempre participa do lookup; latest post nunca é usado; account
aggregate nunca é rateado entre posts.

21–30 Query/response: mesma query sem resposta capturada pode ser
repetida; response captured impede nova leitura no replay; response
hash incompatível → fatal; empty response é domínio normal; partial
response é preservada; `providerDataAsOf` ausente permanece unknown;
`observedAt` não substitui `providerDataAsOf`; required field ausente
nunca vira zero; explicit zero vira `EXPLICIT_ZERO`; null provider
value não vira numeric zero.

31–40 Paginação: page 1 capturada; restart continua da page 2; página
já capturada não é substituída; mesmo `pageSequence` com conteúdo
incompatível → fatal; cursor transiente → retryable; todas páginas
formam uma única response lógica; snapshot só nasce após resposta
completa exigida; duplicate record idêntico na mesma response é
deduplicado; duplicate record conflitante → fatal; paginação não gera
múltiplos snapshots do mesmo run.

41–50 Séries/snapshots: mesma definição gera mesma series identity;
mudança de dimensão/semântica gera outra série; dimensions canonical
ordering estável; snapshot T1 permanece após T2; mesma métrica com
valor novo cria nova observation temporal; valor igual em T2 ainda
pode criar novo snapshot; replay parcial termina observations
faltantes sem duplicar; snapshot incompatível no mesmo run → fatal;
latest snapshot é consulta/projeção, não verdade mutável.

51–60 Freshness/scheduling: snapshot dentro/fora da policy →
FRESH/STALE; sem snapshot → MISSING; refresh fresh reutiliza snapshot;
refresh stale gera coleta; duas solicitações concorrentes podem
coalescer; cron duplicado no mesmo slot produz uma coleta lógica; slot
futuro produz nova `collectionRequestKey`; cron atrasado não inventa
snapshots perdidos; `CLOSED_BY_POLICY` não significa valor definitivo.

61–70 Commerce: `conversionId` real cria `CommerceObservation`; mesma
conversão duplicada idêntica no mesmo report → uma observation; mesma
conversão conflitante na mesma resposta → fatal; mesma conversão em
coleta futura → nova observation permitida; `PENDING→VALIDATED` e
`VALIDATED→CANCELLED` preservam ambas; commission ausente não vira
zero; `purchasedProductId` ausente não vira `promotedProductId`;
overlap de report window não é duplicação histórica; report vazio é
resultado normal.

71–80 Owned click: `sourceEventId` repetido+mesmo hash → mesmo event;
repetido+conteúdo diferente → fatal; novo `sourceEventId` → novo
clique; clique precisa nascer com tracking identity; affiliate
artifact hash divergente → fatal; click legado sem identidade não é
retroativamente ligado; `OWN_CLICK` não afirma compra;
`socialPublicationBinding` é opcional no clique próprio; trackingToken
cru não aparece em logs; click cross-tenant → fatal.

81–90 Attribution: direct provider requer determinismo — timing
sozinho não cria direct attribution; own click produz no máximo
`OWN_CLICK_CONFIRMED_ONLY`; commerce sem join pode ser
`PROVIDER_AGGREGATE_ONLY`; conversão sem identidade pode ser
`UNATTRIBUTED`; `INFERRED_HEURISTIC` não é materializado
automaticamente pela Skill 18; mesmo source+mesmo capability snapshot
reutiliza materialization; capability nova permite nova
materialização; materialização nova não sobrescreve evidência antiga;
promoted product ≠ purchased product permanece preservado.

91–100 Multi-tenant/observabilidade/replay: Job tenant governa todo
run; provider account/commerce profile de outro tenant → fatal; run
replay após `RESPONSE_CAPTURED` não chama provider; retry antes de
capture pode chamar novamente; logs não expõem affiliate URL/token/
secrets; snapshots geram métricas operacionais corretas; commerce
observation não é contado como publication metric;
`DIRECT_PROVIDER_CONFIRMED` nunca nasce de heurística temporal;
**nenhuma operação da Skill 18 interpreta "bom" ou "ruim" — isso fica
para a Skill 19.**

### Hashes novos deste bloco

```text
METRIC_PROVIDER_QUERY_V1
METRIC_PROVIDER_RESPONSE_V1
METRIC_PROVIDER_PAGE_CAPTURE_V1
METRIC_FRESHNESS_RESOLUTION_V1
```

Os demais já integrados continuam canônicos.
`MetricCollectionSchedule` não recebe hash integral porque é mutável.

## Auditoria real do repositório (2026-09-18)

- **Achado crítico: Windsor.ai tem capacidade REAL de leitura de
  métricas orgânicas do Instagram, já conectada, mas hoje nunca usada
  por nenhum código do app.** `get_fields(connector="instagram")`
  retorna schema real incluindo `media_id`, `media_views`,
  `media_reach`, `media_engagement`, `media_like_count`,
  `media_total_comments_count`, `media_saved`, `media_shares`,
  `story_views`, `story_reach`, `story_interactions`,
  `user_insights_day_total_value` (curtidas/comentários/shares/saves/
  alcance/views), breakdowns demográficos, etc. — conta conectada real:
  `17841471469860803` ("Desconto Chegando"). **Isso não é greenfield
  pra leitura** — diferente do padrão das Skills 09-17, aqui a
  capacidade de coleta já existe e está autenticada, só não foi
  utilizada.
- **Nenhum cron/rota hoje consulta essas métricas.** `src/app/api/cron/`
  só tem `publish-product` e `source-deals` — nenhum dos dois busca
  insights. `instagramGraph.ts` só implementa envio de DM, não
  métricas.
- **`SocialPublicationBinding`** (Skill 17) já tem todos os campos de
  lineage necessários (`providerMediaId`/`providerStoryId`,
  `finalizedVideoRenditionId`, `affiliateLinkArtifactId`,
  `promotedProductId`) — e a Skill 17 explicitamente nomeia Skills
  18/19 como donas de "performance", com uma restrição clara: "Skill 17
  nunca... atribui conversão".
- **`AffiliateAttributionEvidence`/`AffiliateAttributionLevel`/
  `AffiliateAttributionCapabilitySnapshot`** (Skill 15) já foram
  desenhados explicitamente pra serem materializados pelas Skills
  18/19 — taxonomia de 5 níveis (`DIRECT_PROVIDER_CONFIRMED`/
  `OWN_CLICK_CONFIRMED_ONLY`/`PROVIDER_AGGREGATE_ONLY`/
  `INFERRED_HEURISTIC`/`UNATTRIBUTED`), capability snapshot mostrando
  que hoje `providerConversionReturnsSubId`/`providerConversionReturnsClickId`/
  `providerClickToConversionJoin`/`providerCreativeLevelAttribution` são
  todos `UNVERIFIED` — Shopee `conversionReport()` real não expõe
  `subId`/`clickId` (confirmado de novo: campos reais são só
  `conversionId, conversionStatus, purchaseTime, clickTime,
  totalCommission, orderIds[]`).
- **Achado crítico de lacuna real: `click_events` (tabela real, sem
  migration versionada) não é correlacionável a nada.** Schema real:
  `id, created_at, platform, product_slug, product_name, source` — sem
  coluna `sub_id`/`click_id`/`affiliate_link_id`. Não há hoje nenhum
  jeito de ligar um clique registrado em `click_events` a um
  `AffiliateLinkArtifact`/`trackingToken` específico.
- **Janela de atribuição de 7 dias da Shopee** confirmada de novo
  (Skill 05 SPEC.md): compra de **qualquer produto** dentro de 7 dias
  do clique gera comissão pra nós, não só do produto anunciado — e já
  registrado (Skill 15) que "click+compra dentro de 7 dias é apenas
  compatível com a janela — não é evidência suficiente de
  `DIRECT_PROVIDER_CONFIRMED`".

## Questões reais para o debate com o ChatGPT

1. Como a Skill 18 deve tratar a capacidade real (mas nunca usada) do
   Windsor pra métricas orgânicas do Instagram — capability-aware
   assumindo `VERIFIED` porque schema real existe, ou `UNVERIFIED` até
   uma chamada real ser comprovada em produção?
2. Como lidar com o gap real de `click_events` não ser correlacionável
   — a Skill 18 exige uma nova geração de eventos de clique
   (substituindo/complementando `click_events`) amarrada ao
   `trackingToken` da Skill 15, ou aceita permanentemente que cliques
   de site não são atribuíveis?
3. Frequência/timing de coleta: polling periódico via cron, ou
   coleta sob demanda quando a Skill 19 precisar? Dado que métricas de
   engajamento mudam ao longo do tempo (não é um evento único como
   publicação).
4. Como versionar/tratar séries temporais de métricas (ex.: views hoje
   vs. views daqui a 3 dias do mesmo post) sem inventar uma "métrica
   definitiva" prematuramente?
5. Separação entre métricas de alcance/engajamento (technical, sem
   ambiguidade de atribuição) e métricas de conversão/comissão
   (herdam toda a incerteza de atribuição já registrada pela Skill 15)?

## Status de implementação (nesta fase de especificação)

```text
Skill 18 metrics pipeline → NOT_IMPLEMENTED
(Windsor.ai Instagram read capability → CONECTADA E REAL, mas nunca
 usada por nenhum código; Shopee conversionReport → real mas sem
 subId/clickId; click_events → real mas não correlacionável a
 tracking; zero cron de coleta de métricas hoje)
```

## Reparo transversal pós-revisão Fable (2026-09-18)

### Ponto F3 — `MetricRefreshRequest` (patch da Skill 19, finalmente escrito aqui)

A Skill 19 (19/25, aprovada) já citava no próprio cabeçalho "patch
compatível na Skill 18... sem reabrir 18/25" — mas o conteúdo nunca
havia sido escrito de fato neste arquivo (achado B5 da revisão Fable/
Claude Fable 5 Max). Debatido novamente com o ChatGPT no Ponto F do
reparo transversal (2026-09-18) — versão final, com vocabulário próprio
de motivo/janela em vez do rascunho local anterior da Skill 19.

#### `MetricHistoricalReadStatus` — dimensão própria, não reaproveita `MetricReadCapabilityStatus`

Não usar genericamente `capability VERIFIED` pra concluir "histórico
está disponível" — um provider pode permitir métrica atual mas não
consulta histórica arbitrária.

```typescript
type MetricHistoricalReadStatus =
  | 'VERIFIED_AVAILABLE'
  | 'PARTIALLY_VERIFIED'
  | 'VERIFIED_UNAVAILABLE'
  | 'UNVERIFIED';
// sem hash próprio.
```

- **`VERIFIED_AVAILABLE`**: existe evidência compatível com ler aquela
  field historicamente naquele provider/account/capability scope —
  não significa histórico infinito, as janelas reais continuam
  limitadas pelo provider/evidência.
- **`PARTIALLY_VERIFIED`**: ex. histórico existe mas só últimos 30 dias,
  ou certas dimensões indisponíveis — não pode ser promovido a
  `VERIFIED_AVAILABLE` integral sem evidência.
- **`VERIFIED_UNAVAILABLE`**: foi verificado que a capability de leitura
  histórica não existe naquele scope atual — a Skill 19 precisa
  respeitar isso.
- **`UNVERIFIED`**: não há evidência suficiente — não significa
  "provider não suporta" nem "provider suporta". **Ausente/snapshot
  legado sem este campo = interpretação sempre `UNVERIFIED`, nunca
  `VERIFIED_AVAILABLE`.**

`historicalReadStatus?: MetricHistoricalReadStatus` já foi adicionado
in-place a `MetricFieldCapability` acima, com `?` intencional pra
compatibilidade com snapshots antigos da spec.

#### `MetricRefreshRequest`

A Skill 19 precisa poder solicitar "atualize/recolete evidência antes
de eu analisar" — sem chamar o provider diretamente.

```typescript
type MetricRefreshReason =
  | 'MISSING_REQUIRED_OBSERVATION'
  | 'STALE_OBSERVATION'
  | 'HISTORICAL_COVERAGE_GAP'
  | 'CAPABILITY_REVALIDATION_REQUIRED';
// sem hash próprio.

type MetricRefreshSubjectRef = {
  subjectKind: string;
  subjectId: string;
  subjectHash: string;
};
// sem hash próprio. Skill 18 interpreta os subject kinds que suporta;
// Skill 19 não inventa provider operation.

type MetricRefreshObservationWindow = {
  fromInclusive: string;
  toExclusive: string;
};
// sem hash próprio. Invariante: fromInclusive < toExclusive.

type MetricRefreshRequest = {
  metricRefreshRequestId: string;

  tenantId: string;

  refreshRequestKey: string;

  requestedBySkillId: string; // hoje sempre '19', sem hardcode no type

  reason: MetricRefreshReason;

  subjectRefs: MetricRefreshSubjectRef[];

  requestedMetricFieldKeys: string[];

  observationWindow: MetricRefreshObservationWindow;

  minimumAcceptableObservedAt?: string;

  requestHash: string;

  requestedAt: string;
};
```

Hash: `METRIC_REFRESH_REQUEST_V1:sha256:<hex>`.

**Idempotência**: UNIQUE lógico `(tenantId, refreshRequestKey)`. Mesmo
key + mesmo `requestHash` → mesmo `MetricRefreshRequest`; conteúdo
divergente → `FATAL_ERROR`. `refreshRequestKey` deve refletir tenant +
subjects + fields + observation window + reason — nunca `Date.now()`
como identidade. Skill 18 pode deduplicar refresh equivalente (mesmos
subjects/fields/janela/freshness) no mesmo request lógico quando o
producer gerar a mesma key.

**Não é instrução de provider**: nunca inclui endpoint/parâmetros de
API/paginação/credencial — a Skill 18 continua dona de como coletar,
qual provider é válido, qual capability existe. **Não promete
sucesso**: significa apenas "há necessidade de tentar obter evidência
mais adequada", não que a evidência histórica exista ou que o provider
consiga satisfazer. `minimumAcceptableObservedAt`, quando fornecido,
significa que evidência anterior a esse instante não satisfaz o motivo
do refresh — não é garantia de que o provider produza evidência nova.

**Skill 19 continua dona da decisão analítica**: depois do refresh, a
Skill 18 só produz nova evidence/observation; a Skill 19 decide se a
basis agora é suficiente. A Skill 18 nunca declara "análise de
performance válida". Se `historicalReadStatus = VERIFIED_UNAVAILABLE`,
a Skill 18 não inventa dado histórico — pode produzir
`BLOCKED`/capability indisponível, ou evidência de coleta parcial
conforme sua policy.

**Skill 19 nunca toca provider diretamente** — com o Ponto C do reparo
transversal já aplicado, o caminho real de execução é
`MetricRefreshRequest → KernelArtifactRef → StandaloneWorkRequest
{targetSkillId: '18'} → Skill02 → Skill18` (ver Skill 02), fechando de
verdade a promessa "Skill 19 pode pedir refresh à Skill 18".

Novo `FATAL_ERROR`: `METRIC_REFRESH_REQUEST_REPLAY_CONFLICT` (mesma
`refreshRequestKey`, payload incompatível — adicionado à lista acima,
**FATAL_ERROR (31)**).

Ver também "Reparo transversal pós-revisão Fable → Ponto F3" no
`SPEC.md` da Skill 19, que passa a referenciar `MetricRefreshRequest`/
`MetricHistoricalReadStatus` como `REFERENCE ONLY` (dono canônico agora
é este arquivo).
