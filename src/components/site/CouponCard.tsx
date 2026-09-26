"use client";

import { useState } from "react";
import { SiteCoupon } from "../../lib/site/coupons";
import { getPlatformInfo, getAdvertiserLogo } from "../../lib/site/platforms";
import { AFFILIATE_LINK_REL } from "../../lib/site/affiliateLink";
import { describeRule, isAwinOpenEnded, parseCouponRule } from "../../lib/site/couponRules";
import { ShareButton } from "./ShareButton";

function formatEndsAt(iso: string | null, fetchedAt: string | null): string | null {
  if (!iso) return null;
  // Marcador da Awin pra campanha sem fim (busca + 366 dias) não é
  // validade -- ver isAwinOpenEnded. Validade real distante continua
  // aparecendo.
  if (isAwinOpenEnded(iso, fetchedAt)) return null;
  return `Válido até ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

/** fetched_at é a última atualização pela integração -- não prova uso no checkout, por isso "Atualizado", não "Conferido". */
function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `Atualizado em ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}

async function sendFeedback(couponId: string, worked: boolean): Promise<void> {
  try {
    await fetch("/api/coupon-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId, worked }),
    });
  } catch {
    // silencioso
  }
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
  const [voted, setVoted] = useState<null | boolean>(null);
  const rule = parseCouponRule({ title: coupon.title, description: coupon.description, code: coupon.code });
  const ruleLine = describeRule(rule);
  const endsLabel = formatEndsAt(coupon.endsAt, coupon.fetchedAt);
  const checkedLabel = formatUpdatedAt(coupon.fetchedAt);
  const validityNote =
    !endsLabel && (rule.validityUnknown || isAwinOpenEnded(coupon.endsAt, coupon.fetchedAt))
      ? "validade não informada pela loja"
      : null;
  // "lomadee" é o valor genérico gravado quando a marca não foi resolvida
  // na ingestão — nesse caso o nome do anunciante é o rótulo certo, não
  // o nome da rede de afiliados.
  const info = coupon.platform && coupon.platform !== "lomadee" ? getPlatformInfo(coupon.platform) : null;
  // Achado real (2026-09-25, Heber: "cupons pode usar a logo da loja igual
  // ao cuponomia"): logo baixada direto do site oficial da loja (ver
  // platforms.ts) -- primeiro tenta pela plataforma (Shopee/Kabum/Nike/
  // Olympikus), depois pelo nome do anunciante (lojas Lomadee, ex.
  // Malwee). Sem logo baixada ainda, cai no badge de texto+cor de sempre.
  const logo = info?.logoUrl
    ? { logoUrl: info.logoUrl, logoBg: info.logoBg }
    : getAdvertiserLogo(coupon.advertiserName);

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
      <div className="dc-coupon-store">
        {logo ? (
          <span className="dc-coupon-store-logo" style={logo.logoBg ? { background: logo.logoBg } : undefined}>
            <img src={logo.logoUrl} alt="" loading="lazy" />
          </span>
        ) : null}
        {info ? (
          <span
            className={logo ? "dc-coupon-store-name" : "dc-coupon-badge"}
            style={logo ? undefined : { background: info.color, color: info.textColor }}
          >
            {info.label}
          </span>
        ) : (
          <span className={logo ? "dc-coupon-store-name" : "dc-coupon-badge"}>{coupon.advertiserName}</span>
        )}
        <ShareButton productName={`Cupom ${coupon.advertiserName}: ${coupon.title}`} compact />
      </div>
      <p className="dc-coupon-title">{coupon.title}</p>
      {ruleLine ? <p className="dc-coupon-rule">{ruleLine}</p> : null}
      {coupon.description ? <p className="dc-coupon-description">{coupon.description}</p> : null}
      {endsLabel || validityNote || checkedLabel ? (
        <p className="dc-coupon-ends">{[endsLabel, validityNote, checkedLabel].filter(Boolean).join(" · ")}</p>
      ) : null}

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
            <>
              <a
                className="dc-coupon-cta"
                href={coupon.urlTracking}
                target="_blank"
                rel={AFFILIATE_LINK_REL}
                onClick={() => trackCouponClick(coupon)}
              >
                Ir para a loja →
              </a>
              <div className="dc-coupon-vote">
                {voted === null ? (
                  <>
                    <span>O cupom funcionou?</span>
                    <button type="button" onClick={() => { setVoted(true); void sendFeedback(coupon.id, true); }}>
                      Sim
                    </button>
                    <button type="button" onClick={() => { setVoted(false); void sendFeedback(coupon.id, false); }}>
                      Não
                    </button>
                  </>
                ) : (
                  <span>{voted ? "Valeu! Isso ajuda quem vem depois." : "Obrigado por avisar — vamos conferir."}</span>
                )}
              </div>
            </>
          ) : (
            <button type="button" className="dc-coupon-cta" onClick={handleReveal}>
              Revelar cupom
            </button>
          )}
        </>
      ) : (
        <>
          {/* Achado real (Heber, 2026-09-25: "cliquei e abriu vários
              produtos, onde aparece o cupom? o cliente precisa saber
              quando for usar"): promoção sem código (Shopee
              shopeeOfferV2) não é cupom de checkout -- é link pra uma
              vitrine de categoria já em promoção, desconto já aplicado
              no preço. Sem esse aviso, "Aproveitar" sozinho sugeria um
              código que não existe. */}
          <p className="dc-coupon-no-code-note">Sem código — o desconto já vem aplicado no preço dos produtos dessa promoção.</p>
          <a
            className="dc-coupon-cta"
            href={coupon.urlTracking}
            target="_blank"
            rel={AFFILIATE_LINK_REL}
            onClick={() => trackCouponClick(coupon)}
          >
            Aproveitar
          </a>
        </>
      )}
    </div>
  );
}
