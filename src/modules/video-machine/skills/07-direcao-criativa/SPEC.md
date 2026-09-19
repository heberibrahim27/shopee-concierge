# Skill 07 — Direção Criativa

> **APROVADA EM ESPECIFICAÇÃO — 7/25** (2026-09-18). Especificação/contrato.
> **Sem implementação ainda** — nenhuma migration, tabela, RPC, worker ou
> cron foi criado. Este arquivo só vira código depois da revisão do Claude
> Fable 5 Max e do GPT-6 Astra.
>
> Consolidado em 2026-09-18 após debate ChatGPT ↔ Claude Code, fundamentado
> em auditoria real do repositório e do banco Supabase live
> (`babamanager-pro`, `czocwdlygdslyuoixmhh`). A auditoria confirmou que
> **nenhuma lógica de geração criativa existe hoje** — captions reais em
> produção são só título bruto da Shopee + 4 hashtags fixas, Stories são
> publicados sem legenda nenhuma, e o único LLM já integrado
> (`gpt-4o-mini`) serve exclusivamente reconhecimento visual no bot do
> WhatsApp, nunca geração de texto/copy. A Skill 07 introduz arquitetura
> genuinamente nova, não herda nem duplica nada existente.
>
> **🔧 Adição pós-revisão Fable (2026-09-18, achado B6)**: quota
> esgotada continua sempre `QuotaGuard`/Skill 23 → `Job
> BLOCKED/QUOTA` — nunca vira erro criativo desta Skill. Ver "Reparo
> transversal pós-revisão Fable → Ponto E" no `SPEC.md` da Skill 23.

## Garantia central

Transformar o produto economicamente aprovado pela Skill 05 (via o
`subject` resolvido pela Skill 01 — ver `StageSubjectBinding` no SPEC.md
da Skill 01) + evidências de tendência disponíveis pela Skill 06 em uma
**direção criativa estruturada, auditável e reproduzível o suficiente**
para orientar roteiro/frame/vídeo — sem escrever o roteiro final nem
gerar mídia.

## Objetivo

Produzir um `CreativeDirectionResult` que decide **estratégia**
(narrativa, hook, CTA, abordagem visual), nunca **conteúdo final**
(texto exato do hook/CTA/legenda — isso é Skill 08). Toda decisão
carrega `decisionBasis` explícito, distinguindo fato (produto/oferta/
tendência), policy e inferência do modelo — nunca deixando uma
interpretação criativa legítima ("mostrar o resultado primeiro") virar
uma alegação factual não sustentada ("isso está bombando").

## Responsabilidades

- Executar `Job`s `CREATIVE_DIRECTION` materializados e controlados pela
  Skill 02, recebendo `CreativeDirectionInput` dentro de um `JobAttempt`
  válido — mesmo padrão de execução das Skills 04/05/06 (Skill de
  execução comum via fila de Jobs, **sem outbox próprio**).
- Ler o `OfferAnalysisResult` (via o subject resolvido pela Skill 01) e o
  `TrendResearchResult` correspondente (via `offerAnalysisResultId`).
- Decidir estratégia criativa: modo (`TREND_INFORMED`/`EVERGREEN`),
  narrativa, hook strategy, CTA intent, abordagem visual — sempre
  registrando a origem (`decisionBasis`) de cada decisão.
- Persistir `CreativeDirectionResult` durável, auditável.
- Devolver `JobExecutionReport` com `resultRef`.

## Não é responsabilidade

- Escrever o texto final do hook/CTA/legenda, ou timing exato de fala —
  Skill 08 (Roteirista).
- Gerar frame/imagem — Skill 09. Escrever prompt de vídeo — Skill 10.
  Executar geração — Skill 11. Validar fidelidade/deformações — Skill 12.
- Recalcular comissão/oferta — Skill 05. Pesquisar tendência nova —
  Skill 06 (a Skill 07 só **consome** o `TrendResearchResult` já
  produzido).
- Usar performance histórica dos nossos próprios vídeos como sinal —
  Skills 18/19, até existir um sinal formal consumível (hoje não existe).
- Escolher qual candidato do shortlist econômico vira o subject da
  produção — Skill 01 (`StageSubjectBinding`), não a Skill 07.
- Executar a automação de comentário/DM do CTA — Skill 16 (a Skill 07
  só decide a **intenção** do CTA, nunca a executa).
- Inventar que algo "está bombando"/"é tendência" sem `TrendEvidence`
  real por trás — se `TrendResearchResult` não tem evidência utilizável,
  a única saída legítima é `EVERGREEN`.

## Quando é chamada

- Quando um worker da Skill 02 adquire lease (`EXECUTE_NEW_ATTEMPT`) de um
  `Job` com `stage = CREATIVE_DIRECTION`.

## Quem pode chamar

- Skill 01, indiretamente via `LogicalJobIntent` (outbox) → Skill 02 →
  handler da Skill 07.

## Quais Skills ela pode chamar

Nenhuma diretamente. Reporta o resultado via `reportExecution()` da
Skill 02 (`JobExecutionReport`), que gera `JobResultEvent` →
`Skill01.advanceRun()`.

## Fluxo

```
Skill05 → OfferAnalysisResult
Skill01 → StageSubjectBinding (resolve QUAL candidato vira o subject)
Skill06 → TrendResearchResult (com evidências, OU NO_EVIDENCE_FOUND, OU NO_SOURCES_AVAILABLE)
Skill07 → CreativeDirectionResult
Skill08 → roteiro final (texto exato)
```

## Categorias de estratégia criativa (taxonomia, não ranking)

```
DEMONSTRATION | PROBLEM_SOLUTION | POV | BEFORE_AFTER | UNBOXING |
REACTION | SOCIAL_PROOF | PRODUCT_IN_USE | EVERGREEN_PRODUCT_DEMO
```

**Sem dado real para justificar ranking entre essas categorias** — a
auditoria confirmou zero histórico de conteúdo em vídeo produzido por
este pipeline (0 Reels publicados até hoje). Existem como taxonomia
estrutural que a policy pode escolher entre, nunca como formato "melhor"
baseado em evidência inexistente — mesmo princípio de nunca inventar
score sem população real de dados (Skills 04/05/06).

## Divisão de responsabilidade — estratégia (Skill 07) vs. conteúdo final (Skill 08)

```
Skill07 decide:
  hookStrategy = CURIOSITY | PAIN_POINT | VISUAL_SHOCK | RESULT_FIRST
  ctaStrategy  = intenção do CTA (ver CreativeCtaIntent abaixo)
  narrativeStructure = ex.: PROBLEM_SOLUTION
  visualApproach = ex.: HANDHELD_UGC

Skill08 escreve:
  "Você também sofre com..."
  "Comenta QUERO que eu te mando o link."
  texto falado/legenda/timing exatos
```

## `CreativeCtaIntent` — resolve o bug real encontrado na auditoria

Achado da auditoria: hoje "QUERO" existe em **dois pontos hardcoded
desconectados** — o texto estático gravado na imagem Canva do Story, e a
`keyword` do webhook de DM do Instagram (`src/app/api/webhook/instagram/route.ts`)
— sem nenhuma config compartilhada. Se um mudasse, o outro não
acompanharia.

