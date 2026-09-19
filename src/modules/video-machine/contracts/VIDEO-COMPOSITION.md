# `VIDEO_COMPOSITION_V1` — contrato compartilhado de composição de vídeo

> Ponto S6 do reparo transversal pós-revisão Fable (2026-09-18). Não é
> um artifact hash — é uma **versão normativa compartilhada** (mesmo
> padrão de `CANONICAL_SERIALIZATION_V1`/S10, `AUDIT_EVENT_V1`/S11,
> `RESULT_MATERIALIZATION_V1`/S14), referenciada pelas Skills 08, 10,
> 11, 12, 13, 14, 17 e 20. Nenhuma dessas Skills redefine esta regra —
> só referenciam.

## Achado real do Fable

O achado original dizia, em essência: `Skill08 → N beats`, `Skill10 →
N prompts`, `Skill11 → N clips`, `Skill12 → audita "o vídeo"`,
`Skill14 → finaliza "um vídeo"`, `Skill17 → publica "um vídeo"` —
**ninguém transforma N em 1**. Nenhuma etapa do pipeline real tinha um
contrato de composição/assembly explícito para reconciliar múltiplos
beats/clips num único vídeo final.

## Decisão V1: `SINGLE_BEAT`, sem stage de assembly

Duas alternativas foram avaliadas: (a) adicionar um stage
`VIDEO_ASSEMBLY` real (com `VideoAssemblyPlan`/`AssembledVideoArtifact`/
`ClipTimeline`/`TransitionPlan`/`AssemblyManifest`); (b) restringir o
V1 pra não precisar de assembly nenhum. **Escolhido (b)** — adicionar
um stage de assembly agora arriscaria reabrir Skills 11/12/13/14, o
Ponto S4 (approval) e o Ponto S5 (fan-out) simultaneamente, e o S7
(worker runtime) já vai ser grande o suficiente sem FFmpeg assembly
adicional. Além disso, concatenação simples (`ffmpeg concat`) não
resolve edição audiovisual real — decidir ordem, trim, overlap,
transição, áudio, continuidade, duração, frame rate, resolução,
aspect ratio, color space, timing de legenda/narração e sincronização
de música é trabalho real que um stage "assembly" sem esses contratos
apenas esconderia.

```text
VIDEO_COMPOSITION_V1

Every production-bound ScriptResult MUST contain
exactly one ScriptBeat.

That ScriptBeat represents the complete semantic video
generation unit.

The VideoArtifact generated from that beat is a complete
video candidate, not a segment awaiting assembly.

Multi-beat composition and clip assembly are unsupported
in V1.
```

## Topologia V1

```text
Skill08 ScriptResult
  └── exatamente 1 ScriptBeat
         ↓
Skill10 — 1 VideoPromptArtifact (por creative-variant candidate)
         ↓
Skill11 — 1 VideoArtifact completo
         ↓
Skill12 — audita o vídeo completo contra o único beat
         ↓
Skill13 — correção, se necessária (continua single-beat)
         ↓
Skill14 — 1 FinalizedVideoRendition (1 source VideoArtifact)
         ↓
Skill17 — publicação (1 asset principal por PublicationIntent)
```

**Nunca existe no V1**: `beat1 → clip1`, `beat2 → clip2`, `beat3 →
clip3` → `concat`. Esse pipeline só poderá existir quando houver um
contrato próprio de assembly (V2 — ver "Evolução futura" abaixo).

## `ScriptBeat` não significa obrigatoriamente "uma cena"

Importante para não empobrecer o vídeo: `1 beat ≠ necessariamente 1
enquadramento estático`. O beat pode descrever um vídeo curto completo
com abertura, ação do produto, mudança de enquadramento, close, CTA
visual, movimentos internos — desde que o provider consiga produzir
isso numa única geração de vídeo. A unidade é **1 generation
artifact**, não necessariamente **1 camera shot**. Provider gerando
múltiplos shots internamente numa única solicitação continua sendo
`single-beat/single-generation` — perfeitamente permitido.

## Regras por Skill

**Skill 08** — `ScriptResult.beats: ScriptBeat[]` continua array (não
vira `beat: ScriptBeat` singular — destruiria o desenho futuro
multi-beat). Restrição normativa: `beats.length === 1` pra qualquer
resultado elegível ao pipeline produtivo atual, e o único beat usa
`beatIndex === 0` (`ScriptBeat.beatIndex` real, 0-based, já usado nas
Skills 08/09/10/12). Nunca aceitar `beats = [{ beatIndex: 7 }]` só
porque o array tem tamanho 1.
Skill 08 pode continuar usando seu mecanismo interno de validação/
reparo antes de materializar (se o modelo interno retornar 3 beats,
pode tentar corrigir antes de aceitar o domain result) — a regra é que
**um `ScriptResult` válido materializado nunca possui >1 beat**. Não
usar retry técnico como criatividade: depois que um `ScriptResult`
inválido foi rejeitado por contrato, não criar Attempts indefinidamente
porque o modelo insiste em múltiplos beats (Ponto B/S12 continua
controlando isso). Skill 08 também garante coerência entre quantidade
de fala/ação e duração prevista, segundo critérios já existentes — S6
não adiciona novo motor de cálculo.

