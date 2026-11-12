# whatsapp-sender

Envia a fila `whatsapp_outbox` (grupo, cupom, alerta de preço) pelo WhatsApp do dono, **de graça**, rodando no computador. Substitui a Z-API (assinatura encerrada; último post do grupo em 22/10/2026). Não precisa de Docker nem de virtualização.

## Como funciona
1. O site (crons) grava a mensagem em `whatsapp_outbox` em vez de chamar a Z-API (`WHATSAPP_PROVIDER=outbox` na Vercel).
2. Este programa lê a fila a cada 15 s e envia pelo WhatsApp conectado (Baileys), com 6–14 s de intervalo entre envios.
3. Mensagem com mais de 3 h na fila é descartada (não solta oferta atrasada). Computador desligado = nada é enviado.

## Primeira vez
```
cd tools/whatsapp-sender
npm install
# no .env da raiz do projeto: WHATSAPP_PAIRING_NUMBER=5511999998888  (55 + DDD + número, só dígitos)
npm run grupos     # mostra um CÓDIGO; no celular: WhatsApp > Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone
```
Depois de conectar, `npm run grupos` lista os grupos e confirma se o grupo do Desconto Chegando está na conta.
`npm run teste` manda uma mensagem para o próprio número. `npm start` fica enviando a fila.

A sessão fica em `auth/` (ignorada pelo git). Se o WhatsApp encerrar a sessão, apague `auth/` e conecte de novo.

## Ligar no site
Na Vercel (produção): `WHATSAPP_PROVIDER=outbox` e `WHATSAPP_GROUP_INVITE_URL=https://chat.whatsapp.com/...`, depois redeploy. Para voltar à Z-API, remova `WHATSAPP_PROVIDER`.

## Limites
- Protocolo não oficial do WhatsApp Web (mesma natureza de risco da Z-API).
- O bot de reconhecimento de produto por foto (webhook) não roda neste modo.
- Os cards de prévia de link customizados da Z-API viram "foto + legenda".
