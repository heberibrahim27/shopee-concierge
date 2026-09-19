# Skill 13 — Corretor Automático

> **APROVADA EM ESPECIFICAÇÃO — 13/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado. Este arquivo só vira código depois da
> revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 (ChatGPT ↔ Claude Code), com auditoria
> real do repositório confirmando greenfield e reaproveitando o precedente
> de `shouldRetryWithSuggestedTerm`/`buildRetrySearchTerms` do
> `src/lib/concierge/orchestrator.ts` (mesmo método das Skills 04-12).
>
> **🔧 Correção pós-revisão Fable (2026-09-18, achado B2)**: o Claude
> Fable 5 Max encontrou um erro estrutural real neste arquivo — o texto
> abaixo fala repetidamente em "nova Attempt" quando descreve o
> resultado de uma correção, mas na arquitetura real da Skill 02 um Job
> `SUCCEEDED` **nunca reabre**, e o Job de geração (Skill 11) que
> produziu o vídeo reprovado já está `SUCCEEDED` no momento em que a
> Skill 13 atua. **Toda ocorrência de "nova Attempt"/"próxima
> Attempt"/"aciona uma nova Attempt através da Skill 02" neste documento
> deve ser lida como o texto corretivo abaixo — o resto do arquivo não
> foi reescrito frase a frase, mas essa é a semântica oficial que
> substitui a literal:**
>
> *"Uma correção semântica nunca cria nova Attempt do Job já concluído.
> O ciclo de correção é representado por nova `StageIteration`; cada
> stage reexecutada nessa revisão cria nova `StageExecution`, nova
> `PreparedSkillInvocation` e novo Job lógico. `Attempt` permanece
> reservado a retries técnicos da mesma operação lógica e do mesmo
> input."*
>
> Ver o contrato completo (`StageIteration`, `StageTransitionResolution`,
> a state machine `Skill12 NON_COMPLIANT → START_NEXT_ITERATION →
> Skill13 → CONTINUE_CURRENT_ITERATION → Skill09/10/11`) na seção
> "Reparo transversal pós-revisão Fable → Ponto D" do `SPEC.md` da
> Skill 01. Divisão de responsabilidade revisada: **Skill 01** decide
> se uma nova `StageIteration`/`StageExecution` nasce (via
> `transitionKey` opaco, nunca conhecendo `NON_COMPLIANT`); **Skill 13**
> continua decidindo O QUE deve mudar (o `CorrectionScope`/
> `CorrectionDirective` abaixo, sem alteração); **Skill 09/10/11**
> executam em Job **novo**, não numa Attempt adicional do Job antigo.

## Garantia central

A Skill 13 transforma um `VideoAuditResult` exato com `NON_COMPLIANT` em
um `CorrectionPlan` finito, rastreável a violations específicas e
limitado ao menor escopo necessário para tentar removê-las. Ela **não
executa** a nova tentativa, **não altera fatos**, **não muda estratégia
criativa**, e **não decide** se uma nova `StageIteration` será
autorizada (correção pós-revisão Fable — ver nota no topo deste
arquivo; originalmente escrito como "Attempt").

## Divisão de responsabilidades

```text
Skill01  → decide SE nasce nova StageIteration/StageExecution (via
           transitionKey opaco — ver Ponto D da Skill 01)
Skill13  → decide O QUE deve mudar na próxima tentativa
Skill10/11 (e, se necessário, Skill09) → executam em Job NOVO (não numa
           Attempt do Job antigo) com os artefatos corrigidos
```

A Skill 13 nunca faz algo equivalente a `while (audit == NON_COMPLIANT) {
muda prompt; gera de novo; }`. Ela produz uma `CorrectionPlan` finita e
auditável; a Skill 01 decide se esse plano vira uma nova
`StageIteration` (correção pós-revisão Fable — ver nota no topo deste
arquivo).

## Auditoria real e precedente

A auditoria confirmou greenfield operacional com um precedente real
relevante: `src/lib/concierge/orchestrator.ts` (`shouldRetryWithSuggestedTerm`)
já implementa "correção direcionada por um problema observado, com teto
duro" — reabre apenas o estágio necessário (busca+rank+expert-verdict,
não a conversa inteira) com um termo modificado, nunca retry cego, capado
em 1 tentativa (`alreadyRetried` hardcoded, sem loop/contador). É
single-shot e sem persistência — não é reutilizável diretamente, mas
valida o princípio.

