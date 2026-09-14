# Feito — Shopee Concierge (Descontos Chegando)

> Registro do que já está pronto e validado, em ordem cronológica (mais recente
> primeiro). Complementa o [CONTINUIDADE.md](CONTINUIDADE.md), que lista o que
> ainda falta. Quando resolver algo do CONTINUIDADE.md, registre aqui com a data.

## 2026-09-14 (sessão à noite, parte 4) — 6 novos produtos publicados sem precisar de credenciais novas

Descoberto que existem **41 produtos** já coletados pelo Growth OS (dos 50 no
banco) que passam nos mesmos cortes de qualidade (hard cuts + score >= 75)
mas nunca foram promovidos a `deal_candidates` — só 3 tinham sido
promovidos na primeira rodada. Replicada a fórmula exata de
`scoreOffer`/`selectTopCandidates` (`src/lib/growth/dealScoring.ts`) direto
em SQL contra o snapshot mais recente de cada produto, sem precisar rodar o
pipeline de novo (sem SHOPEE_APP_ID/OPENAI_API_KEY).

**6 escolhidos por diversidade de categoria** (evitando duplicar mochila/
colmeia já publicadas) e publicados no site + Canva:
1. Abajur Recarregável Touch — R$29,99, nota 4,8 (`casa`)
2. Carregador Original iPhone 20W — R$25,99, 56% OFF (`eletronicos`)
3. Ventilador c/ Luminária LED — R$39,89, 56% OFF (`casa`)
4. Fone TWS X55 Bluetooth — R$19,03, 52% OFF (`eletronicos`)
5. Lampião Solar Recarregável — R$24,96, 55% OFF (`casa`)
6. Caixa Organizadora Multiuso — R$13,99, 57% OFF (`casa`)

Pra cada um: `product_link`/`offer_link` reais confirmados no banco, slug
gerado pela função real do site, `highlight_reason` escrito, arte no Canva
(cópia do template `DAHVL6qARro`, já com o quadro de foto corrigido),
exportada e verificada com leitura fresca pós-commit. Total agora: **9
produtos publicados** (3 do lote 1 + 6 deste lote).

**Nota sobre preço "de/por":** só usado quando o desconto declarado
implica um "preço antigo" plausível (< ~2,5x o preço atual); quando o
desconto parecia inflado (ex.: mochila com 76% OFF implicando quase R$500
de original), preferimos badge de prova social (nota/vendas) em vez de um
"de/por" que não dá pra confirmar. Nenhum dos 6 deste lote precisou dessa
ressalva.

## 2026-09-14 (sessão à noite, parte 3) — descoberta: Shopee tem parceria oficial de afiliados com o Instagram

Descoberto ao vivo no app (usuário viu a opção "Adicionar produtos" → "Afiliados da Shopee — 3 a 21% de comissão" na tela de criar post) e confirmado por busca: Shopee e Meta lançaram em 2026 um **Programa de Afiliados oficial** que permite conectar a conta de afiliado Shopee direto no Instagram e marcar produtos de verdade em Feed/Reels (selo "elegível para comissão"), disponível no Brasil. Isso NÃO é violação de política — é o programa oficial, bem melhor que link solto na legenda (mais alcance, tag clicável de verdade).

**3 artes finais publicadas** (Canva → export → pasta `posts-instagram/`): mochila ROMANTIC CROWN, kit colmeia organizadora, luminária solar — cada uma com foto real, dados verificados (nota/vendas/desconto), e legenda com link.

**Links de produto (URL direta, não o link curto) pra usar em "Adicionar produtos" no Instagram:**
- Mochila: `https://shopee.com.br/product/1345043704/22497773735`
- Kit Colmeia: `https://shopee.com.br/product/1464118632/23798178107`
- Luminária: `https://shopee.com.br/product/1003085235/22697063003`

**Fluxo por post:** vincular "Afiliados da Shopee" no Instagram (uma vez, ação pessoal do usuário — exige login/consentimento dele) → criar post com a imagem → "Adicionar produtos" → colar o link do produto → colar legenda (`posts-instagram/legendas.md`) → publicar.

## 2026-09-14 (sessão à noite, parte 2) — migration aplicada + primeiros produtos reais no site

