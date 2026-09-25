# Feito — Shopee Concierge (Descontos Chegando)

> Registro do que já está pronto e validado, em ordem cronológica (mais recente
> primeiro). Complementa o [CONTINUIDADE.md](CONTINUIDADE.md), que lista o que
> ainda falta. Quando resolver algo do CONTINUIDADE.md, registre aqui com a data.

## 2026-09-26 — Cupom: "clique pra ver o código" (protege a comissão)

Heber perguntou se cupom rende algo além de tráfego. Rende: o botão do
cupom abre o `url_tracking` da Awin/Lomadee, link de afiliado igual ao
de produto, comissão na venda confirmada. Mas o código ficava escrito no
card — quem copiava e ia direto na loja comprava sem passar pelo nosso
link. Padrão de cuponeiro real (Cuponomia/Promobit) aplicado:
`CouponCodeReveal.tsx` mostra o código mascarado ("•••••10") e um botão
"Ver cupom e ir pra loja"; o clique registra em `click_events` (mesmo
beacon do TrackedOfferLink), abre a loja pelo link rastreado em nova aba
(síncrono no handler, pra não cair no bloqueador de pop-up), revela o
código e copia pra área de transferência. Cupom sem código continua com
"Aproveitar" direto.

Testado de verdade com Playwright no Chromium do container (página
temporária, apagada antes do commit): texto antes/depois conferido,
área de transferência = "GAMER10", beacon recebido com
`source: "cupom"`, nova aba aberta (a URL da Awin não carrega aqui só
porque a rede do container é bloqueada). Screenshots mobile 420px
conferidos visualmente.

## 2026-09-26 — Páginas de cupom por loja (`/cupom/[loja]`) e de loja (`/loja/[slug]`), custo zero

Item que a outra sessão deixou registrado como meu. Padrão de SEO de
cuponeiro/comparador real (Cuponomia, Promobit): "cupom kabum" e
"ofertas kabum" são buscas com volume próprio, e até agora só existia a
listagem geral em `/cupons`. Nenhuma tabela nova, nenhum serviço novo —
tudo derivado do que os crons de cupom (Awin + Lomadee) e de catálogo já
gravam.

**Dado real que orientou o desenho** (consulta direta no banco antes de
escrever): 26 lojas com cupom já gravado, mas só a Kabum tem volume (8
ativos, todos com código); Malwee 4, Anhanguera 3, o resto 1–2. Vários
cupons Lomadee estão com `platform = "lomadee"` (marca não resolvida na
ingestão) — por isso a identidade da loja em `src/lib/site/stores.ts`
usa o slug da plataforma quando é loja de verdade e cai pro slug do
nome do anunciante quando é só a rede. Catálogo por loja: Kabum 4.412,
Shopee 1.762, Mercado Livre 56, Olympikus 55, Nike 51.

**Construído**:
- `src/lib/site/stores.ts` — diretório de lojas (catálogo + cupons
  ativos), produtos por loja (48 mais recentes, dedupe por grupo),
  cupons por loja, e os dois gates de indexação.
- `/cupom/[loja]` — título "Cupom {Loja} {mês de ano}", cupons ativos,
  passo a passo de uso, até 12 ofertas da loja no comparador, chips pras
  outras lojas com cupom. **Só pede index com 3+ cupons ativos** (hoje:
  Kabum, Malwee, Anhanguera); com menos fica `noindex,follow` — página
  com 1 cupom é conteúdo fino, mesma filosofia do SEO_INDEX_GATE.
- `/loja/[slug]` — ofertas mais recentes da loja + cupons dela + texto
  de transparência ("a parceria não muda o placar"). **Só pede index com
  12+ produtos** (hoje as 5 lojas de catálogo).
- `/cupons` ganhou chips por loja e metadata de verdade (antes era só
  `title: "Cupons"`, sem descrição nem canonical); `/lojas-parceiras`
  virou porta de entrada (cada card linka pra `/loja/[slug]`); sitemap
  inclui as duas famílias com os mesmos gates.
- `CouponCard`: cupom com `platform = "lomadee"` mostrava o selo
  "lomadee" (nome da rede) em vez do nome da loja — corrigido pra usar o
  anunciante nesse caso.
- `coupons.ts`: `getCachedAllActiveCoupons()` (a vitrine continua com
  20; as páginas por loja precisam de todos).

**Validação**: `tsc` limpo, `next build` compila as rotas novas
(sem `.env` no container o `generateStaticParams` devolve vazio e as
páginas ficam sob demanda, como as de categoria). Não consegui renderizar
com dado real aqui (sem chave do Supabase no container e sem acesso de
rede ao site de produção). Primeira conferência depois do deploy:
`/cupom/kabum` (8 cupons, index), `/loja/kabum` (48 ofertas, index),
`/cupom/sawary` (2 cupons, deve vir com `noindex,follow`).

## 2026-09-26 — Busca do site deixou de ser "só ilike" e "só Shopee" (custo zero)

Heber pediu pra começar só pelo que não aumenta custo, sem cruzar com a
sessão paralela que está no gráfico de histórico de preço. Feito em
arquivos novos + página `/busca`; em `catalog.ts` só três `export`
(`mapRow`, `dedupeByGroup`, `SITE_CATALOG_COLUMNS`) pra reaproveitar sem
duplicar — nenhuma lógica daquele arquivo mudou.

**1. Busca de texto de verdade no catálogo (Postgres, sem serviço novo).**
Antes: `ilike '%termo%'` no nome — só achava com as palavras na mesma
ordem e sem erro de digitação. Agora: full text em português + pg_trgm
(migration `20260926100000_site_catalog_fulltext_search.sql`, função
`search_site_catalog`, módulo `src/lib/site/catalogSearch.ts`). Aplicada
em produção e testada contra o catálogo real (6.336 publicados) ANTES de
confiar — resultado medido, não suposto:

| termo | ilike (antes) | full text (agora) | primeiro resultado |
|---|---|---|---|
| fone bluetooth | 4 | 48 | Fone Bluetooth Wave Buds 2 |
| smartwach (erro de digitação) | 0 | 22 | SmartWatch Husky Sports 700 |
| ssd nvme 1tb | 0 | 48 | SSD SanDisk Plus 1TB NVMe |
| tenis olympikus (sem acento) | 0 | 48 | Tênis Olympikus Mantra |

Dois ajustes de ranking saíram do teste real, não da teoria: (a) sem
normalização por tamanho, "ssd nvme 1tb" trazia um PC Gamer de 104
caracteres em primeiro (o título longo cita os três termos) — resolvido
com `ts_rank_cd(..., 1)` + bônus pra título que COMEÇA com a primeira
palavra da busca; (b) casamento só por trigram ficava acima de casamento
de texto real ("tv 50 polegadas" trazia impressora "de 24 polegadas") —
resolvido com +0.2 fixo pra quem casa no full text. Índices GIN em uso
(confirmado por `explain analyze`: 5–20 ms por busca). Fallback: se a
função não existir/falhar, cai no `searchProducts` antigo — a busca
nunca fica pior do que era. Ordenação (preço/vendidos/avaliação) é feita
em memória sobre os 48 melhores casamentos.

**2. Lojas da Lomadee na página `/busca`** (`src/lib/site/lomadeeSearch.ts`,
`LomadeeLiveCard.tsx`, rota `/go/lomadee`). Terceira coluna de resultado
("Em outras lojas parceiras agora"), depois do catálogo e da Shopee ao
vivo. Respeita o limite real da chave (60 req/min, compartilhado com o
cron): resultado por termo cacheado 6h, nome da loja cacheado 7 dias e
no máximo 6 lojas distintas resolvidas por busca, e o link de afiliado
só é gerado NO CLIQUE (`/go/lomadee`, 1 chamada por clique real, cache em
memória) — nunca 1 chamada por resultado exibido. Se a Lomadee recusar o
link (marca restrita), redireciona pra URL crua da loja e registra o
clique como `lomadee-sem-link`, pra dar pra medir quanto isso acontece.
Mesmo filtro de relevância de título da Shopee ao vivo (`isRelevantTitle`)
pra não exibir resultado solto.

**Honesto sobre o que NÃO foi testado**: a busca Lomadee ao vivo não foi
exercitada com a chave real (o container desta sessão não tem `.env`) —
o parâmetro `search` da API está declarado no cliente mas o cron nunca o
usou. O código não derruba a página em nenhum caso (sem chave ou erro →
lista vazia), e o filtro de título segura resultado fora de contexto se
a API ignorar o `search`. Primeira coisa a conferir depois do deploy:
abrir `/busca?q=fone+bluetooth` e ver se a terceira seção aparece.

`npx tsc --noEmit` limpo; `next build` compilou todas as rotas (o único
erro é o pré-render de `/media-kit` sem `SUPABASE_URL` no container,
anterior a esta mudança e inexistente na Vercel).
## 2026-09-25 (tarde, continuação 13) — Chips de loja removidos do cabeçalho + menu hambúrguer no mobile (lacuna real corrigida)

Heber pediu pra terminar o redesign. Nenhuma das 4 imagens de
referência mostra a fileira de chips de loja (Shopee/KaBuM!/etc) no
cabeçalho -- removi (essa informação já existe de verdade na página
/lojas-parceiras, com contagem ao vivo, não duplicada).

Achado real ao tirar a fileira de chips: percebi que no mobile o menu
de texto (`Lojas Parceiras`, `Cupons`, `Blog`) já ficava escondido
sem nenhuma substituição -- a barra inferior só cobre Início/Buscar/
Favoritos/Categorias/WhatsApp. Essas 3 páginas ficavam inalcançáveis
pelo cabeçalho no celular. O menu hambúrguer do mockup não é só
estética, resolve isso de verdade.

Construí `MobileNavDrawer.tsx` -- botão hambúrguer (só aparece no
mobile, mesmo breakpoint que já existia) que abre um painel lateral
com os mesmos links do menu desktop, fecha ao clicar fora ou num
link. Testado ao vivo: abre, fecha, navega de verdade pra
Lojas Parceiras (confirmei a página carregando). Desktop sem nenhuma
mudança visual (hambúrguer fica escondido).

tsc limpo, `next build` completo sem erro. Um erro de console
"BellIcon is not defined" que continuava aparecendo era histórico
acumulado de uma aba antiga (3+ horas de sessão) -- confirmei abrindo
uma aba nova do zero, zero erro real.

## 2026-09-25 (tarde, continuação 12) — Ajustes reais pedidos pelo ChatGPT + benchmark de receita real do mercado

ChatGPT revisou o que publiquei (sparkline + comissão Awin no admin)
e pegou duas coisas reais que eu não tinha coberto:

1. O rótulo do sparkline não dizia quantos dias esse gráfico
   específico cobre, e não deixava claro que o histórico é da oferta
   em destaque (pode trocar de loja) quando o produto tem mais de uma
   loja vinculada. Corrigido: "Histórico monitorado: X dias" + "nessa
   loja (Nome)" quando aplicável.
2. O admin somava comissão pendente + validada sob o rótulo "Receita
   gerada" -- comissão pendente não é receita realizada. Renomeado
   pra "Comissão total (pendente + validada)" nos dois blocos
   (Shopee e Awin), deixando explícito que parte pode não se
   confirmar.

Testado local (label do sparkline confirmado com produto real de 6
dias), tsc limpo, publicado.

Também recebi (via outra sessão do Heber, Fable 5) um benchmark real
de receita por mil visitas do nosso nicho, com fontes citadas
(Promobit ~R$43/mil visitas na venda pra Méliuz, Zoom/Mosaico
~R$274/mil visitas no teto do nicho). Não verifiquei cada número
pessoalmente contra a fonte original, mas a conclusão bate com tudo
que já sabíamos: com ~328 visualizações/30 dias (4-6 visitas/dia),
estamos bem abaixo de qualquer modelo de monetização virar receita de
verdade -- tráfego continua sendo o gargalo real, não falta de
camada de receita. Documentado, não muda nenhuma decisão já tomada,
só confirma a ordem de prioridade (SEO/tráfego antes de mais
monetização).

## 2026-09-25 (tarde, continuação 11) — Gráfico de histórico de preço construído (versão honesta, não o gauge completo)

Antes de construir o gauge de 40 dias que o Zoom tem, chequei o dado
real: o domínio tem 12 dias, e o produto com MAIS histórico no
catálogo inteiro tem só 6 dias distintos de captura de preço. Um
gauge de "preço bom/normal/alto" com 2-3 pontos ficaria vazio --
decidi não construir isso ainda, seria prometer profundidade que a
gente não tem de verdade.

Construí uma versão menor e honesta no lugar: `getCachedProductPriceHistory`
agora também devolve a série diária (mesma query, sem consulta nova
no banco), e um componente `PriceSparkline` (SVG puro, sem lib de
gráfico) aparece na página de produto -- mas só quando o produto tem
7+ dias reais de histórico. Com menos que isso, a linha fica quase
reta e passa desconfiança em vez de informação, então simplesmente
não aparece (o selo "menor preço que monitoramos" já cobre esse
caso).

Hoje NENHUM produto ainda bate os 7 dias (máximo real é 6) -- testei
isso de propósito, baixando o corte temporariamente pra 5 contra dois
produtos reais (um com preço parado, outro com queda e alta reais) só
pra confirmar que o componente renderiza certo, e voltei o corte pra
7 antes de publicar. O gráfico vai começar a aparecer sozinho conforme
os dias de captura acumularem -- não precisa de mais código.

Divisão de trabalho combinada com outra sessão do Heber (a "Fable 5",
que também está mexendo no projeto): ela fica com as páginas de cupom
por loja (`/cupom/[loja]`, `/loja/[slug]`), eu fiquei com esse
gráfico -- arquivos diferentes, sem conflito.

## 2026-09-25 (tarde, continuação 10) — Pesquisa real: como o Zoom faz alerta de preço e o selo "preço bom"

Fui direto no produto de verdade no Zoom.com.br conferir as duas
peças que ainda faltam no nosso redesign (alerta de preço, selo de
"preço bom"), em vez de inventar como implementar.

Alerta de preço: no Zoom é um toggle na página do produto, mas clicar
já pede login (Google/Facebook/e-mail) -- eles avisam por "meios de
comunicação que você escolheu". Isso confirma que o nosso plano (push
do navegador, sem precisar de login) é uma simplificação real e não
um corte de canto -- push é anônimo por natureza (fica preso ao
navegador, não a uma conta), o Zoom só precisa de login porque
escolheu avisar por outros canais tipo e-mail.

Selo "preço bom": um indicador visual (verde/amarelo/vermelho) que
usa os 40 dias de menor preço diário pra dizer se o preço atual está
bom, normal ou alto -- metodologia real, divulgada na própria tela.
Achado técnico real: já temos boa parte do dado (offer_snapshots com
captured_at por linha), só falta agregar por dia em vez de só guardar
o mínimo histórico geral -- é construível com o que já temos, sem
integração nova. Não construí ainda, deixei documentado como próxima
peça candidata.

## 2026-09-25 (tarde, continuação 9) — Comissão real da Awin agora aparece no admin

Heber perguntou direto: "temos que colocar no nosso admin se chegar
alguma comissão dela via API?". Testei antes de responder: o endpoint
`/transactions` da Awin funciona de verdade com nosso token (200
confirmado), limite real de 31 dias por chamada (erro 400 testando
range maior). Construí e publiquei:

- `src/lib/awin/revenue.ts` -- busca transações reais, mesmo padrão de
  soma de comissão que já existia pra Shopee.
- `lib/admin/stats.ts` -- Awin e Shopee buscados em blocos
  independentes (falha de uma não derruba a outra).
- Painel admin: novo bloco "Receita e conversões — Awin (Kabum, Nike,
  Olympikus)" ao lado do da Shopee.

Hoje mostra R$0 -- dado real, não bug: nenhum dos 3 programas
(Kabum/Nike/Olympikus) teve venda confirmada ainda nos últimos 30
dias. Não consegui testar visualmente no painel local porque o Heber
trocou a senha do admin pelo próprio painel em algum momento (fica no
Supabase agora, não no `.env` local que eu tenho) -- compensei com
`tsc` limpo, `next build` completo sem erro, e o endpoint da Awin
testado isolado antes de integrar. Publicado junto com o commit
anterior (cabeçalho/logo), num lote só.

