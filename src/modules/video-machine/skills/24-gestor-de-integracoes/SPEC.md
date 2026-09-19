# Skill 24 — Gestor de Integrações

> **APROVADA EM ESPECIFICAÇÃO — 24/25** (2026-09-18)
>
> Especificação/contrato. **Sem implementação ainda** — nenhuma migration,
> tabela, RPC ou worker foi criado nesta Skill. Este arquivo só vira
> código depois da revisão do Claude Fable 5 Max e do GPT-6 Astra.
>
> Debatida e aprovada em 2026-09-18 após 2 rodadas com ChatGPT (decisões
> fundacionais + contratos centrais → binding resolution/credential
> rotation state machine + erros + observabilidade + testes), com
> auditoria real do repositório prévia (mesmo método das Skills 04-23).
> Auto-verificação confirmou as 4 condições do ChatGPT antes do
> carimbo: 0 tipos TypeScript duplicados (um caso real de duplicata —
> `IntegrationHealthStatus` declarado duas vezes — foi encontrado e
> corrigido durante a auto-verificação, mesmo padrão recorrente já
> visto nas Skills 13/14/16/17/20/21), 20 `FATAL_ERROR`, 14 hashes
> canônicos (4 rodada 1 + 10 rodada 2), 40 testes críticos.
>
> **Skill de infraestrutura (22-25) — 3ª das 4.** Fronteira já congelada
> pela Skill 22 (L432-433 de `22-gestor-de-conta-tenant/SPEC.md`):
> *"Skill 22 é responsável por tenant/actor authority. Credenciais,
> contas e capabilities de Instagram, Shopee, Z-API e outros provedores
> continuam pertencendo à Skill 24."* Como a Skill 23, tem superfície
> real de compromisso pré-existente (8 Skills já aprovadas referenciam
> "Skill 24" nominalmente ou por contrato equivalente) — não é
> greenfield conceitual puro como a Skill 22 foi.

## Garantia central (rascunho inicial, por ChatGPT)

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


```text
Skill 22 → quem é o tenant/ator autorizado
Skill 24 → quais integrações externas pertencem a esse tenant,
           quais contas/perfis/provider bindings estão ativos,
           quais capabilities foram realmente verificadas,
           quais credenciais/configurações podem ser usadas
```

Skill 24 explicitamente **NÃO**: autentica usuário, autoriza gasto
(isso é Skill 23), decide lógica de negócio, executa análise.

Princípio-chave (ChatGPT): **"integration exists" ≠ "capability
verified"**. Ter credencial da Meta não prova que aquele tenant pode
publicar vídeo, responder DM pública ou usar uma permission específica.

## Auditoria real do repositório (2026-09-18)

### 1. Integrações reais existentes hoje

| Provider | Real? | Arquivos-chave |
|---|---|---|
| Shopee Affiliate Open API (GraphQL) | ✅ real, pago, validado ao vivo | `src/lib/shopee/client.ts` (HMAC-SHA256, 8000 calls/h documentado), `queries.ts`, `types.ts` |
| Z-API (WhatsApp) | ✅ real, produção | `src/lib/channel/zapi.ts`, webhook `src/app/api/webhook/zapi/route.ts` |
| Instagram/Meta Graph (DM reply) | ✅ real | `src/lib/channel/instagramGraph.ts` + webhook `src/app/api/webhook/instagram/route.ts` (valida `X-Hub-Signature-256`) |
| Windsor.ai (proxy de publicação IG) | ✅ real | `src/app/api/cron/publish-product/route.ts` (`create_image_post`/`create_comment`/`create_story`); também tem capacidade real de leitura/métricas conectada mas **nunca chamada** (confirmado pela auditoria da Skill 18) |
| OpenAI | ✅ real, pago | `src/lib/concierge/{compare,expertVision,recognize}.ts`, `config.ts` (`gpt-4o-mini` default + escalation `gpt-6-astra`) |
| Supabase | ✅ real, DB/auth backend | `src/lib/db/client.ts` — projeto físico único `babamanager-pro` |
| Metricool | ❌ zero código — "usado manualmente fora do sistema" (`06-pesquisa-de-tendencias/SPEC.md:137`) |
| Pinterest | ❌ só meta tag de verificação de domínio, não API (`06/SPEC.md:132`); publicação `NOT_IMPLEMENTED` (`17/SPEC.md:1654`) |
| TikTok / Google Trends | ❌ zero menção em código/`package.json` |
| Mercado Livre | 🟡 OAuth app real registrado + credenciais reais só no `.env` local, **zero consumo em `src/`** — API dead-end confirmado (`items/{id}` 403, sem campo de preço via API); pivotado pra curadoria manual (`CONTINUIDADE.md:605-710`) |
| Bling | ❌ **nenhuma evidência neste repositório** — único hit é falso-positivo (substring de "sibl**ing**s"). Contradiz nota de sessão anterior; precisa ser re-verificada contra o projeto correto antes de qualquer decisão de arquitetura assumir Bling como integração real. |

`package.json` confirma: só `openai` e `@supabase/supabase-js` são SDKs
reais instalados — Shopee/Z-API/Windsor/Instagram Graph são tudo
`fetch()` manual contra REST/GraphQL cru.

### 2. Onde credenciais vivem hoje

100% env vars — zero hardcoded, zero credencial em tabela do banco.

`.env.example` documenta: `SHOPEE_APP_ID/SECRET`,
`ZAPI_INSTANCE_ID/TOKEN/CLIENT_TOKEN`, `OPENAI_API_KEY`,
`CONCIERGE_VISION_MODEL`, `CONCIERGE_TRIGGER_PHRASE`,
`BANCAZAP_FORWARD_WEBHOOK_URL`, `SUPABASE_URL/SERVICE_ROLE_KEY`,
`SITE_BASE_URL`, `REVALIDATION_SECRET`.

Encontradas em uso real mas **fora** do `.env.example` (não
documentadas no template): `ADMIN_PASSWORD`, `INSTAGRAM_APP_SECRET`,
`INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_PAGE_ACCESS_TOKEN`,
`WINDSOR_API_KEY`, `WINDSOR_INSTAGRAM_ACCOUNT_ID`, `CRON_SECRET`,
`CONCIERGE_EXPERT_MODEL` + 4 outras `CONCIERGE_*`.

`MERCADOLIVRE_APP_ID/SECRET/REFRESH_TOKEN` só no `.env` local, nunca
commitadas, zero consumo em `src/`. **Incidente real de higiene de
credencial**: fragmento do `MERCADOLIVRE_APP_SECRET` foi impresso
acidentalmente em terminal numa sessão de fix (`CONTINUIDADE.md:639-642`),
recomendação de rotação manual registrada mas não confirmada como feita.

### 3. Como cada provider resolve conta/perfil hoje

**Sempre conta única hardcoded** — consistente com a realidade
single-tenant já confirmada pela Skill 22. Nenhum código resolve
"qual conta" por tenant/usuário/chave dinâmica; é sempre
`process.env.X` lido direto no momento da chamada. Exemplo notável:
Z-API roda na **mesma instância física** compartilhada com um projeto
não-relacionado (BancaZAP), por decisão humana documentada em
comentário — "resolução de conta" hoje é decisão manual de deploy, não
conceito de runtime.

### 4. Compromissos vinculantes já assumidos por Skills aprovadas

Grep exaustivo em `skills/*/SPEC.md` por "Skill 24"/"Skill24":

- **Skill 06**: nomeia "Provider Registry" como futuro lar na Skill 24
  (3 ocorrências, incluindo linha 849).
- **Skill 10** (linha 740): "A Skill 11/Skill 24 resolve a credencial
  no momento da execução por handle seguro."
- **Skill 11** (linhas 48, 950): "Não decide credenciais — resolve por
  handle seguro (Skill 24), nunca manipula secret em texto plano";
  multi-tenant section exige `credencial resolvida pela Skill 24`
  batendo com `trustedTenantId`.
- **Skill 16** (linhas 188-222, 238-241) — **compromisso mais concreto**:
  já definiu e congelou `MessagingAutomationCapabilitySnapshot`
  (enum `VERIFIED|TESTER_ONLY|UNVERIFIED|UNSUPPORTED|NOT_IMPLEMENTED|
  BLOCKED_BY_ACCOUNT_REQUIREMENT`) como dono temporário, texto
  explícito: "a futura Skill 24 ... poderá vir a possuir formalmente o
  conceito de integração/capacidade por provider... até lá,
  `MessagingAutomationCapabilitySnapshot` é definido aqui, na Skill 16".
- **Skill 17** (linhas 1671-1672): "Provider account precisa pertencer
  ao tenant/contexto autorizado. A futura Skill 24 será autoridade
  dessa associação; até lá, providerKey+providerAccountId → profile
  resolution → tenant authorization."
- **Skill 18** (linhas 330-353) — segundo compromisso concreto: já
  definiu `MetricProviderCapabilities` (hash
  `METRIC_PROVIDER_CAPABILITIES_V1`) com formato **diferente** do
  enum de capability da Skill 16 (granular por campo de leitura de
  métrica, não por ação de mensageria).
- **Skill 20** (linha 1514): resolução de integração autorizada do
  tenant "Skill 24 formalizará essa resolução depois."
- **Skill 21** (linhas 202-204, 322): delivery credentials/secrets/
  accounts pertencem à "camada de integração"; Skill 21 só recebe
  `deliveryProfileRef` já resolvido.
- **Skill 22** (linhas 289-291, 432-433): fronteira mais explícita —
  `TenantActorBinding ≠ provider account binding`; credenciais/contas/
  capabilities de Instagram/Shopee/Z-API "continuam pertencendo à
  Skill 24".

