import { Logo } from "./Logo";
import { PLATFORM_INFO } from "../../lib/site/platforms";
import { BellIcon, SearchIcon } from "./icons";

/**
 * Lojas que o comparador realmente já traz dado real. As outras aparecem
 * apagadas com "em breve": mostra pra onde o produto está indo sem fingir
 * que já compara com elas (nenhuma delas tem link, de propósito).
 */
const AVAILABLE_PLATFORMS = ["shopee", "nike", "olympikus"];

/**
 * Menu de navegação real no desktop (achado real 2026-09-25: não
 * existia NENHUM link de navegação além do logo -- Lojas Parceiras,
 * Blog (guias) e Cupons só eram alcançáveis via rodapé/URL direta,
 * pedido do Heber pra ficar mais parecido com um comparador "padrão").
 * Some no mobile (BottomNav já cobre isso).
 */
const NAV_ITEMS = [
  { href: "/", label: "Início" },
  { href: "/categorias", label: "Categorias" },
  { href: "/lojas-parceiras", label: "Lojas Parceiras" },
  { href: "/cupons", label: "Cupons" },
  { href: "/guia", label: "Blog" },
];

/**
 * Cabeçalho fixo em três fileiras (logo, busca, lojas) — a busca fica
 * sempre visível em qualquer página, sem depender do Hero da Home. O
 * WhatsApp já tem lugar de sobra no site (rodapé, barra fixa do mobile,
 * página de produto), não precisa de mais um atalho aqui.
 */
export function Header() {
  return (
    <header className="dc-header">
      <div className="dc-shell dc-header-row">
        <Logo />
        <nav className="dc-header-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        {/* Sem contador — não temos sistema de notificação de verdade ainda,
            então não inventamos um número. */}
        <span className="dc-header-bell" title="Notificações em breve">
          <BellIcon size={20} style={{ color: "#fff" }} />
        </span>
      </div>
      <div className="dc-shell">
        <form className="dc-header-search" action="/busca" method="GET">
          <SearchIcon size={18} style={{ flex: "none", color: "#fff", opacity: 0.85 }} />
          <input
            type="search"
            name="q"
            placeholder="O que você está procurando?"
            aria-label="Buscar produto"
          />
          <button type="submit" className="dc-sr-only" aria-label="Buscar">
            Buscar
          </button>
        </form>
        <div className="dc-header-platforms">
          {Object.entries(PLATFORM_INFO).map(([key, info]) => {
            const available = AVAILABLE_PLATFORMS.includes(key);
            return (
              <span
                key={key}
                className={`dc-platform-pill${available ? "" : " dc-platform-soon"}`}
                style={available ? { background: info.color, color: info.textColor } : undefined}
                title={available ? undefined : `${info.label} — em breve`}
              >
                {info.label}
              </span>
            );
          })}
        </div>
      </div>
    </header>
  );
}
