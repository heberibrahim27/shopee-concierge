# Canonical Serialization — `CANONICAL_SERIALIZATION_V1`

> **S10 do reparo pós-revisão Fable** (2026-09-18, ChatGPT ↔ Claude Code).
> Achado do Claude Fable 5 Max: 255 hashes canônicos nas 25 Skills, todos
> descritos como "sobre JSON canônico" (8 menções), mas **nenhum arquivo
> define** ordenação de chaves, formatação de número, normalização
> Unicode, null-vs-ausente, ou ordenação padrão de array. "Este é o
> invariante mais repetido do documento inteiro e vive inteiro em
> prosa" — dois implementadores produziriam hashes diferentes pro mesmo
> objeto, e cada um dos ~100 checks `*_REPLAY_CONFLICT` do sistema
> viraria gerador de falso-positivo que dá `FATAL` numa Run.

**Autoridade**: `PROJECT-LEVEL SHARED CONTRACT` — `CANONICAL_SERIALIZATION_V1`.
Não pertence a nenhuma Skill (não é Skill 26, não é propriedade de
Skill 01/25). Aplica-se a **todo hash de objeto estruturado** das
Skills 01-25, inclusive os adicionados nos Pontos A-F do reparo
transversal. **Não se aplica** automaticamente a hash de bytes de
imagem/vídeo/arquivo — esse caso é separado (`RAW_BYTES_SHA256_V1`,
ver seção 25).

Esta spec resolve **COMO** os campos de um hash projection viram
bytes. Ela nunca decide **QUAIS** campos entram na projection — isso
continua responsabilidade de cada Skill dona do contrato.

## 1. Contratos compartilhados

```typescript
type CanonicalSerializationProfile =
  | 'CANONICAL_SERIALIZATION_V1';

type CanonicalHashAlgorithm =
  | 'SHA-256';

type CanonicalHashEncoding =
  | 'LOWERCASE_HEX';

type CanonicalJsonPrimitive =
  | null
  | boolean
  | number
  | string;

type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

type CanonicalHashEnvelope = {
  serialization: 'CANONICAL_SERIALIZATION_V1';
  hashSchema: string;
  payload: CanonicalJsonValue;
};

type CanonicalHashComputation = {
  serialization: 'CANONICAL_SERIALIZATION_V1';
  algorithm: 'SHA-256';
  encoding: 'LOWERCASE_HEX';
  hashSchema: string;
  digest: string;
};
```

Estes são contratos compartilhados de infraestrutura. **Nenhum hash
canônico próprio novo deve ser criado para esses tipos** — seria
circular inventar um hash da própria regra de hashing.

## 2. Algoritmo normativo

Todo hash estruturado passa a ser calculado assim:

1. O contrato dono escolhe exatamente os campos que pertencem ao hash
   projection.
2. Materializa um `CanonicalHashEnvelope`:
   ```json
   { "serialization": "CANONICAL_SERIALIZATION_V1", "hashSchema": "<HASH_SCHEMA_DO_ARTIFACT>", "payload": <HASH_PROJECTION> }
   ```
3. Serializa o envelope segundo RFC 8785 / JSON Canonicalization
   Scheme (JCS), com as restrições adicionais desta spec.
4. Codifica o JSON canônico em UTF-8.
5. `SHA-256` sobre esses bytes exatos.
6. Representa o digest como 64 caracteres hexadecimais lowercase.

Em fórmula:

```text
digest = lowercaseHex(SHA256(UTF8(JCS(CanonicalHashEnvelope))))
```

## 3. Domain separation obrigatória

**Nunca** fazer `SHA256(JCS(payload))` isoladamente. **Sempre** passar
pelo `CanonicalHashEnvelope` completo (com `hashSchema`), pra que dois
tipos com payload coincidentemente idêntico não compartilhem a mesma
preimage. Exemplo: `STAGE_ITERATION_V1` e `JOB_EXECUTION_RESULT_V1`
produzem hashes diferentes mesmo que seus projections fossem
acidentalmente iguais.

