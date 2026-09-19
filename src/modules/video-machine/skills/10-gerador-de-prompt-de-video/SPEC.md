# Skill 10 — Gerador de Prompt de Vídeo

> **APROVADA EM ESPECIFICAÇÃO — 10/25** (2026-09-18). Especificação/
> contrato. **Sem implementação ainda** — nenhuma migration, tabela, RPC,
> worker ou provider de vídeo foi criado. Este arquivo só vira código
> depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code,
> fundamentado em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`). A auditoria confirmou
> greenfield total — mais vazio ainda que as Skills anteriores: zero
> prompt real de Veo/Flow/Krea salvo em qualquer lugar; a Etapa 00A (spike
> manual de vídeo) nunca foi executada (bloqueada por confirmação de
> modelo/modo com o usuário), então não produziu nada a herdar; zero
> código de formatação de prompt (`videoPrompt`/`PromptTemplate` só
> aparecem em prosa de SPEC.md); zero regra real de duração/aspect
> ratio/câmera/áudio calibrada; `Veo`/`Flow` só existem em documentação,
> nunca em import/env/chamada de API; `.env.example` e `package.json` sem
> nenhum SDK ou credencial de geração de vídeo/imagem; banco live com 15
> tabelas, nenhuma relacionada a prompt/generation request. O SPEC desta
> Skill vem 100% dos contratos já aprovados nas Skills 07/08/09, zero
> prompt/regra herdada de experimento real.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B2)**: quando esta
> Skill é chamada em decorrência de uma correção (`CorrectionDirective`
> da Skill 13), ela executa em **nova `StageExecution`/novo Job** da
> `StageIteration` corrente — nunca reutiliza Job ou Attempt da geração
> anterior. Retry técnico dentro dessa nova operação continua obedecendo
> à Skill 02 normalmente. Ver "Reparo transversal pós-revisão Fable →
> Ponto D" no `SPEC.md` da Skill 01.

## Garantia central

Transformar um `ScriptResult` exato + `CreativeDirectionResult` exato +
`FrameArtifact` exato (quando aplicável) em uma instrução estruturada e
reproduzível para geração de vídeo, **preservando roteiro, identidade do
produto e intenção visual, sem executar o provider, sem alterar fatos e
sem reinterpretar a direção criativa**.

## Divisão conceitual

```text
VIDEO INTENT
→ o que precisa acontecer no vídeo
→ vem de Skill07 + Skill08 + Skill09

PROVIDER INSTRUCTION
→ como expressar isso para Veo/outro modelo
→ pertence à Skill10

PROVIDER EXECUTION
→ submit/poll/download/custo
→ Skill11
```

## Não é responsabilidade da Skill 10

- Não troca `archetype`, `hook`, `narrativa`, CTA ou keyword definidos
  pela Skill 07.
- Não reescreve o roteiro (Skill 08).
- Não altera ou "melhora" o `FrameArtifact` (Skill 09).
- Não usa o frame gerado como nova fonte factual do produto — a verdade
  visual continua vindo do `ProductVisualReferenceSet` materializado
  (mesma regra de fronteira da Skill 09: um artefato derivado nunca vira
  fonte factual independente).
- Não chama Veo/Flow/nenhuma API de geração (isso é Skill 11).
- Não decide retry, custo ou quota (Skill 02/23).
- Não inventa movimentos, partes do produto ou interações incompatíveis
  com o que as referências sustentam.

## Requisito de design

Deve produzir algo **provider-agnostic primeiro**; adaptação específica
para Veo é uma camada/versionamento explícito, nunca domínio hardcoded.

## Identidade exata de upstream

Nunca "último roteiro", "último frame" ou "última direção" — sempre
referência exata:

- `scriptResultId` + `scriptHash`
- `creativeDirectionResultId` + `creativeDirectionHash`
- `frameArtifactId` + `contentHash` (quando houver frame)
- `frameRequirementId` + `frameRequirementHash`

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


Nota sobre proveniência: o `scratch-instagram/theme-ref/cinema-skill/`
encontrado na auditoria (skill pack de terceiros, não versionado,
menciona "Magnific" para imagem/vídeo) é material externo, fora do
`video-machine`, e não influenciou nenhum contrato, provider ou policy
abaixo.

### `VideoPromptInput`

A Skill 10 trabalha por **unidade de geração ligada a um beat
específico** — nunca recebe apenas "produto + roteiro".

```typescript
type VideoPromptInput = {
  tenantId: string;
  runId: string;

  stageSubjectBindingId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  beatIndex: number;

  frameRequirementId?: string;
  frameRequirementHash?: string;

  frameArtifactId?: string;
  frameContentHash?: string;

  videoPromptPolicyKey: string;
};
```

Invariantes rígidas:

```text
CreativeDirectionResult.resultStatus = OK
ScriptResult.resultStatus = OK

