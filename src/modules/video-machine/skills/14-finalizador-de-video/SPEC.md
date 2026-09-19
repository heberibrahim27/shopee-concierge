# Skill 14 — Finalizador de Vídeo

> **APROVADA EM ESPECIFICAÇÃO — 14/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado. Este arquivo só vira código depois da
> revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 (ChatGPT ↔ Claude Code), com auditoria
> real do repositório confirmando greenfield total (zero FFmpeg/lib de
> vídeo, zero bucket de Storage, precedente real só de imagem estática do
> Instagram) e uma decisão estrutural central: transformações são
> restritas a `CONTENT_PRESERVING` na V1 — nenhuma alteração semântica
> (crop/trim/speed change/overlay) é permitida (mesmo método das Skills
> 04-13).
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B6)**:
> `processingAuthorizationRef` continua existindo com esse nome, mas
> sua semântica normativa agora é
> `ExecutionQuotaBinding.quotaAuthorizationId` (classe
> `PROCESSING_OPERATION`) — obrigatório antes do side effect de
> processamento. Ver "Reparo transversal pós-revisão Fable → Ponto E"
> no `SPEC.md` da Skill 23.

## Garantia central (revisada após debate)

A Skill 14 recebe um `VideoArtifact` **exato** e um `VideoAuditResult`
**exato** (por ID + hash, nunca "a auditoria mais recente" — isso
quebraria replay determinístico: uma nova auditoria com policy/versão
diferente não pode silenciosamente mudar o resultado do mesmo Job) cujo
`videoArtifactId`/`videoContentHash` correspondem exatamente ao
`VideoArtifact` recebido e cujo `verdict = COMPLIANT`. A partir disso,
resolve policies de rendition **verificadas** para os destinos
solicitados e produz artefatos finais tecnicamente compatíveis, usando
apenas transformações autorizadas que **preservam o conteúdo aprovado**.
A Skill 14 não cria nem corrige conteúdo, não decide aprovação (Skill
03), não corrige violation (Skill 13), não publica (Skill 17), não gera
vídeo novo (Skill 11), e **não realiza transformações semanticamente
destrutivas pra "forçar" compatibilidade** — quando a compatibilidade
exigiria alteração semântica (corte narrativo, remoção de cena,
reenquadramento destrutivo), ela reporta incompatibilidade em vez de
improvisar.

Fronteiras:

```text
Skill12 → prova conformidade do source
Skill14 → materializa renditions técnicas content-preserving
Skill03 → aprovação/gates
Skill13 → correção semântica
Skill17 (futura) → publicação
```

## Auditoria real do repositório (2026-09-18)

Confirmado via agente de auditoria: **greenfield total**, mesma situação
das Skills 09-12.

- Zero código de processamento/transcodificação de vídeo existe hoje —
  nenhum FFmpeg, nenhuma lib de vídeo instalada (`package.json` raiz só
  tem `next`/`react`/`openai`/`@supabase/supabase-js`; nenhum
  `ffmpeg-static`/`fluent-ffmpeg`/`@ffmpeg/ffmpeg`/`remotion`).
- Nenhum bucket de Storage existe ainda (nem para vídeo, nem pra nenhum
  outro propósito) — confirmado zero `storage.buckets`/`storage.objects`
  nas migrations `.sql`. `VideoArtifact.storageRef` (Skill 11) já é um
  campo spec-only apontando pra um storage que ainda não existe.
