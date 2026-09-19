# `VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1` — escopo de implementação V1

> Ponto M5 do reparo transversal pós-revisão Fable (2026-09-18, quinto
> dos 8 achados MINOR). Não é um artifact hash — é uma **versão
> normativa compartilhada** (mesmo padrão de
> `CANONICAL_SERIALIZATION_V1`/S10, `VIDEO_COMPOSITION_V1`/S6,
> `EXECUTION_RUNTIME_V1`/S7, `CONTRACT_CONVENTIONS_V1`/M1-M4). Define
> o que **não** vamos implementar na primeira versão do runtime.

## Achado real do Fable

O problema não é que Skills 06/20/21 estejam tecnicamente erradas — é
que o corpus carrega contratos enormes (pesquisa de tendências
completa, framework de experimentação/variações, sistema formal de
relatórios) para capacidades que ainda não precisam existir no primeiro
runtime. Especificar não é o mesmo que implementar, e a spec não
deixava isso explícito.

## A regra fundamental

```text
Um contrato especificado não está automaticamente
habilitado para implementação V1.

SPECIFIED, RUNTIME_REQUIRED_V1 e RUNTIME_IMPLEMENTED
são estados diferentes.
```

## Decisão

```text
Skill06 (pesquisa de tendências) → DEFERRED_V2_CONTRACT
Skill20 (gerador de variações)   → DEFERRED_V2_CONTRACT
Skill21 (relatórios)             → DEFERRED_V2_CONTRACT

Skill25 (segurança/auditoria)    → continua V1_REQUIRED,
  mas o custom rate-limit ledger (SecurityRateLimitPolicy/
  SecurityRateLimitWindowState/SecurityRateLimitDecision)
  é DEFERRED_V2_MECHANISM — o requisito de proteção
  contra abuso continua, só o mecanismo sofisticado sai
  do caminho crítico V1.
```

Nenhuma das quatro specs é apagada. Nenhuma é reescrita. O trabalho já
feito é congelado como desenho futuro, e essas capacidades saem do
escopo de implementação e do acceptance gate do runtime V1.

## O que `DEFERRED_V2_CONTRACT` significa

Um contrato com esse status:

- continua especificado;
- continua revisável pelo Fable/Astra;
- continua tendo ownership definido;
- continua podendo conter hashes/FATAL_ERROR para seu futuro domínio.

Mas:

- não exige runtime V1;
- não exige migration V1;
- não exige handler V1;
- não exige Job/Attempt V1;
- não exige provider adapter V1;
- não entra no acceptance gate V1;
- **não pode ser dependência obrigatória de uma Skill V1** (regra mais
  importante deste documento).

Nenhum contrato V1 pode dizer `"X requires Skill06Result"`, nem
`"publication requires Skill20 experiment decision"`, nem
`"ProductionRun completion requires Skill21 report"`.

## Não é `DEPRECATED`/`LEGACY`

O termo certo é `DEFERRED_V2_CONTRACT` — o oposto de deprecated:
pretendemos usar esses contratos no futuro, só não agora. Os ~24 hashes
da Skill20 e os muitos hashes da Skill21 continuam na spec, mas ganham
a nota: `These schemas are specification material for a deferred
capability. They are NOT part of the V1 runtime implementation
surface.` `canonical schema exists` não implica `implement it now`
(Ponto M4 já protege essa distinção).

## Skill06 — pesquisa de tendências

O V1 efetivo da Skill06 termina em `NO_SOURCES_AVAILABLE` — não faz
sentido implementar adapters/evidence handling/fontes/ranking pra
produzir um no-op. **Não implementamos um handler que só retorna
`NO_SOURCES_AVAILABLE`** — isso ainda seria Job/Attempt/observabilidade/
manutenção inúteis. O V1 opera:

```text
Skill05 → Skill07
```

sem execução intermediária de Skill06. Se `Skill07` tiver campos como
`applicableTrendEvidence`, ficam vazios/ausentes segundo a semântica
real já definida (Ponto M1/M2) — nunca fabricamos uma
`TrendResearchResult`/`TrendEvidence` artificial só pra satisfazer um
pipeline que nem deveria chamar a Skill06. O contrato
`NO_SOURCES_AVAILABLE` continua guardado na Skill06 pra quando ela for
ativada futuramente.

