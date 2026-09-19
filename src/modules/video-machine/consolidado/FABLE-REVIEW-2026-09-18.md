# Independent Architecture Review — Máquina de Vídeos, Skills 01–25

**Scope covered:** all 25 `SPEC.md` files read end to end (the consolidated file is byte-identical to the concatenation plus an index; 136 diff lines are all headers/separators). Specific cross-file claims were verified by grep rather than memory. Repo facts spot-checked where a spec's claim was load-bearing (`maxDuration=60` on `publish-product`, `300` on `source-deals`; 21 cron entries in `vercel.json`; zero `tenant` in `src/` outside the specs).

**Headline:** the 25 specs are individually careful but collectively they do not form one consistent contract set. The two skills that define the runtime spine (01/02) were frozen before Skills 09–25 existed, and Skills 13–21 were written against a job runner that Skill 02 is not. Six issues are blocking; none of them is a "polish" item — they are the seams between skills, which is exactly where a two-party debate that always audited "the current skill against the repo" would not look.

---

## BLOCKING

### B1. Skills 16, 18, 19, 20, 21 cannot be hosted by the Run/Job model in Skills 01/02

- **Skill 01:** a `Job` exists only because `advanceRun()` emitted a `LogicalJobIntent` for a `stage` of a `PipelineDefinition` inside a `ProductionRun`; a DB constraint allows **"no máximo 1 `ProductionRun` com status ativo por tenant"**.
- **Skill 02:** "Não chama Skill de execução diretamente — elas puxam trabalho da fila" — but only Skill 01 can put work in that queue.
- **Skill 16** (`ResponseIntent.runId`, `OutboundSendCheckpoint.runId`), **18** (`MetricCollectionInputBase.runId`, `MetricCollectionSchedule` spanning weeks), **19** (`PerformanceAnalysisRun.runId/jobId/attemptNumber`), **21** (`ReportMaterializationRun.runId/jobId/attemptNumber`), **20** (`CreativeVariationPlanningRun.runId`) all say "Skill 02 continua dona do Job lifecycle" and return operational directives to Skill 02 (`WAIT_FOR_BINDING`, `WAITING_FOR_METRIC_REFRESH`, `WAITING_FOR_QUOTA`).
- Nobody specifies: which Run a DM arriving 3 weeks after `SUCCEEDED` belongs to; who emits the `LogicalJobIntent` for a scheduled metric collection; what `stage` a report render is; or how a month-long metric schedule coexists with the "1 active Run per tenant" constraint. Skill 20 even acknowledges that variants serialize behind that constraint — meaning routine metric collection would block or be blocked by any production run.

**Fix to raise:** Skill 01/02 need either (a) a `RunKind` (`PRODUCTION` | `BACKGROUND`/`STANDALONE`) with its own concurrency rule, or (b) an explicit contract for non-orchestrator intent producers (webhook ingress, schedulers, Skill 20) that can call `ensureJob` with a defined `stage`/`subject`/`variantKey` and no `runId`. This is a change to the frozen 01/02 interface and must be debated as such.

### B2. The correction loop (12 → 13 → 09/10/11 → 12) is inexpressible under 01/02

- **Skill 13:** "Skill02 → decide SE haverá nova Attempt"; "nova Attempt da Skill11"; "o `attemptNumber` já é o eixo de versionamento".
- **Skill 02:** an Attempt is a retry of the *same* Job after `RETRYABLE_ERROR` under `RetryPolicy.retryableErrorClasses`. Skill 11's Job on `MATERIALIZED` emits a `JobResultEvent` `SUCCEEDED` — terminal. A `NON_COMPLIANT` audit is a domain result of a *different* Job (Skill 12's), not an error class of Skill 11's. Skill 02 has no operation to reopen a `SUCCEEDED` Job. New Jobs restart `attemptNumber` at 1, so it is not a versioning axis across jobs.
- **Skill 01:** `PipelineDefinition` is a `dependsOn` DAG; there is no re-entry/loop construct. Skill 12 says "Skill 01 decide roteamento conforme definição futura" — that future definition was never written. `logicalJobKey = runId:stage:subjectType:subjectId:variantKey`: re-running `VIDEO_GENERATION` for the same subject either hits `PAYLOAD_CONFLICT` or silently reuses the old Job unless `variantKey` changes, and nobody says who sets `variantKey` to the correction lineage.

