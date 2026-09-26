/**
 * IndexNow -- protocolo aberto (Bing/Microsoft, também consumido por
 * outros buscadores participantes) pra avisar "essa URL mudou" sem
 * precisar de rastreamento periódico. Achado real (2026-09-26, sessão
 * de pesquisa com o ChatGPT sobre como sair de 4-6 pra 20 visitas/dia):
 * ajuda Bing, não o Google (que só é confirmável de verdade via Search
 * Console, pendência separada que depende da conta do Heber) -- mas é
 * grátis, sem aprovação de conta nenhuma, e o site já é novo o
 * suficiente pra qualquer sinal de descoberta valer a pena.
 *
 * A chave (`INDEXNOW_KEY`) não é secreta -- o próprio protocolo exige
 * publicá-la num arquivo em /<chave>.txt (ver public/) pra provar posse
 * do domínio, então não tem problema nenhum ela estar em código.
 *
 * Nunca deixa uma falha aqui quebrar quem chama -- é só um sinal a
 * mais pro buscador, nunca uma dependência real do site funcionar.
 */
const INDEXNOW_KEY = "56bf8bddb4a9590021649f08fd76d4ed";
const SITE_HOST = "descontochegando.com.br";
const SITE_URL = `https://${SITE_HOST}`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function submitToIndexNow(paths: string[]): Promise<void> {
  const urls = paths.map((path) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (urls.length === 0) return;

  try {
    await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
  } catch (err) {
    console.error("[indexnow] falha ao submeter (não bloqueia nada):", err);
  }
}
