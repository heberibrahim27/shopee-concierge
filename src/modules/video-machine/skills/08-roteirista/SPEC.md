# Skill 08 — Roteirista

> **APROVADA EM ESPECIFICAÇÃO — 8/25** (2026-09-18). Especificação/contrato.
> **Sem implementação ainda** — nenhuma migration, tabela, RPC, worker ou
> cron foi criado. Este arquivo só vira código depois da revisão do Claude
> Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code. Assim como
> a Skill 07, não existe lógica de roteiro/copy real no repositório hoje
> (confirmado pela auditoria da Skill 07) — contrato desenhado sem herdar
> suposições antigas nunca testadas em produção (ex.: duração "8-15s").

## Garantia central

Transformar um `CreativeDirectionResult` **exato e aprovado** em um
roteiro textual estruturado para o vídeo, preservando a direção criativa,
a keyword operacional e a proveniência factual — sem alterar estratégia,
inventar fatos ou gerar mídia.

## Fluxo

```
Skill07 → CreativeDirectionResult + creativeDirectionHash
Skill08 → ScriptResult
Skill09/10 → usam o ScriptResult para frame/prompt de vídeo
Skill14 → usa textos aprovados para renderização/subtítulos/CTA visual
```

## O que a Skill 08 pode decidir

Texto concreto: `hookText`, `spokenLines`, `onScreenText`, `ctaText`,
`sceneIntent` textual, timing textual aproximado.

Exemplo: `hookStrategy = PAIN_POINT` (definido pela Skill 07) → Skill 08
pode escrever "Seu pescoço fica travado depois de horas no computador?"

**Mas nunca pode trocar a estratégia recebida** — trocar `PAIN_POINT` por
`CURIOSITY`, `COMMENT_KEYWORD` por `DIRECT_LINK`, `QUERO` por `LINK`, ou
`DEMONSTRATION` por `POV` exigiria uma **nova direção criativa**, nunca
"liberdade de roteiro".

## Não é responsabilidade

- Gerar imagem/frame — Skill 09. Gerar prompt de vídeo (Veo) — Skill 10.
  Executar geração de vídeo — Skill 11. Avaliar vídeo produzido —
  Skill 12. Corrigir/regenerar vídeo — Skill 13. Renderizar vídeo/
  subtítulos/capa — Skill 14. Gerar link afiliado — Skill 15. Executar
  comentário/DM — Skill 16. Publicar — Skill 17.
- Escrever a **caption final de publicação** — deliberadamente fora de
  escopo ainda; fica para quando as Skills 14/17 forem definidas (ali
  entram diferenças de canal, hashtags, links e assets finais). Evita
  transformar "Roteirista" num saco de todo texto do sistema.
- Gerar variantes de roteiro (A/B/C) — Skill 20 (Gerador de Variações),
  ainda não especificada. A Skill 08 produz **um** `ScriptResult` canônico
  por `JobAttempt`, nunca múltiplos internamente — evita duplicar uma
  responsabilidade futura antes da hora.

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


> ### Regra compartilhada de replay/materialização de resultado
>
> Este SPEC segue `RESULT_MATERIALIZATION_V1`, definido em
> `src/modules/video-machine/contracts/RESULT-MATERIALIZATION.md`
> (S14 do reparo pós-revisão Fable, 2026-09-18). Se um artifact de
> resultado válido já existe para a identidade exata
> tenant/job/attempt/input, ele DEVE ser reutilizado e o produtor NÃO
> DEVE ser executado de novo. `*_RESULT_REPLAY_CONFLICT` identifica
> uma colisão real de identidade imutável/provenance persistida — NÃO
> DEVE ser detectado recalculando a operação e comparando o valor
> recém-produzido com o resultado materializado. Mudanças em fontes
> externas mutáveis ou outputs de modelo não-determinísticos não são
> replay conflicts.