**Fix:** in Skill 01 add a stage re-entry construct (e.g., `onDomainResult: { NON_COMPLIANT: { reenter: [...], maxReentries } }`), specify that the orchestrator derives `variantKey` from `correctionDirectiveId`, and correct Skill 13's text so it stops pointing at Skill 02's `RetryPolicy`.

### B3. Skill 01 is both "domain-agnostic" and required to know every domain

- **Skill 01:** "o Orquestrador não conhece Shopee, Veo, Instagram etc., só a forma abstrata do pipeline."
- **Skills 04/05/06/09/12/13/14/17:** "a Skill01 nunca interpreta `COMPLETED` como avançar: ela reabre o `ProductDiscoveryResult` via `resultRef` e aplica sua própria regra de interpretação do resultado de domínio" (04), and analogous for `PARTIAL`, `NO_ELIGIBLE_CANDIDATES`, `CANDIDATE_POOL_STALE`, `REFERENCE_UNAVAILABLE`, `INCONCLUSIVE`, `UPSTREAM_REVISION_REQUIRED`, `NO_PROGRESS`, `INCOMPATIBLE`, `PUBLISHED_WITHOUT_CORRELATION`. Skill 04 explicitly says `completionPolicy` does *not* cover this.
- Skill 01 must also **build** every input payload: `ProductDiscoveryInput.requestedCount/selectionPolicyKey/allowedCategorySlugs`, `OfferAnalysisInput.discoveryResultId`, `FinalizationInput.resolvedPolicy` (pre-resolved Skill 14 policy binding!), `PublicationInput.resolvedPolicy`, `MetricCollectionInputBase.resolvedPolicy`. That is deep domain knowledge.
- `StageDefinition` has no hook for any of it, and **`ProductionRun` itself has no type in any of the 25 files** (grep `type ProductionRun` = 0). The central entity has no fields: no configuration, no target list, no pipeline reference, no `pause_reason`.

**Fix:** define a per-stage `StageAdapter` contract owned by each execution skill (`buildIntentPayload(run, upstreamResults)`, `interpretResult(resultRef) → SATISFIED | PARTIAL | BLOCK | FAIL | REENTER`) registered by stage key, with Skill 01 only invoking it; and define `ProductionRun` + `RunRequest` contracts.

### B4. The handler ↔ Skill 02 boundary is undefined and structurally mismatched

- `resultRef`: Skills 04–07 say "`JobExecutionReport` com `resultRef`"; Skill 02's `JobExecutionReport` has only `resultPayload?: unknown`. No `resultRef` field exists.
- Skills 09 and 11–21 **never mention `JobExecutionReport` or `reportExecution` at all** (grep = 0). Skill 11 invents `VideoExecutionDirective`, Skill 16 `WAIT_FOR_BINDING`, Skill 19 `WAITING_FOR_METRIC_REFRESH`, Skill 20 `WAITING_FOR_*` — none mapped to Skill 02's six `outcome` values.
- `JobExecutionReport` has no `blockReason`, yet Skills 10/14/15/16/17/18/19/20/21 report `BLOCKED` with `POLICY_BLOCKED`, `EXTERNAL_STATE_UNKNOWN`, `DATA_BLOCKED`, `CAPACITY_BLOCKED`. `DATA_BLOCKED`/`CAPACITY_BLOCKED` are not in Skill 02's `BlockReason` enum.
- `WAITING_EXTERNAL` in Skill 02 means "provider operation in flight" (`externalOperationId`, `nextPollAt`, `deadlineAt`). Skills 16/19/20 wait on *internal* dependencies (binding, refresh, concurrency). No outcome fits.
- Skill 02 mandates `JobAttempt.externalEffectState = SUBMITTING` be committed *before* the network call, but the **handler** makes the call and Skill 02 exposes no function to set it (API surface: `ensureJob`, `acquireLease`, `heartbeat`, `reportExecution`, `consumeRunCancellationIntent`). Skills 08/11/14/17 write "`Skill02.externalEffectState = SUBMITTING`" as if they could; Skill 08 puts the field on `Job` (it lives on `JobAttempt`). Every execution skill *also* has its own checkpoint `SUBMITTING` state, so there are two SUBMITTING markers with no defined atomicity/ordering — the crash-safety mechanism the whole system leans on has two sources of truth.
- "handler registrado via ponteiro" — no `JobHandler` interface, no registry.

