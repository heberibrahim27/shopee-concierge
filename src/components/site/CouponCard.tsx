"use client";

import { useState } from "react";
import { SiteCoupon } from "../../lib/site/coupons";
import { getPlatformInfo } from "../../lib/site/platforms";
import { AFFILIATE_LINK_REL } from "../../lib/site/affiliateLink";

function formatEndsAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `Válido até ${date.toLocaleDateString("pt-BR")}`;
}

function trackCouponClick(coupon: SiteCoupon) {
  try {
    const payload = JSON.stringify({
      platform: coupon.platform ?? "awin",
      productName: coupon.title,
      source: "cupom",
    });
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/track-click", blob);
  } catch {
    // silencioso — clique do usuário nunca pode ser bloqueado por isso
  }
}

/**
 * Fluxo de revelar/copiar (achado real 2026-09-25 pesquisando Cuponomia —
 * ver memória project_competitor_cuponomia_coupon_ux): nenhum concorrente
 * real consegue auto-aplicar cupom no carrinho de outra loja, o padrão da
 * indústria é revelar + copiar pro clipboard, e só DEPOIS ir pra loja (não
 * no mesmo clique -- senão a aba já mudou antes da pessoa conseguir ver o
 * código).
 */
export function CouponCard({ coupon }: { coupon: SiteCoupon }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  // "lomadee" é o valor genérico gravado quando a marca não foi resolvida
  // na ingestão — nesse caso o nome do anunciante é o rótulo certo, não
  // o nome da rede de afiliados.
  const info = coupon.platform && coupon.platform !== "lomadee" ? getPlatformInfo(coupon.platform) : null;
  const endsLabel = formatEndsAt(coupon.endsAt);

  function handleReveal() {
    setRevealed(true);
    trackCouponClick(coupon);
    if (coupon.code && navigator.clipboard) {
      navigator.clipboard.writeText(coupon.code).then(
        () => setCopied(true),
        () => {}
      );
    }
  }

  return (
    <div className="dc-coupon-card">
      {info ? (
        <span className="dc-coupon-badge" style={{ background: info.color, color: info.textColor }}>
          {info.label}
        </span>
      ) : (
        <span className="dc-coupon-badge">{coupon.advertiserName}</span>
      )}
      <p className="dc-coupon-title">{coupon.title}</p>
      {coupon.description ? <p className="dc-coupon-description">{coupon.description}</p> : null}
      {endsLabel ? <p className="dc-coupon-ends">{endsLabel}</p> : null}

      {coupon.code ? (
        <>
          <div className="dc-coupon-code">
            <span>Cupom</span>
            <strong className={revealed ? "" : "dc-coupon-code-masked"}>
              {revealed ? coupon.code : "•".repeat(Math.max(coupon.code.length, 6))}
            </strong>
            {copied ? <span className="dc-coupon-copied">Copiado!</span> : null}
          </div>
          {revealed ? (
            <a
              className="dc-coupon-cta"
              href={coupon.urlTracking}
              target="_blank"
              rel={AFFILIATE_LINK_REL}
              onClick={() => trackCouponClick(coupon)}
            >
              Ir para a loja →
            </a>
          ) : (
            <button type="button" className="dc-coupon-cta" onClick={handleReveal}>
              Revelar cupom
            </button>
          )}
        </>
      ) : (
        <a
          className="dc-coupon-cta"
          href={coupon.urlTracking}
          target="_blank"
          rel={AFFILIATE_LINK_REL}
          onClick={() => trackCouponClick(coupon)}
        >
          Aproveitar
        </a>
      )}
    </div>
  );
}
