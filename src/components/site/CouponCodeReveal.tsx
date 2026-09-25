"use client";

import { useState } from "react";

/**
 * "Clique pra ver o código" — padrão de cuponeiro real (Cuponomia,
 * Promobit). Antes o código ficava escrito no card: quem copiava e ia
 * direto na loja comprava sem passar pelo nosso link, e a comissão
 * sumia. Agora o código só aparece DEPOIS do clique, e o mesmo clique:
 *
 *  1. registra o clique (mesmo beacon do TrackedOfferLink);
 *  2. abre a loja pelo link rastreado em nova aba — feito de forma
 *     síncrona dentro do handler, senão o bloqueador de pop-up segura;
 *  3. revela o código e tenta copiar pra área de transferência.
 *
 * A aba atual fica com o código visível e um link "Ir para a loja" de
 * novo, pra quem fechou a aba nova sem querer.
 */
export function CouponCodeReveal({
  code,
  href,
  platform,
  title,
}: {
  code: string;
  href: string;
  platform: string;
  title: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const masked = `${"•".repeat(Math.max(3, code.length - 2))}${code.slice(-2)}`;

  function trackClick() {
    try {
      const payload = JSON.stringify({ platform, productSlug: null, productName: title, source: "cupom" });
      navigator.sendBeacon("/api/track-click", new Blob([payload], { type: "application/json" }));
    } catch {
      // silencioso — clique do usuário nunca pode ser bloqueado por isso
    }
  }

  function handleReveal() {
    trackClick();
    window.open(href, "_blank", "noopener,noreferrer");
    setRevealed(true);
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  function handleCopy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  if (!revealed) {
    return (
      <>
        <div className="dc-coupon-code" aria-hidden="true">
          <span>Cupom</span>
          <strong className="dc-coupon-code-masked">{masked}</strong>
        </div>
        <button type="button" className="dc-coupon-cta dc-coupon-cta-button" onClick={handleReveal}>
          Ver cupom e ir pra loja
        </button>
      </>
    );
  }

  return (
    <>
      <div className="dc-coupon-code">
        <span>Cupom</span>
        <strong>{code}</strong>
        <button type="button" className="dc-coupon-copy" onClick={handleCopy}>
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      <a
        className="dc-coupon-cta"
        href={href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={trackClick}
      >
        Ir para a loja
      </a>
    </>
  );
}
