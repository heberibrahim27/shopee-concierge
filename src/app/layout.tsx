import { Poppins } from "next/font/google";
import { BottomNav } from "../components/site/BottomNav";
import { TrackPageView } from "../components/site/TrackPageView";
import { SuggestionWidget } from "../components/site/SuggestionWidget";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL("https://descontochegando.com.br"),
  title: {
    default: "Desconto Chegando — ache o produto certo pelo melhor custo-benefício",
    template: "%s | Desconto Chegando",
  },
  description:
    "Comparador de preços da Shopee: manda o que você quer, a gente acha onde vale mais a pena comprar.",
  openGraph: {
    title: "Desconto Chegando — ache o produto certo pelo melhor custo-benefício",
    description:
      "Comparador de preços da Shopee: manda o que você quer, a gente acha onde vale mais a pena comprar.",
    url: "https://descontochegando.com.br",
    siteName: "Desconto Chegando",
    images: [{ url: "/BANNER-FINAL.png", width: 1983, height: 793 }],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Desconto Chegando — ache o produto certo pelo melhor custo-benefício",
    description:
      "Comparador de preços da Shopee: manda o que você quer, a gente acha onde vale mais a pena comprar.",
    images: ["/BANNER-FINAL.png"],
  },
  // Verificação de propriedade do site pro Pinterest (Configurações > Link
  // para o Pinterest > Sites) — sem isso os Pins não creditam a marca.
  // "lomadee" é a verificação do canal de divulgação cadastrado na Lomadee
  // (rede de afiliados multi-loja, 2026-09-22, ver CONTINUIDADE.md).
  other: {
    "p:domain_verify": "7c6cd09f937ecd8ab729bd3073dbdd65",
    lomadee: "2324685",
  },
  icons: {
    icon: "/logoperfil-favicon.png",
    apple: "/logoperfil-favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        {children}
        <BottomNav />
        <TrackPageView />
        <SuggestionWidget />
      </body>
    </html>
  );
}
