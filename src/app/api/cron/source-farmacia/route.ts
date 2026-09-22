import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { searchProductsByShop, generateAffiliateShortLink } from "../../../../lib/shopee/queries";
import { persistOfferSnapshot, createDealCandidate, saveAffiliateLink } from "../../../../lib/db/snapshots";
import { buildProductSlug } from "../../../../lib/site/slug";
import { notifyCatalogUpdate } from "../../../../lib/site/notifyRevalidate";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Ingestão diária dos produtos da própria loja do Heber, "Farmácia
 * Uruguai", na Shopee — pedido dele (2026-09-21): divulgar como
 * afiliado (ganha comissão normal, é a mesma API/fluxo de qualquer
 * outro produto). Reaproveita 100% do pipeline já existente de
 * source-deals.ts, só troca a busca por palavra-chave por busca por
 * `shopId` (achado ao vivo via rede real da página da loja + confirmado
 * batendo produto real na API, ver CONTINUIDADE.md).
 *
 * Sem gate de score/desconto (não é sobre achar "a melhor oferta da
 * internet", é divulgar o catálogo próprio) — publica os mais vendidos
 * da loja, até o limite por execução.
 */

// "Farmacia Uruguai" — shopId real confirmado ao vivo (2026-09-21):
// bateu produto real (Vitamina B12, desodorante, teste de gravidez) na
// API productOfferV2(shopId: ...).
const FARMACIA_URUGUAI_SHOP_ID = "1738181230";

function contentToken(itemId: string): string {
  return `c${crypto.createHash("sha1").update(itemId).digest("hex").slice(0, 6)}`;
}

export async function GET(request: NextRequest) {
  // Fail-closed, mesmo padrão dos outros crons.
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();

  let offers;
  try {
    offers = await searchProductsByShop({ shopId: FARMACIA_URUGUAI_SHOP_ID, limit: 30 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `busca por loja falhou: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const publicados: string[] = [];
  const falhas: Array<{ itemId: string; erro: string }> = [];

  for (const offer of offers) {
    try {
      const { productId, snapshotId } = await persistOfferSnapshot(offer);

      const subIds = ["ig", "farmacia", contentToken(offer.itemId), "auto"];
      const link = await generateAffiliateShortLink({ originUrl: offer.productLink || offer.offerLink, subIds });

      // Score alto de propósito (pedido do Heber, 2026-09-21: "dê
      // preferência a essa loja nas postagens") — é a loja própria dele,
      // deve furar a fila e sair antes dos candidatos genéricos da
      // Shopee/Awin nas filas do Instagram e WhatsApp (pickNextCandidate
      // ordena por score desc nos dois canais).
      const dc = await createDealCandidate({
        productId,
        offerSnapshotId: snapshotId,
        status: "discovered",
        score: 95,
        scoreBreakdown: { origem: "loja-propria-farmacia-uruguai" },
      });
      await saveAffiliateLink({
        dealCandidateId: dc.id,
        originUrl: offer.productLink || offer.offerLink,
        subIds,
        shortLink: link.shortLink,
        longLink: link.longLink,
      });

      const slug = buildProductSlug(offer.productName, offer.itemId);
      const { error: updateError } = await db
        .from("products")
        .update({ slug, category: "saude", category_slug: "saude", site_published: true, highlight_reason: "loja-propria", updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateError) throw new Error(`falha ao publicar produto: ${updateError.message}`);

      await notifyCatalogUpdate({ productSlug: slug, categorySlug: "saude" }).catch((e) =>
        console.error("[cron/source-farmacia] revalidate falhou:", e)
      );

      publicados.push(offer.itemId);
    } catch (err) {
      falhas.push({ itemId: offer.itemId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, coletados: offers.length, publicados: publicados.length, falhas });
}
