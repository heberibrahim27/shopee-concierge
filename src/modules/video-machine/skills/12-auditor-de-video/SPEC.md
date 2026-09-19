# Skill 12 — Auditor de Vídeo

> **APROVADA EM ESPECIFICAÇÃO — 12/25** (2026-09-18). Especificação/
> contrato. **Sem implementação ainda** — nenhuma migration, tabela, RPC,
> worker ou provider de análise foi criado. Este arquivo só vira código
> depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code,
> fundamentado em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`, confirmado via lista de
> tabelas). A auditoria confirmou greenfield operacional: zero código de
> análise/entendimento de vídeo; o SDK `openai` instalado (v4.104.0) não
> suporta vídeo nativo em Chat Completions — extração de frame é
> obrigatória; zero FFmpeg/equivalente instalado; zero tabela de
> audit/review/flag/violation nas 16 tabelas live. Três precedentes reais
> e reutilizáveis (estruturalmente, não semanticamente) foram encontrados:
> (1) padrão de `confidence` 0..1 float já estabelecido
> (`ImageObservation.confiancaGeral` etc. em `recognize.ts`); (2) padrão
> `score` numérico + `score_breakdown jsonb` estruturado
> (`deal_candidates`); (3) padrão técnico de empacotar **múltiplas
> imagens num único array de `image_url`** numa só chamada de Chat
> Completions (`compare.ts`/`expertVision.ts` do Concierge — comparam
> produtos distintos, não frames sequenciais de vídeo, mas provam que o
> mecanismo técnico funciona neste codebase). `concierge_visual_health` é
> um circuit-breaker de saúde (não um score por item) — legado de
> propósito diferente, não reutilizado.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B2)**: `NON_COMPLIANT`
> é um resultado de domínio **bem-sucedido** da auditoria — o Job desta
> Skill termina `SUCCEEDED` (não `FAILED`/`BLOCKED`), porque a auditoria
> cumpriu sua função ao produzir o veredito, mesmo reprovando o vídeo. O
> `SkillExecutionAdapter` desta Skill traduz o `verdict` pra uma
> `transitionKey` opaca (ex.: `AUDIT_NON_COMPLIANT`/`AUDIT_COMPLIANT`);
> quando essa transition estiver configurada como
> `START_NEXT_ITERATION` no `StageKernelContract`, a Skill 01 cria uma
> nova `StageIteration` — o Job de auditoria concluído **nunca** é
> reaberto. Ver "Reparo transversal pós-revisão Fable → Ponto D" no
> `SPEC.md` da Skill 01 pro contrato completo do ciclo de correção.
>
> **🔧 Adição pós-revisão Fable (achado B6)**: qualquer referência
> local de autorização desta Skill segue a mesma regra — mesma
> `QuotaAuthorization`, mesma `ExecutionQuotaBinding` da Skill 23,
> nenhum contrato paralelo de quota. Ver "Ponto E" no `SPEC.md` da
> Skill 23.

## Garantia central

Receber o `VideoArtifact` exato produzido pela Skill 11 e decidir, com
evidência reproduzível, se o vídeo respeita o produto (identidade
visual), o roteiro (`ScriptResult`), a direção criativa
(`CreativeDirectionResult`) e requisitos técnicos mínimos — **sem
corrigir o vídeo, sem publicá-lo, e sem confundir "qualidade" com
performance comercial futura**.

## Não é responsabilidade da Skill 12

- Não corrige/regenera o vídeo (isso seria a Skill 13 — Corretor
  Automático).
- Não publica nem decide aprovação final humana (Skill 03 — Gestor de
  Aprovação, já aprovada em espec, cuida do workflow de aprovação).
- Não prevê performance comercial/engajamento futuro — isso pertence às
  Skills 18/19 (Métricas/Performance), depois de dados reais existirem.
- Não decide custo/quota da própria auditoria (Skill 02/23).

## Verdito — nunca `APPROVED`/`REJECTED`

A Skill 12 devolve um veredito técnico, não uma decisão de aprovação —
isso invadiria a Skill 03:

```typescript
type VideoAuditVerdict =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'INCONCLUSIVE';
```

`INCONCLUSIVE` é indispensável: se não conseguimos observar áudio, um
detalhe do produto, ou parte suficiente do vídeo, não podemos fabricar
`COMPLIANT`. **Nenhuma violation encontrada ≠ `COMPLIANT` automático** —
pode simplesmente significar que não observamos o suficiente.

## Arquitetura da auditoria (4 etapas)

```text
VideoArtifact exato
  ↓
1. TECHNICAL INSPECTION
  ↓
2. EVIDENCE EXTRACTION (frames/amostras + metadata)
  ↓
3. SEMANTIC / CREATIVE ANALYSIS
  ↓