`RetryPolicy` (Skill 02) é puramente conceitual — referenciada como tipo,
com semântica em prosa (`maxAttempts` inclui a primeira tentativa;
`attemptCount >= maxAttempts → FAILED`), mas o shape completo vive na
`StageDefinition` da Skill 01 e zero código implementa isso hoje. Zero
padrão de "max attempts" real em código (o mais próximo,
`concierge_visual_health`, é um circuit-breaker de janela rolante, não um
teto por tentativa individual). Zero versionamento de artefato (v1/v2)
em qualquer lugar — os contratos já aprovados (Skills 09-12) usam
`(jobId, attemptNumber)` como a tupla de identidade dos artefatos; o
`attemptNumber` **já é** o eixo de versionamento.

**Lacuna arquitetural real encontrada durante o debate:** com os
contratos atuais, a Skill 10 é determinística (mesmo input + mesma
policy → mesmo `VideoPromptArtifact`), e a Skill 09 não recebe hoje uma
"correction directive". Simplesmente abrir nova Attempt não basta quando
a correção exige mudar prompt ou frame. Isso exige um patch compatível
nas Skills 09/10 (ver seção `CorrectionDirective` abaixo) — sem reabrir
9/25 ou 10/25.

## Não é responsabilidade da Skill 13

- Não decide se deve tentar corrigir ou desistir — isso é `RetryPolicy`
  da Skill 02 (já aprovada).
- Não gera vídeo diretamente — reformula o `VideoPromptArtifact`/intent e
  aciona uma nova Attempt através da Skill 02, que por sua vez aciona
  Skill 10/11 novamente.
- Não decide quota/custo (Skill 02/23).
- Não audita o resultado da correção — isso volta para a Skill 12.

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


### `CorrectionScope`

```typescript
type CorrectionScope =
  | 'VIDEO_REGENERATION_ONLY'
  | 'PROMPT_AND_VIDEO'
  | 'FRAME_PROMPT_AND_VIDEO'
  | 'UPSTREAM_REVISION_REQUIRED';
```

Sem `FULL_REGENERATION` genérico — ambíguo demais. Semântica:

```text
VIDEO_REGENERATION_ONLY
→ mesmo VideoPromptArtifact, nova Attempt da Skill11
→ útil para artefato estocástico, continuity break, deformação
  incidental etc.

PROMPT_AND_VIDEO
→ Skill10 produz novo VideoPromptArtifact sob CorrectionDirective
→ depois nova Attempt da Skill11

FRAME_PROMPT_AND_VIDEO
→ Skill09 produz novo FrameArtifact sob CorrectionDirective
→ Skill10 produz prompt coerente com esse novo frame
→ Skill11 executa nova Attempt

UPSTREAM_REVISION_REQUIRED
→ violation não pode ser corrigida legitimamente sem alterar
  Script/CreativeDirection
→ Skill13 NÃO altera 07/08 — reporta necessidade de voltar upstream
```

`UPSTREAM_REVISION_REQUIRED` é essencial: se o próprio roteiro exige algo
que a referência visual não sustenta, a Skill 13 não pode "consertar"
inventando produto.

**PATCH (Ponto S6 — reparo transversal pós-revisão Fable, 2026-09-18,
`VIDEO_COMPOSITION_V1`).** Nenhum `CorrectionScope` (nem
`UPSTREAM_REVISION_REQUIRED`) pode introduzir composição multi-beat.
Se a correção proposta for "dividir em cenas geradas separadamente",
isso é **fora de `VIDEO_COMPOSITION_V1`** — nunca convertido
silenciosamente numa nova iteration multi-beat. Dentro da mesma
`ProductionRun` V1, o modo de composição `SINGLE_BEAT` permanece
congelado: nunca `Iteration 1 = 1 beat, Iteration 2 = 3 beats`.
Correção continua ocorrendo sobre um vídeo completo de um único beat.

### `CorrectionInput`

```typescript
type CorrectionInput = {
  tenantId: string;
  runId: string;

  videoAuditResultId: string;
  videoAuditResultHash: string;

  videoArtifactId: string;
  videoContentHash: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  scriptResultId: string;
  scriptHash: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2

  correctionPolicyKey: string;
};
```

Precondição: `VideoAuditResult.verdict = NON_COMPLIANT`. `COMPLIANT` ou
`INCONCLUSIVE` **não** entram automaticamente na Skill 13 —
`INCONCLUSIVE` exige outro roteamento/policy, nunca é autorização para
"corrigir no chute".

### `CorrectionAction`

Cada ação precisa apontar para a violation que pretende resolver.