**Tensão real de design a resolver no debate**: Skills 16 e 18 cada
uma já inventou independentemente um formato de "capability snapshot
por provider" — não são o mesmo shape (enum de ação de mensageria vs.
capability granular por campo de métrica). Skill 24 precisa decidir se
unifica, reconcilia via projection, ou mantém como dois conceitos
compatíveis mas distintos — sem quebrar os hashes já aprovados de
16/18.

### 5. Capabilities reais vs. presumidas

**Zero código no repo hoje verifica capability antes de usar** — toda
chamada (Shopee/Z-API/Windsor/Instagram Graph/OpenAI) assume
"credencial presente → funciona" e só detecta falha reativamente via
status HTTP/corpo de erro. Exemplo ao vivo:
`publish-product/route.ts:113-118` documenta que Windsor às vezes
retorna 200 com erro embutido no corpo — precisou inspeção manual do
corpo pra pegar falso-sucesso.

As 3 Skills que já fizeram esse trabalho analítico (mas só como
documentação de SPEC, nunca como código de runtime):
- Skill 16: `inboundDirectMessage`/`outboundDirectMessage = TESTER_ONLY`;
  `inboundPublicComment`/`outboundCommentReply = NOT_IMPLEMENTED`;
  `publicProductionAccess = BLOCKED_BY_ACCOUNT_REQUIREMENT` (gate real
  de Tech Provider/CNPJ da Meta).
- Skill 18: Windsor `schemaDiscovery`/conexão = `VERIFIED`, mas
  `publicationRead`/`mediaRead`/`storyRead` = `UNVERIFIED` até query
  real validar — o exemplo mais limpo já existente no repo do
  princípio "integração ≠ capability".
- Skill 06: distinção deliberada entre "capacidade arquitetural" (a
  plataforma suporta) e "disponibilidade executável" (existe
  adapter/provider real neste repo).

### 6. Ausências confirmadas

Pinterest, Metricool, TikTok, Google Trends: zero integração real
(detalhado no item 1). Mercado Livre: credencial real existe mas
dead-end de API confirmado, zero consumo em código. Bling: zero
evidência neste repositório.

### 7. Rotação/revogação de credencial

**Confirmado: não existe.** Grep por
`revoke|rotat|expira|refresh_token|refreshToken` não retorna nenhuma
implementação real — só prosa aspiracional em SPEC.md (ex.: versionamento
de binding da Skill 22, que é sobre tenant/actor, não sobre credencial
de provider) e matches não-relacionados (TTL de sessão/dedupe).
`INSTAGRAM_PAGE_ACCESS_TOKEN` é token de página de longa duração sem
lógica de refresh — se expirar, o único sintoma é erro lançado no
momento do envio.

### 8. Health/status de integração hoje

Parcial e inconsistente:
- `src/app/api/health/route.ts` (real, em produção): checa presença
  (booleano, nunca vaza valor) de `SHOPEE_*`/`ZAPI_*`/`OPENAI_API_KEY`/
  `SUPABASE_*`, mais uma query trivial real no Supabase (`products`
  count) pra confirmar conexão viva. **Não checa** Windsor, Instagram
  Graph nem Mercado Livre.
- `src/lib/concierge/visualHealth.ts` (real): janela rolante de 10min
  no Supabase rastreando taxa de falha do OpenAI vision-compare, pra
  detectar degradação sistêmica (rate limit/chave revogada) vs. falha
  isolada — só liga um "modo seguro", nunca decide lógica de negócio
  por request. É o sinal de saúde mais sofisticado do repo, mas
  específico da OpenAI e heurístico (não é ping direto de capability).
- `src/lib/admin/linkHealth.ts`: classifica saúde de **link**
  (morto/bloqueado/timeout) a partir de `status_code` já registrado —
  não é ping de provider.
- **Sem health check nenhum**: Z-API (sem ping de instância WhatsApp
  conectada), Windsor.ai (sem check de conectividade/auth
  independente da chamada de publicação real), Instagram Graph DM,
  Mercado Livre.

### 9. Secrets vazando em contratos/tipos de domínio

**Nenhuma violação encontrada em código real** — isso já é força
estrutural real, não só aspiracional. Grep por respostas JSON/logs
vazando `apiKey|token|secret|password|credential` retorna zero hits
reais (só um falso-positivo de label de erro). `health/route.ts`
retorna só booleanos por design; service-role key do Supabase nunca é
logada nem retornada.

**Onde já existe disciplina deliberada em contrato (SPEC, não código
ainda)**: Skill 10 (seção "## Secrets", linhas 735-741) —
`VideoPromptArtifact` carrega `providerProfileKey/version/hash`,
`providerKey`, `modelKey`, `credentialScope` (`TENANT_BYO |
PLATFORM_MANAGED`) mas **nunca** texto plano de credencial — resolução
deferida pra "Skill 11/Skill 24 ... por handle seguro". **Gap real que
a Skill 24 precisa fechar**: nenhum contrato existente define o que o
"handle seguro" realmente É (FK pra tabela de credenciais? referência
de KMS? token opaco?) — isso ficou deliberadamente em aberto pras
Skills 10/11, esperando a Skill 24 formalizar. Nenhum protótipo de
mecanismo de "handle" existe em `src/`.

### O que não pôde ser verificado

- Nenhuma evidência de Bling neste repo (contradiz nota de sessão
  anterior — provavelmente pertence a outro projeto/repo, não assumir
  aqui sem reconfirmar).
- Arquivo `.env` real não foi lido (fora de escopo corretamente) — só
  nomes de variável e pontos de uso, nunca valores.
- Nenhuma evidência de código de verificação de capability em runtime
  em lugar nenhum — toda tipagem de "capability" (Skills 16/18) é
  design de contrato em SPEC, nunca lógica exercida.
- Nenhuma evidência de que a capacidade de leitura/métricas real do
  Windsor.ai (confirmada pela Skill 18) já tenha sido chamada por
  algum cron/rota em `src/app/api/cron/` — só existem `publish-product`
  e `source-deals`, nenhum consulta insights.

## Questões reais para o debate com o ChatGPT

1. Como a Skill 24 reconcilia os dois formatos de "capability
   snapshot" já congelados de forma independente pelas Skills 16
   (`MessagingAutomationCapabilitySnapshot`, ação de mensageria) e 18
   (`MetricProviderCapabilities`, granular por campo de métrica) —
   unifica num supertipo, mantém como projeções compatíveis de uma
   autoridade central, ou aceita como dois conceitos legitimamente
   distintos sob o mesmo guarda-chuva de Skill 24?
2. O que exatamente é o "handle seguro" que as Skills 10/11 já
   prometeram consumir da Skill 24 — uma referência opaca a linha de
   tabela de credenciais? Um caminho de KMS/secret manager (que hoje
   não existe no projeto — tudo é env var)? Como isso se relaciona
   com a realidade real de hoje (zero secret manager, zero tabela de
   credencial, só env vars lidas direto)?
3. Como a Skill 24 modela "conta/perfil de provider" quando hoje isso
   é 100% hardcoded por env var (inclusive um caso de instância
   Z-API física compartilhada com projeto não-relacionado por decisão
   humana) — sem inventar multi-conta que não existe, mas deixando a
   porta aberta pro dia em que existir?
4. Dado que zero verificação de capability acontece em runtime hoje
   (toda chamada assume "credencial presente = funciona", só falha
   reativamente), a Skill 24 V1 formaliza um contrato de capability
   verification sem implementá-lo (mesma postura NOT_IMPLEMENTED das
   Skills 22/23), ou isso é greenfield demais até pra contrato?
5. Rotação/revogação de credencial não existe hoje em lugar nenhum
   (nem o incidente real do vazamento parcial do `MERCADOLIVRE_APP_SECRET`
   gerou automação). A Skill 24 V1 assume postura igual à Skill 23
   ("teto sem crédito real" → aqui seria "handle sem KMS real"), ou
   isso fica fora de escopo da V1 completamente?
6. Cabe fechar em rodada única condensada como a Skill 22 (aspiracional
   pura), ou a superfície de compromisso real já existente (8 Skills
   aprovadas, 2 tipos de capability snapshot já congelados, handle
   seguro já prometido por 2 Skills) justifica 2 rodadas como a
   Skill 23 teve?

## Rodada 1 — decisões e contratos (debate com ChatGPT, 2026-09-18)

**Decisão de escopo**: **2 rodadas compactas**, como a Skill 23 — não
por volume de feature, mas porque 8 Skills já dependem dela e não é
possível "unificar" contratos antigos de um jeito que quebre hashes
já aprovados.

### Garantia central (proposta, congelada após rodada 1)

A Skill 24 é a autoridade para vincular um tenant a uma integração
externa, identificar qual conta/recurso do provider pertence àquele
tenant, fornecer referências opacas e seguras para credenciais e
materializar evidência versionada sobre capabilities realmente
disponíveis. Ela **nunca** expõe segredo aos contratos de domínio,
**nunca** considera integração configurada como capability comprovada,
e **nunca** substitui as decisões semânticas específicas que pertencem
às Skills consumidoras.

Divisão de autoridade entre as 4 Skills de infraestrutura:

```text
Skill 22 → quem é o tenant/ator
Skill 23 → pode gastar/consumir quota?
Skill 24 → qual integração/provider account pertence ao tenant?
           qual credential handle pode ser resolvido?
           quais capabilities possuem evidência real?
           qual estado/health da integração?
Skill 25 → segurança/auditoria transversal
```

### Decisões fundacionais (rodada 1)