- **Atualização automática de preço implementada**: quando o Growth OS
  grava um snapshot novo (`persistOfferSnapshot` em `src/lib/db/snapshots.ts`)
  pra um produto já publicado no site, ele agora chama
  `notifyCatalogUpdate` (`src/lib/site/notifyRevalidate.ts`), que faz um
  POST autenticado pra `/api/internal/revalidate-catalog` — o cache do
  site invalida na hora, sem esperar o fallback de 1h. Testado localmente
  de ponta a ponta: 401 sem auth, 401 com auth errada, 200 com auth certa
  retornando as tags certas. Precisa de `SITE_BASE_URL` +
  `REVALIDATION_SECRET` no ambiente (adicionados ao `.env.example`); sem
  eles, é no-op silencioso (não quebra o pipeline de sourcing).
- **Migration `20260914120000_add_site_catalog_fields` aplicada** no
  Supabase `babamanager-pro` de verdade (via MCP) — colunas `slug`,
  `platform`, `category_slug`, `site_published`, `highlight_reason` em
  `products`, e a view `site_catalog` criadas e confirmadas.
- **3 produtos reais publicados no site** (dos 6 `deal_candidates` com
  score ≥ 75 já coletados pelo Growth OS, 3 únicos após dedupe): mochila
  ROMANTIC CROWN (nota 5,0, ~6 mil vendas, categoria `moda`), kit colmeia
  organizadora (nota 4,9, ~4 mil vendas, categoria `casa`), luminárias
  solares (nota 4,8, ~3 mil vendas, categoria `casa`) — cada um com slug
  gerado pela função real do site (`buildProductSlug`) e uma frase de
  `highlight_reason` justificando a escolha. Confirmado via SQL que
  `site_catalog` devolve os 3 corretamente, com imagem e link de afiliado.
- **Ainda não visualizado no navegador com dado real**: falta a
  `SUPABASE_SERVICE_ROLE_KEY` no `.env` local pra rodar `npm run dev`
  contra o banco de verdade (a ferramenta MCP do Supabase só expõe
  anon/publishable key por segurança — corretamente não tentei contornar
  isso). Pedir ao usuário essa chave (já está nas env vars do projeto na
  Vercel) pra fechar essa verificação visual.

## 2026-09-14 (sessão à noite) — Fase 1 do site implementada localmente

Construído dentro do repo existente (mesmo Next.js 14.2, mesmo projeto),
seguindo [ARQUITETURA-SITE.md](ARQUITETURA-SITE.md). Sem produtos reais
publicados ainda — tudo testado em estado vazio, mas a estrutura toda
funciona (build de produção e dev server sem erros).

**Banco de dados:**
- Migration versionada `supabase/migrations/20260914120000_add_site_catalog_fields.sql`
  (NÃO aplicada no Supabase ainda): adiciona `slug`, `platform`,
  `category_slug`, `site_published`, `highlight_reason` em `products`, e
  cria a view `site_catalog` (produto + snapshot mais recente numa linha
  só, só os `site_published = true`).

**Camada de dados (`src/lib/site/`):**
- `catalog.ts` — `getCachedHomeOffers`, `getCachedCategory`,
  `getCachedProduct`, `searchProducts`, todas via `unstable_cache` + tags
  (`home:offers`, `category:<slug>`, `product:<slug>`), lendo só da view
  `site_catalog` (nunca a API Shopee ao vivo). Funciona sem `.env` local
  (retorna vazio em vez de quebrar) — permite rodar `npm run dev` sem
  credenciais.
- `categories.ts` — lista fixa de 6 categorias (Casa, Eletrônicos,
  Ferramentas, Beleza, Moda, Infantil).
- `slug.ts` — slug imutável (nome + sufixo curto determinístico a partir
  do `shopee_item_id`, hash djb2 sem dependência externa).
- `affiliateLink.ts` — por enquanto só repassa o `offer_link` já existente
  no snapshot. Tracking de origem por subId ficou fora desta fase (ver
  correção abaixo).
- `format.ts` — formatação de preço BRL, nota e vendas.

**Páginas (`src/app/`):**
- `/` — Home: busca (form GET nativo pra `/busca`), CTA de foto pro
  WhatsApp, chips de categoria, grid de ofertas do dia.
- `/categoria/[slug]` — SSG (`generateStaticParams` pras 6 categorias).
- `/produto/[slug]` — dinâmica, com `generateMetadata` (title/description/OG)
  e JSON-LD `Product` (schema.org), badge "NOSSA ESCOLHA", CTA "Ver na
  Shopee" com `rel="sponsored noopener noreferrer"`.