```ts
// CreativeMode, CreativeArchetypeV1, HookStrategyV1, NarrativeStructureV1,
// VisualApproachV1, CreativeCtaIntent, CreativeSubjectFactsSnapshot —
// tipos COMPARTILHADOS, definidos no SPEC.md da Skill 07 (não
// redefinidos aqui). ObservedTrendMetric — compartilhado da Skill 06.

type ScriptGenerationInput = {
  tenantId: string;
  runId: string;

  creativeDirectionResultId: string;
  creativeDirectionHash: string; // EXATO, não só o ID — mesmo princípio
    // de reprodutibilidade desde o patch StageSubjectBinding na Skill 01

  scriptPolicyKey: string;
};

// Validações (FATAL_ERROR, nenhum ScriptResult fabricado):
//   CreativeDirectionResult não existe                       -> SCRIPT_CREATIVE_DIRECTION_NOT_FOUND
//   resultStatus != OK (ex.: NO_APPLICABLE_DIRECTION)         -> nunca chega à Skill08
//   tenant/run incompatíveis                                  -> FATAL_ERROR
//   creativeDirectionHash não confere EXATAMENTE               -> SCRIPT_CREATIVE_DIRECTION_MISMATCH

type ScriptCreativeConstraints = {
  creativeMode: CreativeMode;

  archetype: CreativeArchetypeV1;
  hookStrategy: HookStrategyV1;
  narrativeStructure: NarrativeStructureV1;
  visualApproach: VisualApproachV1;

  ctaIntent: CreativeCtaIntent;
};
// Snapshot derivado DIRETAMENTE do CreativeDirectionResult. A Skill08
// NÃO tem permissão de alterar nenhum destes campos — trava estrutural,
// não só regra de processo. NÃO existe operação rewriteCreativeConstraints().
// Se o provider propuser archetype/hook/CTA/keyword diferente, a
// PROPOSTA é inválida (ver "Erros" abaixo).

type ScriptStatementKind =
  | "FACTUAL_CLAIM"       // ex.: "Esse massageador custa R$ 39,90."
  | "CREATIVE_EXPRESSION" // ex.: "Olha isso."
  | "CTA"                 // ex.: "Comenta QUERO que eu te mando o link."
  | "TRANSITION";

type ScriptFactBasis =
  | { type: "PRODUCT_FACT"; subjectFactsHash: string; fieldPath: string }
  | { type: "OFFER_FACT"; offerAnalysisResultId: string; sourceOfferSnapshotId: string; fieldPath: string }
  | { type: "TREND_EVIDENCE"; evidenceId: string; evidenceHash: string; fieldPath?: string };
// MESMO padrão de CreativeDecisionBasis da Skill07 — cada tipo carrega o
// ponteiro de proveniência real, aplicado agora ao texto final.
// MODEL_INFERENCE NUNCA aparece em ScriptFactBasis — o modelo pode
// escrever linguagem, nunca ser fonte de fatos.

type ScriptStatement = {
  statementId: string;
  kind: ScriptStatementKind;
  text: string;
  factBasis?: ScriptFactBasis[];
};
// Invariantes:
//   FACTUAL_CLAIM               -> factBasis OBRIGATÓRIO, length >= 1
//   CREATIVE_EXPRESSION/TRANSITION -> factBasis AUSENTE
//   CTA                         -> factBasis AUSENTE (validade vem do
//     CreativeCtaIntent autoritativo, não de fato comercial)

type ScriptVisualIntent = {
  text: string; // O QUE precisa acontecer, NUNCA como instruir o gerador
    // — ex. permitido: "mostrar o produto sendo usado no pescoço em
    // ambiente doméstico". Exemplo que já invade a Skill10: "cinematic
    // 35mm lens, warm tungsten lighting, camera slowly dolly-in, Veo
    // 3...". Skill08 define O QUE acontece; Skill10 define COMO
    // instruir o gerador de vídeo.
  factBasis?: ScriptFactBasis[]; // uma alegação TAMBÉM pode ser visual:
    // "mostrar o display marcando 50%" só pode ser usado se houver base
    // canônica que sustente aquele valor; "mostrar a pessoa usando o
    // produto em casa" é intenção criativa, sem factBasis necessário.
};

type ScriptBeatPurposeV1 =
  | "HOOK" | "SETUP" | "PROBLEM" | "DEMONSTRATION" | "BENEFIT"
  | "TRANSITION" | "CTA";

type ScriptBeat = {
  beatIndex: number; // inteiro >= 0, sequência contínua 0..N-1, sem duplicatas
  purpose: ScriptBeatPurposeV1;
  spokenText?: ScriptStatement;
  onScreenText?: ScriptStatement;
  visualIntent: ScriptVisualIntent;
  targetDurationSeconds?: number; // finito, > 0, quando presente
};
// Estrutura em beats (não texto linear/parágrafo único) — Skill09/10
// precisam saber o que deve acontecer visualmente em cada trecho para
// consumir o roteiro de forma mecânica. Invariante: pelo menos um entre
// spokenText/onScreenText/visualIntent.text precisa ter conteúdo real.

type ScriptFactualClaimRulesV1 = {
  requireCanonicalBasis: true;

  allowProductAttributeClaims: boolean;
  allowCurrentPriceClaims: boolean;
  allowAdvertisedDiscountClaims: boolean;
  allowSalesVolumeClaims: boolean;
  allowRatingClaims: boolean;
  allowTrendClaims: boolean; // só com TrendEvidence real

  allowScarcityClaims: boolean;       // ex.: "últimas unidades"
  allowSuperlativeClaims: boolean;    // ex.: "o melhor do mercado"
  allowComparativeClaims: boolean;    // ex.: "o mais barato"
  allowMedicalOrTherapeuticClaims: boolean; // ex.: "cura sua dor"
};
// Policy inicial recomendada (conservadora desde a V1, dado que são
// produtos de afiliado sem controle de qualidade nosso): product
// attributes/current price/advertised discount/sales/rating -> true (com
// basis); trend -> true (só com TrendEvidence); scarcity/superlative/
// comparative/medical -> false. Frases como "últimas unidades"/"o melhor
// do mercado"/"cura sua dor" simplesmente NÃO entram na V1, mesmo que um
// LLM as escreva — são rejeitadas pelo validator, não pela sorte do prompt.

type ScriptPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  scriptTaxonomyVersion: "SCRIPT_TAXONOMY_V1";

  locale: string;

  allowedBeatPurposes: ScriptBeatPurposeV1[];
  maxBeatCount: number;

  allowSpokenText: boolean;
  allowOnScreenText: boolean;

  requireHook: boolean;
  requireCta: boolean;

  durationConstraint?: { minSeconds: number; maxSeconds: number }; // OPCIONAL —
    // deliberadamente NÃO congela "8-15s" como default só porque isso
    // apareceu como ideia antiga; a auditoria mostrou que nunca foi
    // runtime real. Decisão de produto consciente, adiada.

  factualClaimRules: ScriptFactualClaimRulesV1;

  createdAt: string;
};
// Imutável por (policyId, policyVersion). policySnapshotHash:
// "SCRIPT_POLICY_V1:sha256:<hex>" sobre todos os campos comportamentais.

type ScriptPolicyBinding = {
  tenantId: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
};

// FactualClaimValidator — recebe um catálogo FECHADO de fatos canônicos:
type ScriptFactCatalog = {
  subjectFactsHash: string;
  productFacts: Record<string, unknown>;

  offerAnalysisResultId: string;
  sourceOfferSnapshotId: string;
  offerFacts: Record<string, unknown>;

  trendEvidence: Array<{
    evidenceId: string;
    evidenceHash: string;
    observedMetrics: ObservedTrendMetric[];
  }>;
};

interface FactualClaimValidator {
  validateStatement(statement: ScriptStatement, factCatalog: ScriptFactCatalog, rules: ScriptFactualClaimRulesV1): ScriptClaimValidationResult;
  validateVisualIntent(visualIntent: ScriptVisualIntent, factCatalog: ScriptFactCatalog, rules: ScriptFactualClaimRulesV1): ScriptClaimValidationResult;
}

type ScriptClaimValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "FACT_BASIS_REQUIRED" | "FACT_BASIS_NOT_FOUND"
        | "FACT_BASIS_TENANT_MISMATCH" | "FACT_BASIS_SUBJECT_MISMATCH"
        | "FACT_VALUE_MISMATCH" | "TREND_EVIDENCE_NOT_APPLICABLE"
        | "CLAIM_CLASS_NOT_ALLOWED" | "UNSUPPORTED_FACTUAL_ASSERTION";
    };
// REGRA CENTRAL: referência existente não basta — ela precisa SUSTENTAR
// SEMANTICAMENTE a alegação realmente feita. Exemplo: basis diz
// price_min=R$39,90, claim diz "É o mais barato do Brasil" -> INVÁLIDO
// (UNSUPPORTED_FACTUAL_ASSERTION). O valor existe, mas não prova o
// superlativo. Fecha o buraco clássico de "o LLM citou um campo
// verdadeiro para justificar uma frase falsa".

// CTA canônico: se ctaIntent = {mechanism: COMMENT_KEYWORD, keyword:
// "QUERO", ...}, pelo menos um ScriptStatement CTA precisa conter
// LITERALMENTE a keyword exibível — exatamente o token configurado,
// linguagem natural livre ao redor. "Quer o link? Comenta QUERO." é
// válido; "Comenta LINK." é inválido. IMPORTANTE: "Comenta EU QUERO."
// NÃO é automaticamente inválido só por ter palavra a mais — o token
// "QUERO" está presente, não foi substituído. O que nunca pode
// acontecer é a SUBSTITUIÇÃO do token operacional.

// ScriptProviderProposal — deliberadamente mais fraca que o resultado
// canônico, mesmo padrão da Skill07:
type ScriptProviderFactReference = {
  type: "PRODUCT_FACT" | "OFFER_FACT" | "TREND_EVIDENCE";
  fieldPath?: string;
  evidenceId?: string;
};
type ScriptProviderStatementProposal = {
  text: string;
  proposedKind: ScriptStatementKind;
  referencedFacts: ScriptProviderFactReference[];
};
type ScriptProviderVisualIntentProposal = {
  text: string;
  referencedFacts: ScriptProviderFactReference[];
};
type ScriptProviderBeatProposal = {
  beatIndex: number;
  purpose: ScriptBeatPurposeV1;
  spokenText?: ScriptProviderStatementProposal;
  onScreenText?: ScriptProviderStatementProposal;
  visualIntent: ScriptProviderVisualIntentProposal;
  targetDurationSeconds?: number;
};
type ScriptProviderProposal = { beats: ScriptProviderBeatProposal[] };
// O provider NÃO produz: ScriptFactBasis canônico, creativeConstraints,
// creativeDirectionHash, scriptPolicySnapshotHash, scriptHash. Ele só
// SUGERE referências — a Skill08 reabre cada fonte real antes de
// materializar ScriptFactBasis. O provider também NÃO escolhe CTA
// operacional (mechanism/keyword/purpose são constraints do request,
// não escolha do provider) — resposta com keyword diferente é output
// inválido.

type ScriptGenerationContext = {
  creativeDirectionResultId: string;
  creativeDirectionHash: string;
  creativeConstraints: ScriptCreativeConstraints;
  subjectFactsSnapshot: CreativeSubjectFactsSnapshot;
  factCatalog: ScriptFactCatalog;
  locale: string;
  scriptPolicyId: string;
  scriptPolicyVersion: string;
  scriptPolicySnapshotHash: string;
};
// generationContextHash: "SCRIPT_GENERATION_CONTEXT_V1:sha256:<hex>" —
// sobre os VALORES efetivamente disponibilizados ao roteirista, não só IDs.

// MESMA correção aplicada na Skill07: dois hashes distintos, não um só.
//   providerRequestHash: "SCRIPT_PROVIDER_REQUEST_V1:sha256:<hex>" —
//     sobre generationContextHash + providerKey + modelKey +
//     promptTemplateVersion + outputSchemaVersion + generationParameters
//     relevantes. Distingue "mudou o dado?" de "mudou o prompt/modelo?".
//   providerResponseHash: "SCRIPT_PROVIDER_RESPONSE_V1:sha256:<hex>" —
//     sobre a proposta normalizada; exclui providerRequestId, timestamp
//     do fornecedor, token counts, latência, IDs voláteis.

// Materialização canônica do roteiro (proposal -> validação -> ScriptBeat[]),
// ordenação obrigatória ANTES de qualquer hash:
//   beats                -> ordenados por beatIndex ASC
//   spokenText/onScreenText -> posição estrutural fixa
//   factBasis[]           -> ordenados por (type + identificador de
//     origem + fieldPath): PRODUCT_FACT -> subjectFactsHash+fieldPath;
//     OFFER_FACT -> offerAnalysisResultId+sourceOfferSnapshotId+fieldPath;
//     TREND_EVIDENCE -> evidenceId+evidenceHash+fieldPath

type ScriptInferenceProvenance = {
  inferenceMode: "POLICY_ONLY" | "MODEL_ASSISTED"; // expectativa: quase
    // todo roteiro real será MODEL_ASSISTED — aqui, diferente da
    // Skill07, estamos finalmente escrevendo linguagem natural
  inferenceCheckpointId?: string;
  providerKey?: string;
  modelKey?: string;
  generationContextHash: string;
  providerRequestHash?: string;
  providerResponseHash?: string;
};

type ScriptResult = {
  resultId: string;
  resultStatus: "OK"; // V1 só tem sucesso canônico — ver "Idempotência" abaixo

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  locale: string;
  creativeConstraints: ScriptCreativeConstraints;

  beats: ScriptBeat[]; // PATCH (Ponto S6, reparo transversal pós-revisão
    // Fable, 2026-09-18): array permanece — não vira singular — mas
    // VIDEO_COMPOSITION_V1 (src/modules/video-machine/contracts/VIDEO-COMPOSITION.md)
    // exige beats.length === 1 para qualquer ScriptResult elegível ao
    // pipeline produtivo V1 (o único beat usa beatIndex === 0). Isso
    // preserva o desenho futuro multi-beat (V2) sem prometer uma
    // capacidade que as Skills 10/11/12/13/14/17 não implementam hoje.
    // Skill 08 pode reparar internamente antes de materializar, mas um
    // ScriptResult válido materializado nunca tem >1 beat.

  estimatedDurationSeconds?: number; // INFORMATIVO — se durationConstraint
    // existir na policy, precisa respeitá-la; se não existir, a
    // estimativa nunca vira regra de negócio implícita

  scriptPolicyId: string;
  scriptPolicyVersion: string;
  scriptPolicySnapshotHash: string;

  generationContextHash: string;

  scriptHash: string; // "SCRIPT_V1:sha256:<hex>" — sobre JSON canônico
    // de: creativeDirectionResultId, creativeDirectionHash, locale,
    // creativeConstraints, beats (normalizados). NUNCA inclui resultId/
    // jobId/attemptNumber/createdAt/providerRequestId (identidade
    // operacional). TAMBÉM não inclui inferenceProvenance inteiro —
    // separa deliberadamente "o roteiro é o mesmo?" de "como ele foi
    // produzido?"; a proveniência continua auditável por seus próprios
    // hashes, sem contaminar a identidade de conteúdo do roteiro.

  inferenceProvenance: ScriptInferenceProvenance;

  createdAt: string;
};
```

