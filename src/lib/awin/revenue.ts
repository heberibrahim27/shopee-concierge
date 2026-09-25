/**
 * Comissão real da Awin (Kabum/Nike/Olympikus) via `/transactions/` --
 * pergunta real do Heber 2026-09-25: "temos que colocar no nosso admin
 * se chegar comissão dela via API?". Testado ao vivo antes de escrever
 * esse arquivo: o endpoint funciona com o token atual (200, array vazio
 * nos últimos 30 dias -- sem venda confirmada ainda, não é erro).
 *
 * Limite real da API: no máximo 31 dias por chamada (erro 400 confirmado
 * ao testar um range maior) -- por isso os dois períodos (hoje/7 dias)
 * cabem numa chamada cada, sem paginação por data ainda necessária.
 */
const AWIN_API = "https://api.awin.com";
const PUBLISHER_ID = "2596713";

// IDs reais dos 3 programas que a conta tem hoje (confirmado via
// /publishers/{id}/programmes?relationship=joined em 2026-09-25).
const ADVERTISER_NAMES: Record<number, string> = {
  17652: "Nike",
  17698: "Olympikus",
  17729: "Kabum",
};

export interface AwinTransaction {
  id: number;
  advertiserId: number;
  advertiserName: string;
  commissionStatus: string;
  commissionAmount: number;
  saleAmount: number;
  transactionDate: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 19) + "+00:00";
}

export async function getAwinTransactions(startDate: Date, endDate: Date): Promise<AwinTransaction[]> {
  const token = process.env.AWIN_API_TOKEN;
  if (!token) return [];

  const url = `${AWIN_API}/publishers/${PUBLISHER_ID}/transactions/?startDate=${encodeURIComponent(
    fmtDate(startDate)
  )}&endDate=${encodeURIComponent(fmtDate(endDate))}&timezone=UTC`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    throw new Error(`Awin transactions falhou (${resp.status}): ${await resp.text()}`);
  }
  const rows: any[] = await resp.json();
  return rows.map((r) => ({
    id: r.id,
    advertiserId: r.advertiserId,
    advertiserName: ADVERTISER_NAMES[r.advertiserId] ?? `Awin #${r.advertiserId}`,
    commissionStatus: String(r.commissionStatus ?? "").toLowerCase(),
    commissionAmount: Number(r.commissionAmount?.amount ?? r.commissionAmount ?? 0),
    saleAmount: Number(r.saleAmount?.amount ?? r.saleAmount ?? 0),
    transactionDate: r.transactionDate,
  }));
}

export function summarizeAwinTransactions(rows: AwinTransaction[]) {
  const pending = rows.filter((r) => r.commissionStatus === "pending");
  const validated = rows.filter((r) => r.commissionStatus === "approved" || r.commissionStatus === "validated");
  const declined = rows.filter((r) => r.commissionStatus === "declined");
  return {
    pedidos: rows.length,
    comissaoPendente: pending.reduce((acc, r) => acc + r.commissionAmount, 0),
    comissaoValidada: validated.reduce((acc, r) => acc + r.commissionAmount, 0),
    comissaoRecusada: declined.reduce((acc, r) => acc + r.commissionAmount, 0),
  };
}
