# `CONTRACT_CONVENTIONS_V1` — convenções compartilhadas de nomenclatura/vocabulário

> Ponto M1 do reparo transversal pós-revisão Fable (2026-09-18,
> primeiro dos 8 achados MINOR — depois dos 17 SIGNIFICANT S1-S17
> fechados). Não é um artifact hash — é uma **versão normativa
> compartilhada** (mesmo padrão de `CANONICAL_SERIALIZATION_V1`/S10,
> `AUDIT_EVENT_V1`/S11, `RESULT_MATERIALIZATION_V1`/S14,
> `VIDEO_COMPOSITION_V1`/S6, `EXECUTION_RUNTIME_V1`/S7).

## Achado real do Fable

O mesmo conceito de domínio representado por tipos/vocabulários
diferentes em contratos diferentes — não é sobre estética, é sobre
dois contratos "conversando línguas diferentes" pro mesmo fato, o que
esconde bugs de integração (comparação implícita de tipos diferentes,
coerção silenciosa, ambiguidade sobre se dois literais distintos
significam a mesma coisa). O objetivo deste ponto **não é padronizar
estética** — é remover essas duplicações reais onde encontradas, sem
inventar migração nova em conceitos que já eram consistentes.

## Decisão 1 — `stageKey` é o único nome de identidade de stage

Achado real: `01-orquestrador-de-producao/SPEC.md` tinha **dois campos
para o mesmo conceito** — `StageDefinition.stage: PipelineStage` /
`LogicalJobIntent.stage: PipelineStage` (tipo `PipelineStage = string`)
convivendo com `stageKey: string` usado em praticamente todo o resto do
kernel (`StageSubjectBinding`, `StageExecution`, `StageKernelContract`,
etc.). `02-gestor-de-fila-jobs/SPEC.md` também tinha `Job.stage:
string`. Nunca dois campos (`stage`/`stageKey`) como aliases pro mesmo
conceito de identidade de stage.

```typescript
type StageKey = string;
```

`PipelineStage` foi **renomeado** para `StageKey` (não é tipo novo —
patch in-place do mesmo alias). `StageDefinition.stage`,
`LogicalJobIntent.stage` (Skill 01) e `Job.stage` (Skill 02) viraram
`stageKey: StageKey`. Todo `logicalJobKey` template (`${stage}` →
`${stageKey}`) e nota histórica de migração do Ponto S5 atualizados
junto.

**0 hash schemas novos** — patch in-place dos hashes existentes que já
projetavam `stage` (agora projetam `stageKey`, mesmo dado).

## Decisão 2 — `PolicyVersion` é sempre string opaca, nunca number

```typescript
type PolicyVersion = string;
```

Regras: non-empty, opaque, case-sensitive, sem ordenação numérica
implícita (`"10" > "9"` nunca é regra de negócio). Exemplos válidos:
`"1"`, `"2"`, `"2026-09"`, `"approval-v3"`. Se algum owner precisar de
ordenação monotônica de verdade, deve ter um campo separado
(`revision: number`) quando isso realmente fizer parte do seu domínio
— `PolicyVersion` serve só para identidade/equality/version pinning.
**Nada de coerção**: `{"policyVersion": 1}` (JSON number) é inválido
onde o contrato exige `PolicyVersion`; só `{"policyVersion": "1"}`.

Achado real: de ~50 ocorrências de `policyVersion` no corpus, **uma
única** usava `number` —
`09-gerador-de-frame/SPEC.md:framePolicySnapshot.policyVersion`. Todas
as outras já usavam `string`. Corrigido só esse ponto real — não
reescrevemos as ~49 ocorrências já corretas de `policyVersion: string`
pra `PolicyVersion` mecanicamente (isso seria padronização estética
sem achado real por trás; `string` já satisfaz estruturalmente
`PolicyVersion`).

## Decisão 3 — `TrendEvidenceRef` para referência exata a `TrendEvidence`

Achado do Fable: o mesmo conceito aparecia como `TrendEvidence id`
solto em alguns lugares e `id + evidenceHash` em outros. Para
artifact/evidence imutável, só a segunda forma é aceitável — nunca
naked ID.