## Duas regras de integridade (congeladas literalmente)

**Integridade estratégica** (Skill 07 ↔ Skill 08): a Skill 08 pode
expressar linguisticamente uma direção criativa, mas **não pode
reinterpretá-la**. Qualquer mudança de `archetype`, `hookStrategy`,
`narrativeStructure`, `visualApproach`, `ctaIntent.mechanism`,
`ctaIntent.keyword` ou `ctaIntent.purpose` exige uma **nova**
`CreativeDirectionResult` — nunca é tratada como simples revisão de
roteiro.

**Integridade factual**: nenhuma afirmação produzida pelo modelo
torna-se fato por ter sido escrita no roteiro. `ScriptFactBasis` só pode
ser criado **depois** da Skill 08 reabrir e validar uma fonte canônica já
existente. Uma referência real que **não sustente semanticamente** a
alegação também não é suficiente — fecha o buraco clássico de "o LLM
citou um campo verdadeiro para justificar uma frase falsa".

## Escopo factual herdado da Skill 07 — nunca ampliado

A Skill 08 **não pode ampliar** a base de tendência recebida. O
`ScriptFactCatalog.trendEvidence` é construído estritamente a partir de
`CreativeDirectionResult.trendEvidenceRefsUsed`:

```
creativeMode = EVERGREEN
  -> ScriptFactCatalog.trendEvidence = []  (vazio, sempre)

creativeMode = TREND_INFORMED
  -> ScriptFactCatalog.trendEvidence contém SOMENTE os evidenceIds
     presentes em CreativeDirectionResult.trendEvidenceRefsUsed
```

