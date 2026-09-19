# Skill 23 — Gestor de Créditos/Quotas

> **APROVADA EM ESPECIFICAÇÃO — 23/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 2 rodadas com ChatGPT (decisões
> fundacionais + contratos centrais → patches compatíveis + state
> machine de settlement/reservation + erros + observabilidade + testes),
> com auditoria real do repositório prévia (mesmo método das Skills
> 04-22). **Skill de infraestrutura (22-25) — versão mínima por design**,
> mas **mais carregada de compromissos reais que a Skill 22**: 6 Skills
> já aprovadas (07, 11, 12, 14, 15, 20) fizeram promessas de campo/
> sequência/semântica específicas apontando pra esta Skill — não é
> greenfield conceitual como a Skill 22 foi. ChatGPT decidiu
> explicitamente 2 rodadas (não 1 como a Skill 22, não 3 como Skills
> 18-21) porque a Skill 23 está no caminho crítico de side effects
> pagos reais (Skill 11/Veo) mesmo sendo greenfield em implementação.
> Auto-verificação confirmou as 4 condições do ChatGPT antes do
> carimbo: 0 tipos TypeScript duplicados, 20 `FATAL_ERROR`, 16 hashes
> canônicos, 40 testes críticos.

## Garantia central (rascunho inicial)

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


A Skill 23 é a autoridade formal que decide, para cada operação
potencialmente paga do pipeline, **se existe autorização de gasto
válida** — nunca calcula o gasto em si, nunca executa a chamada paga
(isso continua com a Skill que possui o side effect, ex. Skill 11),
nunca decide o que fazer com o resultado. Ela responde exatamente:
há quota? há crédito? o tenant pode gastar? há teto diário/mensal? — e
produz uma decisão durável e referenciável (`AUTHORIZED`/`DENIED`/
`EXPIRED`) que as Skills consumidoras armazenam como referência opaca,
nunca reinterpretam.

## Auditoria real do repositório (2026-09-18)

- **6 Skills já aprovadas fizeram compromissos de campo/sequência
  vinculantes com a Skill 23** (não pode reabrir):
  - **Skill 11** (`skills/11-executor-de-geracao/SPEC.md`, âncora
    principal): "Skill23 → decide se há quota/crédito/autorização
    para gastar" (linha 69); seção `## Fronteira Skill 11 × Skill 23`
    (linhas 976-1053) — sequência obrigatória: `Skill02 cria/autoriza
    Attempt → Skill11 prepara payload → requestPayloadHash →
    QuotaGuard/Skill23 → autorização durável → ProviderSubmission
    persistida → SUBMITTING → rede`. Campo já comprometido:
    `ProviderSubmission.spendAuthorizationRef?: string` (opaco).
    Invariante: "todo submit potencialmente pago deve estar ligado a
    uma autorização durável de gasto válida para aquela Attempt e
    payload lógico." Autorização precisa ser validável contra no
    mínimo `tenantId, jobId, attemptNumber, providerKey, modelKey,
    videoPromptArtifactId, videoPromptArtifactHash, requestPayloadHash`
    — nunca genérico "tenant tem R$50". **Retransmissão idempotente
    não consome nova autorização** (mesmo `providerRequestKey`/
    `requestPayloadHash` → mesma autorização). **Nova Attempt exige
    nova autorização**. "Provider não informou custo" ≠ "custo zero"
    → custo desconhecido, "Skill 23/21 reconciliam depois";
    `ProviderBillingEvidence` explicitamente adiado pra Skill 23.
    Cancelamento ≠ reembolso presumido — Skill 23 é dona da
    reconciliação financeira.
  - **Skill 20** (`skills/20-gerador-de-variacoes/SPEC.md`): tipo já
    comprometido —
    ```typescript
    type Skill23QuotaAuthorizationRef = {
      authority: 'SKILL23';
      authorizationId: string; authorizationHash: string;
      decision: 'AUTHORIZED' | 'DENIED' | 'EXPIRED';
    };
    ```
    "Skill 20 não define a semântica interna do hash — só armazena
    referência opaca canonicamente owned pela futura Skill 23";
    **negação de quota nunca gera nova variante** (nunca "Variant B2"
    pra escapar do DENIED). `VariationBudgetPolicy` é copropriedade
    "pela fronteira Skill20/Skill23". "Skill 20 nunca emite spend
    authorization"; cada variante paga o gate normal da Skill 23
    individualmente — sem "cheque em branco" por aprovação de nível de
    experimento. "Budget antigo não obriga gasto futuro" — plano válido
    ontem pode ser bloqueado hoje pela Skill 23. "Skill 20 nunca
    declara winner/loser nem bypassa Skill 01 ou Skill 23."
  - **Skill 12**: mesmo padrão `Skill02 Attempt válida →
    Skill23/QuotaGuard → autorização aplicável → checkpoint PREPARED →
    SUBMITTING → rede`; Skill 12 "não calcula saldo, não define
    orçamento, não faz cobrança."
  - **Skill 14**: contrato paralelo, nome de campo diferente —
    `FinalizationExecution.processingAuthorizationRef?: string`
    (não `spendAuthorizationRef`); mesma lista de chaves de validação;
    campos de metadata `creditsConsumed`/`processingSeconds`/
    `computeUnits`/`storageBytes`/`egressBytes` "pode ser preservada
    pra Skill 23/21 quando existir."
  - **Skill 15**: NÃO compromete `spendAuthorizationRef` (geração de
    link provavelmente não é cobrada), mas reserva
    `providerOperationAuthorizationRef?: string` pra Skill 23 governar
    rate/daily/tenant provider quota depois — "sem inventar custo
    financeiro inexistente."
  - **Skill 07**: quota esgotada passa por `QuotaGuard`/Skill23/Skill02,
    nunca vira "erro criativo"; nomeia Skill 23/24 juntas como "futuro
    lar de `QuotaGuard`."
- **Zero implementação real de billing/crédito/quota existe hoje** —
  `grep -rniE "credit|quota|billing|spend|budget"` em `src/**/*.ts(x)`
  fora de `/skills/` retorna só 1 hit irrelevante (comentário sobre
  Pinterest "creditando a marca"). Nenhuma integração Stripe/pagamento,
  nenhuma tabela de uso, nenhum código de cost-tracking. As 5
  migrations reais não têm nenhuma tabela `credits`/`quota`/`billing`/
  `spend`/`usage`.
- **APIs pagas reais hoje sem nenhum tracking de custo**: Shopee
  GraphQL (`src/lib/shopee/client.ts`, `queries.ts`) e OpenAI
  (`src/lib/concierge/{compare,expertVision,recognize}.ts`) — nenhum
  desses arquivos rastreia custo, tokens gastos ou uso; só tratamento
  de erro de rate-limit/chave ausente.
- **O incidente real da fatura de $100 da Vercel não deixou
  infraestrutura de guardrail** — causa raiz foi um webhook auto-loop
  (`BANCAZAP_FORWARD_WEBHOOK_URL` apontando pro próprio domínio,
  1.28M invocações). Fix foi puramente comportamental/config (rejeitar
  forward de mesmo domínio + flag de desabilitar). `CONTINUIDADE.md`
  confirma explicitamente: **"Ainda pendente: a parte de 'limitar
  gastos' do pedido original do usuário — só a exclusão de duplicados
  foi feita até agora, nenhum limite de orçamento/spend management foi
  configurado."**
- **Nenhum teto de gasto real existe hoje pro negócio** — cron do
  Instagram escalou de 1→20 posts/dia (2026-09-16) sem menção de teto
  de custo. Puramente teórico até a Skill 11/Veo rodar de verdade.
- **Contrato exato da Skill 22 confirmado** (lida diretamente, 433
  linhas, aprovada 2026-09-18): `TrustedTenantContext` (`tenantId`,
  `tenantStatus`, `actor: ActorIdentity`, `capabilities:
  TenantCapability[]`, `source`, `resolutionHash`, hash
  `TRUSTED_TENANT_CONTEXT_V1`), `TenantCapability` enum
  (`TENANT_ADMIN | APPROVAL_REVIEW | PIPELINE_OPERATE |
  INTERNAL_REPORT_VIEW | EXTERNAL_REPORT_DELIVER`), fail-closed sem
  fallback de tenant default. Skill 23 deve **referenciar**, nunca
  redefinir esses contratos.

**Veredito da auditoria**: diferente da Skill 22 (puramente
aspiracional), a Skill 23 tem superfície de compromisso real e
significativa já assumida por 6 Skills aprovadas — nomes de campo,
sequenciamento e semântica que não podem ser reabertos. Mas o lado de
**implementação** continua 100% greenfield: nenhuma tabela de billing,
nenhum cost tracker, nenhum limite de gasto existe em lugar nenhum
hoje. Isso aponta pra um SPEC mínimo (mesmo padrão da Skill 22) que
formaliza os contratos de decisão de quota/autorização já prometidos,
mas adia explicitamente saldo real, ledger persistido e tetos diários/
mensais como "not implemented, contrato apenas" — mesma postura da
Skill 22, mas com bem mais superfície pré-comprometida a honrar.

## Questões reais para o debate com o ChatGPT

1. Como a Skill 23 unifica os dois nomes de campo já comprometidos
   (`spendAuthorizationRef` da Skill 11 vs. `processingAuthorizationRef`
   da Skill 14, mais `providerOperationAuthorizationRef` reservado
   pela Skill 15) — são a mesma entidade com nomes locais diferentes
   por Skill consumidora, ou tipos genuinamente distintos (ex.: gasto
   com provider de geração vs. processamento local vs. rate-limit de
   API não-paga)?
2. `Skill23QuotaAuthorizationRef` (Skill 20) já define
   `decision: AUTHORIZED | DENIED | EXPIRED` — como isso se relaciona
   com a sequência `PREPARED → SUBMITTING` já usada pelas Skills 11/12?
   É o mesmo tipo de decisão em momentos diferentes do lifecycle, ou
   dois conceitos (autorização de plano vs. autorização de execução)?