ScriptResult.creativeDirectionResultId/hash
= input CreativeDirectionResult exato

beatIndex
= beat existente no ScriptResult

frameArtifactId presente
→ frameContentHash obrigatório
→ frameRequirementId/hash obrigatórios
→ FrameArtifact precisa corresponder exatamente ao requirement
→ FrameArtifact.scriptResultId/hash precisam ser os mesmos
→ FrameArtifact.validationSummary.valid = true
```

Nunca "último frame", "último roteiro" ou "última direção".

### `VideoGenerationMode`

O domínio fica preparado para dois modos, sem afirmar que ambos estão
implementados:

```typescript
type VideoGenerationMode =
  | 'IMAGE_TO_VIDEO'
  | 'TEXT_TO_VIDEO';
```

A V1 preserva identidade do produto:

```text
beat exige produto visível
+ não existe FrameArtifact validado
+ policy.requireVisualSeedWhenProductVisible = true
→ VIDEO_VISUAL_SEED_REQUIRED
→ nenhum prompt provider-specific fabricado
```

Hoje nenhum modo é marcado como operacionalmente suportado — não existe
provider real auditado.

### `VideoGenerationIntent` (contrato central provider-agnostic)

```typescript
type VideoGenerationIntent = {
  intentSchemaVersion: 'VIDEO_GENERATION_INTENT_V1';

  subject: {
    stageSubjectBindingId: string;
    subjectId: string;
  };

  upstream: {
    creativeDirectionResultId: string;
    creativeDirectionHash: string;

    scriptResultId: string;
    scriptHash: string;

    beatIndex: number;

    frameRequirementId?: string;
    frameRequirementHash?: string;

    frameArtifactId?: string;
    frameContentHash?: string;

    // Patch compatível (2026-09-18, durante o debate da Skill 13 —
    // não reabre 10/25): referência opcional a uma correção dirigida
    // pela Skill 13. Presença/ausência entra no intentHash (exceção
    // deliberada à regra "sem IDs operacionais" abaixo) — sem isso a
    // Skill 10 determinística produziria o mesmo VideoPromptArtifact
    // mesmo depois de uma correção legítima. Nunca amplia fatos.
    correctionContext?: {
      correctionDirectiveId: string;
      correctionDirectiveHash: string;
    };
  };

  generationMode: VideoGenerationMode;

  scene: {
    purpose: ScriptBeatPurposeV1; // mesmo tipo já definido pela Skill 08

    visualIntent: string;

    spokenText?: string;
    onScreenText?: string;
  };

  cinematicIntent: {
    cameraIntent?: string;
    subjectMotionIntent?: string;
    sceneMotionIntent?: string;
  };

  productIdentityConstraints: {
    preserveProductIdentity: true;

    // Ponto S2: ref exato, obrigatório mesmo quando content.kind='EMPTY'
    // (inclusive TEXT_TO_VIDEO) — a Skill 10 nunca busca "latest set".
    productVisualReferenceSetRef: ProductVisualReferenceSetRef;

    doNotInventUnsupportedProductRegions: true;
    doNotAlterObservedProductFeatures: true;

    frameIsNotIndependentFactSource: true;
  };

  textualConstraints: {
    preserveScriptMeaning: true;

    operationalKeyword?: string;

    providerGeneratedTextPolicy:
      | 'FORBID'
      | 'ALLOW_EXACT_SCRIPT_TEXT';
  };

  audioIntent: {
    mode:
      | 'UNSPECIFIED'
      | 'NO_GENERATED_AUDIO'
      | 'GENERATED_AUDIO_ALLOWED';

    spokenText?: string;
  };
};
```

A Skill 10 pode acrescentar linguagem cinematográfica, mas **apenas como
transformação da intenção existente**.

**Permitido:** `visualIntent`: "pessoa usando o massageador no pescoço" +
`cinematicIntent`: "aproximação lenta da câmera, movimentos naturais e
discretos da pessoa".

**Proibido:** "abrir tampa traseira", "trocar bateria", "apertar
terceiro botão", "mostrar conexão USB" — quando nada disso está
sustentado pelas referências.

**Regra do `FrameArtifact`:**

> `FrameArtifact` pode ser usado como seed visual, mas nunca como nova
> fonte factual sobre o produto. As restrições factuais continuam
> ancoradas no `ProductVisualReferenceSet` materializado que originou
> aquele frame.

Isso evita propagação de alucinação: referência real → frame gerado
errou → erro escapou → Skill 10 **não** conclui "se apareceu no frame,
então é verdade".

Hash: `VIDEO_GENERATION_INTENT_V1` sobre JSON canônico do
`VideoGenerationIntent` (sem IDs operacionais de Job/Attempt nem
timestamps, **exceto** `upstream.correctionContext.correctionDirectiveHash`
— presença/ausência/valor desse campo entra no hash deliberadamente,
para que uma correção legítima produza um `intentHash` diferente mesmo
com os mesmos demais upstreams) → campo `intentHash: string`.

### `VideoPromptPolicy` / `VideoPromptPolicyBinding`

Policy tenant-scoped e imutável:

```typescript
type VideoPromptPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  allowedGenerationModes: VideoGenerationMode[];

  requireVisualSeedWhenProductVisible: boolean;

  allowCameraIntent: boolean;
  allowSubjectMotionIntent: boolean;
  allowSceneMotionIntent: boolean;

  providerGeneratedTextPolicy:
    | 'FORBID'
    | 'ALLOW_EXACT_SCRIPT_TEXT';

  audioPolicy:
    | 'UNSPECIFIED'
    | 'NO_GENERATED_AUDIO'
    | 'GENERATED_AUDIO_ALLOWED';

  generationConstraints?: {
    durationSeconds?: number;
    aspectRatio?: string;
    width?: number;
    height?: number;
    seed?: string;
  };

  providerProfileKey: string;

  createdAt: string;
};

