/**
 * Health check (Etapa 0 do Plano Diretor: "projeto executável, conexão de
 * banco, health check e documentação de ambiente").
 *
 * Nunca retorna valor de credencial — só se cada uma está presente ou não
 * — e faz uma consulta trivial no Supabase pra confirmar que a conexão
 * real está de pé (não só que a variável existe).
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

// O health check precisa refletir o ambiente e o banco a cada chamada.
export const dynamic = "force-dynamic";

const REQUIRED_ENV_VARS = [
  "SHOPEE_APP_ID",
  "SHOPEE_SECRET",
  "ZAPI_INSTANCE_ID",
  "ZAPI_TOKEN",
  "ZAPI_CLIENT_TOKEN",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export async function GET() {
  const env: Record<string, boolean> = {};
  for (const key of REQUIRED_ENV_VARS) {
    env[key] = Boolean(process.env[key]);
  }

  let db: { ok: boolean; error?: string } = { ok: false };
  try {
    const client = getDb();
    const { error } = await client.from("products").select("id", { count: "exact", head: true });
    db = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    db = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const allEnvOk = Object.values(env).every(Boolean);

  const ok = allEnvOk && db.ok;
  return NextResponse.json({
    ok,
    env,
    db,
    timestamp: new Date().toISOString(),
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
