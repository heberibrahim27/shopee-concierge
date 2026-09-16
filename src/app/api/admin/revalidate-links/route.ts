import { NextRequest, NextResponse } from "next/server";
import { isAuthedAdminRequest } from "../../../../middleware";
import { getDbFresh } from "../../../../lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantos produtos checar por rodada — limite pra não estourar o tempo
 * máximo de execução da function. Prioriza os mais recentemente
 * atualizados (é o mesmo recorte que "Novidades"/home usa). */
const CHECK_LIMIT = 60;
const CONCURRENCY = 12;
const TIMEOUT_MS = 6000;

interface LinkRow {
  slug: string;
  product_name: string;
  offer_link: string | null;
}

async function checkOne(row: LinkRow): Promise<{
  product_slug: string;
  product_name: string;
  url: string | null;
  ok: boolean;
  status_code: number | null;
  error: string | null;
}> {
  if (!row.offer_link) {
    return {
      product_slug: row.slug,
      product_name: row.product_name,
      url: null,
      ok: false,
      status_code: null,
      error: "sem link cadastrado",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(row.offer_link, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });
    return {
      product_slug: row.slug,
      product_name: row.product_name,
      url: row.offer_link,
      ok: res.status >= 200 && res.status < 400,
      status_code: res.status,
      error: null,
    };
  } catch (err) {
    return {
      product_slug: row.slug,
      product_name: row.product_name,
      url: row.offer_link,
      ok: false,
      status_code: null,
      error: err instanceof Error ? err.message : "falha desconhecida",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Checa se os links de oferta dos produtos publicados ainda respondem
 * (200-3xx). Só confirma que a URL ainda está no ar — não confirma estoque
 * real nem se o preço mudou (isso é outra coisa, ver offer_snapshots).
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthedAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  }

  const db = getDbFresh();
  const { data, error } = await db
    .from("site_catalog")
    .select("slug, product_name, offer_link")
    .order("snapshot_captured_at", { ascending: false })
    .limit(CHECK_LIMIT);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as LinkRow[];
  const results = await mapLimit(rows, CONCURRENCY, checkOne);

  if (results.length > 0) {
    await db.from("link_checks").insert(
      results.map((r) => ({
        product_slug: r.product_slug,
        product_name: r.product_name,
        url: r.url,
        ok: r.ok,
        status_code: r.status_code,
        error: r.error,
      }))
    );
  }

  const broken = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: true,
    checked: results.length,
    okCount: results.length - broken.length,
    brokenCount: broken.length,
  });
}
