# Arquitetura — Site descontochegando.com.br (comparador de preços)

> Decidido em debate técnico entre Claude e ChatGPT em 2026-09-14, a partir
> da visão de produto já desenhada com o usuário na conversa do ChatGPT
> "Ajustar falas do bot". Ver [CONTINUIDADE.md](CONTINUIDADE.md) pra status
> e [FEITO.md](FEITO.md) pra histórico.

## Contexto / objetivo

`descontochegando.com.br` era só uma landing page simples levando pro grupo
de ofertas do WhatsApp; o conteúdo foi perdido (ver CONTINUIDADE.md item 3).
Objetivo agora: transformar o domínio num comparador de preços de verdade —
Shopee primeiro, outras plataformas depois — que funcione como portal
público do mesmo "motor" que já roda no bot do WhatsApp.

## Decisões de arquitetura (consenso Claude + ChatGPT)

### 1. Mesmo repositório, mesmo projeto Vercel
Não criar um app/projeto separado agora. Separar hoje duplicaria lógica de
Shopee, afiliado, tracking, ranking e Supabase, ou forçaria um projeto
chamando o outro por HTTP sem necessidade. Se o site crescer muito no
futuro, dá pra evoluir para um monorepo (`apps/site`, `apps/concierge`,
`packages/core`) — não vale a complexidade agora.

### 2. Fronteira correta: core compartilhado vs. canais
Não é "bot vs. site". É:

```
CORE (lib/)
  shopee (produtos/ofertas)
  ranking
  afiliado + tracking/subId
  reconhecimento visual
       |
  +----+----+
  |         |
WhatsApp   Web/PWA
```

Regra de negócio compartilhada fica em `lib/`; adaptação de canal fica fora
dela. Ex.: `generateAffiliateLink({ productId, source: "site_produto", campaign })`
não deveria saber se quem chamou foi WhatsApp ou site.

> **Correção (2026-09-14, ao implementar):** esse exemplo de `source:
> "site_produto"` está errado na prática — os `subIds` da Shopee só aceitam
> tokens curtos e simples (ver comentário em `src/lib/shopee/queries.ts`:
> "a Shopee rejeita valores longos/compostos... erro [11001] Params Error:
> invalid sub id"). Tracking por origem precisa usar tokens curtos (ex.:
> `["site"]`, `["site","cat"]`) gerados NA COLETA (Growth OS insere um
> `affiliate_link` por combinação relevante), não uma string composta
> montada em tempo real na página. A Fase 1 implementada não tem esse
> tracking ainda — usa o `offer_link` já existente no snapshot. Ver
> `src/lib/site/affiliateLink.ts` e o item correspondente em
> CONTINUIDADE.md.

Reorganização de pastas sugerida (não precisa migrar tudo de uma vez):
```
src/
  app/
    (site)/
      page.tsx
      categoria/[slug]/
      produto/[slug]/
    api/
      whatsapp/
      search/
      image-search/
  lib/
    shopee/          -> catálogo, afiliado, ranking
    vision/
    concierge/        -> sessão e lógica específica do WhatsApp
```

### 3. Site público NUNCA bate direto na API da Shopee
Fluxo de dados:
```
Shopee API -> Growth OS / sourcing -> Supabase -> Site público
```
O site lê dos snapshots que o pipeline de sourcing (Growth OS Etapa 0/1) já
grava no Supabase. Isso protege a conta Shopee de picos de crawler do
Google ou tráfego do Instagram virando chamadas de API. O webhook do
WhatsApp continua usando o motor interativo (chamada real) quando precisa.
Na Fase 2 (busca/foto no site), essas rotas específicas terão rate
limiting, limite de tamanho e observabilidade própria.

### 4. `/produto/[slug]` já na Fase 1 (não espera Fase 2)
A página de produto é o ativo de conversão — sem ela, Home/categorias só
jogam o usuário pra fora do site sem gerar tráfego orgânico. SEO demora pra
acumular, então as URLs que o Google deve indexar precisam existir desde o
primeiro deploy.

**Trava importante:** só produto aprovado pelo Growth OS (score ≥ 75) e
marcado como publicável vira página pública. Nunca gerar slug pra resultado
efêmero de busca de usuário (ex.: alguém busca "bermuda branca" → não cria
20 páginas SEO com os resultados) — isso vira thin/duplicate content e o
Google penaliza (thin affiliation).

```
Shopee encontrou -> Growth OS avalia -> score >= 75 -> publicável?
  -> SIM -> gera entidade pública -> /produto/[slug]
```

### 5. Slug imutável com sufixo curto
Formato: `nome-legivel-do-produto-xxxxx` (ex.:
`compressor-de-ar-portatil-12v-x7k2`). O sufixo curto evita colisão e
garante que a URL não muda mesmo se o vendedor alterar o título na Shopee
depois.

