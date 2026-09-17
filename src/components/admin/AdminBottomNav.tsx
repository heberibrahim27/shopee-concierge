"use client";

import { usePathname } from "next/navigation";
import { ChartIcon, DashboardIcon, MoreIcon, PackageIcon, SwapIcon } from "./icons";

const ITEMS = [
  { href: "/admin", label: "Visão geral", Icon: DashboardIcon, exact: true },
  { href: "/admin/produtos", label: "Produtos", Icon: PackageIcon, exact: false },
  { href: "/admin/comparacoes", label: "Comparações", Icon: SwapIcon, exact: false },
  { href: "/admin/analytics", label: "Analytics", Icon: ChartIcon, exact: false },
  { href: "/admin/mais", label: "Mais", Icon: MoreIcon, exact: false },
];

export function AdminBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="dc-admin-bottom-nav" aria-label="Navegação do painel">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname?.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            className={`dc-admin-bottom-nav-item${active ? " dc-admin-bottom-nav-item-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