4. DETERMINISTIC VERDICT
```

A IA, se usada, **não decide o verdict final diretamente** — ela produz
observações estruturadas; a Skill 12 aplica a `VideoAuditPolicy`. Isso
evita "o modelo respondeu 'parece bom' → COMPLIANT".

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


### `VideoAuditInput`

```typescript
type VideoAuditInput = {
  tenantId: string;
  runId: string;

  videoArtifactId: string;
  videoContentHash: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2 — sempre presente, mesmo content.kind='EMPTY'

  videoAuditPolicyKey: string;
};
```

Invariantes: `VideoArtifact.contentHash = videoContentHash`;
`VideoArtifact.videoPromptArtifactId/hash` = input exato;
`VideoPromptArtifact` upstream hashes = `CreativeDirection` + `Script` +
referências fornecidos; tenant de todos = `Job.tenantId`. Nunca "vídeo
mais recente".

**PATCH (Ponto S6 — reparo transversal pós-revisão Fable, 2026-09-18,
`VIDEO_COMPOSITION_V1`).** Skill 12 audita `VideoArtifact` contra o
**único** `ScriptBeat` do exact `ScriptResult` (`scriptResultId`/
`scriptHash` acima) — nunca "o vídeo contra todos os beats" de um
jeito que sugira N clips. Antes do audit, valida composição:
`ScriptResult.beats.length === 1` e `beatIndex === 0`; se receber
`ScriptResult` fora dessa cardinalidade → `SCRIPT_BEAT_COUNT_INVALID`
(reaproveitado da Skill 08, owner do código — Skill 12 nunca cria um
segundo código pro mesmo conceito), sem tentar auditar parcialmente.
Continua podendo auditar múltiplos critérios normalmente (produto/
texto/CTA/visual reference/motion/duration/branding/safety/fidelity)
— single beat não significa auditoria simples.

### `TechnicalVideoEvidence`

A Skill 11 já fez validação mínima para conseguir persistir o arquivo —
a Skill 12 pode fazer inspeção técnica mais completa, mas não duplica
significado.

```typescript
type TechnicalVideoEvidence = {
  evidenceSchemaVersion: 'TECHNICAL_VIDEO_EVIDENCE_V1';

  videoArtifactId: string;
  videoContentHash: string;

  containerReadable: boolean;
  videoStreamPresent: boolean;

  durationMs?: number;
  width?: number;
  height?: number;
  frameRate?: number;

  audioStreamPresent?: boolean;

  corruptedSegmentsDetected?: boolean;
  frozenVideoDetected?: boolean;

  inspectionToolKey: string;
  inspectionToolVersion: string;

  evidenceHash: string;

  createdAt: string;
};
```

Hash: `TECHNICAL_VIDEO_EVIDENCE_V1`. FFmpeg não é congelado como
dependência conceitual — hoje `VideoMetadataInspector`/`FrameExtractor` =
`NOT_IMPLEMENTED`, `FFmpeg` = `NOT_INSTALLED`; a implementação futura
pode usar FFmpeg ou equivalente.

**PATCH (Ponto S7 — reparo transversal pós-revisão Fable, 2026-09-18,
`EXECUTION_RUNTIME_V1`, contrato completo em
`contracts/EXECUTION-RUNTIME.md`).** Quando `VideoMetadataInspector`/
`FrameExtractor` forem implementados (FFmpeg/FFprobe ou equivalente),
executam exclusivamente em `VIDEO_MACHINE_WORKER_V1`
(`DURABLE_WORKER`) — nunca via API route da Vercel. O `SkillJobHandler`
da Skill 12 segue a mesma regra: nunca executa em `CONTROL_PLANE`,
mesmo quando o Job for rápido.

### `VideoSamplingPlan` — sampling não pode ser implícito

Como análise nativa de vídeo não existe hoje, o conjunto de frames
observado precisa ser auditável.

```typescript
type VideoSamplingPlan = {
  samplingPlanId: string;

  tenantId: string;

  videoArtifactId: string;
  videoContentHash: string;

  strategy:
    | 'UNIFORM'
    | 'TIMELINE_TARGETED'
    | 'HYBRID';

  requestedSamples: Array<{
    sampleKey: string;

    timestampMs?: number;

    semanticTarget?:
      | 'OPENING'
      | 'MIDDLE'
      | 'ENDING'
      | 'SCRIPT_BEAT';

    beatIndex?: number;
  }>;

  samplingPolicyId: string;
  samplingPolicyVersion: string;
  samplingPolicySnapshotHash: string;

  samplingPlanHash: string;
};
```

Hash: `VIDEO_SAMPLING_PLAN_V1`. Não congelamos "1 frame por segundo", "8
frames" etc. — sem calibração real ainda.

### `VideoFrameSample` — evidência, não novo produto

```typescript
type VideoFrameSample = {
  videoFrameSampleId: string;

  tenantId: string;

  videoArtifactId: string;
  videoContentHash: string;

  samplingPlanId: string;
  sampleKey: string;

  requestedTimestampMs?: number;
  actualTimestampMs: number;

  contentHash: string;
  storageRef: string;

  mimeType: string;
  width: number;
  height: number;

  createdAt: string;
};
```

**Invariante crítica:** `VideoFrameSample` prova o que apareceu naquele
instante do vídeo, mas **não** passa a ser fonte factual independente
sobre o produto — a referência factual continua sendo o
`ProductVisualReferenceSet` (mesma proteção já congelada nas Skills
09/10).

### `VideoEvidenceCoverage`

Não basta "extraí seis imagens" — precisamos saber o que conseguimos
observar.

```typescript
type VideoEvidenceCoverage = {
  timelineCoverage: number; // 0..1

  openingCovered: boolean;
  middleCovered: boolean;
  endingCovered: boolean;

  requestedBeatIndexes: number[];
  coveredBeatIndexes: number[];

  productVisibleSamples: number;
  totalSamples: number;

  visualEvidenceSufficient: boolean;

  audioEvidenceStatus:
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'NOT_REQUIRED';

  textEvidenceStatus:
    | 'AVAILABLE'
    | 'PARTIAL'
    | 'UNAVAILABLE'
    | 'NOT_REQUIRED';
};
```

O `0..1` segue o padrão real já existente no repo, mas representa
**cobertura**, não "qualidade".

### Áudio — lacuna explícita

O pipeline auditado hoje tem `video visual analysis`/`audio
extraction`/`transcription` todos `NOT_IMPLEMENTED`. Portanto, se o
`ScriptResult` exige `spokenText`, a Skill 12 não pode afirmar que a fala
está correta usando só frames:

```text
script exige fala + audioEvidenceStatus = UNAVAILABLE
→ spoken-content compliance = NOT_EVALUATED
→ dependendo da policy: INCONCLUSIVE

