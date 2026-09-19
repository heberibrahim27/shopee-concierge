# Skill 09 — Gerador de Frame

> **APROVADA EM ESPECIFICAÇÃO — 9/25** (2026-09-18). Especificação/contrato.
> **Sem implementação ainda** — nenhuma migration, tabela, RPC, worker,
> bucket de Storage ou provider de imagem foi criado. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code, fundamentado
> em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`). A auditoria confirmou: zero
> código de geração de imagem por IA existe hoje (o único SDK de IA
> instalado, `openai`, é usado exclusivamente para visão/reconhecimento no
> Concierge do WhatsApp — `gpt-4o-mini` analisando fotos enviadas pelo
> cliente, nunca `images.generate`); a imagem de referência de produto
> existe em um único lugar hoje — `offer_snapshots.image_url` (nullable,
> vindo direto da API da Shopee, imutável por snapshot de preço) — a
> tabela `products` não tem coluna de imagem nenhuma; `story-template/route.tsx`
> é um compositor estático (`next/og` `ImageResponse`/Satori sobre PNG do
> Canva), sem IA, arquiteturalmente não relacionado; não existe hoje
> nenhuma tabela/bucket para guardar frame gerado.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B2)**: quando esta
> Skill é chamada em decorrência de uma correção (`CorrectionDirective`
> da Skill 13), ela executa em **nova `StageExecution`/novo Job** da
> `StageIteration` corrente — nunca reutiliza Job ou Attempt da geração
> anterior. Retry técnico dentro dessa nova operação continua obedecendo
> à Skill 02 normalmente. Ver "Reparo transversal pós-revisão Fable →
> Ponto D" no `SPEC.md` da Skill 01.

## Garantia central

Transformar o `ScriptResult` (Skill 08) e o `CreativeDirectionResult`
(Skill 07) de um subject já definido, usando **exclusivamente** referências
visuais canônicas materializadas do produto, em um ou mais frames estáticos
destinados aos beats que exigem imagem de referência, **preservando a
identidade visual observável do produto e sem criar características não
sustentadas pelas referências**.

A composição da cena pode ser criativa; a aparência do produto não.

### Pode variar criativamente (SCENE COMPOSITION)

- ambiente
- iluminação
- enquadramento
- pessoa usando o produto
- câmera
- composição
- cenário
- pose

### Não pode inventar/alterar (PRODUCT IDENTITY)

- formato estrutural
- cor observável
- quantidade/posição de botões
- display
- logotipo visível
- textura/material aparente
- componentes distintivos
- proporções características

**Regra central de fidelidade:** a Skill 09 só pode tratar como
característica factual da identidade visual aquilo que é observável nas
referências materializadas. Partes não visíveis, detalhes ocultos e
características não verificáveis não podem ser inventados como extensão
factual do produto — permanecem `UNKNOWN`.

> Ausência de informação visual não autoriza preenchimento imaginativo da
> identidade do produto. Elementos desconhecidos devem permanecer não
> especificados ou fora de enquadramento sempre que sua invenção puder
> alterar a identidade do produto.

Exemplo: se a única referência mostra a frente verde com display e 2
botões, esses elementos são hard constraints. Se a referência não mostra a
traseira, a traseira é `UNKNOWN` — a Skill 09 não pode inventar portas,
logotipo ou bateria ali. Quando a composição exigir mostrar uma região do
produto não sustentada pelas referências, a Skill 09 deve preferir
reenquadrar a cena, ocultar a região desconhecida, ou rejeitar aquela
composição — nunca completar visualmente o produto por plausibilidade.

Isso é especialmente importante em afiliados: o produto anunciado precisa
ser o mesmo que chega ao comprador; um "produto mutante" gerado por IA é
tanto um risco de audit quanto um risco de confiança do cliente.

## O que a Skill 09 pode decidir

- Se um dado `ScriptBeat` precisa de frame (0..N `FrameArtifact` por beat —
  alguns beats não precisam, alguns podem compartilhar um frame-base,
  alguns podem precisar de mais de uma referência visual). Na V1
  operacional, restringimos a no máximo 1 `FrameArtifact` por
  `frameRequirement`, mas o contrato não força "1 frame por beat" como
  regra geral.
- Como compor a cena (ambiente, pose, iluminação, enquadramento) dentro dos
  limites da `CreativeDirectionResult` e do `ScriptBeat`.
- Se a composição pedida é impossível de cumprir com fidelidade às
  referências disponíveis (nesse caso, reenquadra/oculta ou rejeita —
  nunca inventa).

## Não é responsabilidade da Skill 09

- **Não é auditor de vídeo.** Gera still images e valida seus próprios
  invariantes mínimos de referência; a Skill 12 (Auditor de Vídeo)
  continua responsável pela auditoria do vídeo final gerado pelo Veo. Se no
  futuro for necessária uma auditoria visual específica de frame antes de
  gastar Veo, decide-se separadamente se isso vira parte da Skill 09 ou um
  gate reutilizável — não presumido agora.
- **Não escreve prompt do Veo.** Produz um `visualIntent` descritivo (ex.:
  "produto sendo usado no pescoço em uma sala à noite") e um
  `FrameArtifact` — nunca a sintaxe/parâmetros específicos do provider de
  vídeo ("Veo 3, cinematic shot, dolly in..."). Isso é responsabilidade da
  Skill 10 (Gerador de Prompt de Vídeo).
- Não decide estratégia criativa (Skill 07) nem reescreve o roteiro
  (Skill 08).
- Não debita quota/custo nem escolhe provider autorizado (Skill 02).

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


### Referências visuais — dois estágios conceituais

O contrato é desenhado para **N referências**, mesmo que o adapter real
Shopee V1 produza estritamente 0..1 hoje — evita mentir sobre o estado
atual e evita quebra de schema quando uma fonte futura (galeria da Shopee,
upload manual, outra fonte autorizada) trouxer múltiplos ângulos.

```typescript
// Estágio 1: de onde a referência afirma vir (não confiável sozinha —
// a URL observada no snapshot pode expirar, mudar de conteúdo ou falhar
// no momento real do fetch)
type ProductVisualReference = {
  referenceId: string;

  sourceType: 'SHOPEE_OFFER_SNAPSHOT_IMAGE';

  sourceOfferSnapshotId: string;
  sourceImageUrl: string;

  role: 'PRIMARY';

  observedAt: string;
};

