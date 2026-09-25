"use client";

import { useState } from "react";

/**
 * Achado real 2026-09-25: no mobile, `.dc-header-nav` (Lojas Parceiras,
 * Cupons, Blog) fica escondido e a barra inferior só cobre Início/Buscar/
 * Favoritos/Categorias/WhatsApp -- essas 3 páginas ficavam inalcançáveis
 * a partir do cabeçalho no mobile (só via rodapé). O hambúrguer do mockup
 * não é só estética, resolve essa lacuna de verdade.
 */
interface NavItem {
  href: string;
  label: string;
}

export function MobileNavDrawer({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="dc-header-hamburger"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          {open ? (
            <path d="M5 5l14 14M19 5L5 19" />
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
      </button>
      {open ? (
        <div className="dc-mobile-drawer-backdrop" onClick={() => setOpen(false)}>
          <nav className="dc-mobile-drawer" aria-label="Navegação principal" onClick={(e) => e.stopPropagation()}>
            {items.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
