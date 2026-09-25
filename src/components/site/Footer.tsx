import { EmailCapture } from "./EmailCapture";

export function Footer() {
  return (
    <>
      <div className="dc-shell">
        <EmailCapture />
      </div>
      <footer className="dc-footer">
        <p>
          Desconto Chegando é um serviço independente de comparação de preços: apenas indicamos
          ofertas, não vendemos nem processamos nenhum pagamento. Compra, entrega, trocas e
          garantia são direto com o vendedor na loja de origem. As marcas citadas pertencem aos
          seus respectivos titulares. Links de produtos podem gerar comissão de afiliado.{" "}
          <a href="/guia/como-sabemos-se-o-preco-e-bom">Como sabemos se um preço é bom</a>
          {" · "}
          <a href="/lojas-parceiras">Lojas parceiras</a>.
        </p>
      </footer>
    </>
  );
}
