"use client";

import { usePathname } from "next/navigation";
import { GridIcon, HeartIcon, HomeIcon, SearchIcon, WhatsAppIcon } from "./icons";
import { buildWhatsAppLink } from "./constants";

const ITEMS = [
  { href: "/", label: "Início", Icon: HomeIcon, exact: true },
  { href: "/busca", label: "Buscar", Icon: SearchIcon, exact: false },
  { href: "/favoritos", label: "Favoritos", Icon: HeartIcon, exact: false },
  { href: "/categorias", label: "Categorias", Icon: GridIcon, exact: false },
];

/**
 * Barra fixa só no mobile (escondida no desktop via CSS) — pílula branca
 * flutuante seguindo a referência (MENU.png), com o item da página atual
 * destacado em verde. Nada de "Perfil"/"Notificações" que exigiriam conta
 * de usuário, que não existe aqui.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="dc-bottom-nav" aria-label="Navegação principal">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname?.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            className={`dc-bottom-nav-item${active ? " dc-bottom-nav-item-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </a>
        );
      })}
      <a
        href={buildWhatsAppLink()}
        target="_blank"
        rel="noopener noreferrer"
        className="dc-bottom-nav-item"
      >
        <WhatsAppIcon size={21} />
        <span>WhatsApp</span>
      </a>
    </nav>
  );
}