```ts
type CreativeCtaIntent =
  | {
      mechanism: "COMMENT_KEYWORD";
      keyword: string;           // ex.: "QUERO" — forma exibida, preservada
      keywordNormalized: string; // ex.: "quero" — trim -> Unicode NFKC ->
                                  // lowercase Unicode (ordem exata fixa,
                                  // "normalização Unicode" sozinho seria
                                  // ambíguo entre implementações)
      purpose: "AFFILIATE_LINK_DELIVERY";
    }
  | {
      mechanism: "DIRECT_LINK";
      purpose: "AFFILIATE_LINK_VISIT";
    }
  | {
      mechanism: "NONE";
    };
```

Semântica rígida, uma única fonte de verdade por criativo:

```
Skill07 → decide o mechanism (COMMENT_KEYWORD) → congela keyword="QUERO"
  (vindo da CreativeDirectionPolicy, NUNCA inventado pelo modelo)
Skill08 → escreve "Comenta QUERO que eu te mando o link."
  → NÃO pode trocar por "EU QUERO"/"LINK"/"ME MANDA" etc.
Skill16 → lê a mesma intenção/keyword vinculada ao criativo/publicação
  → reconhece "quero" segundo a normalização definida
  → dispara a automação correspondente
```

`keyword`: trim obrigatório, não vazia, tamanho máximo definido, preserva
forma exibida. `keywordNormalized`: ordem exata e fixa —
`trim → Unicode NFKC → lowercase Unicode` (ex.: `" QUERO "` →
`keyword="QUERO"`, `keywordNormalized="quero"`). Matching mais
sofisticado (acentos, pontuação, "eu quero", palavra isolada dentro de
frase) pertence à **Skill 16**, não à Skill 07.

A Skill 07 pode escolher o `mechanism` entre os permitidos pela policy
quando houver mais de um, mas **nunca inventa a palavra operacional**:

```ts
{ decisionKey: "CTA_MECHANISM", value: "COMMENT_KEYWORD", basis: ["CREATIVE_POLICY"] }
{ decisionKey: "CTA_KEYWORD",   value: "QUERO",           basis: ["CREATIVE_POLICY"] }
```

Nunca `MODEL_INFERENCE` para o valor operacional da `keyword`.

### `CreativeCtaIntent` — identidade e provenance (Ponto S3)

**PATCH (Ponto S3 — reparo transversal pós-revisão Fable, 2026-09-18).**
Achado do Fable: Skills 16/17 tratavam `CreativeCtaIntent` — um value
object aninhado dentro de `CreativeDirectionBrief`/`CreativeDirectionResult`
— como se tivesse identidade persistente própria
(`creativeCtaIntentId`), quando essa identidade nunca foi criada em
lugar nenhum. Decisão técnica (não a única opção do Fable, mas a mais
limpa): **não criar um artifact persistido novo** para o CTA — isso
adicionaria storage/lifecycle/provenance duplicada sem necessidade real
no V1. Em vez disso, `CreativeCtaIntent` continua pertencendo ao
`CreativeDirectionResult`, ganha um hash canônico próprio, e sua
identidade completa passa a ser **parent exato + esse sub-hash**.

```typescript
type CreativeCtaIntentRef = {
  creativeDirectionResultId: string; // = CreativeDirectionSuccess.resultId
  creativeDirectionHash: string;     // parent exato — mesmo par já usado
                                      // em todo o resto do corpus pra
                                      // referenciar CreativeDirectionResult
                                      // (não existe um tipo dedicado
                                      // CreativeDirectionResultRef hoje —
                                      // não criado aqui pra não expandir
                                      // o raio do patch além do CTA)

  creativeCtaIntentHash: string; // CREATIVE_CTA_INTENT_V1
};
```

Regras centrais:

1. **Conteúdo do CTA não muda.** `CreativeCtaIntent` continua com os
   mesmos campos de negócio (`mechanism`/`keyword`/`keywordNormalized`/
   `purpose`) — o Ponto S3 resolve identidade/provenance, não conteúdo.
2. **`creativeCtaIntentId` é proibido.** Não existe, nunca existiu como
   entidade independente — zero allowlist em qualquer SPEC canônico
   (Skills 07/16/17).
3. **Hash formal:**
   `creativeCtaIntentHash = canonicalHash('CREATIVE_CTA_INTENT_V1', ctaIntent)`
   via `CANONICAL_SERIALIZATION_V1`. Projection é só o conteúdo
   semântico do `ctaIntent` — nunca inclui `creativeDirectionResultId`/
   `creativeDirectionHash` (evitaria circularidade) nem o próprio
   `creativeCtaIntentHash`.
4. **Mesmo subhash em parents diferentes é normal.** Dois
   `CreativeDirectionResult` distintos podem legitimamente produzir CTA
   idêntico → mesmo `creativeCtaIntentHash`. Isso não significa que
   sejam o mesmo sub-artifact — a identidade completa exige o parent
   exato também.