Nunca PASS por ausência de prova.
```

### `VideoSemanticObservation`

A IA produz **observações**, não violations diretamente.

**PATCH (Ponto M1, reparo transversal pós-revisão Fable, 2026-09-18,
`CONTRACT_CONVENTIONS_V1`, contrato completo em
`contracts/CONTRACT-CONVENTIONS.md`).** Skill 12 é owner de
`EvidenceMatchJudgement` — vocabulário único pra julgamento
observacional de match/evidência neste SPEC (antes expresso de duas
formas: `MATCH`/`MISMATCH`/`NOT_OBSERVABLE` em alguns campos,
`YES`/`NO`/`UNCERTAIN` em outros, e as duas juntas redundantemente em
`VideoSemanticObservation.finding`). Mapeamento do legado:
`YES → MATCH`, `NO → MISMATCH`, `UNCERTAIN → NOT_OBSERVABLE` — sem
alias legado mantido por compatibilidade (pré-runtime). Vale só pra
campos que expressam esse julgamento observacional específico — não é
ban global de `YES`/`NO` no corpus (`unsupportedElementsIntroduced`
abaixo continua `YES`/`NO`/`NOT_OBSERVABLE`, de propósito: é uma
pergunta de presença de problema, não um julgamento de
match-com-referência, e inverter mecanicamente pra
`MATCH`/`MISMATCH` confundiria "introduziu elemento não suportado" com
"corresponde à referência").

```typescript
type EvidenceMatchJudgement =
  | 'MATCH' // evidência observável suporta a correspondência
  | 'MISMATCH' // evidência observável contradiz a correspondência
  | 'NOT_OBSERVABLE'; // não existe evidência suficiente/observável
                       // para afirmar MATCH ou MISMATCH
```

```typescript
type VideoSemanticObservation = {
  observationId: string;

  dimension:
    | 'PRODUCT_IDENTITY'
    | 'SCRIPT_ACTION'
    | 'VISUAL_TEXT'
    | 'SPOKEN_CONTENT'
    | 'CREATIVE_DIRECTION'
    | 'CONTINUITY'
    | 'VISUAL_ARTIFACT';

  finding: EvidenceMatchJudgement; // PATCH (Ponto M1) — antes
    // 'MATCH' | 'MISMATCH' | 'NOT_OBSERVABLE' | 'UNCERTAIN' (4
    // literais redundantes no mesmo campo — UNCERTAIN e NOT_OBSERVABLE
    // já eram o mesmo conceito). Ver contracts/CONTRACT-CONVENTIONS.md.

  confidence: number; // 0..1

  evidenceRefs: string[];

  upstreamBasisRefs: string[];

  normalizedExplanation?: string;
};
```

O `confidence` 0..1 reaproveita o padrão já real do Concierge. Mas
**confidence alta ≠ verdade**, e **confidence baixa ≠ violation
automática** — é evidência auxiliar para a policy.

### `ProductIdentityCheck`

A auditoria compara `VideoFrameSample[]` **versus**
`ProductVisualReferenceSet` materializado — **nunca**
`VideoFrameSample` versus `FrameArtifact` da Skill 09 como única fonte
factual (o `FrameArtifact` pode ajudar a verificar continuidade da
geração, mas a verdade visual permanece na referência real).

**PATCH (Ponto S2).** Com `content` discriminado
(`POPULATED`/`EMPTY`+`emptyReason`), a auditoria consegue distinguir
explicitamente quatro situações que antes eram indistinguíveis sem o
artifact real: (A) referências existiam e o vídeo divergiu delas —
violation real; (B) `EMPTY/NO_FRAME_REQUIRED` — nenhuma referência era
necessária, nada a comparar; (C) `EMPTY/REFERENCE_UNAVAILABLE` —
referência era esperada mas não existia, evidência insuficiente para
`ProductIdentityCheck` positivo ou negativo; (D) `EMPTY/TEXT_TO_VIDEO` —
geração sem base visual, mesma situação de (B) para fins de
identidade de produto. A relação exata entre (C) e o outcome do audit
(`INCONCLUSIVE` ou não) é formalizada no Ponto S4 — aqui a Skill 12
apenas recebe a evidência correta pra decidir.

```typescript
type ProductIdentityCheck = {
  colorPreserved: EvidenceMatchJudgement;
  shapePreserved: EvidenceMatchJudgement;
  distinctiveElementsPreserved: EvidenceMatchJudgement;

  unsupportedElementsIntroduced: 'YES' | 'NO' | 'NOT_OBSERVABLE'; // PATCH
    // (Ponto M1) — deliberadamente NÃO migrado pra EvidenceMatchJudgement:
    // pergunta de presença de problema, não julgamento de
    // match-com-referência (ver nota em VideoSemanticObservation).

  productIdentityConfidence: number;
};
```

Não existe `logoPreserved=true` universal — como já visto na Skill 09, o
logo pode nem ser visível na referência.

### Violations

Só depois das observações a policy materializa violations.

```typescript
type VideoAuditViolationSeverity =
  | 'HARD'
  | 'MAJOR'
  | 'MINOR';

type VideoAuditViolationCode =
  | 'TECHNICAL_CONTAINER_INVALID'
  | 'TECHNICAL_VIDEO_STREAM_MISSING'
  | 'TECHNICAL_CORRUPTION_DETECTED'
  | 'PRODUCT_IDENTITY_MISMATCH'
  | 'UNSUPPORTED_PRODUCT_ELEMENT_INTRODUCED'
  | 'SCRIPT_ACTION_MISMATCH'
  | 'SCRIPT_REQUIRED_ACTION_MISSING'
  | 'UNAUTHORIZED_VISUAL_TEXT'
  | 'REQUIRED_VISUAL_TEXT_MISSING'
  | 'SPOKEN_CONTENT_MISMATCH'
  | 'CREATIVE_DIRECTION_MISMATCH'
  | 'VISUAL_CONTINUITY_BREAK'
  | 'SEVERE_GENERATION_ARTIFACT';

