import { buildWhatsAppLink, WHATSAPP_GROUP_LINK } from "./constants";
import { EmailCapture } from "./EmailCapture";

export function Footer() {
  return (
    <>
      <div className="dc-shell">
        <a
          className="dc-footer-cta-image"
          href={buildWhatsAppLink("Quero encontrar um produto, vou mandar uma foto")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/BANNER-RODAPÉ.png" alt="Não encontrou o que procurava? Manda uma foto no WhatsApp que a gente procura pra você." />
        </a>
        <a href={WHATSAPP_GROUP_LINK} target="_blank" rel="noopener noreferrer" className="dc-footer-group-cta">
          📲 Entre no grupo do WhatsApp e receba as ofertas em primeira mão
        </a>
        <EmailCapture />
      </div>
      <footer className="dc-footer">
        <p>
          Desconto Chegando é um serviço independente de comparação de preços: apenas indicamos
          ofertas, não vendemos nem processamos nenhum pagamento. Compra, entrega, trocas e
          garantia são direto com o vendedor na loja de origem. As marcas citadas pertencem aos
          seus respectivos titulares. Links de produtos podem gerar comissão de afiliado.
        </p>
      </footer>
    </>
  );
}
