/**
 * Endpoint interno chamado pelo Growth OS quando um snapshot muda no
 * Supabase. Decide sozinho quais tags invalidar a partir de um evento
 * tipado — nunca aceita uma tag arbitrária do chamador (ver
 * ARQUITETURA-SITE.md, seção 6). Autenticado por secret em header,
 * fail-closed.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

interface RevalidateCatalogEvent {
  event: "product_updated";
  productSlug: string;
  categorySlug?: string;
  affectsHome?: boolean;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  const expected = process.env.REVALIDATION_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "REVALIDATION_SECRET não configurado no ambiente" },
      { status: 500 }
    );
  }

  if (secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<RevalidateCatalogEvent>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.event !== "product_updated" || !body.productSlug) {
    return NextResponse.json(
      { error: "Esperado { event: 'product_updated', productSlug, categorySlug?, affectsHome? }" },
      { status: 400 }
    );
  }

  const revalidated = [`product:${body.productSlug}`];
  revalidateTag(`product:${body.productSlug}`);

  if (body.categorySlug) {
    revalidated.push(`category:${body.categorySlug}`);
    revalidateTag(`category:${body.categorySlug}`);
  }

  if (body.affectsHome) {
    revalidated.push("home:offers");
    revalidateTag("home:offers");
  }

  return NextResponse.json({ revalidated });
}
