/**
 * Cliente da Lomadee (rede de afiliados multi-loja — Americanas,
 * Submarino, Extra, Ricardo Eletro, Sawary, Casa do Fitness etc.
 * Canal `descontochegando.com.br` criado e verificado 2026-09-22, ver
 * CONTINUIDADE.md). API REST real, autenticação via header `x-api-key`
 * (`LOMADEE_API_KEY`), limite 60 req/60s por chave+IP.
 */

const BASE_URL = "https://api.lomadee.com.br";

function apiKey(): string {
  const key = process.env.LOMADEE_API_KEY;
  if (!key) throw new Error("LOMADEE_API_KEY não configurada");
  return key;
}

async function lomadeeGet<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), { headers: { "x-api-key": apiKey() } });
  if (!resp.ok) throw new Error(`Lomadee GET ${path} falhou: HTTP ${resp.status} ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

export type LomadeeCampaign = {
  id: string;
  name: string;
  period: { startAt: string; endAt: string } | null;
  type: "PersonalCoupon" | "GenericCoupon" | "Offer";
  offerType?: "Spreadsheet" | "Url";
  description?: string;
  code?: string;
  url?: string;
  organizationId: string;
  status: "onTime" | "expired" | "scheduled";
  channels: Array<{ id: string; name: string; shortUrls: string[]; message?: string }>;
};

export async function fetchLomadeeCampaigns(params: {
  types: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: LomadeeCampaign[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  return lomadeeGet("/affiliate/campaigns", {
    types: params.types,
    status: params.status ?? "onTime",
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  });
}

export type LomadeeProduct = {
  organizationId: string;
  id: string;
  available: boolean;
  name: string;
  url: string;
  images: Array<{ url: string }>;
  options: Array<{
    available: boolean;
    pricing: Array<{ listPrice: number; price: number }>;
  }>;
};

export async function fetchLomadeeProducts(params: {
  isAvailable?: boolean;
  search?: string;
  organizationIds?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: LomadeeProduct[]; count: number }> {
  return lomadeeGet("/affiliate/products", {
    isAvailable: params.isAvailable,
    search: params.search,
    organizationIds: params.organizationIds,
    page: params.page ?? 1,
    limit: params.limit ?? 50,
  });
}

export type LomadeeBrand = {
  id: string;
  name: string;
  slug: string;
};

export async function fetchLomadeeBrands(params: { page?: number; limit?: number }): Promise<{
  data: LomadeeBrand[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  return lomadeeGet("/affiliate/brands", { page: params.page ?? 1, limit: params.limit ?? 20 });
}

export async function fetchLomadeeBrandById(id: string): Promise<{ data: LomadeeBrand }> {
  return lomadeeGet(`/affiliate/brands/${id}`, {});
}

export type ShortenUrlChannelResult = { id: string; name: string; shortUrls: string[]; message?: string };

/** POST /affiliate/shortener/url — gera link de afiliado rastreado. `type:"Custom"` funciona pra qualquer URL de produto (a API não tem endpoint dedicado de link por produto). */
export async function shortenLomadeeUrl(body: {
  organizationId: string;
  type: "Coupon" | "Offer" | "BrandPage" | "Custom" | "Home";
  featureId?: string;
  url?: string;
}): Promise<ShortenUrlChannelResult[]> {
  const resp = await fetch(`${BASE_URL}/affiliate/shortener/url`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Lomadee POST shortener falhou: HTTP ${resp.status} ${await resp.text()}`);
  return resp.json();
}