1. **Não fundir os snapshots da Skill 16 e Skill 18 — o ponto mais
   importante da rodada.** `MessagingAutomationCapabilitySnapshot`
   (Skill 16) e `MetricProviderCapabilities` (Skill 18) são contratos
   de domínio, não duplicatas acidentais — nenhum dos dois é alterado.
   A Skill 24 fica **abaixo** desses snapshots:

   ```text
                      Skill 24
          IntegrationCapabilityEvidence
                  /             \
                 /               \
       Skill16 projection    Skill18 projection
       Messaging...          MetricProvider...
   ```

   `Skill24 capability evidence ≠ MessagingAutomationCapabilitySnapshot
   ≠ MetricProviderCapabilities`. Os hashes anteriores ficam intactos.
2. **Um snapshot genérico único seria ruim** — os status já têm
   semânticas diferentes. Skill 16 tem `TESTER_ONLY`/
   `BLOCKED_BY_ACCOUNT_REQUIREMENT` (restrições operacionais); Skill 18
   tem `PARTIALLY_VERIFIED` (nível de verificação). São dimensões
   diferentes — por isso a Skill 24 separa **verification status** de
   **restriction** como dois eixos independentes (contratos abaixo).
3. **Skill 24 não decide como as Skills consumidoras mapeiam seus
   próprios enums.** Ex.: Skill 24 registra
   `instagram.messaging.send_dm: verification=VERIFIED,
   restriction=TESTER_ONLY` → Skill 16 materializa
   `MessagingCapabilityStatus=TESTER_ONLY`. Skill 24 registra
   `instagram.metrics.some_metric: verification=PARTIALLY_VERIFIED` →
   Skill 18 preserva `PARTIALLY_VERIFIED`. **Skill 24 fornece fatos de
   integração; a Skill consumidora mantém sua própria semântica.**
4. **Capability precisa ser namespaced, nunca um enum global.**
   Convenção `provider.domain.action`: `instagram.messaging.send_dm`,
   `instagram.metrics.media_views`, `shopee.affiliate.generate_short_link`,
   `windsor.instagram.publish_image`, `zapi.whatsapp.send_text`,
   `openai.responses.create`, `supabase.data.read`. Contrato usa
   `capabilityKey: string` com normalização/versionamento — evita
   alterar a Skill 24 toda vez que aparece um novo provider.
5. **Evidência de capability precisa de provenance, nunca um status
   nu.** `status=VERIFIED` sozinho é inaceitável — precisa de
   `CapabilityEvidenceBasis` (contratos abaixo). Regra central: **código
   existe ≠ capability comprovada; credential existe ≠ capability
   comprovada; documentação diz que existe ≠ nossa conta está
   autorizada.**
6. **Três dimensões diferentes: configured, healthy, capable.**
   Precisamos impedir o raciocínio "`INSTAGRAM_PAGE_ACCESS_TOKEN`
   existe → Instagram está funcionando → pode publicar vídeo". São 3
   dimensões: **Integration binding** (existe/configurado?),
   **Integration health** (autenticação/conectividade funcionando?),
   **Capability** (aquela operação específica está disponível?). Uma
   integração pode estar `ACTIVE + HEALTHY` e ainda ter
   `video.publish = NOT_IMPLEMENTED`.
7. **Contrato principal é `IntegrationBinding`, nunca env var direta.**
   `Tenant → IntegrationBinding { providerKey, provider account/resource
   ref, credentialHandleRef, lifecycle status, resource isolation,
   capability evidence }`. Nunca `tenant → env vars diretamente`.
8. **Provider account/resource precisa ser explícito.** Hoje é conta
   única hardcoded — a Skill 24 formaliza isso como `ProviderResourceRef`
   (contrato abaixo), distinguindo, por exemplo, Instagram app vs.
   Instagram page/account vs. Z-API instance vs. Shopee affiliate
   account vs. Supabase project.
9. **Z-API compartilhada precisa aparecer no modelo.** O fato de a
   mesma instância física estar sendo usada por outro projeto
   (BancaZAP) é relevante — vira `resourceIsolation =
   SHARED_EXTERNAL_RESOURCE`. Não precisa bloquear automaticamente o
   MVP single-tenant, mas deve aparecer como restrição/risk evidence.
   Num SaaS futuro, fail-closed por default para shared resources até
   policy explícita permitir.
10. **O "handle seguro" das Skills 10/11 nasce aqui.** Nenhuma Skill
    recebe `OPENAI_API_KEY` ou `process.env.X` em contrato — só
    `IntegrationCredentialHandleRef` opaco, sem secret/token/API key/
    nome de env var/senha.
11. **Handle estável; a credencial concreta é resolvida no último
    momento.** Fluxo: `Skill10/11 → IntegrationCredentialHandleRef →
    (imediatamente antes da chamada externa) → Skill24 credential
    resolver → versão ativa da credencial → secret apenas em memória →
    provider adapter`. Isso permite rotação futura sem reescrever Jobs
    antigos — nunca prender o Job à versão física do secret cedo
    demais.
12. **Registrar qual revisão foi usada, sem registrar o segredo.**
    `CredentialResolutionRecord { credentialHandleId,
    credentialRevisionId, resolvedAt, resolutionHash }` — audita "qual
    revisão de credencial assinou essa chamada?", nunca "qual era a
    chave?".
13. **Env vars atuais viram só um adapter de credential resolution,
    não o contrato.** `process.env.*` hoje é implementação, não
    contrato. Runtime inicial: `ENV_BACKED_CREDENTIAL_RESOLVER`
    resolve o handle pros env vars atuais; depois Secrets Manager/
    Vault/Supabase Vault podem substituir o resolver **sem mudar
    Skills 10/11/16/17**.
14. **Rotation/revocation precisa existir no contrato mesmo sem
    runtime hoje.** Mínimo: `ACTIVE`/`SUPERSEDED`/`REVOKED`. Credencial
    revogada nunca pode ser resolvida para nova chamada; chamada
    histórica continua apontando pra revisão que efetivamente usou.
15. **Integration lifecycle separado**: `CONFIGURED`/`ACTIVE`/
    `SUSPENDED`/`DISABLED`/`REVOKED`. `CONFIGURED` significa "sabemos
    como localizar/configurar a integração" — nunca "está funcionando".
16. **Health é separado do lifecycle**: `HEALTHY`/`DEGRADED`/
    `UNAVAILABLE`/`UNKNOWN`. Health muda frequentemente e é estado
    operacional; capability snapshot/evidence continua versionado.
17. **Falha reativa não pode continuar sendo o único detector.** Hoje:
    `call provider → dá erro → descobrimos que não podia`. Skill 24
    deve permitir `required capability → resolve capability evidence →
    verifica restrições → só então chamada`. Isso não elimina falhas
    reais de provider, mas remove a falsa suposição arquitetural.
18. **Capability check não substitui a resposta real do provider em
    runtime.** Mesmo `VERIFIED` significa "existe evidência
    suficientemente recente segundo a policy" — nunca "a próxima
    chamada certamente terá sucesso".
19. **Capability precisa de freshness.** Sem isso, um snapshot de 6
    meses atrás pareceria atual. `observedAt` + `validUntil?` — Skill 24
    fornece a idade/evidência; a Skill consumidora decide se precisa
    de revalidação.
20. **Seis providers reais confirmados** (só com base na auditoria
    deste repo): Shopee, Z-API, Instagram Graph, Windsor.ai, OpenAI,
    Supabase. Só esses são tratados como integrações reais atuais.
21. **Mercado Livre**: separa "credential/config evidence exists" de
    "active consumed integration". Hoje: `provider=Mercado Livre,
    binding/config may exist, runtime consumer=none,
    price-comparison capability=unsupported/dead-end`. **Não é**
    chamada de integração ativa do pipeline.
22. **Bling — rigidez deliberada.** A auditoria deste repo encontrou
    **zero evidence**. A Skill 24 deste projeto **não registra Bling
    como integração existente**. A nota de outra sessão/projeto **não
    prevalece** sobre o repositório auditado. Se depois aparecer
    implementação real → nova auditoria → adiciona binding/provider.
23. **Supabase merece distinção, mas continua na Skill 24** — é
    provider externo com credencial, project identity e capabilities.
    Mas a Skill 24 **não** vira proxy pra todas as queries Supabase:
    resolve binding/credential handle/health/capability metadata; o
    código de dados continua onde pertence.
24. **Mesmo raciocínio para OpenAI** — Skill 24 não vira
    `openaiClient.chat(...)` central. Fornece qual integração/
    credential handle/capability/status; o adapter da Skill específica
    executa.
25. **8 dependências convergem pra 3-4 APIs centrais**:
    `resolveIntegrationBinding()`, `resolveCredentialHandle()`,
    `resolveCapabilityEvidence()`, talvez `resolveIntegrationHealth()`
    — esse é o núcleo real da Skill 24.
26. **Cross-tenant falha fechado, sempre.** Toda binding tem
    `tenantId=T`; qualquer Skill executando com
    `TrustedTenantContext.tenantId ≠ T` recebe fatal/block. Nem
    provider account ID igual permite reutilização cross-tenant.
27. **Conta única atual vira binding explícita do tenant único.** Hoje:
    single tenant + single provider account + env vars. No contrato:
    `Tenant T1 → IntegrationBinding Shopee #1 → IntegrationBinding
    Instagram #1 → IntegrationBinding Z-API #1 → ...` — ainda pode ser
    tudo config-based, não precisa criar banco agora.
28. **Sem migrations nesta fase** — assim como Skills 22/23:
    `integration_bindings`/`credential_sets`/`capability_snapshots`
    continuam `NOT_IMPLEMENTED`. SPEC primeiro; runtime inicial pode
    ser um registry configurado.