type VideoAuditViolation = {
  violationId: string;

  code: VideoAuditViolationCode;
  severity: VideoAuditViolationSeverity;

  evidenceRefs: string[];
  upstreamBasisRefs: string[];

  confidence: number;

  createdAt: string;
};
```

Nunca criamos violations como `LOW_CONVERSION_POTENTIAL`,
`NOT_VIRAL_ENOUGH` ou `BAD_FOR_SALES` — isso fica fora da Skill 12.

### `CreativeQualityAssessment`

Sem score subjetivo único (nada de `creativeQualityScore = 8.7` na V1) —
dimensões verificáveis:

```typescript
type CreativeQualityAssessment = {
  // PATCH (Ponto M1) — antes 'YES' | 'NO' | 'UNCERTAIN' em todos os 5
  // campos; migrado pra EvidenceMatchJudgement (YES->MATCH,
  // NO->MISMATCH, UNCERTAIN->NOT_OBSERVABLE), mesmo julgamento de
  // match-com-expectativa de qualidade que o resto do SPEC já expressa.
  compositionCoherent: EvidenceMatchJudgement;
  motionCoherent: EvidenceMatchJudgement;
  subjectReadable: EvidenceMatchJudgement;
  visualContinuityAcceptable: EvidenceMatchJudgement;
  severeArtifactsAbsent: EvidenceMatchJudgement;
};
```

Isso é qualidade visual mínima para continuidade do pipeline, **não**
previsão comercial.

### `VideoAuditPolicy` / `VideoAuditPolicyBinding`

```typescript
type VideoAuditPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  requireTechnicalValidation: boolean;
  requireSemanticValidation: boolean;

  requireProductIdentityCheck: boolean;
  requireScriptComplianceCheck: boolean;
  requireCreativeDirectionCheck: boolean;

  spokenContentPolicy:
    | 'REQUIRED_WHEN_SCRIPTED'
    | 'OPTIONAL'
    | 'IGNORE';

  minimumEvidenceCoverage?: {
    minimumTimelineCoverage?: number;
    requireOpening?: boolean;
    requireEnding?: boolean;
    requireAllScriptBeats?: boolean;
  };

  confidencePolicy: {
    minimumConfidenceForViolation: number;
    minimumConfidenceForPositiveCompliance: number;
  };

  hardViolationCodes: VideoAuditViolationCode[];

  createdAt: string;
};

type VideoAuditPolicyBinding = {
  tenantId: string;
  policyKey: string;

  activePolicyId: string;
  activePolicyVersion: string;

  updatedAt: string;
};
```

Hash: `VIDEO_AUDIT_POLICY_V1`. Não inventamos thresholds reais agora —
estrutura sim, valores depois de validação real.

### Provider abstraction (duas abstrações separadas)

Como não há vídeo nativo:

```typescript
// Extractor determinístico
interface VideoEvidenceExtractor {
  inspectTechnical(artifact: VideoArtifact): Promise<TechnicalVideoEvidence>;

  extractFrames(
    artifact: VideoArtifact,
    plan: VideoSamplingPlan
  ): Promise<VideoFrameSample[]>;
}

// Semantic analyzer
interface VideoSemanticAnalysisProvider {
  analyze(
    input: VideoSemanticAnalysisInput
  ): Promise<VideoSemanticAnalysisProposal>;
}
```

O input do analyzer inclui frame samples exatos, product visual
references exatas, `ScriptResult`, `CreativeDirectionResult`,
policy/context — o provider **nunca** recebe "qualquer URL recente".

### Múltiplas imagens numa chamada — permitido, não obrigatório

O precedente do Concierge prova que o stack atual consegue mandar
múltiplas `image_url` em um content array — registramos
`MULTI_IMAGE_SINGLE_REQUEST → TECHNICALLY_PROVEN_IN_EXISTING_CODEBASE`.
Isso **não** prova que uma única chamada com 20 frames seja ideal,
econômica ou semanticamente confiável para vídeo — a policy/provider
pode futuramente escolher 1 chamada com N frames ou várias chamadas por
segmento, sem mudar o domínio.

### Checkpoint para análise paga (diferente da Skill 10)

Semantic analysis pode ser uma chamada paga externa — checkpoint volta a
existir aqui:

```typescript
type VideoSemanticAuditCheckpointState =
  | 'PREPARED'
  | 'SUBMITTING'
  | 'RESPONSE_CAPTURED'
  | 'VALIDATED'
  | 'REJECTED';
```

Granularidade: `UNIQUE lógico: (jobId, attemptNumber, analysisUnitKey)`
— `analysisUnitKey` pode ser `FULL_VISUAL_AUDIT_V1` inicialmente. Mesma
disciplina das Skills 07/08: `PREPARED` antes da rede → `SUBMITTING` →
resposta normalizada + hash → `RESPONSE_CAPTURED` → validação
determinística → `VALIDATED`/`REJECTED`. Se a chamada ficar ambígua e o
provider não tiver idempotência/reconcile → `EXTERNAL_STATE_UNKNOWN`,
sem chamar de novo cegamente.

### `VideoAuditResult` (output canônico)

```typescript
type VideoAuditResult = {
  videoAuditResultId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  videoArtifactId: string;
  videoContentHash: string;

  videoPromptArtifactId: string;
  videoPromptArtifactHash: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptResultId: string;
  scriptHash: string;

  productVisualReferenceSetRef: ProductVisualReferenceSetRef; // Ponto S2

  videoAuditPolicyId: string;
  videoAuditPolicyVersion: string;
  videoAuditPolicySnapshotHash: string;

  technicalEvidenceId: string;

  samplingPlanId: string;
  samplingPlanHash: string;

  frameSampleIds: string[];

  evidenceCoverage: VideoEvidenceCoverage;

  semanticObservationIds: string[];

  violations: VideoAuditViolation[];

  creativeQualityAssessment: CreativeQualityAssessment;

  verdict: VideoAuditVerdict;

  verdictReasons: string[];

  resultHash: string;

  createdAt: string;
};
```

Hash: `VIDEO_AUDIT_RESULT_V1`.

### Determinação do verdict

Determinística a partir da policy + evidências:

```text
hard violation comprovada → NON_COMPLIANT
evidência obrigatória insuficiente → INCONCLUSIVE
nenhuma violation impeditiva + toda cobertura obrigatória satisfeita
  → COMPLIANT