**Skill 10** — onde a spec hoje disser algo equivalente a "one prompt
per beat", mantém tecnicamente verdadeiro, mas formaliza: exatamente
um beat → exatamente um `VideoPromptArtifact` por creative-variant
candidate. O prompt declara intenção de **vídeo completo** — nunca
"segment prompt"/"clip fragment"/"scene to concatenate later". Nenhum
campo `isFinalClip` necessário — todo `VideoArtifact` da cadeia V1 é
candidato completo por contrato. Antes de executar: `requested
duration <= capability da combinação provider/model/profile`; se não
couber, resultado é capability unsupported — **nunca divide
automaticamente** ("Veo só aceita 8s; vou gerar 2×8s e concatenar" é
proibido). Pode rotear pra provider alternativo se policy/capability
permitir — continua single-beat.

**Skill 11** — redefinição normativa: `VideoArtifact` em
`VIDEO_COMPOSITION_V1` representa um **vídeo candidato completo e
semanticamente autônomo**. Nunca "clip correspondente a um beat que
posteriormente será concatenado" — essa frase, se existir na spec
real, precisa sair. Sem `VideoClipSet`/`BeatClipCollection`/
`GeneratedSegments` no V1. Para cada work unit (creative variant +
beat #1): 1 `VideoGenerationExecution` → 1 `VideoArtifact`, com
retries técnicos conforme Skill 02. Nunca esconder assembly no
provider adapter — proibido "adapter chama modelo 3 vezes, concatena
internamente, retorna 1 `VideoArtifact`" sem o pipeline saber (isso
burlaria o contrato).

**Skill 12** — audita `VideoArtifact` contra o único `ScriptBeat` do
exact `ScriptResult` — nunca "the video against all beats" (pode dizer
"all applicable script requirements", mas no V1 existe exatamente um
beat). Antes do audit, valida composição:
`ScriptResult.beats.length === 1` e `beatIndex === 0`; se receber
multi-beat → contract violation/unsupported V1 composition, **nunca
tenta auditar parcialmente**. Continua podendo auditar múltiplos
critérios normalmente (produto/texto/CTA/visual reference/motion/
duration/branding/safety/fidelity) — single beat não significa
auditoria simples.

**Ponto S4 permanece fechado sem mudança** — `VIDEO_COMPLIANCE`
continua apontando pra exact `VideoArtifact`, sem necessidade de criar
`AssembledVideoArtifact`. Esse é um ganho direto da escolha V1.

**Skill 13** — correção ocorre sobre um vídeo completo de um único
beat; pode alterar script/prompt/frame/generation settings segundo o
correction scope já existente. Se a solução proposta pra um problema
for "dividir em duas cenas geradas separadamente", isso é **fora de
`VIDEO_COMPOSITION_V1`** — nunca convertido silenciosamente numa nova
iteration multi-beat. Dentro da mesma `ProductionRun` V1, o modo de
composição `SINGLE_BEAT` permanece congelado — nunca `Iteration 1 = 1
beat, Iteration 2 = 3 beats`.

**Skill 14** — continua responsável por transcode/normalização/
container-codec/resize-crop/overlay já contratado/legenda/final
rendition, conforme sua spec atual. A frase existente indicando que
concatenação é semanticamente sensível **permanece**, mas vira
proibição V1 explícita: `Concatenation of independently generated
video segments is outside VIDEO_COMPOSITION_V1 and MUST NOT be
performed by Finalization.` Para cada `FinalizedVideoRendition`, deve
existir exatamente **1 source `VideoArtifact`** como fonte audiovisual
primária. Combinar esse único vídeo com audio track/captions/logo
overlay/metadata é **muxing**, não assembly — continua permitido
(`vídeo + áudio → mux` é diferente de `clip1 + clip2 + clip3 →
timeline`).

**Skill 17** — uma `PublicationIntent` continua referenciando 1
`FinalizedVideoRendition` como asset principal — nada de array de
clips pro provider montar. O fan-out de publication target (Ponto S5 —
Instagram/TikTok/Pinterest) continua separado: é **distribuição**, não
composição.