type VideoPromptPolicyBinding = {
  tenantId: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Hash: `VIDEO_PROMPT_POLICY_V1`.

**Importante:** hoje não preenchemos duração, aspect ratio, áudio ou seed
por tradição ou palpite. Esses campos existem no contrato; valores
iniciais só serão congelados quando houver decisão real/provider
validado — mesma disciplina das Skills 04-09 contra números inventados.

### `VideoGenerationParameters` (estruturado, fora do texto)

```typescript
type VideoGenerationParameters = {
  durationSeconds?: number;
  aspectRatio?: string;

  width?: number;
  height?: number;

  seed?: string;

  audioMode?:
    | 'DISABLED'
    | 'PROVIDER_DEFAULT'
    | 'GENERATED';
};
```

"vertical 9:16, 8 seconds, no audio" não precisa ser obrigatoriamente
embutido no prompt textual se o provider oferecer campos próprios.

### `VideoProviderTarget`

`VideoGenerationIntent` continua provider-agnostic. Depois dele, a
Skill 10 resolve um target tenant-scoped:

```typescript
// PATCH (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18):
// VideoProviderTarget é planejamento — MUST NOT conter
// IntegrationCredentialHandleRef. Quem precisa acessar credencial é
// quem efetivamente chama o provedor (Skill 11), não quem escolhe o
// alvo. Adicionado integrationBindingRef, que já existia
// informalmente via providerProfileKey/credentialScope — reutiliza
// IntegrationBinding da Skill 24, não cria identidade paralela.
type VideoProviderTarget = {
  providerProfileKey: string;
  providerProfileVersion: string;
  providerProfileSnapshotHash: string; // VIDEO_PROVIDER_PROFILE_V1 —
    // sobre configuração comportamental, sem secret/credential value

  providerKey: string;
  modelKey: string;

  adapterKey: string;
  adapterVersion: string;

  integrationBindingRef: {
    integrationBindingId: string;
    integrationBindingHash: string;
  };

  credentialScope:
    | 'TENANT_BYO'
    | 'PLATFORM_MANAGED';
};
```

Esse objeto **não contém secret**. `providerProfileKey` vem da policy;
sua resolução futura ocorre pela configuração/integrations do tenant.
Hoje: nenhum `VideoProviderTarget` real implementado, nenhum adapter real
implementado.

**Proteção de replay:** `providerProfileKey` sozinho não basta — a
configuração por trás dele pode mudar de modelo/adapter amanhã. Por isso
`providerProfileVersion` + `providerProfileSnapshotHash` entram também no
`VideoPromptArtifact` (abaixo): replay nunca significa "o profile mudou
ontem, então uso o modelo novo" — a Attempt fica amarrada ao profile
exato que foi resolvido no momento da geração.

### `ProviderPromptAdapter`

Transformação **determinística e sem side effect**:

```typescript
interface ProviderPromptAdapter {
  getCapabilities(): ProviderPromptAdapterCapabilities;
  render(input: ProviderPromptAdapterInput): ProviderInstruction;
}

// STRUCTURED = campo próprio do provider; PROMPT_TEXT = precisa ir
// embutido no texto; UNSUPPORTED = provider não aceita esse parâmetro.
// Sem essa distinção explícita, "supportsDurationParameter: boolean"
// não dizia SE o valor vai estruturado ou embutido — ambiguidade real.
type VideoParameterTransport =
  | 'STRUCTURED'
  | 'PROMPT_TEXT'
  | 'UNSUPPORTED';

type ProviderPromptAdapterCapabilities = {
  adapterKey: string;
  adapterVersion: string;

  providerKey: string;
  supportedModelKeys: string[];

  supportedGenerationModes: VideoGenerationMode[];

  supportsImageInput: boolean;

  parameterTransport: {
    duration: VideoParameterTransport;
    aspectRatio: VideoParameterTransport;
    resolution: VideoParameterTransport;
    seed: VideoParameterTransport;
    audio: VideoParameterTransport;
  };
};

type ProviderPromptAdapterInput = {
  intent: VideoGenerationIntent;
  intentHash: string;

  providerTarget: VideoProviderTarget;

  generationParameters: VideoGenerationParameters;

  adapterTemplateVersion: string;
  providerInstructionSchemaVersion: string;
};
```

**Regra central:** o adapter pode mudar a forma de expressar o intent
para aquele provider. **Não pode ampliar, reduzir ou reinterpretar
semanticamente** o `VideoGenerationIntent`.

**O adapter não é IA por padrão.** Nada na auditoria indica necessidade
de um segundo LLM só para escrever prompt — V1 congela
`ProviderPromptAdapter` como transformação/template determinístico. Se
futuramente um "prompt optimizer" baseado em IA for necessário, isso
exige contrato próprio + checkpoint + custo + provenance — nunca uma
inferência paga escondida dentro do adapter.

**Garantia formal de determinismo:** para o mesmo `VideoGenerationIntent`,
policy snapshot, provider profile snapshot, adapter version/template
version e generation parameters, o `ProviderPromptAdapter` V1 deve
produzir exatamente a mesma `ProviderInstruction` canônica. O adapter não
pode usar `Date.now()`, `random()`, estado global mutável, resultado de
rede, LLM, ou "última versão disponível" de modelo/template — qualquer
uma dessas coisas deixaria de ser uma transformação pura e exigiria novo
contrato. `providerInstructionHash` é calculado sobre a mesma instrução
que a Skill 11 efetivamente receberá, não uma representação
pré-normalizada diferente.

**Nenhuma checagem de runtime do provider.** Como a Skill 10 não executa
vídeo, ela não consulta se o Veo está online, sem quota ou autenticado.
Ela valida apenas: provider profile existe, adapter existe, model/profile
são compatíveis, adapter consegue representar intent e parâmetros.
Estado real de API, credencial, quota, rate limit, submit e billing
pertencem à Skill 11 + Skills 23/24 + Skill 02 — `VIDEO_PROVIDER_
TEMPORARILY_UNAVAILABLE` não pertence à Skill 10.

### `ProviderInstruction`

```typescript
type ProviderInstruction = {
  providerInstructionSchemaVersion: 'PROVIDER_VIDEO_INSTRUCTION_V1';

  providerKey: string;
  modelKey: string;

  adapterKey: string;
  adapterVersion: string;

  generationMode: VideoGenerationMode;

  promptText: string;

  negativePromptText?: string;

  inputVisual?: {
    type: 'FRAME_ARTIFACT';
    frameArtifactId: string;
    contentHash: string;
  };

  generationParameters: VideoGenerationParameters;
};
```

`promptText` pode mencionar movimento, câmera, ação, continuidade,
fidelidade visual — mas nunca acrescentar fatos novos.

Hashes: `VIDEO_PROMPT_ADAPTER_REQUEST_V1` (sobre `intentHash`,
`providerKey`, `modelKey`, `adapterKey`, `adapterVersion`,
`adapterTemplateVersion`, `providerInstructionSchemaVersion`,
`generationParameters`) → `adapterRequestHash: string`;
`PROVIDER_VIDEO_INSTRUCTION_V1` (sobre representação canônica de
`providerKey`, `modelKey`, `adapterKey`, `adapterVersion`,
`generationMode`, `promptText`, `negativePromptText?`, `inputVisual?`,
`generationParameters`) → `providerInstructionHash: string`.

### `VideoPromptArtifact` (output canônico)

```typescript
type VideoPromptArtifact = {
  videoPromptArtifactId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  beatIndex: number;

  frameRequirementId?: string;
  frameRequirementHash?: string;

  frameArtifactId?: string;
  frameContentHash?: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2

  videoPromptPolicyId: string;
  videoPromptPolicyVersion: string;
  videoPromptPolicySnapshotHash: string;

  intent: VideoGenerationIntent;
  intentHash: string;

  providerTarget: {
    providerProfileKey: string;
    providerProfileVersion: string;
    providerProfileSnapshotHash: string;
    providerKey: string;
    modelKey: string;
    adapterKey: string;
    adapterVersion: string;
  };

  adapterRequestHash: string;

  providerInstruction: ProviderInstruction;
  providerInstructionHash: string;

  createdAt: string;
};
```

O `intent` completo é incluído porque é o contrato provider-agnostic que
precisa poder ser auditado sem reconstrução a partir do prompt textual.

**Hash final do artifact — diferente da Skill 09.** A Skill 09 já tinha
`contentHash` dos bytes como identidade factual suficiente. A Skill 10
possui múltiplas peças sem uma identidade binária única, então faz
sentido um hash agregador aqui: `VIDEO_PROMPT_ARTIFACT_V1` sobre
`creativeDirectionResultId+hash`, `scriptResultId+hash`, `beatIndex`,
`frameRequirementId/hash?`, `frameArtifactId/contentHash?`,
`productVisualReferenceSetRef`,
`videoPromptPolicyId/version/snapshotHash`, `intentHash`, provider target
sem secrets, `adapterRequestHash`, `providerInstructionHash` →
`videoPromptArtifactHash: string`.

A Skill 11 deve consumir `videoPromptArtifactId` +
`videoPromptArtifactHash` — nunca "o prompt mais recente".

## Invariantes de integridade

1. **Skill 10 traduz; não reinterpreta.** Nenhum elemento da direção
   criativa, roteiro, CTA ou identidade visual pode ser alterado para
   "melhorar o prompt".
2. **Provider instruction não é fonte factual.** Texto introduzido pelo
   adapter nunca cria uma nova verdade sobre produto, oferta ou
   tendência.
3. **Generation parameters não são texto por obrigação.** Quando o
   provider possuir campos estruturados para duração, aspect ratio,
   seed, áudio ou outras configurações, eles permanecem estruturados e
   são mapeados pelo adapter.
4. **Frame gerado não legitima alucinação.** Mesmo usando
   `frameArtifactId` + `contentHash` como seed, a verdade visual continua
   ancorada no `ProductVisualReferenceSet`.

## Estado deliberadamente NÃO criado

Não existe `NO_VALID_PROMPT`. Um `VideoGenerationIntent` válido e uma
policy válida devem produzir instrução válida se existir adapter
compatível. Se o adapter não consegue representar aquele intent:
`VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED` ou
`VIDEO_PROMPT_ADAPTER_CANNOT_REPRESENT_INTENT` — isso é falha/
configuração da execução, não um "resultado de negócio vazio" (mesmo
princípio do `ScriptResult` sucesso-only da Skill 08).

## Idempotência e replay

A Skill 10 é **pura/determinística e sem side effect externo** — não
precisa de checkpoint nem state machine (diferente das Skills 07/08/09).
Se cair antes do commit, recalcula; se cair depois, reabre o mesmo
`VideoPromptArtifact`.

Unicidade lógica: `(jobId, attemptNumber)` → no máximo 1
`VideoPromptArtifact` canônico. O `beatIndex` e todos os hashes fazem
parte da verificação de compatibilidade, mas não entram na unique key —
se amanhã um Job precisar processar vários beats, isso será uma mudança
explícita do contrato. **PATCH (Ponto S5, 01-orquestrador-de-producao/SPEC.md):**
essa distinção já existe formalmente desde o S5 — `StageWorkUnitIdentity
{ kind:'DIMENSIONAL', beat: { scriptResultRef, beatIndex } }` do kernel
distingue cada beat, substituindo o antigo `LogicalJobIntent.variantKey`
(string livre sem gramática, onde `beat:<n>` era só convenção
informal, nunca contrato).

**PATCH (Ponto S6, `VIDEO_COMPOSITION_V1`).** No V1,
`ScriptResult.beats.length === 1` sempre (formalizado na Skill 08) —
"vários beats" acima é sobre o desenho futuro (V2), não o presente.
Exatamente um `VideoPromptArtifact` por creative-variant candidate. O
prompt declara intenção de **vídeo completo**, nunca "segment prompt"/
"clip fragment"/"scene to concatenate later" — nenhum campo
`isFinalClip` necessário, todo `VideoArtifact` da cadeia V1 é candidato
completo por contrato. Antes de executar: `requested duration <=
capability da combinação provider/model/profile`; se não couber,
resultado é capability unsupported — **nunca divide automaticamente**
("Veo só aceita 8s; gero 2×8s e concateno" é proibido). Pode rotear pra
provider alternativo se policy/capability permitir — continua
single-beat.

Fluxo: resolve upstreams exatos → resolve policy snapshot → resolve
provider profile versionado → cria `VideoGenerationIntent` → calcula
`intentHash` → renderiza adapter deterministicamente → calcula
`adapterRequestHash` → calcula `providerInstructionHash` → calcula
`videoPromptArtifactHash` → persiste `VideoPromptArtifact` + `AuditEvent`
na mesma transação → reporta `COMPLETED`.

Se o processo cair antes da transação, não há problema em recalcular —
não houve chamada paga nem estado externo. Se cair depois do commit:
replay encontra o `VideoPromptArtifact`, revalida input/upstreams/
policy/target/hashes, retorna exatamente o mesmo artifact sem renderizar
de novo. Mesmo `(jobId, attemptNumber)` com conteúdo incompatível →
`VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT` (FATAL_ERROR + AuditEvent) —
nunca sobrescrevemos um artifact canônico.

## `VIDEO_VISUAL_SEED_REQUIRED`

Não é erro estrutural nem retryable técnico:

```text
beat exige produto visualmente presente
+ policy.requireVisualSeedWhenProductVisible = true
+ nenhum FrameArtifact validado aplicável
→ VIDEO_VISUAL_SEED_REQUIRED
→ nenhum VideoPromptArtifact
→ JobBlockedEvent, JobStatus=BLOCKED, BlockReason=POLICY_BLOCKED
```

A Skill 01/pipeline decide futuramente se volta à Skill 09, troca subject
ou toma outro caminho. **Nunca fabricamos text-to-video para contornar a
policy.**

## Erros

### `FATAL_ERROR` (estruturais/configuração)

```text
VIDEO_PROMPT_CREATIVE_DIRECTION_NOT_FOUND
VIDEO_PROMPT_CREATIVE_DIRECTION_MISMATCH
VIDEO_PROMPT_SCRIPT_NOT_FOUND
VIDEO_PROMPT_SCRIPT_MISMATCH
VIDEO_PROMPT_BEAT_NOT_FOUND

VIDEO_PROMPT_FRAME_REQUIREMENT_MISMATCH
VIDEO_PROMPT_FRAME_ARTIFACT_NOT_FOUND
VIDEO_PROMPT_FRAME_ARTIFACT_MISMATCH
VIDEO_PROMPT_FRAME_NOT_VALIDATED

VIDEO_PROMPT_VISUAL_REFERENCE_SET_MISMATCH

VIDEO_PROMPT_POLICY_NOT_FOUND
VIDEO_PROMPT_POLICY_BINDING_NOT_FOUND
INVALID_VIDEO_PROMPT_POLICY

VIDEO_PROVIDER_PROFILE_NOT_FOUND
VIDEO_PROVIDER_PROFILE_TENANT_MISMATCH
VIDEO_PROVIDER_PROFILE_INVALID

VIDEO_PROMPT_ADAPTER_NOT_FOUND
VIDEO_PROMPT_ADAPTER_VERSION_NOT_FOUND
VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED
VIDEO_PROMPT_ADAPTER_CANNOT_REPRESENT_INTENT
VIDEO_PROMPT_ADAPTER_OUTPUT_INVALID

VIDEO_PROMPT_TENANT_MISMATCH
VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT
```

### `RETRYABLE_ERROR` (poucos — sem provider/network side effect)

```text
TRANSIENT_DATASTORE_ERROR
TRANSIENT_STORAGE_METADATA_READ_ERROR
```

Se a Skill 10 precisa ler metadata de `FrameArtifact`/referência e o
datastore falha temporariamente, retry é seguro.

### `BLOCKED` (condição de policy)

```text
VIDEO_VISUAL_SEED_REQUIRED → BLOCKED / POLICY_BLOCKED
```

**Não existe na Skill 10:** `EXTERNAL_STATE_UNKNOWN`, timeout de
provider, rate limit, ambiguidade de billing — nenhuma chamada de
geração ocorre aqui.

## Multi-tenant

Fonte de confiança: `trustedTenantId = Job.tenantId`. Devem corresponder:
`VideoPromptInput`, `StageSubjectBinding`, `CreativeDirectionResult`,
`ScriptResult`, `FrameRequirement` (quando usado), `FrameArtifact`
(quando usado), `ProductVisualReferenceSet`, `VideoPromptPolicyBinding`,
`VideoPromptPolicy`, `VideoProviderProfile`, `VideoPromptArtifact`.
Divergência → `VIDEO_PROMPT_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de
segurança).

O `ProviderPromptAdapter` pode ser código global compartilhado — o que é
tenant-scoped é a resolução do provider profile/configuração, não o
código puro do adapter. Mesmo `intentHash` entre tenant A e B **não**
autoriza compartilhar `VideoPromptArtifact` — sem dedupe cross-tenant na
V1.

## Secrets

A Skill 10 **não precisa do secret do provider**. O artifact pode
carregar `providerProfileKey/version/hash`, `providerKey`, `modelKey`,
`credentialScope` — mas nunca API key, OAuth token, cookie ou credential
plaintext. A Skill 11/Skill 24 resolve a credencial no momento da
execução por handle seguro.

## Observabilidade

### Logs estruturados

`tenantId`, `runId`, `jobId`, `attemptNumber`, `stageSubjectBindingId`,
`beatIndex`, `creativeDirectionResultId`, `creativeDirectionHash`,
`scriptResultId`, `scriptHash`, `frameArtifactId?`, `frameContentHash?`,
`videoPromptPolicyId`, `videoPromptPolicyVersion`, `providerProfileKey`,
`providerProfileVersion`, `providerProfileSnapshotHash`, `providerKey`,
`modelKey`, `adapterKey`, `adapterVersion`, `generationMode`,
`intentHash`, `adapterRequestHash`, `providerInstructionHash`,
`videoPromptArtifactHash`, `promptLengthChars`,
`negativePromptLengthChars?`, `hasVisualSeed`, `durationConfigured?`,
`aspectRatioConfigured?`, `audioMode?`, `durationMs`, `errorCode?`.

Não logar por padrão o `promptText` completo — o artifact já o persiste
de forma auditável; log serve para operação, não para duplicar conteúdo
potencialmente sensível.

### `AuditEvent`

Na criação do artifact, resumo: `videoPromptArtifactId`, `tenantId`,
`runId`, `jobId`, `attemptNumber`, `stageSubjectBindingId`, `beatIndex`,
`creativeDirectionResultId`, `creativeDirectionHash`, `scriptResultId`,
`scriptHash`, `frameArtifactId?`, `frameContentHash?`,
`videoPromptPolicyId`, `videoPromptPolicyVersion`,
`videoPromptPolicySnapshotHash`, `providerProfileKey`,
`providerProfileVersion`, `providerProfileSnapshotHash`, `providerKey`,
`modelKey`, `adapterKey`, `adapterVersion`, `generationMode`,
`intentHash`, `adapterRequestHash`, `providerInstructionHash`,
`videoPromptArtifactHash`, `createdAt`. Sem duplicar `intent`,
`promptText` ou parâmetros completos no evento.

Eventos explícitos também para: `VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT`,
`VIDEO_PROMPT_TENANT_MISMATCH`,
`VIDEO_PROMPT_ADAPTER_CANNOT_REPRESENT_INTENT`,
`VIDEO_VISUAL_SEED_REQUIRED`.

### Métricas

```text
Operacionais:
video_prompt_generation_success_rate
video_prompt_blocked_visual_seed_rate
video_prompt_adapter_failure_rate
video_prompt_capability_unsupported_rate
video_prompt_replay_reuse_rate
video_prompt_replay_conflict_rate

video_prompt_generation_duration
video_prompt_length_chars

video_prompt_image_to_video_rate
video_prompt_text_to_video_rate

video_prompt_with_audio_intent_rate
video_prompt_with_structured_duration_rate
video_prompt_with_structured_aspect_ratio_rate
```

Nada de `prompt_quality_score`, `best_prompt`, `cinematic_score`,
`veo_success_score` até termos resultado real das Skills 11/12/18/19.

## Plano de testes

1. `CreativeDirectionResult` inexistente → fatal.
2. `creativeDirectionHash` divergente → mismatch.
3. `ScriptResult` inexistente → fatal.
4. `scriptHash` divergente → mismatch.
5. `beatIndex` inexistente → `VIDEO_PROMPT_BEAT_NOT_FOUND`.
6. Script pertence a outra CreativeDirection → rejeita.
7. `frameArtifactId` presente sem `frameContentHash` → input inválido.
8. `frameArtifact` presente sem `frameRequirementId/hash` → input
   inválido.
9. `FrameArtifact` pertence a outro `ScriptResult` → mismatch.
10. `FrameArtifact` pertence a outro `FrameRequirement` → mismatch.
11. `FrameArtifact` não validado → rejeita.
12. `ProductVisualReferenceSet` divergente daquele que originou o
    `FrameArtifact` → mismatch.
13. Beat exige produto + policy exige seed + seed ausente →
    `VIDEO_VISUAL_SEED_REQUIRED`, BLOCKED, nenhum artifact.
14. Text-to-video permitido pela policy em beat sem necessidade de seed
    → intent válido.
15. `FrameArtifact` usado como seed, mas detalhe alucinado no frame não
    vira novo `PRODUCT_FACT`.
16. Adapter tenta introduzir botão/porta/comportamento inexistente →
    `VIDEO_PROMPT_ADAPTER_CANNOT_REPRESENT_INTENT`/output inválido.
17. Adapter preserva movimento de câmera compatível sem alterar fato →
    válido.
18. CTA/keyword no `ScriptResult` permanece semanticamente intacto.
19. Adapter não pode trocar fala/texto autorizado por outra copy.
20. Policy pede duração e `transport=STRUCTURED` → valor fica em
    `generationParameters`, não duplicado no prompt.
21. Policy pede duração e `transport=PROMPT_TEXT` → adapter versionado a
    representa no prompt.
22. Policy pede parâmetro e `transport=UNSUPPORTED` →
    `VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED`.
23. Trocar somente valor factual/upstream altera `intentHash`.
24. Mesmo intent + trocar `adapterVersion` mantém `intentHash` e altera
    `adapterRequestHash`.
25. Trocar `modelKey` mantém `intentHash` e altera `adapterRequestHash`.
26. Mesmo adapter request produz exatamente a mesma `ProviderInstruction`
    e `providerInstructionHash`.
27. Adapter tenta usar tempo/randomness/estado externo → falha teste de
    determinismo.
28. Artifact existente + replay compatível → mesmo
    `videoPromptArtifactId`/hash, sem reconstrução necessária.
29. Artifact existente + replay incompatível →
    `VIDEO_PROMPT_ARTIFACT_REPLAY_CONFLICT`.
30. Crash antes do commit → recomputação gera hashes idênticos.
31. Crash após commit antes de `reportExecution` → replay reutiliza
    artifact.
32. Provider profile muda depois → replay usa versão/snapshot congelados
    da Attempt, não o profile atual.
33. Tenant A e B produzem semanticamente o mesmo intent → artifacts
    continuam tenant-isolados.
34. Skill 11 consegue validar posteriormente `videoPromptArtifactId` +
    `videoPromptArtifactHash` sem consultar "prompt mais recente".

**Ponto S2 (35-37):**

35. `productVisualReferenceSetRef` é sempre exigido, mesmo em
    `TEXT_TO_VIDEO` — nunca `ref` ausente/opcional.
36. Skill 10 trata explicitamente `content.kind='POPULATED'` vs.
    `'EMPTY'` — nunca infere "deve ser text-to-video" só porque o
    `ref` aponta pra um set vazio; o `emptyReason` já diz o motivo.
37. Skill 10 nunca faz lookup de "latest `ProductVisualReferenceSet`" —
    sempre o `ref` exato vindo da Skill 09.

**Teste de integração futuro** (quando existir o primeiro adapter Veo
real): o payload que a Skill 11 vai submeter deve ser derivável
integralmente do `ProviderInstruction` persistido, sem a Skill 11
"melhorar" ou reescrever o prompt. A Skill 11 executa; não vira uma
segunda Skill 10.

## Status de implementação (nesta fase de especificação)

```text
VideoPromptArtifact persistence → NOT_IMPLEMENTED
ProviderPromptAdapter (Veo)     → NOT_IMPLEMENTED
VideoGenerationProvider (Veo)   → NOT_IMPLEMENTED
```

## Questões abertas

- Quais providers de vídeo serão suportados e os valores reais de
  `generationConstraints` (duração/aspect ratio/seed) — decisão de
  infraestrutura/custo, fica para quando o provider real for integrado.