```

**Importante:** nenhuma violation encontrada ≠ automaticamente
`COMPLIANT` — pode simplesmente significar que não observamos o
suficiente.

### Relação com Skill 03 e Skill 13

A Skill 12 termina em `COMPLIANT`/`NON_COMPLIANT`/`INCONCLUSIVE` — ela
**não decide o próximo passo**. Consumidores: Skill 03 (ver mapeamento
normativo abaixo, Ponto S4), Skill 13 (usa violations concretas para
tentar correção), Skill 01 (decide roteamento conforme definição
futura). A Skill 12 não chama automaticamente a Skill 13 nem "aprova"
para publicação — ela nunca cria um segundo sistema de aprovação
próprio, só produz `VideoAuditResult` como evidência.

**PATCH (Ponto S4 — reparo transversal pós-revisão Fable, 2026-09-18).**
Achado do Fable: esta seção só apontava a Skill 03 como possível
consumidora, sem compromisso normativo — e a Skill 03 espelhava a
mesma incerteza do lado dela, condicionando o formato de suas
evidências a uma estruturação que a Skill 12 nunca tinha definido.
Corrigido dos dois lados. Normativo, sem "talvez":

```text
VideoAuditResult É uma fonte válida de ApprovalEvidenceKind.VIDEO_AUDIT
para ApprovalGateKey.VIDEO_COMPLIANCE, seguindo o mapeamento definido
pela Skill 03.
```

Mapeamento normativo `verdict` → `ApprovalEvidenceOutcome` (dono do
tipo é a Skill 03, ver `03-gestor-de-aprovacao/SPEC.md` → Ponto S4):

```text
VideoAuditResult.verdict = COMPLIANT     → SATISFIES_REQUIREMENT
VideoAuditResult.verdict = NON_COMPLIANT → VIOLATES_REQUIREMENT
VideoAuditResult.verdict = INCONCLUSIVE  → INSUFFICIENT_EVIDENCE
```

`INCONCLUSIVE` nunca vira `VIOLATES_REQUIREMENT` — o audit ocorreu
corretamente, só não conseguiu concluir; `NON_COMPLIANT` continua
permitindo `Job SUCCEEDED` normalmente (Ponto D intacto), e o adapter
ainda pode iniciar nova `StageIteration`/correção — a única mudança é
que, **se** aquele audit for usado como evidência de aprovação, ele
significa `VIOLATES_REQUIREMENT`.

**Subject exato:** o item de evidência que a Skill 03 monta a partir de
um `VideoAuditResult` aponta para o `VideoArtifact` exato auditado —
`videoArtifactId`+`videoContentHash` (que já é o par id+hash real de
`VideoArtifact.videoArtifactId`+`VideoArtifact.contentHash`, Skill 11).
`VideoAuditResult` é a evidência; o `VideoArtifact` é o subject
aprovado — nunca o inverso (ver "Por que `VIDEO_COMPLIANCE` aprova
`VideoArtifact`" na Skill 03).

## Status de implementação (nesta fase de especificação)

```text
Native video analysis provider    → NOT_IMPLEMENTED
Video frame extraction            → NOT_IMPLEMENTED
FFmpeg/equivalent                 → NOT_INSTALLED
Audio extraction                  → NOT_IMPLEMENTED
Audio transcription               → NOT_IMPLEMENTED
Video semantic audit tables       → NOT_IMPLEMENTED
Video audit workflow runtime      → NOT_IMPLEMENTED

OpenAI multi-image vision pattern → EXISTING / REUSABLE STRUCTURALLY
Confidence 0..1 pattern           → EXISTING / REUSABLE
Score+breakdown pattern           → EXISTING / REUSABLE STRUCTURALLY
concierge_visual_health           → LEGACY / DIFFERENT PURPOSE / NOT REUSED
```

## Idempotência

### Idempotência geral da Skill 12

A V1 produz no máximo um resultado canônico por Attempt:

```text
UNIQUE lógico: (jobId, attemptNumber) → 0..1 VideoAuditResult
```

A Skill 12 pode recalcular etapas locais determinísticas antes do
commit, mas nunca substitui um resultado já canônico. Fluxo: reabrir
upstreams exatos → validar tenant/hashes → congelar policy →
produzir/reabrir `TechnicalVideoEvidence` → produzir/reabrir
`VideoSamplingPlan` → produzir/reabrir `VideoFrameSample[]` → calcular
`VideoEvidenceCoverage` → executar/reabrir análise semântica → validar
observações → materializar violations → calcular verdict
deterministicamente → persistir `VideoAuditResult` + `AuditEvent`.
Replay compatível → retorna exatamente o mesmo result, nenhuma nova
chamada paga. Incompatível → `VIDEO_AUDIT_RESULT_REPLAY_CONFLICT`
(FATAL_ERROR + AuditEvent) — nunca sobrescreve.

### Idempotência da inspeção técnica

`TechnicalVideoEvidence` é única para a combinação factual `tenantId` +
`videoArtifactId` + `videoContentHash` + `inspectionToolKey` +
`inspectionToolVersion`. Se os bytes são os mesmos e a versão do
inspector é a mesma, a inspeção é reproduzível. Um inspector
diferente/versionado pode produzir nova evidência, mas jamais altera uma
evidência antiga — o `VideoAuditResult` referencia exatamente qual
evidência usou.

### Sampling determinístico

Mesmo `videoContentHash` + sampling policy snapshot + upstream
`ScriptResult` deve produzir o mesmo `VideoSamplingPlan`. Portanto,
`VIDEO_SAMPLING_PLAN_V1` não depende de `Date.now()`, `random()`, ordem
acidental de arrays ou estado externo. Se futuramente houver sampling
baseado em IA, deixa de ser transformação pura e exigirá
contrato/checkpoint próprio.

### Idempotência dos `VideoFrameSample`

Cada amostra é identificável por `videoArtifactId` + `samplingPlanId` +
`sampleKey`. V1: `UNIQUE lógico: (samplingPlanId, sampleKey)`. Replay
compatível → mesmo `sampleKey` → mesmo `actualTimestampMs` → mesmos
bytes → mesmo `contentHash`. Incompatível →
`VIDEO_FRAME_SAMPLE_REPLAY_CONFLICT` (FATAL_ERROR). Se a extração grava
o frame no Storage e depois o DB falha: blob órfão possível, não é
`VideoFrameSample` canônico, cleanup posterior (mesma disciplina das
Skills 09/11).

### Análise semântica paga — hashes

Mesma separação que funcionou em 07/08:

```text
VIDEO_SEMANTIC_AUDIT_CONTEXT_V1
→ valores efetivamente apresentados ao analyzer: videoContentHash,
  frameSampleIds+contentHash+actualTimestampMs (ordem determinística),
  productVisualReferenceSetRef + referências materializadas
  efetivamente mostradas, scriptResultId/hash,
  creativeDirectionResultId/hash, TechnicalVideoEvidence relevante,
  VideoEvidenceCoverage, VideoAuditPolicy snapshot comportamental,
  analysisUnitKey

