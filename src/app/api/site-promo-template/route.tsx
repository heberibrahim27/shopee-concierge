import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * Imagem de "bom dia"/"boa noite" pro grupo do WhatsApp (pedido do
 * Heber, 2026-09-25: "Faz uma imagem com produtos agrupados... e a
 * logo e coloca o texto com o link do site"). Decisão técnica: em vez
 * de gerar via IA (risco de produto/rosto/texto errado, ver
 * feedback_test_masks_visually / feedback_video_product_selection_criteria
 * na memória), monta com FOTO REAL de produtos do catálogo + logo real,
 * mesmo mecanismo já usado e testado em story-template/route.tsx
 * (next/og ImageResponse, grátis, sem crédito de IA nenhum).
 *
 * Grade de até 6 fotos reais (mosaico) + logo + saudação + texto fixo
 * "o site tem todos os achados" + URL do site.
 */

function fileToDataUri(filePath: string, mime: string) {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const logoDataUri = fileToDataUri(path.join(process.cwd(), "public", "LOGO.png"), "image/png");

const fontBold = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Poppins-Bold.ttf"));
const fontExtraBold = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Poppins-ExtraBold.ttf"));

const BRAND_GREEN = "#0FA958";
const BRAND_GREEN_DARK = "#0C8A47";
const BRAND_BLACK = "#141414";

const WIDTH = 1080;
const HEIGHT = 1350;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") === "noite" ? "noite" : "manha";
  const images = searchParams.getAll("img").filter(Boolean).slice(0, 6);

  const greeting = period === "manha" ? "🌅 Bom dia!" : "🌙 Boa noite!";
  const subline =
    period === "manha"
      ? "Começando o dia com economia de verdade"
      : "Fechando o dia com mais uma leva de achados";

  return new ImageResponse(
    (
      <div
        style={{
          width: `${WIDTH}px`,
          height: `${HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          background: `linear-gradient(160deg, ${BRAND_BLACK} 0%, #163a25 55%, #0a3320 100%)`,
          padding: "56px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <img src={logoDataUri} width={90} height={90} style={{ borderRadius: "20px" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "40px", fontWeight: 800, color: "#ffffff" }}>
              {greeting}
            </div>
            <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, color: "#9fc9ac" }}>
              {subline}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            marginTop: "44px",
            width: "100%",
          }}
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              width={336}
              height={336}
              style={{
                width: "336px",
                height: "336px",
                objectFit: "cover",
                borderRadius: "24px",
                border: "3px solid rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "auto",
            background: `linear-gradient(135deg, #22c55e, ${BRAND_GREEN})`,
            borderRadius: "24px",
            padding: "28px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: "32px", fontWeight: 800, color: "#ffffff", textAlign: "center" }}>
            O site tem TODOS os achados, sempre atualizados
          </div>
          <div style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: BRAND_BLACK, marginTop: "10px" }}>
            descontochegando.com.br
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Poppins", data: fontBold, weight: 700, style: "normal" },
        { name: "Poppins", data: fontExtraBold, weight: 800, style: "normal" },
      ],
      headers: { "Cache-Control": "no-store" },
    }
  );
}
