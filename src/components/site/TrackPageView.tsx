"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Dispara um registro de visualização de página a cada navegação —
 * montado uma vez no layout raiz. Usa sendBeacon (não bloqueia, não
 * atrasa nada, funciona mesmo se o usuário sair da página logo em
 * seguida). Nunca lança erro pro resto do app.
 */
export function TrackPageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/admin")) return;
    try {
      const payload = JSON.stringify({ path: pathname });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/track-view", blob);
    } catch {
      // silencioso — estatística nunca pode quebrar a navegação
    }
  }, [pathname]);

  return null;
}
