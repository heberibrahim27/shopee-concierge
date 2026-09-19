# Result Materialization / Replay Semantics — `RESULT_MATERIALIZATION_V1`

> **S14 do reparo pós-revisão Fable** (2026-09-18, ChatGPT ↔ Claude Code).
> Achado do Claude Fable 5 Max: Skills 04-08 diziam ao mesmo tempo "se
> existe resultado para `(jobId, attemptNumber)` → reutiliza, não
> recalcula" **e** "reexecução que produziria resultado logicamente
> incompatível → `*_RESULT_REPLAY_CONFLICT` FATAL". Só dá pra detectar
> incompatibilidade *recalculando* — e para a Skill 04, recalcular
> contra um pool mutável legitimamente difere, então um crash
> transiente vira `FATAL` de Run inteira. Uma regra sozinha faz
> sentido; as duas juntas estão erradas. Mesmo padrão em 05/06/07/08.

**Autoridade**: `PROJECT-LEVEL SHARED CONTRACT` — `RESULT_MATERIALIZATION_V1`
(versão de regra compartilhada, não um novo canonical artifact hash).
Não é Skill 26. Vale para 04, 05, 06, 07 e 08.

## Regra central

```text
RESULTADO JÁ MATERIALIZADO
→ REUTILIZA
→ NÃO RECALCULA
→ NÃO RELÊ FONTE EXTERNA
→ NÃO REINVOCA MODELO
→ NÃO COMPARA COM "O QUE DARIA AGORA"
```

## 1. Significado correto de replay

Replay significa: a mesma operação durável foi apresentada novamente
depois que seu resultado já existe. **Não** significa: executar
novamente a operação e comparar o novo resultado com o antigo.

```text
existing result + same Job/Attempt/input identity → return existing
```

Fim.

## 2. Unidade de materialização

Para as Skills 04-08, o resultado pertence exatamente a `tenantId +
jobId + attemptNumber + inputPayloadRef/invocation identity + result
contract`. Se os SPECs já possuem uma `resultKey` equivalente, manter
— não criar uma segunda identidade.

## 3. Algoritmo normativo

Em cada handler 04-08:

```text
1. validar tenant
2. validar JobExecutionBinding
3. validar Attempt
4. validar leaseFence
5. procurar resultado já materializado para esta identidade exata
6. SE EXISTIR:
     validar provenance estrutural
     retornar o artifact existente
     NÃO executar produtor
7. SE NÃO EXISTIR:
     executar a operação
8. materializar UM resultado imutável
9. retornar seu resultRef
```

O passo 5 acontece **antes** de: API/browser/marketplace fetch, trend
fetch, LLM, model generation, `new Date()` usado como observation, ou
qualquer recomputação.

## 4. O que significa "validar provenance"

Não comparar o conteúdo atual da internet/modelo. Comparar somente
identidade já persistida contra o contexto atual: `tenantId`, `jobId`,
`attemptNumber`, input/invocation identity, contract/schema, owner
Skill. Se o artifact diz que pertence a outro Job/Attempt/input →
contract/replay identity violation (conflito real).

## 5. A frase antiga deve morrer

Remover das Skills 04-08 qualquer semântica equivalente a "se a
reexecução produzir resultado logicamente diferente, lançar
`*_REPLAY_CONFLICT`". Está errada. Substituir por:

> A existência de um resultado válido impede a reexecução do produtor.
> Consequentemente, replay detection nunca recalcula a operação para
> comparar outputs.

## 6. Nova definição de `*_RESULT_REPLAY_CONFLICT`

Os `FATAL_ERROR` existentes (`DISCOVERY_RESULT_REPLAY_CONFLICT`,
`OFFER_ANALYSIS_RESULT_REPLAY_CONFLICT`, ...) **permanecem** — só
mudam de significado, para uma colisão real de identidade persistida:

- mesmo immutable result identity + tenant diferente;
- mesmo result identity + `jobId`/`attemptNumber` diferente;
- mesmo result identity + input identity diferente;
- tentativa de substituir artifact imutável existente por outro
  artifact incompatível.