- `/busca` — busca simples (`ilike`) sobre o catálogo já publicado, nunca
  ao vivo na Shopee.
- `sitemap.ts` / `robots.ts` — gerados dinamicamente a partir das
  categorias fixas + produtos publicados.
- `/api/internal/revalidate-catalog` — Route Handler autenticado
  (`Authorization: Bearer ${REVALIDATION_SECRET}`), recebe um evento
  tipado (`product_updated`) do Growth OS e decide sozinho quais tags
  invalidar — nunca aceita tag arbitrária.
- A antiga home (status técnico do bot) foi movida pra `/status` — `/` era
  usado só pelo bot até então, agora é o site público.

**Visual:** `src/app/globals.css` com paleta dourado (`#c8a24a`) + preto
(`#16130f`), mobile-first, componentes em `src/components/site/`
(Header, Footer, Logo — texto por enquanto, trocar quando tiver o arquivo
da logo dourada DC —, SearchBox, CategoryChips, ProductCard, ProductGrid).

**Verificado:** `npx tsc --noEmit` limpo, `npm run build` gera as 17 rotas
sem erro (Home e categorias estáticas, produto sob demanda — exatamente a
geração híbrida do plano), testado visualmente no navegador em viewport
mobile (375×812) via dev server local — Home, categoria, busca, 404 de
produto inexistente e `/status` todos renderizando corretamente.

**Correção descoberta durante a implementação:** os `subIds` da Shopee só
aceitam tokens curtos/simples (comentário existente em
`src/lib/shopee/queries.ts`: "a Shopee rejeita valores longos/compostos").
O esquema de tracking por origem (`site_home`, `site_produto_x` etc.)
combinado no debate com o ChatGPT não é viável do jeito que foi desenhado —
precisa ser refeito com tokens curtos gerados na coleta, não em tempo real
na página. Registrado como pendência em CONTINUIDADE.md.

## 2026-09-14 (handoff da sessão cowork) — correções de fato + bug crítico do perito

- **Correção de fato**: o deploy em `shopee-concierge-prod.vercel.app` é
  real e está saudável (`/api/health` → `ok:true`, todas env vars
  presentes, banco ok). Uma nota anterior deste mesmo dia, que concluiu que
  esse projeto Vercel "não existia", estava errada — era um ponto cego da
  integração MCP desta sessão, que não tem acesso a esse projeto/conta.
- **Correção de fato**: o canal do WhatsApp não é um número dedicado
  separado — é o **número do BancaZAP Prime** (+55 71 8430-2570),
  reaproveitado como canal público do Concierge, com o repasse pro backend
  do BancaZAP desativado (`BANCAZAP_FORWARD_DISABLED=true`).
- **Bug crítico real do "perito nunca consultado" encontrado e corrigido**
  (commit `e0b7749`, mesclado e deployado): `consultExpertVision` tinha um
  retorno antecipado quando a lista de candidatos pós-filtro visual vinha
  vazia — o Astra nunca era chamado de verdade, mesmo o log dizendo que
  tinha escalado (era só fallback local). Corrigido: `searchRankAndCompare`
  agora preserva o shortlist original antes do filtro visual e passa ele
  pro perito nesse cenário. **Efetividade ainda não confirmada** — ver
  CONTINUIDADE.md item 2 (pendência urgente).
- Pipeline completo mapeado arquivo por arquivo: `recognize.ts` →
  `queries.ts` → `rank.ts` → `compare.ts` → `rank.ts` (2ª passada) →
  `confidenceRouter.ts` → `expertVision.ts` → `orchestrator.ts` (com
  `visualHealth.ts`) → `reply.ts`.
- Decisão estratégica do usuário registrada: sem novos programas de
  afiliado até a Shopee estar 100% estável (ver CONTINUIDADE.md item 5).

## 2026-09-14 (sessão à tarde) — arquitetura do site definida

- **Domínio investigado**: `descontochegando.com.br` não estava conectado
  à Vercel (achado incorreto assumido em nota anterior) — está na
  Hostinger, servindo um WordPress zerado ("Hello world"). Conteúdo real
  (landing page simples pro grupo do WhatsApp) foi perdido/resetado.
- **Escopo do domínio redefinido**: em vez de restaurar a landing simples,
  decidido transformar o domínio num comparador de preços de verdade
  (Shopee primeiro, outras plataformas depois).
