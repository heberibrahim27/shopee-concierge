import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function fileToDataUri(filePath: string, mime: string) {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// Molduras exportadas direto dos designs reais do Heber no Canva (logo,
// selo "ACHADO SHOPEE", faixas decorativas, botão CTA e rodapé) — ver
// CONTINUIDADE.md. Só a foto do produto, o nome e o preço são desenhados
// por cima em código; o resto é pixel-a-pixel o design original dele.
const frameFeedDataUri = fileToDataUri(
  path.join(process.cwd(), "public", "templates", "frame-feed.png"),
  "image/png"
);
const frameStoryDataUri = fileToDataUri(
  path.join(process.cwd(), "public", "templates", "frame-story.png"),
  "image/png"
);

const fontBold = fs.readFileSync(
  path.join(process.cwd(), "public", "fonts", "Poppins-Bold.ttf")
);
const fontExtraBold = fs.readFileSync(
  path.join(process.cwd(), "public", "fonts", "Poppins-ExtraBold.ttf")
);

const BRAND_GREEN = "#0FA958";
const BRAND_GREEN_DARK = "#0C8A47";

// Coordenadas medidas nos PNGs exportados das molduras reais (ver
// scratch-png-*.js na sessão que fez a medição — não faz parte do repo).
const LAYOUT = {
  feed: {
    width: 1080,
    height: 1350,
    frame: frameFeedDataUri,
    photo: { left: 194, top: 171, width: 692, height: 659 },
    // Cobre o texto de amostra que ainda está gravado na moldura exportada
    // do Canva ("Nome do produto aqui", "R$ 29,90", "50% OFF").
    mask: { top: 832, height: 1150 - 832 },
    title: { left: 90, top: 858, width: 900, center: false },
    priceRow: { top: 975, left: 90 as number | undefined },
    badge: { right: 76 as number | undefined, top: 975, width: 290, height: 170 },
  },
  story: {
    width: 1080,
    height: 1920,
    frame: frameStoryDataUri,
    photo: { left: 164, top: 248, width: 751, height: 784 },
    mask: { top: 1034, height: 1660 - 1034 },
    title: { left: 0, top: 1088, width: 1080, center: true },
    priceRow: { top: 1225, left: undefined as number | undefined },
    badge: { right: undefined as number | undefined, top: 1420, width: 440, height: 170 },
  },
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const img = searchParams.get("img") || "";
  const rawTitle = searchParams.get("title") || "Oferta imperdível";
  const de = searchParams.get("de");
  const por = searchParams.get("por") || "";
  const variant = searchParams.get("variant") === "story" ? "story" : "feed";

  const title =
    rawTitle.length > 60 ? rawTitle.slice(0, 57).trimEnd() + "..." : rawTitle;

  const discountLabel = (() => {
    if (!de || !por) return null;
    const deNum = Number(de.replace(",", "."));
    const porNum = Number(por.replace(",", "."));
    if (!deNum || !porNum || deNum <= porNum) return null;
    return `${Math.round((1 - porNum / deNum) * 100)}%`;
  })();

  const L = LAYOUT[variant];

  const PriceBlock = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: variant === "story" ? "center" : "flex-start",
      }}
    >
      {de ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#9A9A9A" }}>
            De
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 700,
              color: "#9A9A9A",
              textDecoration: "line-through",
            }}
          >
            R$ {de}
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: "14px" }}>
        <div style={{ display: "flex", fontSize: variant === "story" ? "36px" : "32px", fontWeight: 700, color: BRAND_GREEN_DARK }}>
          Por
        </div>
        <div style={{ display: "flex", fontSize: variant === "story" ? "80px" : "64px", fontWeight: 800, color: BRAND_GREEN_DARK }}>
          R$ {por}
        </div>
      </div>
    </div>
  );

  const DiscountBadge = discountLabel ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        background: BRAND_GREEN,
        borderRadius: "20px",
        padding: "18px 28px",
        width: `${L.badge.width}px`,
        height: `${L.badge.height}px`,
      }}
    >
      <div style={{ display: "flex", fontSize: "34px" }}>🏷️</div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <div style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: "white" }}>
          {discountLabel}
        </div>
        <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: "white" }}>
          OFF
        </div>
      </div>
    </div>
  ) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: `${L.width}px`,
          height: `${L.height}px`,
          display: "flex",
          position: "relative",
        }}
      >
        <img
          src={L.frame}
          width={L.width}
          height={L.height}
          style={{ position: "absolute", top: 0, left: 0, width: `${L.width}px`, height: `${L.height}px` }}
        />

        <div
          style={{
            display: "flex",
            position: "absolute",
            top: `${L.mask.top}px`,
            left: 0,
            width: `${L.width}px`,
            height: `${L.mask.height}px`,
            background: "#fefefe",
          }}
        />

        <img
          src={img}
          width={L.photo.width}
          height={L.photo.height}
          style={{
            position: "absolute",
            top: `${L.photo.top}px`,
            left: `${L.photo.left}px`,
            width: `${L.photo.width}px`,
            height: `${L.photo.height}px`,
            objectFit: "cover",
            borderRadius: "24px",
          }}
        />

        <div
          style={{
            display: "flex",
            position: "absolute",
            top: `${L.title.top}px`,
            left: `${L.title.left}px`,
            width: `${L.title.width}px`,
            fontSize: variant === "story" ? "44px" : "40px",
            fontWeight: 800,
            color: "#141414",
            lineHeight: 1.2,
            justifyContent: L.title.center ? "center" : "flex-start",
            textAlign: L.title.center ? "center" : "left",
          }}
        >
          {title}
        </div>

        {variant === "feed" ? (
          <>
            <div style={{ display: "flex", position: "absolute", top: `${L.priceRow.top}px`, left: `${L.priceRow.left}px` }}>
              {PriceBlock}
            </div>
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: `${L.badge.top}px`,
                left: `${L.width - (L.badge.right ?? 0) - L.badge.width}px`,
              }}
            >
              {DiscountBadge}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", position: "absolute", top: `${L.priceRow.top}px`, left: 0, width: `${L.width}px`, justifyContent: "center" }}>
              {PriceBlock}
            </div>
            <div style={{ display: "flex", position: "absolute", top: `${L.badge.top}px`, left: 0, width: `${L.width}px`, justifyContent: "center" }}>
              {DiscountBadge}
            </div>
          </>
        )}
      </div>
    ),
    {
      width: L.width,
      height: L.height,
      fonts: [
        { name: "Poppins", data: fontBold, weight: 700, style: "normal" },
        { name: "Poppins", data: fontExtraBold, weight: 800, style: "normal" },
      ],
      // ImageResponse cacheia por padrão com max-age de 1 ano (CDN da
      // Vercel). Isso serviu uma versão antiga do template pro Feed no
      // teste real de 2026-09-16 (mesma URL de um teste manual anterior
      // ao fix do selo) mesmo já com o código novo no ar. Sem cache: o
      // Windsor só busca essa imagem 1x por post mesmo, custo é zero.
      headers: { "Cache-Control": "no-store" },
    }
  );
}