29. **O que a Skill 24 NÃO faz** (tabela de ownership): não autentica
    usuário (Skill 22); não aprova gasto (Skill 23); não faz approval
    humano (Skill 03); não publica (Skill 17); não manda DM (Skill 16);
    não coleta métrica (Skill 18); não analisa (Skill 19); não gera
    relatório (Skill 21). Ela resolve a infraestrutura necessária pra
    essas operações.
30. **Decisão congelada sobre o conflito Skill 16 × Skill 18**
    (texto literal pro SPEC): *"Os capability snapshots já definidos
    por Skills 16 e 18 permanecem canônicos dentro de seus respectivos
    domínios. Skill 24 não os substitui nem redefine. Skill 24
    materializa fatos/evidências de integração em uma camada inferior;
    cada Skill consumidora produz sua própria projeção de capability
    segundo sua semântica já aprovada."*
31. **Decisão congelada sobre credential handles** (texto literal pro
    SPEC): *"Nenhuma Skill recebe material secreto como parte de um
    contrato persistível. Consumers recebem apenas
    `IntegrationCredentialHandleRef`. Material secreto é resolvido no
    último boundary possível por um resolver confiável da Skill 24 e
    nunca entra em Job payload, hash canônico, log ou artifact de
    domínio."* Isso fecha a promessa das Skills 10/11.
32. **Fronteira com a futura Skill 25**: Skill 25 audita e aplica
    segurança transversal (controles, detecção de exposição, policies
    transversais), mas **ownership da credencial continua Skill 24**
    (lifecycle/handle/resolution). Senão teríamos ownership quebrado.

### Contratos centrais (rodada 1)

```typescript
type IntegrationCapabilityVerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED'
  | 'UNSUPPORTED'
  | 'NOT_IMPLEMENTED';

type IntegrationCapabilityRestriction =
  | 'TESTER_ONLY'
  | 'ACCOUNT_REQUIREMENT_BLOCKED'
  | 'PERMISSION_NOT_GRANTED'
  | 'ACCOUNT_NOT_AUTHORIZED'
  | 'SHARED_PROVIDER_RESOURCE'
  | 'OTHER_VERIFIED_RESTRICTION';

type CapabilityEvidenceBasis =
  | 'PRODUCTION_OBSERVED'
  | 'TEST_OBSERVED'
  | 'PROVIDER_SCHEMA_OBSERVED'
  | 'PROVIDER_DOCUMENTATION_ONLY'
  | 'REPOSITORY_IMPLEMENTATION_ONLY'
  | 'MANUAL_VERIFICATION';

type IntegrationCapabilityEvidence = {
  integrationCapabilityEvidenceId: string;
  tenantId: string;

  integrationBindingId: string;
  integrationBindingHash: string;

  capabilityKey: string; // namespaced: "provider.domain.action"

  verification: IntegrationCapabilityVerificationStatus;
  restrictions: IntegrationCapabilityRestriction[];
  evidenceBasis: CapabilityEvidenceBasis;

  observedAt: string;
  validUntil?: string;

  evidenceHash: string;
};
// hash: INTEGRATION_CAPABILITY_EVIDENCE_V1
// Nunca substitui MessagingAutomationCapabilitySnapshot (Skill16) nem
// MetricProviderCapabilities (Skill18) — cada Skill consumidora
// projeta este fato pra sua própria semântica já aprovada.

type ProviderResourceKind =
  | 'ACCOUNT'
  | 'PAGE'
  | 'INSTANCE'
  | 'APP'
  | 'PROJECT'
  | 'WORKSPACE'
  | 'OTHER';

type ProviderResourceRef = {
  providerKey: string;
  providerResourceId: string;
  resourceKind: ProviderResourceKind;
};
// Sem segredo. Distingue, ex.: Instagram app vs. Instagram page/
// account vs. Z-API instance vs. Shopee affiliate account vs.
// Supabase project.

type ProviderResourceIsolation =
  | 'DEDICATED'
  | 'SHARED_EXTERNAL_RESOURCE' // ex.: Z-API compartilhada com BancaZAP
  | 'UNKNOWN';

type IntegrationLifecycleStatus =
  | 'CONFIGURED' // sabemos localizar/configurar — NÃO "está funcionando"
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DISABLED'
  | 'REVOKED';

type IntegrationHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

type IntegrationBinding = {
  integrationBindingId: string;
  tenantId: string;

  providerKey: string;
  providerResource: ProviderResourceRef;
  resourceIsolation: ProviderResourceIsolation;

  credentialHandleRef: IntegrationCredentialHandleRef;

  bindingHash: string;
  createdAt: string;
};
// hash: INTEGRATION_BINDING_V1
// Tenant → IntegrationBinding — nunca "tenant → env vars diretamente".
// PATCH (rodada 2): lifecycleStatus/healthStatus/updatedAt saíram
// deste tipo imutável — identidade/configuração hasheada nunca mistura
// campo mutável. Estado de runtime vive em IntegrationBindingRuntimeState
// (rodada 2, mutável, sem hash integral).

type IntegrationCredentialHandleRef = {
  authority: 'SKILL24';

  integrationBindingId: string;
  integrationBindingHash: string;

  credentialHandleId: string;
  handleHash: string;
};
// hash: INTEGRATION_CREDENTIAL_HANDLE_REF_V1
// Nunca contém: secret, token, API key, nome de env var, password.
// PATCH (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18):
// a linha original aqui dizia "Consumido por Skills 10/11/16/17" — essa
// era exatamente a promessa que o achado S15 do Fable expôs como nunca
// conectada (nenhuma das 4 Skills tinha o campo de fato). Corrigido:
// consumido só por Skills 11/16/17 (side effects autenticados reais).
// Skill 10 é planejamento (VideoProviderTarget) e NUNCA recebe este
// handle — consome só IntegrationBinding/IntegrationCapabilityEvidence
// pra targeting. Ver "Credential-handle consumption boundary" abaixo.
// Nunca aparece process.env.X ou OPENAI_API_KEY em contrato de domínio.

type CredentialRevisionRef = {
  credentialHandleId: string;
  credentialRevisionId: string;
  supersedesRevisionId?: string;
  createdAt: string;
};
// Identidade imutável da revisão. Credencial REVOKED nunca pode ser
// resolvida para nova chamada; chamada histórica continua apontando
// pra revisão que usou de fato.
// PATCH (rodada 2): o campo `status` (3 estados) saiu deste tipo
// imutável. Estado de runtime (5 estados: STAGED/ACTIVE/SUPERSEDED/
// REVOKED/INVALID) vive em CredentialRevisionLifecycleState +
// CredentialRevisionRuntimeState (rodada 2, mutável, sem hash integral).

type CredentialResolutionRecord = {
  credentialResolutionRecordId: string;
  tenantId: string;

  credentialHandleId: string;
  credentialRevisionId: string;

  resolvedAt: string;
  resolutionHash: string;
};
// hash: CREDENTIAL_RESOLUTION_RECORD_V1
// Audita "qual revisão assinou essa chamada?" — NUNCA persiste "qual
// era a chave?". Secret existe só em memória no boundary de resolução.
```

**Fluxo de resolução de credencial** (nunca prende o Job à versão
física do secret cedo demais):

```text
Skill10/11 (contrato) → IntegrationCredentialHandleRef
  ↓ (imediatamente antes da chamada externa)
Skill24 credential resolver → versão ativa da credencial
  ↓
secret apenas em memória → provider adapter
```

Runtime inicial: `ENV_BACKED_CREDENTIAL_RESOLVER` resolve o handle
pros env vars atuais de hoje — sem migration, sem tabela nova. Depois,
Secrets Manager/Vault/Supabase Vault podem substituir o resolver **sem
mudar Skills 10/11/16/17**, porque elas só conhecem o handle.

**APIs centrais que os 8 consumidores convergem** (núcleo real da
Skill 24): `resolveIntegrationBinding()`, `resolveCredentialHandle()`,
`resolveCapabilityEvidence()`, e possivelmente
`resolveIntegrationHealth()`.

### Fechamentos da rodada 1

O que fecha na rodada 1: `IntegrationBinding`, `ProviderResourceRef`,
`ProviderResourceIsolation`, `IntegrationCredentialHandleRef`,
`CredentialRevisionRef`, `CredentialResolutionRecord`,
`IntegrationCapabilityEvidence` (verification status + restrictions +
evidence basis), `IntegrationHealthObservation` (conceito — contrato
completo na rodada 2), binding/status lifecycle, interfaces de
resolução, e a integração explícita com os snapshots das Skills 16/18
**sem alterá-los**.

**Sem migrations nesta fase** — `integration_bindings`/
`credential_sets`/`capability_snapshots` continuam `NOT_IMPLEMENTED`,
mesmo padrão das Skills 22/23.

## Rodada 2 — state machine, rotation, erros, testes (debate com ChatGPT, 2026-09-18)

### Patch de compatibilidade ao bloco 1 (não reabre os hashes da rodada 1)

**Guardrail obrigatório dado que rotação/revogação agora existem**:
identidade/configuração imutável (hasheada) nunca pode misturar campos
mutáveis. O `IntegrationBinding` e o `CredentialRevisionRef` da
rodada 1 continham `lifecycleStatus`/`healthStatus`/`status` como
campos dentro do tipo hasheado — isso é corrigido agora, **sem mudar
os hashes `INTEGRATION_BINDING_V1`/`INTEGRATION_CREDENTIAL_HANDLE_REF_V1`
em si**, apenas removendo os campos mutáveis do escopo do hash e
movendo-os para tipos de runtime state separados (`Mutável. Sem hash
integral.`):