Owner continua sendo `06-pesquisa-de-tendencias/SPEC.md` (dono real do
`TrendEvidence`). Ref adicionada lá, usando os nomes de campo reais do
corpus (`evidenceId`/`evidenceHash` — não os nomes hipotéticos do
debate original):

```typescript
type TrendEvidenceRef = {
  evidenceId: string;
  evidenceHash: string;
};
```

Achado real ao investigar: `07-direcao-criativa/SPEC.md`
(`applicableTrendEvidence`) **já** carregava `evidenceId` +
`evidenceHash` inline — já era semanticamente uma exact ref antes deste
ponto, nada a corrigir lá. `CreativeProviderProposal
.referencedTrendEvidenceIds: string[]` foi deliberadamente **não**
migrado — é a proposta bruta e não-validada vinda diretamente do
provider de IA, que estruturalmente não tem como conhecer um
`evidenceHash` (só viu o ID no contexto que recebeu); forçar hash ali
inventaria um dado que o provider não pode fornecer. Essa proposta é
validada/reconciliada contra `applicableTrendEvidence` (que já é exact
ref) antes de virar fato canônico — não é o mesmo tipo de situação que
a Fable descreveu.

## Decisão 4 — `EvidenceMatchJudgement` para julgamento observacional

Achado real: `12-auditor-de-video/SPEC.md` expressava o mesmo
julgamento de match/evidência de duas formas diferentes — `MATCH` /
`MISMATCH` / `NOT_OBSERVABLE` em alguns campos (`ProductIdentityCheck`)
e `YES` / `NO` / `UNCERTAIN` em outros (`CreativeQualityAssessment`) —
e as **duas juntas, redundantemente**, no mesmo campo
(`VideoSemanticObservation.finding: 'MATCH' | 'MISMATCH' |
'NOT_OBSERVABLE' | 'UNCERTAIN'`, 4 literais pra 3 conceitos reais).

```typescript
type EvidenceMatchJudgement =
  | 'MATCH' // evidência observável suporta a correspondência
  | 'MISMATCH' // evidência observável contradiz a correspondência
  | 'NOT_OBSERVABLE'; // não existe evidência suficiente/observável
                       // para afirmar MATCH ou MISMATCH
```

Owner: `12-auditor-de-video/SPEC.md` (único lugar do corpus que usa
esse vocabulário — sem terceira declaração aqui, este doc só fixa a
regra). Mapeamento do legado: `YES → MATCH`, `NO → MISMATCH`,
`UNCERTAIN → NOT_OBSERVABLE`, sem alias legado mantido por
compatibilidade (pré-runtime, substituição direta). Migrados:
`VideoSemanticObservation.finding`, `ProductIdentityCheck`
(`colorPreserved`/`shapePreserved`/`distinctiveElementsPreserved`),
`CreativeQualityAssessment` (todos os 5 campos).