## 2026-09-25 (tarde, continuação 8) — Rechecagem real da Awin: leads de sportswear novos, eletrônicos ainda parados

Conferi de novo (via API real, não suposição) quantos programas da
Awin a conta já tem de verdade: continua só 3 -- Nike BR, Olympikus
BR, Kabum BR. Os leads de eletrônicos (Renner/Riachuelo/Acer/iPlace/
Gigantec) surgidos antes continuam sem aprovação -- ainda depende do
Heber agir no painel da Awin (não tem endpoint de API pra isso).

Achado novo: vasculhei os 233 anunciantes brasileiros ainda não
conectados atrás de mais alguém na categoria que JÁ funciona de
verdade pra gente (esporte, via Nike/Olympikus) -- achei 5 reais:
adidas BR, PUMA BR, Under Armour BR, Centauro BR e Decathlon BR.
Diferente dos leads de eletrônicos, esses não pedem nenhuma engenharia
nova -- é a mesma categoria que já roda (ingestão, site, Instagram),
só falta o Heber aprovar no painel.

## 2026-09-25 (tarde, continuação 7) — Cabeçalho claro + logo nova publicados (peça final do redesign de cor)

Heber gerou a logo nova (navy+terracota, sem verde) no ChatGPT certo
(a sessão que fez as 4 imagens originais, não a de debate) e mandou o
arquivo direto no chat. Apliquei: `public/LOGO-LIGHT.png`, cabeçalho
trocado pra fundo claro de verdade (#FDFBF7, literal da spec tirada
pixel a pixel das 4 imagens), texto/ícones navy, terracota só como
cor ativa. Busca virou pill branca com borda sutil. Testado local
desktop+mobile em home/produto/lojas-parceiras antes de publicar --
sem regressão. Confirmado ao vivo em produção via screenshot direto,
bate com o mockup de verdade agora (não é mais a versão escura
intermediária).

Achado à parte durante o teste: apareceu um erro de console
"BellIcon is not defined" mesmo com o código já limpo -- era cache
antigo do servidor de dev (`.next`), não bug real. Limpei o cache e
reiniciei, confirmado que sumiu.

**Aviso real do Heber sobre custo da Vercel**: 66 commits só hoje,
cada um builda de novo -- ele viu as notificações chegando toda hora
e ficou preocupado com surpresa na fatura. Consultei o gasto real
(Vercel MCP): ~US$0,83-1,50/dia, "Build CPU Minutes" é o maior item --
valor baixo em dólar, mas a frequência de push é o problema de
verdade. Juntei o que faltava (4 arquivos) num commit só antes de
publicar, e vou manter essa disciplina daqui pra frente -- não
publicar mais por partes.

## 2026-09-25 (tarde, continuação 6) — Publisher do Telegram construído (ainda inativo, esperando token)

Enquanto o header claro fica travado esperando a logo nova, adiantei o
Telegram (achado do ciclo anterior -- canal real "Bench Promos" na
mesma categoria da nossa Kabum). Construí de ponta a ponta:

- Migration `telegram_posts` (dedupe por produto, mesmo padrão de
  `social_posts` do Instagram) -- aplicada no banco real de produção.
- `src/lib/telegram/client.ts` -- `sendPhoto` mínimo contra a Bot API,
  erro claro se `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHANNEL_ID` não
  existirem (não falha silencioso).
- `src/app/api/cron/publish-telegram` -- pega produto real (Kabum
  primeiro, Shopee como fallback), monta legenda só com dado real
  (título, preço, % de desconto quando existe -- sem inventar specs ou
  cupom que não temos por produto), publica, registra o dedupe.
  `CRON_SECRET` fail-closed, mesmo padrão dos outros crons.
- Testei a query direto contra o banco de produção antes de dar por
  pronto: retornou produtos Kabum reais (ex: antivírus Kaspersky
  R$62,99, estabilizador Coletek R$84,99).
- Usa o link direto de afiliado, não o `/go` -- mesma cautela já
  aplicada ao WhatsApp (risco real de preview de link não testado
  nesse tipo de app).

**Não adicionei ao `vercel.json` ainda** -- fica pronto mas inativo até
o Heber criar o bot no @BotFather, adicionar como admin do canal e
mandar o token. Só aí testo um post de verdade ponta a ponta antes de
ligar o cron.

## 2026-09-25 (tarde, continuação 5) — Correção real do Heber: parei de inventar, spec literal do header + logo travada

Heber corrigiu direto: "Não invente" / "Siga as imagens como exemplo
fidedigno" -- eu tinha desenhado um BellIcon e escolhido cores/gradiente
sozinho, sem checar o que as 4 imagens de verdade mostram. Ele lembrou
que eu posso perguntar ao ChatGPT (quem gerou as imagens, enxerga o
que eu não enxergo nessa sessão) em vez de improvisar.