VIDEO_SEMANTIC_AUDIT_PROVIDER_REQUEST_V1
→ semanticAuditContextHash, providerKey, modelKey,
  promptTemplateVersion, outputSchemaVersion, generation/inference
  parameters relevantes

VIDEO_SEMANTIC_AUDIT_PROVIDER_RESPONSE_V1
→ sobre a proposta semântica normalizada — não inclui requestId
  volátil, timestamp, latência, token IDs internos (salvo se
  semanticamente necessários)
```

### `VideoSemanticAuditCheckpoint`

```typescript
type VideoSemanticAuditCheckpoint = {
  videoSemanticAuditCheckpointId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  analysisUnitKey: string;

  videoArtifactId: string;
  videoContentHash: string;

  semanticAuditContextHash: string;
  providerRequestHash: string;

  providerKey: string;
  modelKey: string;

  providerRequestKey: string;

  state:
    | 'PREPARED'
    | 'SUBMITTING'
    | 'RESPONSE_CAPTURED'
    | 'VALIDATED'
    | 'REJECTED';

  providerRequestId?: string;
  providerResponseHash?: string;

  normalizedProposal?: VideoSemanticAnalysisProposal;

  rejectionCode?: string;

  createdAt: string;
  updatedAt: string;
};
```

Unicidade: `UNIQUE (jobId, attemptNumber, analysisUnitKey)`. Na V1,
`analysisUnitKey = FULL_VISUAL_AUDIT_V1` é suficiente, sem impedir
segmentação futura.

### Replay do checkpoint pago

```text
VALIDATED            → reutiliza observações persistidas, zero provider call
RESPONSE_CAPTURED    → valida proposta já capturada, zero provider call
REJECTED             → não chama provider de novo escondido, retorna
                        falha daquela Attempt
SUBMITTING ambíguo   → reconcile/idempotency quando o provider permitir,
                        senão EXTERNAL_STATE_UNKNOWN
```

Nunca "não achei response, então chama a visão de novo" se a primeira
chamada pode ter sido processada/cobrada.

### `REJECTED` (checkpoint) ≠ `NON_COMPLIANT` (verdict)

No checkpoint, `REJECTED` significa "a resposta do analyzer não passou
no contrato/schema/integridade" — **não** significa
`VideoAuditVerdict=NON_COMPLIANT`. Exemplo: modelo devolveu JSON quebrado
→ checkpoint `REJECTED`. Produto deformado no vídeo com evidência válida
→ checkpoint `VALIDATED` → observation `MISMATCH` → violation →
`NON_COMPLIANT`.

### Insuficiência de evidência não é erro

`NOT_OBSERVABLE` (Ponto M1 — unifica o antigo `UNCERTAIN`), coverage
insuficiente, áudio não disponível **não são erros técnicos** — entram
no resultado factual da auditoria e podem produzir `INCONCLUSIVE`. Não
devem virar retry infinito procurando uma resposta mais conveniente.

## Erros

### `FATAL_ERROR`

```text
VIDEO_AUDIT_TENANT_MISMATCH

VIDEO_AUDIT_VIDEO_ARTIFACT_NOT_FOUND
VIDEO_AUDIT_VIDEO_ARTIFACT_HASH_MISMATCH

VIDEO_AUDIT_PROMPT_ARTIFACT_MISMATCH
VIDEO_AUDIT_SCRIPT_MISMATCH
VIDEO_AUDIT_CREATIVE_DIRECTION_MISMATCH
VIDEO_AUDIT_REFERENCE_SET_MISMATCH

VIDEO_AUDIT_POLICY_NOT_FOUND
VIDEO_AUDIT_POLICY_BINDING_NOT_FOUND
INVALID_VIDEO_AUDIT_POLICY

VIDEO_SAMPLING_PLAN_CONFLICT
VIDEO_FRAME_SAMPLE_REPLAY_CONFLICT

VIDEO_SEMANTIC_CHECKPOINT_CONFLICT
VIDEO_SEMANTIC_PROVIDER_RESPONSE_INVALID

VIDEO_AUDIT_RESULT_REPLAY_CONFLICT

VIDEO_AUDIT_INVALID_VERDICT_DERIVATION
```

`VIDEO_AUDIT_INVALID_VERDICT_DERIVATION` detecta coisas impossíveis:
coverage obrigatória insuficiente + verdict `COMPLIANT`, ou hard
violation válida + verdict `COMPLIANT` — isso é bug de integridade, não
opinião.

### `RETRYABLE_ERROR`

Somente falhas operacionais transitórias:

```text
VIDEO_TECHNICAL_INSPECTION_TRANSIENT_ERROR

VIDEO_FRAME_EXTRACTION_TRANSIENT_ERROR
VIDEO_FRAME_STORAGE_TRANSIENT_ERROR

VIDEO_SEMANTIC_PROVIDER_TEMPORARILY_UNAVAILABLE
VIDEO_SEMANTIC_PROVIDER_REQUEST_TRANSIENT_ERROR