**Fix:** extend Skill 02 with `resultRef?: {kind, id, hash}`, `blockReason?`, a `WAITING_INTERNAL`/`DEFERRED` outcome (with `availableAt`), `markExternalEffect(jobId, leaseFence, attemptNumber, state, providerRequestKey?)`, a `JobHandler { stage; execute(ctx) → JobExecutionReport }` registry, and a rule that the handler checkpoint and `JobAttempt.externalEffectState` commit in the same transaction (or that only one is authoritative).

### B5. "Compatible patches" announced in later skills were never written into the owning files

Verified by grep:
- Skill 17 defines `PublicationAuthorizationResolutionRef`, `FirstRealPublishGateClaim`, `FIRST_REAL_PUBLISH_CONSUME_REQUEST` as "patch compatível na Skill 03, sem reabrir 3/25" → **Skill 03 contains none of them** (0 hits). Skill 03's `ApprovalRequestIntent` also has no `publicationTargetKey`, which its own `FIRST_REAL_PUBLISH` keying requires.
- Skill 18 defines `OwnedAffiliateClickEvent` as "patch à Skill 15" → **Skill 15: 0 hits** (and Skill 18 defines it twice, lines 96 and 626, with different shapes).
- Skill 19 defines `historicalReadStatus` and `MetricRefreshRequest` as "owned pela Skill 18" → **Skill 18: 0 hits**.
- Skill 03's `ApprovalRequestIntent` emission and `ApprovalResolvedEvent` consumption are not in Skill 01's contract list, atomicity list, or "Quem pode chamar"; `StageDefinition` has only `requiresApproval?: boolean` — no `approvalGateKey`/`approvalPolicyKey`.
- By contrast Skill 13's patch **was** applied to 09/10 (`correctionContext`). A reader cannot tell which patches are real.

**Fix:** process rule for the next round — a patch is only approved when written into the owning file's contracts and hash list; then regenerate the consolidated document.

### B6. Two incompatible quota contracts: `QuotaGuard` (01/02) vs Skill 23

- **Skills 01/02:** `QuotaGuard.evaluate(...)` → `ALLOW | PAUSE | DENY | BLOCK`, called *before emitting an intent* and *before each new Attempt* (no payload exists yet), persisted as `RunPolicyDecision`; `PAUSE` → `BLOCKED/QUOTA_PAUSED` → Run `PAUSED`.
- **Skill 23:** `QuotaAuthorizationRequest` requires `QuotaOperationIdentity` with `attemptNumber`, `inputArtifactId/Hash`, `requestPayloadHash`; decision `AUTHORIZED | DENIED | EXPIRED`; no `PAUSE`; never mentions `RunPolicyDecision` or a non-reserving pre-check. Skill 23 lists Skills 07/11/12/14/15/20 as consumers — not 01/02.
- Also inside Skill 23: `QuotaAuthorizationClass` is defined twice with different members (line 379 `PROVIDER_GENERATION_SPEND…`, patch E `EXECUTION_SPEND…`), `MonetaryControlMode` vs `MonetaryControl`, `QuotaReservation.status` (3 states) vs `QuotaReservationLifecycleState` (7). The "0 tipos duplicados" self-verification is not true.

