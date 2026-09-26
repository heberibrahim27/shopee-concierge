"use client";

import { useState } from "react";
import { ShareIcon } from "./icons";

/**
 * Compartilha o link da PÁGINA atual (produto, cupom por loja...) — não
 * o link de afiliado direto, assim quem recebe cai no nosso site, vê o
 * comparativo/regra e o clique em "Ver oferta" continua sendo rastreado
 * normalmente. Usa a Web Share API nativa (abre o seletor de apps do
 * celular: WhatsApp, Instagram, SMS...); sem suporte (a maioria dos
 * desktops), cai pra copiar o link.
 *
 * `compact` (2026-09-25, Heber: "seria bom um botão de compartilhar o
 * cupom?"): variante só-ícone, pra caber no cabeçalho do CouponCard sem
 * brigar de espaço com logo+nome da loja -- o botão original (com texto)
 * continua igual na página de produto.
 */
export function ShareButton({
  productName,
  className,
  compact = false,
}: {
  productName: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare(event: React.MouseEvent) {
    event.preventDefault();
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: productName, url });
      } catch {
        // usuário cancelou o compartilhamento — não é erro
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sem clipboard disponível — nada a fazer, botão só não reage
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        className={className ?? "dc-share-btn-icon"}
        onClick={handleShare}
        title={copied ? "Link copiado!" : "Compartilhar"}
        aria-label="Compartilhar"
      >
        <ShareIcon size={14} />
      </button>
    );
  }

  return (
    <button type="button" className={className ?? "dc-share-btn"} onClick={handleShare}>
      <ShareIcon size={15} />
      {copied ? "Link copiado!" : "Compartilhar"}
    </button>
  );
}
