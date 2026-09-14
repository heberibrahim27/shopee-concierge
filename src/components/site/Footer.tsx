import { buildWhatsAppLink } from "./constants";

export function Footer() {
  return (
    <>
      <div className="dc-shell">
        <div className="dc-footer-cta">
          <h2>Não encontrou o que procurava?</h2>
          <p>Manda uma foto no WhatsApp que a gente procura pra você.</p>
          <a
            className="dc-cta-button"
            href={buildWhatsAppLink("Quero encontrar um produto, vou mandar uma foto")}
            target="_blank"
            rel="noopener noreferrer"
          >
            📸 Procurar pelo WhatsApp
          </a>
        </div>
      </div>
      <footer className="dc-footer">
        <p>Desconto Chegando — links de produtos podem gerar comissão de afiliado.</p>
      </footer>
    </>
  );
}
