# Feito — Shopee Concierge (Descontos Chegando)

> Registro do que já está pronto e validado, em ordem cronológica (mais recente
> primeiro). Complementa o [CONTINUIDADE.md](CONTINUIDADE.md), que lista o que
> ainda falta. Quando resolver algo do CONTINUIDADE.md, registre aqui com a data.

## 2026-09-22 — Máquina de Vídeos: CTA agora vende E chama pra seguir

Nova policy field `follow_cta_phrase` (Skill07/Skill08) exige que o
CTA do roteiro contenha, na mesma frase, o mecanismo de venda
(`COMMENT_KEYWORD`="QUERO") e um convite de seguir ("segue"/"seguir").
Prompt precisou de ajuste real (molde único + lembrete final) depois
que a primeira versão foi ignorada 2x pelo gpt-4o-mini — validação
(`SCRIPT_CTA_MISSING_FOLLOW_MENTION`) pegou o erro corretamente nas
duas vezes. Testado ao vivo: `"Comenta QUERO que eu te mando o link, e
já segue aqui que amanhã tem mais achado desses!"`.

## 2026-09-22 — Cupons reais da Awin, ingestão automatizada (fim do processo manual)

Investigação real (Shopee GraphQL schema + todo o dashboard de
afiliados, seções Oferta e Campanhas) confirmou que a Shopee não tem
cupom/voucher/frete-grátis em lugar nenhum pra afiliado. Endpoint real
de Promotions da Awin (`POST api.awin.com/publisher/{id}/promotions`)
testado ao vivo, retorna cupons reais e ativos dos anunciantes já
aprovados (17 hoje: 16 Kabum + 1 Olympikus, nenhum de frete grátis).
Novo cron `/api/cron/source-coupons` substitui o processo manual da
tabela `coupons` — upsert por `promotion_id`, expira os que saem da
lista. Confirmado ao vivo em dev: `{"ok":true,"coletados":17,"ativos":17}`,
conferido direto no Supabase.

## 2026-09-21 (noite) — Farmácia Uruguai (loja própria) como afiliado, com prioridade nas filas

`productOfferV2` aceita `shopId` (achado por introspecção, não
documentado) — dá pra puxar só o catálogo de uma loja. `shopId` real da
Farmácia Uruguai (1738181230) resolvido do link curto do Heber via
tráfego de rede real da página, confirmado batendo produto de verdade
na API. Cron novo `/api/cron/source-farmacia` reaproveita o pipeline da
Shopee (source-deals), score fixo alto (95) pra furar a fila do
Instagram/WhatsApp por pedido explícito. Confirmado ao vivo: 30
produtos publicados, zero falha, e 2 posts reais no Instagram ainda na
mesma noite (Vitamina B12 e Ômega 3 Katiguá) — feed + story + comentário,
sem falha.

## 2026-09-21 (noite) — Automação do grupo real do WhatsApp "Descontos Chegando #GR42"

Grupo achado ao vivo via Z-API (`GET /chats`), renomeado pra "Descontos
Chegando #GR42" (prova social). Cron novo `/api/cron/publish-whatsapp-group`
manda oferta automaticamente: link de afiliado + foto por URL (sem
baixar nada) + texto gerado (abertura casual rotativa, negrito real do
WhatsApp, indica a loja) + link de convite do grupo no rodapé. Roda a
cada 10 min o dia inteiro, mas só envia de fato entre 8h-21h Brasília
(resto do tempo é um `skipped` barato) — resolve o pedido de "de 10 em
10 min das 8h às 21h" sem estourar o limite de 100 crons/projeto da
Vercel. Dedupe próprio (`post_type='whatsapp'`), independente do
Instagram.

## 2026-09-21 (noite) — Kabum entra no cron + comparador de preço automático com a Shopee

Kabum (eletrônicos) passou a ser ingerida pelo `/api/cron/source-awin`
igual Nike/Olympikus, com filtro pra tirar gift card (voucher digital)
e piso de R$40. Confirmado ao vivo: 12 produtos publicados, zero falha.

Além disso, o cron agora tenta achar o mesmo produto na Shopee pra cada
Kabum novo (MPN + marca + teto de razão de preço 2,5x — sem código de
barras em comum entre as duas fontes) e linka via `product_groups` sem
nenhum passo manual. A seção "Compare em outras lojas" da página de
produto (já existia no site, nunca tinha dado real) acendeu sozinha —
confirmado ao vivo em `descontochegando.com.br/produto/...`, 2 pares
reais criados numa execução real, preço fazendo sentido nos dois.

## 2026-09-21 — "Comenta QUERO" funcionando de verdade via ReplyRush + cron de tênis Awin ao vivo

Dois fechamentos reais no mesmo dia:

**Awin**: `/api/cron/source-awin` rodou em produção pela primeira vez —
12 tênis Nike + 12 Olympikus publicados no site, 24 `deal_candidates`
criados (entram na fila do Instagram igual aos da Shopee), zero falha.
Precisou adicionar `AWIN_DATAFEED_KEY` nas env vars da Vercel (só
existia local).