3. Sem billing real nem custo conhecido de nenhum provider hoje, como
   a Skill 23 define "quota"/"crédito" de forma que não seja
   totalmente fictícia — um contador de contagem de operações (não
   R$) por enquanto, com valor monetário explicitamente adiado?
4. Como a Skill 23 lida com "provider não informou custo" (já
   registrado pela Skill 11 como fato real, não hipotético) —
   `ProviderBillingEvidence` nasce nesta Skill?
5. Dado que não há teto de gasto real hoje, a Skill 23 V1 autoriza
   tudo sempre (sem limite real configurado), ou já traz um mecanismo
   de teto mesmo que hoje o valor seja "ilimitado" por policy?
6. Cabe fechar em rodada única condensada como a Skill 22, ou a maior
   superfície de compromisso já existente (6 Skills, múltiplos nomes
   de campo, sequenciamento pago real) justifica 2 rodadas?

## Rodada 1 — decisões e contratos (debate com ChatGPT, 2026-09-18)

### Respostas às 6 perguntas do rascunho

1. **Mesma autoridade, classes incompatíveis.** `spendAuthorizationRef`
   (Skill 11), `processingAuthorizationRef` (Skill 14) e
   `providerOperationAuthorizationRef` (Skill 15) continuam existindo
   com esses nomes locais — nenhum é renomeado. Todos apontam pra
   mesma autoridade Skill 23, mas cada consumidor exige uma
   `QuotaAuthorizationClass` própria: gasto real de geração (Skill 11),
   execução de processamento local (Skill 14), e teto de operação/rate
   sem custo financeiro necessariamente atrelado (Skill 15). Não são a
   mesma entidade semântica só porque compartilham autoridade.
2. **Dois momentos, dois conceitos.** `Skill23QuotaAuthorizationRef`
   (Skill 20) é autorização de **admissão/planejamento** de
   experimento — nunca substitui a autorização **point-in-time** do
   Attempt que precede o side effect pago de fato. `experiment budget
   says OK` + `Skill23 says DENIED now` → não executa. O tipo da
   Skill 20 vira **projection mínima** da resolução real da Skill 23,
   não uma segunda fonte de verdade (compatível sem reabrir 20/25).
3. **Quota funciona sem preço.** V1 pode limitar por contagem de
   operação, crédito, compute, tempo de processamento, storage e
   egress — sem depender de nenhum valor monetário conhecido. Dinheiro
   só entra quando existir limite/política monetária explícita **e**
   base de exposição defensável (nunca por padrão implícito).