```typescript
type CorrectionAction = {
  correctionActionId: string;

  violationId: string;
  violationCode: VideoAuditViolationCode;

  target:
    | 'VIDEO_EXECUTION'
    | 'VIDEO_PROMPT'
    | 'FRAME'
    | 'UPSTREAM';

  actionType:
    | 'REGENERATE_SAME_INSTRUCTION'
    | 'ADD_CONSTRAINT'
    | 'STRENGTHEN_CONSTRAINT'
    | 'REMOVE_UNSUPPORTED_BEHAVIOR'
    | 'ADJUST_CAMERA_OR_MOTION'
    | 'REQUIRE_IDENTITY_PRESERVATION'
    | 'REQUIRE_FRAME_REGENERATION'
    | 'REQUIRE_UPSTREAM_REVISION';

  rationale: string;

  evidenceRefs: string[];
  upstreamBasisRefs: string[];
};
```

Ações vagas como "melhorar vídeo", "deixar mais bonito", "tentar outro
prompt" não são correção auditável — proibidas.

### `CorrectionDirective` — a peça que resolve a lacuna com Skills 09/10

```typescript
type CorrectionDirective = {
  correctionDirectiveId: string;

  sourceVideoAuditResultId: string;
  sourceVideoAuditResultHash: string;

  correctionScope: CorrectionScope;

  actions: CorrectionAction[];

  preservedFacts: {
    scriptHash: string;
    creativeDirectionHash: string;
    productVisualReferenceSetHash: string;
  };

  forbiddenChanges: {
    changeProductFacts: true;
    changeOfferFacts: true;
    changeCreativeStrategy: true;
    inventUnsupportedProductFeatures: true;
  };

  directiveHash: string;
};
```

Hash: `CORRECTION_DIRECTIVE_V1`.

### Patch compatível nas Skills 09/10 (sem reabrir 9/25 ou 10/25)

Este contrato entra como campo **opcional** — restringe a próxima
geração, nunca amplia fatos:

```typescript
// Adicionado como campo opcional em FrameGenerationContext (Skill09) e
// VideoPromptInput/VideoGenerationIntent (Skill10):
correctionContext?: CorrectionDirectiveRef;

type CorrectionDirectiveRef = {
  correctionDirectiveId: string;
  correctionDirectiveHash: string;
};
```

**Regra para a Skill 10:** quando `correctionContext` existir, mesmos
upstreams + `CorrectionDirective` diferente → `generationContextHash`/
`intentHash` diferente → novo `VideoPromptArtifact` legitimamente
diferente. Sem isso, a Skill 10 determinística produziria exatamente o
mesmo prompt, e a Skill 13 seria incapaz de fazer `PROMPT_AND_VIDEO`.

**Regra para a Skill 09:** mesma lógica — `FRAME_PROMPT_AND_VIDEO` →
nova Attempt da Skill 09, `CorrectionDirective` restringe o novo
`FrameRequirement`/generation context. Mas o directive **não pode**
mandar "mude o produto para ter 3 botões" se a referência real só
sustenta dois — `forbiddenChanges.inventUnsupportedProductFeatures`
continua valendo.

**PATCH (Ponto S2).** Se a correção **não** muda a seleção de
referência visual, a nova Attempt da Skill 09 reutiliza exatamente o
mesmo `productVisualReferenceSetRef` (mesmo `POPULATED` ou `EMPTY`).
Se a correção exige nova seleção/frame, a nova `StageIteration` produz
uma nova execução da Skill 09 e, consequentemente, um novo
`ProductVisualReferenceSet` (novo id + hash) — **nunca** mutação do set
antigo. O `ProductVisualReferenceSet` anterior nunca muda.

> **Nota:** a definição completa de `CorrectionPlan` está consolidada
> mais abaixo, na seção "`CorrectionPlan` (final)", após a
> `CorrectionPolicy` e a `CorrectionViolationSignature` — os campos
> `correctionPolicySnapshotHash`, `sourceViolationSignatureHash` e
> `repeatReason?` dependem desses contratos.

**Deliberadamente ausente:** `nextAttemptNumber`, `maxAttempts`,
`retryAllowed`, `willRetry` — isso é Skill 02.

### Eixo de versionamento (sem eixo próprio)

> A Skill 13 não cria um eixo próprio de versionamento de artefatos.
> Quando a Skill 02 autoriza nova execução, cada estágio reexecutado
> materializa novos artefatos dentro de sua nova `JobAttempt`. O lineage
> é preservado pelos IDs/hashes da origem e pelo `CorrectionPlan`, não
> por campos `v2`/`v3`.

```text
Audit Attempt anterior → CorrectionPlan CP1 → Skill02 decide retry
  → Skill10 Attempt 2 → novo VideoPromptArtifact
  → Skill11 Attempt 2 → novo VideoArtifact
  → Skill12 nova auditoria

Nunca: VideoArtifact.version = 2
```