**Achado real de dependência (confirmado via investigação de corpus
antes de aplicar)**: `07-direcao-criativa/SPEC.md`
`CreativeDirectionInput.trendResearchResultId` era um campo
**obrigatório**, com `CREATIVE_TREND_RESULT_NOT_FOUND` como
`FATAL_ERROR` — como nenhum `TrendResearchResult` jamais existiria com
Skill06 deferida, isso bloquearia **100% dos `ProductionRun`s**. Campo
alterado para opcional; ausência tratada com a mesma semântica de
`NO_SOURCES_AVAILABLE` já existente (EVERGREEN se a policy permitir,
`NO_APPLICABLE_DIRECTION` se não — nunca erro). Ver detalhe completo no
próprio `07-direcao-criativa/SPEC.md`. Nenhuma outra Skill do corpus
tinha dependência direta equivalente sobre Skill06 (Skill08 herda o
bloqueio só transitivamente via Skill07 — resolvido pela mesma
correção).

## Skill20 — experimentos e variações

Skill20 tem superfície enorme antes de sequer termos publicação real
estabilizada. No V1 não haverá runtime para: experiment planning,
automatic variants, variant promotion, automatic comparative
evaluation, experiment metrics orchestration. A produção V1 trabalha
com:

```text
1 caminho criativo escolhido → 1 candidato por fluxo normal
```

**Isso não desfaz o Ponto S5.** O kernel continua entendendo
`StageWorkUnitAxis.CREATIVE_VARIANT`, e `StageWorkUnitIdentity`
continua capaz de representar variantes — a diferença é `kernel
capability ≠ V1 product capability enabled`. O perfil V1 declara:
`No V1 pipeline adapter may emit CREATIVE_VARIANT work units derived
from Skill20.` O eixo continua existindo pra não refazer o kernel no
futuro.

