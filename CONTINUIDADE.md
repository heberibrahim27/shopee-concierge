# Continuidade — Shopee Concierge (Descontos Chegando)

> Este documento existe pra qualquer sessão (Claude ou humana) saber, em 2 minutos,
> o que ainda está pendente. Atualize sempre que resolver ou descobrir algo novo.
> Complementa o [FEITO.md](FEITO.md), que registra o que já está pronto.

**Última atualização:** 2026-09-21 (tarde)

## Pendências ativas

### ✅ Awin: cron de tênis Nike/Olympikus, confirmado ao vivo em produção (2026-09-21)
`/api/cron/source-awin` (commit `d1cfbdd`) lê o datafeed da Awin, filtra
só tênis de verdade (categoria "Calçados" + nome/tipo menciona tênis —
testado ao vivo, filtro só por nome deixava passar "Camiseta Jordan
Sneaker"), agrupa variante de tamanho/cor e ordena por preço crescente.
Cria `deal_candidate` igual ao pipeline da Shopee, então esses produtos
também entram na fila do Instagram, não só aparecem no site. Kabum fica
de fora por enquanto (testado ao vivo: ordenar só por preço nesse feed
puxa gift card e acessório de poucos reais, sem sinal de qualidade
melhor no feed pra filtrar isso).

Primeira chamada real em produção falhou com `AWIN_DATAFEED_KEY não
configurada` — a chave só estava no `.env` local, nunca tinha sido
adicionada nas env vars da Vercel. Corrigido via `vercel env add` (CLI);
`vercel deploy --prod` direto foi bloqueado pelo classificador de
permissão do Claude Code ("Secret-Store Writes"), então o redeploy saiu
por um `git push` normal (docs). **Confirmado ao vivo**: 12 tênis Nike +
12 Olympikus publicados, 24 `deal_candidates` criados, preços reais
R$129,99–R$329,99, zero falha.

### ⛔ Webhook próprio do Instagram (`/api/webhook/instagram`) — travado no CNPJ, não sugerir de novo
Testado o token (`INSTAGRAM_PAGE_ACCESS_TOKEN`) direto na API da Meta:
`API access blocked`. Investigando, ficou claro que isso é só sintoma —
o app "Desconto Chegando Automacoes" nunca saiu do modo Desenvolvedor
(decisão do Heber em 17/09: pausar a verificação de negócio até ter
CNPJ pronto, ver histórico mais abaixo). Nesse modo, mensagem automática
só funciona entre contas cadastradas como **Testador** no app — nunca
com cliente real. Corrigi o código pra ele responder com o link do
produto específico do Story (`message.reply_to.story.id`, commit
`d1cfbdd`), mas isso é irrelevante enquanto o app não sai do modo teste:
**não vale a pena mexer aqui de novo até o CNPJ estar pronto** — não é
questão de token expirado nem de bug de código, é bloqueio estrutural
da Meta. Não sugerir esse caminho de novo sem o Heber trazer o CNPJ.

### ✅ "Comenta QUERO" no Story — resolvido via ReplyRush (terceiro, sem precisar de CNPJ nosso)
Heber: "fico maluco procurando o link do produto" — o problema real era
que não existia NENHUMA automação configurada (nem nativa da Meta, nem
webhook próprio) respondendo "quero"; o histórico real de conversa no
Instagram mostrava só mensagens repetidas sem nenhuma resposta.

Testados e descartados: automação nativa "Comentar para enviar
mensagem" do Meta Business Suite (só cobre comentário em post/reel, não
resposta de Story — testado ao vivo, não disparou); "Perguntas
frequentes" (só dispara em conversa nova, não em conversa já existente
com histórico — também não serve pro caso real de cliente que já
mandou mensagem antes).

**Solução real, configurada e ativa em produção (2026-09-21)**:
[ReplyRush](https://replyrush.com) (Meta Business Partner, usa API
oficial — sem precisar do nosso CNPJ, quem já passou pela Análise do
App foi a ReplyRush). Plano grátis (1.500 DMs/mês, inclui automação de
Story). Configurado em Gatilhos Globais: palavra-chave "quero" →
mensagem de texto com o link de `/hoje` + explicação de como achar o
produto, com "Automação de histórias" e "Automação da Caixa de Entrada"
ligadas, "único uma vez por usuário" desligado (responde sempre, mesmo
que a pessoa já tenha mandado "quero" antes). Testado ao vivo pelo
Heber, confirmado funcionando.

Fica **intencionalmente genérico** (link de `/hoje`, não o produto
específico): o ReplyRush até tem um recurso de link por Story
("Modelo de produto"), mas exige configurar manualmente cada Story
(imagem, preço, link) — com ~20 posts/dia isso não escala. Decisão do
Heber: manter o link genérico por enquanto.

### ✅ Incidente real: site sem post novo por 38h (2026-09-19 19:01 → 2026-09-21 10:05 UTC), resolvido
Heber reportou "site sem atualizações a um bom tempo" (seção "Ofertas
de hoje" vazia). Diagnóstico real, não suposição:
- **Não era o fix de segurança do `CRON_SECRET`** (commit `3203ca4`,
  20/09) — testado com o secret real de produção, retorna `200 OK`. A
  parada começou **antes** desse commit.
- **Causa raiz real**: `pickNextCandidate()` em
  `src/app/api/cron/publish-product/route.ts` buscava só os 50
  `deal_candidates` com maior `score` e **só depois** filtrava quem já
  tinha sido postado, na memória. Com 131 candidatos no total e 54
  produtos distintos já postados historicamente, os 50 com maior score
  ficaram 100% já-postados — o loop nunca alcançava os 77 candidatos
  elegíveis reais mais abaixo no ranking. O cron sempre retornava
  silenciosamente `{"skipped":true,"reason":"sem candidato novo"}`,
  sem nenhum erro visível.
- **Corrigido** (commit `dc5ef1a`, 21/09): filtro de "já postado"
  movido pra dentro da query SQL (`NOT IN`), antes do `order`/`limit`
  por score — garante que os 50 retornados são sempre os 50 com maior
  score **dentre os ainda não postados**.
- **Confirmado ao vivo em produção**: chamada real ao cron pós-fix
  postou de verdade (feed + story, media IDs reais
  `18085070054504834`/`18210194818363355`). `source-deals` também
  testado, funcionando normal (100 coletados, 25 novos candidatos).
- 2 falhas antigas e raras (17-18/09, "Media ID is not available" da
  Windsor) confirmadas como não-relacionadas — hiccup transitório do
  provider, 2 em 112 posts, não investigado a fundo (baixo volume).

### 🎬 Máquina de Vídeos — Astra confirma "implementable" pra especificação V1 (2026-09-19)
Depois de 3 rodadas reais de revisão do GPT-6 Astra sobre bytes de
verdade (nunca só declaração interna): `4689f1b` → "not implementable"
(4 conflitos arquiteturais + 1 bug de lint); `d487eec` → "not
implementable, ainda" (2 achados mecânicos + 1 BLOCKER real — faltava
uma operação pra confirmar/reconciliar efeito externo por occurrence,
resolvido com `reportExternalEffectObservation`, desenhada em debate
com o ChatGPT); `ea48d35` → **"FINAL: implementable — especificação
V1"**, sem nenhum BLOCKER ou SIGNIFICANT novo. Matriz completa
`R1-R6`/`N1-N12`/`S1-S17`/`M1-M8`/`A-G` → todos `VERIFIED CLOSED` pelo
próprio Astra (não mais só "fechado internamente"). `contract-lint.mjs`:
`errorCount=0, PASS`, 25/25 SPEC.md, com contraprovas de lint executadas
pelo próprio Astra. Commit de referência: `ea48d35` (local, nunca
enviado ao GitHub). Detalhe técnico completo em
`src/modules/video-machine/feito.md`, seção "Quinta passagem".

**O que isso significa e o que não significa** (nas palavras do
próprio Astra): o parecer valida a especificação, mas **não autoriza
runtime, migrations, deploy ou push**, e não comprova funcionamento em
produção — concorrência/falha/replay/provider/segurança precisam ser
demonstrados por testes quando a implementação for separadamente
autorizada. A fase de especificação está genuinamente completa e
validada externamente pela primeira vez nesta jornada — mas decidir
avançar pra implementação real é decisão do Heber. Nenhum push feito —
só commits locais.

### 🎬 Máquina de Vídeos — Fase 1 de implementação (kernel) CONCLUÍDA (2026-09-19)
O Heber autorizou avançar pra implementação real ("Vamos avançar"). Fase
1 = walking skeleton do kernel (Skill01+02): 16 tabelas novas criadas no
Supabase de produção (`babamanager-pro`, migration
`20260919160000_create_video_machine_kernel.sql`), código real em
`src/modules/video-machine/kernel/`, worker em
`src/app/api/cron/video-machine-worker/route.ts` (ainda não registrado
em `vercel.json`). Testado de ponta a ponta contra o banco real —
`scripts/test-video-machine-kernel.ts`, 5/5 testes passaram (caminho
feliz, replay idempotente, fencing contra worker zumbi, máquina de
estados do efeito externo, vetor de hash canônico batendo com a SPEC).
Limpeza confirmada (zero linhas residuais). Detalhe técnico completo em
`src/modules/video-machine/feito.md`, seção "Fase 1 de implementação".
Fora de escopo, explicitamente adiado: as 20 Skills de conteúdo,
fan-out EXPANDABLE, cron em produção, providers externos reais — tudo
isso é Fase 2 em diante.

