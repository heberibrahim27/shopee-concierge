/**
 * Senha do /admin: até 2026-09-22 vivia só em `ADMIN_PASSWORD` (Vercel
 * env var "sensitive" — depois de salva, nem o dono consegue ver de
 * novo, precisava pedir pra mim resetar via API toda vez que
 * esquecia). Heber pediu um jeito de trocar sozinho.
 *
 * Guarda o HASH (nunca a senha em texto puro) em `admin_settings`
 * (key='password_hash') — mesmo esquema SHA-256+salt que já era usado
 * só pro cookie de sessão (ver middleware.ts), reaproveitado aqui.
 * `ADMIN_PASSWORD` (env) continua como fallback — se a tabela estiver
 * vazia (ainda não trocou pelo painel) ou o Supabase falhar, usa o
 * valor do env, pra nunca travar o acesso.
 *
 * Funções aqui usam só Web Crypto (`crypto.subtle`) — compatível com
 * o Edge Runtime do middleware.ts, que não pode usar módulos nativos
 * do Node (ex: `node:crypto`).
 */

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password + "::dc-admin-salt");
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Buffer.from(digest).toString("hex");
}

/**
 * Busca o hash configurado no Supabase via REST direto (fetch puro,
 * sem @supabase/supabase-js) — mantém compatibilidade com Edge Runtime
 * e evita puxar o SDK inteiro só pra 1 leitura simples no middleware.
 */
async function fetchStoredHash(): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const resp = await fetch(`${url}/rest/v1/admin_settings?key=eq.password_hash&select=value`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<{ value: string }>;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/** Hash contra o qual toda checagem de senha/cookie deve comparar — Supabase primeiro, `ADMIN_PASSWORD` (env, hasheado na hora) como fallback. */
export async function getExpectedPasswordHash(): Promise<string | null> {
  const stored = await fetchStoredHash();
  if (stored) return stored;

  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword) return null;
  return hashPassword(envPassword);
}

export async function setStoredPasswordHash(hash: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados");

  const resp = await fetch(`${url}/rest/v1/admin_settings?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: "password_hash", value: hash, updated_at: new Date().toISOString() }),
  });
  if (!resp.ok) throw new Error(`Falha ao salvar hash da senha: HTTP ${resp.status} ${await resp.text()}`);
}
