import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * Rota temporária (não faz parte do produto) pra gerar o novo
 * BANNER-FINAL.png em produção -- @vercel/og não renderiza local no
 * Windows (caminho de fonte incompatível, mesma limitação já documentada
 * no story-template). Gera aqui, baixa o PNG, apaga a rota depois.
 */
export async function GET() {
  const fontBold = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Poppins-Bold.ttf"));
  const fontExtraBold = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Poppins-ExtraBold.ttf"));
  const logoDataUri = `data:image/png;base64,${fs
    .readFileSync(path.join(process.cwd(), "public", "LOGO-LIGHT.png"))
    .toString("base64")}`;

  const NAVY = "#14233b";
  const BRAND = "#e45a36";
  const BRAND_SOFT = "#f6d8cf";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1983,
          height: 793,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fef9f5 0%, #ffffff 55%, #fdf1ec 100%)",
          padding: "0 110px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 70,
            right: 130,
            background: BRAND_SOFT,
            color: BRAND,
            fontFamily: "Poppins",
            fontWeight: 700,
            fontSize: 30,
            padding: "16px 34px",
            borderRadius: 999,
          }}
        >
          COMPARE E ECONOMIZE
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 90,
            top: 200,
            fontSize: 420,
            opacity: 0.12,
            transform: "rotate(-12deg)",
          }}
        >
          🏷️
        </div>
        <img src={logoDataUri} width={620} height={207} style={{ marginBottom: 46 }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Poppins",
            fontWeight: 800,
            fontSize: 62,
            lineHeight: 1.18,
            color: NAVY,
            maxWidth: 1400,
          }}
        >
          <span>Os menores preços dos</span>
          <span>maiores marketplaces,</span>
          <span style={{ color: BRAND }}>tudo em um só lugar.</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 56,
            marginTop: 52,
            fontFamily: "Poppins",
            fontWeight: 700,
            fontSize: 32,
            color: NAVY,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>⚡ Rápido</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>🎁 Grátis</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>🛡️ Seguro</span>
        </div>
      </div>
    ),
    {
      width: 1983,
      height: 793,
      fonts: [
        { name: "Poppins", data: fontBold, weight: 700, style: "normal" },
        { name: "Poppins", data: fontExtraBold, weight: 800, style: "normal" },
      ],
    }
  );
}