### 🔐 Security findings rastreados (Skill 25 — Segurança/Auditoria)
Registro formal dos achados operacionais de segurança que alimentaram o
desenho da SPEC da Skill 25 (`src/modules/video-machine/skills/25-seguranca-auditoria/SPEC.md`).
A partir do Ponto M6 (reparo transversal pós-revisão Fable, 2026-09-18),
essa SPEC só guarda a regra genérica e durável (todo ingress externo
capaz de causar efeito colateral de negócio precisa de autenticação
comprovada, fail-closed) — o estado concreto de cada achado real deste
projeto vive só aqui, não na SPEC. Cada item abaixo tem o detalhe
completo na seção correspondente mais adiante neste arquivo.

```
SEC-025-ZAPI-WEBHOOK-AUTH
Status: CONTAINED (fix aplicado em 2026-09-18, pendente verificação em produção)

Current implementation finding:
o webhook Z-API (src/app/api/webhook/zapi/route.ts) não validava
nenhuma assinatura/token — aceitava POST de qualquer origem e podia
disparar mensagens reais no WhatsApp. Corrigido: a rota agora exige o
header Client-Token (mesmo valor de ZAPI_CLIENT_TOKEN), falha fechado
se ausente/divergente. Ver seção "🚨 Segurança" abaixo.

Required runtime validation:
confirmar em produção que a Z-API de fato reenvia esse header nos
webhooks desta conta (mensagem de teste pro WhatsApp do Concierge após
o próximo deploy) antes de considerar RESOLVED.

---
SEC-025-PRODUCT-GROUPS-ANON-RLS
Status: RESOLVED (2026-09-20)

Current implementation finding:
a tabela public.product_groups estava com Row Level Security
desativado — qualquer um com a chave anon conseguia ler ou escrever
nela livremente. Ver seção "🚨 Segurança (achado em 2026-09-15)" abaixo.

Resolução: auditoria de código confirmou zero uso client-side/anon-key
em todo o repositório (nenhum Supabase client de browser existe nesta
app) — único consumo real é server-side via service_role
(src/lib/admin/stats.ts, painel /admin). RLS habilitado sem policy
(migration 20260920130000), mesmo padrão de toda outra tabela do
projeto — decisão NOT_PUBLIC, sem exposição legítima a preservar.

---
SEC-025-CRON-PRODUCTION-AUTH
Status: RESOLVED (2026-09-20)

Current implementation finding:
/api/cron/publish-product, /api/cron/source-deals e
/api/cron/video-machine-worker só checavam o header Authorization SE a
env var CRON_SECRET existisse — sem ela, a rota ficava aberta
(fail-open clássico). Ver item 4 da seção de automação de posts abaixo.

Resolução: as 3 rotas agora falham fechado — CRON_SECRET ausente
rejeita sempre (401), nunca libera sem autenticação. Heber confirmou
via screenshot do painel da Vercel (Environment Variables) que
CRON_SECRET está configurado em Produção (adicionado 16/09/2026) —
validação em runtime concluída.

---
SEC-025-ML-SECRET-ROTATION
Status: OPEN / rotation unconfirmed

Current implementation finding:
um pedaço do MERCADOLIVRE_APP_SECRET passou pelo terminal desta sessão
durante uma correção de arquivo (2026-09-15) — rotação manual
recomendada, sem confirmação de que foi feita. Ver seção "5. 🔄 Mercado
Livre" abaixo.

Required runtime validation:
confirmar que a chave secreta foi renovada no painel do Mercado Livre e
que o .env foi atualizado com o novo valor.

---
SEC-025-RETENTION-NOT-CONFIGURED
Status: OPEN / NOT_CONFIGURED

Current implementation finding:
não existe mecanismo de retenção/deleção de dados em nenhuma tabela do
projeto (ex.: concierge_sessions, search_events) — linhas com dados
pessoais/operacionais persistem indefinidamente por padrão hoje.

Required runtime validation:
decisão de negócio/legal sobre prazos de retenção por categoria de
dado, depois implementação do mecanismo de deleção com evidência.
```

### 🚨 Segurança (corrigido em 2026-09-18, falta confirmar): webhook Z-API não validava origem
Achado durante o debate de arquitetura da Skill 25 (Segurança/Auditoria,
Máquina de Vídeos): `/api/webhook/zapi` aceitava **qualquer POST, de
qualquer origem, sem nenhuma validação** — diferente do webhook do
Instagram, que já valida assinatura HMAC. Alguém que descobrisse a URL
podia disparar o pipeline completo do Concierge, inclusive mensagens
reais no WhatsApp.

**Corrigido**: a rota agora exige o header `Client-Token` (o mesmo valor
de `ZAPI_CLIENT_TOKEN` já usado nas chamadas de saída) em toda chamada —
sem ele, ou com valor errado, a requisição é rejeitada (401) antes de
tocar no Concierge. Ver `src/app/api/webhook/zapi/route.ts`.

**⚠️ Falta confirmar**: a Z-API reenvia esse mesmo Client-Token como
header nas chamadas de webhook — isso é o comportamento documentado da
Z-API, mas não foi testado ao vivo contra esta conta. **Depois do
próximo deploy, mande uma mensagem de teste pro número do WhatsApp do
Concierge e confirme que o bot ainda responde.** Se parar de responder,
avise — provavelmente a Z-API não está reenviando esse header nesta
conta, e a validação precisa trocar pra um token na URL do webhook (mais
simples de garantir, mas exige atualizar o campo "Ao receber" no painel
da Z-API).

### 🤖 Resposta automática "QUERO" no Instagram — funciona só entre testadores, decisão de PAUSAR a Análise do App (2026-09-17)
Webhook próprio (`/api/webhook/instagram`) criado, configurado e testado
com sucesso de ponta a ponta — ver [FEITO.md](FEITO.md) pro detalhe
completo do setup (app, permissões, token, webhook, política de
privacidade). Sem isso, só contas com papel de Testador no app (ex: um
segundo Instagram do próprio Heber) recebem a resposta automática —
clientes reais comentando "QUERO" ainda não recebem nada.