## 4. `hashSchema`

`hashSchema` é exatamente o identificador de hash canônico já existente
nos SPECs (ex.: `PRODUCTION_RUN_V1`, `STAGE_ITERATION_V1`,
`JOB_EXECUTION_RESULT_V1`, `VIDEO_AUDIT_RESULT_V1`, ...). **Não usar**:
nome do type inferido em runtime, nome de tabela, nome de classe JS,
`constructor.name`. A identidade vem da SPEC.

## 5. Ordenação de propriedades de objetos

Usar exatamente a ordenação definida pelo JCS. Portanto `{ b: 2, a: 1 }`
e `{ a: 1, b: 2 }` geram os mesmos bytes canônicos. Nenhum
implementador decide sua própria ordenação alfabética local, ordenação
de banco, ordem de inserção, ou `JSON.stringify` puro.

## 6. Whitespace

O JSON canônico não possui whitespace não necessário. `{ "a": 1 }` e
`{\n  "a": 1\n}` não são hasheados como strings originais — ambos
convergem ao mesmo JSON canônico.

## 7. `null` versus campo ausente

Regra explícita: **campo ausente ≠ campo presente com `null`**.
`{ a: 1 }` é semanticamente diferente de `{ a: 1, b: null }` e deve
produzir hash diferente. Isso é desejado.

## 8. `undefined`

`undefined` não existe em `CanonicalJsonValue`. `{ a: undefined }` não
pode ser silenciosamente convertido para `{}` pelo mecanismo de hash.
Regra: `undefined` encontrado em hash projection → `canonicalization
ERROR`. O owner deve escolher explicitamente: omitir o campo, ou
`campo: null`.

## 9. Arrays com `undefined` ou holes

Proibidos: `[1, undefined, 3]` e sparse arrays (`const x = []; x[2] =
3;`). Não converter silenciosamente pra `null`. Fail closed.

## 10. Ordenação de arrays

`["A", "B"]` é diferente de `["B", "A"]`. A serialização **nunca**
ordena arrays automaticamente. Isso é crítico porque em alguns
contratos a ordem possui significado: beats, pipeline stages,
transitions, ranking, timeline.

## 11. Arrays semanticamente set-like

Quando a ordem não possui significado, o contrato dono precisa definir
explicitamente a ordenação antes do hash (ex.: `evidenceRefs`:
canonical sort by `artifactId + artifactHash`). Não usar: ordem
retornada pelo `SELECT`, ordem do `Map`, ordem do provider. Se o SPEC
não disser que o array é set-like: **preserve order** é a regra.

## 12. Unicode

Decisão explícita pra V1: `CANONICAL_SERIALIZATION_V1` **não faz**
NFC/NFD/NFKC/NFKD. Strings Unicode são preservadas exatamente conforme
o valor do artifact — `"é"` precomposto e `"e" + combining acute
accent` podem produzir hashes diferentes. Isso é intencional. Se um
domínio precisar considerar ambos equivalentes, a normalização precisa
acontecer **antes**, no próprio domínio, e materializar esse texto já
normalizado — nada de transformação escondida no hashing.

## 13. (reservado — sem conteúdo normativo adicional além do acima)

## 14. Strings

Strings não são trimadas, não viram lowercase, não viram uppercase,
não têm espaços internos colapsados, não sofrem normalização Unicode.
Apenas o escaping JSON definido pelo JCS. `"ABC"` é diferente de
`"abc"`.

## 15. Números

Usar a semântica numérica de RFC 8785/JCS para JSON numbers. Além
disso: `NaN` proibido, `Infinity` proibido, `-Infinity` proibido,
`BigInt` proibido como JSON number. Valores precisam ser
representáveis sob a semântica numérica do JCS.

## 16. Inteiros de identidade/contagem

