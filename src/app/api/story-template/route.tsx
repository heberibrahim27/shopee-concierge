import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function fileToDataUri(filePath: string, mime: string) {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const logoDataUri = fileToDataUri(
  path.join(process.cwd(), "public", "logoperfil-favicon.png"),
  "image/png"
);

const fontRegular = fs.readFileSync(
  path.join(process.cwd(), "public", "fonts", "Poppins-Regular.ttf")
);
const fontBold = fs.readFileSync(
  path.join(process.cwd(), "public", "fonts", "Poppins-Bold.ttf")
);
const fontExtraBold = fs.readFileSync(
  path.join(process.cwd(), "public", "fonts", "Poppins-ExtraBold.ttf")
);

// Verde da marca (mesmo tom do logo/CTA usados no Canva).
const BRAND_GREEN = "#0FA958";
const BRAND_GREEN_DARK = "#0C8A47";

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

  const width = 1080;
  const height = variant === "story" ? 1920 : 1350;

  const HeaderBar = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: "76px",
            height: "76px",
            borderRadius: "16px",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <img src={logoDataUri} width={76} height={76} style={{ objectFit: "cover" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: "#141414" }}>
            @descontoschegando
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "16px",
              fontWeight: 700,
              color: "#8A8A8A",
              letterSpacing: "1px",
            }}
          >
            AS MELHORES OFERTAS PRA VOCÊ
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "white",
          border: `3px solid ${BRAND_GREEN}`,
          borderRadius: "999px",
          padding: "12px 22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            background: "#FF7A1A",
            fontSize: "20px",
          }}
        >
          🛍️
        </div>
        <div style={{ display: "flex", fontSize: "24px", fontWeight: 800, color: "#141414" }}>
          ACHADO SHOPEE
        </div>
      </div>
    </div>
  );

  const DiscountTag = discountLabel ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        background: BRAND_GREEN,
        borderRadius: "20px",
        padding: variant === "story" ? "22px 40px" : "18px 30px",
      }}
    >
      <div style={{ display: "flex", fontSize: "34px" }}>🏷️</div>
      <div
        style={{
          display: "flex",
          fontSize: "40px",
          fontWeight: 800,
          color: "white",
          lineHeight: 1.05,
        }}
      >
        {discountLabel} OFF
      </div>
    </div>
  ) : null;

  const PriceBlock =
    variant === "story" ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {de ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
              <div style={{ display: "flex", fontSize: "30px", fontWeight: 700, color: "#9A9A9A" }}>
                De
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "30px",
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
            <div style={{ display: "flex", fontSize: "36px", fontWeight: 700, color: BRAND_GREEN_DARK }}>
              Por
            </div>
            <div style={{ display: "flex", fontSize: "78px", fontWeight: 800, color: BRAND_GREEN_DARK }}>
              R$ {por}
            </div>
          </div>
        </div>
        {DiscountTag}
      </div>
    ) : (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {de ? (
            <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#9A9A9A" }}>
              De R$ {de}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <div style={{ display: "flex", fontSize: "32px", fontWeight: 700, color: BRAND_GREEN_DARK }}>
              Por
            </div>
            <div style={{ display: "flex", fontSize: "64px", fontWeight: 800, color: BRAND_GREEN_DARK }}>
              R$ {por}
            </div>
          </div>
        </div>
        {DiscountTag}
      </div>
    );

  const Cta = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "18px",
        width: "100%",
        background: "#141414",
        border: `4px solid ${BRAND_GREEN}`,
        borderRadius: "999px",
        padding: variant === "story" ? "26px 30px" : "24px 34px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "44px",
          height: "44px",
          borderRadius: "12px",
          background: "#FF7A1A",
          fontSize: "26px",
        }}
      >
        🛍️
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {variant === "story" ? (
          <>
            <div style={{ display: "flex", fontSize: "32px", fontWeight: 800, color: "white" }}>
              COMENTE &quot;QUERO&quot;
            </div>
            <div style={{ display: "flex", fontSize: "22px", fontWeight: 700, color: "#D8D8D8" }}>
              que enviamos o link
            </div>
          </>
        ) : (
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 800, color: "white" }}>
            CORRE PRA SHOPEE
          </div>
        )}
      </div>
      <div style={{ display: "flex", fontSize: "34px", color: "white" }}>→</div>
    </div>
  );

  const Footer = (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", width: "100%" }}>
      <div style={{ display: "flex", flex: 1, height: "2px", background: "#D8D8D8" }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", fontSize: "18px" }}>✅</div>
        <div style={{ display: "flex", fontSize: "17px", fontWeight: 600, color: "#8A8A8A" }}>
          Oferta sujeita a alteração. Confira preço e disponibilidade antes de comprar.
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, height: "2px", background: "#D8D8D8" }} />
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAFA",
          fontFamily: "Poppins",
          padding: variant === "story" ? "60px 56px" : "50px 56px",
        }}
      >
        {HeaderBar}

        <div
          style={{
            display: "flex",
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: "28px",
            overflow: "hidden",
            background: "#F0F0F0",
          }}
        >
          <img src={img} width={width} height={width} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: variant === "story" ? "44px" : "40px",
            fontWeight: 800,
            color: "#141414",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>

        {PriceBlock}

        {Cta}

        {Footer}
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: "Poppins", data: fontRegular, weight: 400, style: "normal" },
        { name: "Poppins", data: fontBold, weight: 700, style: "normal" },
        { name: "Poppins", data: fontExtraBold, weight: 800, style: "normal" },
      ],
    }
  );
}
