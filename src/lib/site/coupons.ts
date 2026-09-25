/**
 * Cupons/promoções reais vindos da API de promoções da Awin (só anunciantes
 * onde já somos aprovados de verdade). Ingestão automática diária via
 * /api/cron/source-coupons (ver CONTINUIDADE.md pro endpoint exato) —
 * nunca chama a Awin ao vivo na renderização da página.
 */
import { unstable_cache } from "next/cache";
import { getDb } from "../db/client";
import { parseCouponRule } from "./couponRules";

export interface SiteCoupon {
  id: string;
  advertiserName: string;
  platform: string | null;
  title: string;
  description: string | null;
  code: string | null;
  urlTracking: string;
  endsAt: string | null;
  status: string;
  /** Última vez que o cron confirmou o cupom na rede ("Conferido em"). */
  fetchedAt: string | null;
}

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function mapRow(row: Record<string, unknown>): SiteCoupon {
  const title = String(row.title);
  const description = (row.description as string | null) ?? null;
  const storedCode = (row.code as string | null) ?? null;
  // Achado real 2026-09-26: cupons Lomadee vêm com o código escrito no
  // título ("Use o cupom: EXTRA20") e a coluna `code` vazia -- sem isso o
  // card mostrava "Aproveitar" em vez de revelar o código.
  const code = storedCode ?? parseCouponRule({ title, description, code: storedCode }).codeFromText;
  return {
    id: String(row.id),
    advertiserName: String(row.advertiser_name),
    platform: (row.platform as string | null) ?? null,
    title,
    description: description && description.trim() === title.trim() ? null : description,
    code,
    urlTracking: String(row.url_tracking),
    endsAt: (row.ends_at as string | null) ?? null,
    status: String(row.status),
    fetchedAt: (row.fetched_at as string | null) ?? null,
  };
}

async function queryActiveCoupons(): Promise<SiteCoupon[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("coupons")
    .select("id, advertiser_name, platform, title, description, code, url_tracking, ends_at, status, fetched_at")
    .eq("status", "active")
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("ends_at", { ascending: true })
    .limit(20);

  if (error) throw new Error(`Falha ao buscar cupons: ${error.message}`);
  return (data ?? []).map(mapRow);
}

/**
 * TODOS os cupons ativos (não só os 20 da vitrine) — base das páginas por
 * loja (`/cupom/[loja]`, ver stores.ts). Limite alto só como proteção;
 * hoje são ~40 ativos no total.
 */
async function queryAllActiveCoupons(): Promise<SiteCoupon[]> {
  if (!hasSupabaseEnv()) return [];

  const db = getDb();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("coupons")
    .select("id, advertiser_name, platform, title, description, code, url_tracking, ends_at, status, fetched_at")
    .eq("status", "active")
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("ends_at", { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) throw new Error(`Falha ao buscar todos os cupons: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export function getCachedAllActiveCoupons(): Promise<SiteCoupon[]> {
  return unstable_cache(queryAllActiveCoupons, ["all-active-coupons"], {
    tags: ["coupons"],
    revalidate: 3600,
  })();
}

export function getCachedCoupons(): Promise<SiteCoupon[]> {
  return unstable_cache(queryActiveCoupons, ["active-coupons"], {
    tags: ["coupons"],
    revalidate: 3600,
  })();
}