**Regra de escopo — não é ban global de `YES`/`NO`**: a normalização
vale só onde os dois vocabulários representam o mesmo julgamento de
matching/evidência. `ProductIdentityCheck.unsupportedElementsIntroduced:
'YES' | 'NO' | 'NOT_OBSERVABLE'` foi deliberadamente **mantido**
sem migração — é uma pergunta de presença de problema ("foi introduzido
elemento não suportado?"), não um julgamento de match-com-referência;
mapear mecanicamente `YES → MATCH` inverteria a semântica (`YES` aqui é
o resultado ruim, `MATCH` soa como resultado bom). Owner de
`EvidenceMatchJudgement` deve sempre fazer grep dos usos reais antes de
aplicar essa migração em qualquer campo novo — nunca substituir
`YES`/`NO` só porque o literal aparece no corpus (ex.: `feature
enabled? YES/NO` é outro domínio, fora de escopo).

## Decisão 5 — sem pseudo-configuração com um único literal possível

Se um campo de política/configuração só aceita **uma** possibilidade
(`union` com um único literal), isso não é configuração — é uma
constante fantasiada de opção, e deve ser removida em favor de um
invariante normativo documentado em prosa.

Achado real: `03-gestor-de-aprovacao/SPEC.md`
`ApprovalPolicy.onInsufficientEvidence: "ESCALATE_TO_MANUAL"` — único
literal possível. Removido. O comportamento vira invariante normativo
V1, já documentado no próprio arquivo (`INSUFFICIENT_EVIDENCE → sempre
escalona para humano`, `INSUFFICIENT_EVIDENCE` nunca auto-aprova, nunca
gera `CHANGES_REQUESTED`/rejeição). **Hard requirement continua hard**:
`VIOLATED` não entra nessa regra — `VIOLATED` e `INSUFFICIENT_EVIDENCE`
permanecem distintos; o desaparecimento do campo nunca vira override de
hard requirement. Não criar um segundo literal só para justificar a
existência do campo, e não adicionar comportamento novo
(`BLOCK`/`MANUAL` configurável) que o produto nunca especificou — M1 é
limpeza de contrato, não expansão de comportamento.

## Subitem já resolvido: `consumedAt` stale comment

Parte do achado original do Fable sobre M1 já foi corrigida
efetivamente no Ponto S13 (reparo transversal anterior): o comentário
associado ao campo errado em `JobResultEvent` foi corrigido, e
`consumedAt` foi formalizado como `LEGACY / NON-AUTHORITATIVE` nos
tipos legados permitidos (`LogicalJobIntent.consumedAt` em Skill01,
`ApprovalPolicyEvent`-equivalente em Skill03). Confirmado por grep
nesta rodada: nenhuma ocorrência de `consumedAt?: string;` no corpus
sobrevive sem o comentário `LEGACY / NON-AUTHORITATIVE` logo acima —
`M1-consumedAt = CLOSED BY S13`, sem repatch necessário.

## Ponto M2 — `OPTIONAL_REFERENCE_RULE_V1`

> Segundo dos 8 achados MINOR (2026-09-18). Adicionado a este mesmo
> arquivo (`CONTRACT_CONVENTIONS_V1`) em vez de um novo contrato
> compartilhado — é a mesma categoria de problema (nomenclatura/forma
> de contrato), só que sobre *opcionalidade* em vez de *vocabulário*.

Achado do Fable: refs opcionais que não representam uma escolha real do
domínio e existem só pra dizer "se vier, eu confiro". Isso cria
aparência de rigor sem acrescentar segurança — se o campo pode estar
ausente sem nenhuma mudança de comportamento, ele nunca foi um
controle de verdade.

> Uma referência só pode ser opcional se a ausência tiver significado
> de domínio próprio. Se a referência for necessária para provar
> lineage/provenance, ela é obrigatória. Se não for necessária para a
> semântica, ela não deve existir.

Toda `fooRef?: ...` no corpus se classifica em exatamente uma destas
três categorias — não existe quarta categoria "opcional só por
segurança":

- **A. `REQUIRED_PROVENANCE`** — o resultado da Skill não pode ser
  explicado sem saber qual upstream artifact foi usado → torna-se
  obrigatório.
- **B. `REDUNDANT_DEFENSIVE_REFERENCE`** — o campo só existe pra "se
  vier, confirma que bate", enquanto `Job`/`StageExecution`/o artifact
  subject já estabelecem inequivocamente tenant confiável e lineage
  exata → **remover**. Campo ausente → nenhuma validação acontece →
  não pode ser chamado de controle de segurança.
- **C. `GENUINELY_OPTIONAL_DOMAIN_INPUT`** — mantém-se opcional, mas a
  ausência precisa ter semântica explícita (idealmente tipada num
  union/outcome, não um optional solto).

**Regra literal**: `OPTIONAL reference MUST NOT be the sole mechanism
for tenant isolation, authorization, subject ownership, or immutable
lineage validation.` Se segurança depende daquele ref, ele é
obrigatório; se a segurança já é garantida por outro boundary
confiável, o ref redundante é removido.

### Achados reais aplicados (categoria B, `REDUNDANT_DEFENSIVE_REFERENCE`)

Grep confirmou o padrão exato (`"OPCIONAL, defensivo"`) em 3 lugares —
não hipotéticos, os 3 já existiam no corpus real:

- `05-analise-de-oferta-comissao/SPEC.md`:
  `OfferAnalysisInput.candidateRefs?: SelectedProductCandidateRef[]` —
  a própria spec já dizia "se ausente, a Skill05 simplesmente reabre o
  `ProductDiscoveryResult`" — zero mudança de comportamento na
  ausência. Authority real: `discoveryResultId`.
- `06-pesquisa-de-tendencias/SPEC.md`:
  `TrendResearchInput.candidateRefs?: OfferRankedCandidateRef[]` —
  comentário explícito "mesmo padrão da Skill05". Authority real:
  `offerAnalysisResultId`.
- `07-direcao-criativa/SPEC.md`:
  `CreativeDirectionInput.subjectRef?: CreativeSubjectRef` — a própria
  Skill já deriva `subjectRef: CreativeSubjectRef` (obrigatório, usado
  em todo o resto do arquivo) a partir da cadeia autoritativa
  `stageSubjectBindingId → StageSubjectBinding → OfferAnalysisResult →
  candidato`, nunca do campo opcional de input. Authority real:
  `stageSubjectBindingId`.

Os 3 campos foram removidos, junto com os 3 `FATAL_ERROR` que só
existiam pra validá-los
(`DISCOVERY_CANDIDATE_SET_MISMATCH`/`OFFER_CANDIDATE_SET_MISMATCH`/
`CREATIVE_SUBJECT_MISMATCH` — confirmado por grep que cada um só tinha
essa única razão de existir em todo o corpus).

### Categoria C confirmada, sem mudança

`07-direcao-criativa/SPEC.md` `applicableTrendEvidence` (já com
`evidenceId`+`evidenceHash` inline, Decisão 3 do M1) permanece — é
`REQUIRED_PROVENANCE` de fato dentro do seu próprio contexto (a
Direção Criativa citando exatamente quais evidências usou), não um
`fooRef?` solto. `TrendEvidence` em si pode legitimamente estar
ausente numa direção `EVERGREEN` (sem tendência aplicável) — isso é
`GENUINELY_OPTIONAL_DOMAIN_INPUT`, já expresso corretamente como
coleção vazia (`applicableTrendEvidence: []`), não como optional
scalar.

### O que NÃO fazer

Não banir globalmente todo `fooRef?` do corpus — optional scalar
continua válido quando a ausência tem semântica real (ex.:
`externalRef?`/`rawEvidenceRef?`/`rawEvidenceHash?` em
`TrendEvidence`, Skill06 — ausência de referência bruta de blob é
estado de domínio legítimo, não redundância defensiva). Não converter
mecanicamente uma proposta bruta de provider de IA
(`CreativeProviderProposal.referencedTrendEvidenceIds`, Skill07) numa
exact ref — o provider estruturalmente não tem como conhecer um hash;
essa distinção já foi resolvida no M1/Decisão 3. Não transformar tudo
em obrigatório — isso criaria dependências artificiais entre Skills;
primeiro classificar cada ref pela semântica real (A/B/C acima).

### Hashes e artifacts (M2)

**0 artifacts novos. 0 canonical hashes novos.** Remover um optional
ref redundante de artifact canônico altera seu hash projection — patch
in-place dos hashes existentes (pré-runtime), sem versionar pra V2 só
pela remoção.

### Erros (M2)

**0 `FATAL_ERROR` novos.** Os 3 códigos que existiam só pra validar os
campos removidos (`DISCOVERY_CANDIDATE_SET_MISMATCH`/
`OFFER_CANDIDATE_SET_MISMATCH`/`CREATIVE_SUBJECT_MISMATCH`) foram
removidos junto com os campos — tenant mismatch/hash mismatch/lineage
mismatch continuam cobertos pelos erros já existentes dos owners
reais (`discoveryResultId`/`offerAnalysisResultId`/
`stageSubjectBindingId`).

### Lint (`G_M2_*`)

Guarda de regressão AST — os 3 tipos reais nunca podem voltar a ter
essas properties: `OfferAnalysisInput.candidateRefs` (Skill05),
`TrendResearchInput.candidateRefs` (Skill06),
`CreativeDirectionInput.subjectRef` (Skill07). Deliberadamente **não**
implementado um ban global de "qualquer `PropertySignature` com
`questionToken` + sufixo `Ref`" — isso baniria categorias A e C
legítimas junto com B.

### Testes críticos (16)

1. Provenance necessária nunca é optional.
2. Tenant/security authority nunca depende de optional ref.
3. Redundant defensive ref é removida.
4. Legit domain-optional ref pode permanecer.
5. Ausência de legit optional possui semântica explícita.
6. Zero-or-more refs preferem `[]` a `undefined`.
7. Exact optional ref, quando presente, sempre tem id+hash.
8. Id sem hash nunca vira canonical ref.
9. Raw provider IDs não são confundidos com canonical refs.
10. Cross-tenant artifact continua fail-closed.
11. Hash mismatch continua fail-closed.
12. Required ref ausente é contract violation.
13. Removed ref não muda authority real.
14. Optional absence nunca significa implicit success.
15. 0 novos artifacts/hashes/FATALs.
16. Lint PASS.

### Critério de fechamento M2

M2 fica **CLOSED** quando: o grep das Skills 05/06/07 não encontra
mais nenhum ref opcional cuja única justificativa seja "validar se
vier"; todo ref necessário à provenance está obrigatório; refs
redundantes foram removidos; refs realmente opcionais possuem ausência
com significado de domínio; arrays zero-ou-mais usam `[]` quando
apropriado; tenant isolation continua baseada no contexto confiável +
ownership do artifact; raw provider IDs não foram promovidos
indevidamente a canonical refs; nenhum hash/artifact/FATAL novo foi
criado sem necessidade; e o lint dirigido aos campos reais passa.

M2 fechado conceitualmente.

## Ponto M3 — remoção de `poolSnapshotHash`

> Terceiro dos 8 achados MINOR (2026-09-18). Correção simples e
> definitiva: remover o campo dos contratos canônicos, não formalizado
> como versão normativa própria — é aplicação direta da regra já
> fixada abaixo.

Achado do Fable: `poolSnapshotHash` (`04-descoberta-de-produtos/SPEC.md`,
`ProductDiscoveryResult`) existia, mas não tinha consumer real, e a
própria spec já admitia "NÃO é lock otimista nem garante que o catálogo
não mudou depois". Nesse cenário, tentar "dar utilidade" ao campo agora
só criaria complexidade artificial.

**Regra**: se um hash não participa de provenance, replay, concorrência,
decisão de domínio ou validação efetiva, ele não deve existir no
contrato.

```typescript
poolSnapshotHash → REMOVIDO
```

Não substituído por `candidateSetHash`/`selectionUniverseHash`/
`poolVersion`/`etag`/`snapshotVersion` — seria só renomear o problema.
Também não transformado em optimistic lock real
(`expectedPoolSnapshotHash` + comparação `currentHash !== expectedHash
→ conflito`) — a Skill 04 não tem hoje esse requisito de concorrência;
se algum dia tiver, a solução é um mecanismo real
(constraint/transaction/claim/CAS/lease), nunca um hash de pool.

Reprodutibilidade continua vindo de onde sempre veio: policy
snapshot/version, hash canônico do resultado, tenant ownership,
`RESULT_MATERIALIZATION_V1` (S14) e `ProductUsageEvidence`/
`ReusePolicy` (S9) — nenhum desses depende do fingerprint do pool bruto.
Replay de uma execução antiga não reconsulta o pool — reutiliza o
resultado existente (S14); uma nova avaliação é uma nova operação
semântica, não uma "verificação" contra o hash antigo.

Não criar um artifact `PoolSnapshot` — se um dia for necessária uma
reprodução exata do universo de candidatos, isso é outro feature: um
snapshot real com conteúdo/provenance persistidos, não um hash solto.

### Aplicação

Removido de `04-descoberta-de-produtos/SPEC.md`: o campo no type owner
(`ProductDiscoveryResult`), a menção em `freshCandidateCount`/
`poolSnapshotHash` reproduzíveis, o bullet `POOL_SNAPSHOT_V1
equivalente` na lista de determinismo (substituído por "mesmo conjunto
de candidatos efetivamente lido do pool"), o parágrafo que comparava
`poolSnapshotHash` com `poolReadAt`, e a menção no resumo do
`AuditEvent`. Patch in-place — pré-runtime, sem V2.

### Hashes e artifacts (M3)

**0 artifacts novos. 0 hashes novos.** Apenas remoção de um campo de
projection existente — `POOL_SNAPSHOT_V1` deixa de existir como hash
schema.

### Erros (M3)

**0 `FATAL_ERROR` novos.**

### Lint (`G_M3_*`)

`G_M3_POOL_SNAPSHOT_HASH_BANNED` — via AST: `PropertySignature` chamada
`poolSnapshotHash` é erro em qualquer type de qualquer Skill. Ban seguro
(não textual) porque o campo inteiro está aposentado — evita repetir o
problema de uma nota histórica disparando contra si mesma (mesmo
cuidado do S4/S9/S14).

### Critério de fechamento M3

M3 fica **CLOSED** quando: o campo não existe mais em nenhum contrato
canônico; nenhuma semântica de lock falsa foi introduzida; nenhum
replacement hash equivalente apareceu; replay continua sendo regido por
`RESULT_MATERIALIZATION_V1`/S14; e o lint impede regressão.

M3 fechado conceitualmente.

## Ponto M4 — `EXECUTABLE_VERIFICATION_RULE_V1`

> Quarto dos 8 achados MINOR (2026-09-18). Curto por natureza — o
> problema material ("0 duplicatas"/"40 testes"/"25/25" sendo usados
> como afirmação de integridade mesmo quando parte vinha de revisão
> manual/estimativa) já foi resolvido de fato pelo `contract-lint.mjs`
> real (Ponto G, existente desde antes deste reparo). M4 é
> formalização de processo/reporting, não código novo.

**Regra**: qualquer métrica objetiva de integridade do corpus só pode
ser afirmada como fato quando vier de uma verificação executável e
reproduzível. Contagem manual pode aparecer só como nota não
autoritativa.

### Métricas autoritativas vs. não autoritativas

Só são fato quando vêm de `contract-lint.mjs` (ou outro checker
executável versionado no repo): `25 SPECs`, `0 duplicate declarations`,
`0 duplicate FATAL_ERROR`, `N canonical hash schemas` (só se o script
realmente contar), `N lint errors`, `PASS`/`FAIL`.

Não autoritativas (podem aparecer só como nota histórica, nunca como
critério de aprovação): `"~40 testes"`, `"cerca de 20 hashes"`,
`"parece não haver duplicatas"`.

### Regras específicas

1. **"0 duplicatas" só existe se o lint disser 0** — nunca grep visual,
   busca manual, contagem em editor ou memória do debate.
2. **FATAL_ERROR**: se o linter hoje só conta duplicatas (não
   quantidade total), a frase correta é `0 duplicate FATAL_ERROR`,
   nunca `existem exatamente N FATAL_ERROR`, a menos que exista
   contagem automatizada específica para isso.
3. **Hash count**: mesma regra — se o script não conta hash schemas,
   não virar critério oficial; usar `hash registry/lint checks passed`
   em vez de um número.
4. **`specified ≠ implemented`**: se um SPEC diz "30 testes" mas são só
   itens numerados em prosa, não é `30 executable tests`. Usar
   `verification cases`/`contract test cases`/`specified test
   scenarios` para casos descritos em SPEC; reservar `executable
   tests` para testes realmente implementados/executáveis.
5. **PASS precisa identificar o que passou** — evitar `"Skill07 PASS"`
   sozinho; preferir `contract lint: PASS` / `spec invariants: present`
   / `runtime implementation: not started`.
6. **`"25/25"` precisa de qualificador** — `25/25 Skills approved in
   specification`, nunca `25/25 concluídas` (runtime continua
   inexistente).
7. **Nenhuma Skill ganha status runtime pelo lint** — `contract-lint`
   prova types presentes/duplicatas ausentes/refs coerentes/pointers
   obrigatórios; **não prova** runtime funciona, provider funciona,
   FFmpeg funciona, deployment funciona, ou segurança production-ready.
8. **Não inflar o `contract-lint`** — não virar framework monstruoso só
   pra contar tudo; ele continua cobrindo invariantes objetivamente
   parseáveis, nunca julgamento semântico complexo/qualidade
   arquitetural/correção de negócio.
9. **Escopo do lint precisa ser nomeado** — se a checagem é `duplicate
   symbol within same SPEC`, não escrever `0 duplicate semantics
   across entire project`; se é `duplicate FATAL_ERROR within same
   file`, não escrever `0 duplicate FATAL_ERROR globally` a menos que
   o script realmente faça checagem global.
10. **M4 não exige ownership registry/hash registry/CI** — isso
    continua deferido do Ponto G (documentado em `CONTRACT-LINT.md`
    como especificação futura). `contract-lint.mjs` local continua
    suficiente na fase de spec; CI pode ser discutido quando runtime
    começar.
11. **Histórico não precisa ser reescrito retroativamente** — não
    voltar nos 25 SPECs apagando cada número histórico; só corrigir
    onde o número ainda for apresentado como garantia atual. Notas
    históricas podem permanecer como `"at that review point, N
    scenarios were listed"`, sem força normativa.

### Deliberadamente sem lint novo (`G_M4`)

Nenhuma regra `G_M4_*` foi criada — tentar ler frases como `"0
duplicatas"`/`"40 testes"` via regex seria frágil e cheio de falso
positivo. M4 é regra de reporting/processo, não de AST — a evidência de
fechamento é rodar `node scripts/contract-lint.mjs` e registrar só o
output real (`errorCount`, `PASS`, contagem de SPECs), nunca completar
números ausentes manualmente.

### Hashes, artifacts e erros (M4)

**0 artifacts novos. 0 hashes novos. 0 `FATAL_ERROR` novos.**

### Critério de fechamento M4

M4 fica **CLOSED** quando: `EXECUTABLE_VERIFICATION_RULE_V1` está
documentada; `contract-lint` é autoridade só sobre regras que
implementa; `PASS` não implica runtime correctness; manual count não
pode ser apresentado como verificação executável; spec test scenarios
são distintos de executable tests; `"25/25"` é sempre qualificado como
specification status; zero-duplicate claims respeitam o escopo real do
checker; nenhuma contagem arredondada participa de approval criteria;
nenhuma nova automação/CI é exigida; `contract-lint` real termina
`PASS`.

M4 fechado conceitualmente. Próximo: M5 (o mais importante dos oito) —
reduzir risco de over-engineering V1 nas Skills 06/20/21.

## Impacto nos hashes existentes

`stage → stageKey`, `policyVersion number → string` (1 ocorrência),
`YES/NO/UNCERTAIN → EvidenceMatchJudgement`, remoção de
`onInsufficientEvidence` — todas são patch in-place dos schemas
existentes (estamos pré-runtime). Atualizar canonical examples/test
vectors/hash examples que dependam desses shapes quando a implementação
começar. Não versionar para V2 só pelo rename.

## Hashes e artifacts

**0 artifacts novos. 0 canonical hashes novos.** `CONTRACT_CONVENTIONS_V1`
é versão normativa compartilhada (como este próprio documento), nunca
entra na contagem de hashes canônicos.

## Erros

**0 `FATAL_ERROR` novos esperados.** Tudo aqui é coberto por
validações/contract violations existentes dos owners (erro genérico de
contract validation quando um shape não bate). Não criar
`POLICY_VERSION_WRONG_TYPE_FATAL` nem equivalente só para M1.

## Lint (`G_M1_*`)

1. **Stage identity**: nos tipos kernel/scheduling conhecidos
   (`StageDefinition`, `LogicalJobIntent`, `Job`), `PropertySignature`
   chamada `stage` é proibida quando `stageKey` é a identidade
   canônica. Não é ban global da palavra "stage" (aparece
   legitimamente em prosa/`stageIterationId`/`stageExecutionId`/etc.).
2. **Policy version**: qualquer `PropertySignature` chamada
   `policyVersion` deve ser `string` — `number` é proibido.
3. **Trend evidence**: fora do owner artifact/ref (`TrendEvidenceRef`
   em Skill06), um consumer não pode carregar `trendEvidenceId`/
   `evidenceId` solto sem hash acompanhando, em tipo que represente
   fato canônico validado (não se aplica a propostas brutas de
   provider, como `CreativeProviderProposal`).
4. **Judgement**: nos tipos específicos que representam esse
   matching/evidência (`ProductIdentityCheck`,
   `CreativeQualityAssessment`, `VideoSemanticObservation`), os
   literais `YES`/`NO`/`UNCERTAIN` são proibidos depois da migração —
   não banir esses literais globalmente no corpus.
5. **Pseudo-config**: `ApprovalPolicy` não pode conter
   `onInsufficientEvidence` como property depois que o comportamento
   fixo V1 foi documentado.

Teste empírico recomendado: injetar temporariamente três violações
(`stage: string;` num tipo kernel monitorado, `policyVersion: number;`,
`onInsufficientEvidence: 'REQUIRE_MANUAL_REVIEW';`) e confirmar
`errorCount>=3, FAIL`; reverter.

## Testes críticos (18)

1. `stageKey` como única identidade machine-stage.
2. Aliases `stage` rejeitados nos tipos controlados.
3. `PolicyVersion` aceita string.
4. `PolicyVersion` number é rejeitado.
5. Nenhuma coerção implícita number→string.
6. Igualdade de `PolicyVersion` é opaca (sem ordenação numérica).
7. `TrendEvidenceRef` exige `evidenceId` e `evidenceHash`.
8. Naked trend evidence em consumer canônico é rejeitada.
9. `CreativeProviderProposal.referencedTrendEvidenceIds` continua
   naked de propósito (não é violação).
10. `MATCH`/`MISMATCH`/`NOT_OBSERVABLE` têm semântica distinta.
11. Legado `YES`/`NO`/`UNCERTAIN` não sobrevive nos tipos migrados.
12. `NOT_OBSERVABLE` não equivale a `MISMATCH`.
13. `unsupportedElementsIntroduced` continua `YES`/`NO`/`NOT_OBSERVABLE`
    (exclusão deliberada, não regressão).
14. `consumedAt` permanece apenas nos tipos legacy allowlisted do S13.
15. Comentários stale de `consumedAt` não sobrevivem.
16. `onInsufficientEvidence` deixa de existir como property.
17. Evidência insuficiente proíbe auto-aprovação (invariante).
18. `VIOLATED` continua distinto de `INSUFFICIENT_EVIDENCE`.

## Critério de fechamento M1

M1 fica **CLOSED** quando:

1. `stage` identity → `stageKey` only.
2. `policyVersion` → `string` only (0 ocorrências `number`).
3. `TrendEvidence` → exact ref com hash disponível (`TrendEvidenceRef`).
4. Matching judgement → `MATCH` | `MISMATCH` | `NOT_OBSERVABLE`.
5. `YES`/`NO`/`UNCERTAIN` removidos apenas desse domínio específico
   (matching/evidência), não globalmente.
6. `consumedAt` stale comment → confirmado já corrigido pelo S13.
7. `onInsufficientEvidence` → removido como falsa configuração,
   comportamento V1 fixado normativamente.
8. 0 artifacts novos.
9. 0 hashes novos.
10. 0 `FATAL_ERROR` novos.
11. Lint `G_M1_*` PASS.

M1 fechado conceitualmente. M2 (`OPTIONAL_REFERENCE_RULE_V1`, acima
neste mesmo arquivo) também fechado. Próximo: M3 — esclarecer
`poolSnapshotHash`.
