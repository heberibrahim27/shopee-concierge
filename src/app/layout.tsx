export const metadata = {
  title: "Shopee Concierge",
  description: "Piloto — concierge de compras via WhatsApp + Shopee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
