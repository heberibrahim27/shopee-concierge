import { buildWhatsAppLink } from "./constants";

/**
 * Form GET nativo — navega pra /busca?q=... sem precisar de client
 * component nem JS. Fase 1 não tem busca por foto no site (ver
 * ARQUITETURA-SITE.md); o CTA de foto leva direto pro WhatsApp.
 */
export function SearchBox() {
  return (
    <>
      <form className="dc-search-form" action="/busca" method="GET">
        <input
          className="dc-search-input"
          type="search"
          name="q"
          placeholder="O que você está procurando?"
          aria-label="Buscar produto"
        />
        <button className="dc-search-button" type="submit">
          Buscar
        </button>
      </form>
      <a
        className="dc-photo-cta"
        href={buildWhatsAppLink("Quero encontrar um produto, vou mandar uma foto")}
        target="_blank"
        rel="noopener noreferrer"
      >
        📸 Buscar pela foto
        <span>Viu algo na rua, no Instagram ou na casa de alguém? Manda a foto no WhatsApp.</span>
      </a>
    </>
  );
}
