import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { discoverWeeklyPicks } from "../../../../lib/mercadolivre/weeklyDiscovery";
import { createZApiConnector } from "../../../../lib/channel/zapi";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Metade AUTOMÁTICA do fluxo de descoberta na Mercado Livre (Heber,
 * 2026-09-24: "então jogue duro"). A outra metade (gerar o link de
 * afiliado) NÃO tem API — confirmado testando na conta real, é token
 * opaco gerado pelo formulário, sem padrão fixo pra automatizar (ver
 * CONTINUIDADE.md). Em vez de depender de uma sessão do Claude Code
 * ficar aberta com o Chrome logado (frágil, expira em 7 dias — solução
 * de curto prazo já usada hoje), esse cron roda sozinho no Vercel toda
 * semana, sem precisar de login nenhum: só descobre e enfileira. O
 * Heber recebe um WhatsApp quando tem pendência nova, e resolve em
 * poucos minutos no /admin quando quiser (ver
 * mercadolivre-pending/route.ts e o botão no admin).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const picks = await discoverWeeklyPicks(db, { perCategory: 3 });

  // Dedupe também contra o que já está pendente (não resolvido ainda) —
  // sem isso, rodar 2 semanas seguidas sem o Heber limpar a fila
  // duplicaria a mesma sugestão.
  const { data: alreadyPending } = await db
    .from("mercadolivre_pending_picks")
    .select("title")
    .eq("status", "pending");
  const pendingTitles = new Set((alreadyPending ?? []).map((p: any) => p.title.trim().toLowerCase()));
  const novos = picks.filter((p) => !pendingTitles.has(p.title.trim().toLowerCase()));

  if (novos.length === 0) {
    return NextResponse.json({ ok: true, novos: 0, reason: "nada novo esta semana" });
  }

  const { error: insertError } = await db.from("mercadolivre_pending_picks").insert(
    novos.map((p) => ({
      title: p.title,
      product_url: p.url,
      current_price: p.currentPrice,
      category_slug: p.categorySlug,
      value_score: p.valueScore,
      status: "pending",
    }))
  );
  if (insertError) {
    return NextResponse.json({ ok: false, error: `falha ao salvar pendências: ${insertError.message}` }, { status: 500 });
  }

  const heberPhone = process.env.HEBER_WHATSAPP_NUMBER;
  let notified = false;
  if (heberPhone) {
    try {
      const zapi = createZApiConnector();
      const byCategory = novos.reduce<Record<string, number>>((acc, p) => {
        acc[p.categorySlug] = (acc[p.categorySlug] ?? 0) + 1;
        return acc;
      }, {});
      const resumo = Object.entries(byCategory).map(([cat, n]) => `${cat}: ${n}`).join(", ");
      await zapi.sendText({
        chatId: heberPhone,
        text: `🛍️ Varredura semanal da Mercado Livre achou ${novos.length} produto(s) novo(s) — ${resumo}.\n\nEntra no /admin quando puder pra gerar os links e fechar (leva uns 2 minutos).`,
      });
      notified = true;
    } catch (err) {
      console.error("[cron/mercadolivre-discovery] falha ao notificar Heber via WhatsApp:", err);
    }
  }

  return NextResponse.json({ ok: true, novos: novos.length, notified, porCategoria: novos.reduce<Record<string, number>>((acc, p) => { acc[p.categorySlug] = (acc[p.categorySlug] ?? 0) + 1; return acc; }, {}) });
}