Mesmo que o `TrendResearchResult` original tenha outras dezenas de
evidências, a Skill 08 **não pode recuperá-las autonomamente** — Skill 07
decide quais trends fundamentam a direção, Skill 08 expressa essa
direção, nunca reabre a pesquisa criativa. Usar um `evidenceId` real mas
não presente em `trendEvidenceRefsUsed` → `SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION`
(ser real não significa estar autorizado naquele roteiro).

## Provider — mesma filosofia da Skill 07

Provider escreve proposta, Skill 08 valida; provider não cria fatos, não
decide proveniência, não pode mudar a `CreativeDirection` recebida.

```ts
interface ScriptGenerationProvider {
  getCapabilities(): Promise<ScriptGenerationProviderCapabilities>;
  generateScript(request: ScriptProviderRequest): Promise<ScriptProviderResponse>;
}

type ScriptGenerationProviderCapabilities = {
  providerKey: string;
  implementationStatus: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  runtimeAvailability: "AVAILABLE" | "CONDITIONALLY_AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  supportsStructuredOutput: boolean;
  supportedLocales: string[];
  providerVersion?: string;
  checkedAt: string;
};
```

Invariante: provider selecionado para `MODEL_ASSISTED` precisa ser
`IMPLEMENTED` + `AVAILABLE` + suportar o `locale` da `ScriptPolicy` +
suportar o `structured output` exigido pela V1. A ausência dessas
capacidades **não é corrigida degradando silenciosamente** o contrato de
saída para texto livre — vira `SCRIPT_PROVIDER_CAPABILITY_UNSUPPORTED`.