### Teto e anti-loop

O precedente do Concierge dá apoio ao conceito, mas não copiamos "1
retry" como regra da máquina — sem calibração real. A Skill 13 garante
apenas: **1 invocação → 1 `CorrectionPlan` finito → nenhum loop
interno**. O número máximo de Attempts permanece na `RetryPolicy` da
Skill 02.

> A Skill 13 nunca pode produzir um novo plano idêntico para a mesma
> cadeia de violation + upstream + correction history e esperar
> resultado diferente sem justificativa.

Isso prepara uma futura detecção de `CORRECTION_NO_PROGRESS`, sem ainda
decidir o máximo de tentativas.

### Nem toda `NON_COMPLIANT` é corrigível automaticamente

```text
SEVERE_GENERATION_ARTIFACT
→ VIDEO_REGENERATION_ONLY

PRODUCT_IDENTITY_MISMATCH causado por geração
→ PROMPT_AND_VIDEO ou FRAME_PROMPT_AND_VIDEO

SCRIPT_REQUIRED_ACTION_MISSING
→ PROMPT_AND_VIDEO

violação causada pelo próprio ScriptResult
→ UPSTREAM_REVISION_REQUIRED
```

A Skill 13 precisa ter permissão de dizer "não consigo corrigir
legitimamente dentro das fronteiras" — isso é melhor do que mascarar a
violation.

## Decisão de design: transformação determinística, sem provider externo na V1

A Skill 13 V1 não chama LLM, não chama provider, não gera imagem, não
gera vídeo, não tem side effect pago — simplifica bastante: não precisa
checkpoint pago, `SUBMITTING`, quota, nem `EXTERNAL_STATE_UNKNOWN`. Se
futuramente adicionarmos um `CorrectionReasoningProvider` baseado em IA
(para "inventar" a correção), isso vira uma extensão explícita com
contrato, checkpoint, provider request hash, quota e external-state
handling próprios — nunca escondido dentro da Skill 13 atual.

### `CorrectionPolicy` / `CorrectionPolicyBinding`

A policy determina quais correções são legítimas para cada violation.