- `IntegrationBinding` (rodada 1) mantém só campos imutáveis:
  `integrationBindingId`, `tenantId`, `providerKey`, `providerResource`,
  `resourceIsolation`, `credentialHandleRef`, `bindingHash`,
  `createdAt`. Os campos `lifecycleStatus`/`healthStatus` saem do tipo
  hasheado e passam a viver em `IntegrationBindingRuntimeState`
  (contrato abaixo) — `updatedAt` também sai do tipo imutável.
- `CredentialRevisionStatus` (3 estados, rodada 1) é substituído por
  `CredentialRevisionLifecycleState` (5 estados: `STAGED`/`ACTIVE`/
  `SUPERSEDED`/`REVOKED`/`INVALID`), vivendo em
  `CredentialRevisionRuntimeState` (mutável), separado de
  `CredentialRevisionRef` (identidade imutável).

### Decisões fundacionais (rodada 2)

1. **Binding resolution nunca é "pega a primeira configuração
   encontrada".** Três seletores explícitos:
   `EXACT_BINDING` (id+hash exatos), `BINDING_KEY` (chave lógica), e
   `UNIQUE_ACTIVE_PROVIDER_BINDING` (existe pro cenário single-account
   atual, mas significa literalmente "deve existir exatamente um
   binding `ACTIVE` daquele provider pro tenant" — se houver dois,
   `AMBIGUOUS`, nunca "pega o primeiro").
2. **Replay de binding resolution é idempotente e nunca troca de
   conta silenciosamente.** Unicidade `(tenantId,
   resolutionRequestKey)`. Mesma key + mesmo request → mesma
   resolution. Mesma key + conteúdo diferente → `FATAL_ERROR`.
3. **Provider mismatch ≠ account mismatch, mas ambos são fatais.**
   `expected SHOPEE, binding Z_API → fatal`. `expected Instagram Page
   X, binding resolve Page Y → fatal`. Nunca usar "é Instagram também"
   como equivalência.
4. **Identidade de recurso reportada pelo provider é comparada, nunca
   aceita cegamente.** Quando o provider permite consultar sua
   identidade real e ela diverge do `ProviderResourceRef` esperado →
   `INTEGRATION_PROVIDER_RESOURCE_MISMATCH`. **Nunca mutamos
   automaticamente o binding** para o que o provider respondeu.
   Quando não dá pra verificar, não inventamos confirmação — a
   evidence de identidade fica `UNVERIFIED`.
5. **Rotação segue "stage → valida → ativa atomicamente", nunca
   substitui direto.** Fluxo: `current ACTIVE R1 → stage R2 → valida
   R2 quando possível → ativação atômica → R2 ACTIVE, R1 SUPERSEDED`.
   Se validação de R2 falhar: `R2 INVALID`, `R1 continua ACTIVE` —
   nunca destruímos a credencial funcional antes de saber se a nova é
   utilizável. Ativação atômica: `check handle version → new revision
   ACTIVE → previous ACTIVE vira SUPERSEDED → handle.activeRevisionId
   atualiza → increment version` — duas rotações concorrentes não
   podem ambas acreditar que ativaram a revisão atual.
6. **Revogação é diferente de supersession, e nunca tem fallback
   automático.** `SUPERSEDED` = não usada em novas resoluções (mas
   histórico preservado). `REVOKED` = explicitamente proibida.
   Revogar a revisão ativa **nunca** faz fallback automático pra
   revisão superseded — uma nova revisão precisa ser ativada
   explicitamente. Importante em incidente de segurança.
7. **Validação indisponível ≠ válida.** `VALIDATION_UNAVAILABLE` não
   é `VALIDATED`. A policy de ativação pode aceitar isso pra
   providers sem probe seguro, mas o fato continua registrado
   corretamente.
8. **Secret nunca entra no domínio, em NENHUMA forma — nem hash
   derivado.** Proibido em: Job payload, Attempt, `IntegrationBinding`,
   `CredentialRevisionRef`, `CredentialResolutionRecord`, hash
   canônico, `AuditEvent`, logs, error details, `ReportSnapshot`.
   **Nem `secretHash = sha256(API_KEY)` como identidade canônica** —
   isso ainda é material derivado do segredo.
9. **Rotação depois de um Job já criado nunca exige reescrever o
   Job.** Job antigo aponta pro `credential handle`, nunca pro secret
   físico — nova execução futura resolve a nova revisão `ACTIVE` sem
   reescrever Job. Mas a auditoria da chamada guarda a revisão exata
   usada, via `IntegrationUseContext` (contrato abaixo).
10. **`IntegrationUseContext` não é prova de side effect.** Significa
    apenas "imediatamente antes da tentativa externa, esta
    integração/conta/capability/revisão era a combinação autorizada"
    — nunca "provider recebeu request". Essa verdade continua nas
    Skills executoras.
11. **Revogação após provider request iniciado não reescreve o
    passado.** Se o use context foi validamente criado e a rede já
    começou, revogação posterior ≠ prova de que a chamada não
    aconteceu — ela só bloqueia novas resoluções/operações. Side-effect
    reconciliation continua com Skill 02/11/17/etc.
12. **Skill 24 não decide retry, mesmo com credencial nova.** Se
    Skill 11 está em `external effect UNKNOWN`, Skill 24 não pode
    concluir "tem credencial nova, tente novamente" — Skill 11/02
    continuam autoridades de side-effect safety.
13. **Capability freshness não é hardcoded globalmente.** O consumer
    ou policy informa `maximumEvidenceAge` adequado à operação; a
    Skill 24 responde `FRESH`/`STALE` — nunca inventa que toda
    capability vale 24h fixas.
14. **Se já existe evidence suficientemente fresca, não chama o
    provider.** `REFRESH_NOT_REQUIRED` — não gastamos quota por
    ritual.
15. **Probe destrutivo é proibido, sempre.** Nunca verificar "Instagram
    consegue publicar?" criando um post real, nem "Z-API consegue
    mandar?" mandando mensagem real. Se não existe probe seguro,
    capability permanece baseada na evidence disponível, ou
    `UNVERIFIED`.
16. **Probe seguro pode consumir quota — sem bypass.** Se o safe probe
    ainda usa recurso contabilizado: `Skill24 → Skill23
    PROVIDER_OPERATION authorization → probe`. Skill 24 não ganha
    bypass só porque "é só health check".
17. **Evidence basis continua factual, nunca promovido por
    conveniência.** `REPOSITORY_IMPLEMENTATION_ONLY` nunca vira
    `VERIFIED` só porque o adapter existe. Mesma coisa pra
    `PROVIDER_DOCUMENTATION_ONLY` quando nossa conta/permissão ainda
    não foi comprovada.
18. **Projeções pras Skills 16/18 confirmadas, sem redefinir nenhum
    hash delas.** Skill 24 `verification=VERIFIED, restriction=
    TESTER_ONLY` → Skill 16 continua produzindo
    `MessagingCapabilityStatus=TESTER_ONLY` segundo sua mapping
    policy própria. Skill 24 `verification=PARTIALLY_VERIFIED` →
    Skill 18 materializa `MetricReadCapabilityStatus=PARTIALLY_VERIFIED`
    sem Skill 24 redefinir esse enum. **Skill 24 nunca materializa
    snapshot da Skill 16/18 por conta própria** — ownership permanece:
    Skill 24 → integration evidence; Skill 16 →
    `MessagingAutomationCapabilitySnapshot`; Skill 18 →
    `MetricProviderCapabilities`.
19. **Health/capability/configuração são 3 dimensões independentes,
    sempre.** `HEALTHY` não implica capability `VERIFIED` — uma API
    pode autenticar perfeitamente e `video.publish=NOT_IMPLEMENTED`
    sem contradição. Sem probe seguro, resultado legítimo é `UNKNOWN
    (reason=SAFE_PROBE_UNAVAILABLE)`, nunca `HEALTHY` por ausência de
    erro.
20. **`UNAVAILABLE` nunca revoga credencial automaticamente, nem
    `401`/`403`.** Provider outage não significa credential
    compromised — health pode degradar sem alterar credential
    lifecycle. `401`/`403` podem gerar `AUTHENTICATION_FAILED` e
    bloquear novas operações conforme policy, mas Skill 24 **nunca**
    inventa nova chave nem reativa chave velha sozinha.
21. **Runtime business failure pode alimentar health, mas nunca
    reescreve capability evidence retroativamente.** Se Skill 17
    recebe um provider error confiável, isso pode originar nova
    `IntegrationHealthObservation` — mas não altera capability
    evidence já registrada anteriormente.
22. **Z-API compartilhada continua explicitamente marcada, sempre.**
    `resourceIsolation=SHARED_EXTERNAL_RESOURCE` no binding
    correspondente — fato arquitetural, nunca escondido.
23. **Shared resource não é automaticamente cross-tenant safe.** No
    futuro, se dois tenants apontarem pra mesma instância física:
    default → `BLOCK`, salvo policy explícita de compartilhamento.
    Nunca concluir "é a mesma Z-API, então todos podem usar".
24. **Expected resource, quando fornecido, é sempre validado contra a
    resolução real.** Ex. Skill 17: `publicationTarget Instagram
    account A`, resolution retorna `account B` → `FATAL`. Nunca
    "publica na conta que estiver configurada".
25. **Boundary de uso da integração exige 5 autoridades presentes,
    cada uma separada.** Antes de provider network: `TrustedTenantContext
    + IntegrationBindingResolution + IntegrationCapabilityResolution +
    CredentialResolutionRecord + IntegrationUseContext + Skill23
    authorization quando aplicável`.
