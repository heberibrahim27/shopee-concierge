"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevalidateLinksButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/revalidate-links", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setMessage("Não deu pra revalidar agora. Tenta de novo em instantes.");
        return;
      }
      setMessage(`Checados ${data.checked}: ${data.okCount} ok, ${data.brokenCount} com problema.`);
      router.refresh();
    } catch {
      setMessage("Não deu pra revalidar agora. Tenta de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
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
        {loading ? "Revalidando..." : "Revalidar agora"}
      </button>
      {message ? <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{message}</p> : null}
    </div>
  );
}
