"use client";

import { useState } from "react";

type ReadyResult = {
  productName: string;
  productPhotoUrl: string | null;
  priceMin: number | null;
  affiliateLink: string | null;
  script: { hookText: string | null; spokenText: string | null; onScreenText: string | null; ctaText: string | null };
  videoPrompt: string;
  creativeDirection: { archetype: string; hookStrategy: string; narrativeStructure: string; visualApproach: string };
  demandSignal: { categorySlug: string; distinctSearchers: number; sampleProductNames: string[] } | null;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navegadores sem permissão de clipboard (raro em https/localhost) — fallback via textarea temporário
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        // sem fallback funcional — usuário ainda pode selecionar manualmente
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #0a8a4a",
        background: copied ? "#0a8a4a" : "#fff",
        color: copied ? "#fff" : "#0a8a4a",
        fontWeight: 600,
        fontSize: 11,
        cursor: "pointer",
      }}
    >
      {copied ? "Copiado! ✓" : label}
    </button>
  );
}

function PrepareImageButton({ imageUrl }: { imageUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prepare-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Não deu pra preparar a foto agora.");
        return;
      }
      setDataUrl(data.dataUrl);
    } catch {
      setError("Não deu pra preparar a foto agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "5px 10px",
          borderRadius: 6,
          border: "1px solid #7b3fe4",
          background: loading ? "#f1ebfc" : "#fff",
          color: "#7b3fe4",
          fontWeight: 600,
          fontSize: 11,
          cursor: loading ? "wait" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {loading ? "Limpando foto pro Flow..." : "🧼 Preparar foto pro Flow"}
      </button>
      {error ? <p style={{ margin: 0, fontSize: 11, color: "#c0392b" }}>{error}</p> : null}
      {dataUrl ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt="Foto preparada pro Flow" style={{ width: "100%", maxWidth: 280, borderRadius: 8, border: "1px solid #eee" }} />
          <a href={dataUrl} download="produto-flow.png" style={{ fontSize: 12, color: "#7b3fe4", fontWeight: 600, textDecoration: "none" }}>
            ⬇️ Baixar foto preparada
          </a>
        </div>
      ) : null}
    </div>
  );
}