26. **Revalidação point-in-time imediatamente antes do secret.**
    `binding ainda ACTIVE? revision ainda usable? tenant ainda
    corresponde? provider/resource ainda corresponde? capability
    requirement ainda satisfeita?` — se não: sem secret, sem rede.
27. **Resolução de credencial e chamada de rede precisam ficar
    próximas no tempo.** Nunca "09:00 resolve secret, 16:00 faz
    provider call". `IntegrationUseContext.validUntil` pode impor
    janela curta conforme policy; se expirou, novo use context — isso
    **não** implica novo Job/Attempt, é só nova infraestrutura de
    integração, desde que a Skill executora considere a operação
    ainda segura.
28. **Idempotência do use context.** `(tenantId, useRequestKey)`.
    Mesma key + mesmas refs → mesmo contexto. Mesma key tentando
    trocar binding/provider account/credential revision/capability →
    conflito fatal.
29. **Binding resolution após retry nunca faz failover silencioso.**
    Mesmo resolution request → mesmo binding. Se o negócio quer
    explicitamente mudar conta/provider, isso é nova operação/request
    — a Skill executora precisa permitir isso explicitamente.
30. **Credential rotation nunca altera o binding; trocar provider
    resource sempre cria novo binding.** Binding aponta pro
    `credential handle` (estável); a revisão ativa muda — por isso os
    dois conceitos são separados. Trocar `Instagram Page A → Instagram
    Page B` não é "credential rotation", é nova identidade de
    integração — binding antigo fica histórico/revogado.
31. **Tabela factual final dos providers auditados** (mantida
    literalmente no SPEC):

    ```text
    Shopee          REAL / consumed
    Z-API           REAL / consumed / shared physical resource
    Instagram Graph REAL / consumed / capability restrictions exist
    Windsor.ai      REAL / consumed
    OpenAI          REAL / consumed
    Supabase        REAL / consumed

    Mercado Livre   credential evidence exists
                    no active src consumer
                    target price capability dead-end/unsupported

    Bling           NO EVIDENCE IN THIS REPOSITORY
    ```

    Memória de outra sessão/projeto **não** transforma Bling em
    integração desta codebase.

### Contratos centrais (rodada 2)

```typescript
type IntegrationBindingSelector =
  | { mode: 'EXACT_BINDING'; integrationBindingId: string; integrationBindingHash: string }
  | { mode: 'BINDING_KEY'; bindingKey: string }
  | { mode: 'UNIQUE_ACTIVE_PROVIDER_BINDING'; providerKey: string };

type IntegrationBindingResolutionRequest = {
  bindingResolutionRequestId: string;
  tenantId: string;
  resolutionRequestKey: string;
  trustedTenantContextHash: string;
  selector: IntegrationBindingSelector;
  expectedProviderKey: string;
  expectedProviderResource?: ProviderResourceRef;
  consumerSkillId: string;
  requestHash: string;
  requestedAt: string;
};
// hash: INTEGRATION_BINDING_RESOLUTION_REQUEST_V1

type IntegrationBindingResolution = {
  bindingResolutionId: string;
  tenantId: string;
  resolutionRequestHash: string;
  integrationBindingId: string;
  integrationBindingHash: string;
  providerKey: string;
  providerResource: ProviderResourceRef;
  providerResourceIsolation: ProviderResourceIsolation;
  credentialHandleRef: IntegrationCredentialHandleRef;
  bindingRuntimeVersion: number;
  resolutionHash: string;
  resolvedAt: string;
};
// hash: INTEGRATION_BINDING_RESOLUTION_V1

type IntegrationBindingResolutionRunState =
  | 'PREPARED'
  | 'VALIDATING_TENANT'
  | 'RESOLVING_BINDING'
  | 'VALIDATING_PROVIDER_RESOURCE'
  | 'RESOLVED' // congela o binding para aquela operação
  | 'COMPLETED'
  | 'CANCELLED';

// Patch de compatibilidade (ver acima): runtime state mutável,
// separado do IntegrationBinding imutável da rodada 1.
type IntegrationBindingRuntimeState = {
  integrationBindingId: string;
  tenantId: string;
  status: 'CONFIGURED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'REVOKED';
  version: number;
  updatedAt: string;
};
// Mutável. Sem hash integral.
// CONFIGURED = ainda não utilizável. ACTIVE = elegível. SUSPENDED =
// novas operações de negócio bloqueadas (mas health check, credential
// rotation ou diagnóstico administrativo podem operar sobre binding
// suspenso quando explicitamente autorizados). DISABLED = não
// utilizável. REVOKED = terminal para novas operações.
```

**PATCH (Ponto S1 — Provider Account Ingress, Parte B).** Bootstrap
específico pra resolver `TrustedTenantContext` a partir de ingress
externo (webhook de provider), quando ainda **não existe** tenant
confiável — por isso este request é deliberadamente mais fraco que
`IntegrationBindingResolutionRequest` (não carrega `tenantId` nem
`trustedTenantContextHash`, porque ainda não existem no momento em que
é emitido). `IntegrationBindingResolutionRequest.trustedTenantContextHash`
continua obrigatório, sem enfraquecimento — este novo tipo não o
substitui, é um mecanismo de bootstrap anterior a ele.

```typescript
type ProviderAccountIngressResolutionRequest = {
  providerAccountIngressResolutionRequestId: string;
  providerKey: string;
  providerAccountId: string; // identificador bruto vindo do provider, não hasheado ainda
  requestedAt: string;
};
// Efêmero — não é artefato de autorização, só o insumo pra resolução
// abaixo. Nunca persistido como prova de tenant.

type ProviderAccountIngressResolution = {
  providerAccountIngressResolutionId: string;
  tenantId: string;
  providerKey: string;
  providerAccountIdentityHash: string; // = CANONICAL_SERIALIZATION_V1 sobre ProviderResourceRef{providerKey, providerResourceId: providerAccountId, resourceKind:'ACCOUNT'}
  integrationBindingRef: {
    integrationBindingId: string;
    integrationBindingHash: string;
  };
  resolutionHash: string;
  resolvedAt: string;
};
// hash: PROVIDER_ACCOUNT_INGRESS_RESOLUTION_V1
```

Invariante de reverse-index: `(providerKey, providerAccountIdentityHash)
→ no máximo 1 IntegrationBinding ACTIVE`. 0 matches ou 2+ matches →
falha fechada com `INTEGRATION_PROVIDER_ACCOUNT_INGRESS_AMBIGUOUS`
(nunca "usa o mais recente"). Esta resolução sozinha **não** autoriza
nada — ela só localiza o tenant candidato; a Skill 22 exige, além
dela, `ingressAuthenticationEvidenceRef` batendo com o mesmo
provider/conta antes de emitir um `TrustedTenantContext` com
`source: 'PROVIDER_ACCOUNT_INGRESS'` (ver SPEC da Skill 22).

