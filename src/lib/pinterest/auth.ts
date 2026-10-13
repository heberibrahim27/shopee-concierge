import { getDbFresh } from "../db/client";

/**
 * OAuth 2.0 do Pinterest (authorization code). O login é feito UMA vez pelo
 * dono da conta em /admin/pinterest; o token fica em `pinterest_auth` e
 * renova sozinho pelo refresh_token.
 *
 * Env: PINTEREST_APP_ID, PINTEREST_APP_SECRET (liberado pelo Pinterest
 * depois da aprovação do app), PINTEREST_REDIRECT_URI (opcional -- default
 * abaixo; PRECISA estar cadastrado igual no painel do app).
 */
export const PINTEREST_SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];

const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";

export function pinterestRedirectUri(): string {
  if (process.env.PINTEREST_REDIRECT_URI) return process.env.PINTEREST_REDIRECT_URI;
  const base = process.env.SITE_BASE_URL || "https://descontochegando.com.br";
  return `${base.replace(/\/$/, "")}/api/admin/pinterest/callback`;
}

function credentials(): { id: string; secret: string } {
  const id = process.env.PINTEREST_APP_ID;
  const secret = process.env.PINTEREST_APP_SECRET;
  if (!id || !secret) throw new Error("PINTEREST_APP_ID / PINTEREST_APP_SECRET não configurados.");
  return { id, secret };
}

export function buildAuthorizeUrl(state: string): string {
  const id = process.env.PINTEREST_APP_ID;
  if (!id) throw new Error("PINTEREST_APP_ID não configurado.");
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: pinterestRedirectUri(),
    response_type: "code",
    scope: PINTEREST_SCOPES.join(","),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = credentials();
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Pinterest oauth/token -> ${resp.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as TokenResponse;
}

async function saveToken(t: TokenResponse, previousRefresh?: string | null): Promise<void> {
  const now = Date.now();
  const db = getDbFresh();
  const { error } = await db.from("pinterest_auth").upsert({
    id: 1,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previousRefresh ?? null,
    access_expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null,
    refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
    scope: t.scope ?? null,
    updated_at: new Date(now).toISOString(),
  });
  if (error) throw new Error(`Falha ao salvar token do Pinterest: ${error.message}`);
}

export async function exchangeCodeAndSave(code: string): Promise<void> {
  const t = await requestToken({ grant_type: "authorization_code", code, redirect_uri: pinterestRedirectUri() });
  await saveToken(t);
}

export type PinterestAuthStatus = { connected: boolean; scope?: string | null; accessExpiresAt?: string | null; refreshExpiresAt?: string | null };

export async function getAuthStatus(): Promise<PinterestAuthStatus> {
  const { data } = await getDbFresh().from("pinterest_auth").select("scope, access_expires_at, refresh_expires_at").eq("id", 1).maybeSingle();
  if (!data) return { connected: false };
  return { connected: true, scope: data.scope, accessExpiresAt: data.access_expires_at, refreshExpiresAt: data.refresh_expires_at };
}

/**
 * Token válido pra chamar a API: o salvo (renovando se estiver a menos de
 * 5 min de vencer), ou o PINTEREST_ACCESS_TOKEN do ambiente (token de
 * sandbox gerado à mão no painel) quando ainda não houve login OAuth.
 */
export async function getValidAccessToken(): Promise<string> {
  const { data } = await getDbFresh().from("pinterest_auth").select("*").eq("id", 1).maybeSingle();
  if (data) {
    const expiresAt = data.access_expires_at ? new Date(data.access_expires_at).getTime() : Infinity;
    if (expiresAt - Date.now() > 5 * 60 * 1000) return data.access_token as string;
    if (!data.refresh_token) throw new Error("Token do Pinterest expirou e não há refresh_token -- refaça o login em /admin/pinterest.");
    const t = await requestToken({ grant_type: "refresh_token", refresh_token: data.refresh_token as string });
    await saveToken(t, data.refresh_token as string);
    return t.access_token;
  }
  const envToken = process.env.PINTEREST_ACCESS_TOKEN;
  if (envToken) return envToken;
  throw new Error("Pinterest não conectado -- faça o login em /admin/pinterest (ou defina PINTEREST_ACCESS_TOKEN de sandbox).");
}

export async function hasAnyPinterestToken(): Promise<boolean> {
  if (process.env.PINTEREST_ACCESS_TOKEN) return true;
  return (await getAuthStatus()).connected;
}