```typescript
type CorrectionRule = {
  violationCode: VideoAuditViolationCode;

  disposition:
    | 'AUTO_CORRECTABLE'
    | 'CONDITIONALLY_CORRECTABLE'
    | 'UPSTREAM_ONLY';

  minimumScope: CorrectionScope;
  allowedScopes: CorrectionScope[];

  allowedActionTypes: CorrectionAction['actionType'][];

  requireEvidenceRefs: boolean;
  requireUpstreamBasisRefs: boolean;
};

type CorrectionPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;

  tenantId: string;

  rules: CorrectionRule[];

  scopeOrder: [
    'VIDEO_REGENERATION_ONLY',
    'PROMPT_AND_VIDEO',
    'FRAME_PROMPT_AND_VIDEO',
    'UPSTREAM_REVISION_REQUIRED'
  ];

  requireAllBlockingViolationsAddressable: boolean;

  allowEquivalentDirectiveForStochasticRegeneration: boolean;

  preservedFactsRequired: {
    script: true;
    creativeDirection: true;
    productVisualReferenceSet: true;
  };

  createdAt: string;
};

type CorrectionPolicyBinding = {
  tenantId: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Hash: `CORRECTION_POLICY_V1` sobre todos os campos comportamentais da
policy, com regras em ordem canônica. Nada de provider, modelo, API key
ou quota aqui.

### Derivação do scope — não é escolha livre

A Skill 13 não recebe violations e "acha" que `PROMPT_AND_VIDEO` parece
adequado. Fluxo: para cada violation → encontrar `CorrectionRule` exata
→ validar `evidenceRefs`/`upstreamBasisRefs` → determinar se é
corrigível dentro das fronteiras → materializar candidate action →
determinar `minimumScope`. Depois: combinar todas as requirements →
escolher o **menor** scope que consegue satisfazer **todas** as
violations bloqueantes corrigíveis. Ordem: `VIDEO_REGENERATION_ONLY <
PROMPT_AND_VIDEO < FRAME_PROMPT_AND_VIDEO < UPSTREAM_REVISION_REQUIRED`.
`UPSTREAM_REVISION_REQUIRED` **não** significa "regenerar ainda mais
coisas" — significa que a Skill 13 atingiu sua fronteira e não pode
corrigir legitimamente o problema.

**Composição de múltiplas violations:** `SEVERE_GENERATION_ARTIFACT`
(`VIDEO_REGENERATION_ONLY`) + `SCRIPT_REQUIRED_ACTION_MISSING`
(`PROMPT_AND_VIDEO`) → resultado `PROMPT_AND_VIDEO` (cobre ambos). Mas
`PRODUCT_IDENTITY_MISMATCH` (`FRAME_PROMPT_AND_VIDEO`) + violation cuja
causa está no `ScriptResult` → resultado `UPSTREAM_REVISION_REQUIRED` —
nunca fazemos a primeira correção escondendo que a segunda continuará
impedindo conformidade.

> Se qualquer violation necessária para remover o `NON_COMPLIANT` não
> puder ser legitimamente corrigida dentro das Skills 09/10/11, o plano
> resulta em `UPSTREAM_REVISION_REQUIRED`.

### Não reinterpretar a auditoria

A Skill 13 **não pode** reduzir `HARD → MINOR`, ignorar violation, baixar
confidence, ou remover violation porque "parece exagerada" — consome o
`VideoAuditResult` como fato upstream. Se achar uma combinação
impossível (violation diz X, basis/evidence não suporta X), isso é
integridade do input/auditoria, **não** permissão para a Skill 13
"consertar" o audit.

### `CorrectionViolationSignature` — assinatura semântica (não por ID)

Para detectar loop entre vídeos diferentes, não podemos comparar
`violationId` (cada nova auditoria tem IDs novos).

```typescript
type CorrectionViolationSignature = {
  signatureSchemaVersion: 'CORRECTION_VIOLATION_SIGNATURE_V1';

  violations: Array<{
    code: VideoAuditViolationCode;
    severity: VideoAuditViolationSeverity;

    semanticTarget?: string;

    upstreamBasisKinds: string[];
  }>;

  signatureHash: string;
};
```

Hash: `CORRECTION_VIOLATION_SIGNATURE_V1` — ordenação canônica por
`code`, `severity`, `semanticTarget`, `upstreamBasisKinds`
lexicograficamente. **Não entram:** `violationId`, evidence IDs,
timestamps, `videoArtifactId`. Assim, "vídeo A: produto ficou azul" e
"vídeo B: produto continuou azul" são violations operacionais
diferentes, mas a signature semântica pode continuar igual.

### `CorrectionHistoryEntry` — lineage, sem eixo de versão

```typescript
type CorrectionHistoryEntry = {
  correctionPlanId: string;
  correctionPlanHash: string;

  correctionDirectiveId: string;
  correctionDirectiveHash: string;

  sourceViolationSignatureHash: string;

  correctionScope: CorrectionScope;

  resultingVideoAuditResultId?: string;
  resultingVideoAuditResultHash?: string;
};
```

Não existe `correctionAttemptNumber`, `artifactVersion`,
`correctionVersion` — o eixo operacional continua sendo `JobAttempt`.

### Anti-loop / `NO_PROGRESS`

```typescript
type CorrectionPlanResult =
  | 'CORRECTION_AVAILABLE'
  | 'UPSTREAM_REVISION_REQUIRED'
  | 'NO_PROGRESS';
```

`NO_PROGRESS` é resultado de domínio, não fatal/retryable/blocked. Caso
principal: `correctionDirectiveHash` anterior = D1, violation signature
após executar D1 = S1; nova invocação com candidate directive = D1 e
violation signature atual = S1 → mesma correção já foi executada + mesmo
problema semântico permanece → `NO_PROGRESS`. A Skill 13 não entrega
novamente D1 fingindo ser uma nova solução.

**Exceção — regeneração estocástica:** `VIDEO_REGENERATION_ONLY` pode
legitimamente dizer "mesmo prompt → novo vídeo aleatório". Se
`allowEquivalentDirectiveForStochasticRegeneration = false`: mesmo
directive + mesma violation signature → `NO_PROGRESS`. Se `true`, a
Skill 13 pode devolver novamente `REGENERATE_SAME_INSTRUCTION`, mas
registra explicitamente `repeatReason = STOCHASTIC_REGENERATION` — isso
não decide quantas vezes será permitido; o teto total continua
exclusivamente na `RetryPolicy` da Skill 02.

### `CorrectionDirective` não pode conter instrução arbitrária livre

> Toda mudança semântica presente na `CorrectionDirective` deve ser
> derivável de uma ou mais `CorrectionAction` válidas pela
> `CorrectionPolicy`.

Nada de esconder dentro de `rationale` uma nova estratégia. `directiveHash`
inclui semanticamente: source audit hash, scope, actions canônicas,
`preservedFacts`, `forbiddenChanges`, `repeatReason?` quando aplicável.

### `CorrectionPlan` (final)

```typescript
type CorrectionPlan = {
  correctionPlanId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  sourceVideoAuditResultId: string;
  sourceVideoAuditResultHash: string;

  sourceVideoArtifactId: string;
  sourceVideoContentHash: string;

  sourceVideoPromptArtifactId: string;
  sourceVideoPromptArtifactHash: string;

  correctionPolicyId: string;
  correctionPolicyVersion: string;
  correctionPolicySnapshotHash: string;

  sourceViolationSignatureHash: string;

  correctionScope: CorrectionScope;

  actions: CorrectionAction[];

  correctionDirectiveId?: string;
  correctionDirectiveHash?: string;

  addressedViolationIds: string[];
  unaddressableViolationIds: string[];

  repeatReason?: 'STOCHASTIC_REGENERATION';

  result: CorrectionPlanResult;

  planHash: string;

  createdAt: string;
};
```

Hash: `CORRECTION_PLAN_V1` — sem `createdAt`/`correctionPlanId`/`jobId`/
`attemptNumber` na parte semântica; inclui
`sourceVideoAuditResultHash`, `sourceViolationSignatureHash`, policy
snapshot hash, scope, actions canônicas, `directiveHash?`,
addressed/unaddressable violation semantic refs, `result`,
`repeatReason?`.

### Invariantes do resultado

```text
CORRECTION_AVAILABLE exige:
  actions.length > 0
  correctionDirectiveId/hash presentes
  unaddressableViolationIds.length = 0
  scope != UPSTREAM_REVISION_REQUIRED