Para `attemptNumber`, `version`, `executionOrdinal`, `iterationNumber`,
`submissionSequence`: usar JSON integer dentro do safe integer range
quando modelado como `number`. Não transportar IDs inteiros enormes
como `number` — se exceder precisão segura, usar `string`.

## 17. Dinheiro, custo e decimais de negócio

Não converter arbitrariamente decimal string para number antes do
hash. Se o contrato diz `amount: string`, então `"1.50"` continua
string. O canonical serializer não decide que `"1.50" === "1.5"`.

## 18. Datas

Objetos `new Date(...)` não entram diretamente no projection — o
contrato deve fornecer string. Recomendação normativa para timestamps
novos: UTC RFC 3339 (ex. `2026-09-18T18:30:00.000Z`). O serializer não
reinterpreta strings antigas de data.

## 19. Objects JS especiais

Proibidos diretamente: `Date`, `Map`, `Set`, `Buffer`, `Uint8Array`,
class instance, `RegExp`, `BigInt`, `Function`, `Symbol`. Precisam
primeiro virar um `CanonicalJsonValue` explicitamente definido pelo
owner.

## 20. Duplicate object members

Raw JSON com `{"a":1,"a":2}` é inválido como input canônico. Não usar
comportamento "last key wins". Fail closed.

## 21. Cyclic objects

Qualquer ciclo (`A → B → A`) é inválido. Nada de custom serializer pra
ciclo.

## 22. Hash projection

A canonical serialization não decide quais campos entram no hash —
isso continua sendo responsabilidade do owner SPEC. Exemplo:
`StageIteration.stageIterationHash` nunca aparece dentro da própria
projection de `StageIteration` — seria autorreferencial.

## 23. Regra do próprio hash field

Todo campo que armazena o digest que está sendo calculado (`XHash`) é
excluído da própria projection, salvo se a SPEC explicitamente estiver
falando de um hash pai que referencia hashes filhos (ex.: `parent hash
→ hashes exact refs`, não recalcula todo o grafo).

## 24. Hash de referências

Quando um artifact contém `{ artifactId, artifactHash }`, ambos são
strings normais dentro do JSON canônico. Não "abre" o artifact
referenciado e não recalcula recursivamente seu conteúdo — o owner
contract já o definiu como parte da lineage.

## 25. Hash de bytes é OUTRO caso

Para bytes materializados (vídeo, imagem, PDF, binary artifact), **não
usamos JCS**. Regra compartilhada separada:

```text
RAW_BYTES_SHA256_V1
digest = lowercaseHex(SHA256(exactStoredBytes))
```

Sem base64/JSON/metadata/filename/MIME misturados, a menos que o owner
esteja calculando um hash estrutural separado.

## 26. Distinção obrigatória

Exemplo: `VideoArtifact.videoArtifactHash` → hash estrutural do
artifact → `CANONICAL_SERIALIZATION_V1`. `VideoArtifact.bytesHash` →
bytes exatos do vídeo → `RAW_BYTES_SHA256_V1`. Esses dois hashes têm
finalidades diferentes.

## 27. Não usar `JSON.stringify()` puro

Proibido como definição normativa: `sha256(JSON.stringify(object))` —
depende da materialização e não expressa as regras compartilhadas. Um
runtime futuro precisa de uma função central, conceitualmente
`canonicalHash(hashSchema, payload)`, não dezenas de implementações
locais.

## 28-29. Fail-closed em erro de canonicalização

Erros de parsing/materialização (duplicate member, unsupported value,
cycle, invalid UTF input) nunca têm fallback `JSON.stringify()` nem
"hash best effort". Resultado: `CANONICAL_SERIALIZATION_FAILED`.

## 30. Erros compartilhados

Como isso não pertence a uma Skill individual, 4 contract-level errors
(não `FATAL_ERROR` de Skill):

```text
CANONICAL_SERIALIZATION_FAILED
CANONICAL_VALUE_UNSUPPORTED
CANONICAL_HASH_SCHEMA_MISSING
CANONICAL_HASH_DIGEST_INVALID
```