```typescript
type CredentialRevisionLifecycleState =
  | 'STAGED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'REVOKED'
  | 'INVALID';
// Somente uma revisão ACTIVE por handle.

type CredentialHandleRuntimeState = {
  credentialHandleId: string;
  tenantId: string;
  activeRevisionId?: string;
  version: number;
  updatedAt: string;
};

type CredentialRevisionRuntimeState = {
  credentialRevisionId: string;
  credentialHandleId: string;
  tenantId: string;
  state: CredentialRevisionLifecycleState;
  version: number;
  updatedAt: string;
};
// Nenhum contém segredo.

type CredentialLifecycleCommand = {
  credentialLifecycleCommandId: string;
  tenantId: string;
  lifecycleCommandKey: string;
  credentialHandleId: string;
  credentialHandleHash: string;
  action: 'ROTATE' | 'REVOKE';
  targetRevisionId?: string;
  commandHash: string;
  requestedAt: string;
};
// hash: CREDENTIAL_LIFECYCLE_COMMAND_V1 — rotação/revogação idempotentes.

type CredentialValidationEvidence = {
  credentialValidationEvidenceId: string;
  tenantId: string;
  credentialHandleId: string;
  credentialRevisionId: string;
  validationStatus: 'VALIDATED' | 'INVALID' | 'VALIDATION_UNAVAILABLE';
  validationBasis: 'SAFE_PROVIDER_PROBE' | 'LOCAL_CONFIGURATION_CHECK' | 'MANUAL_VERIFICATION';
  providerResourceRef?: ProviderResourceRef;
  evidenceHash: string;
  observedAt: string;
};
// hash: CREDENTIAL_VALIDATION_EVIDENCE_V1

type CredentialLifecycleTransition = {
  credentialLifecycleTransitionId: string;
  tenantId: string;
  credentialRevisionId: string;
  fromState: CredentialRevisionLifecycleState;
  toState: CredentialRevisionLifecycleState;
  reason:
    | 'STAGED_FOR_ROTATION'
    | 'VALIDATION_SUCCEEDED'
    | 'VALIDATION_FAILED'
    | 'ROTATION_ACTIVATED'
    | 'SUPERSEDED_BY_ROTATION'
    | 'EXPLICIT_REVOCATION';
  evidenceRefs: string[];
  versionBefore: number;
  versionAfter: number;
  transitionHash: string;
  transitionedAt: string;
};
// hash: CREDENTIAL_LIFECYCLE_TRANSITION_V1

type IntegrationUseContext = {
  integrationUseContextId: string;
  tenantId: string;
  useRequestKey: string;
  consumerSkillId: string;
  consumerOperationKey: string;
  bindingResolutionId: string;
  bindingResolutionHash: string;
  capabilityResolutionId: string;
  capabilityResolutionHash: string;
  credentialResolutionRecordId: string;
  credentialResolutionRecordHash: string;
  providerKey: string;
  providerResourceRef: ProviderResourceRef;
  validUntil?: string;
  useContextHash: string;
  createdAt: string;
};
// hash: INTEGRATION_USE_CONTEXT_V1
// Não é prova de side effect — só "esta combinação era autorizada
// imediatamente antes da tentativa externa".

type IntegrationCapabilityFreshness = 'FRESH' | 'STALE';

type IntegrationCapabilityResolutionStatus =
  | 'AVAILABLE'
  | 'RESTRICTED'
  | 'UNVERIFIED'
  | 'UNSUPPORTED'
  | 'NOT_IMPLEMENTED'
  | 'STALE';

type IntegrationCapabilityResolution = {
  integrationCapabilityResolutionId: string;
  tenantId: string;
  integrationBindingId: string;
  integrationBindingHash: string;
  capabilityKey: string;
  evidenceId?: string;
  evidenceHash?: string;
  verificationStatus: IntegrationCapabilityVerificationStatus;
  restrictions: IntegrationCapabilityRestriction[];
  freshness: IntegrationCapabilityFreshness;
  status: IntegrationCapabilityResolutionStatus;
  resolutionHash: string;
  resolvedAt: string;
};
// hash: INTEGRATION_CAPABILITY_RESOLUTION_V1

type IntegrationCapabilityRefreshRequest = {
  capabilityRefreshRequestId: string;
  tenantId: string;
  refreshRequestKey: string;
  integrationBindingId: string;
  integrationBindingHash: string;
  capabilityKey: string;
  probeMode: 'SAFE_NON_DESTRUCTIVE_ONLY';
  requestHash: string;
  requestedAt: string;
};
// hash: INTEGRATION_CAPABILITY_REFRESH_REQUEST_V1

type IntegrationCapabilityRefreshRunState =
  | 'PREPARED'
  | 'CHECKING_EXISTING_EVIDENCE'
  | 'PREPARING_SAFE_PROBE'
  | 'PROBING'
  | 'EVIDENCE_CAPTURED'
  | 'COMPLETED'
  | 'CANCELLED';

// IntegrationHealthStatus já definido na rodada 1 (linha ~562) —
// reutilizado aqui, não redeclarado.

type IntegrationHealthObservation = {
  integrationHealthObservationId: string;
  tenantId: string;
  integrationBindingId: string;
  integrationBindingHash: string;
  status: IntegrationHealthStatus;
  reason:
    | 'AUTHENTICATION_OK'
    | 'AUTHENTICATION_FAILED'
    | 'CONNECTIVITY_OK'
    | 'CONNECTIVITY_FAILED'
    | 'RATE_LIMITED'
    | 'PROVIDER_ERROR'
    | 'SAFE_PROBE_UNAVAILABLE';
  providerResourceRef: ProviderResourceRef;
  evidenceRefs: string[];
  observationHash: string;
  observedAt: string;
};
// hash: INTEGRATION_HEALTH_OBSERVATION_V1 — append-only.

type IntegrationHealthCheckRequest = {
  healthCheckRequestId: string;
  tenantId: string;
  healthCheckKey: string;
  integrationBindingId: string;
  integrationBindingHash: string;
  mode: 'SAFE_NON_DESTRUCTIVE_ONLY';
  requestHash: string;
  requestedAt: string;
};
// hash: INTEGRATION_HEALTH_CHECK_REQUEST_V1

type IntegrationHealthCheckRunState =
  | 'PREPARED'
  | 'VALIDATING_BINDING'
  | 'PREPARING_SAFE_PROBE'
  | 'PROBING'
  | 'OBSERVATION_CAPTURED'
  | 'COMPLETED'
  | 'CANCELLED';
```

**Runtime states mutáveis sem hash integral** (por natureza):
`IntegrationBindingRuntimeState`, `CredentialHandleRuntimeState`,
`CredentialRevisionRuntimeState`, `IntegrationBindingResolutionRun`,
`CredentialLifecycleRun`, `IntegrationCapabilityRefreshRun`,
`IntegrationHealthCheckRun`.

### Cadeia operacional final

```text
TrustedTenantContext
        ↓
IntegrationBindingResolution
        ↓
provider/resource exatos
        ↓
CapabilityResolution
        ↓
credential handle
        ↓
active credential revision
        ↓
CredentialResolutionRecord
        ↓
IntegrationUseContext
        ↓
Skill23 authorization quando aplicável
        ↓
provider adapter
        ↓
NETWORK
```

Separadamente: `capability refresh` / `health check` / `credential
validation` → somente safe probes → Skill 23 se houver quota/custo →
**nunca** business side effect só pra "testar".

### Credential-handle consumption boundary (Ponto S15, reparo transversal pós-revisão Fable, 2026-09-18)

> `IntegrationCredentialHandleRef` é consumido apenas por componentes
> que realizam operações externas autenticadas. Skill 10 consome
> `IntegrationBinding`/`IntegrationCapabilityEvidence` pra provider
> targeting, mas **não requer** acesso a credencial —
> `VideoProviderTarget` **nunca** contém `IntegrationCredentialHandleRef`
> (achado S15 do Fable: a promessa "consumido por Skills 10/11/16/17"
> nunca tinha sido conectada em nenhuma das 4 Skills — a correção não é
> forçar o handle em todo lugar, é corrigir a separação
> planning/execution). Skills 11, 16 e 17 DEVEM obter uma
> `IntegrationCredentialHandleRef` exata da Skill 24 antes de uma
> operação de rede autenticada. `credentialScope`/`providerProfileKey`
> descrevem requisitos — não são credenciais nem evidência de
> autorização. Material de credencial bruto nunca sai da fronteira de
> acesso a credencial da Skill 24.
>
> **Rotação de segredo**: o handle representa uma indireção lógica
> segura, não uma cópia versionada do segredo — `handle H → backing
> token v1` pode virar `handle H → backing token v2` sem invalidar
> artifacts imutáveis, desde que tenant/integration binding/credential
> scope/provider identity não tenham mudado. Novo handle só quando a
> identidade lógica da credencial muda de verdade (nova conta
> conectada, novo `IntegrationBinding`, provider profile diferente,
> scope incompatível), nunca só porque o token foi renovado.
>
> **Revalidação obrigatória**: mesmo com capability `SUPPORTED` decidida
> horas antes pela Skill 10, a Skill 11/16/17 revalida
> credencial/integração antes de cada chamada de rede (token pode
> expirar, conta pode desconectar, permissão pode ser revogada) — nunca
> "latest credential", sempre a partir do `IntegrationBinding` exato
> selecionado pra operação. `INTEGRATION_TENANT_MISMATCH`/
> `INTEGRATION_PROVIDER_MISMATCH`/`INTEGRATION_CREDENTIAL_HANDLE_MISMATCH`
> (já existentes na lista abaixo) cobrem os casos de handle
> tenant/binding/provider/scope incompatível — **0 `FATAL_ERROR` novos**
> neste ponto, os códigos genéricos já existentes já cobrem.

### Erros (rodada 2)

**21 `FATAL_ERROR`:**

```text
INTEGRATION_TENANT_MISMATCH
INTEGRATION_CROSS_TENANT_BINDING
INTEGRATION_BINDING_RESOLUTION_REPLAY_CONFLICT
INTEGRATION_BINDING_AMBIGUOUS
INTEGRATION_PROVIDER_ACCOUNT_INGRESS_AMBIGUOUS
INTEGRATION_BINDING_HASH_MISMATCH
INTEGRATION_PROVIDER_MISMATCH
INTEGRATION_PROVIDER_RESOURCE_MISMATCH
INTEGRATION_CREDENTIAL_HANDLE_MISMATCH
INTEGRATION_CREDENTIAL_REVISION_REPLAY_CONFLICT
INTEGRATION_CREDENTIAL_LIFECYCLE_REPLAY_CONFLICT
INTEGRATION_REVOKED_CREDENTIAL_USE_ATTEMPT
INTEGRATION_CREDENTIAL_SECRET_EXPOSURE_ATTEMPT
INTEGRATION_CAPABILITY_EVIDENCE_REPLAY_CONFLICT
INTEGRATION_CAPABILITY_RESOLUTION_CONFLICT
INTEGRATION_CAPABILITY_ESCALATION_ATTEMPT
INTEGRATION_HEALTH_EVIDENCE_REPLAY_CONFLICT
INTEGRATION_SHARED_RESOURCE_POLICY_BYPASS_ATTEMPT
INTEGRATION_USE_CONTEXT_REPLAY_CONFLICT
INTEGRATION_INVALID_STATE_TRANSITION
INTEGRATION_UNTRUSTED_BINDING_AUTHORITY_ATTEMPT
```

**`RETRYABLE_ERROR`:**

```text
INTEGRATION_BINDING_LOOKUP_TRANSIENT_ERROR
INTEGRATION_CREDENTIAL_RESOLVER_TRANSIENT_ERROR
INTEGRATION_CREDENTIAL_VALIDATION_TRANSIENT_ERROR
INTEGRATION_CAPABILITY_PROBE_TRANSIENT_ERROR
INTEGRATION_HEALTH_CHECK_TRANSIENT_ERROR
INTEGRATION_STATE_PERSISTENCE_TRANSIENT_ERROR
TRANSIENT_DATASTORE_ERROR
```

**`BLOCKED`:**

