import { getDbFresh } from "../db/client";
import { createPin } from "./client";

/**
 * Escolhe o próximo produto ainda sem Pin e publica (ou só simula).
 * Usado pelo cron `publish-pinterest` e pelo botão "Criar Pin de teste"
 * em /admin/pinterest. Destino do clique = página do produto no NOSSO
 * site (com UTM), texto só com dado real.
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
  // Dedupe em memória (lista-na-URL quebrou o grupo do WhatsApp em 2026-10-04).
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
      console.error("[pinterest] falha ao ler site_catalog:", error.message);
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
  const link = `${base.replace(/\/$/, "")}/produto/${p.slug}?utm_source=pinterest&utm_medium=pin&utm_campaign=produto`;
  const facts = [`A partir de ${brl(p.priceMin)}`];
  if (p.rating && p.rating > 0) facts.push(`nota ${p.rating.toFixed(1).replace(".", ",")}`);
  if (p.sales && p.sales > 0) facts.push(`${p.sales.toLocaleString("pt-BR")} vendidos`);
  const description = `${p.name}\n\n${facts.join(" · ")}. Veja o histórico de preço e compare lojas no Desconto Chegando.`;
  return { title: p.name, description, link };
}

export type PublishNextResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; dryRun: true; produto: string; platform: string; title: string; description: string; link: string; imageUrl: string }
  | { ok: true; productId: string; pinId: string; produto: string }
  | { ok: false; error: string };

export async function publishNextPin(opts: { boardId: string; dryRun?: boolean }): Promise<PublishNextResult> {
  const db = getDbFresh();
  const product = await pickProduct(db, opts.boardId);
  if (!product) return { ok: true, skipped: true, reason: "sem produto novo pra Pin" };

  const pin = buildPin(product);
  if (opts.dryRun) {
    return { ok: true, dryRun: true, produto: product.name, platform: product.platform, ...pin, imageUrl: product.imageUrl };
  }

  try {
    const { pinId } = await createPin({ boardId: opts.boardId, title: pin.title, description: pin.description, link: pin.link, imageUrl: product.imageUrl });
    await db.from("pinterest_pins").insert({ product_id: product.id, board_id: opts.boardId, pin_id: pinId, status: "posted" });
    return { ok: true, productId: product.id, pinId, produto: product.name };
  } catch (err: any) {
    const message = String(err?.message ?? err);
    await db.from("pinterest_pins").insert({ product_id: product.id, board_id: opts.boardId, status: "failed", error: message.slice(0, 500) });
    return { ok: false, error: message };
  }
}
