/**
 * Status técnico do bot (era a home antiga, em "/"). Movida pra cá quando
 * "/" passou a ser o site público — ver ARQUITETURA-SITE.md. Uso interno
 * (checar rapidamente que o serviço subiu); /api/health é a checagem real.
 */
export const metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Shopee Concierge</h1>
      <p>
        Serviço no ar. O webhook está em <code>/api/webhook/zapi</code>, a
        checagem de saúde em <code>/api/health</code>.
      </p>
      <p>
        Falta configurar as variáveis de ambiente (Shopee, Z-API, OpenAI) em
        Settings → Environment Variables neste projeto na Vercel, e apontar
        o webhook da instância Z-API pra essa URL.
      </p>
    </main>
  );
}
