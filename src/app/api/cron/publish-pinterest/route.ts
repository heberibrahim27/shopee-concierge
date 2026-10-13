import { NextRequest, NextResponse } from "next/server";
import { getDbFresh } from "../../../../lib/db/client";
import { createPin, listBoards } from "../../../../lib/pinterest/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Publica 1 Pin por execução apontando pra PÁGINA DO PRODUTO no nosso site
 * (não direto pro merchant) -- o Pinterest desencoraja afiliado repetitivo
 * em volume e o valor real está na comparação/histórico que o site mostra.
 * Texto só com dado real (preço do snapshot, nota, vendas), sem urgência
 * inventada. Fica FORA do vercel.json até o token OAuth e o board existirem;
 * sem eles responde 200 "skipped" em vez de falhar.
 *
 * ?dryRun=1 mostra o Pin que sairia sem publicar.
 * ?boards=1 lista os boards da conta (pra descobrir o PINTEREST_BOARD_ID).
 */

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

type PinProduct = {
  id: string;
  slug: string;
  name: string;
  platform: string;
  imageUrl: string;
  priceMin: number;
  rating: number | null;
  sales: number | null;
};

function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

async function pickProduct(db: ReturnType<typeof getDbFresh>, boardId: string): Promise<PinProduct | null> {
  // Dedupe em memória (a tabela de Pins cresce devagar, mas lista-na-URL
  // quebrou o grupo do WhatsApp em 2026-10-04 -- não repetir o padrão).
  const { data: done } = await db.from("pinterest_pins").select("product_id").eq("board_id", boardId).eq("status", "posted");
  const posted = new Set((done ?? []).map((r: any) => r.product_id));

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from("site_catalog")
      .select("id, slug, product_name, platform, image_url, price_min, rating_star, sales")
      .not("slug", "is", null)
      .not("image_url", "is", null)
      .not("price_min", "is", null)
      .order("sales", { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      console.error("[publish-pinterest] falha ao ler site_catalog:", error.message);
      return null;
    }
    for (const row of (data ?? []) as any[]) {
      if (posted.has(row.id)) continue;
      return {
        id: row.id,
        slug: row.slug,
        name: row.product_name,
        platform: row.platform,
        imageUrl: row.image_url,
        priceMin: Number(row.price_min),
        rating: row.rating_star != null ? Number(row.rating_star) : null,
        sales: row.sales != null ? Number(row.sales) : null,
      };
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return null;
}

function buildPin(p: PinProduct) {
  const base = process.env.SITE_BASE_URL || "https://descontochegando.com.br";
  const link = `${base}/produto/${p.slug}?utm_source=pinterest&utm_medium=pin&utm_campaign=produto`;
  const facts = [`A partir de ${brl(p.priceMin)}`];
  if (p.rating && p.rating > 0) facts.push(`nota ${p.rating.toFixed(1).replace(".", ",")}`);
  if (p.sales && p.sales > 0) facts.push(`${p.sales.toLocaleString("pt-BR")} vendidos`);
  const description = `${p.name}\n\n${facts.join(" · ")}. Veja o histórico de preço e compare lojas no Desconto Chegando.`;
  return { title: p.name, description, link };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.PINTEREST_ACCESS_TOKEN) {
    return NextResponse.json({ ok: true, skipped: true, reason: "PINTEREST_ACCESS_TOKEN ausente" });
  }

  if (request.nextUrl.searchParams.get("boards") === "1") {
    try {
      return NextResponse.json({ ok: true, boards: await listBoards() });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
    }
  }

  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!boardId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "PINTEREST_BOARD_ID ausente (use ?boards=1 pra listar)" });
  }

  const db = getDbFresh();
  const product = await pickProduct(db, boardId);
  if (!product) return NextResponse.json({ ok: true, skipped: true, reason: "sem produto novo pra Pin" });

  const pin = buildPin(product);
  if (request.nextUrl.searchParams.get("dryRun") === "1") {
    return NextResponse.json({ ok: true, dryRun: true, produto: product.name, platform: product.platform, ...pin, imageUrl: product.imageUrl });
  }

  try {
    const { pinId } = await createPin({ boardId, title: pin.title, description: pin.description, link: pin.link, imageUrl: product.imageUrl });
    await db.from("pinterest_pins").insert({ product_id: product.id, board_id: boardId, pin_id: pinId, status: "posted" });
    return NextResponse.json({ ok: true, productId: product.id, pinId });
  } catch (err: any) {
    await db.from("pinterest_pins").insert({ product_id: product.id, board_id: boardId, status: "failed", error: String(err?.message ?? err).slice(0, 500) });
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