**Fix:** Skill 23 must define the admission API Skill 01/02 call (`evaluateAdmission(tenant, class, estimate) → ALLOW|PAUSE|DENY|BLOCK`, non-reserving) separately from `authorize()` (reserving), and how a window-bound `QUOTA_LIMIT_EXCEEDED` maps to `PAUSE` + `nextResolutionAt`. Remove superseded definitions from the file.

---

## SIGNIFICANT

### S1. Skill 22 cannot satisfy Skill 03's authorization evidence; webhook tenant resolution is circular
Skill 03 requires `authorizationEvidenceRef` proving capability "para decidir **esta** `ApprovalRequest` especificamente" and tests reject "capability válida para outra `ApprovalRequest`". Skill 22's `TenantAuthorizationDecision` has `tenantId/actor/capability/decision` — no resource scope. Separately, Skill 16 says webhook tenant comes from `(providerKey, providerAccountId)` via Skill 24, but Skill 24's `IntegrationBindingResolutionRequest` requires `trustedTenantContextHash` as input — tenant is needed to find the binding that yields the tenant. **Fix:** add `resourceRef?` to Skill 22's requirement/decision; add a `PROVIDER_ACCOUNT_INGRESS` resolution source in Skill 22 backed by a Skill 24 reverse index, fail-closed on ambiguity.

### S2. `ProductVisualReferenceSet` has no identity or tenant but is a required foreign key in 10/11/12/13/20
Skill 09: `type ProductVisualReferenceSet = { subjectRef, references, referenceSetHash }`. Skill 10's `VideoGenerationIntent.productIdentityConstraints.productVisualReferenceSetId` (required), Skill 12's `VideoAuditInput.productVisualReferenceSetId` (required), Skill 13/20 refs — all point at an id that doesn't exist. Skill 09's own test #5 checks `ProductVisualReferenceSet.tenantId`, which isn't a field. `referenceSetHash` is defined over `MaterializedVisualReference.contentHash`, but the type holds unmaterialized URLs. On `NO_FRAME_REQUIRED`/`REFERENCE_UNAVAILABLE`/`TEXT_TO_VIDEO` paths nothing materializes a set, so Skills 10/12 have no id to reference. **Fix:** make it a first-class tenant-scoped artifact materialized by a step that runs even when no frame is generated; define the empty-set case.

### S3. `CreativeCtaIntent` has no identity, but Skills 16/17/19 treat it as a persisted artifact
Skill 07 embeds it in `CreativeDirectionBrief` (covered by `creativeDirectionHash`); Skills 16 (8 uses) and 17 (14 uses) require `creativeCtaIntentId` + `creativeCtaIntentHash`. Skill 07 also defines `CreativeCtaIntent` twice and omits the `inferenceProvenance` field from `CreativeDirectionSuccess` that its prose says is there. **Fix:** either define `creativeCtaIntentHash = hash(ctaIntent)` with `creativeDirectionResultId` as the id, or emit a CTA artifact from Skill 07.

### S4. Skill 12 ↔ Skill 03 evidence contract is mutually deferred; gate placement undefined
Skill 03: `hardRequirements`/`autoApproveCriteria` "depende de como a Skill 12 estrutura suas evidências" (open question). Skill 12: "Consumidores possíveis: Skill 03 (usa o audit result como evidência)". Neither defines how `VideoAuditResult` becomes `evidenceRefs`/`requiredEvidence` or how `INCONCLUSIVE` maps to `INSUFFICIENT_EVIDENCE`. No skill enumerates `approvalGateKey` values except `FIRST_REAL_PUBLISH` (used as a gate key in Skill 03 tests but as a global override in its prose). Skill 14 requires `COMPLIANT`, Skill 17 requires Skill 03 `AUTHORIZED`; which `artifactHash` (rendition? content?) an approval binds to is unstated. **Fix:** an `ApprovalEvidenceBundle` contract + verdict→outcome mapping + gate key enumeration with the artifact identity per gate.