UPSTREAM_REVISION_REQUIRED exige:
  unaddressableViolationIds.length > 0
  OU policy determinou que facts/upstreams teriam que mudar
  (não exige uma directive executável para Skill09/10)

NO_PROGRESS exige evidência histórica:
  directive equivalente já executada
  + violation signature equivalente permaneceu
  + não há repeat estocástico permitido/justificado
  (nunca produzido só porque "parece difícil")
```

## Idempotência

`UNIQUE lógico: (jobId, attemptNumber) → 0..1 CorrectionPlan canônico`.
Fluxo puro, sem rede externa: reabrir `VideoAuditResult` exato → validar
upstreams → resolver `CorrectionPolicy` snapshot → construir violation
signature → carregar correction lineage → derivar rules/actions →
derivar scope → detectar no-progress → montar directive quando aplicável
→ calcular hashes → persistir `CorrectionPlan` + `AuditEvent`.

### Replay

Resultado existente e compatível → retorna mesmo `CorrectionPlan`, mesmo
`planHash`, zero recomputação. Mesmo `(jobId, attemptNumber)` mas
input/policy/history incompatível → `CORRECTION_PLAN_REPLAY_CONFLICT`
(FATAL_ERROR) — nunca sobrescrever.

### Por que não há checkpoint na V1

Crash antes do commit → recalcula deterministicamente. Crash depois do
commit → replay.

## Erros

### `FATAL_ERROR`

```text
CORRECTION_TENANT_MISMATCH

CORRECTION_AUDIT_RESULT_NOT_FOUND
CORRECTION_AUDIT_RESULT_HASH_MISMATCH
CORRECTION_AUDIT_VERDICT_NOT_NON_COMPLIANT

CORRECTION_VIDEO_ARTIFACT_MISMATCH
CORRECTION_VIDEO_PROMPT_ARTIFACT_MISMATCH
CORRECTION_SCRIPT_MISMATCH
CORRECTION_CREATIVE_DIRECTION_MISMATCH
CORRECTION_REFERENCE_SET_MISMATCH

CORRECTION_POLICY_NOT_FOUND
CORRECTION_POLICY_BINDING_NOT_FOUND
INVALID_CORRECTION_POLICY

CORRECTION_VIOLATION_RULE_NOT_FOUND
CORRECTION_ACTION_NOT_ALLOWED
CORRECTION_SCOPE_DERIVATION_INVALID

CORRECTION_DIRECTIVE_INTEGRITY_VIOLATION
CORRECTION_PRESERVED_FACT_MUTATION

CORRECTION_HISTORY_INCONSISTENT