type ProductVisualReferenceSetRef = {
  productVisualReferenceSetId: string;
  productVisualReferenceSetHash: string; // = PRODUCT_VISUAL_REFERENCE_SET_V1
};
// Sem hash próprio — identidade exata (id+hash) do artifact abaixo.

type ProductVisualReferenceEmptyReason =
  | 'NO_FRAME_REQUIRED'
  | 'REFERENCE_UNAVAILABLE'
  | 'TEXT_TO_VIDEO';

type ProductVisualReferenceSetContent =
  | { kind: 'POPULATED'; references: ProductVisualReference[]; }
  | { kind: 'EMPTY'; references: []; emptyReason: ProductVisualReferenceEmptyReason; };
// POPULATED exige references.length >= 1 e proíbe emptyReason.
// EMPTY exige references.length === 0 e exige emptyReason. Nunca
// POPULATED+[] nem EMPTY+[ref] nem EMPTY sem motivo. Nenhuma referência
// sentinela (ex.: {id:'NONE'}) — zero referências é literalmente [].

type ProductVisualReferenceSet = {
  productVisualReferenceSetId: string;

  tenantId: string; // do contexto de execução confiável, nunca de payload/
    // provider response/URL — mesma disciplina de TrustedTenantContext

  subjectRef: CreativeSubjectRef; // mesmo tipo já usado pela Skill 07 —
    // obrigatório mesmo em EMPTY (inclusive TEXT_TO_VIDEO): o set é sempre
    // "as referências visuais para ESTE subject exato", nunca um vazio
    // sem dono

  content: ProductVisualReferenceSetContent;

  materializedAt: string; // observabilidade — nunca usado para "latest set"

  productVisualReferenceSetHash: string; // PRODUCT_VISUAL_REFERENCE_SET_V1
};
```

**PATCH (Ponto S2 — ProductVisualReferenceSet como artifact tenant-scoped
obrigatório).** Antes deste patch, `ProductVisualReferenceSet` não tinha
`productVisualReferenceSetId`/`tenantId`, e as branches `NO_FRAME_REQUIRED`/
`TEXT_TO_VIDEO` do resultado da Skill 09 simplesmente não materializavam
nenhum set — Skills 10/11/12/13/20 acabavam com uma FK (`referenceSetId`)
apontando para uma entidade que às vezes nunca existiu. Regra central
nova: **toda execução válida da Skill 09 produz exatamente um
`ProductVisualReferenceSet`**, `POPULATED` ou `EMPTY`, nunca ausente.

Precedência determinística de `emptyReason` (evita duas implementações
escolherem motivos diferentes para o mesmo caso real):

```text
1. modo de geração explicitamente TEXT_TO_VIDEO + zero referências
   selecionadas → TEXT_TO_VIDEO
2. senão, policy diz explicitamente que frame/referência não é
   necessária → NO_FRAME_REQUIRED
3. senão, referência era esperada mas nenhuma utilizável existe →
   REFERENCE_UNAVAILABLE
```

`REFERENCE_UNAVAILABLE` materializado **não** decide por si só se a
produção deve continuar/bloquear/falhar — isso é do consumidor/policy
(formalizado no Ponto S4). O set só registra o fato: não havia
referência visual utilizável.

```typescript
// Estágio 2: o que foi realmente baixado e vai para o provider de imagem —
// prova o CONTEÚDO real recebido, não apenas a URL de origem
type MaterializedVisualReference = {
  referenceId: string;

  sourceOfferSnapshotId: string;
  sourceImageUrl: string;

  contentHash: string; // sha256 dos bytes reais
  mimeType: string;

  width?: number;
  height?: number;

  fetchedAt: string;

  storageRef?: string; // referência ao objeto persistido, quando aplicável
};
```

Regra factual do adapter Shopee V1 (explícita, não implícita):

```text
offer_snapshots.image_url = null
→ content = { kind: 'EMPTY', references: [], emptyReason: 'REFERENCE_UNAVAILABLE' }

offer_snapshots.image_url != null
→ content = { kind: 'POPULATED', references: [1 referência PRIMARY] }

Nunca >1 referência no adapter Shopee V1.
```

**PATCH (Ponto S2 — hash canônico).** `PRODUCT_VISUAL_REFERENCE_SET_V1`
é calculado via `CANONICAL_SERIALIZATION_V1` (S10) sobre `tenantId` +
`subjectRef` + `content` — nunca sobre `productVisualReferenceSetId`/
`materializedAt`/`productVisualReferenceSetHash` (identidade
operacional e metadata de persistência, não o fato semântico). Dentro
de `content`, `references` é **set-like para hashing**: cada
`ProductVisualReference` é canonicalizado individualmente e a lista é
ordenada lexicograficamente pelos bytes UTF-8 da representação JCS
canônica antes do hash — nunca depende da ordem de retorno da Shopee,
do `SELECT` ou de `Promise.all`. Duplicatas semânticas após
canonicalização são inválidas (`FRAME_REFERENCE_INVALID`). Os três
casos `EMPTY` (`NO_FRAME_REQUIRED`/`REFERENCE_UNAVAILABLE`/
`TEXT_TO_VIDEO`) produzem hashes **diferentes entre si** porque
`emptyReason` participa do `content` — `[]` sozinho nunca é suficiente
para identificar o motivo. Este hash não prova qual imagem o modelo
realmente recebeu (isso continua sendo o `contentHash` de cada
`MaterializedVisualReference`, estágio 2) — prova qual conjunto de
referências foi selecionado/afirmado no estágio 1.

### `FramePolicy` / `FramePolicyBinding`

```typescript
type FramePolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  frameSchemaVersion: 'FRAME_V1';

  allowedReferenceSourceTypes: Array<'SHOPEE_OFFER_SNAPSHOT_IMAGE'>;

  allowedMimeTypes: string[];

  output: {
    aspectRatio?: string;
    targetWidth?: number;
    targetHeight?: number;
    backgroundMode?: 'OPAQUE' | 'TRANSPARENT';
  };

  validationPolicy: FrameValidationPolicy;

  createdAt: string;
};