function CandidateCard({ result }: { result: ReadyResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid #eee", borderRadius: 10, padding: 14, maxWidth: 520 }}>
      {result.demandSignal && result.demandSignal.distinctSearchers > 0 ? (
        <div style={{ background: "#e9f5ef", border: "1px solid #0a8a4a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#0a8a4a", fontWeight: 600 }}>
          🔥 Escolhido por demanda real: {result.demandSignal.distinctSearchers} pessoas procuraram algo parecido no WhatsApp nas últimas 48h
        </div>
      ) : result.demandSignal ? (
        <div style={{ background: "#f1ebfc", border: "1px solid #7b3fe4", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7b3fe4", fontWeight: 600 }}>
          🔎 Filtro manual: categoria &quot;{result.demandSignal.categorySlug}&quot;
        </div>
      ) : null}
      <strong style={{ fontSize: 14 }}>{result.productName}</strong>
      {result.priceMin != null ? <span style={{ fontSize: 12, color: "#666" }}>Preço: R$ {result.priceMin.toFixed(2)}</span> : null}
      {result.productPhotoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.productPhotoUrl} alt={result.productName} style={{ width: "100%", maxWidth: 280, borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a
              href={`/api/admin/video-machine-run/photo?url=${encodeURIComponent(result.productPhotoUrl)}`}
              style={{ fontSize: 12, color: "#0a8a4a", fontWeight: 600, textDecoration: "none" }}
            >
              ⬇️ Baixar foto original
            </a>
          </div>
          <PrepareImageButton imageUrl={result.productPhotoUrl} />
        </>
      ) : (
        <span style={{ fontSize: 12, color: "#999" }}>Sem foto do produto disponível.</span>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Link de afiliado</div>
        {result.affiliateLink ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
            <p style={{ margin: 0, fontSize: 13, wordBreak: "break-all" }}>🔗 {result.affiliateLink}</p>
            <CopyButton text={result.affiliateLink} label="Copiar link" />
          </div>
        ) : (
          <p style={{ margin: "4px 0", fontSize: 12, color: "#999" }}>Sem link de afiliado disponível pra esse produto.</p>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Direção criativa</div>
        <div style={{ fontSize: 12 }}>
          {result.creativeDirection.archetype} · {result.creativeDirection.hookStrategy} · {result.creativeDirection.visualApproach}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Roteiro</div>
        {result.script.spokenText ? <p style={{ margin: "4px 0", fontSize: 13 }}>🗣️ {result.script.spokenText}</p> : null}
        {result.script.onScreenText ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
            <p style={{ margin: 0, fontSize: 13 }}>📝 {result.script.onScreenText}</p>
            <CopyButton text={result.script.onScreenText} label="Copiar texto" />
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Prompt de vídeo (colar na ferramenta externa)</div>
          <CopyButton text={result.videoPrompt} label="Copiar prompt" />
        </div>
        <textarea
          readOnly
          value={result.videoPrompt}
          style={{ width: "100%", minHeight: 260, fontSize: 13, lineHeight: 1.5, fontFamily: "-apple-system, system-ui, sans-serif", padding: 10, borderRadius: 8, border: "1px solid #ddd", whiteSpace: "pre-wrap", resize: "vertical" }}
          onFocus={(e) => e.target.select()}
        />
      </div>
    </div>
  );
}

export function VideoMachineRunButton() {
  const [count, setCount] = useState(5);
  const [categorySlug, setCategorySlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ReadyResult[] | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResults(null);
    setFailedCount(0);
    // Achado real (2026-09-22): sem isso, uma conexão que trava/cai sem
    // erro claro deixava a tela "carregando" pra sempre (o Heber ficou
    // 30min esperando um lote grande demais pro teto de 300s do
    // servidor). Aborta um pouco antes do teto do servidor, sempre com
    // mensagem clara em vez de travar sem aviso.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 280_000);
    try {
      const res = await fetch("/api/admin/video-machine-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, categorySlug: categorySlug.trim() || undefined }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.errorCode ? `Parou na etapa "${data.stage}": ${data.errorCode}` : "Não deu pra rodar agora. Tenta de novo em instantes.");
        return;
      }
      setResults(data.results);
      setFailedCount(data.failedCount ?? 0);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "Demorou demais e travou (mais de 4,5min). Tenta com um número menor de candidatos."
          : "Não deu pra rodar agora. Tenta de novo em instantes."
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 12, color: "#555" }}>
          Quantos candidatos:{" "}
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            style={{ width: 50, padding: "3px 6px", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ fontSize: 12, color: "#555" }}>
          Categoria:{" "}
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">Qualquer</option>
            <option value="brinquedos">Brinquedos</option>
            <option value="casa">Casa</option>
            <option value="eletronicos">Eletrônicos</option>
            <option value="ferramentas">Ferramentas</option>
            <option value="beleza">Beleza</option>
            <option value="moda">Moda</option>
            <option value="infantil">Infantil</option>
            <option value="esporte">Esporte</option>
            <option value="automotivo">Automotivo</option>
            <option value="saude">Saúde</option>
            <option value="pet">Pet</option>
            <option value="games">Games</option>
            <option value="papelaria">Papelaria</option>
            <option value="bebes">Bebês</option>
            <option value="alimentos">Alimentos</option>
            <option value="moveis">Móveis</option>
            <option value="viagem">Viagem</option>
            <option value="livros">Livros</option>
          </select>
        </label>
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
          {loading ? "Gerando candidatos..." : "Iniciar Máquina de Vídeos"}
        </button>
      </div>

      {error ? <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>{error}</p> : null}

      {results ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <span style={{ fontSize: 12, color: "#666" }}>
            {results.length} candidato{results.length === 1 ? "" : "s"} pronto{results.length === 1 ? "" : "s"}
            {failedCount > 0 ? ` (${failedCount} não deu pra gerar, sem candidato elegível no momento)` : ""}.
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {results.map((result, i) => (
              <CandidateCard key={i} result={result} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
