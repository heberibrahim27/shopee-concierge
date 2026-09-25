/**
 * Intenção de cupom na busca (achado do Heber, 2026-09-26: pesquisar
 * "cupom" trazia só impressora de cupom -- a busca é de produto, e o
 * termo casa com o nome do produto). Detecta "cupom"/"cupons"/"voucher"/
 * "código de desconto" no termo e, se o resto citar uma loja com cupom
 * ativo ("cupom kabum", "cupons da shopee"), aponta pra ela.
 *
 * Funções puras; a página /busca resolve o diretório de lojas e passa.
 */
import { normalizeText } from "./couponRules";
import type { StoreEntry } from "./stores";

const INTENT_RE = /(^|[^a-z])(cupom|cupons|cupao|voucher|vouchers|codigo de desconto|codigos de desconto)([^a-z]|$)/;

export function hasCouponIntent(term: string): boolean {
  return INTENT_RE.test(normalizeText(term));
}

/** Loja citada no termo, entre as que têm cupom ativo. Compara slug e rótulo sem acento. */
export function findStoreInTerm(term: string, stores: StoreEntry[]): StoreEntry | null {
  const norm = normalizeText(term);
  const candidates = stores.filter((s) => s.couponCount > 0);
  for (const store of candidates) {
    const keys = [store.slug, normalizeText(store.label)].map((k) => k.replace(/[^a-z0-9]+/g, " ").trim());
    for (const key of keys) {
      if (key.length < 3) continue;
      const re = new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      if (re.test(norm.replace(/[^a-z0-9]+/g, " "))) return store;
    }
  }
  return null;
}
