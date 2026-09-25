"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Captura de e-mail própria -- Fase 1 do plano de receita (ver memória
 * project_business_plan_artifact): audiência que não depende de cota de
 * rede social. Ainda não envia nada (Resend não conectado), só coleta.
 */
export function EmailCapture() {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const resp = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sourcePage: pathname }),
      });
      if (!resp.ok) throw new Error("falhou");
      setStatus("sent");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="dc-email-capture dc-email-capture-thanks">
        Valeu! Você vai receber os melhores achados no seu e-mail. 🙌
      </div>
    );
  }

  return (
    <form className="dc-email-capture" onSubmit={handleSubmit}>
      <p>📬 Receba os melhores achados no seu e-mail, sem enrolação.</p>
      <div className="dc-email-capture-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "..." : "Quero receber"}
        </button>
      </div>
      {status === "error" ? <span className="dc-email-capture-error">Não deu, tenta de novo.</span> : null}
    </form>
  );
}