**Skill 20** — cada experiment variant é um candidato audiovisual
completo, nunca um fragmento pra composição posterior. Exemplo:
`variant A + beat 1`, `variant B + beat 1`, `variant C + beat 1` podem
gerar 3 vídeos candidatos completos — isso **não é multi-beat**, é 3
variantes diferentes × 1 beat completo cada. Proibido formar um vídeo
combinando variantes (`variant A clip + variant B clip → final video`)
— variantes são alternativas, não segmentos. Isso é especialmente
importante pra Skill 20 poder experimentar múltiplos hooks (A/B/C) sem
precisar de assembly.

**Ponto S9 (`ProductUsageEvidence`)** — `MATERIALIZED` continua
correto sem mudança: um `VideoArtifact` da Skill 11 já é um vídeo
candidato completo, então a semântica do writer fica ainda mais clara.

## Relação com o Ponto S5 (`StageWorkUnitIdentity`)

**Não é um passo atrás no S5.** A distinção mais importante:
`StageWorkUnitAxis.BEAT` continua sendo identidade **estrutural** do
kernel; `VIDEO_COMPOSITION_V1` só restringe a **cardinalidade
permitida** pra 1 nesta versão. Skill 10 continua podendo representar
`beat: { scriptResultRef: exactScriptResult, beatIndex: 0 }` — o V1
só permitir um beat não torna o eixo `BEAT` inútil: preserva lineage
explícita e deixa o kernel preparado pra uma versão futura.
`StageExpansionManifest` com um único work unit continua válido (S5 já
permite manifest com 1 work unit — nenhuma exceção necessária). No
stage de prompt/generation: se só existe `beat1`, o barrier (Ponto S5)
fecha após aquela única unidade; se há creative variants
(`variantA+beat1`, `variantB+beat1`), o barrier continua dependendo de
todas as variants planejadas, normalmente. Isso não implica publicar
todas as variantes — seleção/promote logic pertence à Skill 20/
pipeline existente, fora do escopo do S6.

**Regra explícita de pipeline**: `VIDEO_COMPOSITION_V1` pipelines
**MUST NOT** declarar um stage `VIDEO_ASSEMBLY` — evita que alguém
"preencha o buraco" depois sem contrato formal.

## O que NÃO fazer

Não criar `VIDEO_ASSEMBLY`/`VideoAssemblyPlan`/`VideoAssemblyInput`/
`AssembledVideoArtifact`/`ClipTimeline`/`TransitionPlan`/
`AssemblyManifest` nesta fase. Não dividir automaticamente um roteiro
que não cabe numa única geração. Não esconder assembly dentro de um
provider adapter. Não persistir `compositionMode: 'SINGLE_BEAT'` em
todo artifact (ruído puro — o modo já é invariável desta versão do
contrato; quando existir V2, o próprio contrato/versionamento
diferencia). Exceção: se `ProductionPipelineSnapshot` já carrega
versões de contratos/capabilities, pode registrar
`videoCompositionContractVersion = VIDEO_COMPOSITION_V1`.

## Erros

Grep prévio nas Skills 08/10/11/12/13/14/17/20 antes de criar
qualquer código novo — reutilizar equivalentes de
`input contract mismatch`/`lineage mismatch`/`script mismatch` já
existentes em cada Skill consumidora sempre que possível (nunca
repetir o mesmo código em cinco Skills). Se a Skill 08 (owner do
`ScriptResult`) não tiver nenhum código estrutural equivalente a
"script fora do contrato de composição V1", criar exatamente **um**
`FATAL_ERROR` novo lá — nome seguindo a taxonomia real já usada na
Skill 08. `JobFailureCategory=CONTRACT`, `retryAdvice=NON_RETRYABLE`
(Ponto S12/B) pra esse caso.

## Hashes e artifacts

**0 artifacts novos. 0 canonical hashes novos.** `VIDEO_COMPOSITION_V1`
é versão normativa compartilhada (como este próprio documento), nunca
entra na contagem de hashes canônicos.

## Evolução futura (V2, fora de escopo do S6)

Quando multi-beat for necessário de verdade, não será só "tirar
`maxItems:1`". Vai precisar de um contrato próprio cobrindo pelo menos:
ordered segments, timeline, duration, trim, transition, audio
continuity, caption timeline, resolution/aspect compatibility,
failure/retry, partial regeneration, assembly artifact, audit subject,
correction lineage. O Ponto S5 já prepara metade disso — quando o V2
chegar, o eixo `BEAT`/`StageExpansionManifest`/fan-out/barrier já
estarão prontos; o que vai faltar é fan-in/composição, não refazer
identidade. Isso justifica ter mantido o eixo `BEAT` no S5.