5. **`CreativeDirectionSuccess` já materializa o CTA formalmente:**
   `direction.ctaIntent` já existe; ganha `creativeCtaIntentHash` como
   campo formal ao lado. `creativeDirectionHash` (a projection inteira
   de `CreativeDirectionSuccess`, ver acima) **já inclui `direction`
   por completo** — logo já se compromete com o conteúdo do CTA
   transitivamente; não é necessário reescrever essa projection para
   apontar só pro sub-hash (churn desnecessário quando a opção mais
   simples já cobre a invariante: "CTA muda → creativeDirectionHash
   muda").
6. **Verificação obrigatória:**
   `canonicalHash('CREATIVE_CTA_INTENT_V1', parent.direction.ctaIntent)`
   deve bater com `creativeCtaIntentHash` persistido — se não bater,
   artifact corrompido, contract violation.
7. **Tenant/subject só no parent.** `CreativeCtaIntent` nunca ganha
   `tenantId`/`subjectRef`/`productId` próprios — pertencem só ao
   `CreativeDirectionResult`, evitando duas cópias potencialmente
   divergentes.
8. **Nenhuma tabela/lifecycle/approval próprios.** Sem
   `creative_cta_intents`, sem `CreativeCtaIntentStatus`/
   `RuntimeState`/`Version`, sem `ApprovalRequest` automática só por
   ter ganhado hash — é componente imutável do artifact da Skill 07.
9. **`CreativeCtaIntentRef` não é `KernelArtifactRef`.** O CTA não é
   artifact top-level persistido — o parent é o artifact; por isso o
   ref tem shape próprio (parent ref + subhash), não o formato
   genérico do kernel.

**Fluxo de dereferência (Skills 16/17):**

```text
CreativeCtaIntentRef
  → carrega EXACT CreativeDirectionResult por resultId + creativeDirectionHash esperado
  → valida tenant do parent = tenant confiável do consumer
  → recalcula canonicalHash('CREATIVE_CTA_INTENT_V1', parent.direction.ctaIntent)
  → confere == ref.creativeCtaIntentHash
  → confere parent.creativeCtaIntentHash == ref.creativeCtaIntentHash
  → só então usa o CTA

Nunca: buscar CTA por creativeCtaIntentHash globalmente.
Nunca: "CTA bateu, então ignora divergência do parent" (nem o inverso —
       provenance inteira precisa ser exata, os dois lados).
```

Nunca resolver por "CTA mais recente do produto" — o consumer sempre
carrega o `ref` exato que originou a campanha/publicação. Tenant
divergente ou CTA de subject/produto diferente do que está sendo
processado → fail closed (reaproveita os erros de mismatch já
existentes em cada Skill consumidora, ver "Erros" de cada uma).
Reaproveitar o mesmo texto de CTA para outro produto exige um novo
`CreativeDirectionResult` para o novo subject — o subhash pode
coincidir, mas a provenance completa (parent) muda; `creativeCtaIntentHash`
sozinho nunca serve como dedupe de negócio (mesmo hash ≠ mesma
campanha/subject/publicação).

**Correção/replay:** mudança de CTA nunca faz `UPDATE` no
`CreativeDirectionResult` antigo — gera um novo resultado da Skill 07
(mesma disciplina do Ponto D). Replay segue a regra S14 normal: se um
`CreativeDirectionResult` válido já existe pra execução exata, reuse —
zero reconsulta de IA, zero novo hash.

## `feed`/`reel`/`story` ≠ taxonomia criativa

Achado da auditoria: `social_posts.post_type` (`feed`/`reel`/`story`) é
um enum real, já congelado no banco live — mas é **formato/target de
publicação**, não prova a existência de formatos criativos como
`POV`/`UNBOXING`/`DEMONSTRATION`. Os dois nunca são misturados:

```
FEED / REEL / STORY        = formato/target de publicação (Skill 17)
POV / DEMONSTRATION / etc. = taxonomia criativa NOVA da Skill 07
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
// SelectedProductCandidateRef, OfferRankedCandidateRef, StageSubjectBinding
// — tipos COMPARTILHADOS, definidos nas Skills 04/05/01 respectivamente
// (não redefinidos aqui).

type CreativeDirectionInput = {
  tenantId: string;
  runId: string;

  stageSubjectBindingId: string; // AUTORIDADE do subject — não um
    // productId solto enviado pelo caller.

  trendResearchResultId?: string; // PATCH (Ponto M5, reparo transversal
    // pós-revisão Fable, 2026-09-18, VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1,
    // contrato completo em IMPLEMENTATION-SCOPE.md): antes obrigatório —
    // Skill06 está DEFERRED_V2_CONTRACT no V1 (sem runtime), então nenhum
    // TrendResearchResult jamais existirá; um campo obrigatório
    // bloquearia 100% dos ProductionRuns. Ausente = tratado exatamente
    // como Skill06 tivesse retornado NO_SOURCES_AVAILABLE (mesma
    // semântica de EVERGREEN já definida abaixo em CreativeMode) — nunca
    // um estado de erro. Quando presente (Skill06 ativada no futuro),
    // as validações estruturais abaixo continuam valendo integralmente.

  creativeDirectionPolicyKey: string;
  // PATCH (Ponto M2, reparo transversal pós-revisão Fable, 2026-09-18,
  // CONTRACT_CONVENTIONS_V1): campo "subjectRef?" removido — mesmo
  // achado das Skills 05/06 (REDUNDANT_DEFENSIVE_REFERENCE, categoria
  // B). Skill07 sempre deriva o CreativeSubjectRef de
  // stageSubjectBindingId, nunca do payload do caller.
};

// Cadeia autoritativa:
//   Job.tenantId -> StageSubjectBinding -> sourceResultId = OfferAnalysisResult.resultId
//     -> candidato na sourcePosition daquele binding -> CreativeSubjectRef
//   Se trendResearchResultId presente: TrendResearchResult.offerAnalysisResultId
//     -> deve ser o MESMO OfferAnalysisResult (Ponto M5: validação só se
//        aplica quando o ref foi fornecido — ausência não é erro)
//
// Validações estruturais (todas FATAL_ERROR, nunca fabrica direção):
//   StageSubjectBinding.subjectType != "PRODUCT"        -> CREATIVE_SUBJECT_TYPE_UNSUPPORTED
//   trendResearchResultId fornecido mas não resolve a um
//     TrendResearchResult real                          -> CREATIVE_TREND_RESULT_NOT_FOUND
//   trendResearchResultId fornecido mas tenant diverge    -> CREATIVE_TREND_TENANT_MISMATCH
//   trendResearchResultId fornecido e
//     TrendResearchResult.offerAnalysisResultId !=
//     StageSubjectBinding.sourceResultId                -> CREATIVE_UPSTREAM_RESULT_MISMATCH

type CreativeSubjectRef = {
  productId: string;
  dealCandidateId: string;
  sourceOfferSnapshotId: string;

  offerAnalysisResultId: string;

  sourcePosition: number; // EXATAMENTE a posição que originou o
    // StageSubjectBinding — nunca recalculada pela Skill07. A Skill07
    // não pode trocar para outro candidato por ter achado uma direção
    // "melhor".
};

type CreativeSubjectFactsSnapshot = {
  productId: string;

  productName: string;
  categorySlug?: string;

  observedAt: string;

  factsHash: string; // "CREATIVE_SUBJECT_FACTS_V1:sha256:<hex>" — sobre
    // JSON canônico dos fatos efetivamente disponibilizados à direção
    // criativa. Protege contra deriva: products.product_name/categoria
    // podem mudar no banco depois; sem esse snapshot perderíamos a
    // reprodução factual da decisão. NÃO duplica preço/comissão/desconto
    // — isso continua vindo do OfferAnalysisResult/sourceOfferSnapshotId.
};
// PRODUCT_FACT -> CreativeSubjectFactsSnapshot
// OFFER_FACT   -> OfferAnalysisResult / sourceOfferSnapshotId
// Nunca misturadas.

type CreativeMode = "TREND_INFORMED" | "EVERGREEN";
// TREND_INFORMED só pode ser usado quando:
//   existe TrendEvidence canônica
//   + TrendEvidence.subjectRef == CreativeSubjectRef (MESMO subject)
//   + pelo menos uma CreativeDecision efetivamente CITA essa evidência
// EVERGREEN quando nenhuma decisão usa TrendEvidence — inclusive quando
// TrendResearchResult=OK, se as evidências pertencem a OUTROS candidatos
// ou nenhuma foi realmente usada. NO_SOURCES_AVAILABLE/NO_EVIDENCE_FOUND
// levam naturalmente a EVERGREEN, desde que a policy permita.
// PATCH (Ponto M5): trendResearchResultId AUSENTE (Skill06
// DEFERRED_V2_CONTRACT, nunca executou) tem a MESMA semântica de
// NO_SOURCES_AVAILABLE — leva a EVERGREEN se a policy permitir, ou a
// NO_APPLICABLE_DIRECTION se a policy só permite TREND_INFORMED (mesma
// regra já existente abaixo, "NO_APPLICABLE_DIRECTION acontece ANTES da
// IA"). Nunca um estado de erro.
//
// REGRA CRÍTICA: a mera presença de TrendEvidence no TrendResearchResult
// NÃO torna a direção automaticamente TREND_INFORMED. Evidência
// pertencente a outro candidato nunca pode fundamentar a direção do
// subject atual.

// Taxonomia V1 — vocabulário, NUNCA modelo preditivo. Nenhum arquétipo
// "significa melhor"; sem dado real (auditoria: 0 Reels publicados até
// hoje) para justificar ranking entre eles.
type CreativeArchetypeV1 =
  | "DEMONSTRATION" | "PROBLEM_SOLUTION" | "PRODUCT_IN_USE" | "POV"
  | "UNBOXING" | "BEFORE_AFTER" | "REACTION" | "EVERGREEN_PRODUCT_DEMO";

type HookStrategyV1 =
  | "CURIOSITY" | "PAIN_POINT" | "RESULT_FIRST"
  | "VISUAL_PATTERN_INTERRUPT" | "QUESTION" | "DEMONSTRATION_FIRST";

type NarrativeStructureV1 =
  | "HOOK_DEMO_CTA" | "PROBLEM_SOLUTION_CTA" | "RESULT_FIRST_CTA"
  | "DISCOVERY_DEMO_CTA";

type VisualApproachV1 =
  | "HANDHELD_UGC" | "CLEAN_PRODUCT_FOCUS" | "LIFESTYLE_IN_USE"
  | "MACRO_DETAIL" | "POV_CAMERA";

// CreativeCtaIntent já definido acima (linha ~139) — não redeclarado
// aqui. Duplicata real encontrada e corrigida durante o Ponto G do
// reparo transversal pós-revisão Fable (2026-09-18); as duas
// definições eram idênticas em forma, mantida a primeira.
// Matching mais sofisticado ("eu quero", "QUERO!!!", "quéro" com acento)
// é contrato da Skill 16, não da Skill 07.

type CreativeDirectionPolicy = {
  policyId: string;
  policyKey: string;
  policyVersion: string;
  tenantId: string;

  allowedModes: CreativeMode[];

  creativeTaxonomyVersion: "CREATIVE_TAXONOMY_V1";
  allowedArchetypes: CreativeArchetypeV1[];
  allowedHookStrategies: HookStrategyV1[];
  allowedNarrativeStructures: NarrativeStructureV1[];
  allowedVisualApproaches: VisualApproachV1[];

  allowedCtaMechanisms: Array<"COMMENT_KEYWORD" | "DIRECT_LINK" | "NONE">;
  commentKeyword?: string; // obrigatório SE COMMENT_KEYWORD permitido;
    // deve estar AUSENTE se não permitido (nunca carrega config morta)

  defaultLocale: string;

  createdAt: string;
};
// Imutável por (policyId, policyVersion). Invariantes — violação de
// qualquer uma: INVALID_CREATIVE_DIRECTION_POLICY (FATAL_ERROR):
//   allowedModes/allowedArchetypes/allowedHookStrategies/
//     allowedNarrativeStructures/allowedVisualApproaches/
//     allowedCtaMechanisms: nenhum vazio
//   COMMENT_KEYWORD ∈ allowedCtaMechanisms
//     -> commentKeyword obrigatório, trim(commentKeyword) != "",
//        1..32 caracteres após trim, sem caracteres de controle
//   COMMENT_KEYWORD ∉ allowedCtaMechanisms -> commentKeyword deve estar ausente
//
// Policy inicial do MVP: allowedModes=[TREND_INFORMED, EVERGREEN],
// COMMENT_KEYWORD permitido, commentKeyword="QUERO", defaultLocale="pt-BR".
// Sem peso/ranking entre arquétipos.

type CreativeDirectionPolicyBinding = {
  tenantId: string;
  policyKey: string;
  activePolicyId: string;
  activePolicyVersion: string;
  updatedAt: string;
};
// policySnapshotHash: "CREATIVE_DIRECTION_POLICY_V1:sha256:<hex>" sobre
// representação canônica dos campos comportamentais.

type CreativeDecisionBasis =
  | { type: "PRODUCT_FACT"; subjectFactsHash: string; fieldPath: string }
  | { type: "OFFER_FACT"; offerAnalysisResultId: string; sourceOfferSnapshotId: string; fieldPath: string }
  | { type: "TREND_EVIDENCE"; evidenceId: string; fieldPath?: string }
  | { type: "CREATIVE_POLICY"; policyId: string; policyVersion: string; fieldPath: string }
  | { type: "MODEL_INFERENCE"; inferenceRef: string };
// Cada tipo carrega o PONTEIRO de proveniência real (fieldPath,
// evidenceId, sourceOfferSnapshotId etc.) — permite reconstruir POR QUE
// uma decisão foi tomada, não só "de que categoria" veio.
//
// MODEL_INFERENCE = decisão estética/criativa inferida. NUNCA prova um
// fato sobre produto/oferta/tendência. Regra estrutural: MODEL_INFERENCE
// sozinho NUNCA pode fundamentar uma alegação factual. Proibido sem
// evidência factual correspondente: "produto viral", "mais vendido",
// "últimas unidades", "desconto histórico", "todo mundo está comprando".

type CreativeDecisionKey =
  | "CREATIVE_MODE" | "CREATIVE_ARCHETYPE" | "HOOK_STRATEGY"
  | "NARRATIVE_STRUCTURE" | "VISUAL_APPROACH" | "CTA_MECHANISM" | "CTA_KEYWORD";

type CreativeDecision = {
  decisionKey: CreativeDecisionKey;
  value: string;
  basis: CreativeDecisionBasis[]; // NUNCA vazio
};
// Invariante forte: decisionKey="CTA_KEYWORD" -> basis precisa conter
// CREATIVE_POLICY, nunca só MODEL_INFERENCE.

type CreativeDirectionBrief = {
  archetype: CreativeArchetypeV1;
  hookStrategy: HookStrategyV1;
  narrativeStructure: NarrativeStructureV1;
  visualApproach: VisualApproachV1;
  ctaIntent: CreativeCtaIntent;
};
// NÃO existe aqui: hookText, spokenScript, caption, ctaText, scenePrompt,
// VeoPrompt — tudo isso pertence às Skills seguintes (08+).

type NoApplicableCreativeDirectionReason = "REQUIRED_TREND_EVIDENCE_UNAVAILABLE";
// Caso: policy permite só TREND_INFORMED + subject não possui
// TrendEvidence aplicável -> NO_APPLICABLE_DIRECTION. Resultado de
// domínio LEGÍTIMO, não invalida a policy. Não deve ocorrer no caminho
// padrão do MVP (policy inicial permite EVERGREEN).

type CreativeDirectionResultStatus = "OK" | "NO_APPLICABLE_DIRECTION";

type CreativeDirectionResult = CreativeDirectionSuccess | CreativeDirectionUnavailable;

type CreativeDirectionSuccess = {
  resultId: string;
  resultStatus: "OK";

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;
  subjectRef: CreativeSubjectRef;
  subjectFactsSnapshot: CreativeSubjectFactsSnapshot;

  offerAnalysisResultId: string;
  trendResearchResultId: string;

  creativeMode: CreativeMode;
  direction: CreativeDirectionBrief;
  decisions: CreativeDecision[];
  trendEvidenceRefsUsed: string[];

  creativeCtaIntentHash: string; // CREATIVE_CTA_INTENT_V1 — sub-hash
    // formal de direction.ctaIntent (Ponto S3). Não participa da
    // projection de creativeDirectionHash abaixo (evita duplicar o
    // mesmo compromisso duas vezes) — direction já inclui ctaIntent
    // por completo.

  creativeDirectionPolicyId: string;
  creativeDirectionPolicyVersion: string;
  creativeDirectionPolicySnapshotHash: string;

  creativeDirectionHash: string; // "CREATIVE_DIRECTION_V1:sha256:<hex>"
    // — sobre JSON canônico de: subjectRef, subjectFactsSnapshot.factsHash,
    // offerAnalysisResultId, trendResearchResultId, creativeMode,
    // direction, decisions, trendEvidenceRefsUsed (ordenados
    // deterministicamente), creativeDirectionPolicyId/Version/SnapshotHash.
    // NUNCA inclui resultId/jobId/attemptNumber/createdAt (identidade
    // operacional, não conteúdo criativo). A Skill 08 consome sempre
    // (creativeDirectionResultId + creativeDirectionHash) exatos — nunca
    // "a direção mais recente", mesmo princípio de reprodutibilidade do
    // patch de StageSubjectBinding na Skill 01.
    //
    // ORDENAÇÃO CANÔNICA OBRIGATÓRIA (dois objetos semanticamente iguais
    // não podem gerar hashes diferentes só por causa da ordem de montagem
    // dos arrays):
    //   decisions -> ordenado pela ordem FIXA de CreativeDecisionKey:
    //     1 CREATIVE_MODE, 2 CREATIVE_ARCHETYPE, 3 HOOK_STRATEGY,
    //     4 NARRATIVE_STRUCTURE, 5 VISUAL_APPROACH, 6 CTA_MECHANISM,
    //     7 CTA_KEYWORD
    //   CreativeDecision.basis[] -> ordenado por (type, identificador de
    //     origem, fieldPath):
    //     PRODUCT_FACT     -> subjectFactsHash + fieldPath
    //     OFFER_FACT       -> offerAnalysisResultId + sourceOfferSnapshotId + fieldPath
    //     TREND_EVIDENCE   -> evidenceId + fieldPath
    //     CREATIVE_POLICY  -> policyId + policyVersion + fieldPath
    //     MODEL_INFERENCE  -> inferenceRef
    //   trendEvidenceRefsUsed -> ordenado lexicograficamente por evidenceId
    // JSON canônico + SHA-256 calculado só DEPOIS dessa normalização.

  createdAt: string;
};

type CreativeDirectionUnavailable = {
  resultId: string;
  resultStatus: "NO_APPLICABLE_DIRECTION";

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  stageSubjectBindingId: string;
  subjectRef: CreativeSubjectRef;

  offerAnalysisResultId: string;
  trendResearchResultId: string;

  reason: NoApplicableCreativeDirectionReason;

  creativeDirectionPolicyId: string;
  creativeDirectionPolicyVersion: string;
  creativeDirectionPolicySnapshotHash: string;

  createdAt: string;
};
```

## Geração e inferência — o provider propõe, a Skill 07 valida e materializa

**Regra central**: o provider (LLM) propõe escolhas criativas; a Skill 07
é quem valida, ancora proveniência e materializa o contrato canônico. O
modelo **nunca** recebe autoridade para declarar fatos nem para escrever
`DecisionBasis` diretamente.

```ts
type CreativeInferenceContext = {
  subjectRef: CreativeSubjectRef;
  subjectFactsSnapshot: CreativeSubjectFactsSnapshot;

  offerFacts: {
    offerAnalysisResultId: string;
    sourceOfferSnapshotId: string;
    // + os VALORES de fato efetivamente expostos (não só os IDs) —
    // entram no contextHash, para provar exatamente o que foi mostrado
  };

  applicableTrendEvidence: Array<{
    evidenceId: string;
    evidenceHash: string;
    sourceKey: string;
    observedMetrics: ObservedTrendMetric[];
  }>; // SOMENTE TrendEvidence cujo subjectRef corresponda EXATAMENTE ao
    // subject atual entra aqui — nunca evidência de outro candidato.

  allowedArchetypes: CreativeArchetypeV1[];
  allowedHookStrategies: HookStrategyV1[];
  allowedNarrativeStructures: NarrativeStructureV1[];
  allowedVisualApproaches: VisualApproachV1[];
  allowedCtaMechanisms: Array<"COMMENT_KEYWORD" | "DIRECT_LINK" | "NONE">;

  locale: string;
};
// DOIS hashes distintos, não um só — "os dados disponibilizados" e "o
// que foi de fato enviado ao modelo" são provas diferentes (o mesmo
// contextHash pode gerar chamadas semanticamente diferentes se o prompt
// template, o schema de output, o model ou os generation parameters
// mudarem — um hash único não distinguiria "foi o dado que mudou ou foi
// o prompt/modelo?"):
//
// contextHash: "CREATIVE_INFERENCE_CONTEXT_V1:sha256:<hex>" — sobre JSON
//   canônico de: subjectRef, subjectFactsSnapshot, offerFacts (valores
//   efetivos, não só IDs), applicableTrendEvidence, allowed taxonomies,
//   allowedCtaMechanisms, locale. Prova o que o modelo tinha à
//   disposição, montado ANTES de qualquer chamada externa.
//
// providerRequestHash: "CREATIVE_PROVIDER_REQUEST_V1:sha256:<hex>" —
//   sobre JSON canônico de: contextHash, providerKey, modelKey,
//   promptTemplateVersion, outputSchemaVersion, generationParameters
//   relevantes. Prova exatamente a chamada externa feita, não só os
//   dados que a alimentaram.
//
// O CreativeInferenceCheckpoint carrega AMBOS (contextHash +
// providerRequestHash), assim como o CreativeInferenceProvenance no
// resultado final.

type CreativeProviderProposal = {
  archetype: CreativeArchetypeV1;
  hookStrategy: HookStrategyV1;
  narrativeStructure: NarrativeStructureV1;
  visualApproach: VisualApproachV1;

  proposedCtaMechanism: "COMMENT_KEYWORD" | "DIRECT_LINK" | "NONE";

  referencedTrendEvidenceIds: string[];

  decisionHints?: Array<{
    decisionKey: string;
    referencedProductFields?: string[];
    referencedOfferFields?: string[];
    referencedTrendEvidenceIds?: string[];
  }>;
};
// Deliberadamente NÃO existe aqui: commentKeyword, DecisionBasis
// canônico, creativeMode, creativeDirectionHash — todos DERIVADOS pela
// Skill07. Especialmente: o provider NUNCA escolhe "QUERO" — se o
// mecanismo final for COMMENT_KEYWORD, a Skill07 injeta o
// commentKeyword já congelado na policy.
```

### Derivação de `CreativeMode` — nunca decidida pelo provider

```
depois de validar a proposta:
  pelo menos uma decisão canônica usa TREND_EVIDENCE válida do mesmo subject
    -> TREND_INFORMED
  caso contrário
    -> EVERGREEN
```

Impossível o modelo simplesmente responder `mode=TREND_INFORMED` sem
evidência real por trás.

### Validação pós-inferência (validator determinístico)

Toda proposta passa por um validator antes de virar resultado:

```
archetype ∈ policy.allowedArchetypes
hookStrategy ∈ policy.allowedHookStrategies
narrativeStructure ∈ policy.allowedNarrativeStructures
visualApproach ∈ policy.allowedVisualApproaches
proposedCtaMechanism ∈ policy.allowedCtaMechanisms

todo evidenceId citado:
  - existe
  - pertence ao TrendResearchResult exato
  - possui tenant correto
  - possui subjectRef EXATAMENTE igual ao CreativeSubjectRef
```

O validator também **constrói** o `CreativeDecisionBasis` — o modelo pode
sugerir referências, mas não cria proveniência verdadeira por mera
declaração: modelo cita `evidenceId=X` → sistema reabre `X` → valida
subject/tenant/hash → só então cria `DecisionBasis.TREND_EVIDENCE`.
Referência inexistente ou incompatível nunca é aceita silenciosamente.

### Resolução determinística antes do modelo (economiza custo)

```
dimensão com única opção válida na policy (ex.: allowedCtaMechanisms=[COMMENT_KEYWORD])
  -> Skill07 resolve deterministicamente -> basis=CREATIVE_POLICY

múltiplas escolhas estilísticas válidas
  -> provider pode selecionar entre elas -> basis=MODEL_INFERENCE + demais bases reais
```

Se **todas** as dimensões estão determinadas pela policy, **nenhuma
chamada de IA é necessária** — `inferenceMode=POLICY_ONLY` (ver
proveniência abaixo).

## Provider abstraction

Nenhum OpenAI/Claude/Gemini/etc. hardcoded dentro do domínio da Skill:

```ts
interface CreativeInferenceProvider {
  getCapabilities(): Promise<CreativeInferenceProviderCapabilities>;
  generateDirection(request: CreativeInferenceProviderRequest): Promise<CreativeInferenceProviderResponse>;
}

type CreativeInferenceProviderCapabilities = {
  providerKey: string;
  implementationStatus: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  runtimeAvailability: "AVAILABLE" | "CONDITIONALLY_AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  supportsStructuredOutput: boolean;
  supportedLocales: string[];
  providerVersion?: string;
  checkedAt: string;
};
```

A request **não carrega credencial** — credenciais são resolvidas pela
camada de integração/provider usando contexto confiável do tenant.

**Sem fallback automático oculto entre modelos na V1**: `Skill02 cria
JobAttempt → QuotaGuard → Skill07 resolve UM provider elegível → executa
UMA inferência`. Se o provider falhar, a Skill07 **não** decide
secretamente "modelo A falhou, vou gastar também no B" — retry/troca de
provider ocorre através de nova tentativa/policy explícita controlada
pela Skill02/23/24 no futuro. Preserva custo previsível, attempts
auditáveis, quota correta, sem duplicação escondida de cobrança.

## Idempotência e operação

Mesma disciplina intelectual da Skill 06: **a geração de um modelo
externo não é uma função deterministicamente reproduzível.** A Skill 07
garante determinismo na validação, normalização, proveniência, avaliação
de policy e hashing **quando recebe o mesmo `CreativeInferenceCheckpoint`
persistido**. Se a chamada externa ocorreu mas nenhuma resposta foi
duravelmente capturada, uma nova tentativa pode produzir direção
diferente — nenhuma promessa de que "temperatura zero" resolve isso.

```ts
type CreativeInferenceCheckpoint = {
  inferenceCheckpointId: string;

  tenantId: string;
  runId: string;
  jobId: string;
  attemptNumber: number;

  providerKey: string;
  modelKey: string;

  contextHash: string;         // "CREATIVE_INFERENCE_CONTEXT_V1:sha256:<hex>"
  providerRequestHash: string; // "CREATIVE_PROVIDER_REQUEST_V1:sha256:<hex>"
  providerRequestKey: string;

  state: "PREPARED" | "SUBMITTING" | "RESPONSE_CAPTURED" | "VALIDATED" | "REJECTED";

  responseHash?: string;
  normalizedProposal?: CreativeProviderProposal;

  providerRequestId?: string;

  createdAt: string;
  updatedAt: string;
};
```

`UNIQUE` lógico `(jobId, attemptNumber)` → no máximo um
`CreativeInferenceCheckpoint` canônico (só um provider por Attempt na V1,
não precisa de coleção de inference attempts internos).

**Nível 1 — resultado**: no máximo 1 `CreativeDirectionResult` canônico
por `(jobId, attemptNumber)`. Replay com resultado existente reutiliza
exatamente o resultado, **nunca chama o provider de novo pra comparar**
(Ponto S14, reparo transversal pós-revisão Fable, 2026-09-18 — ver
`contracts/RESULT-MATERIALIZATION.md`; geração criativa pode ser
não-determinística, mesmo `same model + same prompt + same temperature`
não garante output byte-identical, então "recalcular e comparar" nunca
poderia funcionar como detector de conflict). Tentativa real de
persistir um 2º `CreativeDirectionResult` com conteúdo diferente pra
mesma chave (colisão de identidade, nunca detectada recalculando) →
`CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT`
(`FATAL_ERROR` + `AuditEvent`).

**Crash depois da resposta da IA**: o checkpoint existe justamente para
isto — provider respondeu → normaliza → persiste `RESPONSE_CAPTURED` +
`normalizedProposal` + `responseHash` (idealmente atomicamente) → crash.
No replay: checkpoint `RESPONSE_CAPTURED` existe → **não chama a IA de
novo** → retoma o validator → produz resultado.

**Crash ambíguo** (`state=SUBMITTING`, request enviado, conexão morreu,
não sabemos se o provider processou/cobrou) — mesma semântica já
congelada na Skill 02: se o provider suporta idempotency/reconciliation
(`providerRequestKey` estável), reconcilia/repete com a mesma chave; se
não suporta e o estado externo é incerto →
`CREATIVE_INFERENCE_EXTERNAL_STATE_UNKNOWN` — **nunca repete cegamente**
uma chamada potencialmente cobrada; reporta estado ambíguo à Skill 02.

`responseHash`: `"CREATIVE_PROVIDER_RESPONSE_V1:sha256:<hex>"` sobre a
proposta **normalizada**, nunca sobre headers/IDs operacionais/metadata
volátil — prova que "este resultado canônico veio exatamente desta
proposta normalizada".

### Proveniência da inferência no resultado

```ts
type CreativeInferenceProvenance = {
  inferenceMode: "POLICY_ONLY" | "MODEL_ASSISTED";
  inferenceCheckpointId?: string;
  providerKey?: string;
  modelKey?: string;
  contextHash?: string;
  providerRequestHash?: string;
  responseHash?: string;
};
```

Se a policy determinou tudo, `inferenceMode=POLICY_ONLY` e nenhum
provider aparece artificialmente (nunca atribui a um modelo uma decisão
que ele não tomou).

### Três situações distintas de "sem provider"

```
1. Nenhuma inferência necessária (policy resolve tudo determinística)
     -> segue normalmente, POLICY_ONLY

2. Inferência necessária, mas nenhum provider configurado
     -> CREATIVE_PROVIDER_NOT_CONFIGURED (FATAL_ERROR de configuração,
        nenhum resultado fictício)

3. Provider configurado, mas temporariamente indisponível
     -> CREATIVE_PROVIDER_TEMPORARILY_UNAVAILABLE (RETRYABLE_ERROR)
```

Quota esgotada/pausada continua sob `QuotaGuard`/Skill 23/Skill 02, nunca
vira "erro criativo".

### `NO_APPLICABLE_DIRECTION` acontece ANTES da IA, quando possível

```
policy.allowedModes = [TREND_INFORMED] + zero TrendEvidence aplicável ao subject
  -> já sabemos deterministicamente: NO_APPLICABLE_DIRECTION
  -> NÃO chama provider, não gasta token, não tenta "inventar uma trend"
```

## Erros e JobExecutionReport

**PATCH (Ponto M5).** `CREATIVE_TREND_RESULT_NOT_FOUND`/
`CREATIVE_TREND_TENANT_MISMATCH`/`CREATIVE_UPSTREAM_RESULT_MISMATCH`
(quando causado por `TrendResearchResult`) só disparam quando
`trendResearchResultId` foi fornecido no input — `trendResearchResultId`
ausente nunca é `FATAL_ERROR`, é EVERGREEN/`NO_APPLICABLE_DIRECTION`
conforme a policy (ver `CreativeMode` acima).

```
FATAL_ERROR (nenhum CreativeDirectionResult criado/persistido):
  - CREATIVE_SUBJECT_BINDING_NOT_FOUND
  - CREATIVE_SUBJECT_TYPE_UNSUPPORTED
  - CREATIVE_UPSTREAM_RESULT_MISMATCH
  - CREATIVE_TREND_RESULT_NOT_FOUND
  - CREATIVE_TREND_TENANT_MISMATCH
  - CREATIVE_POLICY_NOT_FOUND
  - CREATIVE_POLICY_BINDING_NOT_FOUND
  - INVALID_CREATIVE_DIRECTION_POLICY
  - CREATIVE_DIRECTION_TENANT_MISMATCH
  - CREATIVE_PROVIDER_NOT_CONFIGURED
  - CREATIVE_INFERENCE_INVALID_OUTPUT (fatal PARA AQUELA Attempt, sem
    loop interno automático — nova tentativa usa política futura de
    retry/provider administrada pela Skill 02)
  - CREATIVE_INFERENCE_PROVENANCE_INVALID
  - CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT
  - CREATIVE_INFERENCE_CHECKPOINT_CONFLICT
```

**PATCH (Ponto S3).** `creativeCtaIntentHash` divergente do conteúdo
real de `direction.ctaIntent` é coberto por
`CREATIVE_INFERENCE_PROVENANCE_INVALID` (já existente — integridade de
proveniência é exatamente esse conceito). Replay incompatível do CTA
(parte de um `CreativeDirectionResult` incompatível) é coberto por
`CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT` (já existente — o CTA não é
artifact independente, então não tem replay conflict próprio; pertence
ao owner). **0 `FATAL_ERROR` novos.**

```text

RETRYABLE_ERROR:
  - CREATIVE_PROVIDER_TEMPORARILY_UNAVAILABLE
  - CREATIVE_PROVIDER_TIMEOUT_CONFIRMED_NOT_PROCESSED
  - CREATIVE_PROVIDER_RATE_LIMITED
  - TRANSIENT_DATASTORE_ERROR

CREATIVE_INFERENCE_EXTERNAL_STATE_UNKNOWN — separado, NÃO é
RETRYABLE_ERROR comum: estado externo ambíguo não é igual a retry seguro.
```

## Multi-tenant

```
trustedTenantId = Job.tenantId

CreativeDirectionInput, StageSubjectBinding, OfferAnalysisResult,
TrendResearchResult, TrendEvidence usada, CreativeDirectionPolicyBinding,
CreativeDirectionPolicy, provider configuration,
CreativeInferenceCheckpoint, CreativeDirectionResult
  -> todos tenant-compatible com trustedTenantId
```

Divergência → `CREATIVE_DIRECTION_TENANT_MISMATCH` (`FATAL_ERROR` +
`AuditEvent` de segurança).

**Credenciais** — duas modalidades legítimas para SaaS:

```ts
type CreativeProviderCredentialScope = "TENANT_BYO" | "PLATFORM_MANAGED";
```

`PLATFORM_MANAGED` = API paga pelo próprio SaaS conforme plano/créditos.
`TENANT_BYO` = credencial exclusiva daquele tenant. **Nunca existe**
fallback de credencial BYO do tenant A para o tenant B. Secrets **nunca**
entram em `CreativeDirectionResult`, `CreativeInferenceCheckpoint`, logs,
hashes ou `AuditEvent` — só handles internos seguros.

**Trava de conteúdo factual vs. inferência**: `CreativeInferenceProvider`
pode sugerir escolhas estéticas, mas **não pode criar fatos canônicos**.
Se a resposta externa disser em campo livre "produto viral com 50 mil
vendas", isso **não entra automaticamente** em nenhum contrato — só fatos
recuperados de fontes canônicas geram `PRODUCT_FACT`/`OFFER_FACT`/
`TREND_EVIDENCE`. O modelo nunca promove sua própria afirmação a
evidência.

## Observabilidade

Log estruturado: `tenantId`, `runId`, `jobId`, `attemptNumber`,
`stageSubjectBindingId`, `productId`, `policyId`/`Version`,
`inferenceMode`, `providerKey?`, `modelKey?`, `contextHash?`,
`providerRequestHash?`, `responseHash?`, `creativeMode?`, `archetype?`, `hookStrategy?`,
`narrativeStructure?`, `visualApproach?`, `ctaMechanism?`,
`trendEvidenceUsedCount`, `durationMs`, `errorCode?`. **Sem** prompt
completo, response bruto, secrets ou reasoning interno do modelo.

`AuditEvent` do resultado como resumo: `resultId`, `tenantId`, `runId`,
`jobId`, `attemptNumber`, `stageSubjectBindingId`, `subjectId`,
`sourcePosition`, `offerAnalysisResultId`, `trendResearchResultId`,
`resultStatus`, `creativeMode?`, `archetype?`, `hookStrategy?`,
`narrativeStructure?`, `visualApproach?`, `ctaMechanism?`,
`trendEvidenceUsedCount`, `creativeDirectionPolicyId`/`Version`/
`SnapshotHash`, `creativeDirectionHash?`, `inferenceMode`, `providerKey?`,
`modelKey?`, `contextHash?`, `providerRequestHash?`, `responseHash?`, `createdAt`.

`AuditEvent` explícito também para: `CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT`,
`CREATIVE_INFERENCE_CHECKPOINT_CONFLICT`, `CREATIVE_DIRECTION_TENANT_MISMATCH`,
`CREATIVE_UPSTREAM_RESULT_MISMATCH`, `CREATIVE_INFERENCE_EXTERNAL_STATE_UNKNOWN`.

**Métricas — só operacionais, sem "qualidade criativa" inventada:**
`creative_direction_ok_rate`, `no_applicable_direction_rate`,
`trend_informed_rate`, `evergreen_rate`, `policy_only_resolution_rate`,
`model_assisted_resolution_rate`, `creative_provider_success_rate`,
`creative_provider_invalid_output_rate`,
`creative_provider_retryable_failure_rate`,
`creative_external_state_unknown_rate`, `creative_direction_duration`,
`creative_inference_duration`, `trend_evidence_used_per_direction`.
**Nada como** `best_archetype`/`POV_success_rate`/`hook_quality_score`
até as Skills 18/19 possuírem dados reais.

## Plano de testes

### Casos críticos (obrigatórios)

- `StageSubjectBinding` inexistente → `FATAL_ERROR`.
- Binding não `PRODUCT` → `CREATIVE_SUBJECT_TYPE_UNSUPPORTED`.
- `sourceResultId` diferente do `OfferAnalysisResult` esperado → `FATAL_ERROR`.
- (Ponto M2) `subjectRef?` removido do input — Skill07 sempre deriva de
  `stageSubjectBindingId`, nunca de payload do caller.
- `trendResearchResultId` fornecido apontando outro `OfferAnalysisResult`
  → `FATAL_ERROR`.
- (Ponto M5) `trendResearchResultId` **ausente** (Skill06
  DEFERRED_V2_CONTRACT, nunca executou) → EVERGREEN se a policy
  permitir, `NO_APPLICABLE_DIRECTION` se não — **nunca** `FATAL_ERROR`.
- `TrendEvidence` de outro subject nunca entra no `CreativeInferenceContext`.
- `TrendEvidence` de outro tenant → `FATAL_ERROR`.
- `TrendResearchResult=OK` mas nenhuma evidência do subject usada → `EVERGREEN`.
- Evidência válida efetivamente usada → `TREND_INFORMED`.
- Policy permite só `TREND_INFORMED` + zero evidência aplicável →
  `NO_APPLICABLE_DIRECTION`, **sem** chamar o provider.
- Policy inválida por allowed-list vazia → `FATAL_ERROR`.
- `COMMENT_KEYWORD` permitido sem `commentKeyword` → policy inválida.
- `COMMENT_KEYWORD` não permitido + `commentKeyword` presente → policy inválida.
- `" QUERO "` materializa `keyword="QUERO"` e `keywordNormalized="quero"`
  conforme contrato.
- Provider nunca pode substituir `QUERO` por outra keyword.
- `CTA_KEYWORD` canônico sempre contém `CREATIVE_POLICY` no `basis`.
- Dimensão com única opção válida → resolve por policy sem pedir ao modelo.
- Todas as dimensões únicas → `POLICY_ONLY`, zero chamadas externas.
- Múltiplas escolhas → `MODEL_ASSISTED`.
- Provider retorna `archetype` fora de `allowedArchetypes` → output inválido.
- Provider referencia `evidenceId` inexistente → proveniência inválida.
- Provider referencia evidência do candidato rank 2 enquanto o subject é
  rank 1 → rejeitado.
- Provider afirma "viral" sem `TrendEvidence` → não cria fato/basis.
- Mesmo checkpoint `RESPONSE_CAPTURED` em replay → provider não chamado
  novamente.
- Crash após captura da resposta e antes do Result → replay produz
  Result da mesma proposta.
- Mesmo `(jobId, attemptNumber)` com Result existente → reutiliza, nunca
  recalcula pra comparar.
- Tentativa de persistir 2º Result com conteúdo diferente pra mesma
  chave (colisão de escrita) → `CREATIVE_DIRECTION_RESULT_REPLAY_CONFLICT`.
- `SUBMITTING` ambíguo + provider sem reconciliation/idempotency →
  `CREATIVE_INFERENCE_EXTERNAL_STATE_UNKNOWN`, sem retry cego.
- Tenant BYO A nunca usa credencial BYO B.
- Alteração posterior de `products.product_name` não altera
  `CreativeSubjectFactsSnapshot`/`factsHash` já congelado.
- Mesma proposta normalizada gera o mesmo hash `CREATIVE_PROVIDER_RESPONSE_V1`
  independentemente de IDs operacionais do provider.
- Skill 08 valida posteriormente `(creativeDirectionResultId +
  creativeDirectionHash)` sem consultar "a direção mais recente".

**Ponto S3 (identidade/provenance do CTA):**

- `CreativeCtaIntent` não possui `creativeCtaIntentId` — proibido em
  qualquer SPEC canônico (lint bane globalmente).
- `creativeCtaIntentHash` calculado via `CREATIVE_CTA_INTENT_V1` sobre
  `direction.ctaIntent`.
- `creativeCtaIntentHash` muda quando o conteúdo do CTA muda; não muda
  se só `resultId`/`createdAt`/campos operacionais mudarem.
- `creativeDirectionResultId`/`creativeDirectionHash` do parent não
  participam do `CREATIVE_CTA_INTENT_V1` (evita circularidade).
- Mesmo conteúdo de CTA em dois `CreativeDirectionResult` diferentes
  pode ter o mesmo `creativeCtaIntentHash` — identidade completa
  continua distinta porque o parent difere.
- Tamper no `ctaIntent` persistido sem atualizar `creativeCtaIntentHash`
  → recomputo diverge → contract violation.
- Correção que muda o CTA gera novo `CreativeDirectionResult` — nunca
  `UPDATE` do `ctaIntent` de um resultado já persistido.
- Replay de `CreativeDirectionResult` já existente reutiliza o
  `creativeCtaIntentHash` já persistido, zero recálculo pra comparar.

### Teste real

Adiado — sem schema/migration em produção nesta fase, e sem nenhum
`CreativeInferenceProvider` implementado ainda. Acontece na fase de
implementação, depois da revisão do Fable 5 Max e do GPT-6 Astra.

## Critério de aprovação do arquivo

- Contratos essenciais completos e coerentes: `CreativeDirectionInput`,
  `CreativeSubjectRef`, `CreativeSubjectFactsSnapshot`,
  `CreativeDirectionPolicy`/`Binding`, `CreativeMode`, taxonomias V1,
  `CreativeCtaIntent`, `CreativeDecisionBasis`/`Decision`,
  `CreativeDirectionResult` (discriminated union).
- Fundamentado em auditoria real (2026-09-18): nenhuma lógica criativa
  existente é herdada por acidente; o bug real da convenção "QUERO"
  desconectada (imagem Canva vs. webhook) é resolvido com
  `CreativeCtaIntent` como fonte única de verdade.
- `StageSubjectBinding` como autoridade do subject (não `productId`
  solto) — reaproveita o patch compatível já aplicado na Skill 01.
- `TREND_INFORMED` exige evidência do MESMO subject efetivamente citada
  — presença de evidência em outro candidato nunca contamina.
- Separação rígida entre fato (`PRODUCT_FACT`/`OFFER_FACT`/
  `TREND_EVIDENCE`), policy (`CREATIVE_POLICY`) e inferência
  (`MODEL_INFERENCE`) em toda `CreativeDecisionBasis`; `MODEL_INFERENCE`
  nunca sozinho fundamenta alegação factual.
- Provider propõe, Skill 07 valida/deriva/materializa — modelo nunca tem
  autoridade para escrever `DecisionBasis`, `creativeMode`, `commentKeyword`
  ou `creativeDirectionHash` diretamente.
- Idempotência em dois níveis (resultado + checkpoint de inferência) com
  tratamento explícito de estado externo ambíguo (nunca retry cego de
  chamada potencialmente cobrada).
- Nenhum score/ranking de "qualidade criativa" inventado — taxonomia é
  vocabulário, métricas são só operacionais.
- Multi-tenant documentado, incluindo credential scope (`TENANT_BYO`/
  `PLATFORM_MANAGED`) e proibição de fallback de credencial cross-tenant.
- `creativeDirectionHash` congelado para a Skill 08 consumir exato, nunca
  "a direção mais recente".

## Dependências

Skill 01 — Orquestrador de Produção (emite `LogicalJobIntent` com
`stage = CREATIVE_DIRECTION`; produz `StageSubjectBinding`, patch
compatível aplicado durante este debate). Skill 02 — Gestor de Fila/Jobs
(materializa o `Job`, invoca o handler, consome `JobExecutionReport`,
gerencia `QuotaGuard`). Skill 05 — Análise de Oferta/Comissão (produz o
`OfferAnalysisResult`). Skill 06 — Pesquisa de Tendências (produz o
`TrendResearchResult`, hoje tipicamente `NO_SOURCES_AVAILABLE`). Skill 08
— Roteirista (ainda não especificada; consome `CreativeDirectionResult`
via `creativeDirectionResultId`+`creativeDirectionHash` exatos, nunca
escolhe o texto do CTA fora do `ctaIntent` recebido). Skill 16 —
Automação de Comentários/DM (ainda não especificada; executa o matching
sofisticado da `keywordNormalized`). Skill 23/24 — Gestor de
Créditos/Quotas e Gestor de Integrações (ainda não especificadas; futuro
lar de `QuotaGuard` e resolução/fallback explícito de provider). Interface
Skill 01↔02 já congelada é reaproveitada sem alteração — Skill 07 não
introduz outbox novo.

## Questões abertas

Nenhum bloqueio arquitetural conhecido.

Adiado para quando o primeiro `CreativeInferenceProvider` real existir:

- qual será o primeiro provider implementado (decisão de produto, não
  arquitetural);
- desenho exato de retry/fallback explícito entre providers (hoje
  deliberadamente fora de escopo da V1 — sem fallback oculto);
- se/quando Skills 18/19 produzirão sinal real de performance criativa
  para eventualmente informar (nunca substituir) a taxonomia V1.

Parâmetros operacionais deliberadamente adiados para a fase de
implementação/revisão:

- valores concretos de `allowedArchetypes`/`allowedHookStrategies`/etc.
  nas policies iniciais (a estrutura já está congelada nos Contratos);
- tamanho máximo exato de `commentKeyword` além do sugerido (1..32 após trim);
- formato exato de `providerRequestKey` (depende do primeiro provider real).
