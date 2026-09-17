/**
 * `link_checks` grava um `ok` binário + o `status_code` cru — a UI antiga
 * tratava qualquer coisa != ok como "link morto", inclusive 403 (que
 * geralmente é bloqueio de bot/anti-scraping do marketplace pra requisição
 * automatizada, não prova que o link está quebrado pro cliente real). Essa
 * classificação é 100% derivada do `status_code` já salvo — não precisa de
 * coluna nova nem migration. Ver diagnóstico de 2026-09-16.
 */
export type LinkHealthKind = "ok" | "blocked" | "dead" | "timeout";

export interface LinkCheckLike {
  ok: boolean;
  status_code: number | null;
}

export function classifyLinkCheck(row: LinkCheckLike): LinkHealthKind {
  if (row.status_code === 403 || row.status_code === 401) return "blocked";
  if (row.status_code === 404 || row.status_code === 410) return "dead";
  if (row.ok) return "ok";
  return "timeout";
}

export const LINK_HEALTH_LABELS: Record<LinkHealthKind, string> = {
  ok: "OK",
  blocked: "Bloqueado (403)",
  dead: "Mortos (404/410)",
  timeout: "Timeout/erro",
};