CORRECTION_PLAN_REPLAY_CONFLICT
```

`CORRECTION_PRESERVED_FACT_MUTATION` dispara se qualquer ação tentar
mudar `scriptHash`/`creativeDirectionHash`/`productVisualReferenceSetHash`
dentro de uma correção que deveria preservá-los.

### `RETRYABLE_ERROR`

Como é transformação local, a lista é pequena: `TRANSIENT_DATASTORE_ERROR`
(talvez futuramente `TRANSIENT_STORAGE_METADATA_READ_ERROR`). Não existe
na V1: provider timeout, rate limit, `EXTERNAL_STATE_UNKNOWN`, billing
ambiguity.

### Sem `BLOCKED` técnico na V1

`não consigo corrigir sem mudar Script` e `já tentei a mesma correção e
não houve progresso` **não são** `BLOCKED` — são
`UPSTREAM_REVISION_REQUIRED`/`NO_PROGRESS`, resultados de domínio. Isso
é mais limpo para a Skill 01/02 decidirem o próximo passo.

## Multi-tenant

Fonte de autoridade: `trustedTenantId = Job.tenantId`. Precisam
corresponder: `CorrectionInput`, `VideoAuditResult`, `VideoArtifact`,
`VideoPromptArtifact`, `ScriptResult`, `CreativeDirectionResult`,
`ProductVisualReferenceSet`, `CorrectionPolicyBinding`,
`CorrectionPolicy`, `CorrectionHistoryEntry`/`CorrectionPlan` anteriores,
`CorrectionDirective`, `CorrectionPlan`. Divergência →
`CORRECTION_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de segurança).

**Sem dedupe cross-tenant:** mesmo `sourceViolationSignatureHash`,
`correctionDirectiveHash`, ou `planHash` semanticamente igual não
autoriza compartilhar `CorrectionPlan`/`CorrectionDirective`/history
entre tenants. Código/rules globais podem ser compartilhados; artefatos
não.

## Relação com Skills 09/10 após o patch

```text
CORRECTION_AVAILABLE, se Skill02 autorizar nova Attempt, carrega
CorrectionDirectiveRef no estágio correto:

VIDEO_REGENERATION_ONLY
→ não precisa reexecutar Skill09/10
→ mesmo VideoPromptArtifact, nova Attempt Skill11

PROMPT_AND_VIDEO
→ Skill10 recebe CorrectionDirectiveRef
→ novo VideoGenerationIntent hash → novo VideoPromptArtifact → Skill11

FRAME_PROMPT_AND_VIDEO
→ Skill09 recebe CorrectionDirectiveRef
→ novo FrameGenerationContext hash → novo FrameArtifact
→ Skill10 recebe mesma lineage de correção → novo VideoPromptArtifact
→ Skill11

UPSTREAM_REVISION_REQUIRED
→ não executa 09/10/11 automaticamente
```

> **Proteção importante:** a mesma `CorrectionDirective` deve ser usada
> por todos os estágios reexecutados pertencentes à mesma correção —
> Skill 09 recebe Directive D1, Skill 10 não pode receber D2 na mesma
> cadeia corrigida. Isso preserva causalidade.

## Observabilidade

### Logs

`tenantId`, `runId`, `jobId`, `attemptNumber`, `sourceVideoAuditResultId`,
`sourceVideoAuditResultHash`, `sourceViolationSignatureHash`,
`violationCount`, `hardViolationCount`, `majorViolationCount`,
`minorViolationCount`, `correctionPolicyId`, `correctionPolicyVersion`,
`correctionScope`, `actionCount`, `addressedViolationCount`,
`unaddressableViolationCount`, `correctionDirectiveId?`,
`correctionDirectiveHash?`, `priorCorrectionPlanCount`,
`sameDirectiveSeenBefore`, `sameViolationSignatureSeenBefore`,
`repeatReason?`, `result`, `planHash`, `durationMs`, `errorCode?`. Não
loga `rationale` completo por padrão.

### `AuditEvent`

Criado em: `CorrectionPlan` criado com `CORRECTION_AVAILABLE`;
`UPSTREAM_REVISION_REQUIRED`; `NO_PROGRESS` detectado;
`CORRECTION_PRESERVED_FACT_MUTATION`; `CORRECTION_PLAN_REPLAY_CONFLICT`;
`CORRECTION_TENANT_MISMATCH`. Não precisa `AuditEvent` por cada
`CorrectionAction` — o plano já persiste o detalhe.

### Métricas

```text
correction_plan_total
correction_available_total
correction_upstream_revision_required_total
correction_no_progress_total

correction_scope_total{scope}
correction_action_total{actionType}

correction_violation_addressed_total{violationCode}
correction_violation_unaddressable_total{violationCode}

correction_same_directive_repeat_detected_total
correction_stochastic_repeat_total

correction_replay_reuse_total
correction_replay_conflict_total

correction_no_progress_rate
correction_upstream_revision_rate
```

**Proibido:** `expected_conversion_improvement`, `correction_sales_score`,
`expected_ROI`.

## Plano de testes

