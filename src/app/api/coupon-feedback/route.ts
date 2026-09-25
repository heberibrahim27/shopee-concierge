import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "../../../lib/db/client";

export const runtime = "nodejs";

const MAX_VOTES_PER_IP_PER_HOUR = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  if (!ip) return null;
  return createHash("sha256").update(`${process.env.CRON_SECRET ?? "dc"}:${ip}`).digest("hex").slice(0, 32);
}

/** Voto "funcionou / não funcionou" num cupom (ver CouponCard). Público. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const couponId = typeof body?.couponId === "string" ? body.couponId : "";
    const worked = body?.worked;
    if (!UUID_RE.test(couponId) || typeof worked !== "boolean") {
      return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
    }

    const db = getDb();
    const ipHash = hashClientIp(request);
    if (ipHash) {
      const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db
        .from("coupon_feedback")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", oneHourAgo);
      if ((count ?? 0) >= MAX_VOTES_PER_IP_PER_HOUR) {
        return NextResponse.json({ ok: false, error: "muitos votos" }, { status: 429 });
      }
    }

    const { error } = await db.from("coupon_feedback").insert({ coupon_id: couponId, worked, ip_hash: ipHash });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[coupon-feedback] falha:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