### 6. Cache: invalidação sob demanda, não por tempo fixo (CONFIRMADO)
**Repo está em Next.js ^14.2.0 (App Router, React 18) — sem upgrade só pra
isso.** As APIs `use cache`/`cacheLife`/`cacheTag` e o segundo argumento
`"max"` de `revalidateTag` são do Next.js 15/16 e NÃO existem na 14.2 —
confirmado com o ChatGPT em 2026-09-14. Desenho final pra 14.2:

```
Supabase (server client, sem cookies/sessão de visitante)
  -> unstable_cache()
  -> Data Cache do Next 14
  -> Home / Categoria / Produto
       ^
       | revalidateTag(tag)   <- 1 argumento só, sem "max"
       |
Growth OS -> POST /api/internal/revalidate-catalog (Route Handler autenticado)
```

- `unstable_cache` (de `next/cache`) envolve cada query Supabase que não é
  fetch nativo do Next, com tags granulares por entidade — **nunca** uma
  tag genérica tipo `products` (perderia a invalidação granular: mudar 1
  produto invalidaria o catálogo inteiro).
- Tags: `product:<id>`, `category:<slug>`, `home:offers`.
- `revalidateTag(tag)` é chamado a partir de uma **Route Handler** (não
  Server Action — o evento vem de um sistema externo, o Growth OS, não de
  interação de usuário na UI), autenticada por secret em header
  (`Authorization: Bearer ${REVALIDATION_SECRET}`), fail-closed.
- O Growth OS não manda a tag pronta (evita invalidação arbitrária). Manda
  um evento (`{ event: "product_updated", productId, categorySlug?,
  affectsHome? }`) e o próprio endpoint decide quais tags invalidar.
- `revalidate: <segundos>` fica como **fallback de segurança** (rede de
  proteção caso o webhook do Growth OS falhe), não como mecanismo
  principal — o valor exato depende da frequência real dos snapshots
  (30min–6h, o número importa menos que o conceito).
- Cuidado: existem 3 camadas de cache no Next 14 (Data Cache, Full Route
  Cache, Router Cache do navegador). `revalidateTag` disparado por uma
  Route Handler externa invalida as duas primeiras, mas o Router Cache de
  quem já está navegando pode mostrar a versão anterior por um tempo — na
  Fase 1 isso é aceitável (é catálogo/oferta, não saldo bancário), não vale
  a complexidade de corrigir agora.
- `revalidatePath()` foi descartado como alternativa: o mesmo produto
  aparece em várias páginas (produto, categoria, home, talvez busca) —
  pensar em dados (`revalidateTag`) é melhor que pensar em páginas
  (`revalidatePath`) nesse caso.

### 7. Geração híbrida (não pré-gerar milhares de produtos no build)
- Build: Home + categorias principais + top 50–100 produtos pré-gerados.
- Resto: gerado sob demanda no primeiro acesso e cacheado depois
  (`generateStaticParams` cobre só o subconjunto principal).

### 8. SEO completo desde a Fase 1
`generateMetadata()`, canonical, `sitemap.xml`, `robots.txt`, Open Graph,
Product structured data, breadcrumbs, URLs internas crawlable,
`rel="sponsored"` nos links afiliados. Usar **Product Snippet** (não
Merchant Listing) no schema — Desconto Chegando não é o vendedor, a compra
acontece na Shopee.

## Fases (visão de produto, do debate original com ChatGPT)

- **Fase 1**: Home + ofertas do dia + categorias + busca por texto +
  páginas de produto (`/produto/[slug]`, só catálogo aprovado) + CTA pro
  WhatsApp + links afiliados com subId por origem.
- **Fase 2**: busca por foto direto no site (reaproveitando
  `recognizeProductImage` + `compare.ts` do bot) + páginas automáticas de
  produto em maior escala + histórico de preço + favoritos/alertas de
  preço (Vercel Cron comparando preço atual com o alvo salvo, notifica via
  Z-API).
- **Fase 3**: personalização completa — o sistema aprende o que converte,
  promove ofertas vencedoras, gera páginas e conteúdo pro Instagram
  automaticamente, reinveste receita nas campanhas que dão retorno.

## Pendente antes de começar a implementar

- [x] Confirmar com o ChatGPT o equivalente exato de cache/invalidação pra
      Next.js 14.2 App Router — ver seção 6 (fechado em 2026-09-14).
- [ ] Apontar o DNS de `descontochegando.com.br` pro projeto Vercel (hoje
      está na Hostinger — ver CONTINUIDADE.md item 3).
- [ ] Definir schema das tabelas Supabase que o site vai consumir
      (provavelmente estender o que o Growth OS já grava, com campo de
      "publicável"/slug/slug-suffix imutável).
- [ ] Nenhuma linha de código da Fase 1 foi escrita ainda — este documento é
      só o desenho acordado. Ver [CONTINUIDADE.md](CONTINUIDADE.md) pro
      próximo passo real de implementação.
