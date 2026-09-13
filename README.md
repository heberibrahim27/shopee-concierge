# Shopee Concierge — piloto

Bot que recebe uma foto de um produto no WhatsApp e responde com as
melhores opções equivalentes na Shopee (link de afiliado já atribuído).

## Arquitetura (por quê está separado assim)

```
src/lib/shopee/      -> núcleo Shopee (busca + geração de link) — não sabe nada de canal
src/lib/concierge/    -> núcleo do concierge (sessão, reconhecimento, ranking, resposta) — não sabe nada de canal
src/lib/channel/      -> conector de canal (hoje: Z-API). É a ÚNICA peça que fala com o WhatsApp.
src/app/api/webhook/zapi/ -> endpoint HTTP que a Z-API chama quando chega mensagem
```

O núcleo (Shopee + concierge) nunca importa nada de `channel/`. Isso é
de propósito: pra trocar de instância Z-API, ou até trocar WhatsApp por
outro canal (Instagram oficial, por exemplo, se um dia fizer sentido),
você só troca o arquivo dentro de `channel/` e as variáveis de ambiente
— nada no núcleo muda.

## O que já está pronto e validado

- Cliente Shopee (assinatura + busca + geração de link): a lógica é a
  mesma testada manualmente em 10/09/2026 com a conta real, que retornou
  produtos e links de verdade.
- Fluxo completo de conversa: gatilho → foto → reconhecimento →
  esclarecimento (se precisar) → busca → ranking → resposta com até 3
  links, cada um com subId próprio pra medir clique por conversa.
- Isolamento do número do BancaZAP: sem a frase-gatilho, o bot ignora a
  mensagem — não interfere no que já roda hoje nesse número.
- Anti-loop e anti-duplicata: ignora mensagens do próprio bot e não
  processa o mesmo evento duas vezes.

## O que falta pra rodar de verdade (nenhuma linha de código, só configuração/decisão)

1. **Credenciais no `.env`** (copie de `.env.example`): Shopee (você já
   tem), Z-API da instância que decidiu usar, e uma chave da OpenAI
   (custo pequeno por foto processada, mas real — confirme se topa antes
   de ligar em produção).
2. **Deploy em algum lugar com URL pública** (Vercel é o caminho mais
   direto, já que o projeto é Next.js) — a Z-API precisa conseguir
   chamar o seu endpoint pela internet.
3. **Configurar essa URL como webhook na instância Z-API.** Confirme
   antes se isso substitui ou complementa o webhook que já existe pro
   BancaZAP — o comentário no topo de
   `src/app/api/webhook/zapi/route.ts` explica esse risco. Se for a
   mesma instância, o ideal é ter um único endpoint recebendo tudo e
   decidindo o que é concierge e o que é BancaZAP (hoje este projeto só
   cobre a parte do concierge).
4. **Testar com 1 número seu antes de qualquer divulgação** — mande
   "QUERO ENCONTRAR" + uma foto pro próprio número e confira a resposta.

## Como trocar de instância Z-API depois (o pedido de "deixar pronto pra mudar")

Só trocar `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` e `ZAPI_CLIENT_TOKEN` no
ambiente de produção e reconfigurar o webhook na nova instância. Nenhum
arquivo de código precisa mudar.

## Testar a busca Shopee sem WhatsApp nem OpenAI

```
cp .env.example .env   # preencha SHOPEE_APP_ID e SHOPEE_SECRET
npm install
npm run test:search -- "fone de ouvido bluetooth"
```

## Próximos passos sugeridos (combinados no debate Claude + ChatGPT)

1. Testar ~20 fotos variadas (ambiente bagunçado, objeto com etiqueta,
   screenshot, foto difícil) — pode ser manualmente rodando
   `recognizeProductImage` + `searchProductsByKeyword` direto, sem
   precisar do WhatsApp ainda.
2. Só depois, ligar o webhook de verdade e testar com o próprio número.
3. Só depois, um piloto fechado com pouquíssimas pessoas reais.
4. ~~A comparação visual entre a foto original e a imagem de cada
   candidato ainda não está implementada~~ — feito em `compare.ts`: a
   foto do usuário + as fotos dos top ~8 candidatos (pré-filtrados por
   texto/nota/venda) vão juntas pro modelo de visão, que classifica
   cada uma com honestidade (inclusive "não relacionado", pra descartar
   opções que só batem a palavra-chave mas não o produto). Isso
   substituiu o match só por texto que gerava sugestões fora de
   contexto (categoria certa, mas estilo/preço bem diferentes).


## Deploy (permanente)

Este repositório está conectado a um projeto Vercel com deploy automático a cada push na branch `main` — não precisa mais copiar variáveis de ambiente a cada atualização de código.

## Growth OS — Etapa 0/1

O sourcing coleta ofertas reais, grava produtos e snapshots no Supabase,
aplica os cortes e o score mínimo de 75 e gera até três links de afiliado.
Não publica em WhatsApp ou Instagram. Os candidatos permanecem em
`discovered`: o desconto informado pela Shopee ainda é um proxy, sem
verificação de queda histórica e com confiança de histórico zerada.

Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no servidor, além
das variáveis de `.env.example`. O projeto de banco é `babamanager-pro`
(`czocwdlygdslyuoixmhh`). A chave service role nunca vai para o navegador.
A migration versionada usa `20260912035120`, o timestamp confirmado no
histórico do Supabase; não é necessário reaplicá-la nesse projeto.

```sh
npm ci
npx tsc --noEmit
npm run test:router
npm run test:deals
npm run build
npm run source:deals
```

O script carrega `.env`. Se as credenciais estiverem em `.env.local`, defina
`DOTENV_CONFIG_PATH=.env.local` antes de executá-lo (PowerShell:
`$env:DOTENV_CONFIG_PATH='.env.local'`). O JSON final informa erros e
quantos candidatos tiveram o link gerado e confirmado no banco. Nenhum
candidato aprovado é um resultado possível; o mínimo de 75 não é reduzido.

`GET /api/health` consulta o banco a cada chamada, sem cache: retorna HTTP
200 com `ok: true` quando todas as variáveis obrigatórias e o banco estão
disponíveis, ou HTTP 503 quando existe alguma pendência. Isso não valida
as credenciais externas nem o recebimento de mensagens pela Z-API.