- **Debate técnico completo com o ChatGPT** (conversa "Ajustar falas do
  bot") sobre como construir isso — decisão registrada em
  [ARQUITETURA-SITE.md](ARQUITETURA-SITE.md): mesmo repo/mesmo Vercel,
  motor único compartilhado entre WhatsApp e site, site lê snapshots do
  Supabase (nunca a API Shopee direto), `/produto/[slug]` já na Fase 1 só
  pra catálogo aprovado (score >= 75), cache via `unstable_cache` +
  `revalidateTag` compatível com Next.js 14.2 (versão real do repo).
- Documentos de continuidade (`CONTINUIDADE.md`/`FEITO.md`) e arquitetura
  (`ARQUITETURA-SITE.md`) criados no repositório pra qualquer sessão futura
  entender o estado do projeto em minutos.
- **Ainda não implementado**: nenhuma linha de código da Fase 1 do site
  foi escrita — isso é só o desenho acordado.

## 2026-09-13 / 2026-09-14

- **Sessão de conversa migrada pra Supabase**: contexto entre mensagens do
  WhatsApp não se perde mais (antes ficava só em memória do processo).
- **Conversas reescritas pra soar mais naturais**: jargão técnico removido
  das respostas que o cliente final recebe.
- **Busca por refinamento implementada de verdade**: "mais barata", "melhor
  qualidade", "mais parecida" agora de fato refazem a busca com o novo
  critério, em vez de só reconhecer a intenção sem agir.
- **Bug de categoria errada corrigido**: produto de categoria totalmente
  diferente não aparece mais como sugestão só por bater uma palavra-chave
  genérica.
- **Bug de confirmação ambígua corrigido**: "Quero" sem especificar o quê
  não confunde mais o roteador.
- **Incidente de bot parado (fotos sem resposta) diagnosticado e corrigido**:
  causa raiz era falta de timeout explícito na function somada ao cartão da
  Vercel recusado (sem forma de pagamento ativa, a Vercel corta a function
  no meio do processamento sob limites mais rígidos). Corrigido: sessão
  travada resetada + `visualCompareTimeoutMs` adicionado em
  `src/lib/concierge/config.ts` pra sempre desistir de forma controlada em
  vez de estourar sem aviso.

## Histórico anterior (via commits do repositório)

Confirmado pelo `git log` do repositório `heberibrahim27/shopee-concierge`:

- Comparação visual real entre a foto do cliente e as fotos dos candidatos
  (`compare.ts`) — substituiu o match só por palavra-chave, que gerava
  sugestões fora de contexto.
- Fan-out de busca visual e revisão de candidatos da segunda busca.
- Normalização de identificadores da Shopee (bug de tipo no GraphQL dos
  subIds corrigido).
- Ancoragem de preço no valor visível na foto + resposta com até 3 opções
  por critério (preço / nota / vendas).
- Envio de texto e imagem na ordem certa nas respostas do WhatsApp.
- Exigência de relevância confirmada antes de escolher por nota/venda/preço
  (evita sugerir produto de categoria errada só por bater termo genérico) +
  teste de regressão pro caso "cera de carnaúba x torneira/moldura".
- Remoção da exigência de gatilho em texto — uma foto sozinha já dispara a
  busca.
- Isolamento confirmado do número do BancaZAP: sem a frase-gatilho, o bot
  ignora a mensagem.
- Cliente Shopee (assinatura + busca + geração de link) testado manualmente
  em 10/09/2026 com conta real, retornando produtos e links de verdade.
- Growth OS Etapa 0/1: sourcing que coleta ofertas reais, grava produtos e
  snapshots no Supabase, aplica cortes e score mínimo de 75, gera até três
  links de afiliado (não publica ainda em WhatsApp/Instagram).

## Infraestrutura já configurada

- Deploy automático na Vercel a cada push em `main` (projeto
  `shopee-concierge-prod`, time `babamananger`).
- Banco Supabase `babamanager-pro` (`czocwdlygdslyuoixmhh`), compartilhado
  com o BancaZAP mas com tabelas isoladas do concierge
  (`concierge_sessions`, `concierge_visual_health`).
- `GET /api/health` valida variáveis obrigatórias e conexão com o banco
  (sem cache), mas não valida credenciais externas nem recebimento real de
  mensagens pela Z-API.
