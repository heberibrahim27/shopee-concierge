# feito.md — Máquina de Vídeos

> Registra só o que foi realmente implementado e testado, seguindo a regra de
> ouro do `continuidade.md` raiz do projeto Máquina de Vídeos (fora deste
> repo — documento trocado com o ChatGPT). Este arquivo é local ao módulo
> `src/modules/video-machine/` e complementa aquele.

## Especificações de Skill (contrato aprovado, sem runtime)

| Skill | Especificada | Debatida (ChatGPT↔Claude Code) | Arquivo | Runtime implementado |
|---|---|---|---|---|
| 01 — Orquestrador de Produção | ✅ | ✅ (2 rodadas + 1 rodada de correção pós-diff) | `skills/01-orquestrador-de-producao/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 02 — Gestor de Fila/Jobs | ✅ | ✅ **APROVADA — 2/25** (2 rodadas + revisão final de consistência em 4 partes) | `skills/02-gestor-de-fila-jobs/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 03 — Gestor de Aprovação | ✅ | ✅ **APROVADA — 3/25** (debate conceitual + revisão final em 4 partes) | `skills/03-gestor-de-aprovacao/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 04 — Descoberta de Produtos | ✅ | ✅ **APROVADA — 4/25** (fundamentada em auditoria real do banco live; revisão final em 3 partes) | `skills/04-descoberta-de-produtos/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 05 — Análise de Oferta/Comissão | ✅ | ✅ **APROVADA — 5/25** (fórmulas calibradas sobre distribuição real de 790 snapshots, não chutadas) | `skills/05-analise-de-oferta-comissao/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 06 — Pesquisa de Tendências | ✅ | ✅ **APROVADA — 6/25** (auditoria real encontrou ZERO fonte de tendência operacional; spec capability-aware, sem sinais inventados) | `skills/06-pesquisa-de-tendencias/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 07 — Direção Criativa | ✅ | ✅ **APROVADA — 7/25** (auditoria real: zero lógica criativa existente; resolve o bug real da convenção "QUERO" desconectada) | `skills/07-direcao-criativa/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 08 — Roteirista | ✅ | ✅ **APROVADA — 8/25** (herda estratégia da Skill 07 sem reinterpretar; nenhuma alegação factual vira fato só por ser escrita pelo modelo) | `skills/08-roteirista/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 09 — Gerador de Frame | ✅ | ✅ **APROVADA — 9/25** (greenfield total — zero geração de imagem existente; PRODUCT IDENTITY factual vs SCENE COMPOSITION criativa; só 1 referência real por snapshot hoje) | `skills/09-gerador-de-frame/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 10 — Gerador de Prompt de Vídeo | ✅ | ✅ **APROVADA — 10/25** (greenfield total, mais vazio ainda — spike 00A nunca executado; VideoGenerationIntent provider-agnostic; adapter determinístico, nunca IA escondida) | `skills/10-gerador-de-prompt-de-video/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 11 — Executor de Geração | ✅ | ✅ **APROVADA — 11/25** (primeira Skill com side effect pago real; state machine multi-tick sob o limite de 60s do Vercel; resposta perdida nunca autoriza resubmissão) | `skills/11-executor-de-geracao/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 12 — Auditor de Vídeo | ✅ | ✅ **APROVADA — 12/25** (verdict COMPLIANT/NON_COMPLIANT/INCONCLUSIVE, nunca APPROVED/REJECTED; ausência de evidência nunca é conformidade) | `skills/12-auditor-de-video/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 13 — Corretor Automático | ✅ | ✅ **APROVADA — 13/25** (transformação determinística, sem provider externo na V1; decide O QUE corrigir, nunca SE haverá retry — isso é Skill 02) | `skills/13-corretor-automatico/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 14 — Finalizador de Vídeo | ✅ | ✅ **APROVADA — 14/25** (V1 restrita a transformações CONTENT_PRESERVING; incompatibilidade de canal vira resultado de domínio, nunca corte/crop destrutivo) | `skills/14-finalizador-de-video/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 15 — Gerador de Link/Tracking | ✅ | ✅ **APROVADA — 15/25** (não-greenfield; Skill 15 vira autoridade única do link publicável, resolvendo desconexão real LEGACY_TRACKING_BYPASS; atribuição criativo→conversão declarada UNVERIFIED, nunca assumida) | `skills/15-gerador-de-link-tracking/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 16 — Automação de Comentários/DM | ✅ | ✅ **APROVADA — 16/25** (não-greenfield; webhook QUERO→DM real migrado pra correlação exata via SocialPublicationBinding, nunca heurística de "último post"; capability-aware pro bloqueio real de Tech Provider) | `skills/16-automacao-de-comentarios-dm/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 17 — Publicador Multicanal | ✅ | ✅ **APROVADA — 17/25** (Skill pivotal fechando Skills 14/15/16; LogicalPublicationIdentity sobrevive a Jobs/Attempts/providers; FIRST_REAL_PUBLISH com claim atômico via patch compatível na Skill03; SocialPublicationBinding só nasce com identidade externa confiável) | `skills/17-publicador-multicanal/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 18 — Coletor de Métricas | ✅ | ✅ **APROVADA — 18/25** (não-greenfield na leitura — Windsor.ai Instagram real/conectado mas nunca usado; MetricCollectionInput como união discriminada por domínio; append-only temporal; AttributionEvidenceMaterializationResult com 4 níveis, nunca eleva evidência silenciosamente) | `skills/18-coletor-de-metricas/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 19 — Analista de Performance | ✅ | ✅ **APROVADA — 19/25** (deterministic derivations only, zero LLM decidindo números; AnalysisBasis como fronteira de imutabilidade; HeuristicAttributionHypothesis com triplo bloqueio estrutural contra virar evidência canônica ou score factual) | `skills/19-analista-de-performance/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 20 — Gerador de Variações | ✅ | ✅ **APROVADA — 20/25** (V1 explicitamente observacional, nunca controlled experiment; uma dimensão primária por experimento; ExperimentPlanCommit como visibility gate; Skill20 nunca declara winner/causalidade, só verifica se o plano foi satisfeito) | `skills/20-gerador-de-variacoes/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 21 — Relatórios | ✅ | ✅ **APROVADA — 21/25** (apresenta, nunca recomputa; ReportProjection semanticamente neutro sem tipo de valor "computado"; ReportSnapshot imutável independente de formato; three barreiras estruturais contra hipótese virar fato) | `skills/21-relatorios/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 22 — Gestor de Conta/Tenant | ✅ | ✅ **APROVADA — 22/25** (rodada única condensada — 1ª das 4 Skills de infra mínima; tenantId hoje é valor hardcoded, auth é senha única compartilhada; LEGACY_SHARED_ADMIN_SESSION nunca vira identidade humana nominal; capability, não rótulo "admin", é a base de autorização) | `skills/22-gestor-de-conta-tenant/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 23 — Gestor de Créditos/Quotas | ✅ | ✅ **APROVADA — 23/25** (2 rodadas, não 1 como a Skill 22 — no caminho crítico de side effects pagos reais; `spendAuthorizationRef`/`processingAuthorizationRef`/`providerOperationAuthorizationRef` reconciliados como mesma autoridade Skill23 com `QuotaAuthorizationClass` incompatíveis entre si; `QuotaExecutionClaim` separa autorização abandonável de operação já comprometida; settlement por recurso nunca por reservation inteira; overage nunca escondido/capado; `UNKNOWN` nunca libera capacidade por TTL; billing tardio sempre liquida a janela original, nunca a atual; 20 FATAL_ERROR, 16 hashes canônicos, 40 testes) | `skills/23-gestor-de-creditos-quotas/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |
| 25 — Segurança/Auditoria | ✅ | ✅ **APROVADA — 25/25** (2 rodadas — última das 25 Skills, segurança real em produção encontrada, não só arquitetura futura. Achado real confirmado e ainda não corrigido: webhook Z-API sem nenhuma validação de assinatura/token — ChatGPT recomendou contenção imediata, tratada como correção operacional urgente separada da spec, aguardando decisão do usuário; RLS habilitado sem policy em 7 tabelas ≠ "RLS desativado" (correção de premissa), mas `product_groups` genuinamente exposta via anon key; baseline de 5 security findings reais rastreáveis registrado; `SecurityFinding`/`SecurityIncident` com lifecycles independentes (incident resolvido não fecha finding automaticamente); `SecurityCredentialCompromiseHandoff` faz handoff formal pra Skill24 sem nunca carregar o secret; `SecurityGateDecision` é sempre AND, nunca "maioria"; taxonomia `SecurityConfidentialityClass`×`SecurityDataCategory` unifica as 3 listas de "nunca logar" já existentes (Skills 21/23/24) sem alterar hashes delas; 3 patches de compatibilidade aplicados na rodada 1 (SecurityFinding imutável, freshness de evidence, invariantes de retenção); 20 FATAL_ERROR, 18 hashes canônicos, 40 testes) | `skills/25-seguranca-auditoria/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |

## 🏁 Marco: as 25 Skills estão especificadas e aprovadas (2026-09-18)

Todas as 25 Skills da Máquina de Vídeos foram debatidas com o ChatGPT,
auditadas contra o estado real do repositório, e formalmente
aprovadas — de `01-orquestrador-de-producao` a
`25-seguranca-auditoria`. Nenhuma linha de código de produção foi
criada a partir dessas specs ainda (todas seguem `NOT_IMPLEMENTED`
deliberadamente).

**Próxima fase, já estabelecida desde o início do projeto**:
1. Consolidar as 25 `SPEC.md` num documento único.
2. Enviar pra revisão do **Claude Fable 5 Max**.
3. Rodar réplica/tréplica entre ChatGPT ↔ Claude Code se o Fable Max
   levantar objeções.
4. Revisão final do **GPT-6 Astra**.
5. Só depois disso começa a implementação real (Etapa 00/spike).

## 🔧 Reparo transversal pós-revisão Fable (em andamento, 2026-09-18)

As 25 `SPEC.md` foram consolidadas (`consolidado/SPECIFICATION-CONSOLIDADA.md`,
30 mil linhas) e enviadas pra revisão independente do **Claude Fable 5
Max**. Veredito: ideias centrais sólidas, mas **não implementável como
está** — as Skills 01/02 (o "orquestrador" e a "fila de jobs", escritas
antes das Skills 09-25 existirem) não se conectam estruturalmente ao que
as Skills posteriores realmente precisam. 6 achados **bloqueantes**
(B1-B6), 17 significativos, 8 menores. ChatGPT e Claude Code concordaram
um plano de reparo em 7 pontos (A-G) pra resolver os 6 bloqueantes — o
usuário autorizou seguir sem pausar pra aprovação a cada ponto
("Continue não pare até resolver").

- **Ponto A** (resolve B3 — "o que é `ProductionRun`?"): a Skill 01
  nunca havia definido de fato sua entidade central. Criado
  `ProductionRun`/`StageExecution`/`SkillExecutionAdapter` e toda a
  camada de adaptação — a Skill 01 agora só conhece refs/hashes
  opacos, nunca tipos de domínio de cada Skill. Aplicado na Skill 01.