### S5. `variantKey` is overloaded by three skills with no grammar; multi-target has no subject model
Skill 10: `variantKey = beat:<n>`. Skills 14/17: "Skill 01 materializa três intents/Jobs independentes" per `publicationTargetKey` (implies target in `variantKey`). Skill 20: `variantKey = compact(experimentVariantIdentityHash)`. A variant run with a 2-beat video for 2 targets must encode all three in one string; nothing defines it, and `StageSubjectBinding` is `UNIQUE(runId, stageKey)` — one subject per stage — so three finalization subjects per run cannot be bound. Where the Run's target list comes from is unknown (`ProductionRun` undefined). **Fix:** define a structured `variantKey` in Skill 01 and allow multiple bindings per stage keyed by it.

### S6. Multi-beat scripts → single video: no assembly stage
Skill 08 produces N beats; Skill 10 produces one prompt per beat per Job; Skill 11 one `VideoArtifact` per prompt; Skill 12 audits "the video" against all beats (`requireAllScriptBeats`); Skill 14 finalizes one artifact; Skill 17 publishes one rendition. Nobody concatenates clips — and doing so would be `SEMANTICALLY_SENSITIVE` under Skill 14's own rules. Either V1 is one-beat-per-video (then 08/12's beat machinery is over-spec) or a `VIDEO_ASSEMBLY` stage is missing. Decide explicitly.

### S7. Worker runtime is never specified; several skills assume one that doesn't exist
Skill 11 correctly designs multi-tick around Vercel's 60s (repo confirms). But Skill 12 (FFmpeg frame extraction), Skill 14 (transcode, `ASYNC_PROCESSOR` NOT_IMPLEMENTED), Skills 09/11 (download multi-MB assets and upload to Storage inside a tick), and Skill 02's pull-based workers ("elas puxam trabalho da fila") all need a runtime nobody names — Vercel cron is HTTP push. **Fix:** one architecture decision on the execution model (cron-invoked tick loop with job budget vs. dedicated worker/edge runtime) before 09/11/12/14 are implementable.

### S8. Skill 20 has no receiving contract in Skills 01/07
`VariantExecutionIntent → Skill01` — Skill 01's only run-creation path is a user `START` command; nothing accepts an execution intent, `PipelineDefinition` has no "seeded results / skip stages" construct for `reusableUpstreamArtifactRefs`, and `CreativeDirectionInput` has no `variationDirective` field (unlike the Skill 13 patch into 09/10), so Skill 07's validator would reject a mutation it never sees.

### S9. Reuse history that Skill 04 depends on has no writer
Skill 04's `ReusePolicy` needs "evidência durável de vídeo concluído/utilizável" and "publicação confirmada" with `tenantId, productId, usedAt, evidenceRef`. Skills 11/14/17 never emit it (grep 0). Assign ownership (17 on `PRIMARY_PUBLISHED`, 11/14 on `MATERIALIZED`) with a `ProductUsageEvidence` contract.

### S10. 255 canonical hashes, zero canonical serialization spec
Every hash is "sobre JSON canônico" (8 mentions) but no file defines key ordering, number formatting, unicode normalization, null-vs-absent, or default array ordering. Two implementers will produce different hashes for the same object, and every one of the ~100 `*_REPLAY_CONFLICT` checks becomes a false-positive generator that FATALs a Run. This is the single most repeated invariant in the document and it lives entirely in prose. **Fix:** one shared `CANONICAL_SERIALIZATION_V1` spec (e.g., RFC 8785/JCS + explicit rules for absent fields and decimal strings), referenced by all hash definitions.

### S11. `AuditEvent` is referenced in 23 files and defined in none
No `type AuditEvent` anywhere. Skill 25 introduces `SecurityAuditEvent` and explicitly leaves the 22 local `AuditEvent` vocabularies unreconciled. The most-cited contract in the system has no shape, no tenant scoping rule, no persistence/atomicity requirement of its own.