**Não significam**: "a Shopee mudou", "a tendência mudou", "o modelo
gerou outra resposta", "recalculei e veio diferente".

## 7. Resultado externo mutável não é replay conflict

Skill 04 é o exemplo mais óbvio. Às 14:00, produto A tem vendas=1500,
preço=79.90; às 14:10, vendas=1512, preço=74.90. Isso **não** torna o
artifact das 14:00 inválido — ele representa a observação feita
naquele execution context. Se aquela Attempt já materializou seu
resultado, replay às 14:10 devolve o resultado das 14:00 — não
consulta a Shopee outra vez.

## 8. Dados mais recentes exigem nova operação semântica

Se queremos deliberadamente informação nova → nova operação, nunca
replay da anterior: novo `StageExecution`, novo Job,
`StandaloneWorkRequest` de refresh, ou novo Run, conforme o caso.
**Nunca** "mesmo result identity → refresh silencioso".

## 9. Skill 05

Preço/comissão/oferta também podem mudar. `OfferAnalysisResult`
existente → snapshot histórico válido → reutiliza. Para reavaliar
comissão atual: nova operação semântica.

## 10. Skill 06

Tendências são inerentemente temporais — ainda mais importante que
`Trend result` represente o conjunto de evidências observado naquele
momento. Mudança posterior é normal, não corruption.

## 11. Skill 07

Motivo adicional: geração criativa pode ser não determinística. Mesmo
`same model + same prompt + same temperature + same inputs` não
garante output textual byte-identical. `CreativeDirectionResult`
existente → reutiliza. Não chamar IA novamente pra "confirmar" o
replay.

## 12. Skill 08

Mesma regra pro roteiro. Se `ScriptResult` já foi persistido: same
Attempt replay → retorna `ScriptResult` existente. Uma nova versão do
roteiro por correção/editorial → nova operação semântica (Ponto D:
nova `StageIteration` → novo `StageExecution` → novo Job → `Attempt 1`).

## 13. Retry técnico antes de existir resultado

Cenário: `Attempt 1` → API timeout → nenhum domain result persistido.
Skill 02 pode criar `Attempt 2` (segundo S12). `Attempt 2` pode
observar dados diferentes — legítimo, porque `attemptNumber` é
diferente e ainda não havia resultado concluído da `Attempt 1`.

## 14. Resultado persistido muda a situação

Cenário: `Attempt 1` → `ProductDiscoveryResult` persistido → processo
cai antes do settlement. Ao retomar: **não** pesquisar produtos de
novo. O handler encontra o resultado existente e continua: existing
result → `JobExecutionResult SUCCEEDED` → `resultRef` existente. Isso
é precisamente o valor da idempotência.

## 15. Crash window

`external computation → result persisted → crash → Job ainda não
terminal`. Replay: lookup existing result → reuse → settle Job. Nunca
"call external source again".

## 16-18. Concorrência e leaseFence

O Ponto B já dá a proteção correta: antes de materializar resultado,
`leaseFence` deve ser atual — worker antigo →
`JOB_EXECUTION_STALE_LEASE_FENCE`. Ele não participa de uma disputa de
`*_RESULT_REPLAY_CONFLICT`. Dois workers com fences diferentes: o mais
antigo recebe stale fence, não "outputs diferentes, FATAL" — o
problema é ownership da execução, não divergência semântica dos
outputs. Se uma inserção perde uma unique constraint: reload existing
result → se provenance compatível → reuse existing (o candidate
perdedor recém-calculado é descartado, nunca comparado pra decidir
conflict).

## 19-20. Quando ainda existe replay conflict verdadeiro