Pedi ao ChatGPT uma descrição literal e pixel-a-pixel do cabeçalho nas
4 imagens. Achado real que já corrige o que eu tinha inventado:
NENHUM dos 4 cabeçalhos é escuro -- todos são branco/creme
(aproximadamente #FDFBF7), texto/ícones navy, terracota só como cor
ativa/marca. E não existe sino de notificação em nenhuma imagem (eu
tinha inventado um) -- o que existe é ícone de favoritos (já é
funcionalidade real do site, só faltava link no cabeçalho), usuário/
conta (algumas telas), busca (algumas telas) e hamburger (mobile).
Registrei a spec completa (cores exatas, tipografia, ícones, altura)
na memória project_header_literal_spec_v1.

Implementei o cabeçalho claro seguindo a spec literal -- e bati num
bloqueio real: a logo atual (LOGO.png) tem "DESCONTO" em branco com
sombra preta, desenhada pro fundo verde escuro antigo. Em fundo claro
fica quase ilegível, e sobra só o verde brilhante da etiqueta +
"CHEGANDO" -- vira a maior mancha verde do site, pior que antes. Não
publiquei essa versão (ficou só local, sem commit) -- logo ilegível é
regressão real, não é um passo seguro.

Não inventei uma logo nova sozinho: perguntei ao ChatGPT, que não
consegue gerar imagem nesse chat mas escreveu um prompt de produção
completo e literal (ícone de etiqueta terracota, wordmark navy+
terracota, tagline, sem verde/gradiente/neon/sombra pesada). Passei
esse prompt pro Heber rodar no ChatGPT que gerou as 4 imagens
originais. **Travado esperando o arquivo da logo nova** -- o header
claro fica pronto assim que ela chegar.

## 2026-09-25 (tarde, continuação 4) — Canal real do Telegram encontrado (Bench Promos), mesma categoria do nosso estoque Kabum

Pesquisa de concorrente real desse ciclo: achei um canal ativo do
Telegram (Bench Promos, `t.me/BenchPromos`) postando ofertas de
hardware/notebook/periférico -- exatamente a mesma categoria do nosso
estoque real da Kabum (4.412 produtos). Posts com 1,7K-4,7K
visualizações, dezenas por dia (a cada 5-40min), sem o limite de ~25
posts/24h que já bateu no Instagram. Formato de post copiável direto:
título curto + preço, specs em uma linha, cupom quando existe, preço
parcelado, link (que passa pelo site próprio deles antes da loja,
igual ao nosso /go). Também usam a hashtag `#anúncio` em todo post
(sinal de transparência publicitária, barato de copiar).

Isso não é mais só pesquisa teórica (já tínhamos concluído que
Telegram era a aposta mais forte, ver CONTINUIDADE): agora tem um
exemplo real funcionando na nossa categoria exata. Falta só uma coisa
que só o Heber pode fazer: criar um bot via @BotFather (2 minutos) e
adicionar como admin de um canal -- daí dá pra automatizar 100% via
cron, sem CNPJ, sem toque manual recorrente.

## 2026-09-25 (tarde, continuação 3) — Quarta peça do redesign: removida a última fonte real de verde (fundo do cabeçalho)

Heber mandou correção real: "Mantenha o verde onde tiver verde no
mockup que enviei". Eu não tinha mais acesso visual às 4 imagens
(eram anexo de chat). Heber postou as mesmas 4 imagens de novo direto
na conversa de debate com o ChatGPT, que consegue ver imagem (eu não)
-- pedi pra ele descrever exatamente onde ficava o verde. Resposta:
verde só em "economia/sucesso", exatamente o que eu já tinha decidido
e implementado (badge "Economize R$X" e "menor preço" continuam
verdes, todo o resto virou terracota). Nada pra corrigir nessa parte,
só confirmação externa.

O ChatGPT também descreveu o resto da referência canônica que ainda
não tínhamos por escrito: fundo branco/creme quente, tipografia quase
navy, hierarquia da home (header → hero com busca → lojas parceiras →
categorias → menores preços → confiança), ordem da página de produto
(galeria → título → melhor preço → tabela de comparação → cupons →
especificações → similares, com barra de compra fixa no mobile) --
e uma regra importante: a tabela de comparação do mockup mostra 6
lojas juntas só de exemplo, no site real só entram as lojas que a
gente realmente tem pra aquele produto, sem inventar linha.

Com a cor confirmada certa, ataquei a peça que faltava: o
`BACKGROUND-HERO.png` do cabeçalho, uma imagem estática verde (não
CSS) que era a maior massa visual verde do site inteiro -- maior que
qualquer token já trocado. Cogitei gerar um asset novo, mas o saldo
de crédito de geração de imagem estava em 26, compartilhado com o
pipeline de vídeo que já gera receita de verdade (16 gerações de
vídeo já rodadas nele) -- gastar nisso numa imagem decorativa de
cabeçalho é decisão de dinheiro, não só técnica, então escolhi
resolver 100% em CSS: gradiente navy + terracota, sem depender de
nenhum asset gerado. Testado local desktop+mobile, sem erro de
console, sem regressão.

**Ainda não fiz**: virar o cabeçalho pro fundo branco/creme claro que
o mockup mostra de verdade (hoje ainda é escuro com texto branco,
decisão deliberada de risco menor pra não mexer em contraste de busca/
nav/sino tudo de uma vez); tabela de comparação real na página de
produto; barra de compra fixa no mobile; filtro secundário de loja
(hoje ainda é chip grande); alerta de preço via PWA.

## 2026-09-25 (tarde, continuação 2) — Terceira peça do redesign: cor de marca (terracota) no lugar do verde

Antes de mexer em código, contei todo uso real do token verde no CSS:
47 ocorrências. Separei em dois grupos de verdade -- ~33 eram cor de
marca/interação (botão CTA, botão comprar, pill ativo, hover, header,
busca) e ~14 eram semântica de verdade (badge "economize"/"menor
preço", confirmação de sucesso em formulário, painel admin interno
"status ok"/"subiu") -- esse segundo grupo continua verde de propósito,
não é a marca que muda, é o significado que fica.

Debati com o ChatGPT do Heber antes de decidir a cor nova: reusar o
laranja que já existe pra urgência/desconto (`--dc-urgency`) como cor
de marca colidiria visualmente com o selo de desconto -- o usuário
perderia a distinção entre "isso é a cor do site" e "isso é
desconto/urgente". Criei um terceiro tom, `--dc-brand` (terracota
#b9573f), deliberadamente mais escuro/dessaturado que o laranja de
urgência, mesma família visual do mockup que o Heber aprovou.
Convertidos os ~33 usos de marca, incluindo um verde que estava
hardcoded fora do sistema de variáveis (fundo da pílula de busca,
`#0a6b3c`) que um find/replace ingênuo teria deixado passar. `--dc-black`
também perdeu o tom esverdeado.

Testado local em home, página de produto, Lojas Parceiras e Cupons --
sem regressão, contraste ok em todo botão/badge convertido. Confirmado
ao vivo em produção via screenshot real do site (não é suposição).

**Ainda falta, agora confirmado como a maior peça que resta**: a
imagem de fundo do cabeçalho (`BACKGROUND-HERO.png`) é um PNG estático,
não CSS -- continua totalmente verde e agora é a maior fonte visual de
"parece verde" do site inteiro, maior que qualquer token de cor.
Precisa de um asset novo (gerar um, ou pedir ao Heber o asset por trás
do mockup dele) ou um redesenho só de CSS que tire a imagem de fundo.

## 2026-09-25 (tarde, continuação) — Home reordenada: produto real antes de banner/cupom

Segunda peça do redesign publicada. Reusei a section "Ofertas de hoje"
que já existia (produto real com preço e comparação) e movi pra logo
depois da busca, antes de categoria/guia/banner/cupom -- antes ficava
por último, atrás de banner institucional e cupom, exatamente o
problema que a crítica do ChatGPT (que o Heber trouxe) apontou. Nenhuma
seção nova criada, só reordenada. Testado local (desktop+mobile) e
confirmado ao vivo em produção via fetch direto do HTML: "Ofertas de
hoje" aparece na posição 6515 do HTML, "Cupons em destaque" só na
179647 -- ordem certa, não é suposição.

Falta a peça maior e mais arriscada do redesign: trocar o esquema de
cor (o cabeçalho hoje usa imagem de fundo escura verde, precisa virar
clara; CTA/botão precisa migrar pro laranja que já existe como
`--dc-urgency` no CSS). Não comecei ainda -- essa mexe em mais
componentes ao mesmo tempo, quero fazer com mais cuidado.

## 2026-09-25 (tarde) — Redesign do site: início dos trabalhos, achado o brief real por trás dos mockups

Heber mandou 4 imagens de referência ("Isso sim é um site padrão digno,
precisamos dar um jeito de fazer ele idêntico com todas as
funcionalidades") + link de um chat do ChatGPT compartilhado. Fui atrás
do link pelo Chrome (o navegador embutido não tinha acesso logado) e
achei o brief REAL por trás das imagens, não só o resultado visual:

- **Confirmado: é mockup gerado por IA, site não existe de verdade**
  ("O site não existe ainda estou criando imagens no chatGPT") -- então
  nenhuma funcionalidade mostrada é garantia de que funciona, cada uma
  precisa da própria checagem técnica antes de eu prometer algo.
- **A crítica real não é só visual, é de HIERARQUIA**: o ChatGPT apontou
  que a home hoje parece "portal de cupom" porque banner e cupom
  aparecem antes de produto/preço/comparação real. Pedido: busca em
  destaque, comparação de preço real logo abaixo, lojas viram filtro
  secundário (não botão gigante no topo), cupom desce de prioridade.
- **Cor: Heber pediu explicitamente "não puxada para verde nem cores
  típicas de IA"** -- não foi acidente da IA gerar laranja, foi
  instrução direta dele. Registrado pra não ficar reconsiderando depois.
- Confirmado por ele: sem login por enquanto ("não tem sentido"), alerta
  de preço via PWA (push do navegador, não WhatsApp/e-mail).

**Primeira peça no ar**: menu de navegação desktop no cabeçalho (Início/
Categorias/Lojas Parceiras/Cupons/Blog) -- não existia nenhum link além
do logo antes. Testado local (desktop esconde a barra de baixo do
mobile, mobile continua com o BottomNav de sempre) e publicado.

**Próximos passos anotados**: reordenar a hierarquia da home (busca +
comparação primeiro, categoria/cupom descem), trocar o esquema de cor
pra longe do verde. Trabalho grande, feito em pedaços, não tudo de uma
vez.

## 2026-09-25 (tarde) — Promotech: comparador de hardware real, monetiza só com afiliado (não patrocínio direto)

Pesquisando modelo de patrocínio/CPA direto em comparador (sugestão do
ChatGPT), achei a Promotech (promotech.app.br) -- comparador de hardware
gamer real, bem feito, o análogo mais próximo do que o Heber quer pro
nosso comparador: 45 lojas monitoradas, 10 mil+ produtos, anúncio
revisado por humano, alerta de queda de preço sem precisar de conta,
comparação lado a lado de até 4 produtos, até 1 ano de histórico,
próprio "PromoScore", canais de Telegram e Discord (terceira confirmação
real de que Telegram funciona nesse nicho, junto com Zoom/Buscapé e
Promobit).

**Resposta real e negativa pra pergunta original**: fui direto na página
"Lojas Parceiras" deles esperando achar modelo de patrocínio direto --
achei o contrário. A monetização deles é link de afiliado comum, igual
a nossa: "Quando você compra por um link nosso, podemos receber uma
pequena comissão... Afiliados sustentam o projeto." Nenhuma camada de
patrocínio, nenhum acordo direto de marca achado. Mesmo um comparador
mais maduro e polido que o nosso não foi além de comissão de afiliado
padrão -- evidência real contra perseguir modelo de patrocínio exótico
agora.

**Ideia real pra depois (não construída ainda)**: página de transparência
tipo "lojas parceiras" listando toda loja que monitoramos (Shopee/Kabum/
Nike/Olympikus/Mercado Livre) com texto explícito de que dinheiro nunca
muda o ranking -- feature de confiança genuína e barata de construir,
parecida em espírito com os guias editoriais. Não proposta ainda,
seguindo o acordo com o ChatGPT de pausar conteúdo/engenharia nessa
camada até ter dado real do Search Console.

## 2026-09-25 (tarde) — Promobit tem blog editorial de verdade (valida nossa estratégia) + é a mesma empresa do Méliuz

Depois de linkar os guias, fui checar se um concorrente real já faz algo
parecido -- a home do Promobit é só feed de ofertas (sem conteúdo
editorial nenhum ali), mas achei um subdomínio separado e ativo:
`blog.promobit.com.br`, com posts reais tipo "Os Melhores Colchões em
Caixa", "Qual o melhor iPhone?", "Tênis de corrida feminino: as 5
melhores" -- um deles descrito como "com histórico de preço real do
Promobit", ou seja, eles também misturam texto editorial com dado real
de preço, exatamente o padrão técnico que acabei de construir. Confirma
de forma independente que a estratégia faz sentido, não foi invenção
isolada. Cadência de posts é modesta (poucos por mês) -- bate com a
escolha de fazer 6 guias bons em vez de um monte genérico.

**Achado estrutural à parte**: o rodapé do blog lista "Empresas do Grupo
CASH3": IDinheiro, Melhor Plano, Méliuz, Minha Conexão, Muambator --
**Promobit é a mesma empresa do Méliuz**, não concorrente separado.
Segunda confirmação real do padrão de consolidação multi-marca (a
primeira foi Zoom/Buscapé/Bondfaro sob a Mosaico, achado mais cedo hoje).
Não muda nada do que já construímos, só reforça o material de referência
de longo prazo já registrado na memória.

## 2026-09-25 (tarde) — 6 guias de compra reais no ar (/guia), aprovado pelo Heber

Heber topou direto ("Não precisa de exemplo pode fazer") depois de eu
explicar o que seria a proposta de conteúdo editorial debatida com o
ChatGPT mais cedo. Antes de escrever qualquer texto, conferi cada tópico
contra o catálogo real no banco -- e isso mudou o plano:

- Descartei "air fryer" (sugestão do ChatGPT) -- checamos o catálogo e
  não vendemos fritadeira elétrica de verdade, só acessório de silicone
  pra air fryer. Ia ser um guia promovendo produto que não temos.
- "Notebooks até R$3.000" virou "até R$4.000" -- o notebook mais barato
  real do catálogo custa R$3.199,99, não menos que isso.
- Pra cada guia, busquei produto real por SQL antes de escrever: pares
  reais Kabum×Shopee de SSD (um onde a Kabum ganha, outro onde a Shopee
  ganha -- não escolhi a dedo pra sempre favorecer uma loja), a mesma TV
  Philips 50PUG7300 real em duas lojas, 4 modelos reais de tênis
  Olympikus que existem no catálogo hoje.

**6 guias no ar**: Kabum ou Shopee (SSD), SSD NVMe ou SATA, TV 4K 50",
Notebook até R$4.000, Tênis Olympikus, Como sabemos se um preço é bom
(explica o selo de menor preço/histórico que já existe no site).

**Implementação**: `src/lib/site/guides.ts` guarda o conteúdo como
blocos (texto + slug de produto real) -- nunca preço fixo no texto.
`src/app/guia/[slug]/page.tsx` resolve cada produto AO VIVO via
`getCachedProduct` (mesmo cache da página de produto normal), reusando
`ProductCard`/`ProductGrid` já existentes. Página índice em `/guia`.
Sempre indexável (conteúdo original de verdade, sem precisar do
SEQ_INDEX_GATE que protege produto fino da Kabum).

**Testado antes E depois do deploy**: `npx tsc --noEmit` limpo; rodei
localmente as 6 páginas + índice, conferi visual (desktop e mobile
375px, sem estouro), console mostrou erro que investiguei e confirmei
ser só ruído de startup do servidor de dev (todo conteúdo real
renderizou certo em todas as páginas). Depois do deploy: sitemap.xml de
produção buscado direto, 7 URLs novas confirmadas (índice + 6 guias);
página de guia real verificada com `<meta name="robots" content="index,
follow">`.

**Não feito ainda**: nenhuma página existente (produto/categoria) linka
pros guias novos ainda -- só alcançáveis por /guia e pelo sitemap.

**Resolvido no mesmo dia**: adicionei `categorySlug` em cada guia
(conferido contra `category_slug` real no banco, não assumido -- SSD/TV/
notebook são `eletronicos`, tênis Olympikus é `esporte`) e uma seção
"Guias de compra" no fim de cada página de categoria que bate, linkando
os guias relevantes. O guia universal (sem categoria específica, "como
sabemos se um preço é bom") ficou linkado no rodapé, alcançável de
qualquer página do site. Testado ao vivo em produção via inspeção direta
do DOM: `/categoria/eletronicos` mostra os 4 guias certos + link do
rodapé, `/categoria/esporte` mostra o guia de tênis + link do rodapé.
Ainda falta: link direto de página de PRODUTO individual pro guia
relacionado (só categoria por enquanto).

## 2026-09-25 (manhã, continuação) — Respondi pergunta original do Heber: dá pra vender dado agregado de preço B2B?

Essa pergunta ficou sem resposta real desde o início da sessão (o
Gemini recusou/travou 2x, nunca insisti mais). Respondi direto com busca
própria: SIM, existe mercado B2B real de venda de dado de preço no
Brasil -- InfoPrice (fundada 2013, captou R$15 milhões, ~100 clientes em
2021, provavelmente mais hoje), Precifica, Priceva, Prisync. MAS achado
importante: a fonte de dado principal da InfoPrice é varejo FÍSICO,
coletado com hardware próprio em loja -- não é a mesma coisa que nosso
dado (preço de marketplace online: Shopee, Kabum, Nike/Olympikus via
Awin). Então o ângulo específico "dado de marketplace online" não está
obviamente saturado pelo player líder, mas construir um produto de dado
B2B de verdade (venda enterprise, infraestrutura de API pra cliente
externo, contrato, garantia de qualidade) é um negócio bem diferente de
site de achadinho, e muito além da nossa escala hoje. Registrado como
referência de longo prazo (Fase 3/4), não recomendação de agora --
mesmo tratamento que dei pro achado Zoom/Buscapé/Mosaico.

## 2026-09-25 (manhã, continuação) — Correção real: parâmetro certo é countryCode=BR, não region=BR

O ChatGPT pegou um detalhe técnico no achado do diretório Awin: eu tinha
usado `region=BR` (que a API ignora silenciosamente) e concluído errado
que o filtro regional "não funciona". Testei de novo com o parâmetro
certo, `countryCode=BR` -- bate exatamente: 233 resultados, 0 estrangeiro
misturado, filtro server-side real. O dado final (233, os mesmos 12
candidatos de eletrônicos) sempre esteve certo, só o diagnóstico do
"porquê" estava errado -- registrado pra não repetir o parâmetro errado
no futuro. Ele também confirmou (doc oficial da Awin) que realmente não
existe endpoint público pra "entrar" num programa via API, e priorizou
os 3 candidatos por chance real de sobreposição: Gigantec > iPlace >
Acer. Boa ideia adotada: não mandar 1 mensagem por anunciante -- juntar
tudo numa memória do estilo "quando entrar no painel, pede esses 3
também" e só notificar o Heber quando tiver um lote que valha a pena.

## 2026-09-25 (manhã, continuação) — Achado técnico real: dá pra listar TODO o diretório de anunciantes da Awin não-aprovados via API

Seguindo sugestão do ChatGPT (procurar mais anunciante Awin com
identificador forte + sobreposição real de catálogo com a Kabum, foco em
eletrônicos, não moda). Testei se o AWIN_API_TOKEN (já usado só pra
`promotions` com `membership: joined`) também conseguia listar
anunciante NÃO aprovado ainda -- testei direto: `GET
api.awin.com/publishers/2596713/programmes?relationship=notjoined`
funciona, devolve o diretório GLOBAL inteiro (21.314 programas). O
parâmetro `region=BR` da API NÃO filtra de verdade (testei, veio tudo
misturado) -- tive que filtrar por `primaryRegion.countryCode === "BR"`
no lado do cliente pra chegar nos 233 reais do Brasil.

**12 anunciantes de eletrônicos/tech do Brasil ainda não aprovados**,
filtrados e revisados manualmente (removi falso positivo "Technos BR",
que é joalheria, não eletrônico). Os 3 mais fortes: **Acer BR**
(fabricante direto, provável sobreposição real com o que a Kabum já
vende), **iPlace BR** (revenda oficial Apple confirmada, sobreposição
forte com os MacBook/iPad que já vi no próprio sitemap da Kabum hoje),
**Gigantec BR** (confirmei via busca: loja real de hardware desde 2012,
selo RA1000, declarou ambição de entrar no top 4 de e-commerce de
informática do Brasil -- concorrente real de escala parecida com a
Kabum, o candidato mais forte pra comparação EAN/MPN de verdade).
Achados menores descartados por categoria não bater (capinhas de
celular, aluguel de gadget, plano de operadora).

Ainda não propus isso pro Heber -- já mandei 2 mensagens de WhatsApp
nesse ciclo (Renner + Riachuelo), vou esperar resposta antes de
emendar mais pedido.

## 2026-09-25 (manhã, continuação) — Riachuelo também é Awin (ID 86587), aproveitei a mesma mensagem

Achei que a Riachuelo (a outra loja de moda nos destaques da conta de
referência) também está na Awin, ID 86587, confirmado via busca real
(comissão padrão Awin, taxa de 25% sobre a comissão, pago em EUR com
dedução de câmbio de 5% -- termo padrão da rede, não específico dessa
loja). Já que o Heber vai entrar no painel da Awin pra pedir a Renner
mesmo, mandei complemento no WhatsApp sugerindo pedir as duas de uma vez
(evita ele logar duas vezes). Nada construído ainda -- só esperando ele
pedir e a aprovação vir.

## 2026-09-25 (manhã, continuação) — Renner: Heber topou, mandei passo a passo (precisa do login dele, não é automatizável)

Heber respondeu "fique à vontade" sobre pedir a Renner como anunciante
novo. Antes de fazer qualquer coisa, chequei se dava pra automatizar via
API -- confirmado nos docs da própria Awin: entrar num programa de
anunciante é ação só pela interface (Advertisers > Join Programmes), sem
endpoint de escrita público pra isso. A gente só tem AWIN_API_TOKEN e
AWIN_DATAFEED_KEY no .env, nenhum login de painel -- e não vou pedir a
senha dele pra fazer login por ele, isso é o tipo de credencial que devo
evitar manusear, não contornar. Mandei o passo a passo exato pro
WhatsApp dele (entrar em ui.awin.com, Advertisers > Join Programmes,
procurar "Lojas Renner BR" -- ID 17801 -- e pedir o programa "Favoritos
Renner"). Fica pendente de aprovação (mesmo padrão da Kabum), e quando
aprovar o código de ingestão já existe pronto pra reusar -- nada pra
construir agora, só esperando o clique dele + aprovação.

## 2026-09-25 (manhã, continuação) — Concorrente Instagram real (@promos.lari) + achado: Renner já dá pra pedir na nossa conta Awin

Primeira pesquisa da sessão focada em conta de achadinhos NATIVA do
Instagram (antes só tinha pesquisado site comparador/cashback --
Pelando, Cuponomia, Méliuz, Zoom/Buscapé). `@promos.lari` (4.845
seguidores, ~3x o nosso) usa exatamente a mesma estrutura de funil que a
gente já usa: nome com palavra-chave, bio curta, 1 link (Linktree) que
manda pro grupo de WhatsApp. Confirma que nossa estrutura já bate com o
que uma conta maior do nicho faz -- não é gap, é validação.

Instagram deslogado limita muito o que dá pra ver (só 3 posts do grid
sem login), então não confirmei estilo de conteúdo real (rosto humano x
foto de produto) além da bio/destaques.

**Achado novo real**: os destaques dela incluem Renner e Riachuelo
(moda). Chequei se dá pra ter isso também -- o programa "Favoritos
Renner" roda na Awin, MESMA rede que já temos conta aprovada (Nike/
Olympikus/Kabum). Rodei `listAwinFeeds()` contra a conta real: Renner
NÃO está entre os 4 feeds ativos hoje. Mesmo padrão do gap já documentado
de Magalu/Americanas -- precisa pedir aprovação como anunciante novo
dentro da Awin (passo de negócio, provavelmente CNPJ do Heber), não é
código. Vale propor pro Heber como próximo anunciante pra pedir --
moda/vestuário é categoria real que hoje não cobrimos (só tênis +
eletrônicos na Awin).

## 2026-09-25 (manhã, continuação) — Mandei pro Heber os 2 pontos que dependem dele (Search Console + conteúdo editorial)

Os dois itens que sobraram da pesquisa de monetização precisam de
decisão/ação do Heber, não são engenharia pura -- mandei mensagem direta
pro WhatsApp pessoal dele (número já confirmado nesta sessão) pedindo:
(1) ele verificar a propriedade `descontochegando.com.br` no Google
Search Console (conta dele, 2 minutos, grátis) e me mandar o código da
tag HTML de verificação; (2) decisão de prioridade sobre começar a
escrever 6-10 páginas editoriais reais ligadas ao catálogo (guias de
compra tipo "Kabum ou Shopee: onde SSD é mais barato?"). Ainda sem
resposta -- registrar aqui quando ele responder.

## 2026-09-25 (manhã, continuação) — Correção real: AdSense não trava em Search Console nem em "20-30 posts" (o ChatGPT pegou, verifiquei de novo)

O ChatGPT corrigiu a pesquisa de AdSense de cedo: não existe exigência
oficial de Search Console verificado pra aprovação, nem regra oficial de
"20-30 posts de 600-800 palavras" -- isso é benchmark de comunidade SEO,
não política publicada do Google. Verifiquei de novo com busca própria
direto no `support.google.com`: bate com o que ele disse -- os requisitos
reais são conteúdo original/de qualidade, páginas Sobre/Contato/
Privacidade, HTTPS, conformidade com política de editor, sem número
oficial de tráfego ou artigo (só orientação informal mais fraca: "menos
de 15-20 artigos de qualidade raramente passa"). Lição: verificar
alegação de política do Google direto na fonte antes de repetir como
fato -- o resumo de busca anterior parecia plausível mas errava nos
detalhes.

**Plano refeito (do ChatGPT, verificado, adotado)**: (1) Search Console
AGORA, mas por razão de negócio -- ver dado real de indexação/impressão
das 1.801 páginas de produto + 53 de intenção de preço que construí hoje,
não porque bloqueia AdSense. Ainda precisa da conta Google do Heber, vou
pedir a ele. (2) Camada editorial pequena (6-10 páginas reais ligadas ao
catálogo -- ex: "Kabum ou Shopee: onde SSD é mais barato?", usando
offer_snapshots de verdade -- não "10 dicas" de enchimento) serve SEO +
confiança + conversão de afiliado ao mesmo tempo, AdSense é consequência,
não objetivo. Decisão de conteúdo/prioridade, vou propor pro Heber, não
construir sozinho. (3) Argumento econômico real que não tinha
considerado: anúncio display na página de produto compete direto com o
clique de afiliado ("Ver oferta") -- poucos centavos de RPM podem
destruir muito mais RPV de afiliado por sessão. Não ativaria AdSense nem
se aprovado sem medir isso primeiro, e só testaria em conteúdo
editorial/topo de funil, nunca nas páginas de comparação.

## 2026-09-25 (manhã, continuação) — Pesquisa real: Zoom/Buscapé é uma empresa só, Ezoic fora de cogitação, AdSense travado em conteúdo

Voltando pra pesquisa/monetização depois de fechar o comparador Kabum.

**Zoom/Buscapé (referência do Heber pra positioning "Híbrido")**: achado
real navegando o site -- Zoom, Buscapé e Bondfaro são a MESMA empresa
(Mosaico), confirmado no portal do anunciante (`anunciante.zoom.com.br`):
"suas ofertas podem ser exibidas em todas essas plataformas... time
Comercial único". Cada marca fica independente pro consumidor, mas o
anunciante compra acesso às 3 de uma vez -- confirma de novo o modelo de
Retail Media já visto no Promobit, agora com estrutura de portfólio
multi-marca. Cashback do Zoom também não é produto próprio: é funil pro
Banco PAN (conta digital). Não é acionável agora (precisa de CNPJ,
demanda de anunciante, tráfego que não temos) -- fica como referência
de longo prazo.

**Anúncio display (Ezoic/AdSense)**: o Gemini (aba já aberta de pesquisa
anterior) recusou/travou de novo nessa pergunta (confirma
[[feedback_gemini_unreliable_for_this_thread]], não insisti) -- usei
busca direta. Resultado real: **Ezoic exige 250 mil+ usuários mensais**
pra sequer entrar, hoje fora de cogitação. **AdSense não trava por
tráfego** (10-20 visitas/dia já basta), mas trava em dois pontos reais:
(1) Search Console verificado sem erro -- gap já conhecido, nunca feito;
(2) política 2026 exige 20-30 posts originais de 600-800+ palavras --
Desconto Chegando é site de listagem de produto, não blog, e nossas
páginas (mesmo as "boas" pelo SEO_INDEX_GATE de hoje cedo) são
título+preço+comparação, longe disso. Não é bloqueio técnico, é
conteúdo editorial que não existe ainda -- não vou prometer AdSense como
"rápido" pro Heber sem isso resolvido.

## 2026-09-25 (manhã, continuação) — 2 bugs reais no sitemap, corrigidos e testados antes de confiar

Logo depois do SEO_INDEX_GATE v1 ir pro ar, o ChatGPT pegou um bug real:
o sitemap filtrava `isProductIndexable` em cima dos "24 produtos mais
recentes" em vez do conjunto indexável de verdade -- no dia do backfill
Kabum isso zerou o sitemap (as 24 mais recentes eram 100% Kabum sem
sinal de valor ainda), mesmo com 2.754 produtos indexáveis reais no
banco. Ele apontou certo: "não se resolve sozinho", já que o refresh
diário sempre toca `updated_at`.

**Corrigido**: `getCachedIndexableProducts()` busca o conjunto indexável
direto (sem o limit(24) que só fazia sentido pro card da home), aplica
`dedupeByGroup` antes do filtro (nunca 2 URLs pro mesmo produto físico),
`lastModified` passa a usar `priceCheckedAt` real.

**Testei ANTES de subir de novo** (depois de já ter sido pego uma vez na
mesma hora, decidi não arriscar de novo às cegas): rodei um script real
contra o banco de produção replicando a nova query -- resultado: 328
indexáveis, não os 1.801 esperados (já conferidos por SQL antes).
**Segundo bug real, achado por mim mesmo antes de qualquer deploy**: o
Supabase/PostgREST corta silenciosamente `.select()` sem `.range()` em
~1.000 linhas -- sem erro, só trunca. Ordenando por slug ascendente,
isso cortava o catálogo pela metade alfabética. Corrigido: pagina em
blocos de 1.000 até esgotar. Testei de novo com o mesmo script real:
6.336 linhas brutas → 5.383 canônicas (dedup por grupo) → exatamente
1.801 indexáveis, batendo com o SQL de verificação.

**Deploy final verificado ao vivo** (não assumido): busquei
`sitemap.xml` de produção direto via fetch depois do build -- 1.801 URLs
de produto reais, batendo exatamente com o número calculado. Lição de
processo: qualquer query Supabase que pode voltar mais de ~1.000 linhas
precisa de `.range()` explícito -- o cliente falha calado, sem erro, só
truncando; só um teste real contra dado de produção pega isso.

## 2026-09-25 (manhã, continuação) — SEO_INDEX_GATE v1: catálogo ≠ indexação (verificado ao vivo antes e depois)

Próximo item da lista do ChatGPT depois de fechar o matcher: "ingerir
4.412 produtos não significa indexar 4.412 páginas automaticamente."
Investiguei ao vivo antes de escrever qualquer linha (mesma disciplina
usada no matcher):

- O sitemap (`src/app/sitemap.ts`) já era limitado a 24 URLs de produto
  no total (`.limit(24)`, ordenado por snapshot mais recente) -- NÃO
  lista os 4.412 da Kabum de uma vez. Conferido ao vivo em
  `descontochegando.com.br/sitemap.xml` antes de supor qualquer coisa.
- MAS a página de produto (`/produto/[slug]/page.tsx`) não tinha NENHUM
  campo `robots`, e o `robots.ts` libera tudo (`allow: "/"`) -- toda
  página de produto vira `index,follow` por padrão se o Google achar o
  link (link interno de categoria, compartilhamento, etc), não importa o
  quão fina seja.
- Confirmado ao vivo visitando uma página real Kabum sem `group_id`: o
  corpo inteiro da página é literalmente "NOSSA ESCOLHA / [título] /
  preço atualizado há X / R$ preço / Ver oferta no KaBuM! / Voltar" --
  sem descrição, sem ficha técnica, sem nota/venda (o feed da Awin
  estruturalmente não tem isso). Exatamente o "thin content" que o
  ChatGPT alertou.

**Corrigido**: `isProductIndexable()` em `src/lib/site/catalog.ts` --
exige preço e imagem válidos, título com pelo menos 15 caracteres, E
pelo menos UM sinal real de valor: comparação multi-loja (`group_id`),
descrição curada (`highlight_reason`, hoje só Shopee) ou prova social de
verdade (nota + vendas ≥10, também só Shopee tem). De propósito, NÃO
gateado só em "tem comparação" -- o ChatGPT alertou que isso jogaria
fora produto Shopee bom sem par cross-store. Ligado no `sitemap.ts`
(filtra produtos) e no `generateMetadata` da página de produto
(`robots: { index: isProductIndexable(product), follow: true }` --
continua crawleável/linkável, só não pede indexação).

**Impacto real medido no banco antes de subir**: Shopee fica quase
100% indexável (1.725/1.762 = 98%, já tem nota+venda de verdade --
confirma que o gate não é agressivo demais pra quem já tem sinal
próprio). Kabum cai pros 968/4.412 indexáveis -- exatamente o número de
comparações reais, porque hoje só ganha indexabilidade via match com
Shopee. Nike/Olympikus ~26/51-55 (metade). Total: 2.754/6.336 produtos
publicados (~43%) indexáveis.

**Deploy verificado ao vivo depois do build (commit `affce52`)**, não só
assumido: `sitemap.xml` agora tem 0 URLs de produto (esperado -- a janela
dos "24 mais recentes" está saturada de Kabum recém-chegado sem sinal
ainda; deve se recompor sozinha conforme os crons diários intercalam
Shopee de novo nessa ordenação); uma página Kabum real sem comparação
agora serve `<meta name="robots" content="noindex, follow">`; uma página
Shopee real continua servindo `index, follow`. Os dois conferidos no
HTML renderizado de verdade, não assumidos pelo código.

## 2026-09-25 (manhã, continuação) — Gate de validação de atributo pros matches Kabum×Shopee (988 → 968, auditoria retroativa aplicada)

Seguindo a recomendação do ChatGPT ("esse índice já justifica endurecer
o matcher agora"), construí `src/lib/awin/matchValidation.ts`
(`findMatchConflicts`) e liguei no `matchAndLinkShopee` do cron: antes de
criar um `group_id` novo, compara o nome dos dois produtos procurando
valor-com-unidade conflitante (armazenamento/cache GB-TB-MB, potência W,
taxa de atualização Hz, peso/capacidade kg, voltagem V, tela, resolução
K, diâmetro mm). Se os dois lados falam da mesma classe de atributo e o
valor diverge, REJEITA o match (não cria comparação) -- falso negativo é
preferível a mostrar dois produtos diferentes como se fossem o mesmo.

**Processo real que vale registrar**: a primeira versão do gate também
tinha um check de "número solto" (qualquer dígito sem unidade, pensado
pra pegar exatamente o caso "Action 4 x Action 360") e um de "palavra de
edição" (ice/pro/max/ultra/...). Antes de confiar, rodei um dry-run
contra os 987 matches reais em produção
(`scripts/audit-kabum-shopee-matches.ts`, sem `--fix`) -- resultado:
~102/963 (10,6%) flagados, e a esmagadora maioria era falso alarme de
tokenização ("LGA 1700" com espaço vs "LGA1700" sem espaço perde o
limite de palavra do regex; "ultra" batendo em "Ultra-Baixa Latência",
marketing genérico, não nome de produto). **Removi os dois checks
ruidosos** em vez de tentar consertar a tokenização, ficando só com o
check de unidade, estruturalmente mais confiável porque a unidade ancora
o número a um atributo específico. Rodei o dry-run de novo com a versão
enxuta: 18/963 (1,9%) flagados, todos plausíveis conferindo manualmente
(cadeira Rise Mode X06 120kg x 100kg -- mesmo caso já achado na QA
manual; water cooler Thermaltake 120mm x 240mm, tamanho de radiador
fisicamente diferente; Kindle "Colorsoft" x "Paperwhite", linha de
produto diferente; vários Ryzen com cache mais baixo do lado Kabum que
Shopee pro MESMO código oficial AMD, provavelmente metodologia de
cache diferente entre as fontes, não SKU errado -- mantive bloqueado
mesmo assim pelo princípio "falso negativo é mais barato").

Apliquei `--fix`: 18 deslinkados pelo gate + os 2 casos DJI (o já achado
manualmente + um segundo, DJI215, achado só de bater o olho no resultado
ruidoso do primeiro dry-run antes de descartar aquela versão) removidos
direto no banco. **988 → 968 comparações reais Shopee×Kabum**, conferido
com contagem direta no banco. O gate agora roda pra todo match novo que
o cron diário criar daqui pra frente. `npx tsc --noEmit` limpo em cada
etapa. Lição de processo pro futuro: testar qualquer heurística nova de
auto-bloqueio/auto-match contra dado real de produção ANTES de confiar
nela ou ligar em produção -- uma heurística que "parece certa" pode ter
um bug de tokenização que só aparece em volume.

## 2026-09-25 (manhã, continuação) — QA amostral dos 988 matches Shopee×Kabum: 1 comparação errada encontrada e removida

Seguindo o pedido do ChatGPT (amostra de 50-100 casos checando variante/
capacidade/cor/voltagem/modelo), tirei uma amostra aleatória real de 60
matches (`order by random()` no banco de produção) e conferi cada par.
**1 comparação genuinamente errada**: "Câmera DJI Osmo Action **4**
Standard Combo" (Kabum) linkada com "Câmera DJI Osmo Action **360**
Standard combo 8K/50fps" (Shopee) — duas câmeras de linhas bem diferentes
que só bateram porque as duas descrições continham o mesmo código
"DJI214". Deslinkei na hora (zerei `group_id` dos dois produtos, apaguei
o `product_groups` vazio) — isso estava aparecendo como comparação real
pro usuário no site. Achei também ~4 casos de menor risco (mesmo código
SKU, mas um atributo diverge entre a descrição Kabum e Shopee: cor,
capacidade de peso, tamanho de tela, variante "ICE") — documentados na
memória, não mexidos ainda. Taxa de erro da amostra: ~1,7% confirmado
errado, ~8% com alguma divergência de atributo. Confirma o alerta do
ChatGPT: o matcher por MPN+marca deixa passar exceção ocasional — não é
motivo pra parar a ingestão, mas é candidato real a um reforço futuro
(checar sobreposição de texto/modelo além de MPN+marca) se isso virar
prioridade.

## 2026-09-25 (manhã, continuação) — Rotação por staleness no cron diário da Kabum (bug real do "limit:50" corrigido)

O ChatGPT revisou o backfill (4.412 produtos, 988 comparações) e levantou uma
preocupação técnica: `dedupeCheapestVariants` sempre ordena por preço
crescente, e o cron diário fazia `.slice(0, 50)` direto nisso — ou seja,
todo dia reprocessava quase o MESMO grupo dos 50 produtos mais baratos do
feed (preço relativo não muda muito de um dia pro outro). Os outros ~4.362
produtos do backfill ficariam com preço/estoque parados pra sempre, sem
nenhum mecanismo de rotação. Confirmei lendo o código (`ingestBatch` em
`src/app/api/cron/source-awin/route.ts`) e com uma query real no banco:
`updated_at` da tabela `products` (platform=kabum) já mostrava um spread de
2026-09-21 a 2026-09-25 — o problema já estava começando a se formar.

**Corrigido**: `src/lib/awin/ingest.ts` ganhou `fetchLastUpdatedByVariantKey()`
(reusa `products.updated_at`, que já é tocado a cada upsert — sem coluna
nova) e `orderByFreshness()` (produto nunca visto primeiro, depois o mais
velho sem refresh primeiro). Ligado no cron via `prioritizeStale: true`,
só pra Kabum (Nike/Olympikus continuam preço-primeiro, catálogo pequeno
não justifica). O `score` do deal_candidate continua calculado pelo rank
de preço ORIGINAL (antes da reordenação por staleness) — staleness decide
só quem é atualizado no dia, não quem é priorizado pra postar no
Instagram/WhatsApp. Limite diário da Kabum subiu de 50 → 150 (refresh puro
é barato — 2 writes + webhook não-bloqueante; match com Shopee só roda de
verdade pra produto novo, raro pós-backfill), o que dá uma volta completa
no catálogo a cada ~30 dias em vez de nunca. `npx tsc --noEmit` limpo.
Ainda não observado em produção (só a próxima execução do cron confirma de
verdade) — se `updated_at` continuar concentrado no mesmo grupo daqui a
uns dias, a reordenação não está pegando e precisa de outro olhar.

## 2026-09-25 (manhã, continuação) — Backfill do catálogo Kabum terminou: resultado real

`scripts/backfill-kabum-full-catalog.ts` terminou (~66 min, rodou em
background). Resultado conferido direto no banco de produção, não só no
log do script: **4.412 produtos Kabum publicados no site** (4.397 do
backfill + alguns que já existiam antes), **988 já com comparação de
preço real linkada com a Shopee** (~22% de taxa de match por MPN+marca,
ver `src/lib/awin/matchShopee.ts`), **0 falhas** em todo o processo.
Catálogo completo de verdade, como o Heber pediu — não é mais só 12
produtos/dia.

## 2026-09-25 (manhã, continuação) — Cupom expirado sendo exibido de verdade, corrigido

Puxando o fio da conversa de "premium/confiança" com o Heber, investiguei se
os cupons mostrados no site (`/cupons`, home) ficam mesmo em dia sozinhos.
Achado real, não hipotético: a query que decide quais cupons aparecer
(`queryActiveCoupons` em `src/lib/site/coupons.ts`) **nunca filtrava por
`status`, só por data** (`ends_at`). O cron da Awin (`source-coupons`) já
marca cupom como `status: 'expired'` quando ele some do feed "active" da
Awin de verdade (ex: anunciante encerrou a promoção antes da data que
tínhamos salva) — mas como a página nunca olhava esse campo, isso não
tinha efeito nenhum na exibição.

**Conferido no banco antes de mexer em código**: 11 cupons reais (Kabum,
Nike, Olympikus — ex: "25% OFF JBL", "AQUECE20") estavam com
`status='expired'` (a Awin já não reconhece mais essas promoções como
ativas) mas ainda apareciam no site porque a data salva (`ends_at`) ainda
não tinha passado. Ou seja: visitante real podia estar clicando em cupom
que a própria rede já tinha puxado.

**Segundo achado, mesmo problema por outro ângulo**: o cron da Lomadee
(`source-lomadee`) nunca tinha essa lógica de expirar cupom sumido do feed
— só a Awin tinha. 3 de 24 cupons Lomadee hoje não têm `ends_at` nenhum,
então ficariam visíveis pra sempre mesmo que a campanha real acabasse.

**Corrigido**: (1) `queryActiveCoupons` agora filtra `status = 'active'`
também, não só data — reativa a lógica que a Awin já tinha; (2)
`source-lomadee/route.ts` ganhou a mesma lógica de expirar cupom que
sumiu do feed "onTime" da Lomadee, igual ao padrão já usado pela Awin.
Testado local em `/cupons` antes de subir: os 11 cupons reais que
deveriam ter sumido, sumiram; os que continuam válidos continuam
aparecendo. `npx tsc --noEmit` limpo.

## 2026-09-25 (manhã, continuação) — ChatGPT pegou 2 furos reais nos selos, corrigidos

Levei os selos novos pro ChatGPT debater (não só validar). Achou 2 problemas
reais:

1. **Bug real**: o selo de atualização usava `updatedAt` (campo genérico
   `products.updated_at`, que muda por qualquer edição — categoria, slug —
   não só checagem de preço). O timestamp certo é
   `offer_snapshots.captured_at` (via `site_catalog.snapshot_captured_at`),
   que eu nunca tinha exposto no `SiteProduct`. Corrigido: novo campo
   `priceCheckedAt` em `catalog.ts`, coluna adicionada em
   `SITE_CATALOG_COLUMNS`, `page.tsx` trocado pra usar o campo certo.
2. **Wording**: "Menor preço dos últimos N dias" podia soar como "menor
   preço do mercado inteiro" quando na real é só o que a gente monitorou
   (hoje só Shopee/Awin). Trocado pra "Menor preço que monitoramos nos
   últimos N dias" — mais defensável, mesma ideia.

Testado local depois da correção: bati um cache antigo do Next (`.next`
tinha um `unstable_cache` guardado de antes de eu adicionar a coluna nova
na query) — o selo de atualização sumiu na primeira checagem. Limpei
`.next`, reiniciei o dev server, conferi de novo: os dois selos voltaram
com dado real ("Menor preço que monitoramos nos últimos 12 dias" + "Preço
atualizado há 2 dias", batendo com o snapshot real de 23/09). `npx tsc
--noEmit` limpo (bateu erro real em `favoritos/page.tsx`, que montava um
`SiteProduct` manual sem o campo novo — corrigido também).

## 2026-09-25 (manhã, continuação) — Revertido também no WhatsApp: link direto pro produto, não pelo /go

Heber notou que o link do WhatsApp também tinha virado `/go` e decidiu:
"melhor levar logo para o produto do que ter que clicar para o site,
isso pode perder a venda por clique" — decisão de negócio dele,
priorizando conversão direta sobre o dado extra de atribuição de canal
(mesmo eu já tendo confirmado antes que o card de prévia em si não
quebrava com `/go`, lendo o código real da Z-API).

`publish-whatsapp-group/route.ts` — `trackedLink` agora é
`candidate.offerLink` direto, sem passar pelo `/go`. Removida a
constante `SITE_URL` que ficou sem uso.

**Resultado**: `/go` não está mais em nenhuma legenda/mensagem social
(Instagram nem WhatsApp) — só dispara quando alguém já está no site
(página de produto, páginas de SEO por preço). O buraco de atribuição de
clique social que o `/go` fechava está aberto de novo, por escolha
consciente do Heber nos dois canais, não por acidente.

## 2026-09-25 (manhã, continuação) — Revertido: /go na legenda do Instagram quebrava a marcação de produto do Heber

Heber apontou algo real: ele edita cada post publicado e **cola o link da
legenda** no campo "Use um link para um produto" do Instagram pra marcar
o produto Shopee (ícone de compra nativo). O Instagram só reconhece link
direto da Shopee nesse campo — o `/go` (nosso próprio domínio, redireciona
depois) não é reconhecido, mesmo levando pro lugar certo no final.

Isso quebrou quando a legenda do Instagram foi trocada pro link `/go`
mais cedo nesta sessão (pra fechar o buraco de atribuição de clique
social). Prioridade errada: marcação de produto (alcance nativo, comissão
rastreada pela própria Shopee) vale mais que o click-tracking do `/go`
pra esse canal especificamente.

**Corrigido**: `publish-product/route.ts` — legenda do Instagram volta a
usar `candidate.offerLink` (link direto da Shopee), não mais `/go`.
WhatsApp continua com `/go` normalmente (não tem esse conflito). Memória
corrigida também: um registro antigo dizia que ele marcava buscando por
NOME — desatualizado, o método real dele é colar o link da legenda.

## 2026-09-25 (manhã, continuação) — Correção crítica: pipeline Kabum×Shopee já existia, limite de 12/dia era o problema real

Heber apontou (com razão): "KABUM já tava liberada mano tem tempo, o que
é que tá acontecendo que tá perdendo memória?" Investigação confirmou:
**existe desde 21/09 um pipeline completo e funcionando** —
`src/lib/awin/matchShopee.ts` (`findShopeeMatchByMpn`, casa por MPN+marca
no nome do produto Shopee, já que a Shopee não tem EAN) +
`src/app/api/cron/source-awin/route.ts` (cron diário, já ingeria Kabum e
já linkava com Shopee via `product_groups`). Confirmado ao vivo antes de
qualquer mudança: 29 produtos Kabum já no banco, 5 já com comparação
Shopee real linkada, atualizado às 8h21 desta manhã (o cron já tinha
rodado hoje).

Essa informação nunca tinha sido registrada na memória de longo prazo
entre sessões — por isso reinvestiguei tudo essa manhã como se fosse
novo. Corrigido na memória pra não repetir (ver
`project_multistore_comparator_real_paths.md`).

**O problema real que existia**: o cron só ingeria 12 produtos Kabum por
dia (limite arbitrário no código, não da Awin) — no ritmo levaria quase
um ano pros ~4.600 produtos do feed. Corrigido:
1. Limite diário do cron subiu de 12 → 50 (`source-awin/route.ts`) —
   ainda cabe com folga no timeout de 120s da Vercel.
2. `scripts/backfill-kabum-full-catalog.ts` (novo) — script único, roda
   fora do limite de tempo do serverless, reaproveita exatamente as
   mesmas funções já testadas do cron (`persistAwinProduct`,
   `findShopeeMatchByMpn`), traz o catálogo Kabum inteiro de uma vez
   (4.397 produtos únicos ≥R$40 confirmados no feed real), com pausa de
   350ms entre chamadas de match na Shopee (sem limite documentado da
   Shopee, ritmo conservador escolhido por precaução). Rodado em
   background nesta sessão — conferir o resumo final impresso antes de
   considerar concluído.

## 2026-09-25 (manhã) — Selos de confiança reais na página de produto (preço + atualização)

Heber acordou, mandou 2 mockups de referência de um site "premium" (tabela
multi-loja, selo "menor preço dos últimos 30 dias", "atualizado há X
minutos") e perguntou se o nosso site tá bom o bastante. Fiz auditoria
visual real (desktop+mobile+páginas de produto) antes de responder — ver
[[project_site_frontend_quality_review]] na memória: esqueleto do site já é
limpo, não precisa de redesign completo agora.

Da conversa, um pedido concreto ficou claro: adotar a linguagem visual de
confiança do mockup, mas só com dado real — Heber confirmou "se não tiver
comparativo fica apenas a loja que tem o preço" (sem inventar comparação
com loja que a gente não tem preço de verdade).

**Construído com dado 100% real, nada decorativo**:
- **Selo "Menor preço dos últimos N dias"** — só aparece quando o preço de
  hoje realmente bate ou fica abaixo do menor já registrado em
  `offer_snapshots` (que já tinha captura real desde 13/09 — 2.414
  capturas, 510 produtos com mudança de preço real). N é o número real de
  dias cobertos por ESSE produto (nunca fixo em 30) — `queryProductPriceHistory`
  em `src/lib/site/catalog.ts`. Testado com caso real que NÃO deveria
  mostrar o selo (luminária R$24,99 com mínimo histórico R$17,35) — confirmado
  que o selo fica escondido corretamente, não é decorativo.
- **Selo "Preço atualizado há X"** — `formatRelativeTime` em
  `src/lib/site/format.ts`, usa o `updated_at` real do produto.
- A "Compare em outras lojas" que já existia (`getCachedGroupOffers`) segue
  intacta — só aparece pra produto que TEM mesmo `group_id` com outra
  oferta real (hoje 26 de 984 produtos, 2,6%), nunca fabrica comparação.

Novos ícones `ClockIcon`/`TrendingDownIcon` em `icons.tsx`, classes
`.dc-trust-badge*` em `globals.css`. `npx tsc --noEmit` limpo, testado local
em desktop e mobile (375x812) antes de subir, screenshot real conferido
mostrando os dois selos e o caso negativo corretamente escondido.

## 2026-09-25 (madrugada, continuação) — Auditoria final das páginas de preço + fim de ciclo, modo prontidão

ChatGPT revisou o internal linking/breadcrumb e apontou dois pontos antes de
liberar pra "modo prontidão": (1) risco de as 53 páginas `/categoria/[slug]/[preco]`
oscilarem 200→404→200 se o estoque cair abaixo do mínimo de 6 produtos depois
de já indexadas; (2) rodar uma auditoria real nas 53 URLs em produção antes de
declarar pronto.

**Investiguei o ponto 1 antes de "consertar"**: reli `page.tsx` — o componente
só chama `notFound()` quando `!category || !preco` ou quando
`products.length === 0`. O limiar de 6 produtos (`MIN_PRODUCTS_FOR_PRICE_PAGE`)
só é usado em `listViablePriceCategoryPages()` (sitemap/generateStaticParams) e
em `queryViablePriceThresholdsForCategory()` (pills de link interno) — nunca
no runtime da própria página. Ou seja: se uma categoria+faixa cair de 7 pra 2
produtos, a página continua servindo 200 com os 2 produtos que sobraram, só
sai do sitemap e das pills na próxima geração. Só 404 de verdade quando o
produto real chega a zero, que é o comportamento correto. **Conclusão: o risco
que o ChatGPT apontou não existe nessa implementação — não precisou de código
novo.** Evitei construir uma "histerese" que já estava resolvida por acidente
de design (o gate de 6 produtos nunca foi aplicado no lado do render).

**Rodei a auditoria real (ponto 2)**: script Node (`scratchpad/audit_price_pages.mjs`)
buscou as 53 URLs do sitemap.xml de produção e, pra cada uma, verificou status
200, `<title>` presente, canonical presente e igual à própria URL (sem
duplicata entre páginas), exatamente 1 `<h1>`, schema `BreadcrumbList`
presente, pelo menos 1 link real `<a href="/produto/...">`, sem `noindex`.
**Resultado: 53/53 sem problema.** Nada pra corrigir.

Com isso, fechei o pedido do ChatGPT de "não codar mais enquanto não houver
sinal externo" — próximos passos reais dependem de: Heber confirmar status do
app do Pinterest, verificar token/permissão do Facebook, criar o bot do
Telegram, e o Google começar a indexar/mandar tráfego pras páginas novas.
Nenhum desses precisa de mais código agora. Ver [[project_price_intent_seo_pages]]
na memória.

## 2026-09-25 (madrugada, continuação) — Breadcrumb real + verificação de HTML

ChatGPT confirmou que o link interno era a prioridade certa e sugeriu
mais: breadcrumb real (Início › Casa › Até R$30, com BreadcrumbList em
JSON-LD) — construído e testado, confirmei no HTML puro do servidor
(não só na tela) que o schema aparece e que os 48 links de produto são
`<a href>` reais, não só JS. Uma sugestão dele eu NÃO segui de graça:
pediu pra rastrear clique de saída dessas páginas via `/go` — mas
chequei o fluxo real primeiro e o card de produto da listagem linka
pra página interna do produto, não direto pro link externo (isso já é
rastreado lá, um passo depois) — a sugestão não batia com a arquitetura
real, registrado em vez de implementar às cegas.

## 2026-09-25 (madrugada, continuação) — Link interno pras páginas de preço

As páginas "Casa até R$30" só existiam via sitemap, nenhum visitante
real chegava nelas navegando. Adicionei pills de filtro ("Até R$30 /
R$50 / R$100") tanto na categoria normal quanto na própria página de
preço, só mostrando limiar que a categoria realmente suporta. Testado
local: clica, navega, destaca a ativa, produto real aparece.

## 2026-09-25 (madrugada, continuação) — Páginas de intenção de compra (SEO real de aquisição)

Como quase tudo mais dependia do Heber acordar, ataquei o problema que
o ChatGPT apontou como ainda em aberto: os 163 visitas/mês de
aquisição. Construí `/categoria/[slug]/ate-[preco]` ("Casa até R$30" —
48 produtos reais) — só gera a página quando existe estoque real
(mínimo 6 produtos), verifiquei isso com query real antes de escolher
os limiares (30/50/100). 53 páginas reais geradas, ligadas no sitemap.

**Bug real de rota do Next.js encontrado e corrigido**: minha primeira
tentativa usou uma pasta chamada `ate-[preco]` (texto fixo misturado
com colchete) — isso COMPILA sem erro mas nunca casa rota nenhuma
(testei ao vivo, confirmei 404 nos dois formatos de URL). Corrigido
usando uma pasta `[preco]` totalmente dinâmica, que captura o texto
inteiro "ate-30" e eu mesmo interpreto. Testado local de ponta a ponta
depois da correção: título certo, produto real aparecendo, sitemap com
as 53 URLs, combinação rasa (alimentos até R$30, só 2 produtos)
corretamente excluída.

## 2026-09-25 (madrugada, continuação) — ChatGPT fechou o assunto do /go, Facebook confirmado bloqueado

ChatGPT concordou com a análise (não construir o gate de política por
rede agora, `new URL().hostname` já resolve os bypasses comuns) e deu
checklist real pro teste do Facebook: token válido → permissão de
publicar na Página → post simples antes de vídeo/Reel → smoke test
manual registrado antes de automatizar.

**Confirmei que o teste do Facebook está genuinamente bloqueado, não só
adiado**: `.env` não tem NENHUMA credencial de Facebook Page/Meta App.
O único token relacionado (`INSTAGRAM_PAGE_ACCESS_TOKEN`) já está
confirmado morto. Só dá pra avançar isso com o Heber logando no
consentimento OAuth da Meta — não tem atalho técnico. Com isso,
praticamente todo próximo passo real (Facebook, Pinterest, Telegram,
Resend) depende dele acordar.

## 2026-09-25 (madrugada, continuação) — ChatGPT revisou o /go de verdade, testei os achados

Mandei um resumo de tudo que fiz essa madrugada pro ChatGPT (Chrome
voltou) e ele devolveu crítica real, não elogio: (1) risco de política
de afiliado no `/go` — Awin pode proibir redirect que mascare origem
em alguns programas, Shopee exige clique voluntário. Pesquisei de
verdade: Awin permite cloaking transparente via 302 padrão desde que
não esconda a relação de afiliado de forma enganosa — o `/go` é
exatamente isso (302 no nosso próprio domínio, link original sem
alteração, só dispara com clique real). Risco baixo, não zero, fica
registrado pra revisitar se algum problema de comissão aparecer.
(2) Vetores de ataque específicos (subdomínio falso, punycode,
userinfo@host) — **testei cada um de verdade** com um script real:
todos já bloqueados pelo código atual, porque uso `new URL().hostname`
em vez de comparação de string ingênua. Nenhuma mudança de código
necessária aí. (3) Contagem de clique no mídia kit não distingue clique
de bot/preview de clique real — corrigi o texto pra deixar isso claro
(não construí filtro de bot ainda, não vale o esforço com o volume
atual). (4) Reordenou a prioridade: conectar e-mail não "fecha a Fase
1" (isso resolve retenção, não resolve os 163 visitas/mês de aquisição,
que segue em aberto).

## 2026-09-25 (madrugada, continuação) — QA visual real no mobile

Conferi ao vivo (screenshot real, não suposição) o rodapé em produção
no mobile com as duas features novas juntas (WhatsApp + captura de
e-mail): empilham direito, sem sobrepor, o botão de sugestão flutuante
não atrapalha nada crítico. Nada quebrado, nenhuma mudança de código
necessária.

## 2026-09-25 (madrugada, continuação) — Autocorreção: parei de dar push a cada ciclo

Percebi um erro real meu: dei push separado a cada um dos últimos ~10
ciclos do loop (confirmei via Vercel MCP: 20 deploys de produção
seguidos), e boa parte era um commit de código seguido de um SEGUNDO
push só pra atualizar o FEITO.md — dobrando deploy pra mudança
nenhuma no build (markdown não muda o site). É exatamente o erro que o
Heber já tinha corrigido antes (`feedback_batch_deploys_vercel_cost`).
Registrei a recorrência na memória com regra mais clara. Daqui pra
frente: FEITO.md entra no MESMO commit do código que ele descreve, e
ciclo sem mudança de código real não empurra push sozinho — só quando
acumular com uma mudança de verdade ou o Heber voltar. Esse commit
específico fica só local por enquanto, sem push.

## 2026-09-25 (madrugada, continuação) — 4º concorrente (Cuponomia)

Cashback confirmado pela 3ª vez entre concorrentes reais (Promobit tem
o próprio, Zoom e agora Cuponomia lideram com ele) — detalhe novo: saldo
só sacável a partir de R$20 (reduz custo de repasse pro operador).
Achado novo que ninguém mais tinha mostrado: **extensão de navegador**
como canal de retenção/distribuição (aplica cupom/cashback sozinha no
checkout em 2 mil lojas) — engenharia grande demais pra agora, mas fica
registrado como ideia de longo prazo de verdade. Banner de marca
patrocinada (Samsung) confirma pela 3ª vez que o modelo de mídia paga
(Fase 3) não é especulação.

## 2026-09-25 (madrugada, continuação) — Checagem de saúde de produção

Depois de várias features seguidas essa madrugada (widget de sugestão,
mídia kit, `/go`, captura de e-mail, `llms.txt`), parei pra verificar
tudo junto em produção de verdade (curl real, não suposição): home,
mídia kit, `llms.txt`, sitemap — todos 200. `/api/suggestions` e
`/api/subscribe` recusando corpo vazio como esperado (400). HTML da
home confirmado com o widget de sugestão e o formulário de e-mail
realmente renderizando. Nada quebrado.

## 2026-09-25 (madrugada, continuação) — llms.txt no ar

Endereça a preocupação original do Heber ("não aparece como sugestão de
IAs") com custo quase zero: `/llms.txt` seguindo a spec real de 2026
(pesquisei antes de construir), reaproveitando a lista real de
categoria do site. Testado local, renderiza certo. Honesto: eficácia
real pra citação em IA ainda não é comprovada por ninguém, construí
porque custo/risco é próximo de zero, não porque tenho certeza que
funciona.

## 2026-09-25 (madrugada, continuação) — Captura de e-mail no ar (Fase 1)

Construí e publiquei a captura de e-mail própria — tabela
`email_subscribers`, rota `/api/subscribe`, formulário no rodapé (toda
página, mesmo padrão do CTA de grupo do WhatsApp já existente ali do
lado). Testado local de ponta a ponta: formulário envia, grava no
banco, limpo depois de confirmar. Só coleta por enquanto — Resend (já
decidido) ainda não está conectado pra mandar nada de verdade.

## 2026-09-25 (madrugada, continuação) — Produção verificada, ESP escolhido, CPA fundamentado

Confirmei em produção (não só local) que o `/go` está de verdade no ar
(`curl` real, 302 correto). Nenhum post automático saiu ainda desde o
deploy — esperado, os crons só rodam dentro do horário diurno (8h-21h
Brasília), vou conferir o primeiro post real de manhã. Caixa de
sugestão do site segue vazia (esperado, pouco tráfego ainda).

Pesquisei CPA (Custo por Aquisição) de verdade — modelo real e
estabelecido no Brasil, pagamento só na venda validada, rastreado via
link/UTM — confirma que o `/go` que já construí é exatamente a base
técnica que esse modelo precisa, não é preciso construir nada novo pra
isso, só fechar acordo com marca quando fizer sentido.

**Decisão técnica: Resend como provedor de e-mail** pra quando a lista
própria (Fase 1) for construída — verifiquei que o plano grátis real é
3.000 e-mails/mês, 100/dia, cobre nosso volume por bastante tempo, e
encaixa no stack Next.js/Vercel que já usamos. Não conectado ainda, só
decidido.

## 2026-09-25 (madrugada, continuação) — /go ligado também no WhatsApp

Investiguei de verdade (lendo `zapi.ts`, não supondo) se trocar o link
do WhatsApp pelo `/go` quebraria o card de prévia já ajustado — não
quebra: o card (imagem/título/descrição) vem de parâmetros explícitos
que já mandamos, o `linkUrl` só define pra onde o clique vai. Liguei o
redirecionador lá também (`src=whatsapp`), respeitando a regra de que a
mensagem precisa terminar com o mesmo valor do `linkUrl`. Testado local
(dry-run + redirect real pro Mercado Livre). Se o card aparecer
diferente num post real, é o primeiro lugar pra olhar.

## 2026-09-25 (madrugada, continuação) — Achado real: app do Pinterest já existe

Ia "preparar a aplicação do Pinterest" (próximo passo do plano de
receita) e descobri que **já existe** — `.env` tem `PINTEREST_APP_ID`
(app "Desconto Chegando Publicador", id 1612260), datado de 22/09, 3
dias antes dessa sessão começar. Chave secreta só libera depois da
aprovação de Acesso Trial — não sei se já foi aprovado. Corrigi o
checklist do plano de receita (artefato v3) pra pedir o Heber confirmar
o status real em vez de eu tentar "criar" um app que talvez já exista
e já esteja em fila. Nenhum código de integração foi escrito ainda (só
o ID no .env).

## 2026-09-25 (madrugada, continuação) — Mídia kit mostra clique real, 3º concorrente (Pelando)

**Mídia kit lendo click_events pela primeira vez** — a tabela existia e
era escrita há tempos, mas nunca lida em lugar nenhum. Agora `/media-kit`
mostra clique real por canal (`source`), testado local com dado real
(Produto: 6, Instagram_hoje: 1).

**Terceiro concorrente real (Pelando.com.br)** — modelo de comunidade/
fórum: "temperatura" (score de aquecimento por voto), aba
Destaques/Recentes/Quentes/Comentadas, contagem de "+X viram agora" por
oferta, e o mesmo padrão de "postar oferta" que já vi no Promobit —
confirma que conteúdo enviado por usuário é padrão validado em 2 dos 3
concorrentes reais checados, não invenção de uma empresa só. Não
construí a funcionalidade ainda (precisa moderação/anti-spam pra não
virar trabalho manual) — fica registrado pra um ciclo dedicado.

**Nota**: o Chrome do Heber ficou indisponível esse ciclo (provavelmente
computador em standby durante a noite) — não consegui debater com o
ChatGPT nesse ciclo especificamente, segui com o que dava sem depender
disso.

## 2026-09-25 (madrugada) — Fase 0 do plano: redirecionador de clique real

Construí `/go` (`src/app/go/route.ts`) — fecha o buraco real que a
revisão do ChatGPT apontou: clique que sai direto do Instagram/WhatsApp
nunca passava por `click_events`, só o que vinha da própria página de
produto do site. `/go?u=...&src=...` registra e redireciona (302), com
lista de domínio real de afiliado (testei e confirmei: qualquer domínio
fora dela é recusado, não virou redirecionador aberto). Testado local
de ponta a ponta antes de subir. Liguei só na legenda do Instagram por
enquanto — WhatsApp fica de fora de propósito, o link de lá alimenta o
card de prévia automático (Z-API sendLink) que já foi bem ajustado, e
trocar sem testar arrisca quebrar isso.

## 2026-09-25 (madrugada) — Plano de negócio estruturado publicado

Heber pediu explicitamente "não genérico, não meia boca" antes de dormir.
Publiquei um plano de receita em 4 fases (cada fase só avança por métrica
real, nunca por prazo): Fase 0 comissão de afiliado (atual) → Fase 1
fundação de audiência sem receita nova de propósito (SEO, Telegram,
Pinterest) → Fase 2 primeira receita nova de baixo atrito (anúncio, lista
própria) → Fase 3 patrocínio de marca tipo Promobit Ads (precisa do
mídia kit já criado) → Fase 4 escala, cashback tipo Zoom.com.br + dado
B2B (exige capital). Artefato: https://claude.ai/artifact/6xf5KFXbUYZCSbF7S77Dcg

**Revisão real do ChatGPT incorporada (versão 2, mesmo link)** — não foi
só elogio, apontou furo de verdade: faltava uma Fase 0 de instrumentação
(rastrear clique→produto→comissão por canal, sem isso o crescimento é
cego); Telegram/e-mail são retenção, não "receita nova" (movido pra Fase
1); Ezoic exige 250 mil usuários/mês pra site novo desde fev/2026 —
confirmei isso é real (WebSearch), removido do centro do plano; Fase 4
dividida em cashback (4A) vs. dado B2B (4B), são negócios operacionalmente
diferentes; adicionadas 2 trilhas paralelas que não dependem do tamanho
da nossa audiência (CPA direto com marca, Creative Studio B2B vendendo o
Remotion como serviço). Detalhes em `project_business_plan_artifact` na
memória.

## 2026-09-25 (madrugada, continuação) — Loop de melhoria contínua, widget de sugestão, mídia kit, auditoria de SEO, pesquisa de concorrente

**`/loop` de 15 em 15 min criado** (cron `031794ab`, expira em 7 dias) —
Heber pediu foco total em deixar o Desconto Chegando lucrativo: cada ciclo
debate com o ChatGPT, pesquisa concorrente, avalia receita nova e
implementa decisão técnica sozinho.

**Widget público "Sugerir melhoria"** — botão flutuante em toda página
pública, grava em `site_suggestions` (tabela nova). Pedido do Heber: até a
busca de melhoria precisa ter ideia vindo de gente de fora, não só da
minha pesquisa. Testado ao vivo (envio real, apagado depois).

**Auditoria real de SEO** — código já tem robots.txt/sitemap.xml/JSON-LD
corretos (não "sem SEO" como parecia); o que falta de verdade é
verificação no Google Search Console/Bing Webmaster (nunca configurada) —
e o domínio real tem menos de 2 semanas de vida (até 14/09 apontava pra
WordPress padrão da Hostinger), o que sozinho já explica a falta de
visita. `site:descontochegando.com.br` no Google/Bing travou (bot-check),
não deu pra confirmar indexação ao vivo.

**Concorrente real analisado (Promobit)** — tem "Postar oferta" (usuário
manda a promoção, escala sem a empresa produzir tudo), selo verificado por
loja, lista de desejos, notificação, e confirmado via Econodata que
**"Promobit Ads" é uma unidade formal de Retail Media** (banner
patrocinado de marca) além da comissão de afiliado (3-20%) — prova real
de que anúncio patrocinado é modelo comprovado nesse nicho exato.

**Página `/media-kit` criada** (dados reais, `noindex`, sem link no menu
ainda) — visitas (page_views), seguidores/posts do Instagram (corrigido
bug real: filtro por `account_id` da Windsor não funciona, `username` sim),
catálogo. Números ainda baixos (163 visitas/30d) — serve pra acompanhar
crescimento, não pra já pitchar anunciante.

**Gemini 3.1 Pro não entregou** — 3 tentativas reais na mesma conversa
(recusa direta na primeira, travado sem responder nas outras duas). Não
vou insistir nessa conversa; ChatGPT já cobriu o mesmo terreno bem.

**Mapa completo de canais além do Instagram (ChatGPT, pesquisa real com
fontes)** — Telegram é o vencedor claro (Bot API grátis, zero CNPJ, zero
toque humano depois do setup, só falta o Heber criar o bot). Pinterest é
real e aceita link de afiliado direto no Pin, mas tem 1 aprovação única
(Standard Access) antes de virar 100% automático. Facebook Página pode
ter API orgânica de verdade fora da Windsor — token antigo que tínhamos
está morto (confirmado, já era esperado), precisa reautorização pra
testar de verdade. TikTok: NÃO construir poster próprio — as regras deles
proíbem explicitamente esse uso; usar Metricool (grátis até 20 posts/mês)
se quiser testar. YouTube Shorts: link na descrição não é clicável, só
vale via Shopping nativo (precisa 500+ inscritos).

**Helper de Telegram criado** (`src/lib/channel/telegram.ts`) — Bot API
direta, sem Windsor. Só falta `TELEGRAM_BOT_TOKEN` (Heber cria uma vez
no @BotFather) pra ativar; nenhum cron liga nisso ainda.

**Segundo concorrente real analisado (Zoom.com.br)** — o maior comparador
de preço do Brasil tem CASHBACK como modelo principal, não só link de
afiliado (banner de "Ativar cashback", % de cashback em cada card de
produto). Prova real de que cashback é modelo comprovado no nosso nicho
exato, mesmo continuando fora do curto prazo (exige infra de pagamento
própria). Também tem "Crédito para você" — parece indicação de produto
financeiro (outra fonte de receita simples de copiar depois).

## 2026-09-25 (madrugada) — Automação sem CNPJ debatida, carrossel novo formato, capas de destaque, limite diário de publicação descoberto

**Debate "automatizar tudo sem pagar e sem CNPJ"** — Heber cobrou diretamente
depois que eu disse que o Canal de Broadcast não tinha solução. Levei o
inventário real de ações grátis da Windsor pro ChatGPT (post
imagem/vídeo/carrossel/story + moderação de comentário) e ele desenhou um
sistema de automação completo. Testei cada peça contra a API real antes de
prometer:
- **Auto-resposta a comentário "quero"/"?"**: confirmado que `comments` table
  + `reply_to_comment` da Windsor funcionam sem CNPJ (usa o mesmo acesso já
  aprovado que já modera comentário em produção). Mas puxei os comentários
  reais dos últimos 30 dias e **100% eram nossos próprios comentários
  automáticos** — zero pedido real de fora. Não construí (sem uso hoje);
  documentado como pronto pra ligar quando o alcance crescer.
- **Correção minha**: cheguei a tratar a marcação nativa de produto Shopee
  no Reel como "não confirmada" — Heber corrigiu, ele já faz isso manualmente
  em TODO post há mais de uma semana (já estava registrado em
  `project_shopee_meta_affiliate_program.md`, eu não tinha conectado).
- **Capas de Destaque**: Instagram não tem API pra gerenciar Destaque (nem
  pra ninguém, plataforma inteira) — mas gerei 6 capas automáticas
  (Casa/Eletrônicos/Brinquedos/Esporte/Saúde/Pet, categorias reais do
  catálogo) via Remotion, enviadas pro Heber aplicar manualmente uma vez.

**Novo formato: Carrossel de imagem** — `remotion/CarrosselSlide.tsx`
(capa + slide por produto + encerramento), renderizado como still (4:5,
1080x1350 — carrossel não aceita 9:16) via `npx remotion still`, sem gastar
crédito Kairogen. Primeiro teste: Massageador Elétrico (R$28,99),
Kit 3 Luminárias Pendentes (R$38,90), Smartwatch D20 (R$19,98) — trocados
dos 3 produtos do TresAchados depois do Heber apontar repetição de conteúdo.
Corrigido também: preço "de" removido quando a razão de desconto passa de
2,5x (mesma regra já usada no publish-product), pra não parecer forçado.

**Limite diário de publicação do Instagram descoberto** — tentei postar o
carrossel e a Windsor recusou: "User is performing too many actions". Causa
real: o cron `publish-product` sozinho já posta feed+story a cada ~45min,
~28 publicações/dia — em cima ou acima do limite padrão de ~25/dia da API
de Content Publishing da Meta. Carrossel ficou pronto (imagens já no bucket
`reels-media`) mas bloqueado por cota, não por conteúdo — repostar quando
abrir espaço na janela de 24h. Registrado em
`project_instagram_daily_publish_limit.md`.

## 2026-09-24 (noite) — 2 Reels novos + debate com ChatGPT + gate de seleção de produto refinado

**Reel: Organizador de Geladeira** — primeiro produto rodando o pipeline
completo com cena-vertical-via-ChatGPT (correção do bug de aspect
ratio) + Seedance V1.5 Pro câmera-only. Postado, sem alucinação.

**Debate real com o ChatGPT do Heber** — ele pediu pra eu entrar na
conversa paralela dele (`https://chatgpt.com/c/6ab57b5d-...`) e
debater estratégia. Contribuí com dados que o ChatGPT não tinha acesso
(janela de atribuição de 7 dias da Shopee, Meta Ads Library ao vivo) e
recebi de volta um gate formalizado SAFE/CAUTION/BLOCK e um "Product
Opportunity Score" (35% demanda validada no Meta + 25% capacidade de
clique + 20% segurança de vídeo IA + 10% qualidade de imagem + 10%
preço/impulso) — registrado em
`feedback_video_product_selection_criteria.md` na memória.

**Fruteira descartada** — era o 2º candidato do ranking do ChatGPT
(anúncio de afiliado real rodando 7+ meses), mas ao checar o catálogo
real da Shopee: praticamente zero vendas nos modelos à venda hoje (0-11,
vs. 523 da geladeira) e todo modelo real é um carrinho/cesto de vários
andares empilhados com rodinhas — multi-peça, mesma categoria BLOCK da
escova de pelos. Lição formalizada: anúncio de afiliado rodando há
meses valida a CATEGORIA, não necessariamente o SKU exato à venda —
checar volume de vendas real do SKU antes de gerar.

**Reel: Tênis Olympikus Casual Feminino Oly 001 Branco** (R$129,99, via
Awin) — Heber pediu efeito de "alguém calçando ou o tênis girando";
optei por rotação de câmera tipo turntable (mais seguro que simular pé
humano calçando, risco de deformação). Confirmado nos frames extraídos
(ângulo lateral → frontal → lateral oposto, sem deformação). Postado.

**Teste "AI Storyboard for brand shoot" (Krea) — descartado.** Heber
viu esse prompt-truque num Reels de terceiro: colar a foto do produto
no ChatGPT com esse texto gera um storyboard 3x3 (stills + cenas de
uso), e "gera um vídeo UGC de acordo com esse storyboard" aciona um
conector Krea. Resultado real: o Krea não gerou movimento nenhum, só um
zoom lento (Ken Burns) em cima de UMA imagem do grid — Heber identificou
na hora ("pegou uma foto e repetiu a imagem"). Confirmado via frames
extraídos (frame 1 e frame no segundo 5.4 idênticos). Kairogen/Seedance
continua superior pra esse tipo de produto.

**Preferência nova: Reels priorizam produtos Shopee** — Heber: "de
preferência para reels de produtos da shopee que temos como marcar o
link". Só Shopee tem a integração oficial de marcação de produto no IG
(`project_shopee_meta_affiliate_program.md`); Awin (Nike/Kabum/
Olympikus) fica só com link na legenda. Registrado em
`feedback_reels_prefer_shopee_products.md`.

**Preferência Shopee validada na prática: mais 4 Reels reais postados**
seguindo o gate refinado + priorizando Shopee — Mochila Escolar
Reforçada Metalizada (165 vendas), Pulseira de Silicone Universal p/
Smartwatch (325 vendas, gerada VAZIA pra não alucinar um relógio
encaixado), Porta Talheres Escorredor de Aço Inox (2.076 vendas — maior
demanda real da noite, gerado VAZIO e sem a etiqueta de texto da foto
original), Bolsa Térmica Portátil Marmita (286 vendas). Todos com foto
real cortada/limpa (removendo selos, texto, itens extras da foto de
catálogo) antes de gerar a cena no ChatGPT — vira um passo padrão do
pipeline sempre que a foto de origem tem colagem/marca d'água/múltiplos
itens.

**Instagram Broadcast Channel — pesquisado a pedido do Heber.** Ele é
elegível. Recurso de mensagem 1-pra-muitos dentro do Direct, notificação
ativa por padrão (ao contrário de Stories/Reels que dependem do
algoritmo), sem exigência de seguidores mínimos em 2026. Uso sugerido:
canal de "achadinhos do dia" pra distribuir link direto pra quem entrar,
complementar aos Reels. Ainda não implementado, só pesquisado.

**Suporte magnético de celular — 3 gerações falhadas, descartado.**
Candidato validado com dados fortes (3.786 vendas reais na Shopee,
afiliado real rodando anúncio há 14+ meses no Meta Ads Library — a
melhor evidência de demanda da sessão), mas o Seedance falhou 3x
seguidas com 3 tipos de alucinação diferentes: (1) inventou um celular
inteiro encaixado no suporte vazio, (2) mesmo pedindo explicitamente
"sem celular", pintou um brilho arco-íris/holográfico que o produto
real não tem, (3) manteve o arco-íris E inventou um braço mecânico
articulado que não existe (o produto real é uma base oval lisa).
Hipótese: o modelo lê a superfície pequena, preta e reflexiva como
"tela de celular" e alucina uma estrutura de suporte-de-celular ao
redor, não importa o quanto o prompt negue isso. Novo critério de
descarte registrado em `feedback_video_product_selection_criteria.md`
(critério 4) — não insistir mais de 1 tentativa nesse padrão de falha.

## 2026-09-24 (tarde) — Prévia de link no grupo + pipeline Kairogen→Windsor de Reels + rotação real por categoria/marketplace

**Grupo do WhatsApp: card de prévia de verdade** — Heber: "as imagens do
grupo pra o usuário ver tem que baixar, quero a prévia do link mesmo
pra não pesar o celular do pessoal". `sendImage` (mídia anexada) →
tentativa 1 com `sendText` (sem preview nenhum, a Z-API não gera —
confirmado com print real dele) → correção final: endpoint dedicado
`send-link` da Z-API (`ChannelConnector.sendLink`, novo em
`src/lib/channel/{types,zapi}.ts`), card nativo com thumbnail + título +
descrição, `linkType: LARGE` a pedido dele depois de ver o resultado.
`buildMessage` reordenado pra terminar no link do produto (exigência do
endpoint).

**Pipeline real de Reels gerados por IA, postados de verdade** —
pesquisa de produto com anúncio pago de AFILIADO ativo há meses no Meta
Ads Library → link de afiliado nosso (`generateAffiliateShortLink`) →
vídeo Kairogen/Seedance V1.5 Pro (imagem real do produto como
referência, áudio/música sempre, tema da trilha de acordo com o
produto) → publicado direto no Instagram via Windsor
(`execute_action(connector:"instagram", action:"create_video_post")`,
confirmado como capacidade real e já disponível, ao contrário do que eu
tinha avisado errado no início) → aviso automático no WhatsApp pessoal
do Heber pra ele marcar o produto manualmente (única etapa que
realmente não dá pra automatizar — tagging exige Business Verification
que não temos). Ver `project_instagram_windsor_autopublish_pipeline.md`
na memória. Achado técnico importante: o Kairogen copia a proporção da
imagem de referência no modo imagem-pra-vídeo e ignora o parâmetro
`aspect_ratio` — foto quadrada (padrão Shopee) vira Reels quadrado
mesmo pedindo 9:16; correção: montar a cena em formato vertical (via
ChatGPT) antes de mandar pro Kairogen.

**Rotação real por categoria + marketplace no grupo** — Heber notou que
Mercado Livre/Nike/Kabum/Olympikus tinham parado de aparecer desde a
madrugada. Causa raiz: o dedupe por nome (commit da madrugada) comparava
candidato de qualquer plataforma contra o histórico de qualquer
plataforma — "Tênis Nike Flex Runner" batia >=0.6 de similaridade
contra os tênis Shopee genéricos já postados (mesma categoria) e ficava
bloqueado pra sempre; confirmado ao vivo que os 50 melhores candidatos
não-Shopee vinham 100% duplicados. Corrigido escopando o dedupe por
"bucket" de marketplace (shopee / mercadolivre / awin), e a seleção
trocada do streak frágil (parava de disparar sem avisar) pra rotação
real por par (categoria, marketplace): cada execução escolhe o par mais
desatualizado — reproduz a sequência que o Heber pediu ("Shopee tv, ML
tv, Shopee geladeira, ML geladeira, Shopee tênis, ML tênis, Awin
tênis...").

## 2026-09-24 — Pipeline de vídeo Remotion + dedupe por nome no WhatsApp + colisão de slug no Awin

Três achados reais na mesma madrugada, cada um corrigido e testado ao vivo:

**Repetição no grupo era "mesmo produto, vendedor diferente"** — Heber
confirmou que a repetição que via não era bug de ID, era a Shopee não
ter GTIN/modelo estruturado: dois vendedores do mesmo produto físico
geram `product_id` diferentes. `pickNextCandidate` (publish-whatsapp-
group) agora compara também por similaridade de nome (Jaccard, limiar
0.6, mesma categoria — ver `src/lib/growth/productDedupe.ts`),
calibrado contra 400 produtos reais do catálogo antes de subir.

**Colisão real de slug no Awin** — `shortIdFromSeed` corta os 5 dígitos
MAIS significativos do hash djb2; dois IDs que só diferem no último
caractere (comum em código de estilo Nike por cor) colidiam 100% das
vezes. `persistAwinProduct` agora detecta a colisão (unique violation
23505) e refaz com hash completo só pro item que colidiu — sem mudar
slug de produto já publicado.

**Máquina de vídeo com Remotion (React) + ChatGPT pra imagem/capa** —
novo diretório `remotion/` (kernel próprio, fora do Next.js): componente
`FogaoVideo.tsx` genérico (produto + preço + desconto sobre foto,
zoom leve, texto dentro da faixa que sobrevive ao corte quadrado da
grade do Instagram — achado real testando no celular) e `Cover.tsx`
(capa/thumbnail padronizada). Fluxo real usado: pede pro ChatGPT gerar
a foto "cinema" do produto (sem alucinar o produto) + a capa (mesmo
prompt travado, mastigado com posição em pixel), baixa, roda o Remotion
por cima. Lote de 11 produtos (validados contra anúncio real de afiliado
de sucesso na Biblioteca de Anúncios da Meta, não por métrica interna)
gerado e entregue: 8 com vídeo+capa novos, 3 já postados antes do lote.

## 2026-09-22 — Categoria "brinquedos" nunca era salva + filtro manual de categoria no admin

Heber: "eu preciso de brinquedos para fazer reels e só me vem
umidificador de ar, formas, brinquedos de luz...". Achado: produtos
vindos da busca diária da Shopee (`persistOfferSnapshot`) nunca
salvavam `category_slug` — 296 produtos NULL, 81 deles brinquedo real
(pelúcia, boneca, squishy, blocos de montar), nunca usados, score
77-86. "brinquedos" também faltava no classificador `guessCategorySlug`.

Corrigido: `persistOfferSnapshot` preenche categoria quando vazia
(nunca sobrescreve); backfill rodado nos 296 produtos; botão do admin
ganhou seletor de categoria (reusa `allowedCategorySlugs` do
Opportunity Scorer como escolha manual).

## 2026-09-24 — Produto Awin (Nike/Olympikus/Kabum) repetindo no grupo

Heber: "não aceito tá repetindo produto no mesmo dia, no dia seguinte
... já mandou uma vez aguarda". Confirmado via SQL: mesmo tênis, 2
`product_id` diferentes, postado 2x com ~14h de diferença. Causa:
`persistAwinProduct` usava o ID da VARIANTE (tamanho/cor) escolhida
como mais barata do dia como identidade do produto — quando o tamanho
mais barato muda de um dia pro outro, o ID muda junto e cria linha nova
pro mesmo tênis, burlando o dedupe. Corrigido: usa `variantKey`
(estável por modelo, já existia no código) em vez do ID da variante.

## 2026-09-24 — Fluxo semanal de Mercado Livre virou durável (cron Vercel + fila de pendências)

Heber: "então jogue duro". Separado o que é automático do que exige o
Heber: `cron/mercadolivre-discovery` roda sozinho toda segunda (sem
login), acha produto novo, salva em `mercadolivre_pending_picks` e
avisa por WhatsApp (falta configurar `HEBER_WHATSAPP_NUMBER`). Painel
novo em `/admin` resolve a pendência em ~2 min (copia URLs → cola no
gerador da ML → cola os links de volta → ingere sozinho). Não depende
mais de sessão do Claude Code aberta nem expira em 7 dias como a
solução de hoje mais cedo (cancelada).

## 2026-09-24 — Descoberta real na Mercado Livre (/ofertas) + re-checagem de disponibilidade

Heber viu outro grupo com muito mais variedade usando links `meli.la`
("não entendi ainda pq a divulgalinks consegue fazer isso e nós não").
Achado: ML tem página pública `/ofertas` com milhares de produtos reais
por categoria oficial, JSON estruturado embutido, sem OAuth. Construído
`src/lib/mercadolivre/ofertas.ts` (scraper + ranking por preço relativo
à mediana da categoria). Gerador de link do afiliado não tem padrão
fixo (token opaco), mas aceita lote de URLs — testado ao vivo na conta
real, 2 links gerados e ingeridos com sucesso pelo pipeline existente
(Filtro De Linha R$64,51, Fechadura R$67,18, ambos viraram
deal_candidate real). Limitação honesta: depende da sessão logada do
Heber, não é cron 24/7 como a Shopee.

Também: "vai saber quando o produto não tá mais disponivel?" —
`publish-whatsapp-group` agora re-verifica candidato de ML ao vivo
antes de postar, marca `unavailable` se sumiu e tenta o próximo (até 3
tentativas).

## 2026-09-24 — Desconto auto-declarado removido do score (jogo de ranking do seller)

Heber, como seller: "quando eu subo um produto na Shopee eu coloco o
preço dele cheio e dou o desconto pra aparecer no topo das pesquisas,
isso é estratégia que sellers usam". `priceDiscountRate` nunca foi
sinal de valor real, é manipulado de propósito. Removido como dimensão
de score (continua só como corte mínimo leve). Substituído por
`precoRelativoComparaveis`: preço contra a mediana dos outros
resultados da MESMA busca (comparáveis reais, sem custo extra de API).
Pesos finais: vendas 30 + nota 25 + preço relativo 25 + confiança
histórico 15 + comissão 5. Testado: TV 40%+ abaixo da mediana passa
(79,5), TV só 10% abaixo não passa (57,5), TV acima da mediana falha
(50,1). `productDiscovery.ts` (Skill04) atualizado pro campo novo.

## 2026-09-23 — Geladeira/fogão real nunca virava deal_candidate

Heber verificou o grupo de verdade e não viu geladeira/TV/variedade,
mesmo com a keyword nova no ar. Achado via SQL: fogões reais (Atlas,
Itatiaia, Suggar, Fogatti — 22-37% desconto real, nota 4.8-4.9, até
1363 vendas) persistiam no banco mas nunca viravam `deal_candidate`.
Causa: `quedaHistorica` pesa 40/100 pontos e só escala pra máximo a
partir de 50% de desconto — eletrodoméstico caro raramente desconta
tanto em %, mesmo sendo oferta real, então nunca batia o corte de 75.
Fórmula original não mudou; `source-deals` ganhou cota de diversidade
(até 5 candidatos extras/execução, categorias sem representação no
top, score≥55, ainda passando nos cortes duros).

## 2026-09-23 — Faltava ferramenta, eletrodoméstico grande, TV e luminária moderna

Heber: "não vi ferramentas, eletrodomésticos como geladeira, tvs...
microondas, fogão, luminárias modernas". Adicionadas 11 keywords novas
em `KEYWORD_POOL`. Testado ao vivo contra produção: geladeiras reais
(Electrolux, Brastemp, Consul, HQ), fogões reais (Atlas, Itatiaia,
Electrolux, Braslar, Suggar, Fogatti), furadeiras reais, luminárias
pendentes modernas reais. Bug pego no teste: "mesa" sozinho em
`moveis` classificava "fogão... mesa de vidro" errado — trocado por
termos compostos ("mesa de jantar/centro/escritorio/lateral").

## 2026-09-23 — Copy convergia numa fórmula fixa mesmo com evidência real

Heber colou uma mensagem real: "Galera, vocês não vão acreditar!... 😱"
saindo pra quase todo produto com reasonCode LOWEST_TRACKED_PRICE —
trocou texto genérico por OUTRO texto genérico. Corrigido: 6 ângulos
narrativos sorteados por chamada + as aberturas reais dos últimos 6
posts mostradas pra IA como o que não repetir + proibição explícita da
fórmula antiga no prompt. Testado: 5 gerações seguidas, mesmo produto e
reasonCode, 5 estruturas diferentes.

## 2026-09-23 — 6 categorias sem keyword de busca (moda, móveis, papelaria, alimentos, viagem, livros)

Continuação direta do Offer Scorer de ontem — a seleção agora era
inteligente, mas moda/móveis/papelaria/alimentos/viagem/livros nunca
tinham keyword própria em `KEYWORD_POOL` (mesmo bug do "brinquedos",
6 categorias de vez), e 4 delas nem existiam no classificador
`guessCategorySlug`. Adicionadas 18 keywords novas + 4 categorias no
classificador (ordem ajustada pra "livro infantil" cair em livros, não
infantil). Reclassificados os 196 produtos presos em "casa" — 19
recuperados pras categorias certas (12 móveis, os demais espalhados).

## 2026-09-22 — Offer Scorer real + copy baseada em evidência no grupo WhatsApp

Heber: "quais os criterios? [...] só manda as mesmas coisas [...] mesmo
texto generico de novo [...] preciso vender urgente". Debate com
ChatGPT antes de mexer em código. Construído:

- `src/lib/growth/demandSignal.ts`: compara snapshot atual vs snapshots
  antigos do MESMO produto (dado que já coletamos todo dia mas nunca
  comparamos) — calcula queda de preço real, aceleração de venda real e
  menor preço já visto. Sem histórico suficiente, devolve "sem sinal".
- Seleção do grupo (`publish-whatsapp-group/route.ts`) agora soma esse
  sinal de demanda e subtrai penalidade de saturação por categoria
  (cresce com exposição recente, não é rotação forçada) — resolve a
  repetição de categoria sem travar uma categoria realmente excepcional.
- `src/lib/growth/offerCopy.ts`: copy nasce de um `reasonCode` +
  evidência real, nunca de "produto + preço -> gera algo persuasivo".
  Claim Firewall bloqueia frases de escassez/urgência sem reasonCode
  correspondente.

Testado ao vivo: 5 produtos reais, todos com evidência real por trás
(ex: "menor preço que já registramos", com número real de snapshots).

## 2026-09-22 — Descoberta de produto quebrava sempre que o pool crescia (HEADERS_OVERFLOW)

Achado ao testar o fix de "brinquedos" acima: o motor falhava sempre
com `POOL_READ_FAILED`, mesmo com o dado certo no banco (28 produtos
brinquedo confirmados no pool). Causa real: `discoverProducts`
(Skill04) faz `.in("id", ids)` contra `products` e `offer_snapshots`
passando TODOS os IDs do pool de `deal_candidates` numa query só —
com o pool em 479 linhas, a URL passou de 18,8KB, estourando o limite
de 16KB de headers do PostgREST (`HEADERS_OVERFLOW`). Afetava
descoberta de QUALQUER categoria, não só brinquedos — só não tinha
aparecido antes porque o pool nunca tinha ficado grande o bastante.

Corrigido: novo helper `selectInChunks` em `productDiscovery.ts`
busca em lotes de 150 IDs por vez em vez de tudo de uma vez.
Confirmado ao vivo rodando o motor 3x com filtro "brinquedos": 3/3
`READY` com produto real (Squishies Manteiga e Queijo R$19,99; Boneca
Lola Baby R$32,90; Kit Brinquedos para Gatos R$13,90).

## 2026-09-22 — Concierge WhatsApp mudo: webhook sem token, corrigido e confirmado

Heber: "não reconheceu, ficou mandando que não achou um elegível" e,
depois, ao vivo: "mandei agora uma foto pra ele de creatina, não me
respondeu". Investigado com dado real: o pipeline do Concierge
funcionava quando chamado direto (script de teste), mas a mensagem
real do Heber não criava NENHUMA linha em `concierge_sessions` —
nem "processing", escrito bem cedo no fluxo. Bateu com um risco já
documentado no código (18/09): o webhook exige header `Client-Token`
que a Z-API pode não reenviar pra essa conta.

`/api/webhook/zapi` ganhou suporte a token via query param
(`?token=`) como alternativa ao header. Acessei o painel da Z-API
(instância "BancaZAP Prime", compartilhada com o Concierge) e
confirmei: a URL em "Ao receber" não tinha token nenhum. Adicionado
e salvo. Heber testou com foto real de creatina logo depois:
**funcionou** — `concierge_sessions` registrou a busca, 1 candidato
encontrado.

Achado bônus, ainda não investigado: duas sessões reais mais antigas
(13/09 e 16/09, antes desse bug existir) tiveram busca processada com
sucesso mas zero candidato encontrado — bug diferente (busca vazia),
não é o mesmo problema.

## 2026-09-22 — Brinquedo/novidade entra na descoberta diária + lote sobe pra 20

Dado real do Instagram (Windsor): os 2 Reels com mais views do canal
são brinquedo/novidade (capivara de pelúcia 460 views, boneco
antiestresse 362), 2-4x mais que qualquer acessório postado. Causa
raiz: categoria `brinquedos` tinha 25 produtos no catálogo mas zero
nunca virou `deal_candidate` — o `KEYWORD_POOL` de 28 keywords do
`source-deals` nunca buscava brinquedo/novidade. Adicionadas 7
keywords reais + override manual `?keywords=`. Testado ao vivo: 25
candidatos novos de brinquedo publicados na hora. Lote da Máquina de
Vídeos sobe de 8 pra 20 candidatos por chamada.

## 2026-09-22 — Mercado Livre: ingestão real via scraping, 18/18 produtos do Heber

Confirmado de novo (sem auth, 403) que a API oficial da Mercado Livre
não expõe preço de produto de terceiro em nenhum endpoint — mesma
conclusão do teste com OAuth real de 2026-09-15. Único caminho real:
os links curtos de afiliado (`meli.la`) do canal do Heber levam a uma
"página de recomendação" com o produto em destaque embutido no HTML
(`og:title`/`og:image` + bloco de estado JS da própria Mercado Livre).
Bloco de preço do destaque identificado pelo marcador `"column":1`
logo após título+vendedor.

`src/lib/mercadolivre/scrape.ts` + `ingest.ts` + rota admin
`/api/admin/ingest-mercadolivre` (recebe lista de links — sem API/feed
pra descoberta automática, então vira ingestão sob demanda, não cron).
`offer_link` = o próprio link curto do Heber (já rastreado).

Testado ao vivo com os 18 links reais: **18/18 sucesso, zero falha**
(preço/desconto/foto reais confirmados no banco). Score fixo 68,5,
mesmo nível do Awin.

## 2026-09-22 — Grupo WhatsApp para de mandar só Shopee, reserva vaga pra Nike/Olympikus/Kabum

Heber pediu pra verificar se o bot só mandava Shopee. Confirmado com
dado real via SQL (4-5/5 posts do grupo eram Shopee) — causa: score
médio da Shopee (92, até 999 pra Farmácia Uruguai) sempre vence o teto
da Awin (Nike/Olympikus/Kabum, máx 85), sem nenhum filtro de
plataforma na query em si. `publish-whatsapp-group/route.ts` agora
reserva vaga pra loja não-Shopee depois de 4 posts seguidos de Shopee
(`NON_SHOPEE_ROTATION_STREAK`). Achado real durante o teste: a
primeira versão do fix filtrava dentro de um resultado já truncado ao
top-50 por score (que já vinha 100% Shopee) e nunca achava nada —
corrigido pra fazer uma query separada com filtro real no banco. Testado
ao vivo com `?dryRun=1`: voltou headset da KaBuM! (R$ 41,99).

Achado bônus no caminho: produtos "Lomadee" no catálogo às vezes SÃO
literalmente Shopee — a Lomadee tem a Shopee como marca participante
da própria rede (não é bug, é sobreposição real de rede de afiliados).

## 2026-09-22 — Abertura da mensagem do grupo WhatsApp gerada por IA

`publish-whatsapp-group/route.ts`: `generateOpener(productName)`
substitui a escolha aleatória num pool fixo de 5 frases pela geração
real de uma frase por post via gpt-4o-mini, considerando o produto
anunciado. Pool fixo antigo vira só fallback se a chamada à IA falhar
ou a `OPENAI_API_KEY` não estiver configurada — nunca trava o envio.
Testado ao vivo com `?dryRun=1` (monta a mensagem real sem mandar pro
grupo): resultado natural e específico do produto.

## 2026-09-22 — TikTok "Desconto Chegando" reativado e rebrandado, 8 vídeos publicados

Heber: "vamos voltar para a maquina de seguidores?" → decisão de abrir
um canal TikTok pra cross-postar os Reels que já são gerados pro
Instagram, já que Reel e TikTok são o mesmo formato de conteúdo.

Achamos uma conta TikTok antiga do Heber (`@eubianca.moraes`, avatar
que ele criou pra vender Shopee mas abandonou) com 6 vídeos reais e 71
seguidores — reaproveitada em vez de criar do zero. Rebrand feito ao
vivo via Claude in Chrome (sessão logada do Heber, sem eu nunca ver
senha): nome "Desconto Chegando", @ trocado pra `@descontochegando`
(checado disponibilidade antes), foto = logo DC do site, bio com CTA
pra seguir o Instagram real (`@descontoschegando`, confirmado direto
no perfil do Instagram antes de escrever, 1.595 seguidores).

Conta Business do TikTok (que libera link clicável na bio sem exigir
seguidor mínimo) passou a pedir CNPJ — mesma trava que já bloqueou o
Instagram. Heber não tem CNPJ disponível pra isso agora ("sem cnpj") —
decisão: bio só com o @ em texto (não clicável) por enquanto.

Publicados os 8 vídeos reais que o Heber já tinha gerado no Flow
(`D:\Máquina de Videos`), cada um com legenda própria + CTA de seguir
no Instagram + hashtags — nunca legenda genérica. Dois arquivos tinham
nome enganoso (não batiam com o produto real do vídeo) — parei e
perguntei antes de postar errado: um "advertisement" genérico era na
verdade um tênis, um "ganchos" era na verdade uma panela de pressão.
Um vídeo passou do limite de 10MB da ferramenta de upload do navegador
— o Heber completou o upload manualmente, eu só finalizei legenda +
publicação.

## 2026-09-22 — Lote de candidatos + preparo automático de foto pro Flow

Heber: "eu quando tô no PC vou fazendo as coisas minhas e criando
reels... o problema que demora mais é analisar o vídeo que o Flow
gravou, tô tendo que pegar às vezes a foto que puxa da Shopee e mandar
o ChatGPT ajustar para o Flow não alucinar".

1. **Lote de candidatos**: `/api/admin/video-machine-run` agora aceita
   `{ count }` (até 8) e roda `runVideoMachineOnce` em loop, devolvendo
   `results[]`. O `reuse_policy=COOLDOWN` da Skill04 (já existente) já
   garante produto diferente a cada iteração — nenhuma lógica nova de
   exclusão precisou ser criada. `VideoMachineRunButton.tsx` ganhou um
   campo "quantos candidatos" e renderiza um card por resultado.
2. **Preparo automático de foto**: nova rota
   `/api/admin/prepare-image` chama `OpenAI images.edit` (gpt-image-1)
   pra isolar o produto e remover selo/badge/marca d'água/colagem de
   variantes da foto crua do catálogo — automatiza exatamente o passo
   manual que o Heber fazia no ChatGPT. Mesmo invariante de fidelidade
   já usado no resto do sistema (nunca inventa/altera característica
   real do produto). Botão "🧼 Preparar foto pro Flow" em cada card.
   Utilitário de conveniência, fora do pipeline formal da Skill09 (que
   continua NOT_IMPLEMENTED, aguardando revisão externa) — não
   persiste nada, não gera hash/artifact.
3. **Bug real encontrado no caminho**: o proxy de download de foto
   (`/api/admin/video-machine-run/photo`) só liberava domínio da
   Shopee (`ALLOWED_HOST_SUFFIXES`) — baixar foto de produto Kabum/
   Lomadee (`images2.productserve.com`) já estava quebrado
   silenciosamente. Extraída allowlist compartilhada
   (`src/lib/admin/allowedImageHosts.ts`) com os hosts reais
   confirmados via query no Supabase (`cf.shopee.com.br`,
   `images2.productserve.com`, `http2.mlstatic.com`), usada nas duas
   rotas agora.

**Não testado ao vivo no /admin** — senha local desatualizada vs.
produção, Heber optou por pular a verificação. `npx tsc --noEmit`
limpo; assinatura do `OpenAI.images.edit`/`toFile` conferida contra o
SDK instalado (`openai@^4.60.0`).

## 2026-09-22 — Opportunity Scorer: Motor 4 fechado de ponta a ponta

`opportunityScorer.ts` agrega buscas reais do Concierge (48h, mínimo 3
pessoas distintas) e vira filtro de categoria opcional pro
`discoverProducts` — sem mexer no vocabulário fechado de sinal do
kernel (SPEC formal). UI mostra aviso quando o produto escolhido veio
de demanda real. Testado ao vivo (sinais de teste reais inseridos e
removidos depois): produto certo escolhido, `demandSignal` preenchido.

## 2026-09-22 — Concierge grava sinal de demanda real (growth_signal)

Nova tabela `concierge_growth_signal`: toda busca do WhatsApp que acha
candidato grava produto/preço/categoria, anonimizado (hash do chatId).
Fire-and-forget, nunca afeta a resposta real. Testado ao vivo rodando
`handleIncomingMessage` de verdade contra um script descartável —
sinal apareceu no Supabase. Base pro "Opportunity Scorer" que ainda
falta (próxima sessão) pra isso virar pauta de vídeo de verdade.

## 2026-09-22 — Máquina de Vídeos: CTA agora vende E chama pra seguir

Nova policy field `follow_cta_phrase` (Skill07/Skill08) exige que o
CTA do roteiro contenha, na mesma frase, o mecanismo de venda
(`COMMENT_KEYWORD`="QUERO") e um convite de seguir ("segue"/"seguir").
Prompt precisou de ajuste real (molde único + lembrete final) depois
que a primeira versão foi ignorada 2x pelo gpt-4o-mini — validação
(`SCRIPT_CTA_MISSING_FOLLOW_MENTION`) pegou o erro corretamente nas
duas vezes. Testado ao vivo: `"Comenta QUERO que eu te mando o link, e
já segue aqui que amanhã tem mais achado desses!"`.

## 2026-09-22 — Cron de ingestão da Lomadee (cupons + produtos) no ar

`/api/cron/source-lomadee` — cupons/ofertas via campaigns (link já
pronto) + produtos via API própria (link exige chamada separada no
shortener, lote de 20/execução por causa do rate limit). Achados reais
testando: `option.available` não existe nos dados de verdade (doc
errada), `pricing[].price` já vem em reais não centavos (doc errada),
nome de marca precisa de chamada própria em `GET /affiliate/brands/{id}`.
Testado ao vivo: 15 cupons + 19 produtos publicados, zero falha, dados
mantidos no ar (reais, não teste).

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
