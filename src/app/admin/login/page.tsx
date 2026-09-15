"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Não foi possível entrar.");
        return;
      }
      router.push(params.get("from") || "/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15 }}
      />
      {error ? <p style={{ color: "#c23434", fontSize: 13, margin: 0 }}>{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !password}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "none",
          background: "#0a8a4a",
          color: "#fff",
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Painel Desconto Chegando</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
