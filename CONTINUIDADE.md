# Continuidade — Shopee Concierge (Descontos Chegando)

> Este documento existe pra qualquer sessão (Claude ou humana) saber, em 2 minutos,
> o que ainda está pendente. Atualize sempre que resolver ou descobrir algo novo.
> Complementa o [FEITO.md](FEITO.md), que registra o que já está pronto.

**Última atualização:** 2026-09-14

## Pendências ativas

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

- **Mas não está confirmado que resolveu**: depois do fix, o usuário testou
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

### 3. 🚨 Domínio `descontochegando.com.br` — conteúdo perdido/resetado (não é Vercel)
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

**Pendente agora:**
1. ⚠️ **Preciso da `SUPABASE_SERVICE_ROLE_KEY`** (a mesma já configurada na
   Vercel) pra colocar no `.env` local e ver o site renderizando os 3
   produtos reais no navegador — não posso pegar essa chave sozinho (a
   ferramenta MCP do Supabase só expõe chave anon/publishable por design de
   segurança, e está certo que seja assim).
2. Só depois de visualizar/aprovar, apontar o DNS do domínio pra Vercel
   (ver item 3 acima) — não faz sentido trocar DNS antes de o site estar
   pronto o suficiente.
3. Configurar `SITE_BASE_URL` e `REVALIDATION_SECRET` (gerar um valor novo,
   não reaproveitar o de dev) nas env vars de produção da Vercel, senão a
   atualização automática de preço não funciona lá.

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

### 5. ⚠️ Decisão estratégica: sem novas plataformas de afiliado por enquanto
Decisão explícita do usuário (2026-09-14): **não adicionar nenhum outro
programa de afiliados** (Mercado Livre, Amazon, AliExpress etc.) até a
Shopee estar 100% estável. Ou seja: fechar o item 2 (pendência urgente do
perito) + o roteiro de testes, antes de considerar qualquer expansão pra
outras plataformas. Pesquisa comparativa dessas alternativas já foi feita
e está registrada, mas fica pausada por ora.

**Resolvido (2026-09-14):** perguntado ao usuário se o site deveria esperar
o item 2 fechar. Resposta: o bug do bot só pode ser testado/confirmado
depois que ele pagar a Vercel (item 1) — então isso já está bloqueado por
fora, independente de prioridade. Decisão: seguir construindo o site
**localmente** (não depende de pagar Vercel; só o deploy final depende).
Ou seja, os dois trabalhos não competem de verdade: item 2 aguarda
pagamento, site avança em paralelo enquanto isso.

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
