/**
 * Cliente mínimo pra API v5 do Pinterest -- sem SDK, só fetch.
 *
 * Token: vem do login OAuth salvo em `pinterest_auth` (auth.ts, renova
 *    sozinho) ou, sem login, de PINTEREST_ACCESS_TOKEN (token de sandbox).
 * Env:
 *  - PINTEREST_BOARD_ID      (board de destino dos Pins)
 *  - PINTEREST_API_BASE      (opcional; default produção. Com acesso Trial
 *    use https://api-sandbox.pinterest.com/v5 -- Pins de sandbox não são
 *    públicos, só validam a integração)
 */
import { getValidAccessToken } from "./auth";

const DEFAULT_BASE = "https://api.pinterest.com/v5";

function base(): string {
  return (process.env.PINTEREST_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

async function pinterestFetch(path: string, init: RequestInit = {}): Promise<any> {
  const resp = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await getValidAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* corpo não-JSON, cai no erro abaixo se !ok */
  }
  if (!resp.ok) {
    throw new Error(`Pinterest ${init.method ?? "GET"} ${path} -> ${resp.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy?: string;
}

export async function listBoards(): Promise<PinterestBoard[]> {
  const json = await pinterestFetch("/boards?page_size=100");
  return (json?.items ?? []).map((b: any) => ({ id: String(b.id), name: b.name, privacy: b.privacy }));
}

export interface CreatePinInput {
  boardId: string;
  title: string; // máx 100
  description: string; // máx 800
  link: string; // máx 2048 -- destino do clique
  imageUrl: string; // https público
  altText?: string; // máx 500
}

export async function createPin(input: CreatePinInput): Promise<{ pinId: string }> {
  const json = await pinterestFetch("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: input.boardId,
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 800),
      link: input.link,
      alt_text: (input.altText ?? input.title).slice(0, 500),
      media_source: { source_type: "image_url", url: input.imageUrl },
    }),
  });
  if (!json?.id) throw new Error(`Pinterest createPin sem id na resposta: ${JSON.stringify(json).slice(0, 300)}`);
  return { pinId: String(json.id) };
}
