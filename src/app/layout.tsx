import { Poppins } from "next/font/google";
import { BottomNav } from "../components/site/BottomNav";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
