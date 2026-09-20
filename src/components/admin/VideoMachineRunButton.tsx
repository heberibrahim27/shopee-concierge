"use client";

import { useState } from "react";

type ReadyResult = {
  productName: string;
  productPhotoUrl: string | null;
  priceMin: number | null;
  script: { hookText: string | null; spokenText: string | null; onScreenText: string | null; ctaText: string | null };
  videoPrompt: string;
  creativeDirection: { archetype: string; hookStrategy: string; narrativeStructure: string; visualApproach: string };
};

export function VideoMachineRunButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadyResult | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/video-machine-run", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.errorCode ? `Parou na etapa "${data.stage}": ${data.errorCode}` : "Não deu pra rodar agora. Tenta de novo em instantes.");
        return;
      }
      setResult(data.result);
    } catch {
      setError("Não deu pra rodar agora. Tenta de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #0a8a4a",
          background: loading ? "#e9f5ef" : "#fff",
          color: "#0a8a4a",
          fontWeight: 700,
          fontSize: 13,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Gerando roteiro + prompt..." : "Iniciar Máquina de Vídeos"}
      </button>

      {error ? <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>{error}</p> : null}

      {result ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid #eee", borderRadius: 10, padding: 14, maxWidth: 520 }}>
          <strong style={{ fontSize: 14 }}>{result.productName}</strong>
          {result.priceMin != null ? <span style={{ fontSize: 12, color: "#666" }}>Preço: R$ {result.priceMin.toFixed(2)}</span> : null}
          {result.productPhotoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.productPhotoUrl} alt={result.productName} style={{ width: "100%", maxWidth: 280, borderRadius: 8 }} />
              <a
                href={`/api/admin/video-machine-run/photo?url=${encodeURIComponent(result.productPhotoUrl)}`}
                style={{ fontSize: 12, color: "#0a8a4a", fontWeight: 600, textDecoration: "none" }}
              >
                ⬇️ Baixar foto
              </a>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#999" }}>Sem foto do produto disponível.</span>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Direção criativa</div>
            <div style={{ fontSize: 12 }}>
              {result.creativeDirection.archetype} · {result.creativeDirection.hookStrategy} · {result.creativeDirection.visualApproach}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Roteiro</div>
            {result.script.spokenText ? <p style={{ margin: "4px 0", fontSize: 13 }}>🗣️ {result.script.spokenText}</p> : null}
            {result.script.onScreenText ? <p style={{ margin: "4px 0", fontSize: 13 }}>📝 {result.script.onScreenText}</p> : null}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Prompt de vídeo (colar na ferramenta externa)</div>
            <textarea
              readOnly
              value={result.videoPrompt}
              style={{ width: "100%", minHeight: 260, fontSize: 13, lineHeight: 1.5, fontFamily: "-apple-system, system-ui, sans-serif", padding: 10, borderRadius: 8, border: "1px solid #ddd", whiteSpace: "pre-wrap", resize: "vertical" }}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
