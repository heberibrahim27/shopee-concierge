/**
 * Cliente Supabase (service role) — usado SÓ no backend (rotas de API,
 * scripts), nunca exposto ao navegador. As tabelas do Growth OS
 * (products, offer_snapshots, deal_candidates, affiliate_links,
 * agent_runs) têm RLS habilitado sem nenhuma policy — de propósito: só a
 * service role key (que ignora RLS) consegue ler/escrever nelas. Mesmo
 * padrão já usado nas tabelas pré-existentes deste projeto Supabase
 * (ligas, push_subs).
 *
 * Projeto: babamanager-pro (reaproveitado por decisão do Ibrahim em
 * 12/09/2026, pra não pagar por um projeto novo — banco compartilhado
 * fisicamente, mas logicamente isolado: nenhuma tabela daqui referencia
 * ou consulta `ligas`/`push_subs`, e vice-versa).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados no ambiente (.env)."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
