import { gunzipSync } from "node:zlib";

/**
 * Cliente da Awin (rede de afiliados — Nike BR, Olympikus BR, Kabum BR
 * aprovados no publisher 2596713, ver CONTINUIDADE.md). Duas chaves
 * diferentes: AWIN_API_TOKEN (Bearer, API REST oficial — programmes/
 * promotions) e AWIN_DATAFEED_KEY (sistema legado separado de datafeed
 * de produto — é o único jeito real de listar produto/preço/link, a API
 * REST não expõe isso). Ver auditoria completa em CONTINUIDADE.md.
 */

const PUBLISHER_ID = "2596713";

export type AwinFeedInfo = {
  advertiserId: string;
  advertiserName: string;
  feedId: string;
  feedName: string;
  lastImported: string;
  productCount: number;
  downloadUrl: string;
};

/** Parser CSV mínimo mas correto (RFC4180: aspas, vírgula/aspas escapadas dentro de campo). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignora — \n cuida da quebra de linha
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length === header.length || r.some((v) => v !== "")).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
}

/** Lista todos os feeds de produto disponíveis (um por anunciante aprovado, às vezes mais de um). */
export async function listAwinFeeds(): Promise<AwinFeedInfo[]> {
  const datafeedKey = process.env.AWIN_DATAFEED_KEY;
  if (!datafeedKey) throw new Error("AWIN_DATAFEED_KEY não configurada");

  const resp = await fetch(`https://ui.awin.com/productdata-darwin-download/publisher/${PUBLISHER_ID}/${datafeedKey}/1/feedList`);
  if (!resp.ok) throw new Error(`feedList falhou: HTTP ${resp.status}`);
  const text = await resp.text();
  const rows = parseCsv(text);

  return rows
    .filter((r) => r["Membership Status"] === "active")
    .map((r) => ({
      advertiserId: r["Advertiser ID"],
      advertiserName: r["Advertiser Name"],
      feedId: r["Feed ID"],
      feedName: r["Feed Name"],
      lastImported: r["Last Imported"],
      productCount: Number(r["No of products"] || 0),
      downloadUrl: r["URL"],
    }));
}

/** Baixa e descompacta (gzip) um feed de produto, devolve as linhas já parseadas. */
export async function fetchFeedProducts(downloadUrl: string): Promise<Record<string, string>[]> {
  const resp = await fetch(downloadUrl);
  if (!resp.ok) throw new Error(`download do feed falhou: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const decompressed = gunzipSync(buf).toString("utf8");
  return parseCsv(decompressed);
}