TRANSIENT_DATASTORE_ERROR
```

Mesma regra das outras Skills: `RETRYABLE_ERROR` não autoriza repetir
uma chamada paga cujo processamento externo esteja ambíguo. Pré-submit
confirmado → retry seguro. Pós-submit ambíguo → reconcile ou `BLOCKED`.

### `BLOCKED`

```text
VIDEO_SEMANTIC_ANALYSIS_EXTERNAL_STATE_UNKNOWN
→ JobStatus=BLOCKED, BlockReason=EXTERNAL_STATE_UNKNOWN
```

Exemplos: timeout após submit; crash pós-submit antes de persistir
resposta; provider sem idempotência/reconcile suficiente. **Não** existe
um `BLOCKED` para "evidência insuficiente" — isso é
`VideoAuditResult.verdict=INCONCLUSIVE`, e a pipeline/Skill 03 decide o
que fazer.

### Resultado técnico inválido vs. falha do inspector

Inspector rodou corretamente e determinou que o container está
corrompido → `TechnicalVideoEvidence` válido → violation
`TECHNICAL_CORRUPTION_DETECTED` → possivelmente `NON_COMPLIANT`.
Diferente de: processo do inspector caiu, arquivo não pôde ser lido por
erro transitório de infra → `VIDEO_TECHNICAL_INSPECTION_TRANSIENT_ERROR`.
Não confundir "vídeo ruim" com "não consegui inspecionar o vídeo".

## Fronteira com custo/quota (Skill 23)

A análise semântica pode gerar custo. Antes da chamada paga: `Skill02
Attempt válida → Skill23/QuotaGuard → autorização aplicável → checkpoint
PREPARED → SUBMITTING → rede`. A Skill 12 não calcula saldo, não define
orçamento, não faz cobrança — apenas respeita autorização. Uma análise
local determinística (metadata, frame extraction local, hash, coverage)
não consome quota de inferência apenas por existir.

## Multi-tenant

Fonte: `trustedTenantId = Job.tenantId`. Precisam corresponder:
`VideoAuditInput`, `VideoArtifact`, `VideoPromptArtifact`,
`ScriptResult`, `CreativeDirectionResult`, `ProductVisualReferenceSet`,
`MaterializedVisualReference`, `TechnicalVideoEvidence`,
`VideoSamplingPlan`, `VideoFrameSample`, `VideoAuditPolicyBinding`,
`VideoAuditPolicy`, `VideoSemanticAuditCheckpoint`,
`VideoSemanticObservation`, `VideoAuditResult`, provider
credential/config quando aplicável. Divergência →
`VIDEO_AUDIT_TENANT_MISMATCH` (FATAL_ERROR + AuditEvent de segurança).

**Nenhum compartilhamento cross-tenant:** mesmo `videoContentHash`
igual, frame sample `contentHash` igual, ou `semanticAuditContextHash`
igual não autoriza reutilizar `VideoAuditResult` de outro tenant,
reutilizar checkpoint pago, ou compartilhar `storageRef`. V1 permanece
isolada — código do analyzer/inspector pode ser global; dados/resultados
não.

**Product references compartilhadas:** a imagem de catálogo pode se
originar de estrutura compartilhada, mas o uso daquela referência dentro
de uma auditoria — checkpoint, samples, observations, violations,
result — é tenant-scoped.

**Secrets e URLs:** nunca persistir/logar `OPENAI_API_KEY`,
`Authorization`, tokens, credenciais completas. `storageRef` interno
pode ser persistido; URLs assinadas temporárias são tratadas como
efêmeras e nunca usadas como identidade de evidência — identidade é
sempre `contentHash`.

## Observabilidade

### Logs (por execução)

`tenantId`, `runId`, `jobId`, `attemptNumber`, `videoArtifactId`,
`videoContentHash`, `videoAuditPolicyId`, `videoAuditPolicyVersion`,
`technicalEvidenceId`, `samplingPlanId`, `samplingPlanHash`,
`requestedSampleCount`, `extractedSampleCount`, `timelineCoverage`,
`semanticProviderKey?`, `semanticModelKey?`, `analysisUnitKey?`,
`semanticAuditContextHash?`, `providerRequestHash?`,
`providerResponseHash?`, `observationCount`, `violationCount`,
`hardViolationCount`, `majorViolationCount`, `minorViolationCount`,
`verdict`, `durationMs`, `errorCode?`. Não loga imagens/base64 nem
resposta completa do modelo.

### Métricas

```text
Técnicas:
video_audit_total
video_audit_compliant_total
video_audit_non_compliant_total
video_audit_inconclusive_total
video_technical_invalid_total
video_frame_extraction_total
video_frame_extraction_failure_total
video_audit_timeline_coverage
video_semantic_analysis_total
video_semantic_analysis_validated_total
video_semantic_analysis_rejected_total
video_semantic_external_state_unknown_total
video_audit_violation_total (labels: violationCode, severity — sem IDs)