**Um provider por `JobAttempt`, mesmo princípio da Skill 07**: 1
`JobAttempt` → no máximo 1 provider/model escolhido → nenhuma cascata
escondida de fallback pago (nunca "OpenAI falhou → tenta Claude → tenta
Gemini → três cobranças dentro da mesma Attempt"). Troca de provider
exige nova tentativa/política explicitamente controlada pelo sistema de
Jobs/Integrações. A única exceção não é "fallback": é reconciliação
segura da mesma chamada, usando a mesma identidade de request quando o
provider permitir.

**Quota/custo antes da chamada**: `Skill02 → QuotaGuard → resolve
provider/configuração autorizada → só então Skill08 prepara a
inferência`. A Skill 08 não debita saldo nem decide franquia — produz
metadados suficientes para contabilização posterior (`providerKey`,
`modelKey`, `providerRequestId?`, usage metadata quando disponível), mas
custo/quota pertencem às Skills 02/23. Nenhum retry pago interno
automático.

## Idempotência e operação

```ts
type ScriptInferenceCheckpoint = {
  inferenceCheckpointId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  creativeDirectionResultId: string;
  creativeDirectionHash: string;

  scriptPolicyId: string;
  scriptPolicyVersion: string;

  providerKey: string;
  modelKey: string;

  generationContextHash: string;
  providerRequestHash: string;
  providerRequestKey: string;

  state: "PREPARED" | "SUBMITTING" | "RESPONSE_CAPTURED" | "VALIDATED" | "REJECTED";

  providerRequestId?: string;
  providerResponseHash?: string;
  normalizedProposal?: ScriptProviderProposal;

  rejectionCode?: string;

  createdAt: string;
  updatedAt: string;
};
```

`UNIQUE` lógico `(jobId, attemptNumber)` → no máximo 1
`ScriptInferenceCheckpoint` canônico na V1. Se essa chave já existe com
`creativeDirectionHash`/`generationContextHash`/`providerRequestHash`/
`providerKey`/`modelKey` diferentes → `SCRIPT_INFERENCE_CHECKPOINT_CONFLICT`
(`FATAL_ERROR` + `AuditEvent`).

**`providerRequestKey` gerado ANTES de qualquer chamada de rede**
(protege contra cobrança duplicada, mesmo princípio da Skill 02/07):

```
constrói contexto -> calcula generationContextHash -> resolve provider/model
  -> calcula providerRequestHash -> gera providerRequestKey estável
  -> persiste checkpoint PREPARED -> só então permite chamada de rede
  -> checkpoint -> SUBMITTING (+ Job.externalEffectState = SUBMITTING)
  -> chamada ocorre
```

`providerRequestKey` **nunca é regenerado** durante replay da mesma
Attempt.

**Captura durável da resposta**: quando o provider responde → valida
envelope básico → normaliza `ScriptProviderProposal` → calcula
`SCRIPT_PROVIDER_RESPONSE_V1` → persiste ATOMICAMENTE (`checkpoint.state
= RESPONSE_CAPTURED` + `normalizedProposal` + `providerResponseHash` +
`providerRequestId` quando houver) — tudo ou nada. A partir de
`RESPONSE_CAPTURED`, replay **não chama o provider de novo**, usa a
`normalizedProposal` já capturada — obrigatório mesmo que `ScriptResult`
ainda não tenha sido criado.

**Validação após `RESPONSE_CAPTURED`** — tudo determinístico a partir daí:
`normalizedProposal` + `CreativeDirectionResult` exato + `ScriptPolicy`
snapshot + `ScriptFactCatalog` canônico → validator, que verifica beat
count/indexes/purposes, permissões spoken/on-screen, duration constraints
(quando ativas), CTA, preservação da `CreativeDirection`, claims
factuais, claims visuais, proveniência, tenant/subject. Se válido:
`ScriptResult` + `checkpoint.state = VALIDATED` + `AuditEvent` resumo na
**mesma transação**. Se inválido: `checkpoint.state = REJECTED` +
`rejectionCode` persistidos duravelmente, **nenhum** `ScriptResult`.
Replay de `REJECTED` **não chama o modelo de novo** naquela Attempt
(evita loop de retry automático queimando dinheiro numa resposta já
conhecidamente ruim).

**Não-determinismo reconhecido explicitamente** — mesma disciplina
intelectual das Skills 06/07: a geração textual de um modelo externo não
é deterministicamente reproduzível. A Skill 08 garante determinismo na
normalização, validação, factual grounding, policy evaluation e hashing
**quando trabalha sobre o mesmo checkpoint persistido**. Se a chamada
externa ocorreu mas nenhuma resposta foi duravelmente capturada, uma
execução futura pode produzir outro texto — nem `temperature=0` nem
provider/model idênticos permitem prometer identidade textual absoluta.

**Estado ambíguo em `SUBMITTING`**: se a conexão cair sem saber se o
provider processou/cobrou, **não fazemos retry cego**. Se o provider
suporta idempotency/reconciliation, consulta/reconcilia com o mesmo
`providerRequestKey`; se não suporta →
`SCRIPT_INFERENCE_EXTERNAL_STATE_UNKNOWN`, alinhado ao contrato **já
aprovado** da Skill 02: `Job.externalEffectState = UNKNOWN`,
`Job.status = BLOCKED`, `Job.blockReason = EXTERNAL_STATE_UNKNOWN`
(confirmado no SPEC.md da Skill 02 — `BLOCKED`/`EXTERNAL_STATE_UNKNOWN`
nunca repete cego). Distinção que precisa sobreviver até a Skill 02:
timeout **confirmado como não processado** → `SCRIPT_PROVIDER_TIMEOUT_CONFIRMED_NOT_PROCESSED`
(`RETRYABLE_ERROR`); timeout **ambíguo** → `SCRIPT_INFERENCE_EXTERNAL_STATE_UNKNOWN`
(`BLOCKED`/reconcile, nunca simplesmente "retryable").

**Idempotência de `ScriptResult`**: `UNIQUE` lógico `(jobId,
attemptNumber)` → no máximo 1 `ScriptResult` canônico. Replay: se já
existe, reabre, verifica input/hash/policy compatíveis, retorna o MESMO
resultado, zero chamada externa — **nunca chama o modelo de novo pra
confirmar o replay** (Ponto S14, reparo transversal pós-revisão Fable,
2026-09-18 — ver `contracts/RESULT-MATERIALIZATION.md`; mesmo
`temperature=0`/mesmo model não garante output byte-identical, então
"recalcular e comparar" nunca poderia funcionar como detector de
conflict). "Incompatibilidade" aqui significa exclusivamente
`input/hash/policy` da tentativa atual divergindo da identidade
persistida (provenance), **nunca** o conteúdo textual de uma nova
geração — `SCRIPT_RESULT_REPLAY_CONFLICT` (`FATAL_ERROR` +
`AuditEvent`) nunca sobrescreve um roteiro canônico porque uma segunda
execução "escreveu algo melhor"; se quisermos deliberadamente um
roteiro novo, isso é correção semântica (Ponto D), não replay.

**`POLICY_ONLY`**: mantido arquiteturalmente (caso alguma policy/template
futuro determine todo o roteiro sem IA) — `providerKey`/`modelKey`/
`providerRequestHash`/`providerResponseHash`/`inferenceCheckpointId`
ausentes, nenhum checkpoint externo artificial criado. Hoje a expectativa
é que a maioria absoluta seja `MODEL_ASSISTED`.

### Três (+1) situações de "sem provider"

```
1. Nenhuma IA necessária (POLICY_ONLY) -> segue normalmente
2. IA necessária, nenhuma integração configurada
     -> SCRIPT_PROVIDER_NOT_CONFIGURED (FATAL_ERROR, nenhum ScriptResult)
3. Provider configurado, mas temporariamente indisponível
     -> SCRIPT_PROVIDER_TEMPORARILY_UNAVAILABLE (RETRYABLE_ERROR)
4. Provider existe mas não suporta o locale/schema exigido
     -> SCRIPT_PROVIDER_CAPABILITY_UNSUPPORTED (FATAL_ERROR de config —
        nunca degrada structured output pra texto livre silenciosamente)
```

**Output inválido não gera segunda chamada automática**: se o provider
produzir JSON inválido, beat proibido, CTA trocado, claim sem base, claim
semanticamente falso, visual factual sem base, ou estrutura incompatível
com a `CreativeDirection` → `SCRIPT_PROVIDER_INVALID_OUTPUT` para aquela
Attempt. **Não existe** "tenta de novo automaticamente até acertar" —
isso esconderia custo, quantidade de inferências e comportamento
probabilístico. Nova tentativa precisa ser explícita pelo sistema de
Jobs/policy futura.

## Erros e JobExecutionReport

```
FATAL_ERROR (nenhum ScriptResult criado/persistido):
  - SCRIPT_CREATIVE_DIRECTION_NOT_FOUND
  - SCRIPT_CREATIVE_DIRECTION_MISMATCH
  - SCRIPT_CREATIVE_DIRECTION_NOT_OK
  - SCRIPT_POLICY_NOT_FOUND
  - SCRIPT_POLICY_BINDING_NOT_FOUND
  - INVALID_SCRIPT_POLICY
  - SCRIPT_TENANT_MISMATCH
  - SCRIPT_PROVIDER_NOT_CONFIGURED
  - SCRIPT_PROVIDER_CAPABILITY_UNSUPPORTED
  - SCRIPT_PROVIDER_INVALID_OUTPUT
  - SCRIPT_CREATIVE_CONSTRAINT_VIOLATION      (archetype/hook/narrativa/
    visual/CTA mechanism alterados pela proposta)
  - SCRIPT_CTA_CONSTRAINT_VIOLATION           (token operacional trocado)
  - SCRIPT_FACT_BASIS_INVALID
  - SCRIPT_FACTUAL_CLAIM_UNSUPPORTED
  - SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS (basis existe mas não
    sustenta semanticamente a alegação — ex.: preço não sustenta superlativo)
  - SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION (evidenceId real, mas
    não presente em CreativeDirectionResult.trendEvidenceRefsUsed)
  - SCRIPT_INFERENCE_CHECKPOINT_CONFLICT
  - SCRIPT_RESULT_REPLAY_CONFLICT
  - SCRIPT_BEAT_COUNT_INVALID (Ponto S6 — VIDEO_COMPOSITION_V1 exige
    beats.length === 1; grep prévio não encontrou equivalente
    reaproveitável nos códigos já existentes acima)

RETRYABLE_ERROR (desde que a falha seja comprovadamente segura para retry):
  - SCRIPT_PROVIDER_TEMPORARILY_UNAVAILABLE
  - SCRIPT_PROVIDER_RATE_LIMITED
  - SCRIPT_PROVIDER_TIMEOUT_CONFIRMED_NOT_PROCESSED
  - SCRIPT_PROVIDER_TRANSPORT_FAILURE_CONFIRMED_NOT_PROCESSED
  - TRANSIENT_DATASTORE_ERROR

SCRIPT_INFERENCE_EXTERNAL_STATE_UNKNOWN — separado, NÃO é
RETRYABLE_ERROR comum: ambiguidade externa nunca é retryable automático.
```

## Multi-tenant

```
trustedTenantId = Job.tenantId

ScriptGenerationInput, CreativeDirectionResult, StageSubjectBinding
referenciado pela direção, ScriptPolicyBinding, ScriptPolicy,
TrendEvidence autorizadas pela direção, provider configuration,
ScriptInferenceCheckpoint, ScriptResult
  -> todos tenant-compatible com trustedTenantId
```

Divergência → `SCRIPT_TENANT_MISMATCH` (`FATAL_ERROR` + `AuditEvent` de
segurança).

**Catálogo global não vira contexto global**: `products`/
`offer_snapshots`/`deal_candidates` continuam compartilhados, mas a
Skill 08 acessa fatos comerciais só pela cadeia tenant-scoped já
congelada (`CreativeDirectionResult → OfferAnalysisResult exato →
sourceOfferSnapshotId exato`) — nunca busca "último preço do produto"
globalmente, nunca troca snapshot por outro mais recente.

**Credenciais**: reaproveita `TENANT_BYO`/`PLATFORM_MANAGED` (mesmo
padrão da Skill 07) — nunca credencial BYO do tenant A usada pelo tenant
B. Secrets nunca entram em `ScriptGenerationContext`, checkpoint,
`ScriptResult`, hash, log ou `AuditEvent` — só handles internos seguros.

**Sem dedupe cross-tenant do conteúdo gerado**: mesmo que dois tenants
produzam `generationContextHash` idêntico, não reaproveitamos
automaticamente `ScriptProviderProposal`/`ScriptResult`/checkpoint entre
tenants. Hash igual prova igualdade semântica de conteúdo/contexto
segundo o esquema — não concede autorização para compartilhar execução,
custo ou artefato. Cache compartilhado futuro exigiria contrato
explícito.

## Observabilidade

Log estruturado: `tenantId`, `runId`, `jobId`, `attemptNumber`,
`creativeDirectionResultId`, `creativeDirectionHash`, `scriptPolicyId`/
`Version`, `inferenceMode`, `providerKey?`, `modelKey?`,
`generationContextHash`, `providerRequestHash?`, `providerResponseHash?`,
`checkpointState?`, `beatCount?`, `estimatedDurationSeconds?`,
`factualClaimCount?`, `trendFactBasisCount?`, `offerFactBasisCount?`,
`productFactBasisCount?`, `ctaMechanism?`, `durationMs`, `errorCode?`.
**Nunca** logar por padrão: prompt completo, response completa, script
inteiro, token/API secret, cookie, credencial, reasoning interno do
modelo, payload bruto desnecessário.

`AuditEvent` do resultado como resumo: `resultId`, `tenantId`, `runId`,
`jobId`, `attemptNumber`, `creativeDirectionResultId`,
`creativeDirectionHash`, `scriptPolicyId`/`Version`/`SnapshotHash`,
`scriptHash`, `beatCount`, `estimatedDurationSeconds?`,
`factualClaimCount`, `ctaMechanism`, `inferenceMode`, `providerKey?`,
`modelKey?`, `generationContextHash`, `providerRequestHash?`,
`providerResponseHash?`, `createdAt`. Não duplica `beats[]`/texto
integral/`factBasis[]` completo — o próprio `ScriptResult` mantém o
detalhe.

`AuditEvent` explícito também para: `SCRIPT_RESULT_REPLAY_CONFLICT`,
`SCRIPT_INFERENCE_CHECKPOINT_CONFLICT`, `SCRIPT_TENANT_MISMATCH`,
`SCRIPT_CREATIVE_DIRECTION_MISMATCH`,
`SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS`,
`SCRIPT_INFERENCE_EXTERNAL_STATE_UNKNOWN`.

**Métricas — só operação/integridade, ainda não "qualidade do roteiro"**:
`script_generation_success_rate`, `script_provider_success_rate`,
`script_provider_invalid_output_rate`,
`script_provider_retryable_failure_rate`,
`script_external_state_unknown_rate`,
`script_factual_claim_rejection_rate`,
`script_cta_constraint_violation_rate`,
`script_creative_constraint_violation_rate`,
`script_model_assisted_rate`, `script_policy_only_rate`,
`script_generation_duration`, `script_provider_duration`,
`script_beat_count`, `script_estimated_duration_seconds`,
`script_factual_claim_count`, `script_product_fact_basis_count`,
`script_offer_fact_basis_count`, `script_trend_fact_basis_count`. **Nada
como** `script_quality_score`/`best_hook_score`/`persuasion_score`/
`conversion_potential` até as Skills 18/19 produzirem dados reais.

## Plano de testes

### Casos críticos (obrigatórios)

- `CreativeDirectionResult` inexistente → `FATAL_ERROR`.
- `CreativeDirectionResult.resultStatus != OK` → rejeita.
- `creativeDirectionHash` diferente → `SCRIPT_CREATIVE_DIRECTION_MISMATCH`.
- Tenant divergente em input/direction/policy → `SCRIPT_TENANT_MISMATCH`.
- Policy binding inexistente → `FATAL_ERROR`.
- Policy estruturalmente inválida → `FATAL_ERROR`.
- Provider necessário e não configurado → `FATAL_ERROR`.
- Provider configurado mas locale não suportado →
  `SCRIPT_PROVIDER_CAPABILITY_UNSUPPORTED`.
- Provider configurado, temporariamente indisponível → `RETRYABLE_ERROR`.
- Somente um provider/model é usado por `JobAttempt`.
- Não existe fallback pago oculto para segundo modelo.
- `QuotaGuard` ocorre antes da primeira chamada potencialmente cobrada.
- Checkpoint `PREPARED` existe antes da rede.
- `providerRequestKey` permanece idêntico em replay da mesma Attempt.
- `generationContextHash` muda quando um valor factual disponibilizado muda.
- Trocar só `promptTemplateVersion` mantém `contextHash` e muda `providerRequestHash`.
- Trocar `modelKey` mantém `contextHash` e muda `providerRequestHash`.
- Mesma proposta normalizada produz mesmo `SCRIPT_PROVIDER_RESPONSE_V1`,
  independentemente de request ID/timestamps/tokens.
- `RESPONSE_CAPTURED` em replay não chama o provider.
- Crash após resposta capturada e antes do `ScriptResult` → replay usa
  exatamente a proposta capturada.
- Checkpoint `REJECTED` em replay não chama o provider de novo.
- `SUBMITTING` + provider com idempotency/reconciliation usa o mesmo
  `providerRequestKey`.
- `SUBMITTING` ambíguo sem reconciliation →
  `SCRIPT_INFERENCE_EXTERNAL_STATE_UNKNOWN`, sem retry cego.
- Timeout confirmado como não processado → `RETRYABLE_ERROR`.
- Output com `beatIndex` duplicado/não contínuo → inválido.
- Output excedendo `maxBeatCount` → inválido.
- `spokenText` presente quando `allowSpokenText=false` → inválido.
- `FACTUAL_CLAIM` sem `basis` → inválido.
- Basis existente, mas o valor não sustenta a frase →
  `SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS`.
- Preço R$39,90 não sustenta "mais barato do Brasil".
- `visualIntent` factual sem basis → inválido.
- `creativeMode=EVERGREEN` + tentativa de usar `TrendEvidence` da
  Skill 06 → `SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION`.
- `TREND_INFORMED` só permite `evidenceId`s presentes em
  `CreativeDirectionResult.trendEvidenceRefsUsed`.
- CTA `COMMENT_KEYWORD("QUERO")` conserva `QUERO` literalmente; linguagem
  ao redor é permitida.
- Troca de `QUERO` por `LINK` → `SCRIPT_CTA_CONSTRAINT_VIOLATION`.
- Tentativa de alterar archetype/hook/narrativa/visualApproach/CTA
  mechanism → `SCRIPT_CREATIVE_CONSTRAINT_VIOLATION`.
- `ScriptResult` existente + replay compatível → retorna mesmo
  `resultId`/`scriptHash`, zero chamada ao provider.
- `ScriptResult` existente + input/hash incompatível →
  `SCRIPT_RESULT_REPLAY_CONFLICT`.
- Alteração posterior de `product_name`/preço no banco não altera fatos
  congelados consumidos por um `ScriptResult` já criado.
- Dois tenants com `generationContextHash` semanticamente igual não
  compartilham checkpoint/proposal/`ScriptResult` automaticamente.

### Teste real

Adiado — sem schema/migration em produção nesta fase, e sem nenhum
`ScriptGenerationProvider` implementado ainda. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `ScriptGenerationInput`,
  `ScriptCreativeConstraints`, `ScriptStatement`/`ScriptFactBasis`,
  `ScriptBeat`/`ScriptVisualIntent`, `ScriptPolicy`/`Binding`,
  `ScriptFactualClaimRulesV1`, `FactualClaimValidator`,
  `ScriptProviderProposal`, `ScriptResult`.
- As duas regras de integridade (estratégica e factual) congeladas
  literalmente e testáveis.
- `creativeDirectionHash` exato exigido na entrada — nunca "a direção
  mais recente".
- Escopo de `TrendEvidence` estritamente herdado de
  `CreativeDirectionResult.trendEvidenceRefsUsed`, nunca ampliado pela
  Skill 08.
- `ScriptFactualClaimRulesV1` conservador desde a V1 (scarcity/
  superlative/comparative/medical desligados por padrão) — decisão
  consciente diante do risco real (produtos de afiliado sem controle de
  qualidade nosso).
- Validador exige que a referência factual **sustente semanticamente** a
  alegação, não só exista.
- Provider propõe, Skill 08 valida/deriva/materializa — mesmo padrão de
  fronteira das Skills 04-07; nenhuma autoridade factual ao modelo.
- Idempotência em dois níveis (resultado + checkpoint de inferência),
  com tratamento explícito de estado externo ambíguo.
- `scriptHash` exclui `inferenceProvenance` — separa identidade de
  conteúdo de proveniência de produção.
- Multi-tenant documentado, incluindo ausência de dedupe cross-tenant
  mesmo com hash idêntico.
- Nenhum score de "qualidade de roteiro" inventado.

## Dependências

Skill 01 — Orquestrador de Produção (emite `LogicalJobIntent` com
`stage = SCRIPT_GENERATION`; produz `StageSubjectBinding` referenciado
indiretamente via `CreativeDirectionResult`). Skill 02 — Gestor de
Fila/Jobs (materializa o `Job`, invoca o handler, consome
`JobExecutionReport`, gerencia `QuotaGuard` e o mecanismo
`externalEffectState`/`BLOCKED`/`EXTERNAL_STATE_UNKNOWN` já aprovado).
Skill 05 — Análise de Oferta/Comissão (fonte de `OFFER_FACT`). Skill 06 —
Pesquisa de Tendências (fonte de `TREND_EVIDENCE`, indiretamente via
Skill 07). Skill 07 — Direção Criativa (produz o `CreativeDirectionResult`
autoritativo consumido aqui). Skill 09/10 — Gerador de Frame/Prompt de
Vídeo (ainda não especificadas; consomem `ScriptResult`, `visualIntent`
nunca é prompt técnico). Skill 20 — Gerador de Variações (ainda não
especificada; futura dona de gerar A/B/C — a Skill 08 produz um único
roteiro canônico por `JobAttempt`). Interface Skill 01↔02 já congelada é
reaproveitada sem alteração — Skill 08 não introduz outbox novo.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Adiado para decisão de produto consciente (nunca herdado de ideia antiga
não testada):

- valores concretos de `durationConstraint` (ex.: 8-15s) nas policies
  iniciais — a auditoria mostrou que isso nunca foi runtime real neste
  repositório;
- valores concretos de `allowedBeatPurposes`/`maxBeatCount` nas policies
  iniciais (a estrutura já está congelada nos Contratos);
- se/quando `ScriptFactualClaimRulesV1` relaxa `allowScarcityClaims`/
  `allowSuperlativeClaims`/`allowComparativeClaims`/
  `allowMedicalOrTherapeuticClaims` — decisão de risco/produto, nunca
  técnica;
- qual será o primeiro `ScriptGenerationProvider` implementado.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão:

- formato exato de `providerRequestKey` (depende do primeiro provider real);
- desenho exato de como a Skill 20 (futura) solicitará variações sem
  duplicar a responsabilidade da Skill 08.