**Achado real de corpus**: nenhuma das Skills 11/12/14/17 **nem 07**
(PATCH R5, kernel repair pós re-review GPT-6 Astra, 2026-09-19 — a
auditoria original do M5 tinha pulado a Skill07, mesmo sendo a conexão
mais óbvia com a Skill20: "Skill20 diz o que variar, Skill07 é dona da
`CreativeDirectionResult`") tem qualquer campo/dependência sobre
`experimentVariant*`/`VariationDirective`/output da Skill20 — a única
plumbing existente (`experimentVariantIdentityHash` em Skill01,
`01-orquestrador-de-producao/SPEC.md`) já é condicional/opcional,
owned pela Skill01, e só entra quando uma variante está sendo
produzida dentro de um `ProductionRun` — nada a corrigir. Essa
plumbing sozinha **não torna a Skill20 dependência V1**: no V1 deve
permanecer ausente e não pode provocar branching, fan-out ou chamada à
Skill20.

**Contrato V1/V2 explícito Skill20↔Skill07 (R5)**:

```text
V1:
- Skill20 = DEFERRED_V2_CONTRACT.
- Skill20 não é invocada pelo pipeline V1.
- Skill07 não recebe VariationDirective.
- CreativeDirectionInput V1 não possui dependency/ref/hash de VariationDirective.
- Nenhuma decisão, work unit ou StageExecution V1 depende de Skill20.
- Nenhum pipeline adapter V1 pode emitir CREATIVE_VARIANT derivado de Skill20.

V2:
- VariationDirective será consumida através do pipeline normal:
    Skill20
      → VariationDirective / VariantExecutionIntent
      → Skill01
      → ProductionRun da variante
      → Skill07
- Esse ponto de extensão está especificado conceitualmente, mas NÃO ATIVO no V1.
```

Deliberadamente **não** adicionamos `variationDirectiveId?`/
`variationDirectiveHash?` (nem opcionais) a `CreativeDirectionInput`
agora — isso criaria exatamente o "campo fantasma" que hoje felizmente
não existe. O contrato de entrada V2 só deve ser materializado quando
a Skill20 for ativada operacionalmente e a lineage completa puder ser
definida.

**R5 → CLOSED como `DEFERRED_V2_CONTRACT`** — "CLOSED" aqui significa
que o achado está corretamente resolvido por escopo (dívida V2
legítima, sem contrato quebrado escondido), não que a integração
Skill20→Skill07 tenha sido implementada.

## Skill21 — relatórios

Os ~30 hashes especificados continuam documentados, mas não entram no
gate de implementação do MVP. No V1, observabilidade/admin pode
consultar os artifacts/ledgers já existentes diretamente via telas e
queries necessárias — não precisamos de um subsistema formal completo
de relatórios agora. Isso não significa SQL espalhado sem contrato: só
significa que "gerar relatório formal Skill21" não é requisito para a
Máquina produzir, auditar e publicar seu primeiro vídeo. **Nenhuma
Skill core pode depender de output da Skill21 para avançar um
`ProductionRun`.** Skill21 é terminal/analítica, não pipeline
authority.

**Achado real de corpus**: nenhuma Skill do corpus trata o report da
Skill21 como dependência — confirmado por grep completo; as
referências existentes são só notas de ownership/roadmap (ex.: Skill18
listando Skill21 como dona de "apresentação/relatórios"), nunca
dependência funcional real. Nada a corrigir além da declaração formal
de status.

## Skill25 — segurança nunca vira V2

Skill25 inteira **não** vira `DEFERRED_V2_CONTRACT`. Temos controles de
segurança necessários no V1. A separação correta:

```text
SECURITY REQUIREMENT ≠ PARTICULAR IMPLEMENTATION MECHANISM
```

Skill25 permanece `V1_REQUIRED` para autenticação de ingress, tenant
isolation, credential handling, data-handling rules e demais boundaries
necessários. Mas o **custom durable rate-limit ledger** apontado pelo
Fable como excessivo
(`SecurityRateLimitPolicy`/`SecurityRateLimitWindowState`/
`SecurityRateLimitDecision`, 2 dos 20 `FATAL_ERROR` da Skill25) fica
`DEFERRED_V2_MECHANISM`. No V1, a spec exige o comportamento (`public
ingress must be subject to bounded abuse/rate controls before
production exposure`), mas não obriga desde já a criação do ledger
completo se um mecanismo mais simples de infraestrutura resolve o
controle inicial. Não confundir com "sem rate limit" — o requisito
fica, só o ledger sofisticado sai do caminho crítico.

**Achado real de corpus**: nenhuma outra Skill referencia os tipos
`SecurityRateLimitPolicy`/`SecurityRateLimitWindowState`/
`SecurityRateLimitDecision` por nome — os hits de "rate limit" nas
Skills 07/08/15/16/17/18/23/24 são todos conceitos de rate-limit de
**provider externo** de cada Skill (`PUBLICATION_PROVIDER_RATE_LIMITED`
etc.), não o ledger de segurança da Skill25. Relaxar o requisito de
runtime desse ledger específico não quebra o contrato documentado de
nenhuma outra Skill.

## Sem campo novo persistido

Não adicionamos `implementationScope: 'V1' | 'V2'` em
`ProductionPipelineSnapshot` nem em nenhum stage — isso transformaria
uma decisão de produto em mais estado persistido. Este documento define
quais adapters/stages podem existir no pipeline V1; quando o runtime
for implementado, a construção/validação do pipeline respeita esse
perfil sem campo redundante agora.

## Acceptance gate

```text
A V1 implementation MAY be considered complete
without runtime implementations of Skills 06, 20 and 21.

Their absence MUST NOT cause a V1 acceptance failure.

A V1 implementation MUST NOT claim
Skills 06/20/21 as runtime implemented
merely because their SPECs exist.
```

## Hashes, artifacts e erros

**0 artifacts novos. 0 canonical hashes novos. 0 `FATAL_ERROR` novos.
0 runtime code.** A única coisa nova é este documento normativo +
patches de classificação/prosa (e a correção pontual de
`trendResearchResultId` na Skill07, que também não cria FATAL_ERROR
novo — só torna condicionais os já existentes).

## Lint (`G_M5_*`)

Checagens direcionadas, nada sofisticado — deliberadamente **não**
construímos um grafo automático de dependências entre as 25 Skills
(isso seria o próprio over-engineering que este ponto elimina):

1. Skills 06/20/21 devem conter o marker normativo `DEFERRED_V2_CONTRACT`.
2. `IMPLEMENTATION-SCOPE.md` deve existir e referenciar as três Skills.
3. Skill25 deve conter `V1_REQUIRED` (nunca virar `DEFERRED_V2_CONTRACT`
   inteira).

Teste empírico: remover o marker `DEFERRED_V2_CONTRACT` de uma das
Skills 06/20/21 → `FAIL`; reverter. Marcar Skill25 como
`DEFERRED_V2_CONTRACT` → `FAIL`; reverter.

## Critério de fechamento M5

M5 fica **CLOSED** quando: Skills 06/20/21 estão inequivocamente fora
do runtime V1; nenhuma delas é necessária para completar um
`ProductionRun` V1; Skill07 funciona sem Skill06; `CREATIVE_VARIANT` do
S5 permanece suportado pelo kernel mas não ativado por Skill20 no V1;
Skill21 é terminal/deferred; Skill25 continua obrigatória, mas o custom
rate-limit ledger não faz parte do caminho crítico V1; as specs
deferred não contam como implementação; nenhum contrato core V1
depende obrigatoriamente delas; lint protege os markers; e
`contract-lint.mjs` termina PASS.

M5 fechado conceitualmente. Próximo: M6.
