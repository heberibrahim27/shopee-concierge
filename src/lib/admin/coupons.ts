/**
 * Painel de cupons do /admin (2026-09-26): mostra POR QUE o site tomou
 * cada decisão sobre cada cupom -- texto original, regra extraída, escopo
 * (marca × categoria), restrição, validade, quantos produtos da loja
 * casam, se a estimativa de preço está liberada ou bloqueada e os votos
 * "funcionou / não funcionou". Pedido do revisor (documento do GPT sobre
 * o admin): transparência das regras antes de qualquer automação.
 *
 * Só leitura: correção manual/pausa de cupom ainda não existe (ver
 * CONTINUIDADE.md).
 */
import { getDbFresh } from "../db/client";
import { CouponRule, describeRule, isAwinOpenEnded, parseCouponRule } from "../site/couponRules";
import { storeLabelForCoupon, storeSlugForCoupon } from "../site/stores";
import { SiteCoupon } from "../site/coupons";

export interface AdminCouponRow {
  id: string;
  storeSlug: string;
  storeLabel: string;
  source: "awin" | "lomadee" | "shopee" | "outra";
  title: string;
  code: string | null;
  codeFromText: boolean;
  rule: CouponRule;
  ruleLine: string | null;
  validity: { label: string; tone: "ok" | "neutral" | "blocked" };
  updatedAt: string | null;
  matchedProducts: number | null;
  estimate: { allowed: boolean; reason: string };
  votes: { up: number; down: number; days: number };
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decideEstimate(rule: CouponRule, matched: number | null): { allowed: boolean; reason: string } {
  if (rule.scopeKind === "category") {
    return {
      allowed: false,
      reason: `Não associado a produtos: "${rule.scopeTerms.join(", ")}" é categoria (texto usa "produtos de …"), e categoria não se casa pelo nome do produto.`,
    };
  }
  if (!rule.percentOff && !rule.amountOff) {
    return { allowed: false, reason: "Sem valor de desconto no texto: o cupom aparece como possibilidade, sem número." };
  }
  if (rule.eligibilityRestricted) {
    return {
      allowed: false,
      reason: "Estimativa bloqueada: o texto restringe a itens selecionados / promoção / quantidade — a loja decide quais produtos participam.",
    };
  }
  if (rule.scopeKind === "brand") {
    return {
      allowed: true,
      reason: `Estimativa liberada em produtos ${rule.scopeTerms.join(", ")} da loja${matched !== null ? ` (${matched} casam pelo nome hoje)` : ""}.`,
    };
  }
  return {
    allowed: false,
    reason: "Genérico (sem marca no texto): aparece em produtos da loja sem número, no máximo 2 por página.",
  };
}

export async function getAdminCoupons(): Promise<{
  rows: AdminCouponRow[];
  kpis: { ativos: number; comCodigo: number; estimativaLiberada: number; votos7d: number; expirados30d: number };
}> {
  const db = getDbFresh();
  const nowIso = new Date().toISOString();
  const [active, expired, feedback] = await Promise.all([
    db
      .from("coupons")
      .select(
        "id, advertiser_name, platform, title, description, code, url_tracking, ends_at, status, fetched_at, promotion_id, lomadee_campaign_id, shopee_offer_key"
      )
      .eq("status", "active")
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order("platform")
      .limit(500),
    db.from("coupons").select("*", { count: "exact", head: true }).eq("status", "expired").gte("fetched_at", daysAgoIso(30)),
    db.from("coupon_feedback").select("coupon_id, worked, created_at").gte("created_at", daysAgoIso(30)).limit(5000),
  ]);

  const votesByCoupon = new Map<string, { up: number; down: number }>();
  let votes7d = 0;
  const sevenDaysAgo = daysAgoIso(7);
  for (const v of (feedback.data ?? []) as { coupon_id: string; worked: boolean; created_at: string }[]) {
    const cur = votesByCoupon.get(v.coupon_id) ?? { up: 0, down: 0 };
    if (v.worked) cur.up++;
    else cur.down++;
    votesByCoupon.set(v.coupon_id, cur);
    if (v.created_at >= sevenDaysAgo) votes7d++;
  }

  const rows: AdminCouponRow[] = [];
  for (const r of (active.data ?? []) as Record<string, unknown>[]) {
    const coupon: SiteCoupon = {
      id: String(r.id),
      advertiserName: String(r.advertiser_name),
      platform: (r.platform as string | null) ?? null,
      title: String(r.title),
      description: (r.description as string | null) ?? null,
      code: (r.code as string | null) ?? null,
      urlTracking: String(r.url_tracking),
      endsAt: (r.ends_at as string | null) ?? null,
      status: String(r.status),
      fetchedAt: (r.fetched_at as string | null) ?? null,
    };
    const rule = parseCouponRule({ title: coupon.title, description: coupon.description, code: coupon.code });
    const storeSlug = storeSlugForCoupon(coupon);

    let matched: number | null = null;
    if (rule.scopeKind === "brand" && rule.scopeTerms.length > 0) {
      const pattern = rule.scopeTerms.map((t) => `(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`).join("|");
      const { count } = await db
        .from("site_catalog")
        .select("*", { count: "exact", head: true })
        .eq("platform", storeSlug)
        .filter("product_name", "imatch", pattern);
      matched = count ?? 0;
    }

    const openEnded = isAwinOpenEnded(coupon.endsAt, coupon.fetchedAt);
    const validity: AdminCouponRow["validity"] = openEnded
      ? { label: "sem fim (marcador Awin +366d)", tone: "neutral" }
      : coupon.endsAt
        ? { label: `até ${new Date(coupon.endsAt).toLocaleDateString("pt-BR")}`, tone: "ok" }
        : rule.validityUnknown
          ? { label: "validade desconhecida (texto: só hoje/relâmpago)", tone: "blocked" }
          : { label: "sem validade informada", tone: "neutral" };

    const source: AdminCouponRow["source"] = r.promotion_id
      ? "awin"
      : r.lomadee_campaign_id
        ? "lomadee"
        : r.shopee_offer_key
          ? "shopee"
          : "outra";

    rows.push({
      id: coupon.id,
      storeSlug,
      storeLabel: storeLabelForCoupon(coupon),
      source,
      title: coupon.title,
      code: coupon.code ?? rule.codeFromText,
      codeFromText: !coupon.code && Boolean(rule.codeFromText),
      rule,
      ruleLine: describeRule(rule),
      validity,
      updatedAt: coupon.fetchedAt,
      matchedProducts: matched,
      estimate: decideEstimate(rule, matched),
      votes: { ...(votesByCoupon.get(coupon.id) ?? { up: 0, down: 0 }), days: 30 },
    });
  }

  // Loja com mais cupons primeiro; dentro da loja, com código antes.
  const perStore = new Map<string, number>();
  for (const row of rows) perStore.set(row.storeSlug, (perStore.get(row.storeSlug) ?? 0) + 1);
  rows.sort((a, b) => {
    const d = (perStore.get(b.storeSlug) ?? 0) - (perStore.get(a.storeSlug) ?? 0);
    if (d !== 0) return d;
    if (a.storeSlug !== b.storeSlug) return a.storeSlug.localeCompare(b.storeSlug);
    return Number(Boolean(b.code)) - Number(Boolean(a.code));
  });

  return {
    rows,
    kpis: {
      ativos: rows.length,
      comCodigo: rows.filter((r) => r.code).length,
      estimativaLiberada: rows.filter((r) => r.estimate.allowed).length,
      votos7d: votes7d,
      expirados30d: expired.count ?? 0,
    },
  };
}
