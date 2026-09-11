export default function StatusPage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Shopee Concierge</h1>
      <p>Serviço no ar. O webhook está em <code>/api/webhook/zapi</code>.</p>
      <p>
        Falta configurar as variáveis de ambiente (Shopee, Z-API, OpenAI) em
        Settings → Environment Variables neste projeto na Vercel, e apontar
        o webhook da instância Z-API pra essa URL.
      </p>
    </main>
  );
}