Um consumer pode depois mapear isso para seu próprio `FATAL_ERROR`
quando necessário.

## 31. Formato do digest

Digest válido: `^[0-9a-f]{64}$`. Uppercase hex, base64, prefixo `0x`,
UUID não são representações válidas de canonical SHA-256 V1.

## 32. Replay conflict muda de significado

Depois deste patch, uma regra como "mesma chave lógica + hash diferente
→ `*_REPLAY_CONFLICT`" só é legítima quando ambos os hashes foram
produzidos pelo mesmo `hashSchema` + `CANONICAL_SERIALIZATION_V1`.
Comparar hashes de profiles/schemas diferentes é erro de contrato, não
replay conflict.

## 33. Não recalcular artifacts históricos com regra futura

Nunca: deploy de novo serializer → recalcula artifacts já verificados
com V1 → "descobre" replay conflicts.

## 34. Versionamento

Qualquer mudança em Unicode/number semantics/null-absent/array
ordering default/object ordering/string treatment/hash envelope/hash
algorithm/encoding exige `CANONICAL_SERIALIZATION_V2`. Nunca mudar V1
silenciosamente.

## 35. Patch global nas 25 Skills — sem editar centenas de definições

Não precisamos editar individualmente centenas de definições de hash.
Adicionar em cada `SPEC.md`, na seção geral de contratos/hashes:

> ### Regra compartilhada de serialização canônica
>
> Todos os hashes estruturados canônicos definidos neste SPEC usam
> `CANONICAL_SERIALIZATION_V1`, conforme
> `src/modules/video-machine/contracts/CANONICAL-SERIALIZATION.md`,
> salvo quando o contrato declara explicitamente um hash de bytes
> `RAW_BYTES_SHA256_V1`. O identificador canônico do hash deste
> artifact (ex.: `STAGE_ITERATION_V1`) é usado como `hashSchema` dentro
> do `CanonicalHashEnvelope`. Nenhuma implementação local de
> canonicalização pode substituir ou alterar essa regra.

Isso faz cada definição de hash herdar normativamente o profile sem
poluir 255+ blocos.

## 36. Patches em wording antigo

Nas 25 SPECs, onde aparecer "JSON canônico"/"canonical JSON"/
"canonicalJson"/"hash do JSON"/"JSON determinístico"/"stable JSON",
trocar por "serializado por `CANONICAL_SERIALIZATION_V1`" — sem
remover a descrição do projection em si (quais campos entram).

## 37. Escopo — o que S10 resolve e o que não resolve

S10 resolve **COMO** os campos viram bytes. Não resolve **QUAIS**
campos entram — isso continua sendo `stageIterationId`/`tenantId`/
`runKey`/... definidos por cada Skill dona, exatamente como já estava.

## 38. Vetor de teste obrigatório 1

Input lógico:

```typescript
{
  serialization: 'CANONICAL_SERIALIZATION_V1',
  hashSchema: 'EXAMPLE_V1',
  payload: { b: 'é', a: 1 }
}
```

JSON canônico esperado:

```json
{"hashSchema":"EXAMPLE_V1","payload":{"a":1,"b":"é"},"serialization":"CANONICAL_SERIALIZATION_V1"}
```

SHA-256 lowercase esperado:

```text
ad9af77f2d806ecd0b2e0b0d6cc7a23d3a51f9c109eb91921e61343aca7cb7db
```

Esse vetor é útil pra comparar Node/TS com qualquer implementação
futura em outra linguagem.

## 39. Vetor absent versus null

Payload `{ a: 1 }` produz digest
`067df9077acdd0c6166f2c75dd4b582c6028a9126aaafc47a007fa6d4e169c08`.
Payload `{ a: 1, b: null }` produz digest
`ca41de58061d516249e4d864f5a8620f92780c8e29ff3c87cc29c56f10a4882a`.
Devem permanecer diferentes.

