import { Header } from "../../components/site/Header";
import { Footer } from "../../components/site/Footer";

export const metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <>
      <Header />
      <main className="dc-shell">
        <section className="dc-hero">
          <h1>Política de Privacidade</h1>
        </section>

        <section className="dc-section" style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7 }}>
          <p>
            O Desconto Chegando (descontochegando.com.br) é um comparador de preços independente.
            Não vendemos produtos diretamente — indicamos onde comprar (Shopee, Mercado Livre, Nike,
            Olympikus e outras lojas parceiras) através de links de afiliado, que podem gerar
            comissão pra gente sem custo extra pra você.
          </p>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>O que a gente coleta</h2>
          <ul>
            <li>
              <strong>Navegação no site:</strong> registramos qual página foi vista e quando, e
              quando você clica em &quot;Ver oferta&quot; — sem nenhum dado pessoal, só o caminho
              da página e o horário. Usamos isso pra entender quais produtos interessam mais e
              corrigir problemas (link quebrado, preço desatualizado etc).
            </li>
            <li>
              <strong>Favoritos:</strong> ficam guardados só no seu navegador (localStorage) —
              nunca são enviados pra nós nem pra ninguém.
            </li>
            <li>
              <strong>WhatsApp:</strong> se você manda uma foto ou mensagem pro nosso número, usamos
              o conteúdo (texto/imagem) só pra te ajudar a achar o produto certo. Não compartilhamos
              essas conversas com terceiros.
            </li>
          </ul>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Links de afiliado</h2>
          <p>
            Os botões &quot;Ver oferta&quot; te levam pra loja parceira através de um link de
            afiliado (Shopee, Mercado Livre, Awin/Nike/Olympikus). A loja pode usar cookies próprios
            dela pra rastrear a compra — isso é gerenciado pela loja, não por nós.
          </p>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Redes sociais e parceiros</h2>
          <p>
            Podemos publicar conteúdo em redes sociais (Instagram, Pinterest) com links pros
            produtos que comparamos. Se você chegou aqui a partir de uma dessas redes, elas têm suas
            próprias políticas de privacidade, independentes desta.
          </p>

          <h2 style={{ fontSize: 16, marginTop: 24 }}>Contato</h2>
          <p>
            Dúvidas sobre privacidade? Manda mensagem no nosso WhatsApp — o mesmo número que ajuda a
            achar produtos.
          </p>

          <p style={{ color: "var(--dc-text-muted, #999)", fontSize: 12, marginTop: 24 }}>
            Última atualização: setembro de 2026.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
