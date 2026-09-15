"use client";

import { useState } from "react";
import { ShareIcon } from "./icons";

/**
 * Compartilha o link da PÁGINA DO PRODUTO (não o link de afiliado direto)
 * — assim quem recebe cai no nosso site, vê o comparativo e o clique em
 * "Ver oferta" continua sendo rastreado normalmente. Usa a Web Share API
 * nativa (abre o seletor de apps do celular: WhatsApp, Instagram, SMS...);
 * sem suporte (a maioria dos desktops), cai pra copiar o link.
 */
export function ShareButton({ productName, className }: { productName: string; className?: string }) {
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

  return (
    <button type="button" className={className ?? "dc-share-btn"} onClick={handleShare}>
      <ShareIcon size={15} />
      {copied ? "Link copiado!" : "Compartilhar"}
    </button>
  );
}
