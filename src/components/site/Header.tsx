import { Logo } from "./Logo";
import { HeartIcon, SearchIcon } from "./icons";
import { MobileNavDrawer } from "./MobileNavDrawer";

/**
 * Menu de navegação real no desktop (achado real 2026-09-25: não
 * existia NENHUM link de navegação além do logo -- Lojas Parceiras,
 * Blog (guias) e Cupons só eram alcançáveis via rodapé/URL direta,
 * pedido do Heber pra ficar mais parecido com um comparador "padrão").
 * Some no mobile (texto), mas os mesmos itens ficam no hambúrguer --
 * achado real 2026-09-25: sem isso, Lojas Parceiras/Cupons/Blog ficavam
 * inalcançáveis pelo cabeçalho no mobile (a barra inferior só cobre
 * Início/Buscar/Favoritos/Categorias/WhatsApp).
 */
const NAV_ITEMS = [
  { href: "/", label: "Início" },
  { href: "/categorias", label: "Categorias" },
  { href: "/lojas-parceiras", label: "Lojas Parceiras" },
  { href: "/cupons", label: "Cupons" },
  { href: "/guia", label: "Blog" },
];

/**
 * Cabeçalho fiel à spec literal tirada das 4 imagens de referência (ver
 * memória project_header_literal_spec_v1) -- nenhuma delas mostra a fileira
 * de chips de loja no cabeçalho; essa informação já vive de verdade na
 * página /lojas-parceiras (com contagem real por loja), então não foi
 * duplicada aqui.
 */
export function Header() {
  return (
    <header className="dc-header">
      <div className="dc-shell dc-header-row">
        <MobileNavDrawer items={NAV_ITEMS} />
        <Logo />
        <nav className="dc-header-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        {/* 2026-09-25: era um sino (BellIcon) -- inventado, não existe em
            nenhuma das 4 imagens de referência (spec real: ver memória
            project_header_literal_spec_v1). O que existe de verdade nas
            imagens é um ícone de favoritos -- e favoritos já é uma
            funcionalidade real do site (ver FavoriteButton/lib/site/
            favorites.ts), só não tinha link no cabeçalho ainda. */}
        <a className="dc-header-bell" href="/favoritos" title="Favoritos" aria-label="Favoritos">
          <HeartIcon size={20} />
        </a>
      </div>
      <div className="dc-shell">
        <form className="dc-header-search" action="/busca" method="GET">
          <SearchIcon size={18} style={{ flex: "none", color: "var(--dc-brand)" }} />
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
      </div>
    </header>
  );
}
