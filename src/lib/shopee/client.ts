/**
 * Cliente da Shopee Affiliate Open API (GraphQL).
 *
 * Lógica de assinatura e chamadas validada manualmente em 10/09/2026
 * via Open API Explorer V2 oficial da Shopee, com credenciais reais
 * (productOfferV2 e generateShortLink retornaram dados reais).
 *
 * NUNCA coloque SHOPEE_APP_ID / SHOPEE_SECRET direto no código.
 * Sempre via variável de ambiente (.env, não versionado).
 */
import crypto from "node:crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export interface ShopeeCredentials {
  appId: string;
  secret: string;
}

export function getShopeeCredentialsFromEnv(): ShopeeCredentials {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_SECRET;
  if (!appId || !secret) {
    throw new Error(
      "SHOPEE_APP_ID / SHOPEE_SECRET não configurados no ambiente (.env)."
    );
  }
  return { appId, secret };
}

/**
 * Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={sig}
 * sig = sha256_hex(AppId + Timestamp + Payload + Secret)
 * Payload = string exata do corpo JSON enviado (sem espaços extras).
 */
function buildAuthHeader(
  creds: ShopeeCredentials,
  payload: string
): { header: string; timestamp: string } {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const factor = creds.appId + timestamp + payload + creds.secret;
  const signature = crypto.createHash("sha256").update(factor, "utf8").digest("hex");
  return {
    header: `SHA256 Credential=${creds.appId}, Timestamp=${timestamp}, Signature=${signature}`,
    timestamp,
  };
}

export interface ShopeeGraphQLRequest {
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
}

export class ShopeeApiError extends Error {
  constructor(message: string, public readonly raw: unknown) {
    super(message);
  }
}

/**
 * Executa uma chamada GraphQL contra a Shopee Affiliate Open API.
 * Limite documentado: 8000 chamadas/hora por conta.
 */
export async function shopeeGraphQL<T>(
  req: ShopeeGraphQLRequest,
  creds: ShopeeCredentials = getShopeeCredentialsFromEnv()
): Promise<T> {
  const payload = JSON.stringify(req);
  const { header } = buildAuthHeader(creds, payload);

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: header,
    },
    body: payload,
  });

  const json = await resp.json();

  if (!resp.ok || json.errors) {
    throw new ShopeeApiError(
      `Shopee API respondeu com erro (status ${resp.status})`,
      json
    );
  }

  return json.data as T;
}
