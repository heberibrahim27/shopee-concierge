"use client";

/**
 * Link de afiliado (Shopee/Mercado Livre/etc) com registro de clique.
 * Dispara o beacon no exato momento do clique, sem atrasar ou bloquear a
 * navegação (o link abre normalmente mesmo se o registro falhar).
 */
export function TrackedOfferLink({
  href,
  platform,
  productSlug,
  productName,
  source,
  className,
  target,
  rel,
  id,
  children,
}: {
  href: string;
  platform: string;
  productSlug?: string | null;
  productName?: string | null;
  source: string;
  className?: string;
  target?: string;
  rel?: string;
  id?: string;
  children: React.ReactNode;
}) {
  function handleClick() {
    try {
      const payload = JSON.stringify({ platform, productSlug, productName, source });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track-click", blob);
    } catch {
      // silencioso — clique do usuário nunca pode ser bloqueado por isso
    }
  }

  return (
    <a id={id} href={href} target={target} rel={rel} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
