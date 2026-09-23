"use client";

import { useEffect, useState } from "react";

type PendingPick = {
  id: string;
  title: string;
  product_url: string;
  current_price: number | null;
  category_slug: string | null;
  value_score: number | null;
};

// Painel manual da metade do fluxo de Mercado Livre que não tem API
// (Heber, 2026-09-24: "então jogue duro" — construído depois de
// confirmar ao vivo na conta real que o gerador de link da própria ML
// não tem atalho programático). O cron semanal (mercadolivre-discovery)
// já descobre e enfileira sozinho; aqui só falta colar o resultado do
// gerador de volta — leva uns 2 minutos quando tem pendência.
export function MercadoLivrePendingPanel() {
  const [pending, setPending] = useState<PendingPick[] | null>(null);
  const [pastedLinks, setPastedLinks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ingeridos: string[]; falhas: Array<{ pickId: string; erro: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/admin/mercadolivre-pending");
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setPending(data.pending);
    } catch {
      // silencioso — painel secundário, não trava o resto do admin
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCopyUrls() {
    if (!pending || pending.length === 0) return;
    const text = pending.map((p) => p.product_url).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não deu pra copiar automaticamente — copie manualmente a lista abaixo.");
    }
  }

  async function handleSubmit() {
    if (!pending || pending.length === 0) return;
    const links = pastedLinks.split("\n").map((l) => l.trim()).filter(Boolean);
    if (links.length !== pending.length) {
      setError(`Colou ${links.length} link(s), mas tem ${pending.length} pendência(s) — precisa ser um link por linha, na mesma ordem das URLs que você copiou.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/mercadolivre-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickIds: pending.map((p) => p.id), links }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Não deu pra processar agora.");
        return;
      }
      setResult({ ingeridos: data.ingeridos, falhas: data.falhas });
      setPastedLinks("");
      await load();
    } catch {
      setError("Não deu pra processar agora.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pending === null) return null;
  if (pending.length === 0) {
    return <p style={{ fontSize: 13, color: "#666" }}>Nenhuma pendência de Mercado Livre no momento.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
      <p style={{ margin: 0, fontSize: 13 }}>
        {pending.length} produto(s) achado(s) na varredura semanal, esperando gerar o link de afiliado.
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#444", maxHeight: 160, overflowY: "auto" }}>
        {pending.map((p) => (
          <li key={p.id}>
            [{p.category_slug}] {p.title} — R$ {p.current_price?.toFixed(2).replace(".", ",")}
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleCopyUrls}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #3483fa", background: "#fff", color: "#3483fa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          1. Copiar URLs pro gerador
        </button>
        {copied ? <span style={{ fontSize: 12, color: "#0a8a4a" }}>Copiado!</span> : null}
        <a
          href="https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "#3483fa" }}
        >
          Abrir gerador →
        </a>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
        2. Cole as URLs no gerador, clique Gerar, e cole os links <code>meli.la</code> resultantes aqui embaixo — um por linha, na mesma ordem.
      </p>
      <textarea
        value={pastedLinks}
        onChange={(e) => setPastedLinks(e.target.value)}
        placeholder={"https://meli.la/xxxxx\nhttps://meli.la/yyyyy\n..."}
        rows={6}
        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontFamily: "monospace", fontSize: 12 }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #0a8a4a",
          background: submitting ? "#e9f5ef" : "#fff",
          color: "#0a8a4a",
          fontWeight: 700,
          fontSize: 13,
          cursor: submitting ? "wait" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {submitting ? "Processando..." : "3. Finalizar"}
      </button>
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>{error}</p> : null}
      {result ? (
        <div style={{ fontSize: 12 }}>
          <p style={{ margin: 0, color: "#0a8a4a" }}>{result.ingeridos.length} produto(s) ingerido(s) com sucesso.</p>
          {result.falhas.length > 0 ? (
            <p style={{ margin: 0, color: "#c0392b" }}>{result.falhas.length} falharam: {result.falhas.map((f) => f.erro).join("; ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