```text
INTEGRATION_BINDING_NOT_CONFIGURED
INTEGRATION_BINDING_NOT_ACTIVE
INTEGRATION_BINDING_SUSPENDED
INTEGRATION_BINDING_DISABLED
INTEGRATION_BINDING_REVOKED
INTEGRATION_CREDENTIAL_NOT_CONFIGURED
INTEGRATION_ACTIVE_CREDENTIAL_REVISION_MISSING
INTEGRATION_CREDENTIAL_REVOKED
INTEGRATION_CAPABILITY_UNVERIFIED
INTEGRATION_CAPABILITY_STALE
INTEGRATION_CAPABILITY_UNSUPPORTED
INTEGRATION_CAPABILITY_NOT_IMPLEMENTED
INTEGRATION_CAPABILITY_RESTRICTED
INTEGRATION_HEALTH_REQUIREMENT_NOT_MET
INTEGRATION_SHARED_RESOURCE_NOT_ALLOWED
```

**Domain results:**

```text
INTEGRATION_BINDING_ALREADY_RESOLVED
INTEGRATION_CREDENTIAL_ROTATION_COMPLETED
INTEGRATION_CREDENTIAL_REVOCATION_COMPLETED
INTEGRATION_CAPABILITY_REFRESH_NOT_REQUIRED
INTEGRATION_CAPABILITY_EVIDENCE_REFRESHED
INTEGRATION_SAFE_CAPABILITY_PROBE_UNAVAILABLE
INTEGRATION_HEALTH_OBSERVED
INTEGRATION_HEALTH_UNKNOWN
INTEGRATION_USE_CONTEXT_READY
```

### Observabilidade

- **Binding**: `tenantId`, `consumerSkillId`, `providerKey`,
  `bindingId`, `bindingRuntimeVersion`, `providerResourceKind`,
  `resourceIsolation`, `resolutionMode`, `resolutionOutcome`,
  `durationMs`, `errorCode?`. Evitar provider resource IDs como labels
  de métrica.
- **Credentials**: `credentialHandleId`, `credentialRevisionId`,
  `lifecycleState`, `rotationRequested`, `validationStatus`,
  `rotationActivated`, `revocationOccurred`, `resolutionSucceeded`,
  `errorCode?`. **Nunca secret.**
- **Capabilities**: `providerKey`, `capabilityKey`,
  `verificationStatus`, `restrictionCount`, `freshness`,
  `evidenceBasis`, `refreshPerformed`, `refreshOutcome`, `durationMs`.
- **Health**: `providerKey`, `healthStatus`, `healthReason`,
  `safeProbeAvailable`, `probePerformed`, `durationMs`.
- **Nunca logar**: API key, access token, refresh token, password,
  cookie, env var value, raw Authorization header, secret-derived
  fingerprint, provider response contendo credential material.
- **Métricas operacionais**: `integration_binding_resolution_total`,
  `integration_binding_resolution_blocked_total`,
  `integration_credential_rotation_total`,
  `integration_credential_revocation_total`,
  `integration_credential_resolution_failure_total`,
  `integration_capability_resolution_total`,
  `integration_capability_refresh_total`,
  `integration_capability_stale_total`,
  `integration_health_check_total`,
  `integration_health_unavailable_total`,
  `integration_provider_resource_mismatch_total`,
  `integration_cross_tenant_block_total`,
  `integration_secret_exposure_block_total`. **Nunca criar**
  `provider_roi`, `best_provider`, `conversion_per_integration`.
- **Audit events**: integration binding resolved; ambiguous binding
  blocked; cross-tenant binding blocked; provider resource mismatch
  detected; credential revision staged/validation completed/rotation
  activated/superseded/revoked; revoked credential use blocked;
  capability evidence refreshed; capability escalation attempt
  blocked; health observation captured; shared resource use blocked;
  secret exposure attempt blocked.

### 40 testes críticos

**1–5 · Binding resolution**
1. `EXACT_BINDING` resolve binding exato.
2. `BINDING_KEY` resolve apenas dentro do tenant.
3. `UNIQUE_ACTIVE_PROVIDER_BINDING` funciona com exatamente um binding
   `ACTIVE`.
4. Dois bindings ativos tornam resolução ambígua e bloqueiam.
5. Retry do mesmo `resolutionRequestKey` nunca troca de binding.

**6–10 · Tenant / provider resource**
6. Binding tenant A nunca resolve para tenant B.
7. Provider esperado divergente → fatal.
8. Provider resource esperado divergente → fatal.
9. Resource identity confirmada pelo provider precisa bater com
   binding.
10. Ausência de verificação de resource não é convertida em
    confirmação.

**11–15 · Credential lifecycle**
11. Nova revisão entra `STAGED`.
12. Validação bem-sucedida permite ativação.
13. Validação falha mantém revisão anterior `ACTIVE`.
14. Ativação atomicamente torna anterior `SUPERSEDED`.
15. Duas rotações concorrentes não produzem duas revisões `ACTIVE`.

**16–20 · Revocation / secret safety**
16. Revisão `REVOKED` nunca é resolvida para nova chamada.
17. Revogação da ativa não faz fallback automático para superseded.
18. `CredentialResolutionRecord` nunca contém segredo.
19. Secret/secret hash não entra em artifact/log.
20. Job antigo com credential handle pode resolver nova revisão
    `ACTIVE`.

**21–25 · Capabilities**
21. Credential existente não implica capability `VERIFIED`.
22. Repository implementation não promove sozinho capability para
    `VERIFIED`.
23. Evidence fresca resolve `AVAILABLE` quando requirements são
    atendidos.
24. Evidence stale permanece `STALE`.
25. Safe probe inexistente nunca executa side effect para "testar"
    capability.

**26–30 · Skill 16 / Skill 18 compatibility**
26. `VERIFIED + TESTER_ONLY` pode projetar `TESTER_ONLY` na Skill 16.
27. `PARTIALLY_VERIFIED` permanece disponível à projeção da Skill 18.
28. Skill 24 nunca redefine `MessagingAutomationCapabilitySnapshot`.
29. Skill 24 nunca redefine `MetricProviderCapabilities`.
30. Capability restriction nunca é removida para facilitar consumer.

**31–35 · Health / runtime use**
31. `HEALTHY` não implica capability `VERIFIED`.
32. `SAFE_PROBE_UNAVAILABLE` produz health `UNKNOWN`.
33. Provider outage não revoga automaticamente credential.
34. `IntegrationUseContext` referencia binding/capability/revision
    exatos.
35. Use context expirado não resolve secret para nova network call.

**36–40 · Boundaries / real providers**
36. Shared Z-API resource permanece explicitamente
    `SHARED_EXTERNAL_RESOURCE`.
37. Shared resource não ganha autorização cross-tenant implícita.
38. Skill 23 continua necessária quando capability/health probe
    consome quota.
39. Mercado Livre sem consumer ativo não é tratado como integração
    operacional do pipeline.
40. Bling não é registrado como integração deste repo sem nova
    evidência.

### Hashes novos da rodada 2 (10)

```text
INTEGRATION_BINDING_RESOLUTION_REQUEST_V1
INTEGRATION_BINDING_RESOLUTION_V1
CREDENTIAL_LIFECYCLE_COMMAND_V1
CREDENTIAL_VALIDATION_EVIDENCE_V1
CREDENTIAL_LIFECYCLE_TRANSITION_V1
INTEGRATION_CAPABILITY_REFRESH_REQUEST_V1
INTEGRATION_CAPABILITY_RESOLUTION_V1
INTEGRATION_HEALTH_CHECK_REQUEST_V1
INTEGRATION_HEALTH_OBSERVATION_V1
INTEGRATION_USE_CONTEXT_V1
```

ChatGPT deliberadamente não fixou um total global na rodada 2 —
instruiu contar via grep (hashes da rodada 1 + 10 novos) e registrar o
total real encontrado, em vez de inventar um número.

### Hash novo (Ponto S1 — Provider Account Ingress)

```text
PROVIDER_ACCOUNT_INGRESS_RESOLUTION_V1
```

Adicionado durante a repair round do Fable review (achado S1), fora da
rodada 2 original — ver `ProviderAccountIngressResolution` acima e
`22-gestor-de-conta-tenant/SPEC.md` (source `PROVIDER_ACCOUNT_INGRESS`
de `TrustedTenantContext`).

### Fechamentos finais (ChatGPT, rodada 2)

Skill 24 resolve integração e conta explicitamente; "primeira conta
configurada" nunca é autoridade. O modo single-account atual existe
através de `UNIQUE_ACTIVE_PROVIDER_BINDING`, que falha assim que deixa
de ser único. Binding, credential handle e credential revision são
conceitos diferentes: rotação troca revisão, não binding; trocar
conta/recurso do provider cria nova identidade de integração.
Capability evidence é a camada factual inferior — os snapshots já
aprovados das Skills 16 e 18 permanecem donos de suas semânticas e
hashes, consumindo projeções da Skill 24 sem serem redefinidos.
Secrets nunca entram em contratos persistíveis; a Skill 24 resolve
material secreto somente no boundary de uso e persiste apenas qual
revisão foi utilizada. Health, capability e configuração são
dimensões independentes: integração configurada não significa
saudável; saudável não significa capaz; capability verificada não
garante que a próxima chamada terá sucesso. Credential rotation/
revocation não interfere na autoridade de retry/side-effect safety
das Skills executoras — uma chave nova nunca transforma efeito
externo `UNKNOWN` em autorização para tentar novamente.

**Aprovação condicional do ChatGPT**: *"Com esse bloco integrado e a
auto-verificação confirmando 0 tipos duplicados + 20 FATAL_ERROR + 10
novos hashes desta rodada + 40 testes, considero a Skill24 pronta para
o carimbo 24/25."*
