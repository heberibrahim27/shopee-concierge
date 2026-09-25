"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BulbIcon } from "./icons";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Botão flutuante "Sugerir melhoria" -- pedido do Heber (2026-09-25): ele só
 * quer pensar e falar comigo, então até a busca de melhorias precisa ter
 * ideia entrando de gente de fora, não só da minha pesquisa. Qualquer
 * visitante pode mandar uma ideia sem cadastro; cai em `site_suggestions`
 * e entra na triagem do /loop de melhoria contínua.
 */
export function SuggestionWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  if (pathname?.startsWith("/admin")) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return;
    setStatus("sending");
    try {
      const resp = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, contact, pagePath: pathname }),
      });
      if (!resp.ok) throw new Error("falhou");
      setStatus("sent");
      setMessage("");
      setContact("");
      setTimeout(() => {
        setOpen(false);
        setStatus("idle");
      }, 2200);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        className="dc-suggestion-fab"
        onClick={() => setOpen(true)}
        aria-label="Sugerir uma melhoria"
      >
        <BulbIcon size={22} />
      </button>

      {open ? (
        <div className="dc-suggestion-overlay" onClick={() => setOpen(false)}>
          <div className="dc-suggestion-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Tem uma ideia pra melhorar o site?</h3>
            <p>Conta pra gente — toda sugestão é lida.</p>
            {status === "sent" ? (
              <p className="dc-suggestion-thanks">Valeu! Sua ideia foi enviada. 🙌</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ex: gostaria de filtrar por categoria de casa..."
                  rows={4}
                  maxLength={1000}
                  required
                />
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Seu WhatsApp ou e-mail (opcional)"
                  maxLength={200}
                />
                <div className="dc-suggestion-actions">
                  <button type="button" className="dc-suggestion-cancel" onClick={() => setOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="dc-suggestion-submit" disabled={status === "sending"}>
                    {status === "sending" ? "Enviando..." : "Enviar ideia"}
                  </button>
                </div>
                {status === "error" ? <p className="dc-suggestion-error">Não deu, tenta de novo.</p> : null}
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