Exemplo real: persistido `resultId=R, tenant=T1, job=J1, attempt=1,
inputHash=AAA`; outro write tenta afirmar `resultId=R, tenant=T1,
job=J1, attempt=1, inputHash=BBB` — colisão verdadeira, porque a
identidade persistida está sendo reutilizada para outra entrada →
`*_RESULT_REPLAY_CONFLICT`. Outro conflito verdadeiro: artifact
persistido `resultId=R, resultHash=H1`; uma operação de storage tenta
substituir o mesmo artifact imutável por `resultId=R, resultHash=H2` →
conflito (attempted immutable artifact mutation — não "rodei a IA
outra vez e ela respondeu diferente").

## 21. S10 entra diretamente aqui

Comparação de hashes válida exige mesmo hash schema +
`CANONICAL_SERIALIZATION_V1` (ver S10). Nunca usar diferenças de
serialization para gerar replay `FATAL`.

## 22. `observedAt`

Results baseados em mundo externo devem preservar o timestamp/evidence
de observação que já existir nos seus contratos. Não usar replay para
atualizar `observedAt` — o artifact é imutável. Se não existe
timestamp explícito mas já existe evidence snapshot temporal
equivalente, não criar campo redundante.

## 23. Source snapshot

Mesma regra para source snapshot/provider evidence/pool snapshot/trend
evidence/offer evidence — eles explicam o que foi observado, não são
locks pra impedir o mundo externo de mudar.

## 24. Result hash não é "hash do estado atual do mundo"

É hash do artifact materializado naquele execution context. Essa
distinção precisa aparecer explicitamente.

## 25-26. Não exigir determinismo do produtor

`RESULT_MATERIALIZATION_V1` exige **determinismo de replay**, não
**determinismo de geração**: `same persisted operation replay → same
persisted artifact`, mesmo que o produtor original fosse LLM/mutable
API/ranking/heurística/randomized model. Frase central pro shared
contract:

> Idempotency requires deterministic reuse of a materialized result;
> it does not require recomputation to be deterministic.

## 27-28. Relação com `JobExecutionResult`

O domínio materializa `ProductDiscoveryResult`/`OfferAnalysisResult`/
etc. O handler devolve `{ outcome: 'SUCCEEDED', resultRef:
<existing-or-new-result-ref> }` — `JobExecutionResult` não precisa
saber se o artifact foi criado agora ou recuperado. O `FATAL`
`JOB_EXECUTION_RESULT_CONTRACT_VIOLATION` do Ponto B continua válido,
mas vale pra conflito no próprio artifact/protocolo de
`JobExecutionResult` — não obriga a recomputar o domain result.

## 29. Duas camadas

```text
domain result materialization
  ↓
JobExecutionResult
  ↓
JobExecutionSettlement
```

Crash pode acontecer entre elas — por isso recuperar domain result sem
recomputá-lo é obrigatório.

## 30. Patch nas cinco Skills

Adicionar em 04/05/06/07/08:

> ### Shared result materialization semantics
>
> Este SPEC segue `RESULT_MATERIALIZATION_V1`. Se um artifact de
> resultado válido já existe para a identidade exata
> tenant/job/attempt/input, ele DEVE ser reutilizado e o produtor NÃO
> DEVE ser executado de novo. `*_RESULT_REPLAY_CONFLICT` identifica uma
> colisão real de identidade imutável/provenance persistida. NÃO DEVE
> ser detectado recalculando a operação e comparando o valor
> recém-produzido com o resultado materializado. Mudanças em fontes
> externas mutáveis ou outputs de modelo não-determinísticos não são
> replay conflicts.

## 31-32. Corrigir blocos antigos, preservar os FATAL

Localizar nas cinco Skills padrões como "reexecução que produziria
resultado diferente"/"resultado logicamente incompatível"/"recalcula e
compara" — esses trechos precisam ser substituídos, porque contradizem
a regra compartilhada (são poucos pontos concretos, diferente do S10
com 255 hashes — vale editar cada um). O padrão "já existe → reutiliza"
permanece. **Não remover** os `*_RESULT_REPLAY_CONFLICT` existentes —
atualizar a definição de cada um para "persisted identity/provenance
conflict only", preservando a proteção contra corruption/tampering.

## 33-34. Sem `resultVersion`, sem `latest`

Não inventar `resultVersion++` pra cada mudança da fonte — novo
snapshot é nova operação, não mutation do artifact antigo. Nunca
`getLatestResult(job)` pra replay — consulta é sempre pela identidade
exata (`jobId`, `attemptNumber`, input identity), preservando a regra
já forte "exact refs, never latest".

## 35. Skill 04 — replay ≠ reuse policy

Não confundir este replay com a `ReusePolicy` da própria Skill 04:
result replay = idempotência da execução; product reuse = regra
comercial sobre usar novamente um produto (S9 trata da segunda,
separadamente).

## 36. Skill 07/08 — correção semântica

Se direção/roteiro foi considerado ruim e precisa mudar: não substituir
artifact, não replay — usar correction semantics/nova operação
semântica do Ponto D.

## 37. Side effect não entra aqui

Skills 04-08 podem chamar sources/models, mas S14 não altera
`SUBMITTING`/`externalEffectState`/quota binding onde aplicável — essas
garantias continuam controladas pelos Pontos B/E e pelas Skills
executoras.

## 38-39. Hashes e FATAL novos

**0 hashes novos** — `RESULT_MATERIALIZATION_V1` é versão normativa
compartilhada, não artifact hash. **0 `FATAL_ERROR` novos** — os cinco
`*_RESULT_REPLAY_CONFLICT` existentes são reaproveitados com semântica
correta.

## 40. Lint barato

Skills 04-08 precisam referenciar `RESULT_MATERIALIZATION_V1`, mais uma
checagem textual simples contra as frases antigas conhecidas
("resultado logicamente incompatível", "reexecução que produziria",
"recalcula e compara") — sem tentar criar um parser semântico de
prosa.

## 41. Testes críticos (20)

```text
1. result ausente → producer executa.
2. result existente válido → producer não executa.
3. replay não faz nova chamada de API.
4. replay não faz nova chamada de modelo.
5. replay não atualiza observedAt.
6. mudança posterior da fonte externa não gera conflict.
7. output não determinístico posterior não gera conflict.
8. exact existing artifact é retornado.
9. same result identity + different tenant → conflict.
10. same identity + different Job → conflict.
11. same identity + different Attempt → conflict.
12. same identity + different input identity → conflict.
13. tentativa de mutar immutable result → conflict.
14. stale lease é rejeitada como stale fence, não replay conflict.
15. crash após persistência recupera artifact sem recalcular.
16. JobExecutionResult pode apontar para artifact recuperado.
17. technical retry sem resultado pode produzir output diferente legitimamente.
18. semantic correction cria nova operação/artifact.
19. result hashes com schemas diferentes não são comparados como replay.
20. Skills04–08 seguem a mesma regra.
```

## Critério de fechamento do S14

Marcar `CLOSED` quando: (1) este arquivo existe; (2)
`RESULT_MATERIALIZATION_V1` definido; (3) Skills 04-08 referenciam o
shared contract; (4) "existing → reuse without producer execution" está
explícito; (5) nenhum replay verifica incompatibilidade recalculando;
(6) mutable source changes não são conflicts; (7) nondeterministic
model changes não são conflicts; (8) os `*_RESULT_REPLAY_CONFLICT`
permanecem, mas significam persisted identity/provenance collision;
(9) stale lease continua sendo problema de Skill 02/fence; (10)
semantic corrections continuam usando Ponto D; (11) 0 hashes novos;
(12) 0 `FATAL_ERROR` novos; (13) lint `PASS`.

## Antes/depois

```text
ANTES
result existe → reutiliza
MAS "se reexecutar e der diferente" → FATAL
             ✗ contraditório

DEPOIS
result existe → reutiliza → NÃO reexecuta
result não existe → executa uma vez → materializa artifact imutável
replay detection é sobre identidade persistida, nunca sobre comparar
outputs recalculados
```
