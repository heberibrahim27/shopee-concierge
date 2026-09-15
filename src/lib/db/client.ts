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

function requireEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados no ambiente (.env)."
    );
  }
  return { url, serviceRoleKey };
}

let cached: SupabaseClient | null = null;

/**
 * Cliente padrão — o fetch por baixo dele pode ser cacheado pelo Next.js
 * (é isso que faz `unstable_cache` em src/lib/site/catalog.ts funcionar e
 * permite a home/categoria serem geradas estaticamente). Use este para
 * tudo que já passa por cache proposital ou não precisa de dado
 * segundo-a-segundo.
 */
export function getDb(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceRoleKey } = requireEnv();
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

let cachedFresh: SupabaseClient | null = null;

/**
 * Cliente sem cache — força `cache: "no-store"` no fetch. Necessário
 * porque o Next.js intercepta o fetch global e cacheia por URL: uma
 * consulta sem parâmetro que varie (ex: `link_checks?select=...&limit=300`)
 * fica presa pra sempre na primeira resposta, mesmo numa rota
 * `force-dynamic` (foi isso que deixou o /admin mostrando dado velho
 * depois de escrever no banco). Use só onde o dado tem que ser sempre o
 * mais recente possível (painel /admin, checagem de links) — nunca dentro
 * de código envolvido por `unstable_cache`, senão quebra a geração
 * estática (erro "Dynamic server usage: no-store fetch").
 */
export function getDbFresh(): SupabaseClient {
  if (cachedFresh) return cachedFresh;
  const { url, serviceRoleKey } = requireEnv();
  cachedFresh = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cachedFresh;
}