### S12. Error taxonomy: ~624 codes, no shared vocabulary; `RetryPolicy.retryableErrorClasses: string[]` matches against nothing defined
`JobExecutionReport.errorClass?: string` and `RetryPolicy.retryableErrorClasses: string[]` have no defined domain; the only class-like concept is FATAL/RETRYABLE/BLOCKED, which the outcome field already carries. Either define `errorClass` values or delete the field.

### S13. Two outbox mechanisms after Skill 03 said there is one
Skill 02: single-consumer outboxes keep `consumedAt` + `OutboxDeliveryMeta`; only `RunCancellationIntent` uses `OutboxConsumerDelivery`. Skill 03: "Uma única infraestrutura de entrega… Não há dois mecanismos paralelos" and its intent has no `consumedAt`. Skill 01's `LogicalJobIntent` still has `consumedAt`. Pick one.

### S14. Replay-conflict semantics in Skills 04–08 are self-contradictory
"Se existe `ProductDiscoveryResult` para `(jobId, attemptNumber)` → reutiliza, não recalcula" and, two paragraphs later, "reexecução que produziria resultado logicamente incompatível → `DISCOVERY_RESULT_REPLAY_CONFLICT` FATAL". You can only detect incompatibility by recalculating, and for Skill 04 recalculating against a mutable pool *legitimately* differs → a transient crash turns into a FATAL Run failure. Either rule alone is fine; both together are wrong. Same pattern in 05/06/07/08.

### S15. Skill 24's credential handle never reaches its consumers
Skill 24: "`IntegrationCredentialHandleRef`… consumido por Skills 10/11/16/17". `VideoProviderTarget` (10), `VideoGenerationExecution` (11), `OutboundSendCheckpoint` (16), `PublicationExecution` (17) carry `credentialScope`/`providerProfileKey` only — no handle field. The "handle seguro" promise is closed in 24 but not wired.

### S16. Skill 16 `ResponseGuard` without `suppressionWindowMs` has undefined behaviour
After `SATISFIED`, "se `now >= suppressUntil`" governs re-acquisition, but `suppressUntil` is optional and the policy says cooldown is not presumed. Is the guard permanently satisfied (user never gets the link again for that post) or immediately free (every repeated QUERO gets a DM)? The anti-spam property depends on this and it isn't stated.

### S17. "1 active Run per tenant" as a DB constraint is the hardest thing to relax later
It's explicitly a constraint "protegida no banco, não só em `if`". With B1 it also blocks background work. Suggest making it a Skill 23 `OPERATION_COUNT` policy limit instead.

---

## MINOR

- **M1 naming drift:** `stageKey` (binding) vs `stage` (intent/job); `policyVersion: number` in `FrameGenerationContext` vs `string` everywhere; `ScriptFactBasis.TREND_EVIDENCE` carries `evidenceHash`, `CreativeDecisionBasis.TREND_EVIDENCE` doesn't; Skill 12 uses `YES|NO|UNCERTAIN` and `MATCH|MISMATCH|NOT_OBSERVABLE` for the same kind of judgement; `JobResultEvent.consumedAt // UNIQUE(jobId, attemptNumber)` comment is on the wrong field; Skill 03 `onInsufficientEvidence: 'ESCALATE_TO_MANUAL'` is a single-literal "configurable" field.
- **M2 rigour theater — optional "defensive" refs:** Skills 05/06/07 accept optional `candidateRefs?`/`subjectRef?` "defesa contra payload adulterado". If the payload is untrusted, the `discoveryResultId` in the same payload is equally untrusted; the real defence is `Job.tenantId` + ownership check, which they already do. The optional field adds a FATAL path with no security value.
- **M3 rigour theater — `poolSnapshotHash`:** a fingerprint over every candidate's fields that the spec itself admits "NÃO é lock otimista" and has no consumer; determinism "dado o mesmo `poolReadAt`" is trivially true of any function that takes wall-clock as input.
- **M4 rigour theater — test counts and self-checks:** "100 casos críticos, 10 blocos de 10" (17/18/19/20/21) are tuned to round numbers and many items are restated invariants, not executable cases ("Skill 21 nunca recalcula análise"). The "0 tipos duplicados" self-verification is false in Skills 07, 18 and 23.
- **M5 over-engineering relative to V1 value:** Skill 06 (879 lines, provider fallback chains, two-level checkpoints) for a skill that will return `NO_SOURCES_AVAILABLE` 100% of the time; Skill 20 (1813 lines, 24 hashes) for observational A/B when 0 Reels have been published; Skill 21 (30 hashes); Skill 25 rate-limit ledger with opaque IP keys. Meanwhile the core (ProductionRun, worker model, handler interface, canonical serialization, AuditEvent) is under-specified. Recommend freezing 06/20/21 as "V2 contract sketch, not for implementation".
- **M6 process leak in Skill 25:** a production code change (Z-API `Client-Token` check) was applied during a spec-only phase and recorded inside the spec; fine operationally, but it contradicts the "nenhum código de runtime" premise and should live in `CONTINUIDADE.md`, not a contract.
- **M7 Skill 01 `START`:** "`runId` pré-gerado antes da criação" — client-supplied identity; needs an explicit uniqueness rule alongside `commandId` idempotency.
- **M8 Skill 18 `scheduleSlotKey`:** "derivação determinística… não precisa ser entidade persistida" — the slot rounding rule (window boundaries, timezone) is what makes two cron workers agree; it isn't stated.