4. **`ProviderBillingEvidence` nasce oficialmente na Skill 23.** Cobre
   exatamente o fato já registrado pela Skill 11 ("provider não
   informou custo"): `knowledge: ProviderBillingKnowledge` com 4
   estados (`AMOUNT_REPORTED`/`NOT_REPORTED`/`NOT_AVAILABLE`/
   `NOT_APPLICABLE`) — nunca um valor numérico substituto tipo `"0"`.
5. **Sem teto real hoje — mas nunca por default silencioso.**
   `NO_LIMIT_BY_POLICY` é um estado explícito e auditável ("Skill 23
   não aplica teto monetário local a esse escopo"), nunca "provider é
   grátis" nem "orçamento infinito". Como hoje não existe runtime/
   policy/ledger/budget cap nenhum, a SPEC **não pode alegar** que
   "providers operam em `NO_LIMIT_BY_POLICY`" — isso exigiria um
   estado de política resolvido que ainda não existe. Cada provider
   precisará ser configurado explicitamente quando a Skill 23 virar
   código.
6. **2 rodadas, confirmado.** Maior superfície de compromisso real
   (6 Skills aprovadas, múltiplos nomes de campo, sequenciamento de
   side effect pago real) justifica 2 rodadas — não 1 como a Skill 22.

### Garantia central (congelada após rodada 1)

A Skill 23 é a autoridade formal e exclusiva que decide, para cada
operação potencialmente paga ou limitada do pipeline, **se existe
autorização durável de gasto/quota válida** antes do side effect.
Ela nunca calcula o custo real, nunca executa a chamada paga (isso
continua com a Skill dona do side effect — 11/12/14/15), nunca decide
o que a Skill executora faz com o resultado, e nunca promove
estimativa a evidência de billing. Fronteiras explícitas:

- **Skill 23 autoriza/reserva/contabiliza ≠ Skill 23 executa
  provider.** A chamada de rede sempre pertence à Skill que possui o
  side effect.
- **Skill 23 decide quota/crédito ≠ Skill 23 decide se o job deve
  rodar.** Essa decisão de orquestração continua com Skill 01/02.
- **Skill 23 registra evidência de uso/billing ≠ Skill 23 infere
  custo.** `ProviderUsageEvidence` (ex.: `processingSeconds=42`) nunca
  vira sozinho um valor de `ProviderBillingEvidence` sem pricing
  policy adicional — usage evidence não é cobrança.
- **Skill 23 não é um "cartão pré-pago" fictício.** Conceitos como
  "saldo R$100, debitar R$3,72" são proibidos enquanto não existir
  fonte real de preço ou política local conscientemente configurada.
  Quota local ≠ saldo real no provider.

### Decisões fundacionais (rodada 1)

1. **Idempotência por operação lógica, não por payload solto.**
   `QuotaOperationIdentity` deriva de
   `(tenantId, jobId, attemptNumber, providerKey, modelKey,
   inputArtifactId/Hash, requestPayloadHash)`. Mesma identidade →
   mesma autorização/consumo, mesmo que a Attempt retransmita.
   Retransmissão idempotente **nunca** cria novo consumo. **Nova
   Attempt sempre exige nova autorização** — nunca reaproveita a
   anterior, mesmo que o motivo tenha sido transitório.
2. **Payload mudou na mesma Attempt → bloqueia, nunca autoriza
   silenciosamente.** Se o payload muda sem nova Attempt autorizada
   pela Skill 02, o consumidor não pode submeter. Se a Skill 02
   autorizar nova Attempt, aí sim nasce nova autorização — nunca
   autorizações substitutas múltiplas para a mesma Attempt na V1.
3. **Retransmissão de protocolo do provider não repete autorização.**
   Se já houve `SUBMITTING` e o protocolo do provider permite
   retransmitir a mesma operação (regra já definida pela Skill 11),
   isso não solicita nova autorização — continua sendo a mesma
   operação lógica.
4. **Usage evidence e billing evidence são artefatos separados,
   ambos nascem na Skill 23.** `ProviderUsageEvidence` (unidades não
   monetárias: `processingSeconds`, `computeUnits`, `storageBytes`,
   `egressBytes`, `creditsConsumed`) documenta uso observado.
   `ProviderBillingEvidence` documenta conhecimento de custo
   monetário, com estado explícito quando o provider não informa.
   Usage evidence **nunca** vira conclusão de custo sozinha.
5. **"Não informado" nunca vira "zero".** Frase que precisa entrar
   literalmente na SPEC final: *"A ausência de valor monetário
   reportado pelo provider não constitui evidência de custo zero,
   gratuidade ou ausência de cobrança futura."* `canonicalAmount`
   nunca é `"0"` como proxy de desconhecido.
6. **Estimate (Skill 20) nunca vira billing evidence.** A
   `VariationCostEstimate` da Skill 20 continua sendo estimativa de
   planejamento; depois da execução real, só `ProviderBillingEvidence`
   (Skill 23) conta como fato.
7. **Falha/cancelamento não libera crédito automaticamente.** Três
   regras congeladas: `cancel requested ≠ provider did not charge`;
   `cancelled operation ≠ reservation release automática`;
   `provider failed ≠ zero billing`. Settlement sempre exige
   evidência — nunca assume o melhor caso.
8. **`NO_SIDE_EFFECT` provado pode liberar reservation.** Quando a
   Skill executora consegue **provar** que nenhum side effect externo
   ocorreu, a Skill 23 pode liberar a reservation conforme policy —
   mas essa mecânica completa (como provar, quem assina a prova) é
   formalizada só na rodada 2.
9. **`UNKNOWN` nunca libera capacidade.** Se uma operação pode ter
   acontecido e não se sabe, a reservation não é liberada só para o
   saldo "voltar" — senão o sistema poderia autorizar uma segunda
   geração e descobrir depois que pagou as duas.
10. **Dois tipos de limite podem coexistir na mesma operação e ambos
    valem.** Ex.: Veo com "máx 10 operações/dia" **e** "máx R$25/dia"
    — uma operação precisa passar pelos dois; a Skill 23 nunca escolhe
    o mais permissivo.
11. **`HARD_LIMIT` monetário sem exposure upper-bound confiável →
    `BLOCK`.** Regra forte: se `monetaryControlMode = HARD_LIMIT` e não
    existe teto de exposição confiável calculável, a operação é
    bloqueada — senão "hard limit" seria uma mentira estrutural.
12. **`NO_LIMIT_BY_POLICY` é um estado explícito, não um vazio.**
    Significa apenas "a Skill 23 não aplica teto monetário local a
    esse escopo" — nunca "provider é grátis", "provider não tem
    limite" ou "negócio tem orçamento infinito".
13. **O incidente da fatura de $100 da Vercel NÃO é resolvido
    automaticamente pela Skill 23 V1.** Ela só controla operações
    instrumentadas que passam pelo `QuotaGuard → Skill 23` antes do
    side effect. Ela não garante teto de hosting Vercel, bandwidth
    global, cron runaway ou infra automática externa que não passe por
    uma operação controlável ou integração de billing específica —
    isso precisa ficar explícito pra não vender proteção que não
    existe.
14. **Fronteiras por Skill consumidora, todas confirmadas:**
    - **Skill 07**: quota esgotada é sempre `QuotaGuard/Skill23 →
      BLOCKED`, nunca vira "falha criativa".
    - **Skill 12**: mesmo desenho da Skill 11 (`prepare exact request →
      request hash → Skill23 authorization → PREPARED → SUBMITTING`),
      zero contabilidade local dentro da Skill 12.
    - **Skill 14**: `processingAuthorizationRef → QuotaAuthorization`;
      metadata de processamento vira `ProviderUsageEvidence`; Skill 14
      continua observando/reportando os valores no boundary da
      operação, Skill 23 transforma isso em evidência persistível.
    - **Skill 15**: `providerOperationAuthorizationRef` pode existir
      mesmo sem custo financeiro — importante pra daily limit, rate
      allowance e operation ceiling sem inventar billing.
    - **Skill 20**: `VariationBudgetPolicy` continua da Skill 20 só
      pra planejamento experimental; a autorização real point-in-time
      é sempre da Skill 23.
    - **Skill 21**: pode reportar authorization status/usage
      evidence/billing knowledge no futuro, se incluídos como fontes
      canônicas — mas nunca calcula custo faltante.
    - **Skill 22**: todo request da Skill 23 parte de
      `TrustedTenantContext` (ou Job internal trust resolvido conforme
      Skill 22) — a Skill 23 referencia `TRUSTED_TENANT_CONTEXT_V1`,
      nunca redefine Tenant/Actor.
15. **Sem capability nova da Skill 22 por chamada de provider.** Jobs
    internos automáticos usam `SERVICE actor` + trusted execution; a
    Skill 23 aplica policy tenant-scoped diretamente. Alterar budgets/
    policies administrativamente pode exigir `TENANT_ADMIN`, mas isso
    é operação administrativa — não faz parte do caminho de cada
    provider call.
16. **Idempotência central da autorização.** Índice lógico único:
    `(tenantId, authorizationRequestKey)`, com `authorizationRequestKey`
    determinístico a partir da operação lógica/Attempt. Mesma key +
    mesmo hash → mesma decisão retornada. Mesma key + conteúdo
    diferente → `FATAL` (replay conflict). O hash de
    `QuotaAuthorizationRequest` precisa incluir obrigatoriamente:
    `tenantId`, `authorizationClass`, `subjectHash`,
    `requestedResources`, `policyBindingResolutionHash` e
    `authorizationRequestKey` — assim, mudança de policy vigente gera
    novo request/decisão, nunca reaproveitamento silencioso da
    decisão antiga.
17. **`DENIED` é durável e auditável, nunca só uma exceção lançada.**
    Precisa existir como artifact consultável depois ("por que a
    geração não ocorreu?"), pode referenciar quais limites bloquearam,
    e nunca consome reservation.
18. **Autorização é vinculada ao tenant, sem exceção.** Nenhuma
    `authorization` do tenant A pode ser usada pelo Job do tenant B,
    mesmo com provider/model/payload idênticos.
19. **Authority check é obrigatório no boundary do submit.** Skills
    11/12/14 precisam validar, imediatamente antes da chamada de rede:
    autorização existe, hash bate, classe corresponde, decisão é
    `AUTHORIZED`, não expirou, reservation é válida — só então
    `SUBMITTING`.
20. **Guard nunca é só uma chamada de função em memória.** Proibido o
    padrão `if (quotaOkay()) callProvider()` sem persistência. Precisa
    existir `QuotaAuthorization` persistida e referenciada pelo
    execution record da Skill consumidora.

### Contratos centrais (rodada 1)

```typescript
type QuotaUnit =
  | 'MONEY'
  | 'OPERATION_COUNT'
  | 'CREDIT'
  | 'COMPUTE_UNIT'
  | 'PROCESSING_SECOND'
  | 'STORAGE_BYTE'
  | 'EGRESS_BYTE';

type QuotaAuthorizationClass =
  // Skill 11 — gasto real de geração via provider (Veo etc.)
  | 'PROVIDER_GENERATION_SPEND'
  // Skill 12 — mesmo desenho da Skill 11, provider distinto
  | 'PROVIDER_PROCESSING_SPEND'
  // Skill 14 — execução de processamento/finalização local ou provider
  | 'PROCESSING_EXECUTION'
  // Skill 15 — teto de operação/rate, sem custo financeiro necessário
  | 'PROVIDER_OPERATION_RATE';

// Skill 20 nunca redefine a semântica interna — só guarda referência
// opaca canonicamente owned pela Skill 23 (compatível, não reabre 20/25).
type QuotaAuthorizationResolutionRef = {
  authority: 'SKILL23';
  authorizationId: string;
  authorizationHash: string;
  decision: 'AUTHORIZED' | 'DENIED' | 'EXPIRED';
};
// hash: QUOTA_AUTHORIZATION_RESOLUTION_REF_V1

type QuotaOperationIdentity = {
  tenantId: string;
  jobId: string;
  attemptNumber: number;
  providerKey: string;
  modelKey?: string;
  inputArtifactId: string;
  inputArtifactHash: string;
  requestPayloadHash: string;
  operationIdentityHash: string;
};
// hash: QUOTA_OPERATION_IDENTITY_V1
// Mesma tupla → mesma identidade → retransmissão idempotente nunca
// cria novo consumo. Nova Attempt sempre gera nova identidade.

type QuotaResourceRequest = {
  unit: QuotaUnit;
  amount: string; // string decimal — nunca float
};

type QuotaAuthorizationRequest = {
  authorizationRequestId: string;
  authorizationRequestKey: string; // determinístico a partir da Attempt

  tenantId: string;
  authorizationClass: QuotaAuthorizationClass;

  subjectHash: string; // hash de QuotaAuthorizationSubject
  operationIdentityHash: string; // ref a QuotaOperationIdentity

  requestedResources: QuotaResourceRequest[];
  policyBindingResolutionHash: string;

  requestHash: string; // inclui os 6 campos citados na decisão 16
};
// hash: QUOTA_AUTHORIZATION_REQUEST_V1

type MonetaryControlMode =
  | 'HARD_LIMIT'          // exposure upper-bound obrigatório; sem ele → BLOCK
  | 'NO_LIMIT_BY_POLICY'; // Skill23 não aplica teto local — nunca "grátis"

type QuotaAuthorizationDecision = 'AUTHORIZED' | 'DENIED' | 'EXPIRED';

type QuotaReservation = {
  reservationId: string;
  authorizationId: string;
  authorizationHash: string;

  reservedResources: QuotaResourceRequest[];
  status: 'HELD' | 'CONSUMED' | 'RELEASED';

  reservationHash: string;
  createdAt: string;
};
// hash: QUOTA_RESERVATION_V1
// Reserva é sempre atômica junto da decisão AUTHORIZED — nunca um
// passo separado e opcional.

type QuotaAuthorization = {
  authorizationId: string;
  authorizationRequestId: string;

  tenantId: string;
  authorizationClass: QuotaAuthorizationClass;

  decision: QuotaAuthorizationDecision;
  deniedReasons?: string[]; // referencia quais limites bloquearam

  reservationId?: string; // presente apenas quando AUTHORIZED
  expiresAt?: string;

  authorizationHash: string;
  createdAt: string;
};
// hash: QUOTA_AUTHORIZATION_V1

type ProviderUsageEvidence = {
  providerUsageEvidenceId: string;

  tenantId: string;
  authorizationId: string;
  authorizationHash: string;

  providerKey?: string;
  processorKey?: string;
  operationIdentityHash: string;

  observedUsage: Array<{
    unit: Exclude<QuotaUnit, 'MONEY'>;
    amount: string;
  }>;

  evidenceSource:
    | 'PROVIDER_REPORTED'
    | 'PROCESSOR_REPORTED'
    | 'LOCALLY_MEASURED';

  evidenceHash: string;
  observedAt: string;
};
// hash: PROVIDER_USAGE_EVIDENCE_V1
// Usage evidence não é cobrança: processingSeconds=42 não permite
// concluir custo=R$X sem pricing evidence/policy adicional.

type ProviderBillingKnowledge =
  | 'AMOUNT_REPORTED'
  | 'NOT_REPORTED'
  | 'NOT_AVAILABLE'
  | 'NOT_APPLICABLE';

type ProviderBillingEvidence = {
  providerBillingEvidenceId: string;

  tenantId: string;
  authorizationId: string;
  authorizationHash: string;
  operationIdentityHash: string;

  providerKey?: string;
  knowledge: ProviderBillingKnowledge;

  // obrigatório quando knowledge === 'AMOUNT_REPORTED';
  // proibido nos outros 3 estados (nunca canonicalAmount: "0")
  reportedAmount?: {
    canonicalAmount: string;
    currency: string;
  };

  providerEvidenceRef?: string;
  evidenceHash: string;
  observedAt: string;
};
// hash: PROVIDER_BILLING_EVIDENCE_V1
```

### Fechamentos da rodada 1

- Os três nomes já comprometidos — `spendAuthorizationRef`,
  `processingAuthorizationRef` e `providerOperationAuthorizationRef` —
  permanecem intactos. Apontam pra mesma autoridade Skill 23, mas cada
  consumidor exige uma `QuotaAuthorizationClass` específica e
  incompatível com as demais.
- A autorização da Skill 20 é admission/planejamento; nunca substitui
  a autorização point-in-time do Attempt que precede o side effect
  pago.
- Quota V1 funciona mesmo sem preços: pode limitar operações,
  créditos, compute, processamento, storage e egress. Dinheiro só
  entra quando houver limite/política monetária explícita e base de
  exposição defensável.
- `ProviderUsageEvidence` e `ProviderBillingEvidence` são as duas
  fontes de verdade separadas pra reconciliação futura — usage nunca
  vira billing sozinho.

**9 hashes canônicos fechados na rodada 1:**

1. `QUOTA_POLICY_V1`
2. `QUOTA_POLICY_BINDING_RESOLUTION_V1`
3. `QUOTA_OPERATION_IDENTITY_V1`
4. `QUOTA_AUTHORIZATION_REQUEST_V1`
5. `QUOTA_RESERVATION_V1`
6. `QUOTA_AUTHORIZATION_V1`
7. `QUOTA_AUTHORIZATION_RESOLUTION_REF_V1`
8. `PROVIDER_USAGE_EVIDENCE_V1`
9. `PROVIDER_BILLING_EVIDENCE_V1`

(`QuotaResourceScope`, `QuotaLimit`, `QuotaAuthorizationSubject` etc.
entram nos hashes dos tipos pais — não geram hash próprio na V1.)

**Estado real ao final da rodada 1** (factual, sem implementação):

| Item | Estado |
|---|---|
| Skill 23 runtime | `NOT_IMPLEMENTED` |
| Quota tables | `NOT_IMPLEMENTED` |
| Quota policies | `NOT_CONFIGURED` |
| Monetary limits | `NOT_CONFIGURED` |
| Operation limits | `NOT_CONFIGURED` |
| Usage tracking | `NOT_IMPLEMENTED` |
| Billing tracking | `NOT_IMPLEMENTED` |
| Vercel spend protection | `NOT_IMPLEMENTED` |

## Rodada 2 — patches, state machine, settlement, erros, testes (debate com ChatGPT, 2026-09-18)

### Patches compatíveis ao bloco 1 (não reabrem os 9 hashes da rodada 1)

- **Patch A — janela do limite monetário.** `HARD_LIMIT` sozinho era
  incompleto ("R$ X de limite" sem dizer em qual janela). Substitui a
  versão simplificada de `MonetaryControlMode` da rodada 1 por um tipo
  discriminado com janela explícita:

  ```typescript
  type MonetaryControl =
    | {
        mode: 'HARD_LIMIT';
        currency: string;
        hardLimitAmount: string;
        window: 'DAY' | 'MONTH' | 'BILLING_CYCLE';
      }
    | { mode: 'NO_LIMIT_BY_POLICY' }
    | { mode: 'NOT_APPLICABLE' };
  ```

  Mantém o hash `QUOTA_POLICY_V1` (não é hash novo).
- **Patch B — validade da autorização.** `QuotaPolicy` ganha
  `authorizationValidity: QuotaAuthorizationValidity`, onde
  `QuotaAuthorizationValidity = { mode: 'NO_EXPIRY' } | { mode: 'TTL';
  ttlSeconds: number }`. `QuotaAuthorization.validUntil` deriva
  sempre dessa policy — nunca um TTL inventado pelo consumidor.
- **Patch C — janela congelada na reservation.** Nasce
  `QuotaWindowRef` (`limitKey`, `window: 'ATTEMPT'|'DAY'|'MONTH'|
  'BILLING_CYCLE'`, `windowKey`, `startsAt`, `endsAt?`) e
  `QuotaReservedResource` (`resourceScope`, `reservedAmount`,
  `limitKey?`, `windowRef?`; se `limitKey` existe, `windowRef` é
  obrigatório). Isso garante que uma cobrança recebida amanhã liquida
  a janela em que a operação foi **autorizada ontem** — billing tardio
  nunca migra custo pra janela errada.
- **Patch D — idempotência de evidence.** `ProviderUsageEvidence`
  ganha `usageEvidenceKey: string`; `ProviderBillingEvidence` ganha
  `billingEvidenceKey: string`. Mesma key + mesmo conteúdo → replay
  idempotente. Mesma key + conteúdo incompatível → `FATAL_ERROR`.
  Hashes existentes (`PROVIDER_USAGE_EVIDENCE_V1`/
  `PROVIDER_BILLING_EVIDENCE_V1`) não mudam.
- **Patch E — nomes reais de `QuotaAuthorizationClass`.** A rodada 2
  confirmou os nomes definitivos (a rodada 1 havia usado nomes
  provisórios): `EXECUTION_SPEND` (Skill 11/12 —
  `spendAuthorizationRef`), `PROCESSING_OPERATION` (Skill 14 —
  `processingAuthorizationRef`), `PROVIDER_OPERATION` (Skill 15 —
  `providerOperationAuthorizationRef`, quota não-monetária apenas).
  Substitui o enum provisório de `QuotaAuthorizationClass` da rodada 1.

### Conceito que faltava: `QuotaExecutionClaim`

A reservation não pode ir direto de "autorizada" para "consumida" — é
preciso saber se a execução se comprometeu a cruzar o boundary do side
effect.

```typescript
type QuotaExecutionClaim = {
  quotaExecutionClaimId: string;
  tenantId: string;
  claimKey: string;
  authorizationId: string;
  authorizationHash: string;
  operationIdentityHash: string;
  subjectHash: string;
  claimedAt: string;
  claimHash: string;
};
// hash: QUOTA_EXECUTION_CLAIM_V1
```

- **O claim acontece imediatamente antes de `SUBMITTING`** — não
  quebra a sequência já aprovada da Skill 11 (`Attempt → payload exato
  → QuotaGuard/Skill23 → Authorization+Reservation → ProviderSubmission
  com spendAuthorizationRef → revalidação Skill23 + ExecutionClaim →
  SUBMITTING → rede`). É a materialização durável da revalidação
  point-in-time.
- **Claim só nasce se tudo ainda é válido no momento**: tenant bate,
  authorization class bate, subject bate, operation identity bate,
  reservation ainda válida, authorization ainda `AUTHORIZED`,
  `validUntil` não venceu.
- **Um claim por operação lógica**: unicidade `(tenantId,
  authorizationId)`. Replay do mesmo claim → mesmo `QuotaExecutionClaim`.
  Outra operação tentando usar a mesma autorização → `FATAL_ERROR`.
- **Expiração antes do claim**: `AUTHORIZED` + `validUntil` vencido +
  zero `ExecutionClaim` → decisão efetiva vira `EXPIRED`, provider não
  pode entrar em `SUBMITTING`, reservation pode ser liberada como
  `EXPIRED_UNUSED`.
- **Expiração depois do claim é diferente**: claim feito enquanto a
  autorização era válida significa que a execução já foi comprometida.
  Se o TTL vence depois, isso **não invalida retry técnico da mesma
  operação lógica** — não se pede nova autorização só porque o relógio
  avançou depois de `SUBMITTING`.

### State machine da reservation

```typescript
type QuotaReservationLifecycleState =
  | 'HELD'
  | 'CLAIMED'
  | 'HELD_EXTERNAL_UNKNOWN'
  | 'SETTLEMENT_PENDING'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'RELEASED';
```

Fluxos:

```text
HELD
 ├─ claim → CLAIMED
 ├─ expiry sem claim → RELEASED
 └─ cancelamento sem claim → RELEASED

CLAIMED (após claim)
 ├─ NO_SIDE_EFFECT confirmado → RELEASED
 ├─ SIDE_EFFECT confirmado → SETTLEMENT_PENDING
 └─ UNKNOWN → HELD_EXTERNAL_UNKNOWN

SETTLEMENT_PENDING
 ├─ tudo resolvido → SETTLED
 └─ parte resolvida → PARTIALLY_SETTLED
```

Estado por recurso (granularidade fina, cada recurso reservado tem seu
próprio ciclo):

```typescript
type QuotaReservationResourceLifecycleState =
  | 'HELD'
  | 'AWAITING_EVIDENCE'
  | 'HELD_UNKNOWN'
  | 'CONSUMED'
  | 'RELEASED';

type QuotaReservationResourceLifecycle = {
  resourceScope: QuotaResourceScope;
  windowRef?: QuotaWindowRef;
  reservedAmount: string;
  state: QuotaReservationResourceLifecycleState;
  consumedAmount?: string;
  releasedAmount?: string;
};

type QuotaReservationLifecycle = {
  quotaReservationId: string;
  tenantId: string;
  state: QuotaReservationLifecycleState;
  version: number; // CAS obrigatório
  resources: QuotaReservationResourceLifecycle[];
  executionClaimId?: string;
  executionClaimHash?: string;
  latestEffectEvidenceId?: string;
  latestEffectEvidenceHash?: string;
  updatedAt: string;
};
// Mutável — sem hash integral (muda de estado o tempo todo).
```

Toda transição fica auditável (imutável, append-only):

```typescript
type QuotaReservationTransition = {
  quotaReservationTransitionId: string;
  tenantId: string;
  quotaReservationId: string;
  quotaReservationHash: string;
  fromState: QuotaReservationLifecycleState;
  toState: QuotaReservationLifecycleState;
  reason:
    | 'EXECUTION_CLAIMED'
    | 'AUTHORIZATION_EXPIRED_UNUSED'
    | 'CANCELLED_BEFORE_CLAIM'
    | 'NO_SIDE_EFFECT_CONFIRMED'
    | 'SIDE_EFFECT_CONFIRMED'
    | 'EXTERNAL_EFFECT_UNKNOWN'
    | 'PARTIAL_SETTLEMENT'
    | 'FULL_SETTLEMENT';
  evidenceRefs: string[];
  versionBefore: number;
  versionAfter: number;
  transitionHash: string;
  transitionedAt: string;
};
// hash: QUOTA_RESERVATION_TRANSITION_V1 — CAS obrigatório em version.
```

### Effect evidence — o executor informa fato, Skill 23 não adivinha

```typescript
type QuotaExecutionEffect =
  | 'NO_SIDE_EFFECT_CONFIRMED'
  | 'SIDE_EFFECT_CONFIRMED'
  | 'EXTERNAL_EFFECT_UNKNOWN';

type QuotaExecutionEffectEvidence = {
  quotaExecutionEffectEvidenceId: string;
  tenantId: string;
  effectEvidenceKey: string;
  authorizationId: string;
  authorizationHash: string;
  executionClaimId: string;
  executionClaimHash: string;
  operationIdentityHash: string;
  effect: QuotaExecutionEffect;
  executorSkillId: string; // Skill11/12/14/15 conforme o tipo da operação
  sourceArtifactId: string;
  sourceArtifactHash: string;
  evidenceHash: string;
  observedAt: string;
};
// hash: QUOTA_EXECUTION_EFFECT_EVIDENCE_V1
```

Skill 23 nunca decide sozinha se o provider teve side effect — recebe
essa evidência da Skill dona da execução e só valida lineage/autoridade.

- **Cancelamento não é effect evidence.** Congelado: `Job CANCELLED ≠
  NO_SIDE_EFFECT_CONFIRMED`; `provider cancellation requested ≠
  charge reversed`.
- **Cancelamento antes do claim**: pode liberar sem depender do
  provider, porque nenhum claim significa que a operação nunca foi
  autorizada a cruzar o submit boundary →
  `CANCELLED_BEFORE_CLAIM → RELEASED`.
- **Cancelamento depois do claim**: não libera reservation
  automaticamente — precisa de `NO_SIDE_EFFECT_CONFIRMED` ou
  settlement real.
- **`EXTERNAL_EFFECT_UNKNOWN`**: `CLAIMED` + timeout/efeito ambíguo →
  `HELD_EXTERNAL_UNKNOWN`. Nenhuma reservation é devolvida só porque o
  estado incomoda.
- **`UNKNOWN` pode durar.** V1 escolhe segurança: sem evidência
  suficiente, o hold continua. Não existe TTL automático que
  transforma `UNKNOWN → RELEASED` — isso derrotaria a proteção contra
  gasto duplicado.
- **Evidência direta pode resolver parte mesmo em `UNKNOWN`.** Ex.:
  efeito externo `UNKNOWN`, mas o provider reportou cobrança de
  R$2,37 — o recurso `MONEY` pode ser consumido por evidência direta
  enquanto outros recursos continuam held → resultado
  `PARTIALLY_SETTLED`. **Settlement é por recurso, não pela reservation
  inteira.**

### Settlement

```typescript
type QuotaSettlementResolution = 'CONSUME' | 'RELEASE';
// Sem REFUND / NEGATIVE_CONSUMPTION / MANUAL_CREDIT na V1.

type QuotaSettlementBasis =
  | 'OPERATION_FIXED_UNIT'
  | 'PROVIDER_USAGE_EVIDENCE'
  | 'PROCESSOR_USAGE_EVIDENCE'
  | 'LOCAL_USAGE_MEASUREMENT'
  | 'PROVIDER_BILLING_EVIDENCE'
  | 'NO_SIDE_EFFECT_CONFIRMED'
  | 'EXPIRED_BEFORE_CLAIM'
  | 'CANCELLED_BEFORE_CLAIM';

type QuotaSettlementDecision = {
  quotaSettlementDecisionId: string;
  tenantId: string;
  settlementDecisionKey: string;
  quotaReservationId: string;
  quotaReservationHash: string;
  authorizationId: string;
  authorizationHash: string;
  resourceScope: QuotaResourceScope;
  windowRef?: QuotaWindowRef;
  reservedAmount: string;
  resolution: QuotaSettlementResolution;
  consumedAmount: string;
  releasedAmount: string;
  overageAmount: string;
  basis: QuotaSettlementBasis;
  evidenceRefs: string[];
  decisionHash: string;
  decidedAt: string;
};
// hash: QUOTA_SETTLEMENT_DECISION_V1
```

**Invariantes numéricas** (contabilidade de quota, pertence à Skill 23):

- `RELEASE`: `consumedAmount = 0`; `releasedAmount = reservedAmount`;
  `overageAmount = 0`.
- `CONSUME`: `consumedAmount = uso/cobrança factual`;
  `releasedAmount = max(reserved - consumed, 0)`;
  `overageAmount = max(consumed - reserved, 0)`.

**Overage nunca é escondido.** Se `reserved MONEY = 5` e
`actual billing = 7`, registra `consumed=7, released=0, overage=2` —
nunca capamos em 5 pra "ledger ficar bonito". Mesmo que o request
tenha declarado `UPPER_BOUND_ESTIMATE=5` e o provider cobre 7, registra
7 + overage 2 + audit alert — nunca bloqueamos a ingestão do dado
verdadeiro.

### Ledger (append-only)

```typescript
type QuotaLedgerBucket = 'RESERVED' | 'CONSUMED';
type QuotaLedgerMovement = 'INCREASE' | 'DECREASE';
type QuotaLedgerReason =
  | 'AUTHORIZATION_RESERVATION'
  | 'SETTLEMENT_RELEASE'
  | 'SETTLEMENT_CONSUMPTION';

type QuotaLedgerEntry = {
  quotaLedgerEntryId: string;
  tenantId: string;
  ledgerEntryKey: string;
  authorizationId: string;
  authorizationHash: string;
  quotaReservationId?: string;
  quotaReservationHash?: string;
  settlementDecisionId?: string;
  settlementDecisionHash?: string;
  resourceScope: QuotaResourceScope;
  windowRef?: QuotaWindowRef;
  bucket: QuotaLedgerBucket;
  movement: QuotaLedgerMovement;
  amount: string;
  reason: QuotaLedgerReason;
  ledgerEntryHash: string;
  createdAt: string;
};
// hash: QUOTA_LEDGER_ENTRY_V1
```

**V1 permite exatamente estes movimentos**: reservation → `RESERVED +
amount`; settlement → `RESERVED - reservedAmount` e, se houve consumo,
`CONSUMED + actualAmount`. **Proibido na V1**: `CONSUMED - amount`
(seria refund/crédito ainda não modelado).

**Available capacity**: `effective exposure = consumed + active
reserved`; `available = limit - effective exposure`. Isso é
contabilidade de quota, não análise de negócio.

### Concorrência

- **Atomicidade obrigatória**: autorização sob limite precisa
  executar conceitualmente numa única transação (`lock/capacity guard
  → ler CONSUMED → ler RESERVED ativo → somar reservation solicitada →
  verificar limite → criar Reservation → ledger RESERVED increase →
  criar Authorization → commit`). Nunca `SELECT saldo → solta
  transação → INSERT reservation` depois.
- **Locks ordenados**: se uma operação reserva vários recursos
  (`OPERATION`, `MONEY`, `COMPUTE_UNIT`), os scopes/windows devem ser
  adquiridos em ordem canônica pra evitar deadlocks lógicos — sem
  impor implementação Postgres-specific no SPEC.
- **Duas requests concorrentes com 1 unidade restante**: exatamente
  uma recebe `AUTHORIZED`; a outra, `DENIED`/`QUOTA_LIMIT_EXCEEDED`.
- **Reservation + ledger são atômicos**: nunca existe
  `QuotaReservation` sem `ledger RESERVED increase`, nem ledger de
  reservation sem `QuotaAuthorization` correspondente.
- **Settlement também é atômico**: para um recurso, `SettlementDecision
  + RESERVED decrease + CONSUMED increase (se houver) + resource
  lifecycle terminal` numa transação lógica. Replay nunca aplica o
  ledger duas vezes.

### Billing tardio

Exemplo: Dia 1, `SIDE_EFFECT_CONFIRMED`, 1 `OPERATION` consumida,
`MONEY` continua `AWAITING_EVIDENCE`. Dia 3, chega
`ProviderBillingEvidence AMOUNT_REPORTED` — **esse billing liquida a
mesma reservation + a mesma `QuotaWindowRef` original, nunca o
orçamento do Dia 3.**

- `knowledge = NOT_REPORTED` **não** liquida uma reservation monetária
  de `HARD_LIMIT` → recurso `MONEY` permanece `AWAITING_EVIDENCE`.
- `knowledge = NOT_AVAILABLE` segue a mesma regra segura: `HARD_LIMIT`
  + custo factual indisponível → reserva monetária permanece held. V1
  não inventa timeout pra liberar dinheiro.
- `NO_LIMIT_BY_POLICY`: se não existe limite monetário local, não
  precisa criar reservation `MONEY` — mas billing evidence ainda pode
  ser persistida pra auditoria/report; não cria um hard limit
  retroativo. Se billing chega depois de `SETTLED` sem que houvesse
  recurso `MONEY` (porque `NO_LIMIT_BY_POLICY`), o billing é
  registrado normalmente e não altera o settlement dos outros recursos.
- **Evidence replay** (via `usageEvidenceKey`/`billingEvidenceKey`):
  mesma key + mesmo conteúdo normalizado → replay idempotente; mesma
  key + valor/status conflitante → `FATAL_ERROR`. V1 não tenta
  resolver revisão financeira contraditória automaticamente.

### State machines de execução (settlement run / authorization run)

```typescript
type QuotaSettlementRunState =
  | 'PREPARED'
  | 'VALIDATING_EFFECT'
  | 'RESOLVING_EVIDENCE'
  | 'APPLYING_SETTLEMENT'
  | 'WAITING_FOR_ADDITIONAL_EVIDENCE'
  | 'COMPLETED';
// Note: sem CANCELLED — settlement não pode ser cancelado. Depois de
// CLAIMED, a contabilidade precisa terminar ou ficar explicitamente
// pendente; cancelar o Job não cancela a obrigação de reconciliar gasto.

type QuotaSettlementRun = {
  quotaSettlementRunId: string;
  tenantId: string;
  authorizationId: string;
  authorizationHash: string;
  quotaReservationId: string;
  quotaReservationHash: string;
  runContextHash: string;
  state: QuotaSettlementRunState;
  unresolvedResourceCount: number;
  latestEffectEvidenceHash?: string;
  createdAt: string;
  updatedAt: string;
};
// hash do contexto: QUOTA_SETTLEMENT_RUN_CONTEXT_V1

type QuotaAuthorizationRunState =
  | 'PREPARED'
  | 'RESOLVING_POLICY'
  | 'EVALUATING_LIMITS'
  | 'RESERVING'
  | 'DECISION_MATERIALIZED'
  | 'COMPLETED'
  | 'CANCELLED';

type QuotaAuthorizationRun = {
  quotaAuthorizationRunId: string;
  tenantId: string;
  authorizationRequestKey: string;
  authorizationRequestHash: string;
  runContextHash: string;
  state: QuotaAuthorizationRunState;
  policyBindingResolutionHash?: string;
  authorizationId?: string;
  authorizationHash?: string;
  reservationId?: string;
  reservationHash?: string;
  createdAt: string;
  updatedAt: string;
};
// hash do contexto: QUOTA_AUTHORIZATION_RUN_CONTEXT_V1
// Cancelamento só antes de DECISION_MATERIALIZED → CANCELLED. Depois,
// authorization/reservation permanecem e seguem as regras normais de
// release/claim — nunca apagamos uma decisão já materializada.
```

`QuotaAuthorizationRun`, `QuotaReservationLifecycle` e
`QuotaSettlementRun` **não recebem hash integral** — são mutáveis por
natureza.

### Expiração

Não precisa de worker dedicado na SPEC — expiração pode ser detectada
por tentativa de claim, reconciliação periódica, retry de job, ou
manutenção de quota; a semântica é sempre a mesma.

- **Expirado sem claim**: `authorization expired + reservation HELD +
  zero ExecutionClaim → reservation RELEASED`, settlement basis
  `EXPIRED_BEFORE_CLAIM`.
- **Expirado com claim**: `authorization expired + ExecutionClaim
  existe → NÃO libera`; aguarda effect/usage/billing evidence.
- **Retry técnico**: mesma operation identity → mesma authorization,
  mesma reservation, mesmo execution claim; nenhum novo `RESERVED
  increase`.
- **Nova Attempt**: `attemptNumber` novo → operation identity nova →
  authorization nova → reservation nova, como já prometido pela
  Skill 11.

### Fronteiras por Skill (rodada 2)

- **Skill 20 (planning admission)**: pode ser `AUTHORIZED`/`DENIED`/
  `EXPIRED`, mas normalmente não reserva dinheiro do provider por
  horas enquanto a variante espera na fila — a menos que uma policy
  diga explicitamente que aquela admissão consome um recurso de
  planejamento. Regra principal: `planning admission ≠ execution
  reservation`.
- **Skill 15 (provider operation)**: pode reservar `OPERATION=1`
  contra daily provider quota sem nenhum `MONEY`.
- **Skill 14 (processing)**: pode reservar `PROCESSING_SECOND`/
  `COMPUTE_UNIT` upper bound e depois liquidar com
  `ProviderUsageEvidence`.
- **Storage/egress**: se forem realmente medidos, `ProviderUsageEvidence`
  pode liquidar essas dimensões; se não forem medidos, **não
  inventamos zero**.

### Erros (rodada 2)

**20 `FATAL_ERROR`:**

```text
QUOTA_TENANT_MISMATCH
QUOTA_CROSS_TENANT_AUTHORIZATION
QUOTA_AUTHORIZATION_REQUEST_REPLAY_CONFLICT
QUOTA_OPERATION_IDENTITY_CONFLICT
QUOTA_POLICY_HASH_MISMATCH
QUOTA_RESERVATION_REPLAY_CONFLICT
QUOTA_AUTHORIZATION_REPLAY_CONFLICT
QUOTA_EXECUTION_CLAIM_REPLAY_CONFLICT
QUOTA_EXECUTION_CLAIM_SUBJECT_MISMATCH
QUOTA_EFFECT_EVIDENCE_REPLAY_CONFLICT
QUOTA_EFFECT_EVIDENCE_AUTHORITY_MISMATCH
QUOTA_USAGE_EVIDENCE_REPLAY_CONFLICT
QUOTA_BILLING_EVIDENCE_REPLAY_CONFLICT
QUOTA_SETTLEMENT_REPLAY_CONFLICT
QUOTA_DOUBLE_SETTLEMENT_ATTEMPT
QUOTA_LEDGER_ENTRY_REPLAY_CONFLICT
QUOTA_LEDGER_INTEGRITY_VIOLATION
QUOTA_UNSAFE_RESERVATION_RELEASE_ATTEMPT
QUOTA_INVALID_STATE_TRANSITION
QUOTA_UNTRUSTED_LIMIT_BYPASS_ATTEMPT
```

**`RETRYABLE_ERROR`:**

```text
QUOTA_POLICY_LOOKUP_TRANSIENT_ERROR
QUOTA_CAPACITY_TRANSACTION_TRANSIENT_ERROR
QUOTA_RESERVATION_PERSISTENCE_TRANSIENT_ERROR
QUOTA_EVIDENCE_PERSISTENCE_TRANSIENT_ERROR
QUOTA_SETTLEMENT_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

**`BLOCKED`** (bloqueios legítimos, não corrupção):

```text
QUOTA_POLICY_NOT_CONFIGURED
QUOTA_LIMIT_EXCEEDED
QUOTA_UNKNOWN_COST_BLOCKED_BY_POLICY
QUOTA_AUTHORIZATION_EXPIRED
QUOTA_TENANT_NOT_ACTIVE
```

**Domain results** (resultados de negócio, não erros):

```text
QUOTA_AUTHORIZATION_ALREADY_EXISTS
QUOTA_AUTHORIZATION_DENIED
QUOTA_EXECUTION_CLAIM_ALREADY_EXISTS
QUOTA_AUTHORIZATION_EXPIRED_UNUSED_RELEASED
QUOTA_SETTLEMENT_WAITING_FOR_EFFECT_EVIDENCE
QUOTA_SETTLEMENT_WAITING_FOR_USAGE_EVIDENCE
QUOTA_SETTLEMENT_WAITING_FOR_BILLING_EVIDENCE
QUOTA_RESERVATION_HELD_EXTERNAL_UNKNOWN
QUOTA_RESERVATION_RELEASED_NO_SIDE_EFFECT
QUOTA_SETTLEMENT_PARTIAL
QUOTA_SETTLEMENT_COMPLETED
QUOTA_POST_FACT_OVERAGE_RECORDED
QUOTA_BILLING_NOT_REPORTED
QUOTA_NO_MONETARY_LIMIT_APPLICABLE
```

### Multi-tenant

Autoridade continua a Skill 22. Cadeia de consistência obrigatória:

```text
TrustedTenantContext.tenantId
  = QuotaAuthorizationRequest.tenantId
  = QuotaReservation.tenantId
  = QuotaExecutionClaim.tenantId
  = Evidence.tenantId
  = LedgerEntry.tenantId
```

Qualquer divergência → `QUOTA_TENANT_MISMATCH`. Autorização nunca
atravessa tenant, mesmo com provider/model/payload hash idênticos —
authorization do tenant A nunca serve ao tenant B.

### Observabilidade

- **Authorization**: `tenantId`, `authorizationClass`,
  `operationIdentityHash`, `providerKey?`, `modelKey?`,
  `processorKey?`, `operationKey`, `policySnapshotHash`,
  `requestedResources`, `limitCount`, `decision`,
  `reservationCreated`, `authorizationExpired`, `durationMs`,
  `errorCode?`. Valores monetários podem ir em logs financeiros
  controlados, nunca como labels de métrica.
- **Reservation**: `reservationId`, `reservationLifecycleState`,
  `resourceCount`, `claimed`, `heldUnknown`, `partiallySettled`,
  `fullySettled`, `released`, `ageOfOldestHeldReservation`.
- **Evidence/settlement**: `usageEvidenceKnowledge`,
  `billingKnowledge`, `effectEvidenceStatus`,
  `unresolvedResourceCount`, `settlementBasis`, `overagePresent`,
  `settlementState`.
- **Nunca logar**: provider secret, API token, raw request payload,
  prompt integral, payment credential, full provider invoice payload,
  personal billing information.
- **Métricas operacionais**: `quota_authorization_total`,
  `quota_authorization_denied_total`,
  `quota_reservation_created_total`,
  `quota_reservation_released_total`, `quota_execution_claim_total`,
  `quota_external_unknown_total`, `quota_settlement_completed_total`,
  `quota_settlement_partial_total`, `quota_usage_evidence_total`,
  `quota_billing_evidence_total`, `quota_billing_not_reported_total`,
  `quota_post_fact_overage_total`, `quota_limit_exceeded_total`,
  `quota_expired_unused_total`. **Nunca criar** `video_roi`,
  `best_provider`, `profitability_score` — isso não é Skill 23.
- **Audit events**: quota authorization requested/granted/denied;
  reservation created; execution claim committed; authorization
  expired unused; external effect confirmed/unknown; no side effect
  confirmed; usage evidence recorded; billing evidence recorded;
  billing amount unavailable/not reported; settlement partially
  completed/completed; reservation released; post-fact overage
  recorded; unsafe release blocked; cross-tenant authorization
  blocked; limit bypass attempt blocked.

### 40 testes críticos

**1–5 · Policy / authorization / atomicidade**
1. Policy atual é resolvida por authorization request.
2. Policy ausente bloqueia, nunca assume unlimited.
3. Authorization + reservation + `RESERVED` ledger são atômicos.
4. Duas requests concorrentes com uma unidade restante produzem
   exatamente uma `AUTHORIZED`.
5. Denial não cria reservation.

**6–10 · Identity / claim / expiry**
6. Retransmissão da mesma operation identity reutiliza authorization.
7. Nova Attempt cria nova operation identity/autorização.
8. Payload incompatível não reutiliza autorização anterior.
9. Claim antes de `validUntil` é aceito.
10. Authorization expirada sem claim é liberada como unused.

**11–15 · Claim / cancellation / retry**
11. Claim após expiração é bloqueado.
12. Mesmo claim replay é idempotente.
13. Autorização não pode ser claimada por outra operation identity.
14. Cancelamento antes do claim libera reservation.
15. Expiração depois do claim não cria nova autorização para retry
    técnico da mesma operação.

**16–20 · External effect safety**
16. `NO_SIDE_EFFECT_CONFIRMED` libera recursos reservados.
17. Cancellation após claim sozinho não libera nada.
18. `SIDE_EFFECT_CONFIRMED` inicia settlement.
19. `EXTERNAL_EFFECT_UNKNOWN` move reservation para
    `HELD_EXTERNAL_UNKNOWN`.
20. `UNKNOWN` nunca é liberado automaticamente por TTL.

**21–25 · Usage / billing evidence**
21. Usage evidence liquida unidade correspondente.
22. Billing `AMOUNT_REPORTED` liquida `MONEY`.
23. Billing `NOT_REPORTED` nunca vira zero.
24. Billing `NOT_AVAILABLE` sob `HARD_LIMIT` mantém `MONEY` pending.
25. Mesma `evidenceKey` com conteúdo conflitante é fatal.

**26–30 · Ledger / settlement**
26. Settlement remove `RESERVED` exatamente uma vez.
27. Consumo factual gera `CONSUMED` increase exatamente uma vez.
28. `actual < reserved` libera o remainder.
29. `actual > reserved` registra consumo real + overage.
30. Replay de `SettlementDecision` não duplica ledger.

**31–35 · Late evidence / windows / partial settlement**
31. Billing tardio usa `QuotaWindowRef` original.
32. Operação pode ficar `PARTIALLY_SETTLED` com `MONEY` pendente.
33. Evidence tardia termina recurso pendente sem alterar recurso já
    settled.
34. `NO_LIMIT_BY_POLICY` permite registrar billing sem criar limite
    monetário retroativo.
35. Ledger de janela nova não absorve cobrança pertencente à janela
    antiga.

**36–40 · Tenant / boundaries / observability**
36. Authorization tenant A nunca serve ao tenant B.
37. Skill 20 planning admission não substitui Skill 11 execution
    authorization.
38. `processingAuthorizationRef` exige `PROCESSING_OPERATION`.
39. `providerOperationAuthorizationRef` pode operar apenas com quota
    não monetária.
40. Cancelamento nunca presume refund, e Skill 23 nunca calcula
    ROI/performance.

### Hashes novos da rodada 2 (7) — total 16

```text
QUOTA_AUTHORIZATION_RUN_CONTEXT_V1
QUOTA_EXECUTION_CLAIM_V1
QUOTA_EXECUTION_EFFECT_EVIDENCE_V1
QUOTA_RESERVATION_TRANSITION_V1
QUOTA_SETTLEMENT_DECISION_V1
QUOTA_LEDGER_ENTRY_V1
QUOTA_SETTLEMENT_RUN_CONTEXT_V1
```

Rodada 1: 9 hashes. Rodada 2: 7 hashes. **Total Skill 23: 16 hashes
canônicos.** Os 4 patches iniciais (A-D) modificam contratos já
existentes e não adicionam hash names novos.
`QuotaAuthorizationRun`/`QuotaReservationLifecycle`/`QuotaSettlementRun`
não recebem hash integral por serem mutáveis.

### Cadeia operacional final

```text
Attempt / planned operation
        ↓
exact payload / exact subject
        ↓
QuotaOperationIdentity
        ↓
QuotaAuthorizationRequest
        ↓
current QuotaPolicy
        ↓
atomic capacity evaluation
        ↓
Reservation + RESERVED ledger
        ↓
QuotaAuthorization AUTHORIZED
        ↓
executor materializes its execution record
        ↓
point-in-time revalidation
        ↓
QuotaExecutionClaim
        ↓
SUBMITTING
        ↓
provider / processor
        ↓
effect evidence
   ┌────┴─────────────┐
NO_SIDE_EFFECT   SIDE_EFFECT   UNKNOWN
   │                  │             │
 release          settlement      hold
                      ↓
              usage/billing evidence
                      ↓
              SettlementDecision(s)
                      ↓
        RESERVED decrease + CONSUMED increase
                      ↓
            SETTLED / PARTIALLY_SETTLED
```

### Integração final das Skills já comprometidas

- **Skill 07**: quota block continua operacional, nunca erro criativo.
- **Skill 11**: `spendAuthorizationRef` → `EXECUTION_SPEND`; retry na
  mesma Attempt não gasta nova authorization.
- **Skill 12**: mesmo `QuotaGuard` point-in-time da Skill 11.
- **Skill 14**: `processingAuthorizationRef` → `PROCESSING_OPERATION`;
  metadata observada vira `ProviderUsageEvidence`.
- **Skill 15**: `providerOperationAuthorizationRef` →
  `PROVIDER_OPERATION`; pode proteger apenas contagem/rate quota.
- **Skill 20**: `Skill23QuotaAuthorizationRef` → planning admission;
  nunca substitui execution authorization.

### O que a Skill 23 V1 ainda NÃO é

Não é gateway de pagamento; não é contabilidade fiscal; não é invoice
manager; não é carteira pré-paga; não garante budget global da
Vercel; não monitora toda despesa SaaS externa; não calcula ROI; não
presume preço de provider; não presume refund; não converte `UNKNOWN`
em zero.

### Estado real após a SPEC (mesmo aprovada)

| Item | Estado |
|---|---|
| Skill 23 runtime | `NOT_IMPLEMENTED` |
| QuotaPolicy persistence | `NOT_IMPLEMENTED` |
| Reservation ledger | `NOT_IMPLEMENTED` |
| ExecutionClaim runtime | `NOT_IMPLEMENTED` |
| Usage evidence ingestion | `NOT_IMPLEMENTED` |
| Billing evidence ingestion | `NOT_IMPLEMENTED` |
| Settlement engine | `NOT_IMPLEMENTED` |
| Provider budgets | `NOT_CONFIGURED` |
| Monetary hard limits | `NOT_CONFIGURED` |
| Operation quotas | `NOT_CONFIGURED` |
| Vercel global spend protection | `NOT_IMPLEMENTED` |

### Fechamentos finais (ChatGPT, rodada 2)

A reservation protege capacidade no instante da autorização; o
`QuotaExecutionClaim` distingue uma autorização ainda abandonável de
uma operação já comprometida com execução. Depois do claim,
cancelamento e expiração jamais devolvem quota sozinhos — só evidência
de ausência de side effect ou settlement factual pode liberar
capacidade. Uso e cobrança são liquidados por recurso e pela janela
original da autorização; billing tardio não migra custo para a janela
em que foi observado. O ledger é append-only e contabiliza `consumed +
active reserved`; retries idempotentes não criam novas reservations,
claims ou consumos. Quando o provider não informa custo ou o efeito
externo permanece incerto, a Skill 23 prefere exposição visível e
capacity held a fabricar custo zero ou liberar orçamento possivelmente
já gasto.

**Aprovação condicional do ChatGPT**: *"Com isso, a Skill23 fica
conceitualmente fechada. Após integrar esta rodada e confirmar por
grep 0 tipos duplicados + 20 FATAL_ERROR + 16 hashes canônicos totais
+ 40 testes, pode ser carimbada APROVADA EM ESPECIFICAÇÃO — 23/25."*

## Reparo transversal pós-revisão Fable (2026-09-18)

> Contexto: o Claude Fable 5 Max encontrou 6 falhas bloqueantes nas
> costuras entre Skills — **B6** é a incompatibilidade entre o
> `QuotaGuard` legado descrito nas Skills 01/02 (`ALLOW|PAUSE|DENY|BLOCK`,
> operation key própria) e o sistema real da Skill 23
> (`QuotaOperationIdentity`/`QuotaAuthorization`,
> `AUTHORIZED|DENIED|EXPIRED`, sem `PAUSE`). Ver "Ponto E" do reparo
> transversal.

### Ponto E — Skill 23 como única autoridade de quota

**Resolve B6.** Regra central: depois deste patch **não existe mais um
segundo sistema de autorização de quota** dentro da Skill 01/02. O
termo `QuotaGuard` pode continuar aparecendo como nome informal do
checkpoint operacional, mas deixa de ser um contrato/autoridade
própria — vira só o nome do ponto onde a Skill executora materializa a
identidade canônica da operação e solicita decisão à Skill 23.

```text
ANTES (proibido):
Skill01/02 QuotaGuard → operationKey própria → ALLOW/DENY/PAUSE
Skill23 → QuotaOperationIdentity → QuotaAuthorization → AUTHORIZED/DENIED/EXPIRED

DEPOIS:
QuotaGuard = checkpoint conceitual que chama Skill23
ÚNICA autoridade: Skill23
quota decision → somente Skill23
queue waiting/blocking → Skill02
run/stage waiting → Skill01
```

**`PAUSE` sai completamente do domínio de quota.** Skill 23 permanece
com `QuotaAuthorizationDecision = 'AUTHORIZED' | 'DENIED' | 'EXPIRED'`
(já definido acima) — nenhum `PAUSE`/`WAIT`/`RETRY`/`DEFER` entra como decisão
de autorização (são estados operacionais, não decisões de quota).
**Cuidado**: `RunControlCommand.PAUSE`/`RunStatus.PAUSED` (pausa de
Run por comando humano) **não é afetado** — só é superseded qualquer
`QuotaDecision.PAUSE`/`QuotaGuardResult.PAUSE`/`quotaStatus=PAUSE`.

**Identidade canônica única**: a única identidade de uma operação pra
quota é `QuotaOperationIdentity.operationIdentityHash` (já pertencente
à Skill 23) — nada na Skill 01/02 cria uma segunda
`quotaOperationKey`/`quotaGuardKey`/`quotaExecutionKey`/`spendKey`
como identidade concorrente. Tabela conceitual das identidades (nenhuma
substitui a outra): `logicalJobKey` (Job lógico da Skill 02),
`handlerInvocationKey` (tick físico do handler), `requestPayloadHash`
(payload exato da operação externa), `QuotaOperationIdentity.operationIdentityHash`
(identidade canônica pra quota), `QuotaAuthorizationRequest.authorizationRequestKey`
(idempotência da decisão da Skill 23), provider idempotency key
(idempotência do side effect no provider).

`authorizationRequestKey` deriva de `QUOTA_AUTH:<operationIdentityHash>`
(ou canonical encoding equivalente) — nunca `jobId` ou `logicalJobKey`
isolados. **Nova Attempt implica nova identidade de quota**: `Job J
Attempt 1 → Q1`, `Job J Attempt 2 → Q2`, obrigatoriamente `Q1 ≠ Q2` e
`Authorization A1 ≠ A2` (preserva o que a Skill 23 já tinha aprovado).
**Retry físico dentro da mesma Attempt** (ex.: polling da Skill 11 —
tick A/B/C) continua usando a mesma `QuotaOperationIdentity`/
`Authorization`/`Reservation`/`ExecutionClaim` — não solicita nova
autorização a cada poll. **Correção semântica do Ponto D** fica
naturalmente correta: `Generation Job J1/Attempt 1 → Q1`; `correction
→ novo Job J2/Attempt 1 → Q2` (mesmo que ambos sejam Skill 11) — sem
reutilização de autorização através da `StageIteration`.

```typescript
type QuotaExecutionClaimRequest = {
  quotaExecutionClaimRequestId: string;
  tenantId: string;
  claimRequestKey: string; // QUOTA_CLAIM:<authorizationId>:<operationIdentityHash>
  authorizationId: string;
  authorizationHash: string;
  operationIdentityHash: string;
  subjectHash: string;
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  requestPayloadHash: string;
  requestHash: string;
  requestedAt: string;
};
// hash: QUOTA_EXECUTION_CLAIM_REQUEST_V1
```

**Replay**: mesma `claimRequestKey` + mesmo `requestHash` → idempotente;
conteúdo divergente → `QUOTA_EXECUTION_CLAIM_REQUEST_REPLAY_CONFLICT`
(1 novo `FATAL_ERROR`). **Validação antes de materializar o claim**:
Skill 23 valida `tenantId`/`authorizationId+hash`/
`operationIdentityHash`/`subjectHash`/`jobId`/`attemptNumber`/
`requestPayloadHash` contra `QuotaAuthorization`/`QuotaOperationIdentity`/
`QuotaAuthorizationSubject` — **Attempt precisa bater exatamente**
(`Authorization` do Attempt 1 + claim request dizendo Attempt 2 → sem
"quase igual", rejeitado). No instante do claim, a authorization
precisa estar efetivamente válida: `decision=AUTHORIZED` + not expired
+ reservation valid — só então nasce `QuotaExecutionClaim`. **Planning
admission nunca recebe execution claim** — proibido
`QuotaAuthorizationClass=PLANNING_ADMISSION → QuotaExecutionClaimRequest`
(planning admission não é side-effect execution).

```typescript
// Interface conceitual — não cria nova autoridade, só expõe os
// contratos já pertencentes à Skill 23. Sem hash próprio.
interface Skill23QuotaAuthorityPort {
  authorize(request: QuotaAuthorizationRequest): Promise<QuotaAuthorizationResolutionRef>;
  claimExecution(request: QuotaExecutionClaimRequest): Promise<QuotaExecutionClaim>;
}
```

**Matriz final de decisão** (entra congelada no repair section):

```text
TRANSIENT SKILL23 INFRA ERROR   → CONTINUE same Attempt, same authorization request identity
QUOTA DENIED                    → BLOCKED, same Job waits
QUOTA EXPIRED BEFORE CLAIM      → BLOCKED, later new Attempt
TECHNICAL EXECUTION FAILURE     → Skill02 retry policy, new Attempt
SEMANTIC CORRECTION             → new StageIteration, new Job, Attempt 1
```

**Autoridade final por decisão**: pode gastar/consumir? → Skill 23.
Pode retry técnico? → Skill 02 + executor side-effect rules. Deve criar
revisão semântica? → Skill 01 transition graph (a partir do adapter).
Pode usar provider/credential? → Skill 24. Pode ingressar por boundary
seguro? → Skill 25. Nenhum overlap.

**Erro transitório da Skill 23 (antes do claim/network) não vira falha
semântica.** Se a Skill 23 falha transitoriamente (datastore timeout,
temporary persistence failure) antes do side effect, o handler **não**
deve imediatamente reportar `FAILED` (que criaria nova Attempt/nova
quota identity — a autorização anterior pode ter sido materializada e
a resposta só se perdeu). Regra: retorna
`{outcome: 'CONTINUE', continuation: {continuationCode:
'SKILL23.QUOTA_AUTHORIZATION_RECONCILIATION', mode:
'DEPENDENCY_RECHECK'}}` — mesma Job/Attempt/`QuotaOperationIdentity`/
`authorizationRequestKey`. Retry de autorização é idempotente: no
próximo tick, mesma Attempt → mesma `QuotaAuthorizationRequest` →
mesma `authorizationRequestKey` → Skill 23 retorna/materializa a mesma
decisão, nenhuma segunda reservation. Mesma regra pro claim (erro
transitório no claim → `CONTINUE`/`DEPENDENCY_RECHECK`, novo tick
reutiliza o mesmo `claimRequestKey`). **Regra forte**: `Skill23
transient control-plane uncertainty ≠ semantic execution failure` —
não usar `FAILED + RETRYABLE` como primeira escolha antes de resolver
a idempotência da chamada à Skill 23.

**Depois do claim**, a autoridade de retry volta pra side-effect safety
da Skill executora + Skill 02 — Skill 23 não decide se o provider pode
ser chamado de novo. `EXTERNAL_EFFECT_UNKNOWN` (ex.: Skill 11 em
`SUBMITTING → timeout → external effect UNKNOWN`): Skill 23 mantém a
reservation held, mas não emite `PAUSE` nem "retry provider" — Skill
11/02 aplicam suas próprias regras de side-effect safety. Rotação de
credencial pela Skill 24 **não** implica nova quota authorization nem
retry permitido — cada autoridade permanece separada.

**Quota block nunca cria nova `StageIteration` nem nova variante**
(muito importante, liga com o Ponto D): `quota blocked ≠ semantic
correction`. A mesma `StageExecution` permanece `WAITING_EXECUTION`
(conforme B48/B49 do Ponto B). Quando o Job é desbloqueado, a Skill 02
cria nova Attempt do **mesmo** Job → nova `QuotaOperationIdentity` →
nova Authorization — a `StageExecution` continua a mesma porque o
input semântico não mudou. Essa é exatamente a diferença entre "quota
wait/technical retry" e "correction revision". Skill 20 permanece:
quota denied → no new variant (agora concretamente `Job BLOCKED/QUOTA`
ou planning admission denied antes do Run).

**Nomes locais das Skills 11/14/15 continuam existindo — não são três
autoridades, são três nomes de domínio apontando pra
`QuotaAuthorization` da Skill 23** (ver patches nas próprias Skills):
`spendAuthorizationRef`/`processingAuthorizationRef`/
`providerOperationAuthorizationRef` = `ExecutionQuotaBinding.quotaAuthorizationId`
(definido no Ponto E da Skill 02). Skill 20 continua diferente:
`Skill23QuotaAuthorizationRef` já aprovado representa `PLANNING_ADMISSION`
e **nunca** cria `ExecutionQuotaBinding` — planning authorization nunca
viaja pra provider execution (ex.: `10:00 Skill20 PLANNING_ADMISSION
AUTHORIZED` não substitui `15:00 Skill11` precisando de
`EXECUTION_SPEND` nova).

**`ProviderBillingEvidence`/settlement não mudam com este reparo** —
`ExecutionQuotaBinding` não faz `CONSUMED`/`RELEASED`/`REFUND`; depois
da operação, `effect evidence`/`usage evidence`/`billing evidence` →
Skill 23 settlement, como já aprovado. "Provider não informou custo" ≠
"custo zero" continua intacto.

### 1 `FATAL_ERROR` novo do Ponto E

```text
QUOTA_EXECUTION_CLAIM_REQUEST_REPLAY_CONFLICT
```

### 1 hash canônico novo do Ponto E

`QUOTA_EXECUTION_CLAIM_REQUEST_V1`. Sem hash próprio:
`Skill23QuotaAuthorityPort`.

### Critérios de fechamento do componente de quota do B6 (18, congelados)

1. Skill 23 é a única quota authority.
2. Skill 01 não possui quota decision própria.
3. Skill 02 não possui quota decision própria.
4. `PAUSE` específico de quota desapareceu.
5. `QuotaOperationIdentity` é a única identidade canônica de quota.
6. `authorizationRequestKey` deriva dessa identidade.
7. Handler pede autorização somente após payload exato.
8. Execution claim possui request explícito.
9. Side effect exige `QuotaExecutionClaim`.
10. Side effect exige `ExecutionQuotaBinding`.
11. `DENIED`/`EXPIRED` viram Job `BLOCKED`, não `PAUSE`.
12. Transient Skill 23 uncertainty usa `CONTINUE` na mesma Attempt.
13. Nova Attempt exige nova quota identity/auth.
14. Nova `StageIteration`/novo Job também exige nova quota identity/auth.
15. Nomes locais das Skills 11/14/15 apontam pra mesma `QuotaAuthorization`.
16. Skill 20 planning admission não substitui execution authorization.
17. Quota block não cria nova `StageIteration`.
18. Quota block não cria nova variante.

(A parte do B6 referente a duplicatas de tipo que passaram pelas
auto-verificações anteriores fica deliberadamente pro Ponto G — global
contract lint.)
