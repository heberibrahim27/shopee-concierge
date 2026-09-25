"use client";

import { useEffect, useRef, useState } from "react";
import { TrackedOfferLink } from "./TrackedOfferLink";
import { AFFILIATE_LINK_REL } from "../../lib/site/affiliateLink";

/**
 * Achado real (2026-09-26, print do Heber): a barra fixa aparecia SEMPRE,
 * grudada embaixo da tela desde o carregamento -- em produto com foto
 * promocional alta (empurra o preço/botão normal pra perto do fim da
 * primeira tela), a barra fixa caía em cima do botão normal, parecendo
 * "Ver oferta" duplicado/bagunçado. Padrão real de e-commerce (Shopee,
 * Mercado Livre): a barra fixa só aparece depois que o botão de compra
 * normal sai da tela por scroll -- nunca os dois visíveis ao mesmo tempo.
 * `anchorId` é o id do botão normal na página; IntersectionObserver
 * decide a visibilidade.
 */
export function StickyBuyBar({
  price,
  href,
  platform,
  productSlug,
  productName,
  ctaLabel,
  anchorId,
}: {
  price: string;
  href: string;
  platform: string;
  productSlug: string;
  productName: string;
  ctaLabel: string;
  anchorId: string;
}) {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorId]);

  return (
    <div
      ref={barRef}
      className={`dc-sticky-buy-bar${visible ? " dc-sticky-buy-bar-visible" : ""}`}
    >
      <span className="dc-sticky-buy-bar-price">{price}</span>
      <TrackedOfferLink
        className="dc-sticky-buy-bar-cta"
        href={href}
        target="_blank"
        rel={AFFILIATE_LINK_REL}
        platform={platform}
        productSlug={productSlug}
        productName={productName}
        source="produto-sticky"
      >
        {ctaLabel}
      </TrackedOfferLink>
    </div>
  );
}