---

## What is genuinely strong (so the next round doesn't throw it away)

SUBMITTING-before-network + `externalEffectState=UNKNOWN` never auto-retried (02, carried through 07–17); `StageSubjectBinding.sourceResultId` never resolved "pelo mais recente" (01); commercial identity separated from Attempt in 15/17 with `submissionSequence`; promoted ≠ purchased product carried intact from 05 to 19; the triple structural block on heuristic attribution (19/20/21); `ACCEPTED ≠ PUBLISHED ≠ correlation-confirmed` (17); `NOT_REPORTED ≠ zero` cost (23); "ausência de evidência nunca é conformidade" (12). These are real, structurally enforced, and worth protecting.

---

## Implementation-readiness verdict

**Not implementable as-is.** Skills 04, 05, 07, 08, 10, 15 are individually close to implementable, but nothing can be built end to end because the spine (01/02) does not connect to 03, 09–21 as written: there is no `ProductionRun` type, no handler contract, no `resultRef`, no re-entry for corrections, no home for webhook/scheduled jobs, no admission API in Skill 23, and three announced patches that never landed. Any code written now against 01/02 would be reworked the moment 12/13/16/18 are attempted.

**Recommended next debate round (one round, scoped to the seams, not to any single skill):**
1. Skill 01/02 amendments: `ProductionRun`/`RunRequest` types, `RunKind` or standalone-job producer contract, `StageAdapter` (build payload + interpret result), `JobHandler` registry, `JobExecutionReport` extensions (`resultRef`, `blockReason`, internal-wait outcome), `markExternalEffect` API, stage re-entry construct, structured `variantKey`.
2. Skill 23 admission API (`ALLOW|PAUSE|DENY|BLOCK`) and cleanup of duplicate enums.
3. Apply the three missing patches (03 ← 17, 15 ← 18, 18 ← 19) and Skill 01 ← 03 (`ApprovalRequestIntent`/`ApprovalResolvedEvent`, gate key in `StageDefinition`, `publicationTargetKey` in intent).
4. Shared contracts: `CANONICAL_SERIALIZATION_V1`, `AuditEvent`, `ProductVisualReferenceSet` as an artifact, `ProductUsageEvidence`, `ApprovalEvidenceBundle`, `creativeCtaIntentHash` derivation.
5. One explicit decision each on: worker runtime model, single-beat vs assembly stage, and whether 06/20/21 are V1 at all.

After that round, the walking skeleton to implement first is 01 → 02 → 04 → 05 → 07 → 08 → 10 (all deterministic or checkpointed, no media runtime), which would validate the spine before any Veo spend.