**"Quero" no Instagram**: o webhook próprio nunca ia funcionar com
cliente real (app travado em modo Desenvolvedor pelo CNPJ pendente,
ver CONTINUIDADE.md). Configurado o [ReplyRush](https://replyrush.com)
(plano grátis, Meta Business Partner) como solução real: gatilho de
palavra-chave "quero" → link de `/hoje` + explicação, cobrindo Story e
Caixa de Entrada, sem limite de "uma vez por usuário". Testado ao vivo
pelo Heber, confirmado funcionando.

## 2026-09-17 — Automação "QUERO" no Instagram (webhook próprio) validada entre contas testadoras

Fechado o fluxo: alguém manda "quero" (DM ou resposta de Story) pro
@descontoschegando → webhook próprio (`/api/webhook/instagram`) responde
automaticamente com o link de `/hoje`. Testado ao vivo entre uma segunda
conta e @descontoschegando — resposta automática confirmada chegando.

Setup feito no Meta for Developers (app "Desconto Chegando Automacoes",
App ID `2400373754101189`): permissões (`instagram_business_basic`,
`instagram_business_manage_comments`, `instagram_business_manage_messages`)
adicionadas, conta @descontoschegando vinculada como testador (convite
aceito em Instagram → Configurações → Apps e sites → Convites do
testador), token de acesso gerado (`INSTAGRAM_PAGE_ACCESS_TOKEN` salvo no
`.env` local e na Vercel produção), webhook configurado e verificado
(`INSTAGRAM_WEBHOOK_VERIFY_TOKEN` também salvo nos dois lugares),
assinatura de webhook "Ativado" pra conta. Política de privacidade do app
vinculada à página real do site (`/privacidade`), domínio e categoria
("Compras") preenchidos em Configurações do app → Básico.

**Limitação atual, confirmada pela própria tela "5. Concluir a análise do
app" do Meta**: isso só funciona hoje entre contas com papel de
Testador no app. Pra funcionar com clientes reais (público comentando
"QUERO" de verdade), a Meta exige **Análise do App** (App Review) —
processo que pede vídeo de demonstração do fluxo e pode levar dias.
Ainda não iniciado — decisão do usuário sobre quando começar.

**Nota de infraestrutura**: durante o setup, um `vercel link --project
descontochegando` sem o nome exato criou por engano um projeto vazio
("descontochegando", sem deploys) na Vercel, distinto do projeto real de
produção (`shopee-concierge-prod`). Corrigido religando ao projeto certo;
o projeto vazio ficou pra trás e pode ser apagado manualmente em
Settings → Advanced → Delete Project (não afeta nada, nunca teve deploy).

## 2026-09-15 (sessão seguinte, parte 27) — favicon do site + fix no checker de links (403 falso-positivo da Nike)

**Favicon aplicado**: `public/logoperfil-favicon.png` referenciado via
`metadata.icons` em `src/app/layout.tsx` (`icon` + `apple`). Confirmado
no `<head>` renderizado localmente antes de publicar.

**Bug encontrado no checker de saúde de links** (painel `/admin`, bloco
"Saúde dos Links"): 26 dos 60 produtos checados vinham como "com
problema" (403), todos produtos Nike. Causa raiz: o checker
(`src/app/api/admin/revalidate-links/route.ts`) mandava um User-Agent
que se identifica como bot (`DescontoChegandoBot/1.0`) — a proteção
Akamai da Nike bloqueia isso, mesmo o link funcionando normal pra quem
clica de verdade num navegador. Corrigido trocando pro User-Agent de um
Chrome real + header `Accept`. Efetividade da correção ainda não
reconfirmada rodando "Revalidar agora" pós-deploy.

**Limpeza de infra Vercel** (fora do repo): 6 projetos duplicados/sem
uso excluídos do time `babamananger` (`claude-test-permissions`,
`shopee-concierge-v2`, `shopee-concierge-v3`, `shopee-concierge-app`,
`shopee-concierge`, `futuristic-dashboard`) — restou só
`shopee-concierge-prod` em uso real. Parte de "limitar gastos" ainda não
endereçada (só a parte de excluir duplicados).

## 2026-09-15 (sessão seguinte, parte 26) — 9º par Shopee×Mercado Livre: JBL Go 4

Segunda rodada de comparação cross-marketplace (a primeira foi as 8 Smart
TVs). Curados 4 candidatos reais no Mercado Livre (JBL Tune 510BT, JBL Go
4, Xiaomi Redmi Buds 5, Motorola Moto Buds 125), buscados na Shopee via
API — só **1 dos 4** achou correspondência genuína e verificável (JBL Go
4: R$259,67 no ML vs R$307,90 na Shopee). Os outros 3 foram descartados
porque a Shopee não tinha o modelo exato à venda (só acessórios pro Tune
510BT, só gerações diferentes — Buds 6/8 — pro Redmi Buds 5, e nada pro
Moto Buds 125 especificamente).

**Aprendizado registrado** (útil pra próximas rodadas): produtos com
código de modelo curto/genérico (ex: "510BT", "Go 4", "Buds 5") têm taxa
de match muito menor entre marketplaces do que produtos com código longo
e específico (ex: TV "50PUG7300") — o catálogo de cada marketplace varia
mais nas gerações/variantes de fone e caixa de som do que em modelos de
TV. Taxa real observada: 1/4 (25%) nesta rodada vs. praticamente 100% na
rodada de TVs.

## 2026-09-15 (sessão seguinte, parte 25) — Primeira integração Awin: 52 produtos Nike/Olympikus publicados

Depois de descobrir o caminho certo pra puxar catálogo de produto real da
Awin (chave separada de datafeed, não o token OAuth principal — ver
CONTINUIDADE.md item de Awin), publicados 52 produtos reais (26 Nike BR +
26 Olympikus BR) nas categorias `moda` (roupas/jaquetas) e `esporte`
(tênis/chuteiras), com preço, imagem e link de afiliado (`aw_deep_link`)
reais direto do feed. Também descoberta a API de cupom real da Awin
(`POST /publisher/<id>/promotions`) — achado um cupom ativo (`AQUECE20`,
Olympikus). Novos badges `nike`/`olympikus` em `src/lib/site/platforms.ts`.
Script de ingestão ficou só no scratchpad (não faz parte do repo) —
reusável pra próximas rodadas ou pra quando Kabum/Fastshop/Samsung/
Motorola/JBL/Webfones forem aprovados na Awin.

## 2026-09-15 (sessão seguinte, parte 24) — Painel /admin: senha ativada em produção + 6 blocos operacionais

Dois problemas/entregas nesta parte:

1. **Bug de segurança fechado**: o redeploy que deveria ativar a variável
   `ADMIN_PASSWORD` em produção tinha ficado travado numa sessão anterior
   — resultado, `/admin` ficou publicamente acessível sem senha por um
   tempo (confirmado ao vivo, limpando o cookie e recarregando). Refeito
   o redeploy pelo painel do Vercel (commit `913f985`), confirmado que
   agora `/admin` redireciona pra `/admin/login` corretamente.
2. **6 blocos prioritários do painel implementados**, seguindo a crítica
   do ChatGPT sobre a v1 (que era só um contador de visitas): Resumo,
   Alertas, Produtos, Saúde dos links (com revalidação real sob demanda),
   Ponte Shopee×Mercado Livre, Buscas sem resultado. Duas tabelas novas no
   Supabase (`search_events`, `link_checks`), nova rota
   `POST /api/admin/revalidate-links` (autenticada via
   `isAuthedAdminRequest`, exportada de `src/middleware.ts`). Detalhe
   técnico completo em CONTINUIDADE.md.

## 2026-09-15 (sessão seguinte, parte 23) — Mercado Livre: app registrado e testado de verdade, resultado negativo

Com o usuário presente: cadastramos um app de desenvolvedor real no
Mercado Livre ("DC Comparador Shopee-ML 2026", Client ID
`2490415886076513`), autorizamos com a conta do usuário, geramos token
OAuth de verdade e testamos os 4 endpoints da arquitetura planejada
(ver CONTINUIDADE.md item 5 pra detalhe técnico completo).

- `products/search` e `products/{id}` funcionam, mas só trazem ficha
  técnica/fotos — **nenhum dos dois tem campo de preço**.
- `products/{id}/items` (onde esperávamos achar o vendedor/preço real)
  dá 404 pra qualquer produto — esse recurso só mostra o "vencedor da
  promoção" quando a PRÓPRIA conta tem um anúncio concorrendo ali, não
  serve pra terceiro comparar preço.
- `items/{item_id}` (que a pesquisa anterior achava que era público)
  na verdade está **bloqueado também** (403), autenticado ou não —
  testado com 2 anúncios reais pegos direto da busca.
- **Conclusão: não existe hoje um caminho de API oficial pra pegar
  preço do Mercado Livre.** A única forma que vimos preço de verdade foi
  abrindo a página do produto num navegador normal (visual, não API) —
  bem mais frágil que uma integração de API.
- Credenciais salvas em `.env` local (App ID, App Secret, Refresh
  Token). Recomendado renovar o App Secret por precaução (um trecho
  passou pelo terminal durante uma correção de arquivo nesta sessão).
- **Decisão em aberto com o usuário**: investir em scraping visual
  (frágil, mais manutenção) ou aceitar Shopee-only por enquanto.

## 2026-09-15 (sessão seguinte, parte 22) — 3º e último lote de expansão de categorias (madrugada, autônomo)

Fechamento do plano de expansão de categorias, mesma madrugada do 2º lote.
Categorias: Alimentos, Móveis, Viagem, Livros — as 4 últimas "em breve"
do catálogo.

- Mesma receita: `productOfferV2` ITEM_SOLD_DESC, 5 keywords/categoria,
  limite 50, filtro `scoreOffer` >= 75. Boa colheita: 20/101/111/16
  aprovados em alimentos/móveis/viagem/livros antes da dedup.
- Deduplicados contra os 554 produtos já existentes (17 duplicatas).
- Revisão manual encontrou bem mais contaminação que nos lotes
  anteriores — 3 rodadas de ajuste no filtro de exclusão até a lista
  ficar limpa:
  - Alimentos: quadros decorativos de cozinha e um kit de colheres
    vintage (não são comida) batidos por "café gourmet"/"temperos".
  - Móveis: mais de 15 itens de suporte de celular/notebook/tablet,
    ganchos de parede, porta-shampoo e prateleiras adesivas pequenas —
    "estante organizadora"/"puff decorativo" trouxe muito acessório de
    parede junto. Mantidos só móveis de fato (mesas, cadeiras, estantes,
    puffs, carrinhos, sapateiras).
  - Viagem: produtos de bebê (almofada de pescoço pra cadeirinha,
    "canguru" carregador de bebê) batidos por "travesseiro de pescoço" e
    "mochila de viagem"; um cadeado antifurto de moto/bike batido por
    "mala de viagem". Removidos.
  - Livros: nenhuma contaminação encontrada, lista já veio limpa.
- 83 produtos publicados no total (17/25/25/16 por categoria) via
  Supabase MCP. Confirmado por SQL em `site_catalog`.
- Ativadas as 4 categorias em [`categories.ts`](src/lib/site/categories.ts)
  e [`categoryTiles.ts`](src/lib/site/categoryTiles.ts). Typecheck e
  build limpos (18 categorias estáticas geradas). **Publicado**: commit
  `2707a01`.
- **Todas as categorias do catálogo agora têm produto publicado** — o
  plano de expansão de 3 lotes (ver CONTINUIDADE.md) está concluído.

## 2026-09-15 (sessão seguinte, parte 21) — 2º lote de expansão de categorias (madrugada, autônomo)

Continuação do 1º lote, feito de madrugada enquanto o usuário dormia ("Vou
dormir, resolva tudo") — mesma técnica já validada, sem tocar em nenhuma
conta pessoal do usuário. Categorias: Papelaria, Brinquedos, Bebês.

- Mesma receita do 1º lote: `productOfferV2` com `sortType` ITEM_SOLD_DESC,
  5 palavras-chave por categoria, limite 50/keyword, filtro `scoreOffer`
  (score >= 75) do Growth OS.
- 141/80/31 aprovados em papelaria/brinquedos/bebes; deduplicados contra os
  479 produtos já existentes (22 duplicatas removidas); top 25 por
  categoria (75 produtos novos).
- Revisão manual antes de publicar removeu 7 falsos positivos de
  palavra-chave: itens de manicure/sobrancelha (batidos por "caneta gel"),
  uma fruteira e um jogo de mesas de cabeceira (batidos por "organizador
  de mesa"). Ver `EXCLUDE_NAME_SUBSTR` no script de geração de SQL.
- Inseridos via Supabase MCP em `products` + `offer_snapshots`. Confirmado
  por SQL: 25 produtos por categoria em `site_catalog` (75 total).
- Ativadas as 3 categorias em [`categories.ts`](src/lib/site/categories.ts)
  e [`categoryTiles.ts`](src/lib/site/categoryTiles.ts) (ícones já
  existiam em `/public/icones-categorias/`). Typecheck e build limpos.
  **Publicado**: commit `dee98f7`.
- Restam do plano de expansão: 3º lote (Alimentos, Móveis, Viagem, Livros)
  — ver CONTINUIDADE.md.

## 2026-09-14 (sessão seguinte, parte 17) — menu inferior, ícone de ofertas, banner do rodapé, publicado

- **Neumorfismo corrigido**: os 18 ícones de categoria tinham margem
  transparente enorme (~57% do canvas vazio), fazendo a sombra CSS
  "flutuar" longe do cartão visível — só o ladrilho sintético da
  Infantil (sem imagem) mostrava a sombra corretamente. Recortados via
  canvas no navegador (bounding box de alpha) e reexportados como `.jpg`
  (public/icones-categorias/, ~10KB cada, antes ~470KB em PNG). Também
  removida a cor esverdeada da sombra (usuário não aprovou) e a borda
  verde que só aparecia no hover da Infantil (removida — sem borda em
  nenhum ladrilho, só sombra dupla neutra preto/branco).
- **Menu inferior redesenhado** seguindo referência `MENU.png`:
  [`BottomNav.tsx`](src/components/site/BottomNav.tsx) virou client
  component (`usePathname`) pra destacar em verde o item da página atual;
  pílula branca flutuante com `backdrop-filter: blur` (efeito vidro fosco
  ao rolar a página) no lugar da barra escura fixa antiga.
- **Lupa do "Buscar"** no menu: traço mais grosso (2.6) e círculo maior,
  pra bater com o peso visual do `MENU.png`.
- **Ícone de "Ofertas de hoje"**: `FlameIcon` (SVG) trocado pela chama 3D
  de `OFERTAS.png` (recortada do mesmo jeito que os ícones de categoria).
- **Banner do topo simplificado**: banner trocado 2x (`CARD-HERO-NOVO.png`
  → `BANNER-FINAL.png`, usuário achou o anterior "muito verde"); os dois
  slides extras (Casa e "Manda uma foto") foram removidos a pedido —
  agora é só um card, sem scroll horizontal. CSS morto (`.dc-promo-row`,
  `.dc-promo-card`, `.dc-icon-row-bleed` etc.) removido junto.
- **Rodapé**: card CSS "Não encontrou o que procurava?" trocado pela arte
  pronta `BANNER-RODAPÉ.png` (link direto pro WhatsApp).
- **Publicado**: commit `30593dc` na `main`, push feito
  (`heberibrahim27/shopee-concierge`) — aciona o deploy automático na
  Vercel (`shopee-concierge-prod`). Pastas de origem dos ícones
  (`ICONES/`, `ICONES BRANCOS/`, `ICONES-CATEGORIAS.png`) ficaram de fora
  do commit via `.gitignore` (só as versões recortadas em
  `icones-categorias/` são usadas pelo site; ~20MB de fonte bruta sem uso
  não precisa ir pro histórico do git).

## 2026-09-15 (sessão seguinte, parte 20) — 1º lote de expansão de categorias

Rodei a coleta real na Shopee pras 5 categorias do 1º lote (ver plano em
CONTINUIDADE.md): Esporte, Automotivo, Saúde, Pet, Games.

- 5 palavras-chave por categoria, `productOfferV2` com `sortType`
  ITEM_SOLD_DESC (mais vendidos — testei RELEVANCE_DESC primeiro e o
  aproveitamento foi péssimo, 7 aprovados em 250 ofertas; trocando pra
  mais vendidos foi pra 586 aprovados), limite 50/keyword.
- Filtro de qualidade: mesmo `scoreOffer` do Growth OS
  (`src/lib/growth/dealScoring.ts`, score >= 75 + cortes duros de
  desconto/nota/vendas) replicado num script Node standalone.
- Peguei os top 25 por score em cada categoria (125 produtos novos).
  Antes de publicar, removi manualmente 8 itens de Games que a palavra
  "controle" trouxe fora de contexto (ventilador, calcinha modeladora,
  sabonete, fone de capacete de moto) — não tinham nada a ver com games.
- Inseridos via Supabase MCP direto em `products` + `offer_snapshots`
  (mesmo par de tabelas que `site_catalog` já lê). Confirmado por SQL:
  25 produtos por categoria aparecendo em `site_catalog`.
- Ativadas as 5 categorias em
  [`categories.ts`](src/lib/site/categories.ts) (rota, sitemap) e
  [`categoryTiles.ts`](src/lib/site/categoryTiles.ts) (tiles saem do "em
  breve"). **Publicado**: commit `78ec754`.
- ⚠️ **Aviso de segurança que o Supabase apontou nesta sessão** (não
  relacionado a essa coleta, achado incidental ao listar as tabelas):
  a tabela `product_groups` está com RLS (Row Level Security)
  **desativado** — qualquer um com a chave anon consegue ler/escrever
  nela. Ainda não corrigi porque ativar RLS sem política de acesso
  definida bloquearia todo acesso à tabela — precisa decidir com o
  usuário se essa tabela deve ficar aberta (hoje não guarda nada
  sensível, só ids de agrupamento) ou se entra uma política de leitura
  pública / escrita só do backend.

## 2026-09-14 (sessão seguinte, parte 19) — filtros de ordenação + zoom do iOS

- **Filtros na `/busca`**: "Relevância / Mais vendidos / Melhor avaliação /
  Menor preço" (`sort.ts`, `SortBar.tsx`). Curado ordena via
  `.order()` no Supabase; busca ao vivo usa `sortType` da API da Shopee
  quando existe (vendidos/preço), e reordena no nosso lado pra
  avaliação (a API não tem esse sortType).
- **Zoom automático no iOS corrigido**: campo de busca do cabeçalho
  tinha `font-size: 14.5px` — abaixo de 16px, Safari/Chrome no iOS dão
  zoom automático ao focar o campo. Subido pra 16px.
- **Publicado**: commit `a807318` na `main`.

## 2026-09-14 (sessão seguinte, parte 18) — busca ao vivo na Shopee

Ideia do usuário: quem pesquisa no site já quer comprar, então se o
catálogo curado não tiver o produto ainda, não podemos simplesmente
"não achamos nada" — a API da Shopee tem o produto, então busca. Antes
disso, a busca só olhava `site_catalog` (nunca a API ao vivo, por design
— ver ARQUITETURA-SITE.md). Mantido: catálogo curado continua vindo
primeiro/em destaque; a busca ao vivo é só complemento, claramente
identificado como "Direto da Shopee agora" (sem o selo "Menor preço
encontrado", que é exclusivo de quem passou pela curadoria do Growth OS).

- [`liveSearch.ts`](src/lib/site/liveSearch.ts): chama
  `searchProductsByKeyword` (já existia em `src/lib/shopee/queries.ts`,
  usado antes só pela coleta) direto do Server Component da página de
  busca. Filtro leve: só corta nota abaixo de 4 (produto sem avaliação
  ainda passa — não é o mesmo que produto ruim). Nunca derruba a página:
  erro da API ou env var ausente só retornam lista vazia.
- [`LiveProductCard.tsx`](src/components/site/LiveProductCard.tsx): card
  separado do `ProductCard` normal — link vai direto pra Shopee (não
  `/produto/[slug]`, que não existe pra esse item), sem botão de
  favorito (produto sem id estável no nosso banco).
- **Testado com dado real** (`SHOPEE_APP_ID`/`SHOPEE_SECRET`, já
  configurados também na Vercel): busquei "fone de ouvido" e "mochila" —
  vieram produtos, preços, desconto e nota reais da Shopee, com imagem
  carregando certo e link funcional.
- **Publicado**: commit `84b167c` na `main`.

## 2026-09-14 (sessão seguinte, parte 16) — grade de categorias (2 linhas) + banner trocado

- **Buscador (`.dc-header-search-bg`)**: troquei `background-image` +
  `background-size` (esticava sem preservar proporção, sobrava preto nas
  bordas em larguras diferentes) por uma `<img>` real com
  `object-fit: cover` + `transform: scale(1.35)`. Calibrado simulando o
  cálculo de `object-fit:cover` em JS e medindo o canal verde mínimo nas
  bordas superior/inferior do elemento **de verdade** renderizado (não uma
  cópia sintética) em três larguras de container (339/533/724px) — todas
  ficaram bem longe do preto (56–251). Confirmado sem borda em nenhuma
  largura testada.
- **Grade de categorias da Home**: usuário gerou 18 ícones prontos
  (ícone + rótulo + cartão branco já desenhados) em duas pastas —
  `ICONES BRANCOS/` (as artes finais usadas) e `ICONES/` (um set neon
  verde solto, não usado, sem rótulo). Copiei os 18 pra
  `public/icones-categorias/<slug>.png` com nome legível (identificação
  feita visualmente, arquivo por arquivo — os originais têm nome UUID).
  Criado [`categoryTiles.ts`](src/lib/site/categoryTiles.ts) (lista de
  ladrilhos com `available: true/false`) e
  [`CategoryGrid.tsx`](src/components/site/CategoryGrid.tsx) (grade CSS de
  2 linhas fixas com `grid-auto-flow: column` + scroll horizontal — visual
  de carrossel sem precisar de JS de paginação). Usado só na Home, no
  lugar do antigo `<CategoryChips />` (que continua existindo e é usado
  na página de categoria pra trocar de categoria rapidamente).
  - As 6 categorias já publicadas (Casa, Eletrônicos, Ferramentas, Beleza,
    Moda, Infantil) linkam normal. As 12 novas do plano de expansão
    (Esporte, Automotivo, Saúde, Pet, Games, Papelaria, Brinquedos, Bebês,
    Alimentos, Móveis, Viagem, Livros) aparecem esmaecidas (`grayscale` +
    opacidade) com selo "em breve", sem link — mesmo padrão já usado nos
    marketplaces "em breve" no cabeçalho, pra nunca apontar pra uma
    categoria vazia.
  - **Pendência pequena**: não veio arte nova pra "Infantil" (o lote trouxe
    "Bebês" e "Brinquedos" separados no lugar dela). Por enquanto o
    ladrilho da Infantil usa o ícone antigo (`GiftIcon`) dentro de um
    cartão branco equivalente, montado em CSS — não é a mesma arte dos
    outros 17, mas visualmente compatível. Decidir depois: pedir uma arte
    "Infantil" própria, ou aposentar a categoria a favor de
    Bebês/Brinquedos quando a coleta desses dois rodar.
  - Também tem um ladrilho "Outros" (arte pronta) apontando pra
    `/categorias`, igual ao card "Outros/Mais" da referência.
- **Banner do topo trocado**: usuário substituiu `BANNER-HERO.png` por
  `CARD-HERO-NOVO.png` (achou o antigo "muito verde"). Nova arte tem
  proporção mais quadrada (1896×829, ~2.29:1) contra a antiga (2172×724,
  3:1) — como o CSS já usa `width:100%; height:auto` sem cortar nada, o
  card só ficou um pouco mais alto (~150px de altura a 375px de largura,
  antes ~115px); conferido ao vivo que não há distorção nem espaço vazio
  estranho nos outros dois cards do carrossel (eles só esticam levemente
  pra acompanhar a altura, comportamento normal de flexbox).

## 2026-09-14 (sessão seguinte, parte 14) — buscador com arte real, banner reposicionado, remoção de tela antiga

Sequência de ajustes finos depois da parte 13:

- **Sino**: usuário confirmou que ainda sobrava uma borda escura fina.
  Troquei a estratégia de `mix-blend-mode: screen` (dependia da cor exata
  de preto) por **recorte circular** (`clip-path: circle()`), calibrado
  medindo os pixels reais do PNG via canvas (o círculo de vidro termina em
  ~34% do raio; preto puro começa em 35% — cravei o corte em 33%,
  confirmado sem sobra numa checagem com fundo vermelho de teste).
- **Banner (`BANNER-HERO.png`)**: usuário regenerou no ChatGPT **sem os
  logos oficiais** dos marketplaces (trocou por carrinho/sacola/tag/loja
  genéricos) — a versão anterior tinha logo de verdade da Amazon/Mercado
  Livre/Shopee/AliExpress coladas na arte, o mesmo problema de marca
  registrada que identificamos na conversa com o ChatGPT. Com a versão
  limpa, apliquei no [PromoBanner.tsx](src/components/site/PromoBanner.tsx)
  como card de imagem única (sem padding, link pra `/categorias`).
  Também reposicionei: banner agora vem **antes** das categorias (igual
  na referência), não depois.
- **Buscador (`BUSCADOR.png` + `LUPA.png`)**: primeira versão do buscador
  vinha com o texto "O que você está procurando?" desenhado dentro da
  imagem — avisei que isso quebraria a busca de verdade (texto digitado
  ficaria sobreposto ao texto fixo da arte) e sugeri regenerar sem texto.
  Usuário regerou uma pílula de vidro **vazia** (sem texto/ícone) — apliquei
  como `background-image` do campo de busca real (com overscan
  `background-size: 106% 140%` pra esconder a borda preta sólida da
  imagem, mesmo truque do sino) e usei `LUPA.png` (esse já veio com alfa
  de verdade) como ícone dentro do campo, no lugar do SVG. Botão de
  enviar continua existindo pra acessibilidade, só ficou visualmente
  oculto (a pílula já não tem espaço pra um botão redondo separado).
- **Removido** (usuário pediu "isso tudo vai sair" apontando pro CTA de
  busca por foto e pros ícones circulares de categoria da Home):
  [SearchBox.tsx](src/components/site/SearchBox.tsx) e
  [CategoryIconRow.tsx](src/components/site/CategoryIconRow.tsx) apagados
  por completo (viraram código morto — a busca por foto some da Home,
  fica só o link de WhatsApp já disponível no rodapé/produto/barra fixa;
  categorias da Home passaram a usar
  [CategoryChips.tsx](src/components/site/CategoryChips.tsx), o mesmo
  componente de pill já usado nas páginas de categoria). CSS órfão
  removido junto (`.dc-photo-cta`, `.dc-search-form/input/button` antigos,
  `.dc-icon-row`/`-item`/`-label`).

`tsc --noEmit` limpo, testado no navegador mobile e desktop.

**Correção na sequência (mesma parte):** usuário apontou que ainda sobrava
o eyebrow "COMPARADOR DE PREÇOS · SHOPEE" + H1 entre o cabeçalho e o
banner — a referência não tem texto nenhum ali. Removido o `<section
className="dc-hero">` visível da Home; o H1 continua existindo (bom pra
SEO, todo mundo devia ter um H1) mas virou `.dc-sr-only` (só leitor de
tela, zero espaço visual). CSS órfão removido: `.dc-eyebrow`,
`.dc-hero-accent` (o `.dc-hero` em si continua vivo — outras páginas como
`/busca`, `/categorias`, `/favoritos` e `/categoria/[slug]` ainda usam
pra título de página).

## 2026-09-14 (sessão seguinte, parte 13) — assets reais do ChatGPT aplicados (logo, fundo do cabeçalho, sino)

Usuário criou a pasta `public/` (pedida por ele mesmo) e foi salvando os
assets gerados no ChatGPT direto lá, sem passar pelo upload do chat
(evita o problema da parte 11, onde uma imagem não chegava salva em disco):

- **`LOGO.png`** — logo final (etiqueta verde + wordmark + tagline).
  [Logo.tsx](src/components/site/Logo.tsx) trocou o texto placeholder por
  `<img src="/LOGO.png">`, 42px de altura no cabeçalho, canto superior
  esquerdo.
- **`BACKGROUND-HERO.png`** — textura de brilho verde fluido, aplicada
  como `background-image` do `.dc-header` (com uma camada escura leve por
  cima só pra manter o texto legível).
- **`SINO-NOTIFICAÇÃO.png`** / **`SINO-SEM-NOTIFICAÇÃO.png`** — a primeira
  vinha com um badge vermelho "3" fixo (contador de notificação inventado,
  igual ao problema do "sino com 3" na referência original — não temos
  sistema de notificação de verdade, então não ia usar). Usei a versão
  **sem** contador. Essa também veio com fundo preto sólido (não
  transparente); resolvido com `mix-blend-mode: screen` no CSS (some o
  preto puro contra qualquer fundo) em vez de pedir um novo arquivo.
  Ícone fica no cabeçalho ao lado da logo, sem link (`title="Notificações
  em breve"` — honesto, mesmo padrão da fileira de lojas "em breve").

`tsc --noEmit` limpo, testado no navegador (mobile 375px e desktop 1440px).

## 2026-09-14 (sessão seguinte, parte 12) — redesign verde + arquitetura multi-marketplace

Usuário mandou uma referência gerada com ChatGPT (app fictício "Desconto
Chegando" verde, com Shopee/Mercado Livre/Amazon/AliExpress/KaBuM/Americanas)
e pediu a página "idêntica". Antes de copiar visualmente, li a conversa
inteira dele com o ChatGPT (usando a extensão do Chrome de verdade, logada —
o link `/c/...` era privado, não abria no navegador isolado) — achado mais
importante: os termos do Programa de Afiliados da Shopee **proíbem usar a
marca/logo da Shopee** em material de afiliado fora do que é fornecido
oficialmente, e o mesmo vale por propriedade intelectual pras outras lojas.
Então segui o visual à risca, mas com logos = texto (nunca ícone oficial).

**Paleta**: trocado dourado/preto por verde/preto (renomeado
`--dc-gold*` → `--dc-green*` em todo o CSS/TSX, valores nos hex certos —
`--dc-black` também escureceu pro tom esverdeado da referência).
Vermelho/laranja (`--dc-urgency`) continua só no selo de desconto; botões
de compra agora são verdes (ação = "dinheiro"), não mais laranja.

**Arquitetura multi-marketplace** (o pedido real por trás da referência:
"hoje só Shopee, mas quero mais lojas, aparece se tiver, oculto se não
tiver"): nova tabela `product_groups` no Supabase + `products.group_id`
(migration aplicada). `getCachedGroupOffers()` em
[catalog.ts](src/lib/site/catalog.ts) busca outras ofertas do mesmo
grupo. Na página de produto, o **CTA principal agora é dinâmico**: mostra
sempre a oferta de MENOR PREÇO real entre as lojas vinculadas ("Ver oferta
no Mercado Livre", "Ver oferta na Shopee" etc, nunca fixo em Shopee — isso
foi sugestão direta do ChatGPT e faz sentido), e a caixa "Compare em outras
lojas" lista o resto. [platforms.ts](src/lib/site/platforms.ts) guarda
nome + cor de cada loja (nunca logo). Hoje `group_id` está vazio em todo
mundo (nada foi linkado ainda) — então nenhuma comparação aparece em
lugar nenhum do site, exatamente como pedido; a seção liga sozinha assim
que alguém (curadoria manual, ou um matcher futuro por EAN/GTIN — pesquisei
e é assim que sites de comparação de preço fazem isso de verdade) linkar
produtos ao mesmo grupo.

**Card de produto redimensionado** pra bater com a densidade da
referência: badge de desconto + coração favoritar sobre a foto, título,
nota+vendidos, selo "Menor preço encontrado", preço riscado + preço atual
verde, "Economize R$X", botão "Ver melhor oferta" com ícone de carrinho.
Sem nenhum dado inventado (sem contador de notificação falso, sem "oferta
acaba em Xh" que não existe de verdade — só o que já mostrávamos, com
cara nova).

**Favoritos virou de verdade**: [favorites.ts](src/lib/site/favorites.ts)
guarda no localStorage não só o slug, mas um retrato do produto (nome,
imagem, preço, nota) — assim a nova página [/favoritos](src/app/favoritos/page.tsx)
monta os cards sem precisar de mais uma consulta ao servidor. Barra fixa
do mobile foi de 4 pra 5 itens reais (Início, Buscar, Favoritos,
Categorias, WhatsApp) — nada de "Perfil"/"Notificações" (exigiriam conta
de usuário, que não existe).

**Cabeçalho** ganhou uma fileira de lojas: Shopee colorida (dado real),
as outras 5 aparecem apagadas com tooltip "em breve" — mostra a direção
do produto sem fingir que a comparação já existe.

**Logo**: usuário está regerando no ChatGPT (ícone de etiqueta verde) —
não tentei desenhar uma versão minha, só recolori o wordmark de texto
pro verde novo. Continua placeholder até o arquivo chegar (ver
CONTINUIDADE.md).

Testado no navegador (mobile 375px e desktop 1440px) com página de
rascunho temporária (produto com 3 lojas fictícias, apagada depois) —
confirmado: preço/CTA dinâmico funcionando (escolheu Mercado Livre R$40
entre Shopee R$50/Amazon R$55/ML R$40 corretamente), favoritar sem navegar
pra outra página, página /favoritos lendo do zero. Pego e corrigido no
processo: `favorites.ts` não validava o formato salvo no localStorage —
um dado de teste no formato antigo (array) corrompia o novo formato
(objeto) ao dar spread; agora descarta formato inválido em vez de
corromper. `tsc --noEmit` limpo.

## 2026-09-14 (sessão seguinte, parte 11) — cabeçalho com busca fixa, aviso legal reforçado, logo pendente

Três ajustes pedidos em sequência:

1. **Aviso legal do rodapé reforçado** ([Footer.tsx](src/components/site/Footer.tsx)):
   usuário perguntou se o aviso de comissão de afiliado é exigido por lei —
   expliquei que não existe uma frase específica exigida, mas o art. 36 do
   CDC (identificação da publicidade) dá base real pra manter, e que
   omitir é mais arriscado que manter. Ele pediu pra reforçar deixando
   claro que o site só indica, não vende nem processa pagamento — texto
   agora diz isso explicitamente, compra/entrega/troca/garantia são com o
   vendedor na Shopee.
2. **Cabeçalho redesenhado** ([Header.tsx](src/components/site/Header.tsx)):
   usuário achou o botão de WhatsApp do cabeçalho grande demais/sem
   sentido. Solução final: busca por texto (antes só no Hero da Home)
   virou permanente no cabeçalho, em toda página, com input branco
   arredondado + botão circular preto — e o botão de WhatsApp do
   cabeçalho foi **removido** (ele já existe na barra fixa do mobile e no
   CTA do rodapé/produto, não precisava de mais um lugar).
   [SearchBox.tsx](src/components/site/SearchBox.tsx) manteve só o convite
   de busca por foto (conteúdo da Home, não repetido em toda página).
3. **Logo real**: usuário enviou a arte oficial (monograma "DC" dourado
   com lupa, fundo preto, redondo) pra substituir o wordmark de texto
   placeholder — mas o arquivo não chegou salvo em disco nessa sessão
   (diferente das outras imagens enviadas, que vieram com caminho salvo).
   Pedido pro usuário reenviar a imagem pra aplicar de verdade. Pendência
   registrada no CONTINUIDADE.md.

Corrigido no mesmo lote: o botão "Procurar pelo WhatsApp" do rodapé tinha
herdado sem querer a cor de urgência (vermelho/laranja) da parte 10 —
separei em duas classes (`.dc-cta-button` dourado pra contato/WhatsApp,
`.dc-buy-button` vermelho/laranja só pra "Ver na Shopee") e voltou ao
dourado correto.

## 2026-09-14 (sessão seguinte, parte 10) — cor de urgência (vermelho/laranja) nos pontos de conversão

Usuário perguntou o que o estudo de cores diz sobre compras — expliquei
que vermelho/laranja aumentam urgência/impulso (por isso Shopee/Amazon/
Mercado Livre usam essas cores em desconto e CTA), enquanto dourado/preto
comunica premium mas não urgência. Recomendei aplicar a cor só nos pontos
de conversão, mantendo dourado/preto como identidade — usuário aprovou.

Adicionado `--dc-urgency`/`--dc-urgency-bright` (vermelho-laranja) em
[globals.css](src/app/globals.css), aplicado em: selo de desconto
(`.dc-card-badge.price`), botão "Ver oferta" do card (`.dc-card-cta`) e o
CTA principal da página de produto / footer (`.dc-cta-button`, "Ver na
Shopee"/"Procurar pelo WhatsApp"). Resto do site (header, logo, chips,
banners, preço) continua dourado/preto. Testado visualmente com página de
rascunho temporária (apagada depois) e no navegador — `tsc --noEmit`
limpo.

## 2026-09-14 (sessão seguinte, parte 9) — redesign inspirado no app do Sam's Club (mobile-first)

Usuário mandou print do app do Sam's Club e perguntou se dava pra usar um
design parecido. Confirmei com ele o que aproveitar (mantendo a identidade
dourado/preto já aprovada, sem virar azul): layout de card de produto,
barra de navegação fixa no rodapé, e banners de campanha no topo — e ele
pediu explicitamente scroll horizontal nas categorias da Home e "criar pro
mobile primeiro, adaptar pro desktop depois".

**Card de produto** ([ProductCard.tsx](src/components/site/ProductCard.tsx)):
selo de desconto e ícone de coração (favoritar) sobrepostos na foto, preço
"de" riscado calculado a partir do `priceDiscountRate` real da Shopee (não
inventado — `formatOriginalPriceBRL` em
[format.ts](src/lib/site/format.ts)) + preço atual em destaque, e botão
visual "Ver oferta" no rodapé do card. Favoritar é local (localStorage,
sem conta de usuário) via componente cliente isolado
[FavoriteButton.tsx](src/components/site/FavoriteButton.tsx) — testado
clicando direto no DOM (o clique por coordenada da ferramenta de teste é
que falhava, não o componente).

**Categorias da Home** ([CategoryIconRow.tsx](src/components/site/CategoryIconRow.tsx)):
fileira de ícone circular + rótulo com scroll horizontal, sangria até a
borda da tela no mobile (técnica `100vw` + margin negativa) — e uma media
query pra essa sangria desaparecer a partir de 800px de largura, senão a
fileira ficava desalinhada do resto do conteúdo em tela grande (bug pego e
corrigido durante o teste visual em 1440px). Nova página
[/categorias](src/app/categorias/page.tsx) lista todas as 6 categorias em
grade — vira destino da barra fixa.

**Banners de campanha** ([PromoBanner.tsx](src/components/site/PromoBanner.tsx)):
3 cards com scroll horizontal (`scroll-snap`) linkando pra eletrônicos,
casa e WhatsApp — mesma sangria/breakpoint da fileira de categorias.

**Barra fixa no rodapé** ([BottomNav.tsx](src/components/site/BottomNav.tsx)):
só aparece no mobile (`display:none` acima de 640px), 4 destinos reais do
site (Início, Categorias, Busca, WhatsApp) — nada de item inventado tipo
"Notificações"/"Benefícios" que não existem aqui. Incluída globalmente em
[layout.tsx](src/app/layout.tsx).

Ícones novos em [icons.tsx](src/components/site/icons.tsx): `HeartIcon`
(com estado preenchido/contorno), `SearchIcon`, `GridIcon`, `ArrowRightIcon`.

Testado visualmente no Browser (mobile 375px e desktop 1440px), `tsc
--noEmit` limpo. Página de rascunho temporária usada só pra testar o card
com dado fake (sem depender do Supabase local, que não tem
`SUPABASE_SERVICE_ROLE_KEY` configurada) foi apagada depois do teste.

## 2026-09-14 (sessão seguinte, parte 8) — coleta nova via API real, catálogo de 40 para 344 produtos

Usuário forneceu as credenciais reais `SHOPEE_APP_ID`/`SHOPEE_SECRET` (do
`.env.example`, "já validado com a conta real do Ibrahim") — coladas só no
`.env` local (nunca versionado, `.gitignore` confirmado antes). Isso
destravou o teto real identificado na parte 7: só existiam 50 produtos no
banco desde 13/09, coletados com só 5 palavras-chave genéricas.

Rodei uma coleta bem mais ampla batendo direto na API GraphQL da Shopee
(`open-api.affiliate.shopee.com.br`, mesma assinatura SHA256 de
`src/lib/shopee/client.ts`) com **26 palavras-chave cobrindo as 6
categorias do site** (5 em casa, 5 em eletrônicos, 4 em ferramentas, 4 em
beleza, 4 em moda, 4 em infantil — as 3 últimas categorias não tinham
NENHUM produto até agora), 20 produtos por palavra-chave, ordenado por mais
vendidos. Resultado: **495 produtos únicos coletados**.

Apliquei o mesmo corte de qualidade de sempre (`scoreOffer`: desconto
>=15%, nota >=4.5, vendas >=50, score >=75) e descartei quem já existia no
banco (por `shopee_item_id`) — sobraram **304 novos produtos qualificados**.
Publiquei todos direto via SQL (`ON CONFLICT (shopee_item_id) DO NOTHING`
pra ser seguro re-rodar), com `category_slug` atribuído pela palavra-chave
de origem, slug real via `buildProductSlug`, e `highlight_reason` gerado a
partir dos dados reais (nota/vendas/desconto). Um sub-agente cuidou da
execução dos lotes finais de SQL pra não gastar contexto principal.

**Catálogo final: 354 produtos no banco, 344 publicados no site**
(eletrônicos 81, casa 62, beleza 55, infantil 50, ferramentas 48, moda 48)
— confirmado sem slug duplicado. Isso resolve de vez o pedido do usuário
("quero encher o site com produtos de qualidade, não é possível que
conectado via API não vamos lotar isso"): a resposta final é que sim, dá
pra lotar via API, o teto era só a falta de credencial + poucas palavras-
chave, não curadoria excessiva.

**Pendência que sobra:** não forcei a revalidação de cache em produção
(sem o `REVALIDATION_SECRET` de produção) — o fallback de 1h
(`revalidate: 3600` em `catalog.ts`) deve propagar os 344 produtos pro site
sozinho. Se quiser confirmar mais rápido, um redeploy vazio na Vercel força
a atualização na hora.

## 2026-09-14 (sessão seguinte, parte 7) — correção: publicados os 31 candidatos, catálogo em 40

Usuário corrigiu a curadoria da parte 6: "quero encher o site com produtos
de qualidade", não fazia sentido segurar 17 candidatos que já passam no
score (>=75) só por parecerem com outros já publicados. Publiquei os 17
restantes direto no Supabase (mesmo processo: `category_slug` por
palavra-chave do nome, slug real via `buildProductSlug`, `highlight_reason`
com nota/vendas/desconto reais). Catálogo foi de 23 para **40 produtos
publicados**, sem nenhuma colisão de slug (conferido via SQL). Dos 50
produtos coletados no total, os 10 que ficaram de fora realmente não
passam no corte de qualidade (nota < 4,5 e/ou desconto < 15% e/ou vendas
< 50) — isso é filtro de qualidade de verdade, não excesso de cautela.

**O que trava ir além de 40 agora:** não é curadoria, é falta de coleta
nova. Só existem 50 produtos no banco (coletados em 13/09, via
`npm run source:deals`, que busca só 5 palavras-chave genéricas e 10
produtos por palavra-chave). Rodar de novo — com mais palavras-chave e
cobrindo as 3 categorias que hoje têm zero produto (`ferramentas`,
`beleza`, `infantil`) — exige `SHOPEE_APP_ID`/`SHOPEE_SECRET` no ambiente,
que **não estão no `.env` local** (confirmado: só tem `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SITE_BASE_URL`, `REVALIDATION_SECRET`). O
`.env.example` confirma que são credenciais reais e já validadas da conta
do Ibrahim — só faltam ser coladas aqui (ou já estar na Vercel de
produção, onde o bot roda de verdade). Pendência registrada no
CONTINUIDADE.md.

## 2026-09-14 (sessão seguinte, parte 6) — catálogo de 9 para 23 produtos publicados (revisado na parte 7)

Resposta à pergunta "como vou postar vários anúncios nesse site": já
puxamos via API Shopee e guardamos no Supabase (isso nunca muda), mas
**publicar no site é uma etapa separada e curada** — não é "postar" manual
um por um nem um dump automático de tudo que passa no score. Hoje isso
significa: escolher `category_slug`, gerar o `slug` real (`buildProductSlug`),
escrever `highlight_reason` e virar `site_published = true`.

Reaproveitando os 31 candidatos aprovados (score >= 75) já identificados na
parte 4 (sem rodar coleta nova), publiquei 14 direto via SQL no Supabase
(`czocwdlygdslyuoixmhh`), com slug gerado pela função real do site
(conferido rodando `slugify`/`shortIdFromSeed` de `src/lib/site/slug.ts`
num script Node, não digitado à mão) e `highlight_reason` no mesmo estilo
dos 9 já publicados:

**Casa (+4):** ganchos adesivos metálicos, carrinho organizador com
rodinhas, luminária de teto dobrável (pétalas), arara guarda-roupa dobrável.
**Eletrônicos (+7):** fone Pro 4 TWS, power bank 10000mah, carregador turbo
120W, fone Pro5 com cancelamento de ruído, fone "Air Pods Pro 3", carregador
veicular 4 portas, fone P9 Air Top.
**Moda (+3):** mochila feminina impermeável, mochila esportiva masculina,
mochila CHL executiva.

Catálogo publicado foi de 9 para **23** (10 casa, 9 eletrônicos, 4 moda).
Slugs conferidos sem colisão via SQL (`group by slug having count(*) > 1`
= vazio).

**Os outros 17 candidatos ficaram fora de propósito**, não por limite
técnico: eram duplicatas do mesmo produto físico anunciado por vendedores
diferentes (título quase idêntico, às vezes com erro de digitação
proposital pra escapar de filtro de anúncio repetido) — publicar todos
deixaria a grade com o mesmo produto repetido 2-3x, o que não combina com
o site premium/curado que o usuário pediu. Exemplos descartados por
duplicidade: 5 outras mochilas quase idênticas às já publicadas, 2 fones
"X55" (já existe um X55 publicado), 1 carregador iPhone 20W (já existe um
quase igual publicado), 1 carregador 120W 67W (duplica o 120W 6A recém
publicado), 3 outras luminárias solares (já existem 2 modelos solares
publicados), 2 caixas/colmeias organizadoras (duplicam as já publicadas),
mais 3 fones TWS de score mais baixo (E6S, P47, carregador 50W) cortados só
pra não inflar demais a categoria eletrônicos numa única rodada. Essa
reserva de 17 fica pra publicar aos poucos nos próximos dias — dá conteúdo
"novo" no site sem precisar rodar a coleta de novo, e sem precisar de
`SHOPEE_APP_ID`/`OPENAI_API_KEY` novos.

**Cache do site:** não forcei a revalidação em produção nessa rodada (o
`REVALIDATION_SECRET` de produção é segredo da Vercel, não estava
disponível aqui — só o valor de dev local em `.env`). Sem isso, o
fallback de tempo (`revalidate: 3600` em `src/lib/site/catalog.ts`) garante
que os 14 produtos novos aparecem na Home e nas categorias em até 1 hora
sozinho, sem ação manual.

**Zero categoria "ferramentas", "beleza" ou "infantil" ainda** — nenhum dos
50 produtos já coletados cai nessas categorias. Só aparece mais variedade
aí quando a coleta Growth OS rodar de novo com produtos desses nichos
(precisa `SHOPEE_APP_ID` ativo, já documentado como pendência).

## 2026-09-14 (sessão à noite, parte 5) — site no ar em produção

Commit `9062fc6` (código do site, sem arquivos pessoais/rascunho) enviado
pra `main` — deploy automático da Vercel confirmado funcionando:
`https://shopee-concierge-prod.vercel.app/` está servindo a Home real, com
os 9 produtos publicados aparecendo corretamente (imagens, preço, desconto,
nota, vendas). Confirmado que as credenciais do Supabase já estavam
configuradas em produção (o bot já usava o mesmo banco). Build sem erros,
sem impacto no webhook do bot (rotas totalmente separadas).

**Atualização — domínio configurado (2026-09-14, mesma noite):** domínio é
administrado pela Hostinger (via "HSTDOMAINS", provedor de serviços
cadastrado no Registro.br) — a zona DNS de verdade fica no hPanel da
Hostinger, não no Registro.br diretamente. Usuário adicionou
`descontochegando.com.br` nas Domains do projeto na Vercel, e no hPanel:
- Editou o registro **A** (`@`) de `62.72.62.166` (IP antigo da Hostinger)
  pra **`216.150.1.1`** (IP da Vercel).
- **Apagou o registro AAAA** (`@` → `2a02:4780:13:1280:0:1c51:7def:3`) que
  senão continuaria mandando visitantes IPv6 pro WordPress antigo mesmo com
  o A record corrigido.
- Registros de e-mail (CNAME dkim/autodiscover/autoconfig, TXT
  spf/dmarc, MX, CNAME `www`) mantidos intocados — não são do site.

Confirmado via `curl --resolve` direto no IP da Vercel: o site novo já
responde certo (`Server: Vercel`, título "Desconto Chegando..."). Google
DNS (8.8.8.8) e Cloudflare (1.1.1.1) já resolvem pro IP novo; resolvedores
locais/ISP ainda podem levar um tempo (minutos a poucas horas) pra
atualizar o cache — propagação normal, nada a corrigir.

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