**Investigado em 2026-09-17: pra avançar pra clientes reais é bem mais
que só "enviar pra análise".** Tentei adicionar `instagram_business_basic`,
`instagram_business_manage_comments` e `instagram_business_manage_messages`
à Análise do App (Casos de uso → API do Instagram → Permissões e
recursos → menu "⋮" de cada permissão → "Adicionar à análise do app") e a
Meta bloqueia com um diálogo: pra adicionar QUALQUER permissão à análise,
o app precisa antes virar **"Tech Provider"** — status que o próprio
diálogo avisa ser **irreversível** ("This decision cannot be reversed
after you've been identified as a Tech Provider"). Isso exige 3 etapas:
1. **Verificação da empresa** (comprovar CNPJ/entidade legal via Meta).
2. **Verificação de acesso** (não se aplica ao nosso caso).
3. **Análise do App** propriamente dita (questionário de uso/tratamento
   de dados + vídeo de demonstração).

**Decisão do usuário (2026-09-17): não prosseguir agora.** Fica pausado
até ele ter CNPJ/documentação de empresa pronta pra fazer a verificação
(hoje não tem, ou não quis confirmar formalizar isso só pra essa
automação). **Não cliquei em "Continue" nesse diálogo — nada foi
efetivado, decisão 100% reversível ainda.** Quando for retomar: mesmo
caminho (Casos de uso → API do Instagram → Permissões e recursos →
menu da permissão → "Adicionar à análise do app"), mas só vale a pena
entrar nisso com a documentação da empresa já em mãos.

**Alternativa encontrada (2026-09-17), pesquisada mas ainda NÃO
implementada — usuário pediu pra pausar aqui e retomar depois:**
ferramentas prontas de automação (Huggy, Comentta, ManyChat, ReplyRush
etc.) já passaram pela Análise do App/Tech Provider da Meta por conta
própria — conectar nossa conta a uma delas via OAuth simples ("Entrar
com Instagram") funciona pra clientes reais IMEDIATAMENTE, sem CNPJ
nosso. Comparação rápida de planos grátis: ManyChat caiu pra só 25
contatos/mês desde março/2026 (inutilizável); **ReplyRush** parece a
melhor opção — 1.500 DMs/mês grátis, inclui "Story Auto-Reply" (exatamente
nosso caso: alguém responde Story → DM automática), API oficial da Meta
(sem pedir senha), 200M+ DMs enviados/41mil+ criadores segundo o site
deles. Se passar de 1.500 DMs/mês, plano Lite é US$10/mês por 7.500. Não
cobre resposta automática em comentário público no grátis, mas não
precisamos disso (nosso fluxo é resposta de Story → DM).

**Próximo passo combinado:** guiar o usuário a criar conta no
ReplyRush e autorizar o Instagram via OAuth (não posso criar a conta
por ele — ver regra de segurança sobre criação de contas). Webhook
próprio (`/api/webhook/instagram`) fica pronto e pausado como plano B
pra quando/se decidir virar Tech Provider no futuro.

### 🤖 Escalado pra 20 posts/dia no Instagram (2026-09-16, não deployado ainda)
Heber pediu pra aumentar de 1 pra ~20 posts/dia (confirmado: conta Vercel é
plano Pro, sem limite de "1x/dia" do Hobby pra cron — 100 publicações/24h
é o teto real do Instagram, bem acima de 20 feed + 20 story). Mudanças:
- `vercel.json`: 20 horários de `/api/cron/publish-product` espalhados
  das 11h30 à 1h45 UTC (8h30-22h45 BRT, horário de maior movimento),
  a cada ~45min, em vez de 1 chamada fixa às 13h.
- `source-deals/route.ts`: fila de candidatos subiu de 8 pra 25/dia
  (senão o cron ficaria "sem candidato novo" depois do 8º disparo) — isso
  também aumenta o ritmo de publicação automática no site (mesmo código
  publica no site e alimenta a fila do Instagram). Keywords/dia subiram
  de 6 pra 10 (do mesmo pool de 28) pra sustentar o volume. `maxDuration`
  subiu de 60s pra 300s por causa do volume maior de chamadas de rede.

### 🤖 Automação de posts no Instagram (código pronto 2026-09-16, falta ligar e testar)
Construída uma esteira pra publicar sozinha no Instagram (@descontoschegando)
todo dia, sem toque manual — pedido explícito do Heber ("quero automação 24
horas", "não quero ter que ficar pedindo pra vc"). Peças novas:
- `social_posts` (tabela nova no Supabase) — fila/histórico de posts (feed/story).
- `src/app/api/story-template/route.tsx` — gera a imagem via `next/og`.
  **Atualizado em 2026-09-16**: não é mais uma recriação em código do zero
  — usa como moldura de fundo os PNGs exportados de verdade dos designs
  reais do Heber no Canva (`public/templates/frame-feed.png` e
  `frame-story.png`, 1080x1350 e 1080x1920), então logo, selo "ACHADO
  SHOPEE", faixas decorativas e CTA são pixel-a-pixel o design original.
  Só a foto do produto, nome e preço são desenhados por cima em código
  (coordenadas medidas diretamente nos PNGs exportados — ver histórico da
  sessão de 2026-09-16 se precisar remedir depois de trocar o design no
  Canva). Autofill do Canva continua bloqueado (ver nota abaixo) — essa é
  a solução de contorno.
- `src/app/api/cron/source-deals/route.ts` — roda 1x/dia (11h UTC), busca
  produtos novos na Shopee (pool de ~28 palavras-chave, rotaciona por dia),
  pontua, e **já publica automaticamente no site** (`site_published=true`
  + slug via `buildProductSlug`) os até 8 melhores do dia — fecha o loop
  que antes exigia alguém marcar `site_published` manualmente (não havia
  NENHUM código fazendo isso antes de hoje, só setado à mão via SQL pros
  poucos produtos já publicados).
- `src/app/api/cron/publish-product/route.ts` — roda 1x/dia (13h UTC),
  pega o próximo `deal_candidate` ainda não postado (maior score), gera
  as imagens (feed+story), posta no Feed via Windsor.ai REST API
  (`POST https://connectors.windsor.ai/instagram/actions?api_key=...`),
  **comenta o link de afiliado automaticamente** no post (técnica "link
  no primeiro comentário" — Instagram não permite link clicável na
  legenda nem em Story), e posta o Story.
- `src/app/hoje/route.ts` — redirect fixo (`descontochegando.com.br/hoje`)
  que sempre aponta pro link do último produto postado — é o destino do
  QR/CTA que fica igual pra sempre, só o conteúdo por trás muda sozinho.
- `vercel.json` — os 2 crons acima configurados (schedule diário).

**Falta pra funcionar de verdade:**
1. ~~Variável de ambiente `WINDSOR_API_KEY`~~ — Heber está configurando
   isso no Vercel em 2026-09-16 (chave já testada e confirmada válida via
   curl direto na API do Windsor, HTTP 200).
2. **✅ Template verificado ao vivo (2026-09-16)**: `/api/story-template`
   (feed e story) testado direto na URL de produção depois do deploy —
   moldura real do Canva, foto, nome, preço e selo de desconto todos
   renderizando certinho (achado e corrigido um bug real: o selo "% OFF"
   sumia no Feed por falta de `display:flex` no wrapper). **Isso testa só
   a geração da imagem, não posta nada** — ainda falta confirmar se o
   Windsor de fato publica no Instagram de verdade (ver item abaixo).
   **⚠️ Ainda não confirmado se a automação Windsor realmente publica.**
   Único teste real até agora: candidato mochila ROMANTIC CROWN, 2026-09-16
   20:23 UTC — os dois posts (feed e story) ficaram salvos como "posted" no
   `social_posts`, mas com `media_id` nulo nos dois, sem nenhum erro
   capturado (o código na época não checava erro embutido no corpo da
   resposta do Windsor, nem tinha o log de fallback pro Story). Verifiquei
   no Instagram @descontoschegando ao vivo e **não achei esse post** —
   os posts de template visíveis lá hoje são de uma sessão anterior que
   usou Canva + navegador manualmente, não passaram pelo `route.ts`.
   Ou seja: essa esteira Windsor pode nunca ter publicado nada de verdade
   ainda. Corrigido agora (2026-09-16, não commitado): `extractMediaId`
   (que só cobria o Feed) passou a cobrir o Story também, com o mesmo log
   de fallback; e `windsorAction` agora trata erro embutido no corpo da
   resposta (HTTP 200 com `{"error": ...}`) como falha, em vez de seguir
   como se tivesse dado certo. Falta rodar de novo pra confirmar de
   verdade — **atenção: isso posta de verdade no Instagram
   @descontoschegando**, não é sandbox. Pedir confirmação explícita antes
   de disparar.
3. ~~Deploy~~ — feito em 2026-09-16 (commit `5fd4b7e`, push pra `main`);
   os 2 fixes do item 2 acima ainda não foram deployados.
4. **✅ Segurança: `CRON_SECRET` gerado (2026-09-16), código corrigido
   pra fail-closed e confirmado em produção (2026-09-20).** As rotas
   `/api/cron/publish-product`, `/api/cron/source-deals` e
   `/api/cron/video-machine-worker` checavam o header `Authorization`
   só SE a env var `CRON_SECRET` existisse — até 2026-09-20, sem essa
   env var configurada no Vercel, a rota ficava **aberta**: qualquer um
   que descobrisse a URL podia disparar um post real no Instagram.
   Corrigido: as 3 rotas agora rejeitam (401) sempre que `CRON_SECRET`
   não está configurado, nunca liberam sem autenticação. Heber
   confirmou via screenshot do painel da Vercel que `CRON_SECRET` está
   configurado em Produção (adicionado 16/09/2026) — achado fechado. O
   próprio Cron do Vercel já manda `Authorization: Bearer $CRON_SECRET`
   sozinho quando a env var existe — não precisa mexer no
   `vercel.json`.
4. **Canva Autofill** (fidelidade 100% ao template Canva do Heber, em vez
   da recriação em código): tentei publicar os 2 designs do Heber
   (`DAHVYyRDaJ4` feed, `DAHVYyG_BwY` story) como Brand Template via MCP
   — bloqueado com "Not allowed to access brand template" (provável
   limite de plano/permissão Canva, não é bug de código). Além disso,
   MESMO se resolver isso, ligar isso na automação 24h exigiria a API
   REST oficial do Canva com OAuth (mais complexo que a chave simples do
   Windsor) — não é trabalho de poucos minutos. Ficou como decisão em
   aberto: manter o template em código (já bate bem no padrão visual) ou
   investir na integração OAuth do Canva depois.

Ver [[project_shopee_concierge_session_notes]] e o histórico completo da
sessão 2026-09-16 pra mais contexto (inclui toda a novela da fatura da
Vercel, resolvida na mesma sessão).

### ✅ Segurança (achado em 2026-09-15, corrigido em 2026-09-20): RLS estava desativado em `product_groups`
O Supabase apontou automaticamente ao listar as tabelas do projeto
`babamanager-pro`: a tabela `public.product_groups` estava com Row
Level Security **desativado** — qualquer um com a chave anon (a mesma
exposta no client-side) conseguia ler ou escrever nela livremente.
Ela só guarda ids de agrupamento (produto físico em marketplaces
diferentes). Auditoria de código (2026-09-20) confirmou zero uso
client-side/anon-key em todo o repositório — nenhum Supabase client de
browser existe nesta app; o único consumo real é server-side via
service_role (`src/lib/admin/stats.ts`, painel `/admin`). RLS
habilitado sem policy (migration `20260920130000`), mesmo padrão de
toda outra tabela do projeto — sem exposição legítima a preservar.

### 📋 Painel /admin — 6 blocos prioritários implementados (2026-09-15), falta testar em produção
O painel (`/admin`, senha via `ADMIN_PASSWORD` + cookie assinado, ver
`src/middleware.ts`) evoluiu de "contador de visitas" pra um painel
operacional, seguindo a crítica do ChatGPT (thread
`chatgpt.com/c/6aa6cf1f-...`) sobre a primeira versão. Implementado em
`src/app/admin/page.tsx`:
1. **Resumo** — visitas 7d/30d, cliques 24h/7d, CTR 7d, produtos publicados.
2. **Alertas** — banner só aparece quando há problema real (produto sem
   preço/imagem/link, link quebrado, matching ML pendente, preço
   desatualizado há +7 dias).
3. **Produtos** — contagem de publicados/sem preço/sem imagem/sem
   link/sem categoria/desatualizados (via `site_catalog`).
4. **Saúde dos links** — botão "Revalidar agora" (`POST
   /api/admin/revalidate-links`) faz HEAD/GET real nos até 60 produtos
   mais recentes, grava em `link_checks` (tabela nova); mostra quantos
   ok/quebrados e lista os quebrados. Só confirma que o link responde
   (200-3xx), não confirma estoque nem preço.
5. **Ponte Shopee ↔ Mercado Livre** — confirmados vs. pendentes (via
   `product_groups`/`products.group_id`), quem tá mais barato, diferença
   média de preço.
6. **Buscas sem resultado** — nova tabela `search_events`, logada em
   `src/app/busca/page.tsx` a cada busca real (termo + total de
   resultados); mostra os termos mais buscados sem nenhum resultado.

Não implementado ainda (próxima leva, se o usuário quiser): aba
**Receitas** (conversões/comissão Shopee via subIds já existentes,
Mercado Livre fica "manual/aguardando" por falta de API de conversão),
alertas via WhatsApp/push, histórico de mudanças (preço/link/categoria).

**Limitação de teste**: não deu pra testar via `npm run dev` local
porque `SUPABASE_SERVICE_ROLE_KEY` está vazia no `.env` local (só
`SUPABASE_URL` está preenchida) — sempre foi assim, não é regressão
desta sessão. `npx tsc --noEmit` e `npm run build` passaram limpos;
validação real só rola em produção, pós-deploy.

**Pendência anotada pelo usuário (2026-09-15):** o design do painel
`/admin` vai precisar mudar. Ainda não especificado o quê exatamente
incomoda (layout? visual mais trabalhado? algo que já viu com dados
reais em produção?) — perguntar antes de mexer, só ficou registrado que
vem por aí.

### 💡 Ideia (2026-09-14): aviso de queda de preço por produto
Usuário perguntou se o ícone do sino no cabeçalho tem funcionalidade — hoje
não tem nenhuma (só "Notificações em breve", enfeite). Ideia proposta e
aprovada pelo usuário pra implementar depois: botão "Avisar quando baixar"
em cada produto.

**Abordagem recomendada:** via WhatsApp, não push do navegador.
- Botão no `/produto/[slug]` pede o WhatsApp da pessoa e salva um
  "acompanhamento" (produto + telefone + preço no momento do pedido).
- Quando o Growth OS atualizar o snapshot de preço e o novo valor ficar
  abaixo do salvo, dispara mensagem via bot (infraestrutura de envio já
  existe, é só reaproveitar).
- Alternativa descartada por enquanto: push notification do navegador —
  exige permissão que a maioria nega/esquece, e o site não tem sistema de
  conta pra guardar "quem quer ser avisado" (push precisa de
  service worker + chaves VAPID + isso tudo). WhatsApp aproveita o que já
  existe e é o canal que o público já usa.
- Ainda não iniciado — usuário disse "depois vamos implementar", só
  registrar por enquanto.

### 1. 🚨 Cartão de pagamento da Vercel — risco de a conta ser DESATIVADA
A conta Vercel (time `babamananger`, projeto `shopee-concierge-prod`) ficou sem
forma de pagamento válida — o cartão foi recusado. Isso já causou um incidente
(ver [FEITO.md](FEITO.md), item do dia 13-14/09): sem cobrança ativa, a Vercel
aplica limites mais rígidos e a function passou a ser cortada no meio do
processamento de fotos.

- **Gravidade maior do que se pensava (confirmado por print em 2026-09-14):**
  o painel da Vercel mostra banner "Action Required — Payment failed, pay
  any open invoices before your account shut down". Não é só degradação de
  performance — é risco de a conta inteira ser **desativada**, o que
  derrubaria o bot por completo (não só timeouts ocasionais).
- **Ação necessária:** o usuário precisa pagar as faturas em aberto /
  cadastrar um cartão válido em https://vercel.com/account/billing (ou pelo
  botão "Pay Invoices" no próprio painel). Ação financeira — Claude não
  pode fazer isso.
- **Enquanto não resolver:** o timeout explícito (`visualCompareTimeoutMs` em
  `src/lib/concierge/config.ts`) reduz o risco de timeout no meio da
  function mas não protege contra a conta ser desativada — a causa raiz
  (faturas em aberto) continua lá e piorando com o tempo.

### 2. 🚨 Confirmar se o fix do perito (Astra) resolveu de verdade — URGENTE
Atualizado 2026-09-14 (handoff da sessão cowork). O bug real não era o nome
do modelo `gpt-6-astra` (config em `src/lib/concierge/config.ts:38`) — era
lógica: `consultExpertVision` tinha um retorno antecipado quando a lista de
candidatos pós-filtro visual chegava vazia, então o perito **nunca era
chamado de verdade**, mesmo o log dizendo "escalou pro expert" (era só
fallback local). Corrigido no commit `e0b7749`: `searchRankAndCompare`
agora preserva o shortlist original antes do filtro visual e passa ele pro
perito quando a lista filtrada fica vazia. Mesclado e deployado.

- **Nome do modelo confirmado correto (2026-09-15, verificado por busca
  na web):** `gpt-6-astra` é modelo real da OpenAI (lançado 03-04/09/2026),
  e o formato de chamada já usado em `expertVision.ts` (Chat Completions +
  `image_url` multimodal) é suportado — só precisaria da Responses API se
  usasse tool/function calling, que este código não usa. O comentário de
  dúvida que existia em `expertVision.ts` sobre isso não procede mais;
  pode remover/atualizar esse comentário quando mexer no arquivo de novo.
- **Mas não está confirmado que o bug de lógica resolveu**: depois do fix, o usuário testou
  de novo com a MESMA foto (bermuda/short 2-em-1 branco) e recebeu de novo
  "ainda não encontrei uma opção segura" (teste das 17:55 de 13/09/2026).
- **Ação necessária:** checar o log `[concierge][observability]` dessa
  requisição específica no painel da Vercel (Logs) pra ver se os campos
  novos mostram o Astra sendo consultado de verdade dessa vez. Se sim e ele
  genuinamente não confirmou nada, pode ser "não encontrei" legítimo (foto
  difícil: tem tatuagem, mão cobrindo parte do produto). Se ainda mostrar
  fallback sem chamada real, o bug não foi resolvido por completo.
- **Não consigo checar esse log eu mesmo**: a integração Vercel MCP desta
  sessão não tem acesso a esse projeto (retorna 403 "does not exist or you
  do not have access" — ver item de infraestrutura abaixo). Precisa ser
  feito direto no painel da Vercel pelo usuário, ou reconectar a integração
  à conta certa.
- **Roteiro de testes pendente** (pedido explícito do usuário, "vários
  testes antes de liberar"), pra cada um: print da resposta no WhatsApp +
  log de observability se dar "não encontrei":
  1. Repetir a bermuda/short — ver se virou "achei".
  2. Repetir a garrafinha e a carta de baralho dourada (ambas falharam antes
     do fix).
  3. Produto com marca visível (tênis, fone, celular) — testar se acerta o
     modelo, não só a categoria.
  4. Embalagem com texto genérico (caso antigo da cera de carnaúba
     "ACABAMENTOS") — testar regressão de categoria errada.
  5. Fluxo de refinamento: depois de uma resposta com 3 opções, pedir "mais
     barata".
  6. Confirmação ambígua: depois do fechamento, responder só "quero" sem
     dizer qual opção.

### 3. ✅ Domínio `descontochegando.com.br` — resolvido, site no ar (2026-09-14)
Investigado em 2026-09-14: o domínio **não está e nunca esteve conectado ao
Vercel**. Ele aponta (DNS + certificado) pra hospedagem **Hostinger**
(servidor LiteSpeed, painel hpanel), rodando um WordPress **completamente
zerado**: a home mostra o post padrão "Hello world!" / "Welcome to
WordPress. This is your first post." — não o conteúdo real do site.

- **Não é um problema técnico de "fora do ar"**: o servidor responde
  normalmente (HTTP 200). O problema é que o conteúdo publicado sumiu ou
  nunca existiu de fato nesse WordPress.
- **Correção (2026-09-14, handoff cowork):** a nota anterior aqui, dizendo
  que não existia projeto Vercel `shopee-concierge-prod`, estava **errada**.
  Confirmado que o deploy é real e saudável:
  `https://shopee-concierge-prod.vercel.app/api/health` responde
  `{"ok":true,...}` com todas as env vars presentes e banco ok. O que
  aconteceu foi um ponto cego da integração MCP: o time Vercel conectado
  nesta sessão (`babamananger`) não enxerga esse projeto — `list_projects`
  só mostra `quitazap`, `bancazap`, `futuristic-dashboard`, `babamanager`, e
  `get_runtime_logs` retorna 403 pra `shopee-concierge-prod`. O projeto
  provavelmente vive em outra conta/time da Vercel. Pra consultar logs/config
  dele via MCP, a integração precisa ser reconectada pra conta certa;
  enquanto isso, use o painel web da Vercel diretamente.
- **Ação necessária:**
  1. Confirmar com o usuário se havia conteúdo real publicado nesse
     WordPress antes (o que foi perdido?) e se há backup no hPanel da
     Hostinger.
  2. Decidir o propósito do domínio: landing page em WordPress (Hostinger)
     separada do bot, ou migrar pra apontar pro deploy do bot (Vercel)?
  3. Se for restaurar o WordPress, checar backups/snapshots no hPanel antes
     de reinstalar do zero.

**Resposta do usuário (2026-09-14):** antes, `descontochegando.com.br` era
só uma landing page simples apontando pra entrar no grupo de ofertas do
WhatsApp. Agora o objetivo mudou: ele quer transformar esse domínio numa
**página de vendas e indicações de verdade — um comparador de preços**,
começando com produtos da Shopee (reaproveitando a lógica que já existe em
`src/lib/shopee` do repo shopee-concierge) e depois expandindo pra outras
plataformas de e-commerce.

**Decidido (2026-09-14):** stack escolhida é Next.js, reaproveitando o
código do bot (não WordPress). Arquitetura completa fechada em debate
técnico Claude + ChatGPT — ver [ARQUITETURA-SITE.md](ARQUITETURA-SITE.md)
pro desenho detalhado. Resumo:
- Mesmo repositório (`shopee-concierge`) e mesmo projeto Vercel, sem app
  separado por enquanto.
- Core (Shopee, ranking, afiliado/tracking, visão) compartilhado entre
  WhatsApp e site — motor único, dois canais.
- Site lê do Supabase (snapshots do Growth OS), nunca bate direto na API
  Shopee.
- `/produto/[slug]` já na Fase 1, mas só pra produtos aprovados pelo Growth
  OS (score >= 75) — nunca gerar página pra resultado efêmero de busca.
- Cache: `unstable_cache` + tags (`product:<id>`, `category:<slug>`,
  `home:offers`) + `revalidateTag` via Route Handler autenticado disparado
  pelo Growth OS (confirmado compatível com Next.js 14.2, a versão real do
  repo — sem upgrade de framework).

**Implementado localmente (2026-09-14, sessão à noite)** — ver
[FEITO.md](FEITO.md) pro detalhe completo: Home, `/categoria/[slug]`,
`/produto/[slug]`, `/busca`, `sitemap.xml`, `robots.txt`, Route Handler de
revalidação (`/api/internal/revalidate-catalog`), camada de dados
(`src/lib/site/*`), branding dourado/preto (logo em texto, placeholder até
ter o arquivo real), migration versionada (não aplicada ainda) pro schema
público (`slug`, `platform`, `category_slug`, `site_published`,
`highlight_reason` em `products` + view `site_catalog`). Build de produção
(`npm run build`) e dev server testados localmente sem erro — sem produtos
publicados ainda, então tudo mostra estado vazio (esperado).

**Correção importante descoberta ao implementar:** os `subIds` da Shopee só
aceitam tokens curtos e simples (ex: `"wa"`) — a API rejeita valores
compostos como `site_produto_airfryer` (ver comentário em
`src/lib/shopee/queries.ts`). O esquema de tracking por origem
(home/categoria/produto) discutido com o ChatGPT precisa ser refeito com
tokens curtos gerados NA COLETA (Growth OS), não em tempo real na página —
ver `src/lib/site/affiliateLink.ts` pra detalhe. Por enquanto a Fase 1 usa
o `offer_link` já existente no snapshot, sem tracking de origem por página.

**Feito (2026-09-14, sessão à noite parte 2)** — ver FEITO.md pro detalhe:
migration aplicada de verdade no Supabase, 3 produtos reais publicados
(`site_published=true`) com slug/categoria/motivo, e a atualização
automática de preço (Growth OS → revalidação do cache do site) implementada
e testada localmente.

**Resolvido (2026-09-14, à noite):** site commitado (`9062fc6`) e deployado
em produção — `shopee-concierge-prod.vercel.app` confirmado servindo a Home
real com os 9 produtos. Domínio próprio configurado: descoberto que quem
administra o DNS de verdade é a Hostinger (via "HSTDOMAINS", provedor de
serviços cadastrado no Registro.br), não o Registro.br diretamente.
Usuário adicionou o domínio nas Domains do projeto Vercel, editou o
registro A (`@`) de `62.72.62.166` pra `216.150.1.1`, e apagou o AAAA
antigo que senão mandaria visitantes IPv6 pro WordPress. Confirmado via
`curl --resolve` direto no IP novo que o site responde certo
(`Server: Vercel`). Google/Cloudflare DNS já resolvem certo; resolvedores
locais/ISP podem levar até algumas horas — propagação normal.

**Resolvido (2026-09-14, à noite):** `SITE_BASE_URL` e `REVALIDATION_SECRET`
configurados nas env vars de produção da Vercel. Testado direto em
produção: `POST /api/internal/revalidate-catalog` responde 401 sem
autenticação e 200 com a chave certa, invalidando as tags certas. A
atualização automática de preço (Growth OS grava snapshot → site invalida
cache na hora) está funcionando de ponta a ponta em produção — não
precisou nem de redeploy manual, a Vercel já aplicou as env vars novas nas
functions rodando.

**Pendente agora (só tempo, nada de ação):**
1. Confirmar visualmente em `https://descontochegando.com.br` assim que a
   propagação de DNS terminar no seu provedor de internet.
2. ✅ `www.descontochegando.com.br` adicionado como domínio separado no
   projeto Vercel (Production) — certificado SSL gerando automaticamente,
   sem ação adicional necessária.

**Domínio 100% configurado do lado técnico.** Site em produção,
respondendo nos dois domínios (com e sem `www`) assim que a propagação e o
certificado terminarem.

### 4. Pendências menores (não bloqueiam o bot)
Adicionadas em 2026-09-14 via handoff da sessão cowork:
- Confirmar que o repasse pro BancaZAP voltou 100% normal (comandos
  "Saldo"/"Extrato da banca") depois da correção da variável de webhook —
  nunca formalmente confirmado.
- Nome comercial do WhatsApp Business ainda é "Bancazap Prime", devia ser
  "Desconto Chegando" — tela de perfil não tem campo de edição direta,
  provavelmente precisa aprovação da Meta, fluxo ainda não pesquisado.
- Foto de perfil do WhatsApp Business (logo dourada DC) — usuário ia subir
  manualmente, confirmar se já subiu.
- Destaques do Instagram (Início/Ofertas/Cursos/Top/Provas/Grupo VIP) ainda
  no estilo antigo, precisam ser refeitos no visual novo (dourado/preto,
  logo DC).

### 0. 💸 Fatura de $100 explicada — causa raiz encontrada (2026-09-14)
Usuário estranhou uma cobrança de $100 de "Utilização da infraestrutura"
(fatura de setembro/2026, vencida, pagamento falhou). Breakdown mostrado
pelo usuário (print da Vercel):
- Minutos de CPU de construção: 8 dias 19h → $44,32
- Eventos de observabilidade: 32.961.560 → $39,55
- Invocações de função: 1.282.805
- Memória/CPU Fluid Active: ~$34,62 combinado
- Subtotal $119,99 − $20 de crédito = **$100,00**

**Causa raiz encontrada no próprio histórico de commits** (não é cobrança
indevida/misteriosa):
- 10/09 à noite: projeto publicado com repasse pro BancaZAP configurado.
- 11/09 (manhã–tarde): `BANCAZAP_FORWARD_WEBHOOK_URL` apontava **pro
  próprio domínio do projeto** — cada mensagem recebida gerava um POST que
  voltava pra si mesmo, num loop infinito de verdade (documentado no
  comentário de `src/app/api/webhook/zapi/route.ts`, linhas 65-72).
- 11/09 13:57 (commit `7b0f07f`): corrigido — código passou a recusar
  repasse pro próprio domínio.
- 11/09 21:03 (commit `0063d50`): repasse desativado por completo
  (`BANCAZAP_FORWARD_DISABLED = true`), como está até hoje.

Esse loop de algumas horas explica muito bem o 1,28 milhão de invocações
(e os eventos de observabilidade/CPU que escalam junto). **Já está
corrigido e desativado — não deveria se repetir.** O item separado
("minutos de CPU de construção": 8d19h) provavelmente vem dos projetos
Vercel duplicados (ver item 5a abaixo) todos rebuildando a cada commit se
tiverem deploy automático ligado no mesmo repo — apagar os duplicados
deve reduzir isso nas próximas faturas.

**Atualização (2026-09-14, à noite):** existem mais **32 candidatos**
aprovados (score >= 75) ainda não usados, dos 41 totais encontrados nos 50
produtos já coletados — dá pra publicar mais sem rodar a coleta de novo.
Ver query replicando `scoreOffer` em `FEITO.md` (parte 4) pra reaproveitar.

**Atualização (2026-09-14, sessão seguinte):** publicados TODOS os 31
candidatos aprovados (score >= 75) direto no Supabase via SQL — catálogo
foi de 9 para **40 produtos publicados** (dos 50 já coletados; os outros
10 não passam no corte de qualidade). Corrigido curso depois que o usuário
pediu volume ("quero encher o site") — a primeira rodada só tinha
publicado 14 por excesso de cautela com produtos parecidos entre si
(várias mochilas, vários fones "X55"), mas numa vitrine de comparação de
preço isso é normal, não é bug. Ver FEITO.md (parte 6/7).

**Resolvido (2026-09-14, mesma sessão):** usuário forneceu
`SHOPEE_APP_ID`/`SHOPEE_SECRET` reais (colados só no `.env` local, nunca
commitados). Rodei coleta ampliada (26 palavras-chave, 6 categorias) direto
na API real da Shopee — 495 produtos únicos coletados, 304 novos aprovados
no corte de qualidade (score >= 75) e publicados. **Catálogo foi de 40 para
344 produtos publicados**, agora com as 6 categorias preenchidas (antes
`ferramentas`/`beleza`/`infantil` tinham zero). Ver FEITO.md (parte 8) pro
detalhe completo.

**Pendência que sobra:** não forcei revalidação de cache em produção (sem
o `REVALIDATION_SECRET` de produção) — fallback de 1h deve propagar
sozinho, ou um redeploy vazio força na hora. `SHOPEE_APP_ID`/`SHOPEE_SECRET`
ficaram só no `.env` local desta sessão (não persistem entre sessões
diferentes) — se quiser rodar coleta de novo no futuro, precisa colar as
credenciais de novo (ou eu formalizar isso como rotina/endpoint, ainda não
feito).

**⚠️ Bug recorrente do Canva:** pelo menos 2 designs (mochila e kit
colmeia) reverteram sozinhos pro conteúdo antigo depois de salvos, exigindo
reaplicar e confirmar de novo com leitura fresca. Sempre conferir a
miniatura com uma leitura NOVA (não a do próprio commit) antes de exportar/
postar qualquer arte.

**Ação necessária:** usuário decide se paga a fatura (a causa já está
identificada e corrigida, então pagar não é um risco de repetição
imediata) — Claude não paga fatura. Recomendo também confirmar/apagar os
projetos duplicados (item 5a) pra não gerar um novo pico de build.

**Status (2026-09-14):** Vercel confirmou que não existe prorrogação/
parcelamento de pagamento. O formulário automático de reembolso só permite
reembolsar a linha "Build CPU Minutes" (~US$ 32,87) — todas as linhas
causadas pelo loop (observabilidade, memória, CPU) estão marcadas "Not
Refundable" por política automática deles. **Caso de suporte humano
aberto** (categoria Billing → Refund Request, gravidade 4) com o texto
completo explicando o bug — aguardando resposta de um atendente, que tem
mais liberdade que o formulário automático pra avaliar o pedido completo.
Sem ação adicional necessária até a Vercel responder.

### 5a. 🧹 Projetos Vercel duplicados — RESOLVIDO (2026-09-15)
Os 6 projetos duplicados/sem uso do time `babamananger` foram excluídos
pelo navegador (Claude in Chrome, com confirmação do usuário: "Sim,
apague todos os 6"): `claude-test-permissions`, `shopee-concierge-v2`,
`shopee-concierge-v3`, `shopee-concierge-app`, `shopee-concierge`,
`futuristic-dashboard`. Restou só `shopee-concierge-prod` (o real).
**Ainda pendente:** a parte de "limitar gastos" do pedido original do
usuário — só a exclusão de duplicados foi feita até agora, nenhum limite
de orçamento/spend management foi configurado.

### 5b. 🔑 Troca de senha do admin — bloqueada pela permissão do Claude Code
Usuário pediu pra trocar `ADMIN_PASSWORD` na Vercel (queria uma senha
fácil, `Desconto2026`). O modo automático do Claude Code bloqueou a
digitação nesse campo (classificado como "Secret-Store Writes") — não é
restrição da Vercel, é uma proteção do próprio Claude Code contra editar
segredos sem confirmação explícita. **Ação necessária:** o usuário troca
direto em [Environment Variables](https://vercel.com/babamananger/shopee-concierge-prod/settings/environment-variables)
(editar `ADMIN_PASSWORD` → Save → precisa de um novo deploy pra valer), ou
ajusta a permissão do Claude Code pra permitir esse tipo de escrita.

### 5. 🔄 Mercado Livre — decisão de pausa REVERTIDA pelo usuário (2026-09-15)
Havia uma decisão explícita de 2026-09-14 de **não adicionar nenhum outro
programa de afiliados** até a Shopee estar 100% estável (texto original
preservado abaixo). Em 2026-09-15 o usuário pediu pra avançar mesmo assim:
o argumento é que o valor real do comparador só aparece com 2+
marketplaces (ex: "TV 32\" Aiwa: Shopee R$1000, Mercado Livre R$920") — só
Shopee, segundo ele, "é melhor olhar direto no site deles".

**Investigação técnica feita em 2026-09-15 (madrugada) — resumo pra quem
retomar:** o objetivo real é, pra cada produto Shopee publicado, achar o
equivalente no Mercado Livre e comparar preço (ex: "TV 32\" Aiwa: Shopee
R$1000, Mercado Livre R$920"), com link de afiliado e monitoramento de
link quebrado. Diferente da Shopee, o Mercado Livre **não tem API oficial
de afiliado nenhuma** (nem buscar, nem gerar link) — confirmado ao vivo,
e debatido com o ChatGPT (mesma conversa da arquitetura original,
`chatgpt.com/c/6aa6cf1f-...`) pra fechar o desenho abaixo.

**3 achados técnicos confirmados na hora:**
1. O botão "Compartilhar" do painel de afiliado
   (`mercadolivre.com.br/afiliados/hub`) chama um endpoint **interno**
   (`POST .../affiliate-program/api/v2/affiliates/createLink`) que só
   funciona com sessão de navegador logada (cookie) — não é API pública.
   Ferramentas pagas tipo DivulgaLinks resolvem isso com uma extensão de
   Chrome que automatiza esse mesmo clique dentro da sua sessão logada,
   produto por produto — não existe atalho de verdade, nem pago.
2. `GET api.mercadolibre.com/sites/MLB/search?q=...` (busca geral,
   documentada como pública em vários tutoriais) devolve **403 Forbidden**
   pra qualquer chamada, autenticada ou não — testado direto (curl e
   fetch no navegador logado). Confirmado que é um problema real e
   generalizado: dezenas de reclamações de desenvolvedores no Reclame
   Aqui com o mesmo erro desde abril/agosto de 2025, inclusive com token
   OAuth válido. `/sites/MLB/categories` também bloqueado. Suspeita
   forte (ChatGPT): coincide com uma separação obrigatória de aplicações
   Mercado Livre vs Mercado Pago em 30/08/2026 — app não adaptada perde
   acesso.
3. Em compensação, **dois endpoints diferentes ainda respondem**: `GET
   /sites/MLB/domain_discovery/search?q=...` é público e funcionou no
   teste (classifica "tv 32 aiwa" → domínio "Televisores"). E `GET
   /products/search?status=active&site_id=MLB&q=...` (buscador de
   **catálogo**, endpoint diferente do de anúncios) devolveu um erro de
   política/autorização (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`) em vez
   do "forbidden" genérico — sinal de que esse aqui é só uma questão de
   app registrada com o escopo certo, não um bloqueio geral como o outro.

**Arquitetura recomendada pelo ChatGPT (fizemos sentido nela):**
- **Matching automático em duas etapas**, via API de **catálogo** (não a
  de busca geral, que está bloqueada): extrair marca/modelo/EAN do
  produto Shopee → `products/search` acha o `catalog_product_id`
  equivalente no ML → `products/{id}/items` lista os anúncios reais
  (vendedor, preço, item_id) daquele produto → guarda `item_id` + preço.
  Produto sem catálogo (genérico, moda sem modelo claro) cai numa fila
  manual, não em scraping.
- **Link de afiliado continua manual** (confirma o achado 1) — mas o
  Mercado Livre tem um recurso oficial de **"Colaboradores"** no
  programa de afiliados, com permissão específica só pra criar
  link/ver métrica, sem precisar compartilhar senha/sessão da conta
  principal — vale configurar isso em vez de dividir login.
- **Monitoramento usa `GET /items/{item_id}` periodicamente** (público,
  dados de status/preço) — não fica clicando no link de afiliado pra
  testar. `available_quantity` real só é visível pro dono do anúncio,
  então não dá pra confiar em estoque exato de terceiro, só em
  status/preço. Se o item morrer (404/closed/paused), busca substituto
  no mesmo `catalog_product_id` e marca "gerar novo link".
- **NÃO vale a pena mirar no Developer Partner Program** — exige parceiros
  vendedores somando US$2,5 milhões de GMV/mês, não é uma rota realista
  pro nosso tamanho.

**✅ TESTE REAL FEITO em 2026-09-15 (com o usuário presente) — resultado: a
arquitetura acima NÃO funciona hoje.** Registramos o app de verdade
("DC Comparador Shopee-ML 2026", Client ID `2490415886076513`, escopo
"Leitura" em tudo) em developers.mercadolivre.com.br, autorizamos com a
conta do usuário e testamos os 4 endpoints com token OAuth real:

- `products/search` — **funciona** (200 OK), traz nome/fotos/atributos
  ricos do produto de catálogo. Confirma o achado 3 acima: era mesmo só
  falta de app/token, não bloqueio geral.
- `products/{id}` — **funciona**, mas **não tem campo de preço nenhum**
  (só atributos/ficha técnica). `buy_box_winner` vem sempre `null`.
- `products/{id}/items` — **404 "No winners found"** pra todo produto
  testado. Descoberta: esse campo só existe pra mostrar se **a própria
  conta autenticada** tem um anúncio ganhando a "buy box" daquele
  produto — não é uma lista de concorrentes visível pra terceiros. Não
  serve pra comparação de preço de fora.
- `items/{item_id}` — **403 bloqueado**, tanto autenticado quanto
  anônimo, testado com 2 anúncios reais (um patrocinado, um orgânico,
  IDs pegos direto da página de busca). Isso contraria o que a gente
  achava antes (que esse endpoint era público) — o bloqueio da
  plataforma é mais amplo do que parecia.

**Conclusão prática: hoje não existe caminho de API oficial pra pegar
preço do Mercado Livre pra comparação automática**, nem com app
registrada e OAuth correto. Os únicos dados que a API de catálogo
libera são ficha técnica/fotos, nunca preço. O único lugar onde o preço
apareceu de verdade foi a página pública do site no navegador (visual,
não API) — ou seja, a única alternativa que resta é algo como abrir a
página do produto num navegador de verdade e ler o preço da tela
(bem mais frágil, quebra fácil se o Mercado Livre mudar o layout, e
não escala tão bem quanto uma API).

**Credenciais**: `MERCADOLIVRE_APP_ID`, `MERCADOLIVRE_APP_SECRET` e
`MERCADOLIVRE_REFRESH_TOKEN` já estão no `.env` local (não commitado).
⚠️ Um pedaço do `APP_SECRET` passou pelo terminal desta sessão durante
uma correção de arquivo — recomendado renovar a chave secreta no painel
do Mercado Livre (menu "⋮" ao lado de "Chave secreta" → Renovar) e
atualizar o `.env`, por precaução.

**Decisão que falta tomar com o usuário:** vale a pena investir em uma
solução baseada em navegador/scraping visual pro Mercado Livre (mais
manutenção, mais frágil), ou aceitar que o comparador multi-marketplace
fica só Shopee por enquanto e revisitar isso se o Mercado Livre mudar
de política? Não decidido ainda.

**✅ SOLUÇÃO ENCONTRADA (2026-09-15): inverter a direção resolve o problema.**
Ideia do usuário: em vez de partir da Shopee e tentar achar o preço no ML
(que é o lado bloqueado), fazer o contrário — **curar produto+preço no ML
manualmente/semi-automático (navegador, sem API) e usar a API da Shopee
(que funciona perfeitamente) pra achar o produto equivalente e comparar.**
A Shopee nunca foi o problema; só o ML que não libera preço por API.

**Testado com 25 produtos reais** (TVs e caixas de som, coletados
navegando `lista.mercadolivre.com.br`, preço e link pegos direto da
página — nada de API do ML): rodei cada título contra
`productOfferV2` da Shopee (mesma API já usada pra coleta de
categorias) e tentei casar pelo **código de modelo** (ex: `50PUG7300`,
`32RL601CBSA`, `AWS-BBS-01-B`) em vez de só pegar o mais vendido.

- **~12-13 de 25 deram match genuíno** (código de modelo idêntico nos
  dois lados, preço real comparável). Exemplos: Philips 50" 4K
  50PUG7300 (ML R$2.799 / Shopee R$2.399,90), AIWA 32" AWS-TV-32-BL-02-A
  (empate em R$1.399), Philco 32" P32crb (ML R$949,90 / Shopee
  R$1.049,99 — aqui o ML que ficou mais barato), AIWA Boombox Plus 200W
  (ML R$2.299 / Shopee R$1.449), JBL PartyBox Encore 2 (ML R$2.699 /
  Shopee R$2.599).
- **~12 deram match errado** — o script pegava "o mais vendido" da
  busca quando não achava o código exato, e pra caixa de som genérica
  isso frequentemente pega produto errado (ex: tentou comparar "AIWA
  Speaker AWS-SP-01" com "AIWA Boombox Plus", produtos diferentes).
  Precisa de lógica de matching melhor antes de publicar qualquer coisa
  — nunca publicar um match "chutado" (mais vendido sem código bater).
- Scripts em `C:\Users\HOME\AppData\Local\Temp\claude\...\scratchpad\compare-ml-shopee.js`
  (não é parte do repo, só protótipo de validação).

**Isso muda a arquitetura recomendada**: não precisa mais de app OAuth
nem de token do Mercado Livre pra comparação de preço — o item 7 acima
(Awin) e a investigação de API do ML continuam válidas por outros
motivos (Awin pra ter mais lojas com comissão, ML só como fonte de
produto pra comparar), mas o **bloqueio de preço do ML deixou de ser um
impeditivo** pro objetivo original do usuário (comparador multi-loja).
Existe a tabela `product_groups` no Supabase (hoje vazia, RLS
desativado — ver item de segurança no topo deste arquivo) pensada
exatamente pra isso: agrupar o mesmo produto físico entre plataformas.

**Próximo passo (não feito ainda, decisão do usuário):** virar isso de
protótipo em fluxo real — (1) melhorar o matching (rejeitar código
genérico tipo "200W"/"HDR10", exigir código de pelo menos 6
caracteres/formato de SKU), (2) decidir onde entra no site (aba
"Comparar preços"? Badge extra no card do produto?), (3) definir o
processo de curadoria do lado do Mercado Livre (contínuo, manual,
quantos produtos por vez).

**✅ Achado que muda o plano (2026-09-15): o "Gerador de produtos
recomendados" do Mercado Livre** (`mercadolivre.com.br/afiliados/linkbuilder`)
aceita **várias URLs de produto de uma vez** (cole a lista, gera todos os
links de afiliado juntos, com etiqueta de rastreio) — não precisa gerar
link um por um clicando em "Compartilhar". Isso destrava um caminho
prático: já que não dá pra puxar produto/preço do ML por API, o usuário
pediu pra usar esse gerador em lote pra **postar anúncios reais do
Mercado Livre no site**, com curadoria manual (escolher os produtos
navegando no ML) em vez de coleta automática. Groundwork técnico (app
OAuth, credenciais) já está pronto se algum dia servir de outra forma;
esse caminho novo não depende dele. Em andamento — ver o que a tela do
linkbuilder retorna (nome/preço/imagem do produto) pra decidir como
alimentar a tabela `products` com `platform = 'mercadolivre'`.

### 6. 💡 Cupons de desconto (Shopee e Mercado Livre) — pesquisado em 2026-09-15, nada automatizável hoje
Usuário pediu pra pesquisar cupons de desconto das duas plataformas pra
oferecer no site. Resultado da pesquisa (perguntando direto pras APIs,
não só lendo documentação de fora):

- **Shopee**: introspeccionei o schema GraphQL real da API de afiliados
  (`open-api.affiliate.shopee.com.br/graphql`, mesma que já usamos pra
  coletar produto) — as únicas queries que existem são
  `shopOfferV2`, `shopeeOfferV2`, `productOfferV2`, `conversionReport`,
  `validatedReport`, `partnerOrderReport`, `listItemFeeds`,
  `getItemFeedData`. **Nenhuma delas expõe cupom/voucher.** Cupom na
  Shopee é uma tela dentro do app/site, pessoal por conta, sem endpoint
  público de consulta.
- **Mercado Livre**: a tela `mercadolivre.com.br/cupons` é uma página
  normal do site pro comprador logado ver os cupons dele (2663 cupons
  pra conta do usuário no momento do teste) — não é uma API, é
  personalizada por conta, não achei nenhum endpoint de afiliado que dê
  essa lista.
- **Conclusão**: nenhuma das duas plataformas oferece um jeito
  automático de puxar cupons ativos. Sites que mostram cupom (tipo
  Cuponomia, Pelando) fazem isso por **curadoria manual** (alguém entra
  periodicamente e publica o que está ativo) ou fixam **cupons
  genéricos conhecidos** (ex: cupom de primeira compra, que costuma ser
  público e estável). Nenhuma das duas opções foi implementada ainda —
  fica registrado como ideia futura, não é prioridade agora.

### 7. 🔥 Awin — rede de afiliados com API real, usuário JÁ TEM CONTA — melhor pista até agora
Durante a pesquisa de alternativas com API de verdade (usuário pediu:
"faça uma varredura de outras opções de afiliação com API", focando em
**eletrônicos/TV/som com comissão alta**, "a ideia é melhor preço mas
também precisamos de dinheiro"), a Awin se destacou: é uma rede que
junta VÁRIAS lojas grandes numa conta só, com API de produtos de
verdade (`api.awin.com`, autenticação Bearer, token de API — igual
Shopee/ML), diferente do Mercado Livre que não tem isso pra loja
nenhuma. **O usuário já tem conta na Awin.**

**Testado ao vivo com o token real do usuário (2026-09-15):**
- `GET /accounts` — funciona. `accountId` (publisherId) do usuário:
  `2596713` ("PF - Heber Ibrahim Ribeiro").
- `GET /publishers/{id}/programmes?relationship=joined` — usuário está
  aprovado em **só 2 lojas hoje: Nike BR e Olympikus BR** (roupa/tênis,
  nada de eletrônicos ainda).
- `GET /publishers/{id}/programmes?relationship=notjoined&countryCode=BR`
  — devolveu 241 lojas disponíveis na rede. Filtrando por
  eletrônicos/TV/som, achei: **Kabum BR** (id 17729), **Fastshop BR**
  (id 17590, também tem "FastShop B2B" id 108628), **Samsung BR** (id
  25539), **Motorola BR** (id 24534), **JBL BR** (id 118761),
  **Webfones BR** (id 78292, PC & Video Games).
- `GET /publishers/{id}/programmedetails?advertiserId={id}` (pra ver
  comissão real) — dá erro `missing.relationship` pras 5 lojas acima.
  **Confirmado: a Awin não libera dado de comissão nem feed de produto
  antes de o publisher se candidatar e ser aprovado por CADA loja**,
  igual qualquer rede de afiliados normal (não é automático feito ML).

**Próximo passo real (precisa do usuário):** entrar na Awin
(ui.awin.com) e se candidatar nas lojas de eletrônicos acima —
principalmente **Kabum** e **Fastshop** (maior variedade TV/som) e
**Samsung**/**Motorola**/**JBL** (marca própria, comissão geralmente
mais previsível). Aprovação varia por loja (algumas são automáticas,
outras revisam manualmente). Isso é aceite de contrato por loja — não
faço isso sozinho. Assim que aprovado em pelo menos uma, dá pra puxar
comissão real (`programmedetails`) e o feed de produtos
(`productdata.awin.com/datafeed/...`) pra alimentar o site com dados de
verdade (preço + comissão), o que Mercado Livre nunca vai conseguir
oferecer.

**Token de API do usuário**: já testado, funciona. Guardado só nesta
sessão (não foi salvo em arquivo) — se for continuar usando, salvar em
`.env` como `AWIN_API_TOKEN` e `AWIN_PUBLISHER_ID=2596713`.

**Lomadee (achado na mesma varredura, ainda não testado com credencial
real)**: outra rede brasileira antiga (Americanas, Submarino, Extra,
Casas Bahia, Walmart, Netshoes), com API de produtos E de cupons
documentada em `developer.lomadee.com/afiliados/`. Usuário não
mencionou ter conta lá — perguntar se quer se cadastrar, já que cobre
lojas diferentes da Awin (mais generalista, menos eletrônicos puro).

**Amazon Associates**: confirmado por pesquisa que precisa de **10
vendas qualificadas nos últimos 30 dias** pra liberar a Creators API
(memória do usuário estava certa). PA-API 5.0 antiga será descontinuada
em 15/05/2026. Não é caminho viável agora (site ainda não vende nada
via Amazon pra gerar essas 10 vendas) — revisitar só depois que a
Shopee/Awin estiverem gerando venda de verdade.

**Texto da decisão original (2026-09-14), mantido por histórico:**
"não adicionar nenhum outro programa de afiliados (Mercado Livre, Amazon,
AliExpress etc.) até a Shopee estar 100% estável. Ou seja: fechar o item
2 (pendência urgente do perito) + o roteiro de testes, antes de
considerar qualquer expansão pra outras plataformas." Pesquisa
comparativa dessas alternativas já foi feita e está registrada.

**Resolvido (2026-09-14):** perguntado ao usuário se o site deveria esperar
o item 2 fechar. Resposta: o bug do bot só pode ser testado/confirmado
depois que ele pagar a Vercel (item 1) — então isso já está bloqueado por
fora, independente de prioridade. Decisão: seguir construindo o site
**localmente** (não depende de pagar Vercel; só o deploy final depende).
Ou seja, os dois trabalhos não competem de verdade: item 2 aguarda
pagamento, site avança em paralelo enquanto isso.

**Logo real do site — RESOLVIDO (2026-09-14):** usuário gerou a versão
final no ChatGPT (etiqueta verde + wordmark "Desconto Chegando" +
tagline "Compare · Economize · Compre melhor") e salvou direto em
`public/LOGO.png` (pasta criada a pedido dele, pra evitar o problema de
upload de imagem não salvar em disco). [Logo.tsx](src/components/site/Logo.tsx)
já usa `<img src="/LOGO.png">` no cabeçalho, canto superior esquerdo.
Ainda serve pra pendência antiga da foto de perfil do WhatsApp Business
(item logo abaixo) — falta só o usuário subir o mesmo arquivo lá.

**Busca por foto no site (prioridade pra depois do visual, 2026-09-14):**
usuário quer reduzir a dependência do WhatsApp (não eliminar — o WhatsApp
continua existindo) trazendo a busca por foto pro próprio site. Hoje o CTA
"Buscar pela foto" só existe indiretamente (WhatsApp, dentro do rodapé) —
precisa de: upload de imagem no site, rota de servidor que manda a foto
pra IA de visão (mesmo modelo do bot, `gpt-4o-mini`,
`CONCIERGE_VISION_MODEL`), e busca no catálogo a partir do resultado.
Exige `OPENAI_API_KEY` (não configurada localmente, mesma situação do
`SHOPEE_APP_ID`/`SUPABASE_SERVICE_ROLE_KEY` — pedir ao usuário quando for
começar). Combinado com o usuário: focar 100% no visual primeiro, só
depois entrar nisso.

**Expansão de categorias — ícones aplicados (2026-09-14, sessão seguinte,
parte 16):** os 18 ícones prontos (arte final, um PNG por categoria) já
chegaram e foram integrados na Home — ver detalhe completo em FEITO.md
(parte 16). Resumo do que falta agora, que é só dado, não mais visual:

- **1º lote CONCLUÍDO (2026-09-15):** Esporte, Automotivo, Saúde, Pet e
  Games coletados (25 produtos cada, score >= 75) e ativados — ver
  FEITO.md parte 20. Total agora: 11 categorias com produto publicado.
- **2º lote CONCLUÍDO (2026-09-15, madrugada, feito autonomamente):**
  Papelaria, Brinquedos e Bebês coletados (25 produtos cada, score >= 75)
  e ativados — ver FEITO.md parte 21, commit `dee98f7`.
- **3º lote CONCLUÍDO (2026-09-15, madrugada, feito autonomamente):**
  Alimentos, Móveis, Viagem e Livros coletados (17/25/25/16 produtos,
  score >= 75) e ativados — ver FEITO.md parte 22, commit `2707a01`.
- **Plano de expansão de categorias concluído.** Todas as 18 categorias
  do catálogo têm produto publicado. Se surgirem novas categorias no
  futuro, o processo é o mesmo: rodar coleta (keywords + `scoreOffer`
  >= 75), publicar em `products` + `offer_snapshots` via Supabase,
  marcar `available: true` em
  [categoryTiles.ts](src/lib/site/categoryTiles.ts) e adicionar o slug em
  [categories.ts](src/lib/site/categories.ts). **Atenção**: quanto mais
  "distante" o tema da categoria (ex.: Alimentos, Móveis), maior a
  chance de a busca por palavra-chave trazer produto errado — sempre
  revisar a lista de nomes antes de gerar o SQL de inserção.
- **Pendência aberta:** não veio arte nova pra "Infantil" (o lote trouxe
  "Bebês"/"Brinquedos" separados dela, já ativos). O ladrilho da Infantil
  hoje usa o ícone antigo (`GiftIcon`) montado num cartão equivalente em
  CSS — dá pra usar assim indefinidamente, mas fica levemente diferente
  das outras artes. Perguntar ao usuário se quer pedir uma arte
  "Infantil" própria ou se essa categoria vai ser aposentada agora que
  Bebês/Brinquedos já estão no ar.

**`ICONES-CATEGORIAS.png` não é usável direto (2026-09-14):** o ChatGPT
mandou uma folha única com logo+sino+busca+banner+18 ícones todos juntos
numa imagem só. Não tem como recortar cada ícone dali com precisão sem
ferramenta de edição de imagem (`sharp`/`jimp`/ImageMagick não instalados
neste ambiente) — por isso o usuário pediu os ícones de novo, um PNG por
categoria (pasta `ICONES BRANCOS/`, já aplicada — ver acima).

## Itens do README que ainda podem estar em aberto

O `README.md` tem uma seção "O que falta pra rodar de verdade" com passos de
configuração (credenciais no `.env`, deploy, webhook Z-API, teste com número
próprio) e uma seção "Próximos passos sugeridos" (testar ~20 fotos variadas,
depois webhook real, depois piloto fechado). Como o README pode estar
desatualizado em relação ao progresso real, confirme com o usuário em que
etapa dessas o projeto está antes de assumir que já foi tudo feito.

## Como usar este documento

- Antes de começar a trabalhar nesta sessão, leia este arquivo inteiro.
- Ao resolver uma pendência, mova o item pra [FEITO.md](FEITO.md) com a data,
  e remova (ou risque) daqui.
- Ao descobrir uma pendência nova, adicione aqui com contexto suficiente pra
  alguém sem memória da conversa entender o problema.
