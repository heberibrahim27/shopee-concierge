/**
 * Programa local que envia a fila `whatsapp_outbox` pelo WhatsApp do dono.
 *
 *   npm install            (uma vez, nesta pasta)
 *   npm run grupos         (conecta, lista os grupos com o id, e sai)
 *   npm run teste          (manda uma mensagem de teste pra você mesmo, e sai)
 *   npm start              (fica ligado, enviando a fila)
 *
 * Primeira conexão: defina WHATSAPP_PAIRING_NUMBER (só dígitos, com 55 + DDD,
 * ex.: 5511999998888) no .env da raiz do projeto. O programa mostra um código
 * de 8 letras: no celular, WhatsApp > Aparelhos conectados > Conectar um
 * aparelho > "Conectar com número de telefone" e digite o código. Depois
 * disso a sessão fica salva em ./auth e não pede de novo.
 *
 * Usa o mesmo protocolo não oficial do WhatsApp Web que a Z-API usava: o
 * risco de bloqueio do número é da mesma natureza. Por isso há intervalo
 * aleatório entre os envios e nada é enviado se a mensagem ficou velha.
 */
import "dotenv/config";
import { config as loadRoot } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { createClient } from "@supabase/supabase-js";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";

const here = path.dirname(fileURLToPath(import.meta.url));
loadRoot({ path: path.join(here, "..", "..", ".env") }); // .env da raiz do projeto

const ARGS = new Set(process.argv.slice(2));
const POLL_MS = 15_000;
const MAX_AGE_MS = 3 * 60 * 60 * 1000; // descarta o que ficou mais de 3h na fila
const MAX_ATTEMPTS = 3;
const MIN_GAP_MS = 6_000;
const MAX_GAP_MS = 14_000;

const log = pino({ level: "silent" });
const say = (...a) => console.log(new Date().toLocaleTimeString("pt-BR"), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** "120363...-group" -> "...@g.us"; JID completo passa; telefone vira JID de usuário. */
function toJid(chatId) {
  if (chatId.endsWith("-group")) return `${chatId.slice(0, -"-group".length)}@g.us`;
  if (chatId.includes("@")) return chatId;
  return `${chatId.replace(/\D/g, "")}@s.whatsapp.net`;
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(here, "auth"));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: log,
    browser: Browsers.macOS("Desconto Chegando"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);

  if (!state.creds.registered) {
    const number = (process.env.WHATSAPP_PAIRING_NUMBER || "").replace(/\D/g, "");
    if (!number) {
      console.error("Primeira conexão: defina WHATSAPP_PAIRING_NUMBER (ex.: 5511999998888) no .env da raiz do projeto.");
      process.exit(1);
    }
    await sleep(3000);
    const code = await sock.requestPairingCode(number);
    console.log("\n=========================================");
    console.log("  CÓDIGO DE PAREAMENTO:  " + code.match(/.{1,4}/g).join("-"));
    console.log("  No celular: WhatsApp > Aparelhos conectados >");
    console.log("  Conectar um aparelho > Conectar com número de telefone");
    console.log("=========================================\n");
  }

  return new Promise((resolve, reject) => {
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        say("WhatsApp conectado como", sock.user?.id);
        resolve(sock);
      }
      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          console.error("Sessão encerrada pelo WhatsApp. Apague a pasta tools/whatsapp-sender/auth e conecte de novo.");
          process.exit(1);
        }
        reject(new Error(`conexão fechada (${code ?? "?"})`));
      }
    });
  });
}

async function listGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  const list = Object.values(groups).map((g) => ({ nome: g.subject, id: g.id, membros: g.participants.length }));
  console.table(list);
  const wanted = (process.env.ZAPI_DESCONTOS_GROUP_ID || "120363368934404281-group").replace(/-group$/, "@g.us");
  const found = list.find((g) => g.id === wanted);
  console.log(found ? `\nO grupo configurado (${wanted}) foi encontrado: "${found.nome}", ${found.membros} membros.` : `\nATENÇÃO: o grupo configurado (${wanted}) NÃO está nesta conta.`);
}

async function sendRow(sock, row) {
  const jid = toJid(row.chat_id);
  if (row.kind === "image") {
    await sock.sendMessage(jid, { image: { url: row.image_url }, caption: row.caption ?? "" });
  } else {
    await sock.sendMessage(jid, { text: row.text ?? "" });
  }
}

async function processQueue(sock) {
  // expira o que ficou velho demais
  await supabase
    .from("whatsapp_outbox")
    .update({ status: "expired", error: "ficou mais de 3h na fila" })
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - MAX_AGE_MS).toISOString());

  const { data: rows, error } = await supabase
    .from("whatsapp_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) {
    say("erro lendo a fila:", error.message);
    return;
  }
  for (const row of rows ?? []) {
    // "reserva" a linha (só um sender por vez processa)
    const { data: claimed } = await supabase.from("whatsapp_outbox").update({ status: "sending", attempts: row.attempts + 1 }).eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    try {
      await sendRow(sock, row);
      await supabase.from("whatsapp_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", row.id);
      say("enviado:", row.kind, "->", row.chat_id, (row.caption || row.text || "").slice(0, 50).replace(/\n/g, " "));
    } catch (err) {
      const message = String(err?.message ?? err).slice(0, 300);
      const giveUp = row.attempts + 1 >= MAX_ATTEMPTS;
      await supabase.from("whatsapp_outbox").update({ status: giveUp ? "failed" : "pending", error: message }).eq("id", row.id);
      say("falhou:", message);
    }
    await sleep(rand(MIN_GAP_MS, MAX_GAP_MS));
  }
}

async function main() {
  let sock;
  for (;;) {
    try {
      sock = await connect();
      break;
    } catch (e) {
      say("reconectando...", e.message);
      await sleep(5000);
    }
  }

  if (ARGS.has("--grupos")) {
    await listGroups(sock);
    process.exit(0);
  }
  if (ARGS.has("--teste")) {
    const me = sock.user.id.split(":")[0].split("@")[0];
    await sock.sendMessage(`${me}@s.whatsapp.net`, { text: "Teste do envio automático do Desconto Chegando ✅" });
    say("mensagem de teste enviada para você mesmo");
    await sleep(2000);
    process.exit(0);
  }

  // modo normal: roda para sempre, reconectando se cair
  let alive = true;
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      alive = false;
    }
  });
  say("lendo a fila a cada", POLL_MS / 1000, "s. Ctrl+C para parar.");
  for (;;) {
    if (!alive) {
      say("conexão caiu, reconectando...");
      try {
        sock = await connect();
        alive = true;
        sock.ev.on("connection.update", ({ connection }) => {
          if (connection === "close") alive = false;
        });
      } catch (e) {
        await sleep(10_000);
        continue;
      }
    }
    try {
      await processQueue(sock);
    } catch (e) {
      say("erro no ciclo:", e.message);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
