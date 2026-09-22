"use client";

import { useState } from "react";

export function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Não deu pra trocar a senha agora.");
        return;
      }
      setSuccess(true);
      setNewPassword("");
      setConfirm("");
    } catch {
      setError("Não deu pra trocar a senha agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      <input
        type="password"
        placeholder="Nova senha (mín. 8 caracteres)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
      />
      <input
        type="password"
        placeholder="Confirmar nova senha"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
      />
      <button
        type="submit"
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
          alignSelf: "flex-start",
        }}
      >
        {loading ? "Trocando..." : "Trocar senha"}
      </button>
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>{error}</p> : null}
      {success ? <p style={{ margin: 0, fontSize: 12, color: "#0a8a4a" }}>Senha trocada com sucesso.</p> : null}
    </form>
  );
}