**Entrada/upstream:** (1) audit inexistente → fatal. (2) audit hash
divergente → fatal. (3) verdict `COMPLIANT` → rejeita. (4) verdict
`INCONCLUSIVE` → rejeita. (5) `NON_COMPLIANT` válido → processa. (6-10)
`VideoArtifact`/`VideoPromptArtifact`/Script/CreativeDirection/
`ProductVisualReferenceSet` divergente → fatal.

**Policy:** (11) binding ausente → fatal. (12) policy ausente → fatal.
(13) violation sem `CorrectionRule` → fatal/configuração incompleta.
(14) action não permitida pela rule → fatal. (15) scope fora de
`allowedScopes` → fatal.

**Derivação de scope:** (16) apenas severe generation artifact →
`VIDEO_REGENERATION_ONLY`. (17) required action missing corrigível no
prompt → `PROMPT_AND_VIDEO`. (18) identity mismatch exigindo novo seed →
`FRAME_PROMPT_AND_VIDEO`. (19) violation causada pelo próprio Script →
`UPSTREAM_REVISION_REQUIRED`. (20) duas violations com scopes 1 e 2 →
scope 2. (21) scopes 2 e 3 → scope 3. (22) qualquer violation
obrigatória upstream-only → upstream required. (23) nunca escolhe scope
menor que `minimumScope`. (24) não usa `FULL_REGENERATION` inexistente.

**Actions/facts:** (25) toda action aponta para violation real. (26)
`evidenceRefs` exigidas e ausentes → falha. (27) `upstreamBasisRefs`
exigidas e ausentes → falha. (28) action tenta alterar product fact →
preserved fact mutation. (29) action tenta trocar CreativeDirection →
mutation. (30) action tenta reescrever Script → mutation. (31)
rationale vaga sem action estruturada não altera directive.

**Signature:** (32) IDs de violation diferentes mas mesmos
códigos/semantic targets → mesma violation signature. (33) severity
diferente → signature muda. (34) semantic target diferente → signature
muda. (35) timestamps/evidence IDs diferentes não mudam signature.

**Anti-loop:** (36) directive D1 executada + mesma signature retorna +
candidate D1 → `NO_PROGRESS`. (37) directive mudou semanticamente → não
é falso `NO_PROGRESS`. (38) violation signature mudou → nova correção
pode ser proposta. (39) stochastic regeneration equivalente +
policy=false → `NO_PROGRESS`. (40) stochastic regeneration equivalente +
policy=true → `CORRECTION_AVAILABLE` + `repeatReason`. (41) repeat
permitido não altera `maxAttempts` da Skill 02. (42) Skill 13 nunca cria
loop interno.

**Idempotência:** (43) mesmo input/policy/history → mesmo
`directiveHash`/`planHash`. (44) replay compatível retorna mesmo
`CorrectionPlan`. (45) replay incompatível →
`CORRECTION_PLAN_REPLAY_CONFLICT`. (46) crash antes do commit → recomputa
identicamente. (47) crash após commit → reutiliza plano. (48) Skill 13
não faz qualquer chamada externa na V1.

**Integrações futuras:** `PROMPT_AND_VIDEO` → Directive D → Skill 10
context inclui D → `intentHash` muda → prompt novo; `FRAME_PROMPT_AND_VIDEO`
→ Skill 09 + Skill 10 usam exatamente D; `VIDEO_REGENERATION_ONLY` →
Skill 10 não é reexecutada, Skill 11 usa o mesmo `VideoPromptArtifact` em
nova Attempt; nova auditoria pós-correção → lineage permite detectar
progresso ou `NO_PROGRESS`.

**Ponto S2 (49-50):** (49) correção sem mudança de referência visual →
nova Attempt reutiliza exatamente o mesmo `productVisualReferenceSetRef`.
(50) `FRAME_PROMPT_AND_VIDEO` com nova seleção → novo
`ProductVisualReferenceSet` (novo id+hash); o set anterior nunca é
mutado.

## Fechamento conceitual

1. A Skill 13 decide o que precisa mudar; a Skill 02 decide se haverá
   outra tentativa.
2. A correção mínima válida é preferida à regeneração mais ampla, mas
   nunca às custas de deixar uma violation impeditiva sem tratamento.
3. Nenhuma correção pode modificar fatos ou estratégia upstream para
   fazer o vídeo "passar". Quando isso seria necessário, o resultado é
   `UPSTREAM_REVISION_REQUIRED`.
4. Repetir a mesma correção sobre o mesmo problema sem justificativa
   explícita não é progresso; é `NO_PROGRESS`.

## Status de implementação (nesta fase de especificação)

```text
Correction pipeline    → NOT_IMPLEMENTED
CorrectionReasoningProvider (IA, futuro) → NOT_IMPLEMENTED
```
