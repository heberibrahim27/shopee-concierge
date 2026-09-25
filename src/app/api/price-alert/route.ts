import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "../../../lib/db/client";
import { createZApiConnector } from "../../../lib/channel/zapi";
import {
  MAX_ACTIVE_ALERTS_PER_PHONE,
  buildWelcomeMessage,
  normalizeBrazilianPhone,
} from "../../../lib/site/priceAlerts";

export const runtime = "nodejs";

const SITE_URL = "https://descontochegando.com.br";
const MAX_CREATIONS_PER_IP_PER_HOUR = 10;

/** Só o hash (com sal do ambiente) -- o IP cru nunca vai pro banco. */
function hashClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  if (!ip) return null;
  const salt = process.env.CRON_SECRET ?? "dc";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Cria um alerta de queda de preço (formulário na página do produto —
 * ver PriceAlertForm.tsx). Público, sem autenticação. Proteções:
 *  - telefone precisa parecer brasileiro de verdade (normalizeBrazilianPhone);
 *  - alvo precisa ser menor que o preço atual (senão dispararia na hora,
 *    e a pessoa provavelmente errou o campo);
 *  - no máximo MAX_ACTIVE_ALERTS_PER_PHONE alertas ativos por número;
 *  - no máximo MAX_CREATIONS_PER_IP_PER_HOUR criações por hora por IP
 *    (hash), pra ninguém usar o formulário pra mandar boas-vindas em
 *    massa pra números alheios;
 *  - mensagem de boas-vindas só no PRIMEIRO alerta de um número (uma
 *    mensagem por número, nunca uma por alerta) — é o que confirma pra
 *    pessoa que o número está certo sem virar vetor de spam.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const productSlug = typeof body?.productSlug === "string" ? body.productSlug.trim().slice(0, 200) : "";
    const rawPhone = typeof body?.phone === "string" ? body.phone.slice(0, 40) : "";
    const targetPrice = Number(body?.targetPrice);
    const sourcePage = typeof body?.sourcePage === "string" ? body.sourcePage.slice(0, 300) : null;

    const phone = normalizeBrazilianPhone(rawPhone);
    if (!productSlug) return NextResponse.json({ ok: false, error: "produto inválido" }, { status: 400 });
    if (!phone) return NextResponse.json({ ok: false, error: "telefone inválido" }, { status: 400 });
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ ok: false, error: "preço-alvo inválido" }, { status: 400 });
    }

    const db = getDb();
    const ipHash = hashClientIp(request);
    if (ipHash) {
      const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count: recentFromIp, error: ipError } = await db
        .from("price_alerts")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", oneHourAgo);
      if (ipError) throw ipError;
      if ((recentFromIp ?? 0) >= MAX_CREATIONS_PER_IP_PER_HOUR) {
        return NextResponse.json({ ok: false, error: "muitos alertas em pouco tempo, tenta mais tarde" }, { status: 429 });
      }
    }

    const { data: product, error: productError } = await db
      .from("site_catalog")
      .select("id, product_name, price_min")
      .eq("slug", productSlug)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ ok: false, error: "produto não encontrado" }, { status: 404 });

    const currentPrice = product.price_min === null ? null : Number(product.price_min);
    if (currentPrice !== null && targetPrice >= currentPrice) {
      return NextResponse.json(
        { ok: false, error: "o preço já está nesse valor ou abaixo — coloque um alvo menor que o preço atual" },
        { status: 400 }
      );
    }

    const { count: activeCount, error: countError } = await db
      .from("price_alerts")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("status", "active");
    if (countError) throw countError;

    const { count: anyCount, error: anyError } = await db
      .from("price_alerts")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone);
    if (anyError) throw anyError;

    const { data: existing } = await db
      .from("price_alerts")
      .select("id")
      .eq("phone", phone)
      .eq("product_id", product.id)
      .eq("status", "active")
      .maybeSingle();

    if (!existing && (activeCount ?? 0) >= MAX_ACTIVE_ALERTS_PER_PHONE) {
      return NextResponse.json(
        { ok: false, error: `limite de ${MAX_ACTIVE_ALERTS_PER_PHONE} alertas ativos por número` },
        { status: 429 }
      );
    }

    if (existing) {
      const { error } = await db
        .from("price_alerts")
        .update({ target_price: targetPrice, price_at_creation: currentPrice, source_page: sourcePage })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("price_alerts").insert({
        product_id: product.id,
        product_slug: productSlug,
        phone,
        target_price: targetPrice,
        price_at_creation: currentPrice,
        source_page: sourcePage,
        ip_hash: ipHash,
      });
      if (error) throw error;
    }

    const isFirstAlertForPhone = (anyCount ?? 0) === 0;
    if (isFirstAlertForPhone && process.env.ZAPI_INSTANCE_ID) {
      try {
        await createZApiConnector().sendText({
          chatId: phone,
          text: buildWelcomeMessage({
            productName: String(product.product_name),
            targetPrice,
            productUrl: `${SITE_URL}/produto/${productSlug}`,
          }),
        });
      } catch (err) {
        console.error("[price-alert] boas-vindas falhou (alerta salvo mesmo assim):", err);
      }
    }

    return NextResponse.json({ ok: true, updated: Boolean(existing), welcomed: isFirstAlertForPhone });
  } catch (err) {
    console.error("[price-alert] falha ao registrar:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