type FramePolicyBinding = {
  tenantId: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Hash congelado: `FRAME_POLICY_V1` sobre JSON canônico de todos os campos
comportamentais da policy. `FramePolicy` **nunca** carrega API key,
credential handle, provider runtime state ou informação específica de uma
Attempt.

### Requisitos de frame por beat

Cada `FrameRequirement` representa uma **necessidade semântica** de
frame, não uma tentativa de geração.

```typescript
type FrameRequirement = {
  frameRequirementId: string;

  tenantId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  beatIndex: number;

  purpose: 'BEAT_SEED';

  visualIntent: ScriptVisualIntent; // mesmo tipo já definido pela Skill 08

  referenceIdsAllowed: string[]; // só pode conter referências pertencentes
    // ao ProductVisualReferenceSet canônico daquele subject

  compositionConstraints?: {
    preferredAspectRatio?: string;
    framingHints?: string[];
    mustIncludeProduct: boolean;
    avoidShowingUnsupportedProductRegions: boolean;
  };

  frameRequirementHash: string; // FRAME_REQUIREMENT_V1

  createdAt: string;
};
```

`FRAME_REQUIREMENT_V1` é calculado sobre o conteúdo semântico canônico:
`creativeDirectionHash`, `scriptHash`, `beatIndex`, `purpose`,
`visualIntent`, `referenceIdsAllowed` ordenados lexicograficamente,
`compositionConstraints`. **Não entram no hash:** `frameRequirementId`,
`tenantId`, `createdAt` — são identidade operacional, não a necessidade
semântica em si.

O mesmo beat pode originar zero, um ou mais `FrameRequirement` — a V1 não
assume "exatamente um frame por beat".

O `FrameArtifact` final (com `validationSummary`, hashes de proveniência
completos, e o `inferenceMode` compartilhado com o padrão Skill07/08) é
definido na seção **Contratos canônicos finais**, após o bloco
operacional abaixo — evitando duas versões divergentes do mesmo tipo
neste arquivo.

## Provider abstraction

A Skill 09 **não chama provider "solto"**. Ela fala com uma interface
estável, e o provider só **propõe** um frame; quem decide se isso vira
`FrameArtifact` canônico é a própria Skill 09, após materialização e
validação.

```typescript
type ImageGenerationProviderKey =
  | 'GOOGLE_IMAGEN'
  | 'OPENAI_IMAGE'
  | 'REPLICATE_IMAGE'
  | 'AUTHORIZED_BROWSER_PROVIDER';

type ProviderCredentialMode =
  | 'TENANT_BYO'
  | 'PLATFORM_MANAGED';

type ProviderImplementationStatus =
  | 'NOT_IMPLEMENTED'
  | 'IMPLEMENTED';

type ProviderRuntimeAvailability =
  | 'AVAILABLE'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'NOT_CONFIGURED';

type ImageGenerationProviderCapability = {
  providerKey: ImageGenerationProviderKey;
  implementationStatus: ProviderImplementationStatus;
  runtimeAvailability: ProviderRuntimeAvailability;
  credentialMode: ProviderCredentialMode;
  supportsReferenceImages: boolean;
  supportsMultipleReferenceImages: boolean;
  supportsTransparency: boolean;
  supportsAspectRatioControl: boolean;
  supportsSeedControl: boolean;
  supportsResponseRetrievalByRequestId: boolean;
  supportsStructuredResponse: boolean;
};
```

Regra de executabilidade:

```text
provider executable =
  implementationStatus == IMPLEMENTED
  AND runtimeAvailability == AVAILABLE
```

Se não for executável, isso não é "sem evidência" nem "rejeição
criativa" — é situação operacional do provider
(`FRAME_PROVIDER_CAPABILITY_UNSUPPORTED`/`FRAME_PROVIDER_UNAVAILABLE`).

### Contrato de chamada

```typescript
type FrameGenerationContext = {
  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  frameRequirementId: string;
  frameRequirementHash: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  stageSubjectBindingId: string;
  subjectRef: {
    subjectType: 'PRODUCT';
    subjectId: string;
    sourceResultId: string;
    sourcePosition: number;
  };

  visualReferenceSet: {
    productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2 — aponta pro set exato que autorizou esta geração
    references: MaterializedVisualReference[];
  };

  framePolicySnapshot: {
    policyId: string;
    policyVersion: PolicyVersion; // PATCH (Ponto M1, reparo transversal
      // pós-revisão Fable, 2026-09-18, CONTRACT_CONVENTIONS_V1) — antes
      // "number", único lugar do corpus com esse tipo; todo o resto já
      // usa string. PolicyVersion é string opaca (non-empty,
      // case-sensitive, sem ordenação numérica implícita) — sem coerção
      // de number pra string na validação canônica.
    policySnapshotHash: string;
  };

  locale?: string;

  // Patch compatível (2026-09-18, durante o debate da Skill 13 —
  // não reabre 9/25): referência opcional a uma correção dirigida pela
  // Skill 13. Quando presente, muda o generationContextHash desta
  // Attempt de forma legítima (mesmos upstreams, correção diferente →
  // frame diferente). Nunca amplia fatos — a Skill 13 nunca autoriza
  // inventar característica do produto não sustentada pela referência.
  correctionContext?: {
    correctionDirectiveId: string;
    correctionDirectiveHash: string;
  };
};

type ImageGenerationProviderRequest = {
  providerKey: ImageGenerationProviderKey;
  modelKey: string;
  generationContextHash: string;
  promptTemplateVersion: string;
  outputSchemaVersion: string;
  generationParameters: {
    aspectRatio?: string;
    targetWidth?: number;
    targetHeight?: number;
    backgroundMode?: 'OPAQUE' | 'TRANSPARENT';
    seed?: string;
  };
};

type ImageGenerationProviderResponse = {
  providerRequestId?: string;
  providerResponseHash: string;
  temporaryAssetRef?: string; // URL/ID temporário do provider
  metadata?: Record<string, unknown>;
};
```

**Regra de fronteira:** o provider nunca devolve um `FrameArtifact` final.
Ele só devolve material suficiente para a Skill 09 capturar a resposta,
materializar bytes, validar fidelidade, e então persistir o
`FrameArtifact`.

## Política de fidelidade / validação mínima

O núcleo da Skill 09: ela não é "gerar imagem bonita", é **gerar frame
visualmente fiel ao produto e compatível com o beat**.

### Duas camadas de validação

**A. Validação estrutural do artefato** — verifica se o output é
utilizável tecnicamente (mime permitido, dimensões legíveis, imagem
não-vazia, decodificável). Falha aqui → `FRAME_ARTIFACT_INVALID`.

**B. Validação semântica/factual do frame** — verifica se o frame
respeita a identidade do produto, as restrições do `FrameRequirement`, e
os limites do que a referência permite afirmar/mostrar (presença do
produto, identidade preservada, ausência de alegação visual proibida,
ausência de completação não sustentada, satisfação do requisito de cena,
cobertura suficiente das referências).

Ambas as camadas são persistidas juntas no tipo `FrameValidationSummary`
(seção **Contratos canônicos finais**) — não como dois tipos soltos.

### `FrameValidationPolicy` (V1)

```typescript
type FrameValidationPolicy = {
  requireProductPresence: boolean; // V1: true
  requireReferenceBackedIdentity: boolean; // V1: true
  allowLogoInference: boolean; // V1: false
  allowHiddenSideCompletion: boolean; // V1: false
  allowPackagingInference: boolean; // V1: false
  minimumReferenceCount?: number; // V1: normalmente 1
};
```

V1 é deliberadamente conservadora — mesmo princípio de
`ScriptFactualClaimRulesV1` da Skill 08: defaults restritivos, nunca
assumir permissão implícita.

## Idempotência e checkpoint de geração

Diferente das Skills 07/08, o resultado externo aqui é um arquivo binário
de imagem, muitas vezes entregue inicialmente como **URL temporária do
provider** — isso exige um estágio intermediário próprio que 07/08 não
precisam.

### Granularidade do checkpoint

Como uma execução pode ter vários `FrameRequirement`, o checkpoint não é
único por `(jobId, attemptNumber)` como em 07/08 — é único por requisito:

```text
UNIQUE lógico:
(jobId, attemptNumber, frameRequirementId)
→ no máximo 1 FrameGenerationCheckpoint canônico
```

Isso permite que cada frame seja retomado independentemente, sem
re-chamar o provider para frames já resolvidos daquela Attempt.

### State machine

```text
PREPARED
→ SUBMITTING
→ PROVIDER_RESULT_CAPTURED
→ ARTIFACT_MATERIALIZED
→ VALIDATED
ou
→ REJECTED
```

`PROVIDER_RESULT_CAPTURED` significa apenas que o que o fornecedor
respondeu foi preservado de forma durável (`providerRequestId`,
`providerAssetUrl` temporária, metadata, `providerResponseHash`) — **não**
significa que já existe um frame canônico.

`ARTIFACT_MATERIALIZED` significa que os bytes da imagem foram
efetivamente baixados, o mime foi validado, dimensões conhecidas quando
possível, `contentHash` calculado, e um `storageRef` persistente obtido.
Só a partir daqui existe um candidato real a `FrameArtifact`.

> **Regra central:** um frame gerado só se torna reproduzível quando seus
> bytes forem materializados e identificados por `contentHash`; a URL
> temporária do provider **nunca** é identidade canônica do artefato.

Isso evita um bug sério: o provider gera a imagem e devolve uma URL que
expira em 1 hora; se marcássemos `RESPONSE_CAPTURED` e fizéssemos replay
no dia seguinte, a URL já teria morrido — a resposta do provider foi
capturada, mas o artefato não.

### Hashes — mesmo padrão de separação das Skills 07/08

```text
FRAME_GENERATION_CONTEXT_V1
→ prova o que foi efetivamente disponibilizado à geração:
  frameRequirement (sem IDs operacionais), creativeDirectionResultId +
  creativeDirectionHash, scriptResultId + scriptHash, subject binding
  canônico, productVisualReferenceSetRef, MaterializedVisualReference.contentHash[]
  em ordem determinística, FramePolicy snapshot comportamental,
  correctionContext.correctionDirectiveHash quando presente (ausência
  também é um valor distinto de presença — replay sem correção nunca
  colide com replay com correção)

FRAME_PROVIDER_REQUEST_V1
→ prova a chamada externa: generationContextHash, providerKey, modelKey,
  promptTemplateVersion, outputSchema/configVersion, generation
  parameters relevantes

FRAME_PROVIDER_RESPONSE_V1
→ prova a resposta externa normalizada; NÃO inclui URL efêmera,
  timestamps do provider, latência ou IDs operacionais voláteis, salvo
  quando algum valor fizer parte semanticamente do resultado

contentHash = sha256(bytes exatos do frame materializado)
→ identificador factual do conteúdo visual efetivamente produzido
```

Mesmo sendo imagem, continuamos separando "mudaram os dados?" de "mudou o
provider/request?".

**Decisão explícita: sem hash agregador adicional.** Não existe um
"frameHash" calculado sobre metadata — já há identidades separadas
suficientes (`frameRequirementHash` = o que precisava ser produzido,
`generationContextHash` = quais dados/referências foram disponibilizados,
`providerRequestHash` = qual chamada foi feita, `providerResponseHash` =
resposta externa normalizada, `contentHash` = bytes exatos produzidos).
Um hash a mais aqui seria redundante e aumentaria a chance de
inconsistência. As Skills 10/11 devem consumir explicitamente
`frameArtifactId` + `contentHash` — nunca "o frame mais recente".

### `FrameGenerationCheckpoint`

```typescript
type FrameGenerationCheckpointState =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'PROVIDER_RESULT_CAPTURED'
  | 'ARTIFACT_MATERIALIZED'
  | 'VALIDATED'
  | 'REJECTED';

type FrameGenerationCheckpoint = {
  frameGenerationCheckpointId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  frameRequirementId: string;
  frameRequirementHash: string;

  framePolicyId: string;
  framePolicyVersion: string;
  framePolicySnapshotHash: string;

  providerKey: string;
  modelKey: string;

  generationContextHash: string;
  providerRequestHash: string;

  providerRequestKey: string;

  state: FrameGenerationCheckpointState;

  providerRequestId?: string;
  providerResponseHash?: string;

  // Efêmero/operacional. Nunca identidade do FrameArtifact.
  temporaryAssetRef?: string;

  materializedContentHash?: string;
  materializedStorageRef?: string;
  materializedMimeType?: string;
  materializedWidth?: number;
  materializedHeight?: number;

  rejectionCode?: string;

  createdAt: string;
  updatedAt: string;
};
```

Um checkpoint já existente para `(jobId, attemptNumber,
frameRequirementId)` com `frameRequirementHash`, policy, provider ou
hashes incompatíveis gera `FRAME_GENERATION_CHECKPOINT_CONFLICT`
(FATAL_ERROR + AuditEvent) — mesmo princípio de conflito de replay já
usado nas Skills anteriores.

### Replay

```text
VALIDATED                   → reutiliza FrameArtifact, zero provider call
ARTIFACT_MATERIALIZED       → não chama provider, retoma validação
PROVIDER_RESULT_CAPTURED    → não chama provider, tenta materializar a
                               imagem já gerada
SUBMITTING ambíguo          → reconciliation/idempotency se o provider
                               suportar; senão
                               FRAME_GENERATION_EXTERNAL_STATE_UNKNOWN →
                               BLOCKED/EXTERNAL_STATE_UNKNOWN via Skill02
                               (mesmo mecanismo já aprovado)
```

Nunca "não achei o arquivo local, então gera outro" — isso pode gerar
custo duplicado.

Caso explícito adicional: `PROVIDER_RESULT_CAPTURED` cuja URL temporária
expirou antes da materialização não prova que a geração não aconteceu —
não é retry pago automático. Se o provider permitir recuperar o asset via
`providerRequestId`, reconcilia; se não permitir, o estado externo
permanece "gerado, mas artefato irrecuperável"
(`FRAME_PROVIDER_ASSET_UNRECOVERABLE`) e uma nova geração exige nova
Attempt/policy explícita — nunca acontece escondida.

### Atomicidade Storage + banco

O blob é externo ao Postgres — não existe transação perfeita entre
Storage e DB (mesma lição da Skill 06). Sequência segura:

```text
1. gerar/fetch bytes
2. validar formato mínimo
3. calcular contentHash
4. gravar blob em storage persistente
5. transação DB: checkpoint → ARTIFACT_MATERIALIZED + metadata/
   contentHash/storageRef
```

Se o passo 5 falhar, o blob pode ficar órfão (cleanup posterior) — isso
**não** significa artifact materializado canonicamente. Após validação
final: `FrameArtifact` + `checkpoint.state = VALIDATED` + `AuditEvent`
resumo, na mesma transação de banco.

## Multi-tenant

Fonte única de confiança: `trustedTenantId = Job.tenantId`. Devem ser
compatíveis: `FrameGenerationInput`, `StageSubjectBinding`,
`CreativeDirectionResult`, `ScriptResult`, `FramePolicyBinding`,
`FramePolicy`, ownership/contexto do `ProductVisualReferenceSet`,
`MaterializedVisualReference`, provider configuration,
`FrameGenerationCheckpoint`, `FrameArtifact`. Divergência →
`FRAME_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de segurança).

Sutileza: `offer_snapshots.image_url` vem do catálogo compartilhado — isso
não torna o frame gerado global. A origem visual do marketplace pode ser
catálogo compartilhado, mas `MaterializedVisualReference`,
`FrameGenerationCheckpoint` e `FrameArtifact` daquela execução são
tenant-scoped. **Nenhum dedupe automático cross-tenant**, mesmo se o
`contentHash` da referência ou do frame gerado coincidir entre tenants.

## Credenciais/providers

Mesma regra já estabilizada nas Skills 07/08: `TENANT_BYO` /
`PLATFORM_MANAGED` — provider global não significa credencial global.
Hoje: `ImageGenerationProvider = NOT_IMPLEMENTED`.

## Erros / resultados de domínio

Distinção explícita entre ausência legítima de dado, falha técnica
recuperável, e conteúdo inválido — nunca tratar "não tenho foto" como
falha de infraestrutura:

```text
FRAME_REFERENCE_UNAVAILABLE
→ offer_snapshots.image_url é null
→ resultado/razão de DOMÍNIO, não FATAL_ERROR estrutural
→ nenhum provider de imagem chamado, nenhum custo de geração

FRAME_REFERENCE_FETCH_FAILED
→ image_url existe, mas o download falhou (timeout, 4xx/5xx, DNS etc.)
→ RETRYABLE_ERROR

FRAME_REFERENCE_INVALID
→ download OK (200), mas o conteúdo não é uma imagem válida / está
  corrompido
→ FATAL_ERROR daquela tentativa (não adianta retry sem nova fonte)
```

Erros de validação de frame (após geração):

Fatal de domínio do frame — `FRAME_REQUIREMENT_UNSATISFIABLE` (ver
"Lista completa — `FATAL_ERROR`" abaixo, não repetido aqui): o beat
pede algo impossível de representar com fidelidade dado o material
disponível.

```text
Rejeição semântica do resultado gerado (checkpoint → REJECTED, sem
FrameArtifact):
FRAME_PRODUCT_IDENTITY_VIOLATION
FRAME_FORBIDDEN_VISUAL_CLAIM
FRAME_UNSUPPORTED_PRODUCT_COMPLETION
FRAME_SCENE_REQUIREMENT_NOT_SATISFIED
FRAME_REFERENCE_COVERAGE_INSUFFICIENT
```

### Lista completa — `FATAL_ERROR`

Erros estruturais/contratuais; não devem gerar `FrameArtifact`.

```text
FRAME_TENANT_MISMATCH
FRAME_CREATIVE_DIRECTION_MISMATCH
FRAME_SCRIPT_RESULT_MISMATCH
FRAME_SUBJECT_BINDING_MISMATCH
FRAME_REQUIREMENT_HASH_MISMATCH
FRAME_POLICY_NOT_FOUND
FRAME_POLICY_BINDING_NOT_FOUND
FRAME_POLICY_TENANT_MISMATCH
FRAME_PROVIDER_CAPABILITY_UNSUPPORTED
FRAME_REFERENCE_INVALID
FRAME_REQUIREMENT_UNSATISFIABLE
FRAME_RESULT_REPLAY_CONFLICT
FRAME_GENERATION_CHECKPOINT_CONFLICT
FRAME_ARTIFACT_INVALID
```

**PATCH (Ponto S2).** `ProductVisualReferenceSet` agora ganhou `tenantId`/
`subjectRef` como campos reais — **0 `FATAL_ERROR` novos**:
`FRAME_TENANT_MISMATCH` já cobre divergência de tenant do set (já listado
explicitamente no parágrafo Multi-tenant acima), `FRAME_SUBJECT_BINDING_MISMATCH`
cobre divergência entre `set.subjectRef` e o subject da execução, e
`FRAME_RESULT_REPLAY_CONFLICT` cobre materialização incompatível do set
em replay (o set nasce dentro da mesma operação idempotente
`(jobId, attemptNumber)` do `FrameGenerationResult`, não tem identidade
de replay separada).

### Lista completa — `RETRYABLE_ERROR`

Falhas operacionais/transitórias.

```text
FRAME_REFERENCE_FETCH_FAILED
FRAME_REFERENCE_MATERIALIZATION_FAILED
FRAME_PROVIDER_UNAVAILABLE
FRAME_PROVIDER_REQUEST_FAILED
FRAME_PROVIDER_RESPONSE_FETCH_FAILED
FRAME_ARTIFACT_DOWNLOAD_FAILED
FRAME_ARTIFACT_STORAGE_FAILED
TRANSIENT_DATASTORE_ERROR
```

### `BLOCKED` / estado externo ambíguo

Casos ambíguos que não autorizam retry cego — alinhados ao mecanismo já
aprovado da Skill 02 (side effect externo possivelmente ocorrido, custo
possivelmente cobrado, estado não totalmente reconciliado):

```text
FRAME_GENERATION_EXTERNAL_STATE_UNKNOWN
→ checkpoint travou em SUBMITTING sem confirmação do provider e sem
  mecanismo de reconciliation/idempotency
→ Job.externalEffectState=UNKNOWN, JobStatus=BLOCKED,
  BlockReason=EXTERNAL_STATE_UNKNOWN

FRAME_PROVIDER_ASSET_UNRECOVERABLE
→ PROVIDER_RESULT_CAPTURED, mas a URL temporária do provider expirou
  antes da materialização e o provider não permite recuperar o asset via
  providerRequestId
→ estado externo permanece "gerado, mas irrecuperável"; nova geração
  exige nova Attempt/policy explícita, nunca automática/escondida
```

## Contratos canônicos finais

Estas são as **únicas definições canônicas** destes tipos no arquivo —
substituem qualquer versão intermediária citada nas seções acima.

### `FrameValidationSummary`

Persistida com detalhe suficiente para auditoria, sem virar uma análise
estética genérica.

```typescript
type FrameValidationSummary = {
  validationSchemaVersion: 'FRAME_VALIDATION_V1';

  structural: {
    nonEmptyImage: boolean;
    decodableImage: boolean;
    mimeTypeAllowed: boolean;
    dimensionsReadable: boolean;
  };

  semantic: {
    productPresent: boolean;
    productIdentityPreserved: boolean;
    sceneRequirementSatisfied: boolean;

    forbiddenVisualClaimIntroduced: boolean;
    unsupportedProductCompletion: boolean;
    referenceCoverageSufficient: boolean;
  };

  valid: boolean;

  rejectionCodes: string[];

  validatorVersion: string;

  validatedAt: string;
};
```

Invariante:

```text
valid=true
→ structural inteiro válido
→ productPresent=true quando policy exigir
→ productIdentityPreserved=true
→ sceneRequirementSatisfied=true
→ forbiddenVisualClaimIntroduced=false
→ unsupportedProductCompletion=false
→ referenceCoverageSufficient=true

rejectionCodes vazio quando valid=true.
```

A Skill 09 **não produz** `beautyScore`, `aestheticScore` ou
`marketingQualityScore`.

### `FrameArtifact` (canônico)

```typescript
type FrameArtifact = {
  frameArtifactId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  frameRequirementId: string;
  frameRequirementHash: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  stageSubjectBindingId: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef;

  materializedReferenceContentHashes: string[];

  framePolicyId: string;
  framePolicyVersion: string;
  framePolicySnapshotHash: string;

  providerKey: string;
  modelKey: string;

  generationContextHash: string;
  providerRequestHash: string;
  providerResponseHash: string;

  contentHash: string;

  storageRef: string;

  mimeType: string;
  width?: number;
  height?: number;

  validationSummary: FrameValidationSummary;

  createdAt: string;
};
```

Invariantes:

```text
FrameArtifact.validationSummary.valid = true

FrameArtifact.contentHash
= hash dos bytes existentes em storageRef

frameRequirementId/hash
= exatamente o requirement executado

materializedReferenceContentHashes
⊆ referências canônicas permitidas pelo requirement

temporaryAssetRef nunca aparece aqui.
```

### `FrameGenerationResult`

Discriminated union — separa um resultado realmente produzido de estados
legítimos em que nenhum frame deve ser gerado:

```typescript
type FrameGenerationResult =
  | FrameGenerationSuccess
  | FrameGenerationNoFrameRequired
  | FrameGenerationReferenceUnavailable;

type FrameGenerationSuccess = {
  resultId: string;
  resultStatus: 'OK';

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // content.kind='POPULATED'

  frameRequirementCount: number;

  frameArtifacts: Array<{
    frameRequirementId: string;
    frameRequirementHash: string;

    frameArtifactId: string;
    contentHash: string;
  }>;

  framePolicyId: string;
  framePolicyVersion: string;
  framePolicySnapshotHash: string;

  createdAt: string;
};
```

Para V1: `resultStatus=OK` → todo `FrameRequirement` daquela execução que
precisava ser satisfeito possui exatamente um `FrameArtifact VALIDATED`.
Falha técnica, provider inválido ou checkpoint `REJECTED` não produz `OK`
parcial.

```typescript
// Estado de domínio legítimo — nenhum beat exige seed/frame
type FrameGenerationNoFrameRequired = {
  resultId: string;
  resultStatus: 'NO_FRAME_REQUIRED';

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2:
    // content.kind='EMPTY', emptyReason='NO_FRAME_REQUIRED' ou
    // 'TEXT_TO_VIDEO' conforme a precedência definida acima — este
    // branch NUNCA fica sem materializar o set, mesmo sem frame

  frameRequirementCount: 0;

  framePolicyId: string;
  framePolicyVersion: string;
  framePolicySnapshotHash: string;

  createdAt: string;
};
```

Sem provider call, sem checkpoint de geração e sem custo externo — isso
preserva a verdade quando nenhum beat exige seed/frame. **PATCH (Ponto
S2):** antes deste patch este branch não carregava nenhuma referência ao
`ProductVisualReferenceSet` — era exatamente o buraco que deixava
Skills 10/11/12/13/20 sem FK válida quando `NO_FRAME_REQUIRED`/
`TEXT_TO_VIDEO` ocorria. Corrigido: a Skill 09 materializa o set `EMPTY`
**antes** de decidir a branch, não depois.

```typescript
// frameRequirementCount > 0 mas ProductVisualReferenceSet.content.kind='EMPTY'
type FrameGenerationReferenceUnavailable = {
  resultId: string;
  resultStatus: 'REFERENCE_UNAVAILABLE';

  reason: 'FRAME_REFERENCE_UNAVAILABLE';

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // content.kind='EMPTY', emptyReason='REFERENCE_UNAVAILABLE'

  frameRequirementCount: number;

  framePolicyId: string;
  framePolicyVersion: string;
  framePolicySnapshotHash: string;

  createdAt: string;
};
```

`REFERENCE_UNAVAILABLE` → `COMPLETED` tecnicamente, nenhum provider
chamado, nenhum custo. A Skill 01/pipeline decide se isso bloqueia a
produção, troca de subject futuramente, ou toma outro caminho.

**O que NÃO gera `FrameGenerationResult`:** falhas técnicas, outputs
inválidos do provider, violações de fidelidade, estado externo ambíguo,
referência corrompida ou requisito insatisfazível **não** são convertidos
em um resultado de domínio fictício. Nesses casos a Skill 09 reporta o
erro correspondente à Skill 02 e nenhum `FrameGenerationResult` canônico
é fabricado — mesma disciplina da Skill 08.

### Idempotência do resultado agregado

Além do checkpoint granular por `frameRequirementId`:

```text
UNIQUE lógico:
(jobId, attemptNumber)
→ no máximo 1 FrameGenerationResult canônico
```

Replay compatível → reabre o `Result`, valida hashes/upstreams/policy,
retorna exatamente o mesmo `Result`, zero provider call. Incompatível →
`FRAME_RESULT_REPLAY_CONFLICT` (FATAL_ERROR + AuditEvent).

### Cadeia completa

```text
ScriptResult + CreativeDirectionResult + StageSubjectBinding +
ProductVisualReferenceSet
  → FrameRequirement[]
  → MaterializedVisualReference[]
  → FrameGenerationCheckpoint
  → provider
  → bytes materializados
  → FrameValidationSummary
  → FrameArtifact
  → FrameGenerationResult
```

> **Regra arquitetural central:** `FrameArtifact` é um artefato visual
> derivado; ele nunca se torna uma nova fonte factual independente sobre
> o produto. Nas etapas seguintes, a referência factual da identidade do
> produto continua sendo o `ProductVisualReferenceSet` materializado que
> originou o frame. Isso importa para as Skills 10/11: uma eventual
> alucinação que escapasse da Skill 09 não pode ganhar legitimidade
> simplesmente por ter aparecido num frame gerado.

## Fronteiras explícitas com código legado

```text
next/og ImageResponse + frame-feed.png/frame-story.png (story-template/route.tsx)
= STATIC_POST_COMPOSITION legado

NÃO é:
- FrameGenerationProvider
- ProductVisualReference / seed image pipeline
- geração de imagem por IA

Não reaproveitado pela Skill 09 apenas porque ambos produzem PNG.
```

```text
OpenAI SDK presente no repo
→ capability VISUAL_ANALYSIS já existe (Concierge, gpt-4o-mini, lê fotos
  que o cliente manda)

AI IMAGE GENERATION
→ NOT_IMPLEMENTED — não assumir images.generate só porque o SDK já está
  instalado para outro propósito
```

## Observabilidade

### Logs estruturados

**Por execução de frame:** `tenantId`, `runId`, `jobId`, `attemptNumber`,
`frameRequirementId`, `frameRequirementHash`, `providerKey`, `modelKey`,
`checkpointState`, `generationContextHash`, `providerRequestHash`,
`providerResponseHash?`, `contentHash?`, `errorCode?`, `timestamp`.

**Por materialização de referência:** `productVisualReferenceSetId`,
`sourceOfferSnapshotId`, `referenceSourceUrl`, `contentHash?`,
`mimeType?`, `errorCode?`.

**Por validação semântica:** `frameArtifactId?`,
`productIdentityPreserved`, `sceneRequirementSatisfied`,
`forbiddenVisualClaimIntroduced`, `unsupportedProductCompletion`,
`rejectionCode?`.

Nunca logar por padrão: bytes da imagem, prompt completo enviado ao
provider, token/API secret, credencial, payload bruto desnecessário.

### `AuditEvent`

Resumo, não payload completo. Criado quando: um `FrameArtifact` é
validado; um checkpoint entra em `REJECTED`; ocorre
`FRAME_RESULT_REPLAY_CONFLICT`; ocorre `FRAME_TENANT_MISMATCH`; ocorre
`FRAME_GENERATION_EXTERNAL_STATE_UNKNOWN`.

Campos resumidos: `frameArtifactId?`, `tenantId`, `runId`, `jobId`,
`attemptNumber`, `frameRequirementId`, `providerKey`, `modelKey`,
`resultState`, `errorCode?`, `productVisualReferenceSetHash`, `generationContextHash`,
`providerRequestHash`, `providerResponseHash?`, `contentHash?`,
`createdAt`. Não duplicar bytes/URL bruta do provider.

### Métricas

```text
Operacionais:
frame_generation_attempts_total
frame_generation_validated_total
frame_generation_rejected_total
frame_generation_retryable_error_total
frame_generation_external_state_unknown_total

De referência:
frame_reference_unavailable_rate
frame_reference_fetch_failed_rate
frame_reference_invalid_rate

De validação:
product_identity_violation_rate
forbidden_visual_claim_rate
unsupported_product_completion_rate
scene_requirement_not_satisfied_rate

De replay/idempotência:
frame_replay_reuse_rate
frame_result_replay_conflict_rate
```

## Plano de testes

1. `image_url = null` no offer_snapshot referenciado →
   `FRAME_REFERENCE_UNAVAILABLE`.
2. URL existe mas fetch falha transitoriamente →
   `FRAME_REFERENCE_FETCH_FAILED` (RETRYABLE_ERROR).
3. URL baixa conteúdo inválido/indecodificável → `FRAME_REFERENCE_INVALID`.
4. Mesma URL, bytes diferentes em momentos diferentes → o que vale é o
   `MaterializedVisualReference.contentHash` da execução.
5. `ProductVisualReferenceSet.tenantId` divergente do `Job.tenantId` →
   `FRAME_TENANT_MISMATCH`.
6. Provider config de outro tenant nunca é reutilizada.
7. Mesmo `contentHash` de referência em tenants diferentes não autoriza
   dedupe de `FrameArtifact`.
8. Reexecução após `VALIDATED` reutiliza `FrameArtifact`, zero provider
   call.
9. Reexecução após `ARTIFACT_MATERIALIZED` retoma da validação, zero
   provider call.
10. Reexecução após `PROVIDER_RESULT_CAPTURED` tenta materializar, zero
    nova geração.
11. Reexecução que geraria artefato logicamente incompatível com
    `(jobId, attemptNumber, frameRequirementId)` já persistido →
    `FRAME_RESULT_REPLAY_CONFLICT`.
12. Crash após submit e antes de resposta durável →
    `FRAME_GENERATION_EXTERNAL_STATE_UNKNOWN` / BLOCKED.
13. Provider devolveu URL temporária, asset expirou antes da
    materialização e não há recuperação →
    `FRAME_PROVIDER_ASSET_UNRECOVERABLE`.
14. Produto gerado com cor diferente da referência →
    `FRAME_PRODUCT_IDENTITY_VIOLATION`.
15. Produto gerado com botão/logo inexistente na referência →
    `FRAME_UNSUPPORTED_PRODUCT_COMPLETION`.
16. Beat pede mostrar detalhe não coberto pela única referência →
    `FRAME_REQUIREMENT_UNSATISFIABLE` ou
    `FRAME_REFERENCE_COVERAGE_INSUFFICIENT`, conforme o momento.
17. Frame insere alegação visual proibida (ex.: "50% OFF" desenhado no
    próprio artefato) sem base factual autorizada →
    `FRAME_FORBIDDEN_VISUAL_CLAIM`.
18. Cena válida, produto fiel, sem alegações indevidas → `VALIDATED`.
19. `creativeDirectionHash` divergente do input esperado →
    `FRAME_CREATIVE_DIRECTION_MISMATCH`.
20. `scriptHash` divergente → `FRAME_SCRIPT_RESULT_MISMATCH`.
21. `frameRequirementHash` divergente → `FRAME_REQUIREMENT_HASH_MISMATCH`.
22. `FramePolicyBinding` ausente → `FRAME_POLICY_BINDING_NOT_FOUND`.
23. Blob grava com sucesso, mas transação DB falha → blob órfão
    permitido; nenhum `FrameArtifact` canônico.
24. `FrameArtifact` nunca é persistido sem `checkpoint.state=VALIDATED`
    na mesma transação.
25. Produto/preço mudam depois no banco, mas `FrameArtifact` antigo
    continua reproduzível pelos hashes congelados.

**Ponto S2 — `ProductVisualReferenceSet` como artifact obrigatório
(26-38):**

26. Toda execução válida da Skill 09 produz exatamente um
    `ProductVisualReferenceSet` — `resultStatus=OK`,
    `NO_FRAME_REQUIRED` e `REFERENCE_UNAVAILABLE` sempre carregam
    `productVisualReferenceSetRef`.
27. `content.kind='POPULATED'` exige `references.length >= 1` e proíbe
    `emptyReason`.
28. `content.kind='EMPTY'` exige `references.length === 0` e exige
    `emptyReason`.
29. `EMPTY`/`NO_FRAME_REQUIRED` é artifact válido.
30. `EMPTY`/`REFERENCE_UNAVAILABLE` é artifact válido.
31. `EMPTY`/`TEXT_TO_VIDEO` é artifact válido.
32. Os três `emptyReason` produzem `productVisualReferenceSetHash`
    diferentes entre si para o mesmo `subjectRef`/tenant, mesmo todos
    com `references=[]`.
33. Duas referências semanticamente idênticas após canonicalização →
    `FRAME_REFERENCE_INVALID`.
34. Ordem diferente das mesmas referências no array não muda o hash
    (canonicalização ordena antes de hashear).
35. `productVisualReferenceSetId`/`materializedAt`/
    `productVisualReferenceSetHash` não participam do próprio hash.
36. `ProductVisualReferenceSet.tenantId` divergente do tenant de
    execução → `FRAME_TENANT_MISMATCH` (reforça o teste 5, que agora
    testa um campo que existe de fato).
37. `ProductVisualReferenceSet.subjectRef` divergente do subject da
    execução → `FRAME_SUBJECT_BINDING_MISMATCH`.
38. Replay compatível reutiliza o `ProductVisualReferenceSet` já
    materializado (regra S14), zero reseleção de referências.

## Fechamento conceitual

> A Skill 09 não avalia "beleza" nem "qualidade criativa geral"; ela
> valida se o frame é tecnicamente utilizável e semanticamente fiel ao
> produto e ao frame requirement autorizado.

> O provider de imagem nunca é fonte de verdade factual sobre a aparência
> do produto; a verdade factual vem apenas das referências materializadas
> e dos contratos upstream congelados.

## Status de implementação (nesta fase de especificação)

```text
FrameArtifact persistence         → NOT_IMPLEMENTED
Generated-frame Storage (bucket)  → NOT_IMPLEMENTED
Image-generation provider         → NOT_IMPLEMENTED
```

Nenhum bucket/tabela é criado nesta fase — apenas os contratos são
definidos. Runtime real aguarda Fable 5 Max + GPT-6 Astra, mesma regra de
ouro das Skills 01-08.

## Questões abertas

- Qual(is) provider(s) de geração de imagem serão suportados (Gemini/
  Imagen, outro) — decisão de infraestrutura/custo, não arquitetural, fica
  para quando o provider real for integrado.
- Storage: bucket dedicado do Supabase Storage vs. outra estratégia —
  desenhar quando a implementação real começar.
- Se/quando uma segunda fonte de referência visual (galeria Shopee, upload
  manual) existir, o adapter correspondente populará `references[]` com
  mais de um item — o contrato já suporta isso sem mudança de schema.
