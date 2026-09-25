"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type Status = "idle" | "open" | "sending" | "sent" | "error";

/**
 * "Me avisa no WhatsApp quando baixar" — formulário da página de produto.
 * Fechado por padrão (um botão discreto embaixo do CTA de compra); abre
 * com telefone + preço-alvo já sugerido (10% abaixo do preço atual). Grava
 * via /api/price-alert; o cron diário faz o resto. Sem conta, sem login.
 */
export function PriceAlertForm({
  productSlug,
  currentPrice,
}: {
  productSlug: string;
  currentPrice: number | null;
}) {
  const pathname = usePathname();
  const suggested = currentPrice ? Math.max(1, Math.floor(currentPrice * 0.9)) : "";
  const [status, setStatus] = useState<Status>("idle");
  const [phone, setPhone] = useState("");
  const [target, setTarget] = useState<string>(String(suggested));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const resp = await fetch("/api/price-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug, phone, targetPrice: Number(target), sourcePage: pathname }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(typeof data?.error === "string" ? data.error : "não deu certo, tenta de novo");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("não deu certo, tenta de novo");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="dc-price-alert dc-price-alert-done">
        🔔 Alerta criado! Te avisamos no WhatsApp quando ficar por R${target} ou menos.
      </div>
    );
  }

  if (status === "idle") {
    return (
      <button type="button" className="dc-price-alert-toggle" onClick={() => setStatus("open")}>
        🔔 Me avisa no WhatsApp quando baixar
      </button>
    );
  }

  return (
    <form className="dc-price-alert" onSubmit={handleSubmit}>
      <p>Avisamos uma vez, só quando o preço chegar no seu alvo. Sem cadastro.</p>
      <label className="dc-price-alert-field">
        <span>Seu WhatsApp</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="(11) 99999-9999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className="dc-price-alert-field">
        <span>Me avisa se baixar de R$</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="0.01"
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </label>
      {error ? <span className="dc-price-alert-error">{error}</span> : null}
      <div className="dc-price-alert-actions">
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Salvando…" : "Criar alerta"}
        </button>
        <button type="button" className="dc-price-alert-cancel" onClick={() => setStatus("idle")}>
          Agora não
        </button>
      </div>
    </form>
  );
}
