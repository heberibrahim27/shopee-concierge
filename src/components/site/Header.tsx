import { Logo } from "./Logo";
import { PLATFORM_INFO } from "../../lib/site/platforms";

/**
 * Lojas que o comparador realmente já traz dado real. As outras aparecem
 * apagadas com "em breve": mostra pra onde o produto está indo sem fingir
 * que já compara com elas (nenhuma delas tem link, de propósito).
 */
const AVAILABLE_PLATFORMS = ["shopee", "nike", "olympikus"];

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
        {/* Sem contador — não temos sistema de notificação de verdade ainda,
            então não inventamos um número. */}
        <span className="dc-header-bell" title="Notificações em breve">
          <img src="/SINO-SEM-NOTIFICAÇÃO.png" alt="Notificações (em breve)" />
        </span>
      </div>
      <div className="dc-shell">
        <form className="dc-header-search" action="/busca" method="GET">
          <img className="dc-header-search-bg" src="/BUSCADOR.png" alt="" aria-hidden="true" />
          <img className="dc-header-search-icon" src="/LUPA.png" alt="" aria-hidden="true" />
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
