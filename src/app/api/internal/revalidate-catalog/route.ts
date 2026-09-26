/**
 * Endpoint interno chamado pelo Growth OS quando um snapshot muda no
 * Supabase. Decide sozinho quais tags invalidar a partir de um evento
 * tipado — nunca aceita uma tag arbitrária do chamador (ver
 * ARQUITETURA-SITE.md, seção 6). Autenticado por secret em header,
 * fail-closed.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { submitToIndexNow } from "../../../../lib/site/indexnow";

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

  // IndexNow (achado real 2026-09-26, pesquisa com o ChatGPT sobre
  // aquisição): avisa Bing só quando conteúdo de verdade mudou -- esse
  // endpoint já só é chamado nesses casos (nunca em bulk), então é o
  // ponto certo pra plugar sem virar spam de URL.
  const indexNowPaths = [`/produto/${body.productSlug}`];
  if (body.categorySlug) indexNowPaths.push(`/categoria/${body.categorySlug}`);
  if (body.affectsHome) indexNowPaths.push("/");
  void submitToIndexNow(indexNowPaths);

  return NextResponse.json({ revalidated });
}