- **Ponto B** (resolve B4 — "como a Skill 02 fala com as outras 23
  Skills?"): criado `SkillJobHandlerDescriptor`/`JobExecutionResult` —
  o "recibo" de resultado que várias Skills já citavam mas que nunca
  existia de verdade. Aplicado nas Skills 01/02.
- **Ponto C** (resolve B1 — webhooks/schedulers/tarefas de fundo não
  conseguiam pedir trabalho sem um `ProductionRun` humano já em
  andamento): criado o caminho `STANDALONE` (trabalho autônomo,
  disparado por evento externo) paralelo ao `RUN_SCOPED` (trabalho
  dentro de uma produção). Aplicado nas Skills 01/02.
- **Ponto D** (resolve B2 — o ciclo de correção automática "Skill 12
  reprova → Skill 13 corrige → gera de novo" não tinha caminho real):
  criado `StageIteration` — uma correção sempre vira nova iteração +
  novo Job, nunca reabre um Job antigo já `SUCCEEDED`. Aplicado nas
  Skills 01, 02, 09, 10, 11, 12, 13, 20.
- **Ponto E** (resolve metade do B6 — dois sistemas de quota
  incompatíveis): a Skill 23 vira a única autoridade de quota de
  verdade; o `QuotaGuard` citado nas Skills 01/02 vira só um nome de
  checkpoint, sem lógica própria concorrente. Aplicado nas Skills 01,
  02, 23 (+ notas nas Skills 07, 11, 12, 14, 15, 20). Durante a limpeza,
  encontrada e corrigida uma duplicata real pré-existente
  (`CreativeCtaIntent`, Skill 07, declarado duas vezes).
- **Ponto F** (resolve B5 — três "patches compatíveis" que Skills
  posteriores já haviam desenhado e citado no próprio cabeçalho, mas
  cujo conteúdo nunca chegou a ser escrito no arquivo dono de verdade):
  - **F1**: patch da Skill 17 → Skill 03 (`PublicationAuthorizationResolutionRef`,
    `FirstRealPublishGateClaim`) — Skill 17 já tinha desenhado isso
    inteiro desde sua aprovação (17/25), citando "inclui um patch
    compatível na Skill 03" no cabeçalho, mas nunca escreveu de fato lá.
    Conteúdo portado sem alteração de forma pro `SPEC.md` da Skill 03.
  - **F2**: `OwnedAffiliateClickEvent` → dono formal vira a Skill 15
    (antes só existia, duplicado, dentro da própria Skill 18 — achado
    exato da revisão Fable). Definição canônica única criada na Skill
    15; Skill 18 passa a só consumir.
  - **F3**: patch da Skill 19 → Skill 18 (`MetricRefreshRequest`,
    `historicalReadStatus`) — mesma situação da F1: Skill 19 (19/25)
    já tinha desenhado tudo, citava o patch no cabeçalho, nunca havia
    sido escrito na Skill 18 de fato. Conteúdo portado sem alteração de
    forma.
  - Cada patch some do arquivo "convidado" (vira nota `REFERENCE ONLY`
    apontando pro dono) e passa a existir só no arquivo dono real —
    fechando literalmente o gap que a Fable apontou.
  - Aplicado nas Skills 03, 15, 17, 18, 19. Conteúdo final rechecado
    contra a conversa real com o ChatGPT (não só contra o rascunho local
    que já existia nas Skills 17/19 — que tinha nomes de campo
    diferentes da versão final debatida no Ponto F) — 2 rodadas de
    auto-verificação, a segunda pegou e corrigiu divergências reais de
    nome de tipo/campo antes de fechar o ponto. Auto-verificado: zero
    tipo duplicado dentro de cada arquivo tocado, 4 hashes novos
    (`FIRST_REAL_PUBLISH_CLAIM_V1`, `FIRST_REAL_PUBLISH_GATE_DECISION_V1`,
    `OWNED_AFFILIATE_CLICK_EVENT_V1`, `METRIC_REFRESH_REQUEST_V1`), 5
    `FATAL_ERROR` novos (3 na Skill 03, 1 na Skill 15, 1 na Skill 18).
- **Ponto G** (resolve o restante do B6 — QA global da especificação):
  o ChatGPT apontou que nossa autoverificação nos Pontos A-F (grep
  `^type \w+`) tinha um ponto cego estrutural real — não pega
  declaração indentada dentro de bloco de lista/texto — e propôs
  substituir por uma ferramenta real baseada em AST do compilador
  TypeScript, não regex. Construída e rodada de verdade:
  [`scripts/contract-lint.mjs`](../../scripts/contract-lint.mjs) (Node,
  usa a lib `typescript` já presente no projeto), documentada em
  [`CONTRACT-LINT.md`](CONTRACT-LINT.md). Ela extrai os blocos
  ` ```ts `/` ```typescript ` de cada um dos 25 `SPEC.md`, parseia com
  o AST real e detecta símbolo (`type`/`interface`) duplicado dentro do
  mesmo arquivo e código `FATAL_ERROR` duplicado dentro do mesmo
  arquivo. Rodada sobre o corpus real, **encontrou 3 duplicatas
  genuínas que a verificação manual dos Pontos A-F e das 25 aprovações
  individuais não tinha pego** — confirmando exatamente o diagnóstico
  do ChatGPT: `MetricSnapshot` (Skill 18, declaração antiga esquecida
  dentro de um item de lista numerada, redundante com a versão completa
  mais abaixo), `ComparisonEligibility` (Skill 19, mesmo padrão — nome
  reaproveitado de um rascunho antigo dentro de texto), e o código
  `FRAME_REQUIREMENT_UNSATISFIABLE` listado duas vezes na Skill 09. As
  três foram corrigidas (a declaração antiga virou nota apontando pra
  versão completa/canônica). Rodando de novo depois da correção:
  `errorCount=0`, 25/25 SPEC.md presentes, **PASS**. O ChatGPT também
  desenhou um ruleset bem mais amplo (registry formal de ownership
  cross-skill, hash binding, baseline/CI — G002 a G090) — documentado
  em `CONTRACT-LINT.md` como especificação pra expansão futura, não
  implementado agora (decisão técnica registrada: o valor imediato que
  a Fable expôs, símbolo duplicado sem dono, já está coberto pela V1
  real; o resto exige bootstrap de ownership das 25 Skills e uma
  infraestrutura de CI que ainda não tem consumidor, já que nenhum
  runtime existe).

## 🏁 Ponto final: reparo transversal A-G concluído (2026-09-18)

Com o Ponto G passando (`errorCount=0`, `PASS`), os 6 achados
bloqueantes do Claude Fable 5 Max estão fechados em nível de
especificação: B1 (Ponto C), B2 (Ponto D), B3 (Ponto A), B4 (Ponto B),
B5 (Ponto F), B6 (Pontos E + G). Nenhuma Skill perde seu número de
aprovação (`N/25`) — os reparos são patches compatíveis, não
reaberturas. Runtime continua `NOT_IMPLEMENTED` em todas as 25 Skills
(fase deliberada de especificação); a única exceção é a própria
ferramenta de lint, que precisava existir e rodar de verdade pra ter
valor real. Restam os 17 achados significativos + 8 achados menores da
revisão Fable, ainda não trabalhados — próxima decisão de escopo/tempo
é do usuário.

Metodologia usada em cada ponto: ChatGPT propõe → Claude Code aplica no
`SPEC.md` real (ou, no caso do Ponto G, constrói e roda uma ferramenta
real) → auto-verificação → confirmação enviada de volta ao ChatGPT →
próximo ponto, sem pausar (instrução explícita do usuário). Nenhuma
Skill perde seu número de aprovação (`N/25`) — os reparos são patches
compatíveis, não reaberturas.

## 🔧 Segunda rodada: os 17 achados "significativos" + 8 "menores" do Fable (em andamento, 2026-09-18)

Usuário autorizou explicitamente ("Corrija tudo") continuar pros
achados não-bloqueantes da revisão Fable. O texto completo original
(S1-S17, M1-M8) havia sido perdido — só o resumo dos 6 bloqueantes
sobreviveu à compactação da conversa. Recuperado do transcript bruto
do subagente, salvo em
[`consolidado/FABLE-REVIEW-2026-09-18.md`](consolidado/FABLE-REVIEW-2026-09-18.md).

Triagem contra a espinha dorsal A-G já estabilizada: **S8** e **S17**
já resolvidos pelo Ponto C (`StandaloneWorkRequest`); metade de **S3**
(a duplicata de `CreativeCtaIntent`) já resolvida nos Pontos E+G; parte
de **M4** ("0 tipos duplicados" era falso em 07/18/23) agora é verdade
real, confirmada pela ferramenta de lint. Restam 15 achados
significativos + a maioria dos 8 menores.

- **S10 — CLOSED** (255 hashes canônicos citavam "JSON canônico" sem
  nunca definir o que isso significa de fato — ordem de chaves,
  formatação de número, Unicode, null-vs-ausente — cada implementador
  produziria um hash diferente pro mesmo dado, e cada verificação
  `*_REPLAY_CONFLICT` do sistema viraria gerador de falso alarme).
  Criado [`contracts/CANONICAL-SERIALIZATION.md`](contracts/CANONICAL-SERIALIZATION.md) —
  contrato compartilhado de nível de projeto (`CANONICAL_SERIALIZATION_V1`,
  baseado em RFC 8785/JSON Canonicalization Scheme + SHA-256), definindo
  precisamente as 40+ regras que faltavam. Aplicado como nota-ponteiro
  curta em cada uma das 25 `SPEC.md` (sem reescrever as 255 definições
  de hash individuais). 3 vetores de teste do ChatGPT foram recalculados
  de forma independente e bateram exatamente. Ferramenta de lint ganhou
  uma checagem nova e barata (`G_S10_CANONICAL_SERIALIZATION_REFERENCE_MISSING`)
  confirmando que as 25 Skills referenciam a regra. `errorCount=0, PASS`
  depois de aplicado.
- **S11 — CLOSED** (`AuditEvent` era citado em 23 dos 25 `SPEC.md` mas
  nunca tinha sido definido em lugar nenhum — cada Skill inventava sua
  própria ideia do que isso significava). Criado
  [`contracts/AUDIT-EVENT.md`](contracts/AUDIT-EVENT.md) — contrato
  compartilhado de nível de projeto (`AUDIT_EVENT_V1`, baseado no S10):
  `tenantId` sempre obrigatório, ator/recurso/correlação com forma
  própria, append-only (nunca `UPDATE`, só novo evento), idempotente
  por `(tenantId, auditEventKey)`, e regra de atomicidade forte
  (mudança de estado interna + seu `AuditEvent` sempre na mesma
  transação). Mantém `SecurityAuditEvent` da Skill 25 como contrato
  irmão, nunca fundido. Aplicado como nota-ponteiro curta nas 23
  Skills consumidoras (nota diferente e mais específica na Skill 25).
  Ferramenta de lint ganhou 2 checagens novas
  (`G_S11_AUDIT_EVENT_REFERENCE_MISSING`/
  `G_S11_AUDIT_EVENT_LOCAL_REDECLARATION`). `errorCount=0, PASS`.
- **S12 — CLOSED** (`JobExecutionReport.errorClass?: string` e
  `RetryPolicy.retryableErrorClasses: string[]` não tinham domínio
  compartilhado — permitiam `errorClass="TEMP"` +
  `retryableErrorClasses=["TRANSIENT"]` sem erro de tipo). Decisão:
  **eliminar** os dois campos em vez de inventar mais uma taxonomia —
  o protocolo do Ponto B (`JobFailureCategory`/`JobRetryAdvice`/
  descriptors) já resolvia isso, só faltava dizer explicitamente.
  Criado [`contracts/ERROR-TAXONOMY.md`](contracts/ERROR-TAXONOMY.md):
  `MachineReasonCode` (gramática `SKILL<NN>.<CODE>`/`PROJECT.<CODE>`,
  reaproveitada dos códigos que já existiam informalmente), matriz
  conservadora de quais categorias de falha podem ser retentadas
  (infraestrutura/provider sim; validação/contrato/segurança/interno/
  desconhecido não). `RetryPolicy` volta a controlar só mecânica
  (`maxAttempts`/`backoff`), nunca classificação de erro. **0 hashes
  novos, 0 `FATAL_ERROR` novos** — o `JOB_EXECUTION_RESULT_CONTRACT_VIOLATION`
  já existente do Ponto B passou a cobrir também violações da matriz.
  Os dois campos legados marcados `NON-AUTHORITATIVE LEGACY` nas
  Skills 01/02 (não deletados, por segurança histórica). Ferramenta de
  lint ganhou checagem real via AST (`G_S12_LEGACY_ERROR_FIELD_UNMARKED`)
  que varre `PropertySignature` do TypeScript, não texto. `errorCount=0,
  PASS`.
- **S13 — CLOSED** (a Skill 03 já afirmava "uma única infraestrutura de
  entrega, não há dois mecanismos paralelos" — mas a Skill 02 descrevia
  `OutboxDeliveryMeta` como válido pra outbox single-consumer, e a
  Skill 01 ainda usava `LogicalJobIntent.consumedAt` cru — os dois
  mecanismos coexistiam de fato, mesmo com a Skill 03 prometendo que
  não). `OutboxConsumerDelivery` vira a única autoridade canônica de
  entrega, **mesmo pra outbox single-consumer** — nunca mais "1
  consumer → consumedAt, N consumers → OutboxConsumerDelivery" (isso
  criava dois caminhos de runtime). `consumedAt` legado marcado
  `NON-AUTHORITATIVE` nas Skills 01/02/03 (mesmo padrão de `BlockReason`/
  `errorClass`), nunca deletado. De brinde: corrigido também o comentário
  de `JobResultEvent` que estava colado no campo errado (achado M1 do
  Fable). **0 hashes novos, 0 `FATAL_ERROR` novos.** Ferramenta de lint
  ganhou uma checagem por allowlist (`G_S13_CONSUMED_AT_OUTSIDE_ALLOWLIST`/
  `G_S13_CONSUMED_AT_UNMARKED`) que, rodada pela primeira vez, **achou
  um terceiro caso real que nem o Fable nem o ChatGPT tinham citado**:
  `ApprovalResolvedEvent.consumedAt` na Skill 03, mesmo padrão de bug —
  corrigido no mesmo commit. `errorCount=0, PASS`.
- **S14 — CLOSED** (Skills 04-08 diziam ao mesmo tempo "se existe
  resultado → reutiliza, não recalcula" **e** "reexecução que
  produziria resultado logicamente incompatível → `*_REPLAY_CONFLICT`
  FATAL" — só dá pra saber se "seria incompatível" recalculando
  primeiro, contradizendo a primeira regra; para a Skill 04, recalcular
  contra um pool mutável de produtos legitimamente diverge entre
  execuções, então um crash transiente virava `FATAL` de Run inteira).
  Criado [`contracts/RESULT-MATERIALIZATION.md`](contracts/RESULT-MATERIALIZATION.md):
  regra central — "idempotência exige reuso determinístico de um
  resultado materializado; não exige que a recomputação seja
  determinística" — resultado existente nunca é recalculado pra
  comparar, só reutilizado; `*_RESULT_REPLAY_CONFLICT` passa a
  significar exclusivamente colisão real de identidade persistida
  (mesma chave, conteúdo diferente tentando ser *escrito*), nunca
  "fonte externa mudou"/"modelo respondeu diferente". Editados os
  trechos contraditórios reais nas 5 Skills (04, 05 — 2 ocorrências,
  06, 07, 08). **0 hashes novos, 0 `FATAL_ERROR` novos** — os
  `*_RESULT_REPLAY_CONFLICT` existentes são reaproveitados só com
  significado corrigido. Lint ganhou checagem textual
  (`G_S14_CONTRADICTORY_REPLAY_LANGUAGE`) que, rodada pela primeira
  vez, **achou um terceiro ponto real na Skill 05** (bloco de testes
  críticos) que a revisão manual tinha deixado passar. `errorCount=0,
  PASS`.
- **S15 — CLOSED** (Skill 24 prometia `IntegrationCredentialHandleRef`
  "consumido por Skills 10/11/16/17", mas nenhuma das 4 tinha o campo
  de fato — só `credentialScope`/`providerProfileKey`). Correção
  diferente da sugestão literal do Fable: não forçar o handle na
  Skill 10 (que só planeja/escolhe o alvo de geração, nunca chama o
  provider) — separação planning/execution. `VideoProviderTarget`
  (Skill 10) ganhou `integrationBindingRef` (reaproveitando
  `IntegrationBinding` já existente) mas **nunca** o handle de
  credencial; `VideoGenerationExecution` (Skill 11),
  `OutboundSendCheckpoint` (Skill 16) e `PublicationExecution`
  (Skill 17) — as 3 Skills que realmente fazem chamada autenticada de
  rede — ganharam `credentialHandleRef` real, congelado antes de
  `SUBMITTING`, imutável depois do side effect. Skill 24 ganhou seção
  "Credential-handle consumption boundary" formalizando regra de
  rotação de segredo (handle sobrevive à rotação do token por trás) e
  revalidação obrigatória antes de cada chamada de rede. **0 hashes
  novos** (patch in-place dos 3 projections existentes), **0
  `FATAL_ERROR` novos** — `INTEGRATION_TENANT_MISMATCH`/
  `INTEGRATION_PROVIDER_MISMATCH`/`INTEGRATION_CREDENTIAL_HANDLE_MISMATCH`
  (já existentes na Skill 24) já cobrem os casos de mismatch, evitando
  duplicar código de erro só porque os nomes novos seriam mais
  bonitos. Lint ganhou 3 checagens novas via AST — testada na prática
  (injetei um campo errado, confirmei que o lint reprova, removi o
  teste). `errorCount=0, PASS`.
- **S16 — CLOSED** (`ResponseGuard.suppressUntil?: string` opcional
  carregava duas semânticas ambíguas — "ausente = nunca mais responde"
  ou "ausente = responde imediatamente de novo" nunca foi decidido).
  Criado `ResponseSuppressionPolicy` discriminado e **obrigatório**
  (`ONCE_PER_GUARD` — satisfeito pra sempre para aquele guard específico
  — ou `WINDOWED` com `suppressionWindowMs > 0`). V1 não tem modo
  "sem supressão nenhuma". Regra "SATISFIED + `now >= suppressUntil`"
  virou branch explícito por `mode`, nunca mais um `if` sem tratar
  ausência. `suppressUntil` sempre derivado do `lastAcceptedAt` real
  (nunca recalculado a cada replay, o que prolongaria o bloqueio
  indefinidamente). **0 hashes novos, 0 `FATAL_ERROR` novos** —
  reaproveitados `INVALID_SOCIAL_RESPONSE_POLICY` (policy inválida) e
  `SOCIAL_RESPONSE_GUARD_STATE_CORRUPT` (guard com estado
  inconsistente) já existentes. Lint ganhou 2 checagens — testada na
  prática. `errorCount=0, PASS`.
- **S1 — CLOSED** (duas lacunas ligadas: (A) `TenantAuthorizationDecision`
  da Skill 22 provava "ator pode aprovar no tenant", nunca "ator pode
  aprovar ESTA `ApprovalRequest` exata" — brecha real, já antecipada
  como caso de teste na Skill 03 mas nunca formalizada no tipo; (B)
  resolução de tenant no webhook da Skill 16 era circular — precisava
  de binding da Skill 24, que por sua vez exige tenant já confiável).
  Parte A: criado `TenantAuthorizationScope` discriminado e
  **obrigatório** (`{kind:'TENANT'}` | `{kind:'EXACT_ARTIFACT',
  resourceRef}`) em `TenantAuthorizationRequirement`/
  `TenantAuthorizationDecision`; Skill 03 formalizada para exigir
  `authorizationScope.kind='EXACT_ARTIFACT'` apontando pra
  `ApprovalRequest` exata. Parte B: novo mecanismo de bootstrap —
  `ProviderAccountIngressResolutionRequest`/`ProviderAccountIngressResolution`
  na Skill 24 (localiza o binding candidato `providerAccountId →
  tenantId`, sem carregar `tenantId`/`trustedTenantContextHash` porque
  ainda não existem nesse momento) + novo source
  `PROVIDER_ACCOUNT_INGRESS` no `TrustedTenantContext` da Skill 22, que
  só emite o contexto confiável combinando a resolução da Skill 24 com
  evidência real de autenticação do provider (nunca o binding sozinho).
  Skill 16 corrigida: nunca resolve tenant sozinha, só consome o
  `TrustedTenantContext` já validado pela Skill 22.
  `IntegrationBindingResolutionRequest.trustedTenantContextHash`
  continua obrigatório, sem enfraquecimento. **1 hash novo**
  (`PROVIDER_ACCOUNT_INGRESS_RESOLUTION_V1`), **1 `FATAL_ERROR` novo em
  cada Skill** (Skill 22:
  `TENANT_CONTEXT_INGRESS_IDENTITY_MISMATCH`/
  `PROVIDER_ACCOUNT_INGRESS_EVIDENCE_MISSING`; Skill 24:
  `INTEGRATION_PROVIDER_ACCOUNT_INGRESS_AMBIGUOUS`) — sem reaproveitar
  porque são falhas de um mecanismo novo, não equivalentes a nenhum
  código existente. Lint ganhou 4 checagens novas via AST — testadas na
  prática (injetados os 3 tipos de violação: `authorizationScope`
  removido, `tenantId` adicionado no request de bootstrap,
  `trustedTenantContextHash` tornado opcional; confirmado
  `errorCount=3, FAIL`; revertido). `errorCount=0, PASS`.

- **S2 — CLOSED** (`ProductVisualReferenceSet` da Skill 09 não tinha
  `id`/`tenantId`, e as branches `NO_FRAME_REQUIRED`/implícito
  `TEXT_TO_VIDEO` do resultado da Skill 09 simplesmente nunca
  materializavam nenhum set — Skills 10/11/12/13/20 ficavam com FK
  apontando pra uma entidade que às vezes não existia). Regra nova:
  toda execução válida da Skill 09 produz exatamente um
  `ProductVisualReferenceSet`, `POPULATED` ou `EMPTY` (nunca ausente).
  Criado `ProductVisualReferenceSetContent` discriminado
  (`POPULATED` exige `references.length>=1`; `EMPTY` exige `[]` +
  `emptyReason` obrigatório entre `NO_FRAME_REQUIRED`/
  `REFERENCE_UNAVAILABLE`/`TEXT_TO_VIDEO`, com precedência
  determinística documentada pra evitar duas implementações
  escolherem motivos diferentes pro mesmo caso). Criado
  `ProductVisualReferenceSetRef` (id+hash, sem hash próprio) e
  padronizado em todos os 5 consumers (Skill10 `VideoGenerationIntent`/
  `VideoPromptArtifact`, Skill11 `VideoGenerationExecution`, Skill12
  `VideoAuditInput`, Skill13 `CorrectionInput`), sempre obrigatório
  (nunca opcional) — substituindo o par solto
  `referenceSetId`/`referenceSetHash` que existia em 4 desses lugares.
  Hash `PRODUCT_VISUAL_REFERENCE_SET_V1` recalculado via
  `CANONICAL_SERIALIZATION_V1` (S10) sobre `tenantId`+`subjectRef`+
  `content` (references canonicalizadas e ordenadas antes do hash,
  set-like não sequence-like) — os três `EMPTY` produzem hashes
  diferentes entre si porque `emptyReason` participa do conteúdo.
  **0 hashes novos** (reaproveitado `PRODUCT_VISUAL_REFERENCE_SET_V1`
  já existente, só redefinido/formalizado), **0 `FATAL_ERROR` novos**
  (`FRAME_TENANT_MISMATCH`/`FRAME_SUBJECT_BINDING_MISMATCH`/
  `FRAME_RESULT_REPLAY_CONFLICT` na Skill09 e
  `VIDEO_PROMPT_VISUAL_REFERENCE_SET_MISMATCH` na Skill10 já cobriam
  todos os casos). Lint ganhou 5 checagens novas via AST (2 delas
  corpus-wide: FK naked e nome de campo pré-S2 banido em qualquer
  Skill) — testadas na prática (injetei 3 violações reais, confirmei
  `errorCount=3, FAIL`, revertido). `errorCount=0, PASS`.

- **S3 — CLOSED** (Skills 16/17 tratavam `CreativeCtaIntent` — um value
  object aninhado dentro de `CreativeDirectionResult`/Skill 07 — como
  se tivesse identidade persistente própria (`creativeCtaIntentId`),
  que nunca foi criada em lugar nenhum). Decisão: **não** criar
  artifact persistido novo (evita storage/lifecycle/provenance
  duplicada sem necessidade real no V1) — solução escolhida entre as
  opções do Fable. CTA continua pertencendo ao `CreativeDirectionResult`,
  ganha hash canônico próprio (`creativeCtaIntentHash`, schema
  `CREATIVE_CTA_INTENT_V1`), e sua identidade completa passa a ser
  parent exato (`creativeDirectionResultId`+`creativeDirectionHash`) +
  esse sub-hash, via novo `CreativeCtaIntentRef` (Skill07, owner).
  `creativeDirectionHash` (hash do parent) já incluía `direction` por
  completo — e portanto já se comprometia com o CTA transitivamente —
  então não foi reescrito, evitando churn desnecessário. Substituído o
  par solto `creativeCtaIntentId`/`creativeCtaIntentHash` por
  `creativeCtaIntentRef: CreativeCtaIntentRef` em 8 lugares reais (2 na
  Skill16 + 6 na Skill17, incluindo o tipo compartilhado
  `SocialPublicationBindingRef`), sempre obrigatório onde já era
  obrigatório. **0 artifacts novos**, **1 hash novo**
  (`CREATIVE_CTA_INTENT_V1`, sub-hash — não hash de artifact
  top-level), **0 `FATAL_ERROR` novos** — Skill16 já tinha
  `CREATIVE_CTA_INTENT_NOT_FOUND`/`CREATIVE_CTA_INTENT_HASH_MISMATCH` e
  Skill17 já tinha `PUBLICATION_CTA_INTENT_NOT_FOUND`/
  `PUBLICATION_CTA_INTENT_HASH_MISMATCH`/`PUBLICATION_CTA_LINEAGE_MISMATCH`
  — todos reaproveitados exatamente como estavam. Lint ganhou 4
  checagens novas via AST (a principal é corpus-wide: bane
  `creativeCtaIntentId` em qualquer Skill, sem allowlist) — testadas na
  prática (injetei 3 violações, confirmei `errorCount=3, FAIL`,
  revertido). `errorCount=0, PASS`.

- **S4 — CLOSED** (Skill 03 e Skill 12 se citavam mutuamente sem nunca
  fechar o contrato de evidência de aprovação — "Questões abertas" da
  Skill 03 dizia que o formato de `hardRequirements`/
  `autoApproveCriteria` dependia de como a Skill 12 estruturasse suas
  evidências, nunca especificado; a Skill 12 só citava a Skill 03 como
  "consumidor possível", nunca normativo). Decisão: **Skill 03 é dona
  do contrato de evidência**; Skill 12 continua dona de
  `VideoAuditResult`, só fornece a fonte — sem segundo sistema de
  aprovação. Criado `ApprovalGateKey` (`VIDEO_COMPLIANCE` |
  `FIRST_REAL_PUBLISH`, V1 fechado, não configurável por admin) com
  tabela normativa de subject exato por gate (`VIDEO_COMPLIANCE` →
  exact `VideoArtifact`; `FIRST_REAL_PUBLISH` → exact
  `PublicationIntent`, nunca `VideoAuditResult`/`FinalizedRendition`
  soltos — resolve a pergunta central do Fable "qual artifactHash está
  sendo aprovado?"). Criado `ApprovalEvidenceOutcome`
  (`SATISFIES_REQUIREMENT`/`VIOLATES_REQUIREMENT`/
  `INSUFFICIENT_EVIDENCE` — nível do item de evidência, nunca
  confundido com `APPROVED`/`REJECTED` da decisão real),
  `ApprovalEvidenceItem`, `ApprovalEvidenceCoverage`
  (`COMPLETE`/`MISSING_REQUIRED_EVIDENCE` — distingue "sem evidência"
  de "evidência existe mas inconclusiva") e `ApprovalEvidenceBundle`
  (artifact novo, imutável, tenant-scoped). Mapeamento normativo
  `VideoAuditResult.verdict` → `ApprovalEvidenceOutcome` congelado nas
  duas specs (`COMPLIANT`→`SATISFIES_REQUIREMENT`,
  `NON_COMPLIANT`→`VIOLATES_REQUIREMENT`,
  `INCONCLUSIVE`→`INSUFFICIENT_EVIDENCE`, nunca `VIOLATES` — `Job`
  continua `SUCCEEDED` nos dois casos, Ponto D intacto).
  `ApprovalDecision` (o tipo real por trás do que o debate chamava de
  "ApprovalResolution") ganhou `approvalEvidenceBundleRef` obrigatório,
  sempre distinto de `authorizationEvidenceRef` (Ponto S1) — "quem pode
  decidir" nunca se confunde com "o que as evidências dizem".
  `FIRST_REAL_PUBLISH` continua manual-only mesmo com evidence
  `SATISFIED` (regra F1 preservada). **1 hash novo**
  (`APPROVAL_EVIDENCE_BUNDLE_V1`), **3 `FATAL_ERROR` novos**
  (`APPROVAL_GATE_SUBJECT_TYPE_MISMATCH`,
  `APPROVAL_EVIDENCE_SUBJECT_MISMATCH`,
  `APPROVAL_EVIDENCE_BUNDLE_REPLAY_CONFLICT` — grep prévio confirmou
  que a Skill 03 usa vocabulário `*_CONFLICT`/`*_MISMATCH` próprio, sem
  bloco `FATAL_ERROR` formal, mesmo padrão do Ponto F1; nenhum
  equivalente reaproveitável encontrado). Lint ganhou 5 checagens
  novas — durante a escrita, a própria prosa explicando a correção
  citou as frases banidas verbatim e disparou a checagem contra si
  mesma (mesmo padrão do S14), corrigido parafraseando. Testado
  empiricamente (removido `approvalEvidenceBundleRef`, confirmado
  `errorCount=1, FAIL`, revertido). `errorCount=0, PASS`.

- **S9 — CLOSED** (a `ReusePolicy` da Skill 04 não tinha fonte canônica
  pra "esse produto já foi usado?" — risco real de a implementação
  **adivinhar** olhando artifacts espalhados: existe `VideoArtifact`?
  existe `FinalizedVideoRendition`? `PublicationExecution` parece
  `PUBLISHED`? — misturando produção, finalização e tentativa de
  publicação). Criado `ProductUsageEvidence` (ledger durável,
  append-only, tenant-scoped, owner Skill 04) com
  `usageKind: 'MATERIALIZED' | 'PRIMARY_PUBLISHED'` — fatos diferentes,
  nunca um gravado implicitamente como o outro, com relação de
  precedência (`MATERIALIZED < PRIMARY_PUBLISHED`) em vez de union
  artificial. Matriz fechada de writers: Skill 11 e Skill 14 autorizadas
  pra `MATERIALIZED` (derivado de `VideoArtifact.materializedAt` e
  `FinalizedVideoRendition.createdAt` respectivamente); Skill 17 única
  writer de `PRIMARY_PUBLISHED` (derivado de
  `ProviderPublicationReceipt.observedAt`, preservando
  `ACCEPTED≠PUBLISHED≠confirmado`) — nenhuma escreve fora da própria
  linha da matriz. `usedAt` sempre semântico (do fato de origem), nunca
  o instante do registro (`recordedAt`, fora do hash). `ReusePolicy`
  ganhou `minimumUsageEvidenceKind` e passa a trabalhar por
  **recência** (`usedAt` mais recente entre evidências qualificantes),
  nunca por contagem de linhas — evita que Skill 11 + Skill 14 gravando
  `MATERIALIZED` pro mesmo produto virem "duas campanhas". Histórico
  nunca é apagado por evento posterior (publicação deletada, vídeo
  descartado). **1 hash novo** (`PRODUCT_USAGE_EVIDENCE_V1`), **4
  `FATAL_ERROR` novos** (`PRODUCT_USAGE_EVIDENCE_SOURCE_INVALID`/
  `TENANT_MISMATCH`/`PRODUCT_MISMATCH`/`REPLAY_CONFLICT` — grep prévio
  confirmou que não havia equivalente pra este ledger cross-cutting
  novo). Lint ganhou 2 checagens novas — a checagem de matriz de
  writers foi **deliberadamente não implementada** via regex (o próprio
  debate avisou do mesmo risco de self-trigger já visto no S4/S14).
  Testado empiricamente (removido `recordedAt` + removida referência ao
  hash na Skill11, confirmado `errorCount=2, FAIL`, revertido).
  `errorCount=0, PASS`.

- **S5 — CLOSED** (a maior cirurgia estrutural desta rodada — kernel,
  não só um patch de Skill de domínio). Achado real do Fable:
  `variantKey` era uma string livre sem gramática carregada por
  `LogicalJobIntent`/`Job`, onde diferentes Skills comprimiam
  significados diferentes (`Skill10 → "beat:2"`, `Skill14/17 → target
  embutido`, `Skill20 → compact(experimentVariantIdentityHash)`) — e
  `StageSubjectBinding` tinha `UNIQUE(runId, stageKey)`, que quebrava
  exatamente quando o mesmo subject (ex.: um `FinalizedVideo`) precisa
  de bindings distintos pra `target Instagram` e `target TikTok`.
  Decisão: **não formalizar uma gramática pra `variantKey`** (isso só
  cristalizaria o erro) — retirá-lo do kernel como coordenada de
  execução e representar as três dimensões comprimidas
  (`creativeVariant`/`beat`/`publicationTarget`) separadamente. Criado
  `StageWorkUnitAxis` (3 eixos V1 fechados, não `string` livre),
  `StageSubvalueIdentity`/`StageBeatIdentity` (subvalor sempre amarrado
  ao artifact pai exato, nunca hash solto), `StageWorkUnitIdentity`
  (`BASE` | `DIMENSIONAL` com pelo menos um eixo, objeto estruturado —
  não array, pra evitar ordem/duplicata/sorting ambíguos) e
  `StageExpansionManifest` (artifact novo, imutável, congela 1..N work
  units **antes** da execução, a partir de `exact immutable source
  refs` — nunca reenumera "quantos beats o banco mostra agora"). Um
  `StageExecution` passa a executar **uma work unit exata**, nunca "o
  stage inteiro implicitamente" — `same stage + different target` vira
  siblings planejados, não "reentrada ilegal" (a regra "Proibida
  reentrada silenciosa" foi refinada pra incluir
  `stageWorkUnitIdentityHash` na chave de unicidade, reaproveitando o
  código já existente `STAGE_ITERATION_STAGE_REENTRY_WITHOUT_REVISION`).
  Barrier novo pra stages `EXPANDABLE`: stage só avança quando **todas**
  as work units do manifest resolvem com sucesso **e** todos os
  `transitionKey` dos siblings concordam — divergência é contract
  violation nova. Execução V1 continua sequencial (preserva a regra A
  de no máximo uma `StageExecution` non-terminal ativa por Run) — S5
  habilita o modelo de identidade pro fan-out, sem habilitar
  paralelismo real (decisão deliberadamente adiada). Migração real
  aplicada nas Skills 02 (`Job.variantKey` → `stageWorkUnitIdentityHash`),
  10 e 20 (5 trechos de prosa que citavam `variantKey`/`beat:n`
  corrigidos pra apontar pro novo contrato estruturado da Skill 01) —
  Skills 14/17 não tinham uso real de `variantKey` em campo tipado
  (grep confirmou), só a orientação de migração ficou documentada pra
  quando o fan-out de publication target for implementado de fato.
  **2 hashes novos** (`STAGE_WORK_UNIT_IDENTITY_V1`,
  `STAGE_EXPANSION_MANIFEST_V1`), **4 `FATAL_ERROR` novos**
  (`STAGE_WORK_UNIT_IDENTITY_INVALID`,
  `STAGE_EXPANSION_MANIFEST_REPLAY_CONFLICT`,
  `STAGE_WORK_UNIT_NOT_IN_MANIFEST`,
  `STAGE_EXPANSION_TRANSITION_CONFLICT` — grep prévio confirmou que só
  esses 4 eram genuinamente novos; o resto (duplicata de work unit)
  reaproveita o código de reentrada já existente do Ponto D). Lint
  ganhou 5 checagens novas via AST — a primeira rodada já encontrou um
  bug real: os patches de `StageSubjectBinding`/`StageExecution`
  tinham sido documentados só em comentário, sem aplicar de fato ao
  `type` (corrigido antes de qualquer teste manual, mesmo padrão do
  achado do S13). Testado empiricamente (injetado `variantKey` em
  `StageSubjectBinding` e `Job`, confirmado `errorCount=2, FAIL`,
  revertido). `errorCount=0, PASS`.

- **S6 — CLOSED** (achado real do Fable, em essência: `Skill08 → N
  beats`, `Skill10 → N prompts`, `Skill11 → N clips`, `Skill12 →
  audita "o vídeo"`, `Skill14 → finaliza "um vídeo"`, `Skill17 →
  publica "um vídeo"` — **ninguém transformava N em 1**; nenhum
  contrato real de composição/assembly existia). Duas alternativas
  avaliadas: (a) criar um stage `VIDEO_ASSEMBLY` real; (b) restringir
  o V1 pra não precisar de assembly nenhum. **Escolhido (b)** —
  adicionar assembly agora arriscaria reabrir Skills 11/12/13/14 + os
  Pontos S4/S5 simultaneamente, e concatenação simples não resolve
  edição audiovisual real (ordem/trim/transição/áudio/continuidade/
  legendas/música são decisões reais que um stage genérico só
  esconderia). Criado `src/modules/video-machine/contracts/VIDEO-COMPOSITION.md`
  — `VIDEO_COMPOSITION_V1` (versão normativa compartilhada, **não**
  hash de artifact, mesmo padrão do S10/S11/S14): toda `ScriptResult`
  elegível ao pipeline V1 exige `beats.length === 1`, e esse beat único
  representa o vídeo completo (`VideoArtifact` da Skill 11 é candidato
  completo e autônomo, nunca "clip parcial aguardando assembly").
  Durante a implementação, achado real de corpus: o campo real da
  Skill 08 é `ScriptBeat.beatIndex` (0-based, `0..N-1`), não
  `beatNumber` (1-based) como o debate original assumiu — corrigido
  **retroativamente no próprio Ponto S5** antes de prosseguir (achado
  só possível porque se checou o real antes de propagar o nome errado
  pras 8 Skills consumidoras). Referência `VIDEO_COMPOSITION_V1`
  adicionada nas Skills 08/10/11/12/13/14/17/20, com correções pontuais
  reais: Skill 11 ganhou redefinição normativa de `VideoArtifact` como
  candidato completo (nunca segmento); Skill 12 formalizou que audita
  contra o único beat, com validação de cardinalidade antes do audit;
  Skill 13 formalizou que nenhum `CorrectionScope` pode introduzir
  multi-beat, modo de composição congelado dentro da Run; Skill 14
  ganhou proibição explícita de concatenação multi-source (source já
  era singular por construção — sem gap estrutural real, só
  formalização); Skill 17/20 ganharam notas formalizando 1 rendition
  por intent e variant como candidato completo. Grep real nas Skills
  11/12/14 não encontrou nenhuma prosa contraditória existente
  ("concatenate"/"clip"/"assembly" simplesmente não apareciam) — o
  achado do Fable era sobre **ausência** de contrato, não prosa errada
  pra corrigir. **0 artifacts novos, 0 hashes novos** (`VIDEO_COMPOSITION_V1`
  não entra na contagem canônica), **1 `FATAL_ERROR` novo**
  (`SCRIPT_BEAT_COUNT_INVALID` na Skill 08 — grep prévio confirmou que
  nenhum código existente cobria especificamente cardinalidade de
  beats). Lint ganhou 3 checagens novas — testadas empiricamente
  (removida a formalização de cardinalidade na Skill08 e a prosa de
  proibição na Skill14, confirmado `errorCount=2, FAIL`, revertido).
  `errorCount=0, PASS`.

- **Ponto S7 — `EXECUTION_RUNTIME_V1` (2026-09-18, worker runtime nunca
  especificado)**: achado real (`Skill02 → pull worker, mas onde
  roda?`, `Skill11 → multi-tick, mas quem mantém o processo vivo entre
  ticks?`, `Skill12 → precisa de FFmpeg, mas a Vercel roda isso?`).
  Decisão fechada: a Vercel é **exclusivamente control plane** — nunca
  executa nenhum `SkillJobHandler`, curto ou longo; todo `Job`
  (`RUN_SCOPED` ou `STANDALONE`, qualquer Skill) executa num worker
  durável e containerizado separado (`VIDEO_MACHINE_WORKER_V1`).
  Deliberadamente **mais rígido** que "só FFmpeg pesado vai pro
  worker" — uma exceção pra Jobs rápidos criaria dois runtimes
  implementando a mesma semântica de Job/Attempt, divergindo com o
  tempo. Criado `src/modules/video-machine/contracts/EXECUTION-RUNTIME.md`
  — `EXECUTION_RUNTIME_V1` (versão normativa compartilhada, **não**
  hash de artifact, mesmo padrão do S6/S10/S11/S14): define
  `VideoMachineRuntime = 'CONTROL_PLANE' | 'DURABLE_WORKER'`, regra de
  que todo `SkillJobHandler` roda só em `DURABLE_WORKER`, o que a
  Vercel pode/não pode fazer, por que webhook e Cron nunca executam
  Job inline, lease/fence/heartbeat/crash recovery (reaproveitando
  100% o protocolo já existente na Skill02 — `leaseFence`,
  `REJECTED_STALE_FENCE`), scratch filesystem/streaming de mídia sem
  passar pela Vercel, credenciais/quota no worker, deploy/rolling
  update/versionamento de adapter, e 32 testes + 29 critérios de
  fechamento. **Achado real de corpus antes de aplicar** (disciplina
  "checar estado real antes"): o campo `nextEligibleAt` que o debate
  original propôs já existe na Skill02 com outro nome —
  `nextPollAt` — reaproveitado sem criar campo novo; o mecanismo de
  `leaseFence`/`reportExecution()`/`REJECTED_STALE_FENCE` também já
  existia inteiro desde antes deste reparo (Ponto B). Isso confirmou a
  previsão do próprio debate (itens 147-149): **0 artifacts novos, 0
  hashes canônicos novos, 0 `FATAL_ERROR` novos** — S7 é puramente
  declarativo sobre onde o protocolo já existente executa. Referência
  `EXECUTION_RUNTIME_V1` adicionada como seção própria nas Skills
  01/02 e como PATCH pontual nas Skills 11/12/14/16/17 (Skill16 ganhou
  a nota mais extensa: a rota de webhook só persiste `InboundInteraction`
  durável — todo o resto do fluxo, incluindo chamar IA e enviar DM,
  vira `SkillJobHandler` no worker, nunca inline na rota). Lint ganhou
  4 checagens novas (`G_S7_EXECUTION_RUNTIME_REFERENCE_MISSING`/
  `G_S7_SKILL02_WORKER_OWNERSHIP_MISSING`/
  `G_S7_SKILL11_CONTINUE_RELEASE_MISSING`/
  `G_S7_MEDIA_PROCESSING_MISSING_DURABLE_WORKER`) — testadas
  empiricamente (4 injeções isoladas, cada uma confirmou
  `errorCount=1, FAIL`, revertido). Deliberadamente **não**
  implementadas 2 checagens sugeridas pelo próprio debate: banir
  "execução atribuída à Vercel" via regex (mesmo risco
  self-triggering do S4/S9/S14 — a prosa que PROÍBE isso contém os
  mesmos termos) e banir menção a Redis/BullMQ (apareceria
  legitimamente numa seção "not used in V1", falso positivo certo).
  `errorCount=0, PASS`.

## 🏁 Status real dos 17 achados "significativos" (S1-S17) — 2026-09-18

**Fechados: 17 de 17** — S1, S2, S3, S4, S5, S6, S7, S8 (Ponto C), S9,
S10, S11, S12, S13, S14, S15, S16, S17 (Ponto C).

**Parcial: 0. Aberto: 0.**

Todos os 17 achados "significativos" do Fable estão agora resolvidos
em especificação. Seguindo pros 8 achados "menores" (M1-M8), sem
pausar: M1→M2→M3→M4→M5→M6→M7→M8, cada um com o mesmo ciclo
debate→aplica→autoverifica(lint)→docs→report, antes da consolidação
final e re-review do Fable.

- **Ponto M1 — `CONTRACT_CONVENTIONS_V1` (2026-09-18, primeiro dos 8
  achados MINOR)**: achado real — o mesmo conceito de domínio
  representado por tipos/vocabulários diferentes em contratos
  diferentes (não é sobre estética, é sobre bugs de integração que essa
  duplicação esconde). Criado
  `src/modules/video-machine/contracts/CONTRACT-CONVENTIONS.md` —
  `CONTRACT_CONVENTIONS_V1` (versão normativa compartilhada, **não**
  hash de artifact). 5 decisões, cada uma com achado real de corpus
  confirmado por grep **antes** de aplicar (disciplina "checar estado
  real"): (1) `stageKey` é o único nome de identidade de stage — achado
  real: Skill01 tinha `StageDefinition.stage`/`LogicalJobIntent.stage`
  (tipo `PipelineStage`) convivendo com `stageKey: string` no resto do
  kernel, e Skill02 tinha `Job.stage: string`; `PipelineStage`
  renomeado pra `StageKey` (patch in-place, mesmo alias), os 3 campos
  viraram `stageKey: StageKey`, incluindo o template de
  `logicalJobKey` e uma nota histórica de migração do S5 que ainda
  citava `:stage:`. (2) `PolicyVersion` sempre string opaca, nunca
  number — achado real: de ~50 ocorrências de `policyVersion` no
  corpus, só 1 usava `number`
  (`09-gerador-de-frame/SPEC.md:framePolicySnapshot`); corrigida só
  essa, as outras ~49 já corretas não foram mecanicamente reescritas
  (isso seria estética sem achado real). (3) `TrendEvidenceRef` — achado
  real: Skill07 (`applicableTrendEvidence`) já carregava
  `evidenceId`+`evidenceHash` inline, já era exact ref, nada a corrigir
  lá; `TrendEvidenceRef` criado em Skill06 (owner real) usando os nomes
  de campo reais do corpus, não os nomes hipotéticos do debate original;
  `CreativeProviderProposal.referencedTrendEvidenceIds` mantido naked
  de propósito — é proposta bruta de provider de IA, que estruturalmente
  não tem como conhecer um hash. (4) `EvidenceMatchJudgement` — achado
  real: Skill12 tinha o mesmo julgamento como `MATCH`/`MISMATCH`/
  `NOT_OBSERVABLE` em alguns campos e `YES`/`NO`/`UNCERTAIN` em outros,
  e as duas vocabulários juntas redundantemente no mesmo campo
  (`VideoSemanticObservation.finding` tinha 4 literais pra 3 conceitos);
  migrados `VideoSemanticObservation.finding`, `ProductIdentityCheck`
  (3 campos), `CreativeQualityAssessment` (5 campos) — mas
  `unsupportedElementsIntroduced` **deliberadamente não migrado**
  (pergunta de presença de problema, não julgamento de
  match-com-referência; mapear `YES→MATCH` inverteria a semântica).
  (5) sem pseudo-configuração de literal único — achado real:
  `03-gestor-de-aprovacao/SPEC.md` `ApprovalPolicy.onInsufficientEvidence:
  "ESCALATE_TO_MANUAL"` tinha exatamente 1 literal possível; removido,
  comportamento vira invariante normativo (já documentado no próprio
  arquivo). Subitem `consumedAt` do achado original: já resolvido pelo
  S13 numa rodada anterior — confirmado por grep nesta rodada, sem
  repatch necessário. **0 artifacts novos, 0 hashes novos, 0
  `FATAL_ERROR` novos.** Lint ganhou 3 checagens novas
  (`G_M1_BANNED_STAGE_ALIAS`/`G_M1_POLICY_VERSION_WRONG_TYPE`/
  `G_M1_PSEUDO_CONFIG_SINGLE_LITERAL`) — testadas empiricamente (3
  injeções isoladas, cada uma confirmou `errorCount=1, FAIL`,
  revertido). Deliberadamente **não** implementadas checagens de
  `TrendEvidenceRef`/`EvidenceMatchJudgement` via AST genérico — achados
  pontuais de 1 ocorrência cada já corrigidos diretamente, um lint
  amplo exigiria julgamento semântico ("fato canônico" vs "proposta
  bruta de provider") fora do alcance de checagem estrutural. `errorCount=0, PASS`.

- **Ponto M2 — `OPTIONAL_REFERENCE_RULE_V1` (2026-09-18, segundo dos 8
  achados MINOR)**: achado real — refs opcionais que só existem pra
  dizer "se vier, eu confiro", sem representar uma escolha real de
  domínio (aparência de rigor, zero segurança real). Regra adicionada
  ao mesmo `CONTRACT-CONVENTIONS.md` do M1 (sem criar novo contrato
  compartilhado): toda `fooRef?` se classifica em
  `REQUIRED_PROVENANCE` (torna obrigatório) /
  `REDUNDANT_DEFENSIVE_REFERENCE` (remove) /
  `GENUINELY_OPTIONAL_DOMAIN_INPUT` (mantém, com semântica de ausência
  explícita). Achado real de corpus confirmado por grep textual
  (`"OPCIONAL, defensivo"`) antes de aplicar — 3 ocorrências reais,
  todas categoria B: `05-analise-de-oferta-comissao/SPEC.md`
  `OfferAnalysisInput.candidateRefs?` (a própria spec já dizia "se
  ausente, a Skill05 simplesmente reabre o ProductDiscoveryResult" —
  zero mudança de comportamento na ausência); `06-pesquisa-de-tendencias/SPEC.md`
  `TrendResearchInput.candidateRefs?` (comentário explícito "mesmo
  padrão da Skill05"); `07-direcao-criativa/SPEC.md`
  `CreativeDirectionInput.subjectRef?` (a Skill já deriva o
  `subjectRef` obrigatório usado em todo o resto do arquivo a partir de
  `stageSubjectBindingId`, nunca do campo opcional de input). Os 3
  campos removidos, junto com os 3 `FATAL_ERROR` que só existiam pra
  validá-los (`DISCOVERY_CANDIDATE_SET_MISMATCH`/
  `OFFER_CANDIDATE_SET_MISMATCH`/`CREATIVE_SUBJECT_MISMATCH` —
  confirmado por grep que cada um só tinha essa única razão de existir
  em todo o corpus, sem uso paralelo). Categoria C confirmada sem
  mudança: `applicableTrendEvidence` (Skill07, já `evidenceId`+
  `evidenceHash` desde o M1) e `CreativeProviderProposal
  .referencedTrendEvidenceIds` (proposta bruta de provider, não pode
  ter hash) ficam como estão — não são o mesmo problema. **0 artifacts
  novos, 0 hashes novos, 0 `FATAL_ERROR` novos.** Lint ganhou 1
  checagem nova (`G_M2_BANNED_REDUNDANT_DEFENSIVE_REF`, guarda de
  regressão AST pros 3 tipos reais) — testada empiricamente (3
  injeções isoladas nas 3 Skills, cada uma confirmou `errorCount=1,
  FAIL`, revertido). `errorCount=0, PASS`.

- **Ponto M3 — remoção de `poolSnapshotHash` (2026-09-18, terceiro dos
  8 achados MINOR)**: achado real — `poolSnapshotHash`
  (`04-descoberta-de-produtos/SPEC.md`, `ProductDiscoveryResult`)
  existia, mas não tinha consumer real, e a própria spec já admitia
  "NÃO é lock otimista nem garante que o catálogo não mudou depois".
  Regra fixada no `CONTRACT-CONVENTIONS.md` (mesmo arquivo do M1/M2):
  hash sem papel em provenance/replay/concorrência/decisão de
  domínio/validação efetiva não deve existir. Campo removido — sem
  substituto (`candidateSetHash`/`poolVersion`/`etag` seriam só
  renomear o problema) e sem virar optimistic lock real (a Skill04 não
  tem hoje requisito de concorrência; se tiver no futuro, a solução é
  um mecanismo real — constraint/transaction/claim/CAS/lease — nunca
  hash de pool). Removidas as 4 ocorrências reais no arquivo: o campo
  no type owner, a menção em `freshCandidateCount` reproduzível, o
  bullet `POOL_SNAPSHOT_V1 equivalente` na lista de determinismo
  (substituído por "mesmo conjunto de candidatos efetivamente lido do
  pool" — `poolReadAt` continua sendo o parâmetro real de determinismo,
  via `freshnessSignal`), e a menção no resumo do `AuditEvent`. **0
  artifacts novos, 0 hashes novos, 0 `FATAL_ERROR` novos** — só
  remoção de campo/hash schema existente. Lint ganhou 1 checagem nova
  (`G_M3_POOL_SNAPSHOT_HASH_BANNED`, ban via AST corpus-wide — qualquer
  type de qualquer Skill, não só Skill04) — testada empiricamente
  (injetado o campo de volta, confirmado `errorCount=1, FAIL`,
  revertido). `errorCount=0, PASS`.

- **Ponto M4 — `EXECUTABLE_VERIFICATION_RULE_V1` (2026-09-18, quarto
  dos 8 achados MINOR)**: achado do Fable — "0 duplicatas"/"40
  testes"/"25/25" sendo usados como afirmação de integridade mesmo
  quando parte vinha de revisão manual/estimativa/texto arredondado.
  **Curto por natureza**: o problema material já tinha sido resolvido
  de fato pelo `contract-lint.mjs` real (Ponto G, existente desde antes
  deste reparo) — M4 é formalização de processo/reporting, **sem
  código novo**. Regra adicionada: qualquer métrica objetiva de
  integridade do corpus só pode ser afirmada como fato quando vier de
  verificação executável e reproduzível; contagem manual só como nota
  não autoritativa. Seção `EXECUTABLE_VERIFICATION_RULE_V1` completa
  adicionada ao `CONTRACT-CONVENTIONS.md` (11 regras específicas:
  duplicatas só contam se o lint disser 0; `FATAL_ERROR`/hash count só
  viram número oficial se o script realmente contar; `specified ≠
  implemented` — cenários descritos em SPEC não são "testes
  executáveis" até serem implementados; `PASS` precisa dizer o que
  passou; `"25/25"` sempre qualificado como "specification status";
  `contract-lint` nunca prova runtime/provider/FFmpeg/deployment/
  segurança; não inflar o lint virando framework de contagem
  universal; escopo do lint precisa ser nomeado explicitamente;
  ownership/hash registry/CI continuam deferidos do Ponto G; histórico
  não precisa ser reescrito retroativamente, só onde o número ainda for
  apresentado como garantia atual). Seção "Authority of reported
  metrics" espelhada no `CONTRACT-LINT.md`. **Deliberadamente sem lint
  novo** — o próprio ChatGPT descartou a ideia: regex tentando ler
  frases como "0 duplicatas"/"40 testes" seria frágil e cheio de falso
  positivo; M4 é regra de reporting/processo, não de AST. **0
  artifacts novos, 0 hashes novos, 0 `FATAL_ERROR` novos.** Evidência de
  fechamento é o próprio `errorCount=0, PASS` já confirmado nesta
  rodada, sem completar números ausentes manualmente.

- **Ponto M5 — `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1` (2026-09-18,
  quinto dos 8 achados MINOR, o maior desta rodada)**: achado do Fable
  — não é que Skills 06/20/21 estejam tecnicamente erradas, é que o
  corpus carrega contratos enormes (pesquisa de tendências completa,
  framework de experimentação, sistema formal de relatórios) para
  capacidades que ainda não precisam existir no primeiro runtime.
  Decisão: Skill06 (pesquisa de tendências), Skill20 (gerador de
  variações) e Skill21 (relatórios) → `DEFERRED_V2_CONTRACT` — sem
  handler/Job/migration/provider adapter no V1, mas continuam
  especificadas/revisáveis, sem apagar nada. Skill25 (segurança)
  continua `V1_REQUIRED` inteira — só o custom rate-limit ledger
  (`SecurityRateLimitPolicy`/`SecurityRateLimitWindowState`/
  `SecurityRateLimitDecision`, 2 de 20 `FATAL_ERROR`) vira
  `DEFERRED_V2_MECHANISM` (requisito de proteção continua, mecanismo
  sofisticado sai do caminho crítico). Criado
  `src/modules/video-machine/IMPLEMENTATION-SCOPE.md` —
  `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1` (versão normativa
  compartilhada, **não** hash de artifact): regra central `SPECIFIED,
  RUNTIME_REQUIRED_V1 e RUNTIME_IMPLEMENTED são estados diferentes`;
  regra mais importante — um contrato `DEFERRED_V2_CONTRACT` **nunca**
  pode ser dependência obrigatória de uma Skill V1. **Investigação real
  de dependências feita antes de aplicar** (agente Explore dedicado,
  grep dos 25 SPECs inteiros por referências cruzadas às 3 Skills):
  achou exatamente **1 dependência hard real** —
  `07-direcao-criativa/SPEC.md` `CreativeDirectionInput.trendResearchResultId`
  era campo obrigatório com `CREATIVE_TREND_RESULT_NOT_FOUND` como
  `FATAL_ERROR`, o que bloquearia **100% dos `ProductionRun`s** assim
  que Skill06 parasse de rodar (nenhum `TrendResearchResult` jamais
  existiria). Corrigido: campo virou opcional
  (`trendResearchResultId?: string`), ausência tratada com a mesma
  semântica de `NO_SOURCES_AVAILABLE`/EVERGREEN que o próprio contrato
  já definia pra Skill06 retornando vazio (nunca erro) — os 3
  `FATAL_ERROR` relacionados continuam existindo, só passam a disparar
  condicionalmente (apenas quando o ref é fornecido e não resolve).
  Skill08 herdava o bloqueio só transitivamente via Skill07 — resolvido
  pela mesma correção, sem patch separado. Nenhuma outra dependência
  hard real encontrada: Skill20 não tem nenhum campo `experimentVariant*`
  usado por Skills 11/12/14/17 (a única plumbing existente —
  `experimentVariantIdentityHash` em Skill01 — já é condicional/owned
  pela Skill01); Skill21 não é tratada como dependência funcional por
  nenhuma Skill (só notas de ownership/roadmap); o rate-limit ledger da
  Skill25 não é referenciado por tipo em nenhuma outra Skill. Adicionado
  bloco `IMPLEMENTATION STATUS` no topo das 4 Skills afetadas (06/20/21
  = `DEFERRED_V2_CONTRACT`, 25 = `V1_REQUIRED` com nota do
  `DEFERRED_V2_MECHANISM`). Deliberadamente **sem** campo novo
  persistido (`implementationScope` em `ProductionPipelineSnapshot`) —
  isso viraria estado extra desnecessário; o documento normativo já
  governa a construção/validação do pipeline. Deliberadamente **sem**
  grafo automático de dependências entre as 25 Skills — seria o próprio
  over-engineering que este ponto elimina. **0 artifacts novos, 0
  hashes novos, 0 `FATAL_ERROR` novos, 0 runtime code.** Lint ganhou 4
  checagens novas (`G_M5_DEFERRED_MARKER_MISSING`/
  `G_M5_SKILL25_MUST_STAY_V1_REQUIRED`/
  `G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING`/
  `G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING_SKILL_REF`) — testadas
  empiricamente (3 cenários: marker removido da Skill06,
  `IMPLEMENTATION-SCOPE.md` removido temporariamente, marker
  `V1_REQUIRED` removido da Skill25 — cada um confirmou `errorCount=1,
  FAIL`, revertido). `errorCount=0, PASS`.

**Achado de segurança real — CONTIDO em 2026-09-18, fora do fluxo de
spec**: o webhook Z-API (`src/app/api/webhook/zapi/route.ts`) não
validava assinatura/token nenhum. Com autorização explícita do
usuário, a rota passou a exigir o header `Client-Token` (mesmo valor
de `ZAPI_CLIENT_TOKEN`), fail-closed se ausente/divergente
(`typecheck` limpo). Ainda não é `RESOLVED`: falta confirmar em
produção, depois do deploy, que a Z-API realmente reenvia esse header
nos webhooks desta conta — mandar uma mensagem de teste pro WhatsApp
do Concierge e ver se o bot ainda responde (ver `CONTINUIDADE.md` raiz
do repo).

- **Ponto M6 — separar contrato de segurança de finding operacional
  (2026-09-18, sexto dos 8 achados MINOR)**: achado real — a SPEC da
  Skill25 carregava a narrativa operacional concreta do repositório
  inteira (caminho exato do arquivo do webhook Z-API, data do achado,
  tabela de status `OPEN`/`CONTAINED` por incidente, RLS de
  `product_groups`, `CRON_SECRET`, vazamento de secret do Mercado
  Livre) misturada com as regras normativas de domínio — um incidente
  podia abrir/ser corrigido/mudar de estado sem que isso devesse mudar
  o contrato da Skill25, mas a SPEC não separava as duas coisas.
  Decisão: `Skill25 SPEC → regra permanente e genérica` /
  `CONTINUIDADE.md → situação concreta do ambiente/repositório`.
  Aplicado com um agente dedicado (arquivo grande, ~1600 linhas, exigia
  classificar cada ocorrência de `Z-API`/`OPEN`/`SEC-025-`/
  `product_groups`/`Mercado Livre`/`CRON_SECRET` como contrato genérico
  vs. narrativa específica — não um lint automatizável, exatamente como
  o próprio ChatGPT recomendou não fazer): removida/reformulada a seção
  "Auditoria real do repositório" (mantendo a metodologia genérica,
  removendo os achados concretos), a "Baseline inicial de findings", a
  tabela "Estado dos findings reais"/"Estado real de implementação", e
  exemplos que citavam "Z-API hoje" como se fosse regra (generalizados
  pra exemplo rotulado, não descrição do deployment atual). **Mantido
  intacto**: os 20 `FATAL_ERROR`, os 37 tipos TypeScript, a cadeia de
  autoridade do S1 (`provider ingress → authentication evidence →
  provider-account ingress resolution → Skill22 TrustedTenantContext →
  durable work`), a regra fail-closed genérica, os mecanismos
  provider-agnósticos (HMAC/shared-secret/OAuth), o plano de 40 testes
  — nada disso nasceu do incidente Z-API especificamente, são
  invariantes válidas por si. Os 5 achados concretos `SEC-025-*`
  (`ZAPI-WEBHOOK-AUTH`, `PRODUCT-GROUPS-ANON-RLS`,
  `CRON-PRODUCTION-AUTH`, `ML-SECRET-ROTATION`,
  `RETENTION-NOT-CONFIGURED` — este último novo, não estava rastreado
  antes) movidos pra uma seção nova "🔐 Security findings rastreados"
  em `CONTINUIDADE.md` (raiz do repo), com status real verificado no
  próprio arquivo antes de escrever qualquer coisa — o Z-API real é
  `CONTAINED` (fix do header `Client-Token` já aplicado em 2026-09-18,
  pendente confirmação em produção), não `OPEN` como o ChatGPT assumiu
  de memória de um ponto anterior da conversa; usado o status real, não
  o assumido. **Nenhum finding foi marcado como resolvido por esse
  trabalho** — só mudou onde a informação mora. **0 artifacts novos, 0
  hashes novos, 0 `FATAL_ERROR` novos, 0 lint novo** (deliberadamente —
  o próprio ChatGPT recomendou não criar regex pra `Z-API`/`OPEN`/
  `FIXED` corpus-wide, risco de falso positivo alto e as Skills 16/24
  podem legitimamente mencionar o provider em documentação de
  integração). `errorCount=0, PASS`.

- **Ponto M7 — Trusted Run Identity Allocation (2026-09-18, sétimo dos
  8 achados MINOR)**: achado do Fable — o `START` permitia que o
  caller chegasse com um `runId` pré-gerado; mesmo com `commandId`
  idempotente, isso deixava uma colisão possível
  (`commandId A → runId X`, `commandId B → runId X` — `commandId`
  impede duplicação da MESMA requisição, mas não prova que um `runId`
  escolhido externamente ainda não pertence a outra operação). Achado
  real confirmado por grep **antes** de aplicar:
  `01-orquestrador-de-producao/SPEC.md` `RunControlCommand.runId`
  (tipo compartilhado por `START`/`PAUSE`/`RESUME`/`CANCEL`/`STATUS`)
  era `string` obrigatório em TODOS os 5 tipos, e a prosa da própria
  SPEC confirmava literalmente "`START` é sempre associado a um
  `runId` pré-gerado antes da criação da `ProductionRun`" — exatamente
  o anti-padrão. Decisão: o caller nunca escolhe `runId`; Skill01 aloca
  o `runId` (globalmente único, opaque, nunca derivado de
  `commandId`/`startRequestKey`/timestamp/tenant) dentro do boundary
  confiável, atomicamente com a materialização da `ProductionRun`
  aceita, só depois de validar o request e resolver a idempotência do
  `commandId`. Replays do mesmo `commandId` (mesmo payload semântico)
  recebem exatamente o `runId` já materializado; mesmo `commandId` com
  payload diferente é conflito real (`FATAL_ERROR` existente, nunca
  "já existe, devolve silenciosamente"). Corrigido:
  `RunControlCommand.runId` virou `runId?: string` — obrigatório só
  pra `PAUSE`/`RESUME`/`CANCEL`/`STATUS` (precisam apontar pra uma Run
  já existente), proibido pra `START`. `ProductionRunStartRequest` já
  não tinha `runId` nenhum (confirmado por grep — nada a corrigir ali,
  já estava certo desde o Ponto C anterior). Adicionado PATCH note
  explicando a alocação atômica de identidade na seção "Ponto C (parte
  2)". `STANDALONE` work continua sem `ProductionRun`/`runId` — não
  criamos Run artificial só porque Skill01 agora é autoridade de
  alocação de identidade. **0 artifacts novos, 0 hashes novos, 0
  `FATAL_ERROR` novos.** Lint ganhou 2 checagens novas
  (`G_M7_RUN_CONTROL_COMMAND_RUN_ID_MUST_BE_OPTIONAL`/
  `G_M7_START_REQUEST_RUN_ID_BANNED`) — testadas empiricamente (2
  injeções isoladas: `runId` tornado obrigatório de novo em
  `RunControlCommand`, `runId` injetado em `ProductionRunStartRequest`
  — cada uma confirmou `errorCount=1, FAIL`, revertido). `errorCount=0, PASS`.

- **Ponto M8 — identidade determinística de `scheduleSlotKey`
  (2026-09-18, oitavo e ÚLTIMO dos 8 achados MINOR)**: achado do Fable
  — não era "qual função de arredondamento usar" (`round`/`floor`/
  `ceil`), era eliminar o arredondamento por completo:
  `scheduleSlotKey` precisa identificar uma ocorrência nominal do
  schedule, derivada do horário em que aquela ocorrência DEVERIA
  acontecer, nunca do horário em que o cron/worker realmente acordou —
  senão dois processos vendo a mesma coleta vencida podem materializar
  identidades diferentes (jitter, retry, cron duplicado, execução
  atrasada quebram a dedupe). Achado real confirmado por grep antes de
  aplicar: `18-coletor-de-metricas/SPEC.md`
  `MetricCollectionTrigger.SCHEDULED` (`{ type: 'SCHEDULED';
  schedulePolicyKey; scheduleSlotKey }`) não tinha nenhum campo
  representando a ocorrência nominal, e o exemplo real de
  `collectionRequestKey` mostrava literalmente um bucket de hora
  truncada (`"2026-09-18T12"`) — arredondamento indefinido na prática,
  exatamente o achado. Corrigido: adicionado `scheduledOccurrenceAt`
  (instante nominal RFC3339 UTC, precisão de milissegundos, sufixo
  `Z`, capturado do valor de `nextEligibleCollectionAt` no momento em
  que a admissão identifica a ocorrência devida — reutilizado, nenhum
  campo/artifact novo inventado) ao `MetricCollectionTrigger`;
  `scheduleSlotKey` passa a derivar de `(schedulePolicyKey,
  scheduledOccurrenceAt)`, nunca de `now()`/`round`/`floor`/timestamps
  operacionais (`createdAt`/`requestedAt`/`receivedAt`/`startedAt`).
  Corrigidos também o exemplo de `collectionRequestKey` (deixou de
  sugerir um bucket de hora) e a prosa de admissão do cron, com a
  regra literal `scheduleSlotKey MUST NOT be derived by rounding,
  flooring or ceiling the observed/execution time`. Timezone/DST:
  resolvidos antes da slot identity — a key sempre usa o instante UTC
  já resolvido, nunca a string local. **0 artifacts novos, 0 hashes
  novos, 0 `FATAL_ERROR` novos** — patch in-place de projection
  existente (`METRIC_COLLECTION_INPUT_V1`), nenhum
  `SCHEDULE_SLOT_ROUNDING_INVALID` criado porque o arredondamento
  simplesmente deixa de existir. Lint ganhou 2 checagens novas
  (`G_M8_SCHEDULE_SLOT_SEMANTICS_MISSING`/
  `G_M8_SCHEDULED_OCCURRENCE_FIELD_MISSING`) — testadas
  empiricamente (2 injeções isoladas: regra normativa removida, campo
  `scheduledOccurrenceAt` renomeado — cada uma confirmou
  `errorCount=1, FAIL`, revertido). `errorCount=0, PASS`.

## 🏁🏁🏁 Consolidação pós-Fable — snapshot de congelamento criado (2026-09-18)

Criado `src/modules/video-machine/consolidado/POST-FABLE-REPAIR-SNAPSHOT-2026-09-18.md`
(sugestão do ChatGPT): documento curto de congelamento pra levar pro
Codex/GPT-6 Astra fazer a re-review, sem reexplicar as 25 Skills —
registra só o estado verificável do corpus. Inclui: aviso explícito
pra não confiar em "CLOSED" sem verificar contra o corpus real;
status de cada um dos 25 achados numa tabela; resultado real do
`contract-lint.mjs` (`errorCount=0, PASS`); busca dirigida por resíduo
textual dos próprios reparos (`poolSnapshotHash`/`variantKey`/
`beatNumber`/`VIDEO_ASSEMBLY`/`onInsufficientEvidence`/`runId`
obrigatório fora de contexto/bucket de hora antigo da Skill18) — todas
as ocorrências classificadas manualmente como texto histórico/
explicativo legítimo, nenhum resíduo real de código encontrado; missão
explícita da re-review (auditar contradições ENTRE as correções, não
redesenhar do zero); lista de interfaces cruzadas pra validar
especificamente; formato de relatório esperado e regra pra reabrir
achado antigo (precisa citar arquivo+campo+conflito concreto).
**Pendente**: nenhum commit dedicado foi criado ainda capturando esse
estado exato do corpus — o campo `reviewSnapshotCommit` no documento
ficou como placeholder até isso acontecer.

## 🏁🏁 Marco final — 17/17 achados SIGNIFICANT + 8/8 achados MINOR fechados (2026-09-18)

Com o fechamento do Ponto M8, **todos os 25 achados da revisão do
Claude Fable 5 Max estão resolvidos em especificação**: os 17
SIGNIFICANT (S1-S17, incluindo os Pontos A-G do reparo estrutural
original) e os 8 MINOR (M1-M8). Nenhum achado ficou parcial ou
esquecido. `contract-lint.mjs` real confirma `errorCount=0, PASS` no
corpus inteiro das 25 Skills depois de cada um dos 25 achados
individualmente — não é afirmação sem verificação executável (Ponto
M4). Isso ainda **não** significa que o trabalho de revisão terminou:
segundo o próprio ChatGPT, o próximo passo não é a revisão do GPT-6
Astra ainda — é uma nova consolidação + re-review do Claude Fable 5 Max
sobre o corpus inteiro já corrigido, pra confirmar que os Pontos A-G,
S1-S17 e M1-M8 fecharam sem regressões cruzadas entre si. Só depois do
Fable estabilizar essa segunda rodada é que parte a revisão
independente do GPT-6 Astra. Nenhuma migration, tabela, RPC, worker ou
linha de código de runtime foi criada em nenhum momento deste reparo —
tudo permanece especificação/contrato.

| 24 — Gestor de Integrações | ✅ | ✅ **APROVADA — 24/25** (2 rodadas como a Skill 23 — 8 Skills já aprovadas dependem dela; achado central da auditoria: Skills 16 e 18 já congelaram independentemente dois formatos diferentes de "capability snapshot" — decisão: Skill24 nunca funde/substitui esses contratos, fica numa camada inferior (`IntegrationCapabilityEvidence`) da qual cada Skill consumidora projeta sua própria semântica; `IntegrationCredentialHandleRef` fecha a promessa de "handle seguro" das Skills 10/11 — secret nunca entra em contrato, nem como hash derivado; rotação segue stage→valida→ativa atomicamente, revogação nunca tem fallback automático; identidade imutável (hasheada) separada de runtime state mutável — 1 bug real de tipo duplicado (`IntegrationHealthStatus`) autocorrigido antes do carimbo; Bling confirmado ZERO evidência neste repo; 20 FATAL_ERROR, 14 hashes canônicos, 40 testes) | `skills/24-gestor-de-integracoes/SPEC.md` | ❌ — aguarda Fable 5 Max + GPT-6 Astra |

**Interface Skill 01 ↔ Skill 02: congelada em 2026-09-17.** Outbox duplo
(`LogicalJobIntent` para trabalho, `RunCancellationIntent` para
cancelamento), consumo idempotente via `logicalJobKey`+`payloadHash`,
`advanceRun()` orientado a evento com cron como reconciliador — não como
gatilho primário. `JobBlockedEvent` integrado oficialmente à interface
(não terminal), `RunPolicyDecision` como contrato compartilhado de
auditoria entre as duas Skills.

**Skill 03 — Gestor de Aprovação: APROVADA — 3/25 em 2026-09-17.** Ciclo
completo de `ApprovalRequest`/`ApprovalDecision`/`ApprovalPolicy`, modos
`MANUAL`/`AUTO`/`HYBRID` com `AutoEvaluationOutcome` separado da decisão
final, aprovação amarrada a `subjectVersion`+`artifactHash` exatos (nunca
só a versão), `SUPERSEDED`/`EXPIRED`/`CANCELLED` como lifecycle distinto
de decisão, `FIRST_REAL_PUBLISH` como trava global por
`tenantId`+`publicationTargetKey`, autorização humana via
`authorizationEvidenceRef` (nunca token/credencial bruta). Interface
Skill 01↔03 congelada. Durante o debate, duas lacunas reais foram
encontradas e corrigidas retroativamente nas Skills 01/02 (refinamentos
compatíveis, sem reabrir 1/25 nem 2/25): fan-out do `RunCancellationIntent`
(`OutboxConsumerDelivery` por `consumerKey`) e guarda de materialização
tardia contra Run já terminal.

**Skill 04 — Descoberta de Produtos: APROVADA — 4/25 em 2026-09-17.**
Fundamentada em auditoria real do banco Supabase live (`babamanager-pro`),
não nas migrations `.sql` desatualizadas do repo. Seleciona um shortlist
ordenado e auditável (`primaryCandidates`+`alternateCandidates`) a partir
de `deal_candidates`→`products`→`offer_snapshots` (join explícito por
`offer_snapshot_id`, nunca `site_catalog`). Hard filters determinísticos +
`DISCOVERY_COMMERCIAL_V1` (exclui `comissao`/`confiancaHistorico`
hardcoded-zero) + `DISCOVERY_RANKING_V1` (média ponderada normalizada,
nunca soma simples) + tie-breakers puramente estruturais + diversificação
pós-ranking. `ProductReusePolicy` desacoplada do dedup legado de
`social_posts` (vira só sinal opt-in, fail-closed em multi-tenant). Executa
como Skill de execução comum via fila da Skill 02 — **sem outbox próprio**
(diferente da Skill 03). Invariante própria de idempotência de persistência
(`DISCOVERY_RESULT_REPLAY_CONFLICT`, no máx. 1 `ProductDiscoveryResult` por
`(jobId, attemptNumber)`) e separação explícita entre sucesso técnico do
Job e sucesso de negócio do stage (Skill01 nunca avança automaticamente só
por `COMPLETED`). Cadeia de tenant confiável (`trustedTenantId =
Job.tenantId`) formalizada contra fallback silencioso pro catálogo global.

**Skill 05 — Análise de Oferta/Comissão: APROVADA — 5/25 em 2026-09-18.**
Recebe o shortlist da Skill 04 (`discoveryResultId` como autoridade) e
avalia atratividade econômica sem redescobrir produtos. Auditoria real do
banco live encontrou: `commission_rate` é fração (0-1) enquanto
`price_discount_rate` é percentual (0-100) — escalas diferentes;
`commission = commission_rate × price_min` bate em 790/790 snapshots
dentro de R$0,01; comissão é propriedade do **snapshot**, não do produto
(um produto real variou de 9% para 13%); `conversionReport` da Shopee
existe mas é account-global e não persiste, então
`REALIZED_COMMISSION_SIGNAL = UNAVAILABLE` no MVP — reforçado por um fato
de negócio trazido pelo usuário: a janela de atribuição de 7 dias da
Shopee paga comissão por qualquer compra no período, não só do produto
anunciado (nota de dependência futura registrada para as Skills 15/18/19).
`COMMISSION_RATE_SIGNAL_V1`/`COMMISSION_VALUE_SIGNAL_V1` são normalizações
piecewise-linear calibradas sobre os percentis reais dos 790 snapshots
não-nulos (não os 31 `deal_candidates`, que já sofreram seleção
upstream), versionadas e congeladas via `calibrationHash`. Executa como
Skill de execução comum via fila da Skill 02 — sem outbox próprio, mesmo
padrão da Skill 04. Durante o debate, uma correção real foi feita: a
distinção entre invariante hard e preferência best-effort de
diversificação (`avoidSameProductGroup`/`maxPerCategory`/
`preferDistinctCategories`) foi verificada contra o texto já aprovado da
Skill 04 — as três são best-effort, nenhuma é hard além de unicidade de
`productId` — evitando reabrir 4/25.

**Skill 06 — Pesquisa de Tendências: APROVADA — 6/25 em 2026-09-18.**
Recebe o `OfferAnalysisResult` da Skill 05 e pesquisa evidência externa de
tendência via `TrendProvider` (interface, sem hardcode de plataforma).
Auditoria real do repositório encontrou algo bem diferente das Skills
04/05: **zero** fonte de tendência operacional hoje — TikTok, Pinterest e
Google Trends têm zero código/credencial; a única capacidade social real
é Windsor.ai→Instagram, mas só write (posts), sem nenhuma leitura de
engagement; nenhuma tabela de trend/hashtag/viral existe no banco live.
A spec é deliberadamente capability-aware em vez de inventar sinais:
distingue `implementationStatus` (IMPLEMENTED/NOT_IMPLEMENTED) de
`runtimeAvailability` (capacidade arquitetural de um fornecedor não é
disponibilidade executável sem adapter real no repo);
`TrendResearchResultStatus` inclui `NO_SOURCES_AVAILABLE` distinto de
`NO_EVIDENCE_FOUND` — honesto que a execução real hoje cairia no
primeiro; os 5 sinais normalizados (`VIRALITY_SIGNAL` etc.) ficam
`UNAVAILABLE` até existir população real para calibrar, mesmo princípio
das fórmulas da Skill 05. `policySatisfied` separa fato técnico de
decisão de negócio. Executa como Skill de execução comum via fila da
Skill 02 — sem outbox próprio. Durante o debate, três gaps reais de
contrato foram corrigidos antes do fechamento: `TrendEvidence` sem
`tenantId` apesar de ownership tenant-scoped já combinado;
`SourceExecutionResult` duplicado/sem `sourceExecutionId` (base da
unicidade `(sourceExecutionId, evidenceHash)` de `TrendEvidence`); e
falta de atomicidade entre persistir evidências e o checkpoint terminal
da fonte (corrigido com regra de transação única — tudo durável ou nada).
Também registrada, como dependência futura para as Skills 15/18/19, a
janela de atribuição de 7 dias da Shopee (produto anunciado ≠
necessariamente produto comprado na comissão realizada).

**Terceiro refinamento retroativo compatível na Skill 01 (2026-09-18),
durante o debate da Skill 07 — sem reabrir 1/25:** `StageDefinition.subjectScope`
(`PRODUCT`/`VIDEO`/`PUBLICATION`) ganhou uma regra formal de resolução de
subject e um novo tipo durável `StageSubjectBinding`
(`runId`/`stageKey`/`subjectType`/`subjectId`/`sourceResultId`/
`sourcePosition?`/`resolutionPolicyVersion`/`createdAt`, materializado
uma vez, replay reutiliza). Correção crítica: `sourceResultId` é sempre
**explicitamente vinculado** à execução upstream concluída do Run — nunca
"o resultado mais recente aplicável" (isso quebraria reprodutibilidade em
replay). Fallback para o próximo candidato da sequência só via política
futura explícita + evidência durável de esgotamento, nunca por retry
técnico isolado. Política concreta de resolução definida só para
`PRODUCT` por ora (via `OfferAnalysisResult`); `VIDEO`/`PUBLICATION`
compartilham o mecanismo genérico mas ficam sem política até serem
necessários. Isso resolve, sem virar uma terceira Skill de seleção de
produto, a pergunta "quem escolhe qual candidato do shortlist
economicamente aprovado vira o subject da produção" — resposta: a
Skill 01, determinística, a partir da ordem autoritativa já produzida
pela Skill 05.

**Skill 07 — Direção Criativa: APROVADA — 7/25 em 2026-09-18.** Recebe o
subject resolvido pela Skill 01 (`StageSubjectBinding`) + `OfferAnalysisResult`
+ `TrendResearchResult`, decide estratégia (modo, arquétipo, hook, CTA,
abordagem visual) — nunca o texto final (Skill 08). Auditoria real
encontrou zero lógica de geração criativa hoje: captions reais são só
título bruto da Shopee + 4 hashtags fixas, Stories publicados sem
legenda, e o CTA "QUERO" vem de **dois pontos hardcoded desconectados**
(texto estático na imagem Canva + keyword do webhook do Instagram), sem
config compartilhada. Resolvido com `CreativeCtaIntent` como fonte única
de verdade: Skill 07 decide o mecanismo e congela a keyword (vinda da
`CreativeDirectionPolicy`, nunca inventada pelo modelo), Skill 08
renderiza sem poder trocar a palavra, Skill 16 executa a automação lendo
a mesma intenção. `CreativeMode` (`TREND_INFORMED`/`EVERGREEN`) exige que
a evidência seja do MESMO subject e efetivamente citada numa decisão —
`TrendResearchResult=OK` não torna automático. Toda decisão carrega
`decisionBasis` granular (fato de produto/oferta/tendência, policy, ou
inferência do modelo) — `MODEL_INFERENCE` nunca sozinho fundamenta
alegação factual ("viral", "mais vendido" etc. sem evidência). Design
central: o provider (LLM) propõe, a Skill 07 valida/deriva proveniência/
materializa — o modelo nunca declara fato nem escreve `DecisionBasis`
diretamente; quando a policy já decide tudo deterministicamente, zero
chamada de IA é feita (`POLICY_ONLY`). Idempotência em dois níveis
(resultado + checkpoint de inferência), com tratamento explícito de
estado externo ambíguo (nunca retry cego de chamada potencialmente
cobrada — protege contra cobrança duplicada). Nenhum score de "qualidade
criativa" inventado. Durante o debate, um patch compatível adicional foi
aplicado na Skill 01 (`StageSubjectBinding` ganhou `stageSubjectBindingId`
próprio) e os hashes de proveniência da inferência foram separados em
dois (dado disponibilizado vs. chamada externa efetiva) para permitir
distinguir "mudou o dado" de "mudou o prompt/modelo".

**Skill 08 — Roteirista: APROVADA — 8/25 em 2026-09-18.** Recebe o
`CreativeDirectionResult` exato da Skill 07 (`creativeDirectionHash`
conferido) e produz o roteiro textual estruturado em `beats`
(`ScriptBeat`, não parágrafo linear — a Skill 09/10 precisam de
informação visual por beat), nunca a estratégia. Duas regras de
integridade congeladas: (1) estratégica — Skill 08 não pode reinterpretar
archetype/hook/narrative/visualApproach/CTA mechanism definidos pela
Skill 07, troca gera `SCRIPT_CREATIVE_CONSTRAINT_VIOLATION`; (2) factual —
nenhuma alegação do modelo vira fato só por ser escrita; todo
`FACTUAL_CLAIM` precisa de `ScriptFactBasis` que **sustente
semanticamente** a frase, não só exista (preço R$39,90 não sustenta
"mais barato do Brasil" → `SCRIPT_FACTUAL_CLAIM_NOT_SUPPORTED_BY_BASIS`).
Escopo de evidência de tendência **nunca ampliado** além do que a
Skill 07 realmente usou: `EVERGREEN` força `trendEvidence=[]` sempre,
`TREND_INFORMED` só aceita `evidenceIds` presentes em
`CreativeDirectionResult.trendEvidenceRefsUsed` — mesmo que a pesquisa
original tenha mais evidências reais, não autorizadas naquele roteiro
(`SCRIPT_TREND_EVIDENCE_NOT_ALLOWED_BY_DIRECTION`). CTA preserva o token
literal decidido pela Skill 07 (ex.: "QUERO" dentro de "EU QUERO" é
válido — só substituição é proibida). `ScriptResult` é V1 **sucesso-only**
— diferente do `NO_APPLICABLE_DIRECTION` da Skill 07, não existe condição
de negócio legítima para "direção OK mas nenhum roteiro possível"; saída
inválida do provider é falha de execução daquela Attempt
(`SCRIPT_PROVIDER_INVALID_OUTPUT`), nunca um resultado fabricado. Mesmo
padrão de hash duplo da Skill 07 (dado disponibilizado vs. chamada
externa efetiva) e checkpoint de inferência com fencing (`PREPARED` →
`SUBMITTING` → `RESPONSE_CAPTURED` → `VALIDATED`/`REJECTED`), alinhado
explicitamente ao mecanismo já aprovado da Skill 02
(`externalEffectState`/`BLOCKED`/`EXTERNAL_STATE_UNKNOWN`) para estado
ambíguo de chamada paga sem confirmação. Antes de fechar, o consolidado
do `SPEC.md` foi auto-verificado (nomes de hash consistentes, nenhum
resíduo do rascunho inicial `NO_VALID_SCRIPT`, 24 tipos/interfaces sem
duplicata, alinhamento `ScriptPolicy`→`Proposal`→`Validator`→
`Checkpoint`→`Result`) antes do carimbo final do ChatGPT.

**Skill 09 — Gerador de Frame: APROVADA — 9/25 em 2026-09-18.** Recebe o
`ScriptResult` (Skill 08) e o `CreativeDirectionResult` (Skill 07) de um
subject já definido e transforma referências visuais canônicas
materializadas do produto em frames estáticos (still images) para os
beats que exigem imagem de referência — nunca inventa a aparência do
produto além do que as referências realmente provam. Auditoria real
confirmou greenfield total: zero código de geração de imagem por IA
existe hoje (o único SDK de IA instalado, `openai`, serve só
visão/reconhecimento no Concierge do WhatsApp, nunca `images.generate`);
mais importante, a imagem de referência do produto vive num único lugar
— `offer_snapshots.image_url`, nullable, imutável por snapshot — a
tabela `products` não tem coluna de imagem nenhuma, então hoje existe no
máximo **1** referência real por produto, nunca um conjunto de ângulos.
Divisão arquitetural central: **PRODUCT IDENTITY** (cor, forma, botões,
logo, textura — hard constraint, só o que é observável na referência)
vs. **SCENE COMPOSITION** (ambiente, pose, iluminação, câmera —
livremente criativo). Regra explícita contra "produtos mutantes": região
não coberta pela referência fica `UNKNOWN` — a Skill nunca completa por
plausibilidade, só reenquadra/oculta/rejeita. Contrato desenhado para N
referências (`ProductVisualReferenceSet`) mesmo o adapter Shopee V1 hoje
produzir estritamente 0..1, evitando tanto mentir sobre o estado atual
quanto quebrar o schema quando uma fonte futura trouxer múltiplos
ângulos. Separação em dois estágios — `ProductVisualReference` (de onde a
URL afirma vir) vs. `MaterializedVisualReference` (bytes reais baixados +
`contentHash`) — porque a URL observada no snapshot pode expirar ou
mudar de conteúdo antes da geração; o provider nunca recebe a URL crua
como identidade, só o conteúdo materializado. Checkpoint mais granular
que Skills 07/08: único por `(jobId, attemptNumber, frameRequirementId)`
em vez de por Attempt inteira, com state machine própria
(`PREPARED→SUBMITTING→PROVIDER_RESULT_CAPTURED→ARTIFACT_MATERIALIZED→
VALIDATED/REJECTED`) que distingue "o provider respondeu" de "o artefato
foi materializado" — porque providers de imagem tipicamente devolvem URL
temporária que pode expirar antes de baixarmos os bytes.
`FrameGenerationResult` é discriminated union com três estados: `OK`
(sucesso), `NO_FRAME_REQUIRED` (nenhum beat pediu frame — estado de
domínio legítimo) e `REFERENCE_UNAVAILABLE` (produto sem foto — também
legítimo, sem chamar provider); falha técnica nunca vira resultado
fabricado. Fronteiras explícitas com código legado: `story-template/
route.tsx` é compositor estático (Canva PNG + `next/og`), não relacionado
a frame de vídeo; o SDK `openai` só cobre visão, geração continua
`NOT_IMPLEMENTED`. Durante a revisão final, uma inconsistência real de
nomenclatura de hash foi encontrada e corrigida: `referenceSetHash`
estava documentado ora como `PRODUCT_VISUAL_REFERENCE_SET_V1`, ora como
`PRODUCT_VISUAL_REFERENCE_V1` (sem `_SET`) em dois pontos do mesmo
arquivo — unificado.

**Skill 10 — Gerador de Prompt de Vídeo: APROVADA — 10/25 em
2026-09-18.** Recebe o `ScriptResult` (Skill 08) + `CreativeDirectionResult`
(Skill 07) + `FrameArtifact` (Skill 09, quando aplicável) de um beat
específico e produz uma instrução estruturada e reproduzível para
geração de vídeo — nunca executa o provider (isso é Skill 11). Auditoria
real confirmou greenfield ainda mais vazio que a Skill 09: zero prompt
real de Veo/Flow/Krea salvo em qualquer lugar, zero código de formatação
de prompt, e a Etapa 00A (spike manual) nunca foi sequer executada —
bloqueada por confirmação de modelo/modo, nunca produziu nada a herdar.
Divisão arquitetural central: **VIDEO INTENT** (provider-agnostic, vem de
07+08+09) → **PROVIDER INSTRUCTION** (adaptação determinística/
versionada para Veo/outro, Skill 10) → **PROVIDER EXECUTION** (submit/
poll/custo, não pertence à Skill 10, é Skill 11). O contrato central é
`VideoGenerationIntent` — uma instrução estruturada, nunca uma string —
só depois um `ProviderPromptAdapter` **determinístico e sem side effect**
(nunca IA escondida) traduz para `ProviderInstruction`. Duas invariantes
centrais: `FrameArtifact` pode servir de seed visual mas nunca vira nova
fonte factual (a verdade continua no `ProductVisualReferenceSet`); o
adapter pode mudar a forma de expressar a intenção mas não pode
ampliar/reduzir/reinterpretar seu significado semântico (proibido
inventar "abrir tampa traseira" ou "trocar bateria" que nunca foram
sustentados). Parâmetros estruturados (duração, aspect ratio, seed,
áudio) ficam explicitamente fora do texto via `VideoParameterTransport`
(`STRUCTURED`/`PROMPT_TEXT`/`UNSUPPORTED`) — nunca embutidos por
obrigação quando o provider oferece campo próprio. Diferente das Skills
07/08/09, a Skill 10 é pura/determinística sem chamada externa — não
precisa de checkpoint nem state machine, só idempotência simples por
`(jobId, attemptNumber)`. `VIDEO_VISUAL_SEED_REQUIRED` é `BLOCKED`, não
erro técnico: nunca fabricamos text-to-video pra contornar a exigência de
fidelidade visual. Fronteira explícita: `VIDEO_PROVIDER_TEMPORARILY_
UNAVAILABLE` não pertence aqui — Skill 10 não checa runtime do provider.
Não existe `NO_VALID_PROMPT` — um intent+policy válidos sempre produzem
instrução válida se houver adapter compatível; incompatibilidade é
`VIDEO_PROVIDER_CAPABILITY_UNSUPPORTED`, nunca resultado fabricado.

**Skill 11 — Executor de Geração: APROVADA — 11/25 em 2026-09-18.**
Primeira Skill do pipeline com side effect externo **pago** real
(submit/poll/download/billing). Recebe o `VideoPromptArtifact` exato da
Skill 10 e o submete ao provider de vídeo (Veo), acompanha a operação
assíncrona até conclusão/falha definitiva, e persiste o vídeo resultante
de forma durável — sem jamais duplicar cobrança nem inventar
sucesso/fracasso com estado desconhecido. Auditoria real trouxe uma
restrição técnica não-negociável: o cron existente roda com
`maxDuration=60s` (`publish-product/route.ts`), e Veo tipicamente demora
minutos — então a Skill foi desenhada desde a V1 como **state machine
multi-tick**: cada invocação executa no máximo uma transição externa
bounded (submit, reconcile, poll ou materialização), nunca um
`while(!done) sleep/poll`. `VideoExecutionState`, próprio da Skill 11, é
distinto do lifecycle de Job da Skill 02 (sem `SUCCEEDED` final aqui) —
evita duas máquinas de estado concorrentes. **Invariante mais importante
da Skill:** antes de qualquer chamada paga, tudo é persistido
duravelmente (`providerRequestKey`, payload exato, `state=SUBMITTING`);
se o processo cair antes de confirmar a resposta, isso nunca vira
resubmissão automática — vira `RECONCILE` ou
`EXTERNAL_STATE_UNKNOWN`/`BLOCKED`. Distinção textual entre
`REMOTE_SUCCEEDED` (provider concluiu) e `MATERIALIZED` (nós possuímos o
vídeo de forma durável) evita que falha de download/Storage após sucesso
remoto dispare uma segunda geração paga — separando `GENERATION retry`
de `ARTIFACT MATERIALIZATION retry`. Cadeia canônica própria
(`VideoGenerationExecution` → `ProviderSubmission` → `ProviderOperation`
→ `ProviderOperationObservation[]` append-only → `RemoteGenerationResult`
→ `VideoArtifact`) deliberadamente **não** duplica `JobStatus`/
`RetryPolicy`/lease/`externalEffectState`, que continuam exclusivos da
Skill 02. Fronteira nova e explícita com a Skill 23: quem decide quota
(Skill 23) vs. quem executa com autorização válida (Skill 11) — toda
submissão paga exige `spendAuthorizationRef` durável, retransmissão
idempotente não consome nova autorização, nova Attempt sempre exige nova
autorização. `VIDEO_STALE_LEASE_FENCE` tratado como
`CONCURRENCY_GUARD`/`SAFE_ABORT` (proteção normal de concorrência), nunca
como falha de Job. Sucesso técnico da Skill 11 (`MATERIALIZED`) **não**
significa vídeo aprovado — a Skill 12 ainda audita o artefato.

**Skill 12 — Auditor de Vídeo: APROVADA — 12/25 em 2026-09-18.** Recebe o
`VideoArtifact` exato da Skill 11 e decide, com evidência reproduzível,
se o vídeo respeita produto, roteiro, direção criativa e requisitos
técnicos — sem corrigir o vídeo, sem publicar, e sem confundir
"qualidade" com performance comercial futura. Auditoria real confirmou
greenfield operacional (zero código de análise/entendimento de vídeo,
extração de frame obrigatória já que o SDK `openai` instalado não
suporta vídeo nativo) mas encontrou três precedentes reais reutilizáveis
estruturalmente: `confidence` 0..1 float, `score`+`score_breakdown`
estruturado, e o padrão técnico de empacotar múltiplas imagens num único
`image_url` array numa chamada de visão (Concierge). Veredito
deliberadamente **não** é `APPROVED`/`REJECTED` (isso invadiria a
Skill 03) — é `COMPLIANT`/`NON_COMPLIANT`/`INCONCLUSIVE`.
`INCONCLUSIVE` é indispensável: ausência de evidência (áudio não
extraído, cobertura de timeline insuficiente, detalhe do produto não
observável) nunca vira `COMPLIANT` por omissão. Arquitetura de 4 etapas
(inspeção técnica → extração de evidência → análise semântica/criativa →
veredito determinístico) — a IA produz observações estruturadas, nunca
decide o veredito final diretamente; a policy determinística aplica
regras sobre as observações. Frame extraído do vídeo é evidência, nunca
nova fonte factual sobre o produto — a verdade continua no
`ProductVisualReferenceSet` (mesma proteção já congelada nas Skills
09/10). Checkpoint de inferência paga (padrão Skills 07/08, diferente da
Skill 10) com distinção crítica: `REJECTED` do checkpoint (resposta do
provider quebrou schema) **nunca** equivale a
`VideoAuditVerdict=NON_COMPLIANT` — são conceitos completamente
diferentes. Erro de integridade dedicado
(`VIDEO_AUDIT_INVALID_VERDICT_DERIVATION`) detecta combinações
logicamente impossíveis (ex.: hard violation válida + veredito
`COMPLIANT`). Métricas de negócio como `conversion_probability` ou
`viral_score` são explicitamente proibidas nesta Skill — isso pertence
às Skills 18/19, com dados reais.

**Skill 13 — Corretor Automático: APROVADA — 13/25 em 2026-09-18.** Recebe
um `VideoAuditResult` exato com veredito `NON_COMPLIANT` (Skill 12) e
decide **o que** precisa mudar para tentar remover as violations — nunca
**se** haverá nova tentativa (isso continua exclusivo da `RetryPolicy` da
Skill 02). Auditoria real encontrou um precedente direto de "retry com
modificação, sem loop": `shouldRetryWithSuggestedTerm`/
`buildRetrySearchTerms` no Concierge (`src/lib/concierge/orchestrator.ts`),
single-shot, `alreadyRetried:false` hardcoded, sem contador nem
persistência — e confirmou que `RetryPolicy` da Skill 02 é hoje puramente
conceitual (tipo referenciado, zero implementação) e que não existe
nenhum eixo de versionamento de artefato no código: `(jobId,
attemptNumber)` já É a identidade/versionamento das Skills 09-12.
Descoberta arquitetural real durante o debate: como a Skill 10 é
determinística (mesmo input → mesmo `VideoPromptArtifact`), simplesmente
autorizar uma nova Attempt não mudaria nada — corrigido com um patch
compatível (`correctionContext?`) aplicado retroativamente e sem reabrir
9/25 nem 10/25 em `FrameGenerationContext` (Skill 09) e
`VideoGenerationIntent.upstream` (Skill 10), incluído deliberadamente no
hash de ambos como exceção documentada à regra "sem IDs operacionais no
hash". `CorrectionScope` tem 4 níveis ordenados
(`VIDEO_REGENERATION_ONLY < PROMPT_AND_VIDEO < FRAME_PROMPT_AND_VIDEO <
UPSTREAM_REVISION_REQUIRED`) — a Skill 13 escolhe deterministicamente o
**menor** escopo que resolve **todas** as violations bloqueantes, nunca
um escopo livre. `CorrectionPolicy`/`CorrectionRule` tornam a derivação
auditável (não é a Skill "achando" que um escopo parece adequado) e a
Skill 13 nunca reinterpreta o veredito da Skill 12 (não pode baixar
severity nem descartar violation). Anti-loop formalizado via
`CorrectionViolationSignature` (assinatura semântica, exclui IDs/
timestamps) + `CorrectionPlanResult.NO_PROGRESS` (resultado de domínio,
não erro) — com uma exceção explícita documentada para regeneração
estocástica de vídeo (`repeatReason:'STOCHASTIC_REGENERATION'`), sem que
isso altere o teto de tentativas, que continua só na Skill 02. Nenhum
side effect pago/provider externo na V1 (transformação puramente local) —
logo sem checkpoint, sem `EXTERNAL_STATE_UNKNOWN`, sem `BLOCKED` técnico;
`UPSTREAM_REVISION_REQUIRED` e `NO_PROGRESS` cobrem os casos que outras
Skills tratariam como `BLOCKED`. Durante a auto-verificação final, o
ChatGPT corrigiu uma imprecisão minha na descrição (não no contrato): eu
disse que `signatureSchemaVersion` "era o próprio hash" de
`CorrectionViolationSignature` — na verdade é só o literal de versão do
schema, distinto do campo `signatureHash` real (`CORRECTION_VIOLATION_
SIGNATURE_V1:sha256:<hex>`); o contrato já estava correto, só a frase da
minha auto-verificação precisou de ajuste.

**Skill 14 — Finalizador de Vídeo: APROVADA — 14/25 em 2026-09-18.**
Recebe um `VideoArtifact` **exato** e um `VideoAuditResult` **exato**
(por ID+hash, nunca "a auditoria mais recente" — quebraria replay
determinístico) com `verdict = COMPLIANT`, e produz — para exatamente um
`publicationTargetKey` por Job (Skill 01 materializa Jobs independentes
por canal) — um `FinalizedVideoRendition` tecnicamente compatível com a
policy verificada daquele destino, **sem alterar o conteúdo aprovado**.
Auditoria real confirmou greenfield total (zero FFmpeg/lib de vídeo
instalada, zero bucket de Storage, Skills 15-17 ainda não existem como
SPEC.md) e que o único precedente real de formato por canal no repo é de
**imagem estática** (Instagram Stories/Feed via `story-template/
route.tsx`, 1080×1920/1080×1350) — registrado explicitamente como
`STATIC_IMAGE_ONLY`, não reaproveitável como fato de formato de vídeo.
Decisão central do debate: `ChannelRenditionPolicy` exige
`verification.status = VERIFIED` **e** `completeness =
COMPLETE_FOR_VIDEO_FINALIZATION` antes de qualquer produção real —
canais sem policy confirmada ficam `CHANNEL_POLICY_NOT_CONFIGURED`
(BLOCKED), nunca um formato "provável" inventado. Distinção mais
importante: `FinalizationTransformClass` separa `CONTENT_PRESERVING`
(remux, transcode, resize proporcional com padding, normalização) de
`SEMANTICALLY_SENSITIVE` (crop, trim, speed change, burn-in, watermark
que oculta conteúdo) — a V1 se restringe estritamente a
`CONTENT_PRESERVING`; quando o canal exigiria alteração semântica pra
caber, o resultado é incompatibilidade de domínio
(`SOURCE_DURATION_INCOMPATIBLE`/`SOURCE_ASPECT_RATIO_INCOMPATIBLE`/etc.,
via `FinalizationCompatibilityResult`), nunca um corte forçado que
poderia remover o CTA ou parte da narrativa auditada. Execução desenhada
como `MediaFinalizationProcessor` com dois modos —
`INLINE_BOUNDED`/`ASYNC_PROCESSOR` — porque, diferente da Skill 11 (onde
o provider remoto processa por minutos via polling), um FFmpeg local
morto aos 60s do Vercel não pode simplesmente "continuar" no próximo
tick; mesma disciplina de pré-persistência antes de rede (`SUBMITTING`
antes do submit) e reconciliação (nunca resubmissão cega) da Skill 11.
`complianceCarryForward.independentlyReauditedAfterFinalization = false`
deixa explícito que "source foi COMPLIANT + só transforms
content-preserving" não equivale a "Skill 12 auditou estes novos bytes"
— se overlays/crop forem permitidos no futuro, isso deixa de valer e uma
nova auditoria vira obrigatória. Saída neutra (`FinalizedVideoRendition`
+ `renditionHash`) desenhada para a futura Skill 17 consumir sem que a
Skill 14 precise adivinhar o contrato dela. Durante a integração, um bug
de duplicação análogo ao da Skill 13 foi encontrado e corrigido: a
versão "ampliada" de `MediaFinalizationCapabilities` (com campos de
idempotência/billing) foi colada na seção de idempotência, mas a versão
inicial simplificada continuou no arquivo — duas declarações do mesmo
tipo. Removida a inicial antes do fechamento. O ChatGPT também corrigiu
uma contagem: o plano de testes foi documentado como "56 casos" mas a
numeração real chegava a 74 — corrigido para 74 antes do carimbo final.

**Skill 15 — Gerador de Link/Tracking: APROVADA — 15/25 em 2026-09-18.**
Diferente das Skills 09-14, esta **não é greenfield**: a auditoria real
encontrou geração de link de afiliado rastreável já em produção
(`generateAffiliateShortLink()`, `src/lib/shopee/queries.ts`, mutation
GraphQL `generateShortLink(originUrl, subIds)`, persistida na tabela
real `affiliate_links` com 28 linhas) — mas um bug real já existente: o
comentário do post do Instagram hoje usa `offer_snapshots.offer_link`
(link auto-gerado, **sem tracking**) em vez do `affiliate_links.short_link`
rastreado, ou seja, dois caminhos paralelos desconectados. A Skill 15
resolve essa desconexão virando a única autoridade do link publicável no
pipeline de vídeo: `offer_link` passa a ser tratado só como `originUrl`;
o bug atual fica documentado como `LEGACY_TRACKING_BYPASS`, corrigido em
runtime, sem mexer no código agora. Achado técnico crítico: `subIds` tem
limite real de 5 entradas com formato restrito (erro real `[11001]
invalid sub id`) — a Skill 15 não tenta codificar
tenant+produto+vídeo+Job+canal+Attempt nos 5 slots (o erro natural
aqui); em vez disso, um `AffiliateTrackingIdentity` persistido carrega
os dados ricos e um `trackingToken` opaco e curto é o único componente
realmente necessário pra reconstruir a identidade internamente.
`attemptNumber` fica fora da identidade — Attempt é infraestrutura de
execução, não identidade comercial da publicação. Eixo de identidade V1:
tenant+provider+produto promovido+offer snapshot+canal+
`finalizedVideoRenditionHash` (da Skill 14, não do `VideoArtifact` da
Skill 11) +tracking policy snapshot — nem "produto+canal" (largo demais,
apagaria a distinção entre vídeos diferentes) nem "por Attempt" (ruído
técnico sem significado comercial). Achado igualmente crítico:
`conversionReport` da Shopee **não** expõe `subId`/`clickId` por
conversão nos campos hoje consultados — capacidade real de atribuição
criativo→conversão é `UNVERIFIED`, nunca assumida como garantida; a
Skill 15 declara capacidades separadas (geração de link vs. capacidade
de prova de atribuição são independentes) em vez de um booleano
genérico "tracking funciona", e define uma taxonomia de 5 níveis
(`DIRECT_PROVIDER_CONFIRMED`/`OWN_CLICK_CONFIRMED_ONLY`/
`PROVIDER_AGGREGATE_ONLY`/`INFERRED_HEURISTIC`/`UNATTRIBUTED`) —
`INFERRED_HEURISTIC` nunca vira verdade financeira canônica, e a janela
de atribuição de 7 dias da Shopee (já registrada na Skill 05) nunca
sozinha comprova `DIRECT_PROVIDER_CONFIRMED`. Produto promovido ≠
produto comprado, sempre preservado explicitamente pras Skills 18/19.
Durante a revisão final, o ChatGPT corrigiu duas classificações erradas
de erro (`AFFILIATE_TRACKING_POLICY_BINDING_NOT_FOUND`,
`AFFILIATE_PROVIDER_PROFILE_NOT_FOUND` e
`AFFILIATE_SUBID_POLICY_NOT_VERIFIED` estavam como `FATAL_ERROR`, mas
"integração ainda não configurada" deveria ser `BLOCKED`/`POLICY_BLOCKED`
— distinto de "referência corrompida", que continua fatal) e uma
contagem de testes (72 casos críticos, não 62).

**Skill 16 — Automação de Comentários/DM: APROVADA — 16/25 em
2026-09-18.** Igual à Skill 15, **não é greenfield**: já existe um
webhook real em produção (`src/app/api/webhook/instagram/route.ts`)
que valida `X-Hub-Signature-256`, escuta `entry[].messaging[]` (DM, não
comentário público — responder "QUERO" a um Story vira mensagem
direta), faz match por `includes("quero")` simples e manda um
`REPLY_TEXT` hardcoded com um link **sem tracking**
(`https://descontochegando.com.br/hoje`), nunca vindo de um
`AffiliateLinkArtifact` da Skill 15. Achados críticos da auditoria:
zero correlação hoje entre o evento e o vídeo/produto que motivou a
mensagem (`social_posts` grava `media_id` mas o webhook nunca consulta
essa tabela); dedupe só em `Map` em memória (TTL 10min) que evita
reprocessar o mesmo `mid`, mas não evita responder duas vezes ao mesmo
usuário em mensagens diferentes, nem persiste entre cold starts;
bloqueio real e já registrado de Tech Provider/CNPJ limitando produção
geral a contas testadoras. Decisão arquitetural central: a
`CreativeCtaMatch` (Skill 07) sozinha nunca autoriza envio de link
específico — exige também `SocialPublicationContextResolution.status =
RESOLVED_EXACT` contra um `SocialPublicationBinding` que a futura
Skill 17 vai produzir; **zero heurística de "último post"** é
invariante formal (nunca escolhe pela publicação mais recente, produto
mais recente, ou último `AffiliateLinkArtifact`). Achado importante
registrado explicitamente pra Fable/Astra: "um binding perfeito na
Skill 17 não resolve correlação se o evento inbound não contiver uma
chave que possa chegar até esse binding — correlação exige evidência
nos dois lados da relação". Migração do matching legado feita via
`SHADOW_COMPARE` (roda o `includes()` antigo determinando a resposta
real enquanto o novo matcher normalizado NFKC só registra divergência),
sem exigir alterar o webhook hoje. Três camadas de dedupe distintas
substituem o `Map` de 10 minutos: dedupe de evento (transport), dedupe
de oportunidade de resposta via `ResponseGuard` com aquisição atômica
(anti-spam de negócio), e checkpoint de idempotência do envio externo —
um patch crítico do ChatGPT corrigiu a fórmula do dedupe de negócio pra
não incluir o hash da policy/template (senão um deploy de policy nova
furaria o anti-spam e reenviaria o link pro mesmo usuário).
Capacidade de automação é capability-aware granular (`TESTER_ONLY`/
`BLOCKED_BY_ACCOUNT_REQUIREMENT`/etc. por ação específica, não um
booleano `instagramEnabled`) — o bloqueio real de Tech Provider vira uma
capability concreta bloqueada, não torna a Skill inteira inviável.
Durante a auto-verificação final, o ChatGPT encontrou uma lacuna
contratual real: dois tipos (`MessagingCapabilityStatus` e
`MessagingAutomationCapabilitySnapshot`) eram referenciados por hash mas
nunca formalmente definidos como `type` — corrigido definindo-os
explicitamente na própria Skill 16, com nota de que nenhuma Skill
anterior aprovada é dona desse conceito ainda (ficará com a futura
Skill 24).

**Skill 17 — Publicador Multicanal: APROVADA — 17/25 em 2026-09-18.**
Skill pivotal: fecha três cadeias já aprovadas — Skill 14
(`FinalizedVideoRendition`) → Skill 17 (publica) → Skill 15
(`AffiliateLinkArtifact`) → Skill 17 (embute o link) →
`SocialPublicationBinding` → Skill 16 (correlaciona comentários/DM).
Igual às Skills 15/16, **não é greenfield**: `publish-product/route.ts`
publica duas imagens estáticas (feed+story) via Windsor.ai em produção
real, extrai `media_id` por regex frágil de string em linguagem
natural, e repete o mesmo `LEGACY_TRACKING_BYPASS` (link sem tracking)
já documentado nas Skills 15/16. Decisão arquitetural central: duas
fases distintas — `PublicationIntent`/`Reservation` congelados antes de
qualquer chamada de rede, `SocialPublicationBinding` final só nasce
depois de confirmação externa com identidade confiável — nunca um
binding fabricado antecipadamente (a Skill 16 já espera essa janela via
`WAIT_FOR_BINDING`). `LogicalPublicationIdentity` deliberadamente
exclui `providerKey`/`jobId`/`attemptNumber`: representa **o que** será
publicado, não **como** — trocar de provider (ex.: Windsor falhar e
usar API oficial no futuro) nunca autoriza duplicar o post. Capability
granular por provider+target+mediaKind deixa explícito que a capacidade
real de imagem (Windsor+Instagram) não promove a capacidade de vídeo
para `VERIFIED` — o runtime de publicação de vídeo real continua
`NOT_IMPLEMENTED`. Inclui um patch compatível na Skill 03
(`PublicationAuthorizationResolutionRef`, sem reabrir 3/25) formalizando
a revalidação atômica da trava `FIRST_REAL_PUBLISH` (decisão D-012) —
com proteção explícita contra a corrida real de duas "primeiras
publicações" simultâneas disputando o mesmo gate. `submissionSequence`
(não `attemptNumber`) distingue retry técnico de nova submissão externa
legítima — só incrementa com prova de que a tentativa anterior não
criou side effect. Cancelamento pós-publicação nunca apaga um post real
— a `PublicationExecutionState` formalmente não permite `CANCELLED`
depois de `PRIMARY_PUBLISHED`. Durante a auto-verificação final, foi
encontrado e corrigido o mesmo tipo de bug já visto nas Skills 13/14/16:
uma definição parcial de `PublicationStepExecution` (sem
`externalEffectState`/`submissionSequence`) ficou duplicada no arquivo
quando o patch foi colado por cima.

**Skill 18 — Coletor de Métricas: APROVADA — 18/25 em 2026-09-18.**
Recebe `SocialPublicationBinding` (Skill 17) e `AffiliateLinkArtifact`
(Skill 15) e coleta/normaliza/persiste observações imutáveis de
métricas e evidências — nunca interpreta performance (isso é Skill 19).
Auditoria real trouxe um achado atípico no meio do pipeline: **não é
greenfield na capacidade de leitura**, diferente do padrão 09-17 —
Windsor.ai já tem acesso real e autenticado a métricas orgânicas do
Instagram (`media_views`, `media_reach`, `media_engagement`, etc., conta
real `17841471469860803`) via `get_fields()`, mas **zero código do app
já consultou isso**; nenhum cron ou rota existe hoje pra coleta. Achado
crítico complementar: `click_events` (tabela real) não tem
`sub_id`/`click_id`/`affiliate_link_id` — não é joinável a
`affiliate_links` hoje. Decisão estrutural central do debate:
`MetricCollectionInput` é uma união discriminada por domínio
(`PUBLICATION_PERFORMANCE`/`ACCOUNT_PERFORMANCE`/`AFFILIATE_COMMERCE`/
`OWNED_AFFILIATE_CLICK`), nunca um objeto com campos opcionais — cada
domínio tem autoridade/granularidade própria. Capability nunca é um
booleano "Windsor funciona": granular por campo
(`MetricReadCapabilityStatus`/`MetricEntityScope`), schema existir no
provider prova disponibilidade declarada, não prova leitura/
correlação funcionando até um teste real. Métricas orgânicas e dados
comerciais vivem em contratos formalmente separados
(`PublicationPerformanceObservation`-like vs. `CommerceObservation`) —
"8.000 views" e "R$42 de comissão" nunca compartilham contrato. Toda
coleta é append-only (`MetricSnapshot` nunca sobrescreve o anterior,
mesmo valor igual em nova coleta ainda gera novo snapshot) — nunca
existe "métrica definitiva". Maior decisão de governança: **Skill 18,
não Skill 19, protege o nível de evidência** — materializa
`AffiliateAttributionEvidence` via `AttributionEvidenceMaterializationResult`
com 4 níveis (`DIRECT_PROVIDER_CONFIRMED`/`OWN_CLICK_CONFIRMED_ONLY`/
`PROVIDER_AGGREGATE_ONLY`/`UNATTRIBUTED`); Skill 19 nunca pode elevar
esse nível silenciosamente — `INFERRED_HEURISTIC` fica reservado pra
análise futura, sempre separado da evidência canônica. Janela de
atribuição de 7 dias da Shopee (já registrada nas Skills 05/15) é
formalmente uma regra de possibilidade temporal, nunca causalidade —
nunca sozinha produz `DIRECT_PROVIDER_CONFIRMED`. Novo contrato
`OwnedAffiliateClickEvent` nasce como **patch compatível na Skill 15**
(dona natural — já possui `trackingToken`/`AffiliateLinkArtifact`),
resolvendo o gap de `click_events` sem inventar correlação retroativa:
o clique precisa nascer correlacionado, `click_events` legado fica
explicitamente `EXISTING/LEGACY/UNCORRELATED_TO_AFFILIATE_IDENTITY`
pra sempre (nenhuma migration fictícia). Cadência de coleta é híbrida
(event-triggered + cron reconciler + on-demand freshness) — só a
Skill 18 toca o provider, Skill 19 nunca chama Windsor/Shopee
diretamente; cron é reconciler ("quais séries estão due"), nunca
relógio da verdade. 30 `FATAL_ERROR`, 100 testes em 10 blocos.
Auto-verificação via grep confirmou zero tipos duplicados antes do
carimbo final (bug recorrente das Skills 13/14/16/17, desta vez evitado
proativamente).

**Skill 19 — Analista de Performance: APROVADA — 19/25 em 2026-09-18.**
Recebe evidência já materializada pela Skill 18 (`MetricSnapshot`,
`CommerceObservation`, `AffiliateAttributionEvidence`) e deriva
comparação/tendência/hipótese analítica — nunca coleta (Skill 18),
nunca apresenta relatório final (futura Skill 21). Decisão fundacional
mais importante: não existe "a performance" como propriedade eterna do
vídeo — todo score é contextual por horizonte + coorte + policy +
signals + versão do método; reaproveita o padrão de média ponderada
calibrada das Skills 04/05 (nunca soma, nunca renormaliza peso
ausente). Três níveis de elegibilidade de comparação
(`INSUFFICIENT_SAMPLE`/`DESCRIPTIVE_ONLY`/`COMPARATIVE_ELIGIBLE`) sem N
mínimo universal — amostra insuficiente permanece fora do ranking em
vez de receber número artificial. `AnalysisBasis` é a fronteira formal
de imutabilidade: antes dela a Skill pode aguardar a Skill 18, depois
dela nenhum dado novo entra naquela análise — reprocessar gera novo
`PerformanceAnalysisResult`, nunca sobrescreve o anterior. Maior
garantia estrutural: `HeuristicAttributionHypothesis` (o nível
`INFERRED_HEURISTIC` reservado pela Skill 18) recebe **triplo bloqueio
estrutural** contra virar evidência canônica ou score factual —
`canonicalAttributionLevelGranted`/`eligibleForEvidenceBackedScore`
travados literalmente como `false`, `PerformanceSignalSource` não
inclui hypothesis como origem possível, e a policy trava
`eligibleForCanonicalScore=false` — três barreiras independentes.
Delta de métricas `CUMULATIVE_COUNTER` (explicitamente delegado pela
Skill 18) vira `DerivedMetric` com proteção contra
`COUNTER_NON_MONOTONIC` (nunca gera valor negativo) e
`GROWTH_RATE_UNDEFINED_BASE_ZERO`. Cálculo é 100% determinístico —
zero LLM decide números, percentis, pesos, cohort, eligibility, rank
ou deltas; percentil usa `EMPIRICAL_MIDRANK`, calibração piecewise-
linear reaproveita exatamente o padrão das Skills 04/05
(`CLAMP_TO_ENDPOINTS`). Regra V1 que fecha uma ambiguidade sutil:
`set(signalKeys) = set(requiredSignalKeys)` em todo
`PerformanceScoreDefinition` — sinal faltando torna o score inteiro
indisponível, nunca parcial, eliminando a tentação de redistribuir
peso. Dois patches compatíveis: `AnalysisSubjectBasis` ganha
`individualCommerceObservations`/`ownedAffiliateClickEvents` (própria
Skill 19) e `historicalReadStatus` entra em
`MetricFieldCapability` (Skill 18, sem reabrir 18/25) — distinguindo
"dado atual está stale" de "nunca coletamos essa métrica no horizonte
histórico necessário". 34 `FATAL_ERROR`, 100 testes em 10 blocos.
Auto-verificação via grep confirmou zero tipos duplicados antes do
carimbo final.

**Skill 20 — Gerador de Variações: APROVADA — 20/25 em 2026-09-18.**
Recebe `PerformanceAnalysisResult` aprovado (Skill 19) e transforma
evidência em planos de variação criativa rastreáveis — nunca reescreve
o criativo original como se já soubéssemos a causa do desempenho, nunca
promove `HeuristicAttributionHypothesis` a fato. Decisão fundacional
mais importante: V1 é explicitamente `OBSERVATIONAL_CREATIVE_VARIATION_TEST`,
nunca `RANDOMIZED_CONTROLLED_EXPERIMENT` — mesmo chamando a entidade de
`CreativeVariationExperiment`, "experiment" significa protocolo
rastreável de geração/comparação, nunca prova estatística de
causalidade ("a variante observou performance superior" é legítimo;
"a dimensão causou a melhora" não é). `CreativeVariationExperiment` ≠
Run — o experimento é entidade própria owned pela Skill 20, cada
variante executável gera um Run canônico normal coordenado pela
Skill 01 (nunca um pipeline paralelo). Proteção central contra
explosão combinatória: uma dimensão primária por experimento e uma
mutação primária por variante — proibido produto cartesiano (6 hooks ×
8 archetypes × ... = centenas de vídeos); mudanças dependentes
(`DEPENDENT_ADAPTATION`) não contam como segundo eixo experimental.
Correção real de premissa da própria auditoria durante o debate: a
existência da Skill 20 **não** força criar política de
`StageSubjectBinding` para `VIDEO`/`PUBLICATION` agora — para geração
criativa o subject factual continua `PRODUCT`; a lineage experimental
(`ExperimentBaselineRef`) é uma dimensão separada. Seleção de target é
100% determinística — zero LLM decide dimensão ou valor-alvo da
variante (`llmMayChoosePrimaryDimension`/`llmMayChooseCanonicalTargetValue`
travados `false`); a IA continua livre para realizar criativamente a
decisão já tomada (Skills 07/08/09/10). `A/B/C` é rótulo de
apresentação, nunca identidade — identidade vem de hashes semânticos.
`ExperimentPlanCommit` funciona como visibility gate: nenhum
componente parcialmente materializado é consumível como experimento
executável. **`Skill 20 nunca declara "winner"`** — explicitamente
ausentes do contrato: `winner`/`loser`/`successful`/`uplift`; Skill 20
só verifica se um `ExperimentEvaluationBinding` satisfez
estruturalmente o plano pré-declarado (avaliação real, cálculo de
score/percentil/ranking, continua 100% com a Skill 19). Dois patches
compatíveis fecharam uma lacuna real descoberta durante o próprio
debate: `evaluationPublicationScope` (conta/superfície exata onde a
comparação acontece) entra no `ExperimentEvaluationPlan` e no
`VariantExecutionIntent` — sem isso seria possível comparar controle
no Instagram Reels com variante publicada em outra conta/rede. 37
`FATAL_ERROR`, 24 hashes canônicos, 100 testes em 10 blocos.
Auto-verificação via grep confirmou zero tipos duplicados antes do
carimbo final.

**Skill 21 — Relatórios: APROVADA — 21/25 em 2026-09-18.** Última
Skill do núcleo de conteúdo — transforma artefatos canônicos e
imutáveis das Skills anteriores (Skill 17-20) em projeções, snapshots,
renders e entregas rastreáveis, tenant-scoped e semanticamente fiéis
às fontes. Garantia central: pode selecionar, ordenar, formatar,
rotular e apresentar, mas nunca recalcula métricas de negócio, cria
scores, altera níveis de evidência, infere causalidade ou consulta
fontes operacionais cruas — auditoria real confirmou que a UI de admin
existente (`src/app/admin`) faz exatamente o oposto: calcula seus
próprios números ad hoc, sem consumir nenhum artefato das Skills
18/19/20 (precedente de UI/estilo, incompatível como arquitetura de
dados). Barreiras estruturais explícitas no SPEC contra análise
escondida: `ReportCanonicalValue` não possui variante `COMPUTED`,
`ReportSourceFieldRef` sempre aponta pra field canônico exato (nunca
uma expressão como `organic.score * 1.15`), `ReportProjection`/
`ReportTemplateDefinition` não possuem formula/business logic. Decisão
mais importante: "latest" só existe na resolução inicial da fonte —
depois disso, `ReportSnapshot` é imutável e independente de formato
(locale/template/truncamento pertencem exclusivamente ao render);
dado novo nunca reescreve snapshot antigo, sempre gera um novo.
Hipóteses heurísticas (`HeuristicAttributionHypothesis` da Skill 19)
recebem tripla barreira contra virar fato:
`canonicalAttributionPromotionAllowed=false`,
`externalCanonicalFreeTextAllowed=false`, `llmNarrationAllowed=false`
— narração por IA fica inteiramente fora da V1. Infraestrutura real de
entrega (Z-API/WhatsApp via `ChannelConnector`, usada pelo bot "Shopee
Concierge") é abstraída atrás de `ReportDeliveryAdapter` — a Skill 21
conhece a interface, nunca a biblioteca/provider específico.
Materialização, render e delivery têm identidades e idempotências
**independentes** (três `requestKey` distintos) — side-effect
checkpoint pré-network e estado `UNKNOWN` explícito protegem contra
duplicar envio externo quando a confirmação do provider é ambígua
(mesmo padrão de `externalEffectState` já usado em Skills anteriores
com side effect pago/externo). 43 `FATAL_ERROR`, 30 hashes canônicos,
100 testes em 10 blocos. Durante a auto-verificação, o bug recorrente
de tipo duplicado (visto antes nas Skills 13/14/16/17/20) apareceu de
novo — `ReportDeliveryReceiptCapability` definida duas vezes com
significados diferentes (objeto genérico vs. enum específico do
patch) — encontrado via grep e corrigido antes do carimbo final.

**Skill 22 — Gestor de Conta/Tenant: APROVADA — 22/25 em 2026-09-18.**
Primeira das 4 Skills de infraestrutura mínima (22-25), fechada numa
**única rodada condensada** — diferente do padrão de 3 rodadas/100
testes das Skills 01-21. Formaliza a autoridade de `tenantId` e
identidade/papéis (RBAC) que as Skills 03/19/21 já referenciavam
internamente como `trustedTenantId = Job.tenantId`, sem essa Skill
existir formalmente até agora. Auditoria real confirmou que
multi-tenant é hoje **puramente aspiracional**: zero conceito real em
qualquer lugar do repo (nenhuma tabela `tenants`/`accounts`/
`organizations`), `tenantId` é um valor único hardcoded (Skill 01:
"hoje (1 tenant) vem de configuração interna"), e a autenticação atual
não é auth de usuário real — senha única compartilhada
(`ADMIN_PASSWORD`) com cookie HMAC assinado, sem NextAuth/Supabase
Auth, sem identidade individual. Mas achado igualmente real: 9 menções
explícitas de "Skill 22" já escritas nas Skills 03/19/21, com
promessas vinculantes (RBAC/identidade de reviewer da Skill 03,
autoridade de `trustedTenantId` da Skill 19, autoridade de tenant/
account binding da Skill 21) — um stub mínimo ainda precisava
satisfazer isso formalmente. Decisão central: a Skill 22 resolve
exatamente duas perguntas — qual tenant uma execução está autorizada a
representar, e qual ator está agindo com quais capabilities — sem
criar autenticação, SaaS, usuários reais ou tabela de tenants agora.
O operador atual da senha compartilhada vira um principal explícito
`LEGACY_SHARED_ADMIN_SESSION` com `identityAssurance=SHARED_CREDENTIAL`,
que pode possuir capabilities específicas por policy, mas **nunca** é
representado como identidade humana nominal — policies que exigirem
identidade individual falham fechado até existir autenticação real.
Isso fecha a dívida real da Skill 03 (RBAC de reviewer) sem construir
RBAC empresarial prematuro: capability, não o rótulo "admin", é a base
de autorização. Fail-closed é invariante central — se a Skill 22 não
resolve inequivocamente tenant/actor/binding/capability, não há
fallback pra "default tenant"/"admin global"; a única exceção é o
adapter `LEGACY_SINGLE_TENANT_CONFIGURATION`, que é ele próprio a
autoridade atual (não bypass silencioso) — deixa de valer no dia em
que existir um segundo tenant real. Autorização é point-in-time, não
licença eterna: um `TrustedTenantContext` resolvido antes de um
binding ser revogado precisa ser revalidado no boundary sensível
(ex.: aprovação da Skill 03). Skill 22 não cria tabelas/auth/SaaS
nesta fase — persistência real só quando houver necessidade concreta.
Credenciais/contas/capabilities de Instagram/Shopee/Z-API continuam
fora do escopo, pertencendo à futura Skill 24. 8 `FATAL_ERROR`, 5
hashes canônicos, 30 testes em 6 blocos — "não precisamos criar 20
hashes para uma Skill aspiracional" (ChatGPT). Auto-verificação via
grep confirmou zero tipos duplicados antes do carimbo final.

## Regra de ouro (herdada)

Nenhuma Skill é considerada "pronta" só por ter o `SPEC.md` escrito. Uma
Skill só recebe implementação real depois de: spec debatida e aprovada pelo
ChatGPT → revisão do Claude Fable 5 Max → revisão do GPT-6 Astra → só então
código/schema/migration real, testado.

## Nenhum código de runtime existe ainda

Nenhuma tabela, migration, RPC, worker ou cron da Máquina de Vídeos foi
criada em produção. Todo o trabalho até aqui é especificação/contrato.

## Etapa 00A (spike visual) — status

Ainda não executada. Bloqueada por confirmação do modelo/modo exato
selecionado no Flow Ultra (pergunta em aberto com o Heber).