> **Vetores verificados**: os 3 digests desta seção e da anterior
> (vetor `EXAMPLE_V1`, `absent`, `null`) foram recalculados de forma
> independente em 2026-09-18 com uma implementação canônica mínima
> (chaves de objeto ordenadas, sem whitespace, escaping JSON padrão,
> `SHA-256` sobre UTF-8) e batem exatamente, caractere a caractere, com
> os valores fornecidos pelo ChatGPT — 64 caracteres hex cada,
> conforme `^[0-9a-f]{64}$` (seção 31). Servem como vetor de regressão
> real pra qualquer implementação futura do `canonicalHash()`.

## 40. Testes críticos (24)

```text
1. ordem diferente de object keys → mesmo hash
2. whitespace diferente → mesmo hash
3. absent vs null → hashes diferentes
4. undefined object field → reject
5. undefined array member → reject
6. sparse array → reject
7. array order A,B vs B,A → diferente
8. object nested ordering → estável
9. Unicode precomposed/decomposed → diferente
10. CRLF/LF string → diferente
11. NaN → reject
12. Infinity → reject
13. BigInt → reject
14. (bytes usa exact bytes, não JCS — RAW_BYTES_SHA256_V1)
15-21. (regras 15-21 acima: números, datas, objects especiais,
    duplicate members, ciclos, hash projection, hash field próprio)
22. own digest field não participa da própria projection
23. mesmo input em execuções distintas → mesmo digest
24. vetor EXAMPLE_V1 reproduz digest conhecido
```

## 41. O que não devemos fazer

Não criar `Skill01CanonicalHash`, `Skill02CanonicalHash`,
`Skill23CanonicalHash` — cada Skill escolhendo seu próprio serializer.
Não permitir `JSON.stringify`, `fast-json-stable-stringify`, custom
sort como autoridades independentes. Uma única definição.

## 42. Relação com o Contract Lint (Ponto G)

Não precisa expandir `G002-G090` agora. Mas a V1 real do
`scripts/contract-lint.mjs` pode ganhar uma checagem barata depois:
cada um dos 25 SPECs contém referência normativa a
`CANONICAL_SERIALIZATION_V1` — não precisa parsear todos os hash
projections pra isso. Extensão pequena e útil da ferramenta real que já
existe (ainda não implementada nesta rodada — ver nota de escopo em
`CONTRACT-LINT.md`).

## 43. Critério de fechamento do S10

S10 só pode ser marcado `CLOSED` quando: (1) este arquivo existe; (2)
`CANONICAL_SERIALIZATION_V1` está definido uma única vez; (3) SHA-256 +
lowercase hex estão normativos; (4) `CanonicalHashEnvelope` está
definido; (5) `hashSchema` participa da preimage; (6) JCS/RFC 8785 é a
base normativa; (7) null vs absent está definido; (8) undefined é
rejeitado; (9) normalização Unicode está explicitamente definida como
NONE; (10) arrays preservam ordem por default; (11) unordered arrays
exigem regra explícita do owner; (12) numbers têm regra determinística;
(13) hash de bytes está separado; (14) os 25 SPECs referenciam o shared
profile; (15) nenhum SPEC declara serializer local concorrente; (16)
test vectors passam.

## Resultado arquitetural

O que antes era "mesma chave lógica de Job + hash diferente → `FATAL`"
sem sabermos se os dois lados produziram o mesmo byte stream, passa a
ser um pipeline determinístico:

```text
semantic hash projection
  → CanonicalHashEnvelope
  → CANONICAL_SERIALIZATION_V1
  → RFC 8785/JCS
  → UTF-8
  → SHA-256
  → lowercase hex
```

Assim os `*_REPLAY_CONFLICT` finalmente passam a ter fundamento
determinístico cross-implementation — não adiciona novo hash de
domínio nas Skills, só formaliza normativamente o mecanismo que os 255
hashes existentes já citavam informalmente.