Permitidas (observabilidade):
product_identity_mismatch_rate
script_action_mismatch_rate
visual_continuity_break_rate
severe_generation_artifact_rate
audit_inconclusive_rate
```

**Proibido na Skill 12:** `conversion_probability`, `viral_score`,
`expected_sales`, `creative_ROI`.

### `AuditEvent`

Criado para: `TechnicalVideoEvidence` concluída com invalidade técnica
importante; checkpoint semântico `PREPARED→SUBMITTING`,
`SUBMITTING→RESPONSE_CAPTURED`, `RESPONSE_CAPTURED→VALIDATED/REJECTED`;
external state unknown; `VideoAuditResult` criado; tenant mismatch;
replay conflict; verdict derivation integrity failure. Não precisa
`AuditEvent` para cada `VideoFrameSample` individual — isso viraria
ruído (o sampling plan/result já referencia o conjunto).

## Plano de testes

**Upstreams e autoridade:** (1) `VideoArtifact` inexistente → fatal. (2)
`videoContentHash` divergente → fatal. (3) `VideoPromptArtifact`
divergente → fatal. (4) Script divergente → fatal. (5) CreativeDirection
divergente → fatal. (6) `ProductVisualReferenceSet` divergente → fatal.
(7) tenant divergente em qualquer upstream → fatal.

**Technical inspection:** (8) vídeo válido produz
`TechnicalVideoEvidence`. (9) container corrompido detectado
corretamente vira evidência, não exception de infra. (10) ausência de
video stream produz violation técnica. (11) inspector falha
transitoriamente → retryable. (12) mesma versão do inspector + mesmos
bytes → evidência reproduzível.

**Sampling:** (13) policy igual + vídeo igual → mesmo
`samplingPlanHash`. (14) sampling não depende de random/time. (15)
`sampleKey` duplicada inválida. (16) frame extraído registra requested e
actual timestamp. (17) frame sample `contentHash` corresponde aos
bytes. (18) replay do mesmo sample retorna mesmo artifact. (19) mesmo
sample key + conteúdo diferente → replay conflict. (20) blob de frame
salvo + DB falha → órfão, não sample canônico.

**Coverage:** (21) opening ausente quando policy exige → coverage
insuficiente. (22) ending ausente quando obrigatório → insuficiente.
(23) beat obrigatório não coberto → insuficiente. (24) ausência de
coverage suficiente nunca produz `COMPLIANT`. (25) coverage 0..1 respeita
limites.

**Áudio:** (26) script sem fala + áudio indisponível quando não
requerido → permitido. (27) script exige fala + áudio indisponível →
`SPOKEN_CONTENT NOT_EVALUATED`. (28) policy exige spoken compliance +
áudio indisponível → `INCONCLUSIVE`. (29) ausência de áudio nunca vira
PASS implícito.

**Produto:** (30) cor comprovadamente diferente → observation
`MISMATCH`. (31) elemento estrutural inventado → observation +
violation. (32) região não observável → `NOT_OBSERVABLE`, não `MATCH`.
(33) `FrameArtifact` da Skill 09 nunca substitui
`ProductVisualReferenceSet` como base factual.

**Script/direção:** (34) ação obrigatória ausente → violation. (35) ação
diferente mas semanticamente compatível, conforme policy/basis, não gera
violation falsa. (36) texto visual não autorizado → violation. (37)
direção criativa incompatível → violation. (38) observação sem
basis/evidence válidos é rejeitada.

**Creative quality:** (39) artefato visual severo → violation. (40)
motion coherence incerta → `NOT_OBSERVABLE` (Ponto M1 — antes
`UNCERTAIN`), não inventa `MISMATCH` (antes `NO`). (41) creative
quality nunca produz prediction comercial.

**Confidence:** (42) confidence fora de `[0,1]` → provider response
inválida. (43) alta confidence sem evidência/basis → rejeita. (44) baixa
confidence abaixo do threshold de violation → não materializa hard
violation automaticamente. (45) ausência de violation por baixa
confiança não implica `COMPLIANT`.

**Checkpoint pago:** (46) `PREPARED` existe antes da rede. (47)
`RESPONSE_CAPTURED` replay → zero nova chamada paga. (48) `VALIDATED`
replay → zero nova chamada. (49) `SUBMITTING` ambíguo sem reconcile →
`BLOCKED`/`EXTERNAL_STATE_UNKNOWN`. (50) resposta schema-invalid →
checkpoint `REJECTED`, não `NON_COMPLIANT`.

**Integridade do verdict:** `REJECTED` do checkpoint jamais vira verdict
de vídeo; hard violation válida → `NON_COMPLIANT`; evidência obrigatória
insuficiente → `INCONCLUSIVE`; sem hard violation + toda cobertura
obrigatória satisfeita → `COMPLIANT` conforme policy; hard violation +
`COMPLIANT` tentado → `VIDEO_AUDIT_INVALID_VERDICT_DERIVATION`; coverage
insuficiente + `COMPLIANT` tentado → mesmo erro de integridade; replay de
`VideoAuditResult` compatível retorna mesmo result/hash; replay
incompatível → conflict; dois tenants com mesmos bytes continuam com
resultados isolados; analyzer recebe apenas frames/referências
explicitamente pertencentes ao contexto congelado.

**Testes futuros de integração** (quando runtime existir): vídeo real →
inspector → sampling → frames persistidos → análise multi-image →
response capturada → process restart → validação continua →
observations → violations → verdict. Também testar interrupção após
extração, após storage de samples, após `SUBMITTING`, após
`RESPONSE_CAPTURED`, antes do commit de `VideoAuditResult` — provando
que nenhuma delas duplica chamada paga nem muda o verdict de forma não
determinística.

**Teste específico do precedente do Concierge:** `ProductVisualReference`
+ N `VideoFrameSample` → uma chamada estruturada com múltiplas
`image_url` → ordem determinística → identidade de cada imagem
preservada no contexto. Sem assumir que esse será o batching final da
produção.

**Ponto S2:** `VideoAuditInput` sempre recebe
`productVisualReferenceSetRef`, mesmo quando `content.kind='EMPTY'`.
`content.kind='EMPTY'/'NO_FRAME_REQUIRED'` ou `'TEXT_TO_VIDEO'` não gera
`ProductIdentityCheck` de violação (nada a comparar).
`content.kind='EMPTY'/'REFERENCE_UNAVAILABLE'` é evidência distinta de
"nenhuma comparação necessária" — tratamento exato fica pro Ponto S4.

**Ponto S4 (mapeamento normativo pra Skill 03):**

- `verdict=COMPLIANT` mapeado pela Skill 03 como
  `SATISFIES_REQUIREMENT`.
- `verdict=NON_COMPLIANT` mapeado como `VIOLATES_REQUIREMENT`.
- `verdict=INCONCLUSIVE` mapeado como `INSUFFICIENT_EVIDENCE`, nunca
  `VIOLATES_REQUIREMENT`.
- `videoArtifactId`+`videoContentHash` do `VideoAuditResult` sempre
  identifica o `VideoArtifact` exato auditado (mesmo par que a Skill 03
  usa como subject do gate `VIDEO_COMPLIANCE`).
- `NON_COMPLIANT` não impede `JobExecutionResult=SUCCEEDED`.

## Fechamento conceitual

1. Ausência de evidência nunca é evidência de conformidade.
2. A IA produz observações; a policy determinística produz violations e
   verdict.
3. Um frame extraído ou gerado mostra o que apareceu no pipeline, mas
   nunca cria nova verdade factual sobre o produto.
4. `COMPLIANT` significa apenas que os requisitos auditados pela policy
   foram satisfeitos com evidência suficiente; não significa aprovação
   humana, autorização de publicação nem previsão de performance.