- **Skills 15 ("Gerador de Link/Tracking"), 16 ("Automação de
  Comentários/DM") e 17 ("Publicador Multicanal") ainda não existem como
  SPEC.md** — não há contrato de input já congelado a herdar delas; a
  Skill 14 precisa ser desenhada de forma que Skills futuras possam
  consumir seu output sem reabri-la.
- Único precedente real de formato por canal é de **imagem estática**,
  não vídeo: `src/app/api/story-template/route.tsx` (compositor
  `next/og`) usa `feed` 1080×1350 (4:5) e `story` 1080×1920 (9:16),
  publicados via Windsor.ai em `publish-product/route.ts` — só Instagram
  feed/story, nenhum TikTok/Pinterest/Shopee Video. Nenhum
  duration/codec/frame-rate real existe em lugar nenhum do código.
- `VideoArtifact` (Skill 11) tem `width?`/`height?`/`durationMs?`
  **opcionais** (não garantidos) e **não tem campo `codec`** — a Skill 14
  não pode assumir que sabe as dimensões/duração de entrada sem checar.

## Decisões fechadas no debate inicial (2026-09-18)

**`ChannelRenditionPolicy` com verificação formal.** Toda policy carrega
`verification.status` (`UNVERIFIED`/`VERIFIED`/`STALE`) com
`sourceType`/`sourceRefs` apontando pra documentação oficial da
plataforma. `status != VERIFIED` → nenhuma rendition destinada a
publicação real (`CHANNEL_POLICY_NOT_CONFIGURED`); `UNVERIFIED` só serve
pra planejamento/spec/dry-run, nunca vira capacidade operacional. Mesma
disciplina capability-aware da Skill 06: ausência de capability
confirmada não vira capability zero nem capability presumida. O
precedente estático do Instagram (`story-template/route.tsx`: 1080×1920
story, 1080×1350 feed) fica registrado explicitamente como
`STATIC_IMAGE_ONLY` — **não é evidência válida** pra policy de vídeo, não
deve ser reaproveitado automaticamente pra Reels.

**Duas classes de transformação — só uma é permitida na V1.**
`FinalizationTransformClass = 'CONTENT_PRESERVING' | 'SEMANTICALLY_SENSITIVE'`.
`CONTENT_PRESERVING`: remux, normalização de codec/container/frame
rate/resolução, resize proporcional, padding sem cortar conteúdo,
normalização técnica de áudio, metadata stripping, watermark de marca
já aprovado (asset exato + posição/opacidade/tamanho definidos em
policy), burn-in exato de texto já aprovado (texto+timing vindos de
upstream autorizado — nunca copy nova). `SEMANTICALLY_SENSITIVE`: crop
que remove pixels, trim, speed change, burn-in que pode ocultar
conteúdo, recomposição de quadro — **invalida a suposição de que o
`COMPLIANT` do source cobre automaticamente a rendition final**. A
Skill 14 V1 se restringe a transforms `CONTENT_PRESERVING`; quando o
canal exigir incompatibilidade que só se resolveria destruindo
composição, o resultado é `SOURCE_NOT_COMPATIBLE_WITH_CHANNEL_POLICY`
(aspect ratio) ou `SOURCE_DURATION_INCOMPATIBLE` (duração) — nunca corte
"pra caber", que pode remover o CTA ou parte da narrativa. Regra:
"Skill 14 pode renderizar conteúdo textual/visual adicional somente
quando seu conteúdo semântico já estiver congelado em upstream ou em
uma policy de branding determinística — ela não cria copy."

**Execução multi-tick com ressalva real.** Diferente da Skill 11 (onde o
provider remoto processa por minutos via polling), um FFmpeg local
rodando dentro do limite de 60s do Vercel não pode simplesmente
"continuar" no próximo tick se for morto no meio. Abstração:
`MediaFinalizationProcessor` com dois modos —
`INLINE_BOUNDED` (operação comprovadamente cabe no orçamento da
invocação) e `ASYNC_PROCESSOR` (submit → persist
`processorOperationId` → tick futuro faz poll → materializa). O
provider de finalização não é necessariamente pago nem igual ao de
geração — a Skill 14 não herda automaticamente a semântica de quota da
Skill 11. Hoje: FFmpeg local `NOT_INSTALLED`, Async Media Processor
`NOT_IMPLEMENTED`, Storage `NOT_IMPLEMENTED`.

**Evidência técnica própria, não confiar só nos campos opcionais do
`VideoArtifact`.** Como `width`/`height`/`durationMs` são opcionais na
Skill 11 e `codec` nem existe como campo, a Skill 14 precisa de uma fase
de inspeção própria (`FinalizationSourceMediaEvidence`) orientada a
compatibilidade de transcodificação — diferente da inspeção da Skill 12,
orientada a auditoria. Tentar reaproveitar evidência técnica compatível
já existente primeiro; só rodar inspector próprio se insuficiente.

**Output neutro pra Skills 15-17 (ainda inexistentes).** A Skill 14 não
espera Skills 15-17 existirem pra ser especificada, mas também não
define os contratos delas. Expõe `FinalizedVideoRendition` — a futura
Skill 17 consome esse contrato, nunca o contrário.

**Próximo bloco do debate:** `FinalizationInput`,
`ChannelRenditionPolicy`/`Binding`, `FinalizationTransformPlan`,
`FinalizationSourceMediaEvidence`, `FinalizationExecution`,
`FinalizedVideoRendition`.

## Decisão estrutural: um `publicationTargetKey` por Job

Na V1, cada Job da Skill 14 finaliza exatamente **um** canal. Se o mesmo
vídeo aprovado vai pra Instagram, TikTok e Pinterest, a Skill 01
materializa três intents/Jobs independentes. Isso isola policy, falha,
replay e custo de processamento por destino — um canal incompatível
nunca impede os demais.

```text
VideoArtifact A + Audit COMPLIANT
↓
Instagram target → Job Skill14 A
TikTok target    → Job Skill14 B
Pinterest target → Job Skill14 C
```

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


### `FinalizationInput`

```typescript
type FinalizationInput = {
  tenantId: string;
  runId: string;

  videoArtifactId: string;
  videoContentHash: string;

  videoAuditResultId: string;
  videoAuditResultHash: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  publicationTargetKey: string;

  channelRenditionPolicyKey: string;

  // Resolvido e congelado antes de qualquer processamento.
  resolvedPolicy: {
    policyId: string;
    policyVersion: string;
    policySnapshotHash: string;

    bindingResolutionHash: string;
  };
};
```

Invariantes: `VideoAuditResult.verdict = COMPLIANT`;
`VideoAuditResult.videoArtifactId = FinalizationInput.videoArtifactId`;
`VideoAuditResult.videoContentHash = FinalizationInput.videoContentHash`;
`VideoArtifact.videoPromptArtifactId/hash` batem exatamente; tenant de
tudo = `Job.tenantId`. **Nunca** "última auditoria desse vídeo" ou
"policy atual desse canal" durante replay — tudo fica congelado no
input.

Hash: `FINALIZATION_INPUT_V1:sha256:<hex>` sobre `videoArtifactId`+
`videoContentHash`, `videoAuditResultId`+`hash`,
`videoPromptArtifactId`+`hash`, `publicationTargetKey`,
`policyId`/`version`/`snapshotHash`, `bindingResolutionHash`. Sem
`runId`/`tenantId`/timestamps/Job IDs.

### Verificação de policy — status + completude

Não basta `status = VERIFIED`: precisamos saber se a documentação
verificada foi **suficiente** para executar finalização de vídeo (e não
só, por exemplo, publicação de imagem).

```typescript
type ChannelPolicyVerificationStatus =
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'STALE';

type ChannelPolicyCompleteness =
  | 'PARTIAL'
  | 'COMPLETE_FOR_VIDEO_FINALIZATION';
```

Produção só executa quando `status = VERIFIED` **e**
`completeness = COMPLETE_FOR_VIDEO_FINALIZATION`. Assim uma policy pode
ter sido parcialmente pesquisada sem fingirmos que sabemos tudo o que é
necessário.

### `ChannelRenditionPolicy`

```typescript
type ChannelRenditionPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  publicationTargetKey: string;

  verification: {
    status: ChannelPolicyVerificationStatus;
    completeness: ChannelPolicyCompleteness;

    sourceType?: 'OFFICIAL_DOCUMENTATION';
    sourceRefs?: string[];

    verifiedAt?: string;
    lastCheckedAt?: string;

    verificationEvidenceHash?: string;
  };

  constraints: {
    allowedContainers: string[];
    allowedVideoCodecs: string[];
    allowedAudioCodecs?: string[];

    allowedAspectRatios: string[];

    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;

    minDurationMs?: number;
    maxDurationMs?: number;

    minFrameRate?: number;
    maxFrameRate?: number;

    maxFileSizeBytes?: number;

    audioPolicy: 'REQUIRED' | 'ALLOWED' | 'FORBIDDEN' | 'UNSPECIFIED';
  };

  transformPolicy: {
    allowedTransformKinds: FinalizationTransformKind[];

    allowOnlyContentPreserving: true;

    allowCrop: false;
    allowTrim: false;
    allowSpeedChange: false;
    allowSemanticOverlay: false;
  };

  processorPolicy: {
    allowedExecutionModes: FinalizationExecutionMode[];
  };

  createdAt: string;
};
```

V1 trava `allowOnlyContentPreserving = true` e as quatro flags de
transform sensível em `false`. Hash:
`CHANNEL_RENDITION_POLICY_V1:sha256:<hex>` sobre todos os campos
comportamentais + evidência/versionamento de verificação. Se a
documentação oficial mudar, isso **não** muta a policy publicada — gera
`policyVersion` nova.

### `ChannelRenditionPolicyBinding` + resolução congelada

```typescript
type ChannelRenditionPolicyBinding = {
  tenantId: string;

  publicationTargetKey: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Como o binding é mutável, ele nunca é tratado como policy imutável. No
momento da resolução, congelamos:

```typescript
type ChannelPolicyBindingResolution = {
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

Hash: `CHANNEL_RENDITION_POLICY_BINDING_RESOLUTION_V1:sha256:<hex>`. O
replay usa essa resolução congelada — nunca volta ao binding atual pra
descobrir se mudou.

### Policy não verificada/incompleta

```text
verification.status != VERIFIED
OU
completeness != COMPLETE_FOR_VIDEO_FINALIZATION
→ CHANNEL_POLICY_NOT_CONFIGURED
→ nenhuma renderização destinada à publicação
```

`UNVERIFIED` pode existir no banco pra pesquisa/planejamento; nunca vira
capacidade operacional.

### Classes de transformação e catálogo de tipos

```typescript
type FinalizationTransformClass =
  | 'CONTENT_PRESERVING'
  | 'SEMANTICALLY_SENSITIVE';

type FinalizationTransformKind =
  | 'REMUX'
  | 'VIDEO_TRANSCODE'
  | 'AUDIO_TRANSCODE'
  | 'RESIZE_CONTAIN_WITH_PADDING'
  | 'FRAME_RATE_NORMALIZE'
  | 'AUDIO_LEVEL_NORMALIZE'
  | 'METADATA_NORMALIZE'
  // Conhecidos conceitualmente, mas PROIBIDOS na V1.
  | 'CROP'
  | 'TRIM'
  | 'SPEED_CHANGE'
  | 'TEXT_BURN_IN'
  | 'WATERMARK_OVERLAY'
  | 'SCENE_RECOMPOSITION';
```

Mapeamento V1: `REMUX`/`VIDEO_TRANSCODE`/`AUDIO_TRANSCODE`/
`RESIZE_CONTAIN_WITH_PADDING`/`FRAME_RATE_NORMALIZE`/
`AUDIO_LEVEL_NORMALIZE`/`METADATA_NORMALIZE` →
`CONTENT_PRESERVING`. `CROP`/`TRIM`/`SPEED_CHANGE`/`TEXT_BURN_IN`/
`WATERMARK_OVERLAY`/`SCENE_RECOMPOSITION` → `SEMANTICALLY_SENSITIVE`.
Mesmo watermark/caption tecnicamente simples ficam fora da V1 porque
alteram os pixels que foram auditados — podem voltar depois com regra
explícita de reauditoria da rendition final.

### `FinalizationSourceMediaEvidence`

```typescript
type FinalizationSourceMediaEvidence = {
  sourceMediaEvidenceId: string;

  tenantId: string;

  videoArtifactId: string;
  videoContentHash: string;

  evidenceSource:
    | 'REUSED_COMPATIBLE_TECHNICAL_EVIDENCE'
    | 'SKILL14_MEDIA_INSPECTION';

  reusedTechnicalEvidenceId?: string;

  container?: string;

  video: {
    streamPresent: boolean;
    codec?: string;
    width?: number;
    height?: number;
    aspectRatio?: string;
    frameRate?: number;
    durationMs?: number;
  };

  audio: {
    streamPresent: boolean;
    codec?: string;
    sampleRateHz?: number;
    channels?: number;
  };

  file: {
    sizeBytes?: number;
  };

  inspectorKey: string;
  inspectorVersion: string;

  evidenceCompleteness: 'SUFFICIENT_FOR_POLICY_EVALUATION' | 'INSUFFICIENT';

  evidenceHash: string;

  createdAt: string;
};
```

Hash: `FINALIZATION_SOURCE_MEDIA_EVIDENCE_V1:sha256:<hex>` sobre
`videoContentHash`, `evidenceSource`, metadata técnica normalizada,
`inspectorKey`/`version`, `completeness`. Sem timestamp.

**Reuso da Skill 12:** a Skill 14 só reaproveita `TechnicalVideoEvidence`
da Skill 12 se ela contiver **todos** os dados necessários pra avaliar a
policy do target (ex.: Skill 12 sabe width/height/duration mas a policy
exige container/codec/fileSize → evidência insuficiente → Skill 14
inspeciona os mesmos bytes). Não duplicamos processamento sem
necessidade, mas também não inventamos metadata ausente.

### Planejamento — princípio central

> Se o source já é compatível, a melhor transformação é nenhuma ou
> apenas a normalização estritamente necessária. Nada de transcodificar
> por hábito.

```typescript
type FinalizationTransformStep = {
  stepIndex: number;

  transformKind: FinalizationTransformKind;
  transformClass: FinalizationTransformClass;

  reasonCode: string;

  inputConstraints: Record<string, unknown>;
  outputParameters: Record<string, unknown>;
};
```

Regra V1: todo `step.transformClass = CONTENT_PRESERVING`; qualquer step
sensível → `FINALIZATION_SEMANTIC_TRANSFORM_NOT_ALLOWED`.

### `FinalizationTransformPlan`

```typescript
type FinalizationTransformPlan = {
  transformPlanId: string;

  tenantId: string;

  finalizationInputHash: string;

  videoArtifactId: string;
  videoContentHash: string;

  videoAuditResultId: string;
  videoAuditResultHash: string;

  publicationTargetKey: string;

  sourceMediaEvidenceId: string;
  sourceMediaEvidenceHash: string;

  channelRenditionPolicyId: string;
  channelRenditionPolicyVersion: string;
  channelRenditionPolicySnapshotHash: string;

  steps: FinalizationTransformStep[];

  targetMediaSpec: {
    container: string;
    videoCodec: string;
    audioCodec?: string;

    width: number;
    height: number;
    aspectRatio: string;

    frameRate?: number;

    preserveDuration: true;

    audioPolicy: 'PRESERVE_SOURCE' | 'REMOVE_IF_FORBIDDEN';
  };

  guarantees: {
    contentPreservingOnly: true;
    noCrop: true;
    noTrim: true;
    noSpeedChange: true;
    noSemanticOverlay: true;
  };

  transformPlanHash: string;

  createdAt: string;
};
```

Hash: `FINALIZATION_TRANSFORM_PLAN_V1:sha256:<hex>` sobre
`finalizationInputHash`, `sourceMediaEvidenceHash`, `policySnapshotHash`,
`steps` em `stepIndex` order, `targetMediaSpec`, `guarantees`. Sem
`transformPlanId`/`createdAt`.

### Um plano só existe se for legítimo

Se a compatibilidade só for possível fazendo crop/trim/speed
change/semantic overlay, a Skill 14 **não fabrica**
`FinalizationTransformPlan`. A operação termina com um resultado de
domínio:

```text
SOURCE_NOT_COMPATIBLE_WITH_CHANNEL_POLICY   (genérico)
SOURCE_DURATION_INCOMPATIBLE
SOURCE_ASPECT_RATIO_INCOMPATIBLE
SOURCE_RESOLUTION_INCOMPATIBLE
SOURCE_AUDIO_POLICY_INCOMPATIBLE
```

**Resize permitido:** a única adaptação geométrica segura da V1 é
`RESIZE_CONTAIN_WITH_PADDING` — preserva 100% do quadro, resize
proporcional, adiciona área neutra pra atingir dimensão/ratio. Nunca
`cover + crop`. Se padding for proibido/tecnicamente inválido pro
destino → `SOURCE_ASPECT_RATIO_INCOMPATIBLE`.

**Duração:** V1 trava `targetMediaSpec.preserveDuration = true`. Source
18s + canal com máximo 15s → `SOURCE_DURATION_INCOMPATIBLE`, nunca trim
automático.

### `FinalizationExecutionMode` e abstração de processor

```typescript
type FinalizationExecutionMode =
  | 'INLINE_BOUNDED'
  | 'ASYNC_PROCESSOR';
```

`INLINE_BOUNDED` só quando o processor declara que aquela classe de
operação cabe seguramente no orçamento de runtime atual.
`ASYNC_PROCESSOR` para operação que pode ultrapassar a invocação (submit
→ operation handle → ticks futuros de poll). Nunca decidir por "o vídeo
parece curto" — a capability do processor/policy determina.

```typescript
interface MediaFinalizationProcessor {
  getCapabilities(): MediaFinalizationCapabilities;

  processInline?(input: FinalizationProcessorRequest): Promise<FinalizationProcessorResult>;
  submit?(input: FinalizationProcessorRequest): Promise<FinalizationProcessorSubmission>;
  getStatus?(input: FinalizationProcessorStatusInput): Promise<FinalizationProcessorStatusResult>;
  getArtifact?(input: FinalizationProcessorArtifactInput): Promise<FinalizationProcessorArtifactResult>;
  cancel?(input: FinalizationProcessorCancelInput): Promise<FinalizationProcessorCancelResult>;
}
```

`MediaFinalizationCapabilities` — ver definição final na seção de
Idempotência abaixo (inclui os campos de idempotência/billing). Hoje:
nenhum processor implementado.

```typescript
type FinalizationProcessorRequest = {
  videoArtifactId: string;
  videoContentHash: string;

  transformPlanId: string;
  transformPlanHash: string;

  processorRequestKey: string;

  targetMediaSpec: FinalizationTransformPlan['targetMediaSpec'];
};
```

Hash: `FINALIZATION_PROCESSOR_REQUEST_V1:sha256:<hex>` sobre
`videoContentHash`, `transformPlanHash`, `processorKey`/`version`,
`executionMode`, `targetMediaSpec`. Sem secrets/timestamps.

### `FinalizationExecutionState` — máquina única pra inline e async

```typescript
type FinalizationExecutionState =
  | 'PREPARED'
  | 'PROCESSING_INLINE'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PROCESSING_ASYNC'
  | 'PROCESSOR_SUCCEEDED'
  | 'MATERIALIZING'
  | 'MATERIALIZED'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';
```

Não existe `JobStatus`/`RetryPolicy`/lease/attempt count aqui — a
Skill 02 continua dona disso.

```text
Inline:  PREPARED → PROCESSING_INLINE → PROCESSOR_SUCCEEDED →
         MATERIALIZING → MATERIALIZED → VALIDATING → VALIDATED

Async:   PREPARED → SUBMITTING → SUBMITTED → PROCESSING_ASYNC →
         PROCESSOR_SUCCEEDED → MATERIALIZING → MATERIALIZED →
         VALIDATING → VALIDATED
```

Se um processo inline ultrapassar o budget e for morto, isso é falha do
desenho/capability daquela execução — nunca depende de retomada mágica
do processo local.

### `FinalizationExecution`

```typescript
type FinalizationExecution = {
  finalizationExecutionId: string;

  tenantId: string;
  runId: string;

  jobId: string;
  attemptNumber: number;

  finalizationInputHash: string;

  videoArtifactId: string;
  videoContentHash: string;

  videoAuditResultId: string;
  videoAuditResultHash: string;

  publicationTargetKey: string;

  transformPlanId: string;
  transformPlanHash: string;

  channelRenditionPolicyId: string;
  channelRenditionPolicyVersion: string;
  channelRenditionPolicySnapshotHash: string;

  executionMode: FinalizationExecutionMode;

  processorKey: string;
  processorVersion: string;

  processorRequestKey: string;
  processorRequestHash: string;

  state: FinalizationExecutionState;

  processorOperationId?: string;
  processorResultHash?: string;

  temporaryOutputRef?: string;

  materializedContentHash?: string;
  materializedStorageRef?: string;

  finalRenditionId?: string;

  executionContextHash: string;

  createdAt: string;
  updatedAt: string;
};
```

V1: `UNIQUE` lógico `(jobId, attemptNumber)`.

**Sem hash do objeto mutável inteiro** (mesmo problema evitado na
Skill 11). Em vez disso, `executionContextHash` cobre só a parte
imutável: `finalizationInputHash`, `videoContentHash`,
`videoAuditResultHash`, `publicationTargetKey`, `transformPlanHash`,
`policySnapshotHash`, `executionMode`, `processorKey`/`version`,
`processorRequestHash` — hash `FINALIZATION_EXECUTION_CONTEXT_V1:sha256:<hex>`.
`state`/`updatedAt`/`processorOperationId` mudam sem afetar a identidade
contextual da execução.

### `FinalizationProcessorResult`

```typescript
type FinalizationProcessorResult = {
  processorResultId: string;

  resultStatus: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

  processorKey: string;
  processorVersion: string;

  processorOperationId?: string;

  temporaryOutputRef?: string;

  outputMetadata?: {
    declaredMimeType?: string;
    declaredSizeBytes?: number;
  };

  processorResponseHash: string;

  observedAt: string;
};
```

Hash: `FINALIZATION_PROCESSOR_RESULT_V1:sha256:<hex>` sobre a resposta
normalizada. URL temporária não é identidade canônica.

### `PROCESSOR_SUCCEEDED` ≠ rendition final (mesma disciplina da Skill 11)

```text
PROCESSOR_SUCCEEDED = processor terminou
MATERIALIZED        = bytes estão em storage durável
VALIDATED            = bytes materializados satisfazem policy + plano
```

Só depois de `VALIDATED` nasce a rendition canônica.

```text
PROCESSOR_SUCCEEDED
→ obter bytes/result asset
→ calcular sha256
→ persistir Storage durável
→ MATERIALIZED
→ inspecionar output exato
→ comparar com FinalizationTransformPlan
→ VALIDATED
```

Se o blob salva mas o DB falha: blob órfão ≠ rendition canônica — mesma
regra das Skills 09/11/12.

### Reinspeção obrigatória do output

Não confiar apenas no comando enviado ao processor (pedido: 1080×1920
H.264; resultado real: 720×1280 → mesmo com "sucesso" reportado, não é
`VALIDATED`).

```typescript
type FinalizedMediaEvidence = {
  finalizationExecutionId: string;

  contentHash: string;

  container: string;
  videoCodec: string;
  audioCodec?: string;

  width: number;
  height: number;
  aspectRatio: string;

  durationMs: number;
  frameRate?: number;

  sizeBytes: number;

  evidenceHash: string;
};
```

Hash: `FINALIZED_MEDIA_EVIDENCE_V1:sha256:<hex>`.

**Preservação temporal:** V1 valida
`|finalDuration - sourceDuration| <= technicalTolerance`, mas não
congela ainda um número de milissegundos — a tolerância virá de
policy/processor profile quando implementarmos. Objetivo: transcode de
container timestamps não deve gerar falso erro, mas 18s→15s nunca passa.

### `FinalizedVideoRendition` (final)

```typescript
type FinalizedVideoRendition = {
  finalizedVideoRenditionId: string;

  tenantId: string;
  runId: string;

  jobId: string;
  attemptNumber: number;

  publicationTargetKey: string;

  source: {
    videoArtifactId: string;
    videoContentHash: string;

    videoAuditResultId: string;
    videoAuditResultHash: string;

    videoPromptArtifactId: string;
    videoPromptArtifactHash: string;
  };

  policy: {
    channelRenditionPolicyId: string;
    channelRenditionPolicyVersion: string;
    channelRenditionPolicySnapshotHash: string;

    bindingResolutionHash: string;
  };

  transform: {
    transformPlanId: string;
    transformPlanHash: string;
  };

  execution: {
    finalizationExecutionId: string;
    executionContextHash: string;

    processorKey: string;
    processorVersion: string;

    processorRequestHash: string;
    processorResultHash: string;
  };

  artifact: {
    contentHash: string;
    storageRef: string;

    mimeType: string;
    container: string;

    videoCodec: string;
    audioCodec?: string;

    width: number;
    height: number;
    aspectRatio: string;

    durationMs: number;
    frameRate?: number;

    sizeBytes: number;
  };

  outputEvidenceHash: string;

  complianceCarryForward: {
    sourceAuditVerdict: 'COMPLIANT';
    transformClass: 'CONTENT_PRESERVING';
    independentlyReauditedAfterFinalization: false;
  };

  renditionHash: string;

  createdAt: string;
};
```

**PATCH (Ponto S9 — reparo transversal pós-revisão Fable, 2026-09-18).**
Skill 14 é writer autorizado de `ProductUsageEvidence.usageKind =
'MATERIALIZED'` (contrato/owner: `04-descoberta-de-produtos/SPEC.md`,
hash `PRODUCT_USAGE_EVIDENCE_V1`) — Skill 14 nunca redeclara o tipo, só
referencia. Emite a evidência quando um `FinalizedVideoRendition`
válido é efetivamente materializado — nunca ao começar transcode,
reservar processor ou criar plan. `evidenceRef` = exact
`FinalizedVideoRendition` ref (`finalizedVideoRenditionId` +
`renditionHash`). `usedAt` deriva de `FinalizedVideoRendition.createdAt`
(timestamp real da materialização) — nunca outro relógio. Nunca emite
`PRIMARY_PUBLISHED` (fora da matriz de writers da Skill 04). Skill 11 e
Skill 14 podem ambas emitir `MATERIALIZED` pro mesmo produto — não são
duplicatas (`evidenceRef` diferente), mas a `ReusePolicy` da Skill 04
nunca conta essas linhas como campanhas distintas.

**PATCH (Ponto S6 — reparo transversal pós-revisão Fable, 2026-09-18,
`VIDEO_COMPOSITION_V1`).** `source` acima já é singular por
construção — exatamente **1** `VideoArtifact` como fonte audiovisual
primária por `FinalizedVideoRendition`, nunca um array. Formalizado
como proibição explícita:
`Concatenation of independently generated video segments is outside
VIDEO_COMPOSITION_V1 and MUST NOT be performed by Finalization.`
Combinar esse único vídeo com audio track/captions/logo overlay/
metadata continua sendo **muxing**, não assembly — permanece
permitido (`vídeo + áudio → mux` é diferente de
`clip1 + clip2 + clip3 → timeline`, que não é suportado no V1).

**PATCH (Ponto S7 — reparo transversal pós-revisão Fable, 2026-09-18,
`EXECUTION_RUNTIME_V1`, contrato completo em
`contracts/EXECUTION-RUNTIME.md`).** Transcode/normalização/mux/
overlay executam exclusivamente em `VIDEO_MACHINE_WORKER_V1`
(`DURABLE_WORKER`) — nunca via Vercel API route. Se esta Skill usa o
conceito `ASYNC_PROCESSOR`, no V1 isso significa `DURABLE_WORKER`
operation quando o processamento é interno (FFmpeg local); se for
provider externo, `submit + CONTINUE ticks` pelo mesmo worker, seguindo
o protocolo já descrito no Ponto B da Skill 02. Download do
`VideoArtifact` fonte e upload do `FinalizedVideoRendition` resultante
usam streaming direto — nunca atravessam a Vercel.

**`complianceCarryForward` — semântica exata:** "source foi COMPLIANT +
só transforms CONTENT_PRESERVING foram aplicadas" **não significa**
"Skill 12 auditou estes novos bytes". `independentlyReauditedAfterFinalization: false`
deixa essa diferença explícita pra Skill 17 futura. Se futuramente
permitirmos overlays/crop, o carry-forward automático deixa de valer e
nova auditoria vira obrigatória.

**`contentHash`** (`sha256(bytes exatos)`) é a identidade binária real —
não confundir com `renditionHash` (proveniência agregada). Hash:
`FINALIZED_VIDEO_RENDITION_V1:sha256:<hex>` sobre `publicationTargetKey`,
source `videoContentHash`/`videoAuditResultHash`/`videoPromptArtifactHash`,
policy snapshot hash, `bindingResolutionHash`, `transformPlanHash`,
`executionContextHash`, `processorRequestHash`, `processorResultHash`,
`artifact.contentHash`, `outputEvidenceHash`, `complianceCarryForward`.
Sem rendition ID/`jobId`/`attemptNumber`/`createdAt`/signed URL.

`storageRef` é referência durável interna — nunca signed URL/temporary
processor URL/CDN URL expirável; a identidade continua sendo
`contentHash`.

### Um target por rendition, sem dedupe cross-target/cross-tenant

Invariante V1: 1 `FinalizedVideoRendition` → exatamente 1
`publicationTargetKey` → exatamente 1 `ChannelRenditionPolicy` snapshot.
Mesmo se dois canais exigirem bytes idênticos (`contentHash` igual pra
Instagram e TikTok), os objetos de domínio nunca se fundem — proveniência
e destino são diferentes. `contentHash` idêntico pode habilitar
otimização futura de Storage, mas não autoriza hoje: compartilhar
rendition object, pular policy validation, reaproveitar lineage, ou
compartilhar `storageRef` entre tenants.

### Relação com a Skill 17 (futura)

> A Skill 17 não recebe `VideoArtifact` cru por padrão — recebe
> `FinalizedVideoRenditionId` + `renditionHash`.

Para canais que futuramente não exigirem nenhuma transformação
(`steps = []`), a Skill 14 ainda produz uma rendition lógica validada
contra a policy, eventualmente reaproveitando os mesmos bytes do source
sob regras de Storage seguras — melhor do que deixar a Skill 17 decidir
compatibilidade técnica.

### Hashes canônicos consolidados

```text
FINALIZATION_INPUT_V1                              → identidade do input congelado
CHANNEL_RENDITION_POLICY_V1                        → policy imutável
CHANNEL_RENDITION_POLICY_BINDING_RESOLUTION_V1     → resolução exata do binding mutável
FINALIZATION_SOURCE_MEDIA_EVIDENCE_V1              → metadata técnica do source
FINALIZATION_TRANSFORM_PLAN_V1                     → plano técnico content-preserving
FINALIZATION_PROCESSOR_REQUEST_V1                  → instrução exata pro processor
FINALIZATION_EXECUTION_CONTEXT_V1                  → contexto imutável da execução
FINALIZATION_PROCESSOR_RESULT_V1                   → resposta normalizada do processor
FINALIZED_MEDIA_EVIDENCE_V1                        → metadata técnica observada do output
FINALIZED_VIDEO_RENDITION_V1                       → proveniência agregada da rendition
```

Separado: `contentHash = sha256(bytes exatos)`, tanto pro source quanto
pro output. `FinalizationExecution` em si não recebe hash do objeto
inteiro, por ser mutável.

### Cadeia canônica completa

```text
VideoArtifact + VideoAuditResult COMPLIANT exato
→ FinalizationInput
→ ChannelRenditionPolicyBinding → resolução congelada
→ FinalizationSourceMediaEvidence
→ compatibility evaluation
→ FinalizationTransformPlan
→ FinalizationExecution
→ MediaFinalizationProcessor
→ PROCESSOR_SUCCEEDED
→ bytes → Storage → MATERIALIZED
→ FinalizedMediaEvidence
→ policy/plan validation → VALIDATED
→ FinalizedVideoRendition
→ Skill17 futura

Se a compatibilidade exigir alteração semântica:
não cria TransformPlan destrutivo, não cria Rendition falsa
→ SOURCE_NOT_COMPATIBLE_WITH_CHANNEL_POLICY
```

### `FinalizationCompatibilityResult` — persistir também o "não dá pra finalizar"

Peça que faltava pra idempotência ficar completa: se o source é
incompatível com a policy, isso precisa de identidade canônica própria
— senão o replay recalcularia tudo sem ter o que reaproveitar.

```typescript
type FinalizationCompatibilityResult = {
  finalizationCompatibilityResultId: string;

  tenantId: string;

  finalizationInputHash: string;

  sourceMediaEvidenceId: string;
  sourceMediaEvidenceHash: string;

  channelRenditionPolicyId: string;
  channelRenditionPolicyVersion: string;
  channelRenditionPolicySnapshotHash: string;

  status: 'COMPATIBLE' | 'INCOMPATIBLE';

  incompatibilityCodes: Array<
    | 'SOURCE_NOT_COMPATIBLE_WITH_CHANNEL_POLICY'
    | 'SOURCE_DURATION_INCOMPATIBLE'
    | 'SOURCE_ASPECT_RATIO_INCOMPATIBLE'
    | 'SOURCE_RESOLUTION_INCOMPATIBLE'
    | 'SOURCE_AUDIO_POLICY_INCOMPATIBLE'
  >;

  transformPlanId?: string;
  transformPlanHash?: string;

  resultHash: string;

  createdAt: string;
};
```

Hash: `FINALIZATION_COMPATIBILITY_RESULT_V1:sha256:<hex>`.
`INCOMPATIBLE` é resultado de domínio, não erro técnico — nenhuma
rendition é fabricada.

## Idempotência

V1: 1 `JobAttempt` da Skill 14 → exatamente 1 `publicationTargetKey` →
no máximo 1 `FinalizationExecution` → no máximo 1
`FinalizedVideoRendition`. `UNIQUE` lógico `(jobId, attemptNumber)`.

```text
reabrir VideoArtifact exato
→ reabrir VideoAuditResult exato
→ validar COMPLIANT + hashes
→ resolver/congelar policy
→ obter FinalizationSourceMediaEvidence
→ calcular CompatibilityResult
→ se INCOMPATIBLE: persistir resultado e parar
→ se COMPATIBLE: persistir/reabrir TransformPlan
→ criar/reabrir FinalizationExecution
→ executar processor
→ materializar bytes
→ reinspecionar output
→ validar policy/plano
→ persistir FinalizedVideoRendition
```

Replay de rendition existente (mesmos upstreams + mesma policy
resolution + mesmo plan + mesmo execution context) → retorna exatamente
a mesma rendition, zero novo processamento. Incompatível →
`FINALIZATION_RENDITION_REPLAY_CONFLICT` (FATAL_ERROR + AuditEvent).
Nunca sobrescrever.

**Idempotência de compatibilidade e plano:** para o mesmo
`finalizationInputHash`+`sourceMediaEvidenceHash`+
`channelRenditionPolicySnapshotHash`, `FinalizationCompatibilityResult`
deve ser determinístico — mesmo princípio pra
`FINALIZATION_TRANSFORM_PLAN_V1`. Nenhum planner pode usar
`Date.now()`/`random()`/estado atual do canal/policy "mais recente"/
preferência estética dinâmica.

### Lease fence multi-tick

```typescript
type FinalizationJobContext = {
  jobId: string;
  attemptNumber: number;

  leaseFence: number;

  leasePurpose: 'EXECUTE_NEW_ATTEMPT' | 'POLL_EXISTING_ATTEMPT' | 'HANDLE_CANCELLATION';

  expectedJobVersion: number;
};
```

Toda mutação dependente de um Job ativo valida o `leaseFence` corrente
da Skill 02. Fence stale → `FINALIZATION_STALE_LEASE_FENCE` (SAFE_ABORT/
concurrency guard, não falha o Job).

### Regra de rede — mesma disciplina da Skill 11

Pra `ASYNC_PROCESSOR`: antes da rede, `FinalizationExecution` +
`processorRequestKey` + `processorRequestHash` persistidos,
`state = SUBMITTING`, `Skill02.externalEffectState = SUBMITTING`. Só
depois `processor.submit(...)`. `operationId` retornado → persist →
`state = SUBMITTED` → `externalEffectState = CONFIRMED`. Cair entre
dispatch e commit → nunca assumir que nada aconteceu →
reconcile/idempotency ou `EXTERNAL_STATE_UNKNOWN`. Nunca reenviar
cegamente.

**`INLINE_BOUNDED` é diferente:** sem side effect externo necessário. Se
o processo local morrer antes de produzir output canônico, retry pode
ser seguro **desde que** o processor capability declare a operação como
reiniciável/idempotente. Se o processor inline grava artefato externo ou
cobra, deixa de ser "local inocente" — declara isso nas capabilities e
segue a mesma disciplina de autorização/reconciliação.

`MediaFinalizationCapabilities` ampliada:

```typescript
type MediaFinalizationCapabilities = {
  processorKey: string;
  processorVersion: string;

  supportedExecutionModes: FinalizationExecutionMode[];
  supportedTransformKinds: FinalizationTransformKind[];

  supportsIdempotencyKey: boolean;
  supportsReconciliationByRequestKey: boolean;
  supportsOperationLookup: boolean;
  supportsCancellation: boolean;

  runtimeBudgetClass: 'BOUNDED_LOCAL' | 'ASYNC_EXTERNAL' | 'DEDICATED_WORKER';

  potentiallyBillableOperations: Array<
    'PROCESS_INLINE' | 'SUBMIT_ASYNC' | 'POLL' | 'ARTIFACT_FETCH' | 'CANCEL'
  >;
};
```

Não presumimos hoje quais operações cobram.

### Replay por estado

```text
VALIDATED           → reutiliza FinalizedVideoRendition, zero processor call
MATERIALIZED         → reinspeciona/valida, zero processamento novo
PROCESSOR_SUCCEEDED  → retoma materialização, zero nova transcodificação
PROCESSING_ASYNC     → poll da mesma operation, mesma Attempt
SUBMITTED            → poll, mesma Attempt
SUBMITTING ambíguo   → reconcile/idempotency, senão BLOCKED/EXTERNAL_STATE_UNKNOWN
```

Falha de Storage após `PROCESSOR_SUCCEEDED` ≠ nova transcodificação —
repete apenas materialização.

**Conflito de output:** mesma `processorRequestKey`+`processorRequestHash`
representa sempre a mesma operação lógica. Mesma key + hash diferente →
`FINALIZATION_PROCESSOR_REQUEST_KEY_PAYLOAD_CONFLICT` (FATAL_ERROR).
Processor reporta sucesso duas vezes com outputs incompatíveis pra mesma
operation → `FINALIZATION_PROCESSOR_RESULT_CONFLICT` (FATAL_ERROR).

## Erros

### `FATAL_ERROR`

```text
FINALIZATION_TENANT_MISMATCH

FINALIZATION_VIDEO_ARTIFACT_NOT_FOUND
FINALIZATION_VIDEO_ARTIFACT_HASH_MISMATCH

FINALIZATION_AUDIT_RESULT_NOT_FOUND
FINALIZATION_AUDIT_RESULT_HASH_MISMATCH
FINALIZATION_AUDIT_NOT_COMPLIANT

FINALIZATION_PROMPT_ARTIFACT_MISMATCH

CHANNEL_RENDITION_POLICY_MISMATCH
INVALID_CHANNEL_RENDITION_POLICY

FINALIZATION_SOURCE_MEDIA_EVIDENCE_CONFLICT
FINALIZATION_COMPATIBILITY_RESULT_CONFLICT

FINALIZATION_TRANSFORM_PLAN_CONFLICT
FINALIZATION_SEMANTIC_TRANSFORM_NOT_ALLOWED

FINALIZATION_PROCESSOR_NOT_FOUND
FINALIZATION_PROCESSOR_CAPABILITY_UNSUPPORTED
FINALIZATION_PROCESSOR_REQUEST_KEY_PAYLOAD_CONFLICT
FINALIZATION_PROCESSOR_RESULT_CONFLICT
FINALIZATION_PROCESSOR_PROTOCOL_INVALID

FINALIZATION_OUTPUT_POLICY_MISMATCH
FINALIZATION_OUTPUT_PLAN_MISMATCH

FINALIZATION_ARTIFACT_CONTENT_HASH_CONFLICT
FINALIZATION_RENDITION_REPLAY_CONFLICT

FINALIZATION_INVALID_STATE_TRANSITION
FINALIZATION_UNAUTHORIZED_EXECUTION_PHASE
```

Particularmente: processor terminou "com sucesso" mas o output final não
respeita plan/policy → `FINALIZATION_OUTPUT_POLICY_MISMATCH` — nunca
vira rendition válida.

### `RETRYABLE_ERROR`

Só quando repetir aquela fase não cria uma nova operação externa
ambígua:

```text
FINALIZATION_MEDIA_INSPECTION_TRANSIENT_ERROR
FINALIZATION_INLINE_PROCESSOR_TRANSIENT_ERROR
FINALIZATION_PROCESSOR_POLL_TRANSIENT_ERROR
FINALIZATION_PROCESSOR_RECONCILE_TRANSIENT_ERROR
FINALIZATION_PROCESSOR_ARTIFACT_FETCH_TRANSIENT_ERROR
FINALIZATION_STORAGE_TRANSIENT_ERROR
FINALIZATION_OUTPUT_INSPECTION_TRANSIENT_ERROR
FINALIZATION_PROCESSOR_CANCEL_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

Regra idêntica à Skill 11: `RETRYABLE_ERROR` jamais autoriza sozinho
reenviar um submit externo cujo processamento possa ter ocorrido.

### `BLOCKED`

```text
Policy ausente/não verificada
→ CHANNEL_POLICY_NOT_CONFIGURED → BLOCKED/POLICY_BLOCKED
  (binding inexistente, policy UNVERIFIED, STALE quando exige
  verificação vigente, completeness != COMPLETE_FOR_VIDEO_FINALIZATION
  — nenhum processor é chamado)

Estado externo ambíguo
→ FINALIZATION_EXTERNAL_STATE_UNKNOWN → BLOCKED
  (timeout durante submit async, crash após dispatch antes de
  operationId persistido, processor externo sem idempotência/reconcile)

Output remoto irrecuperável
→ FINALIZATION_PROCESSOR_ASSET_UNRECOVERABLE → BLOCKED
  (processor confirmou conclusão mas output expirou e não pode ser
  recuperado — não refazer transcode automaticamente se a operação
  pode ter sido cobrada)

Cancelamento ambíguo
→ FINALIZATION_CANCELLATION_STATE_UNKNOWN → BLOCKED
  (só quando cancelamento remoto foi enviado e não sabemos se foi aplicado)
```

### O que NÃO é erro nem BLOCKED

`SOURCE_NOT_COMPATIBLE_WITH_CHANNEL_POLICY`/
`SOURCE_DURATION_INCOMPATIBLE`/`SOURCE_ASPECT_RATIO_INCOMPATIBLE`/
`SOURCE_RESOLUTION_INCOMPATIBLE`/`SOURCE_AUDIO_POLICY_INCOMPATIBLE` são
condições de domínio — produzem `FinalizationCompatibilityResult.status
= INCOMPATIBLE` e nenhum `FinalizedVideoRendition`. Não é falha de
infraestrutura.

### Nova Attempt vs. mesma Attempt

Continuam na mesma Attempt: poll, reconcile, retry de download, retry de
Storage, output inspection retry, cancel check. Nova Attempt só quando a
Skill 02 concluir que a execução falhou de forma conhecida e a
`RetryPolicy` autorizar — nova Attempt → nova `FinalizationExecution` →
nova `processorRequestKey` → nova autorização de custo quando
necessária.

## Multi-tenant

Fonte de autoridade: `trustedTenantId = Job.tenantId`. Precisam
corresponder: `FinalizationInput`, `VideoArtifact`, `VideoAuditResult`,
`VideoPromptArtifact`, `ChannelRenditionPolicyBinding`,
`ChannelRenditionPolicy`, `ChannelPolicyBindingResolution`,
`FinalizationSourceMediaEvidence`, `FinalizationCompatibilityResult`,
`FinalizationTransformPlan`, `FinalizationExecution`, processor
configuration, `FinalizedMediaEvidence`, `FinalizedVideoRendition`,
spend authorization quando aplicável. Divergência →
`FINALIZATION_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de segurança).

**Processor operation lookup** nunca busca só `processorOperationId` — a
identidade interna mantém `tenantId`+`processorKey`+
`processorOperationId`; mesmo se o processor usa IDs globalmente únicos,
a autorização não depende dessa promessa.

**Storage tenant-scoped:** mesmo `contentHash` idêntico entre tenant A e
B — V1 não compartilha `FinalizedVideoRendition`, lineage, nem
`storageRef`. Sem dedupe cross-tenant.

**Cross-target também continua separado:** mesmo tenant, Instagram e
TikTok com bytes idênticos → ainda são duas `FinalizedVideoRendition`,
porque `publicationTargetKey`/policy/verification provenance diferem.

## Fronteira de custo / Skill 23

A Skill 14 não decide orçamento. A Skill 23 decide: há quota? há
crédito? o tenant pode usar o processor? há limite de
processamento/storage? A Skill 14 só pergunta: "esta operação
potencialmente cobrável está autorizada?"

`FinalizationExecution` ganha `processingAuthorizationRef?: string`.
Antes de qualquer operação presente em
`MediaFinalizationCapabilities.potentiallyBillableOperations`: request/
context exatos → Skill 23/QuotaGuard → autorização durável → só então
rede/processamento. A autorização deve ser validável contra pelo menos
`tenantId`, `jobId`, `attemptNumber`, `processorKey`/`version`,
`videoContentHash`, `transformPlanHash`, `processorRequestHash`,
`operation kind`.

**Retransmissão idempotente** (mesma logical submission, mesma request
key/hash, processor com idempotency real) não cria nova Attempt nem nova
autorização de processamento — é a mesma operação lógica. Nova Attempt =
nova autorização.

**Storage não significa custo zero:** mesmo transcode local pode ter
custo de CPU/worker/egress/storage — a Skill 14 não interpreta isso
financeiramente. Metadata operacional sanitizada
(`creditsConsumed`/`processingSeconds`/`computeUnits`/`storageBytes`/
`egressBytes`) pode ser preservada pra Skill 23/21 quando existir.
Ausência de billing evidence ≠ custo zero.

**Cancelamento não implica estorno:** `processor CANCELLED` não
significa quota devolvida, custo zero, ou storage apagado — a Skill 14
registra o fato técnico; a Skill 23 reconcilia custo.

## Observabilidade

### Logs por tick

`tenantId`, `runId`, `jobId`, `attemptNumber`, `publicationTargetKey`,
`videoArtifactId`, `videoContentHash`, `videoAuditResultId`,
`videoAuditResultHash`, `policyId`/`version`/`snapshotHash`,
`verificationStatus`, `verificationCompleteness`,
`sourceMediaEvidenceId`/`hash`, `compatibilityStatus`,
`incompatibilityCodes`, `transformPlanId?`/`hash?`,
`finalizationExecutionId?`, `executionMode?`, `executionState?`,
`processorKey?`/`version?`/`requestKey?`/`requestHash?`/
`operationInternalId?`, `materializedContentHash?`,
`finalizedVideoRenditionId?`, `renditionHash?`, `leasePurpose`,
`leaseFence`, `tickKind` (`INSPECT`/`PLAN`/`PROCESS_INLINE`/`SUBMIT`/
`RECONCILE`/`POLL`/`MATERIALIZE`/`VALIDATE`/`CANCEL`), `durationMs`,
`errorCode?`. Nunca logar: signed storage URL, `temporaryOutputRef`
completo, API key, `Authorization`, raw processor payload.

### `AuditEvent`

Só mudanças lógicas importantes: policy resolution congelada,
`compatibility = INCOMPATIBLE`, `TransformPlan` criado,
`PREPARED→PROCESSING_INLINE`, `PREPARED→SUBMITTING→SUBMITTED→
PROCESSING_ASYNC`, `PROCESSOR_SUCCEEDED`, `MATERIALIZING→MATERIALIZED`,
`VALIDATING→VALIDATED`, external state unknown, cancel request/
confirmado, tenant mismatch, request payload conflict, processor result
conflict, output policy mismatch, rendition replay conflict. Não criar
evento a cada poll `PROCESSING_ASYNC`.

### Métricas

```text
finalization_total
finalization_compatible_total
finalization_incompatible_total

finalization_inline_total
finalization_async_total

finalization_processor_submit_total
finalization_processor_poll_total
finalization_processor_reconcile_total

finalization_materialization_total
finalization_materialization_retry_total

finalization_validated_total

finalization_source_duration_incompatible_total
finalization_source_aspect_ratio_incompatible_total
finalization_source_resolution_incompatible_total
finalization_source_audio_policy_incompatible_total

channel_policy_not_configured_total

finalization_external_state_unknown_total
finalization_processor_asset_unrecoverable_total
finalization_request_payload_conflict_total
finalization_output_policy_mismatch_total
finalization_replay_conflict_total
finalization_stale_fence_rejected_total

finalization_source_inspection_duration
finalization_processor_duration
finalization_materialization_duration
finalization_total_duration

finalization_quota_blocked_total
finalization_processing_authorization_missing_total
finalization_billing_evidence_available_rate
```

**Proibido:** `video_quality_score`, `conversion_probability`,
`viral_score`, `expected_ROI`, `best_channel` — a Skill 14 mede
compatibilidade técnica e integridade de processamento, não performance
comercial.

## Plano de testes

Pelo menos 74 casos críticos.

**Upstreams:** (1) `VideoArtifact` inexistente → fatal. (2)
`videoContentHash` divergente → fatal. (3) audit inexistente → fatal.
(4) audit hash divergente → fatal. (5) audit `NON_COMPLIANT` → rejeita.
(6) audit `INCONCLUSIVE` → rejeita. (7) audit refere outro
`VideoArtifact` → fatal. (8) `VideoPromptArtifact` lineage divergente →
fatal. (9) tenant divergente → fatal.

**Policy:** (10) binding inexistente → `CHANNEL_POLICY_NOT_CONFIGURED`.
(11) policy inexistente → blocked/configuração. (12) `UNVERIFIED` →
blocked. (13) `STALE` → blocked conforme V1. (14) `VERIFIED`+`PARTIAL` →
blocked. (15) `VERIFIED`+`COMPLETE_FOR_VIDEO_FINALIZATION` → continua.
(16) replay usa resolução congelada, não binding atual. (17) nova
`policyVersion` não muta Attempt antiga.

**Source inspection:** (18) metadata suficiente da Skill 12 é
reutilizada. (19) metadata insuficiente obriga inspeção Skill 14. (20)
mesmo source+inspector/version → mesma evidence hash. (21) inspector
falha transitoriamente → retryable. (22) source metadata inconsistente →
conflito.

**Compatibility:** (23) source já compatível → `COMPATIBLE`. (24) source
duration acima do max → `SOURCE_DURATION_INCOMPATIBLE`. (25) aspect
ratio incompatível e padding permitido → plan válido. (26) aspect ratio
incompatível e padding não possível → domain incompatible. (27) codec
incompatível mas transcode permitido → plan válido. (28) áudio proibido
+ remoção content-preserving permitida → plan válido. (29)
transformação exigiria crop → não cria plan. (30) exigiria trim → não
cria plan. (31) exigiria speed change → não cria plan. (32)
incompatibilidade persistida reproduzivelmente.

**Transform plan:** (33) mesmo input/evidence/policy → mesmo
`transformPlanHash`. (34) steps sempre ordenados por `stepIndex`. (35)
qualquer `SEMANTICALLY_SENSITIVE` na V1 → fatal integrity. (36)
`steps=[]` permitido quando source já atende policy. (37) planner não
usa random/time.

**Processor execution:** (38) execution única por `(jobId,
attemptNumber)`. (39) `processorRequestKey`/`hash` persistidos antes de
async submit. (40) mesma key + hash diferente → conflict. (41) submit
confirmado persiste `operationId` antes de `CONFIRMED`. (42) crash
pós-submit pré-commit → reconcile/`UNKNOWN`, nunca resubmit cego. (43)
processor com idempotency real pode retransmitir mesma submission. (44)
poll continua mesma Attempt. (45) poll repetido não cria `AuditEvent`
lógico duplicado. (46) stale lease fence → `SAFE_ABORT`.

**Inline:** (47) inline permitido apenas por capability. (48) inline
crash sem external side effect pode ser repetido com segurança. (49)
operação potencialmente billable sem autorização → não executa.

**Materialização:** (50) `PROCESSOR_SUCCEEDED` sem bytes duráveis →
nenhuma rendition. (51) download falha → retry só materialização. (52)
Storage falha → não reprocessa vídeo. (53) blob salvo + DB falha →
órfão, sem rendition canônica. (54) `contentHash` corresponde aos bytes
exatos. (55) `temporaryOutputRef` nunca é identidade canônica.

**Output validation:** (56) output reinspecionado corresponde ao plano →
`VALIDATED`. (57) resolução errada → `FINALIZATION_OUTPUT_PLAN_MISMATCH`.
(58) codec não permitido → output policy mismatch. (59) duração alterada
além da tolerance → mismatch. (60) output tecnicamente válido mas viola
policy → nenhuma rendition.

**Rendition:** (61) `FinalizedVideoRendition` só nasce após `VALIDATED`.
(62) `contentHash` corresponde ao storage. (63) `complianceCarryForward`
só aceita source audit `COMPLIANT`. (64)
`independentlyReauditedAfterFinalization=false` na V1. (65) transforms
sensíveis nunca recebem carry-forward automático. (66) mesmo
target/replay compatível retorna mesma rendition. (67) replay
incompatível → conflict. (68) targets diferentes permanecem renditions
distintas mesmo com bytes iguais. (69) tenants diferentes permanecem
isolados.

**Custo:** (70) operação billable passa por autorização. (71)
retransmissão idempotente não cria nova autorização. (72) nova Attempt
exige nova autorização. (73) ausência de billing metadata não vira custo
zero. (74) `CANCELLED` não presume refund.

### Testes futuros de integração (quando houver processor real)

```text
source real → inspect → verified channel policy → plan → submit/process
→ process restart → continue → materialize → process restart
→ output inspect → validate → FinalizedVideoRendition
```

Testar interrupção após: source inspection, plan, `SUBMITTING`,
processor success, blob Storage, antes do DB commit, após
`MATERIALIZED`, antes de `VALIDATED` — provando que nenhum ponto produz
transcode duplicado indevidamente. Também testar explicitamente que
nenhum tick depende de manter request aberta acima do orçamento seguro
do Vercel.

**Teste crítico de preservação:** quando o processor existir, source
duration + source frame content → content-preserving transcode → output
duration dentro da tolerance, nenhum crop, nenhum trim, nenhum overlay —
idealmente com checagem automatizada futura de que a finalização não
removeu regiões do quadro (não precisa virar Skill 12 completa; é
validação técnica de que o processor cumpriu o plano).

## Fechamento conceitual

1. A Skill 14 adapta a embalagem técnica do vídeo; não reescreve o
   conteúdo que foi aprovado.
2. Quando a compatibilidade com um canal exige alteração semântica, a
   resposta correta é incompatibilidade, não uma edição destrutiva
   silenciosa.
3. Falha depois de processamento concluído não autoriza processar
   novamente; materialização e validação são retomadas separadamente.
4. Uma rendition só existe depois que os bytes finais reais foram
   materializados, reinspecionados e comprovados contra a policy
   congelada daquele target.

## Status de implementação (nesta fase de especificação)

```text
Finalization pipeline   → NOT_IMPLEMENTED
Video transcoding       → NOT_IMPLEMENTED
MediaFinalizationProcessor → NOT_IMPLEMENTED
Storage                 → NOT_IMPLEMENTED
```
