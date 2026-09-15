# Continuidade — Shopee Concierge (Descontos Chegando)

> Este documento existe pra qualquer sessão (Claude ou humana) saber, em 2 minutos,
> o que ainda está pendente. Atualize sempre que resolver ou descobrir algo novo.
> Complementa o [FEITO.md](FEITO.md), que registra o que já está pronto.

**Última atualização:** 2026-09-14

## Pendências ativas

### 🚨 Segurança (achado em 2026-09-15): RLS desativado em `product_groups`
O Supabase apontou automaticamente ao listar as tabelas do projeto
`babamanager-pro`: a tabela `public.product_groups` está com Row Level
Security **desativado** — qualquer um com a chave anon (a mesma exposta
no client-side) consegue ler ou escrever nela livremente. Hoje ela só
guarda ids de agrupamento (produto físico em marketplaces diferentes),
nada sensível, mas ainda é uma falha de configuração real. Não corrigi
sozinho porque ativar RLS sem política de acesso definida bloquearia todo
acesso à tabela (inclusive o legítimo). Precisa decidir com o usuário:
manter aberta (aceitável enquanto for só metadado não-sensível) ou
definir uma política (ex: leitura pública, escrita só via service role).

### 💡 Ideia (2026-09-15): painel admin
Usuário quer um painel pra acompanhar cliques, buscas e (idealmente)
receita/saldo de vendas. Ciente de que receita real da Shopee não dá pra
puxar por API (só existe no painel de afiliado deles) — combinado que o
painel mostra o que dá pra medir de verdade (cliques, buscas) e deixa um
jeito de lançar receita manualmente depois (lançamento manual ou upload
de extrato, ainda não desenhado). Não iniciado ainda — precisa decidir:
- Autenticação: hoje o site não tem login nenhum; proposta é uma senha
  simples via variável de ambiente + cookie assinado, sem tabela de
  usuário.
- Registro de eventos: nenhum clique/busca é logado hoje — precisa de
  tabela nova (`site_events` ou similar) + instrumentar os pontos de
  clique (cards de produto, ambos ProductCard e LiveProductCard) e a
  busca (`/busca`).

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

### 5a. 🧹 Projetos Vercel duplicados — limpeza pendente
Usuário notou (2026-09-14) que a Vercel tem vários projetos com nome
parecido: `shopee-concierge`, `shopee-concierge-prod` (o real, confirmado
saudável), `shopee-concierge-app`, `shopee-concierge-v2`,
`shopee-concierge-v3`. Confirmado via `get_project`: as 4 duplicadas
retornam 404 pra minha integração MCP — elas vivem em outro time/conta
Vercel do usuário, fora do escopo que essa integração enxerga (mesmo
problema de escopo já registrado em [[reference-shopee-concierge-infra]]
na memória).

- **Não apagar `shopee-concierge-prod` de forma alguma** — é o deploy real
  do bot.
- **Ação necessária:** ou (a) o usuário reconecta a integração Vercel pro
  time/conta certo, pra eu poder checar último deploy/domínio/repo de cada
  duplicada antes dele apagar, ou (b) o usuário mesmo checa isso no painel
  (Último Deploy, Settings → Domains, Settings → Git) e me diz o que viu.
  Perguntei os dois caminhos, usuário ainda não decidiu — retomar quando
  ele quiser.

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

**Próximo passo real (precisa do usuário, não dá pra eu fazer sozinho):**
registrar uma aplicação em developers.mercadolivre.com.br (login com a
conta do usuário, aceite de termos — ação de conta, não faço isso
sozinho) e testar de verdade, com OAuth de app válida, estes 4 endpoints
antes de escrever qualquer código de integração:
`products/search`, `products/{id}`, `products/{id}/items`,
`items/{item_id}`. Só depois desse teste real dá pra saber se o
matching automático dos 80-90% "com catálogo" realmente funciona como o
ChatGPT projetou, ou se cai tudo pra fila manual.

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
