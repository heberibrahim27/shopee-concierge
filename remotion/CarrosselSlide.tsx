import { AbsoluteFill, Img, staticFile, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";
import { POPPINS_EXTRABOLD, POPPINS_BOLD, ensurePoppinsLoaded } from "./fonts";

// Slides estáticos (sem animação) pra carrossel de imagem do Instagram.
// Formato 4:5 (1080x1350) -- carrossel NÃO aceita 9:16 (isso é só
// Reels/Story); a Windsor exige aspect ratio entre 4:5 e 1.91:1.
// Renderiza com `npx remotion still`, uma imagem por slide, cada uma
// com --props diferente (ver scripts/render-carrossel.ts).

function useFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = delayRender("loading Poppins (Carrossel)");
    ensurePoppinsLoaded();
    document.fonts.ready.then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, []);
  return ready;
}

export interface CarrosselCoverProps {
  kicker: string;
  headline: string;
}

export const CarrosselCover: React.FC<CarrosselCoverProps> = ({ kicker, headline }) => {
  const fontsReady = useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, #1a1a1a 0%, #0b0b0b 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
        <span
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 38,
            color: "#0b0b0b",
            backgroundColor: "#ffd700",
            padding: "10px 28px",
            borderRadius: 10,
            marginBottom: 40,
          }}
        >
          {kicker}
        </span>
        <div
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 84,
            color: "white",
            textAlign: "center",
            lineHeight: 1.15,
            textShadow: "0 4px 20px rgba(0,0,0,0.75)",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontFamily: POPPINS_BOLD,
            fontSize: 32,
            color: "#d9d9d9",
            marginTop: 40,
          }}
        >
          Arrasta pro lado →
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export interface CarrosselProdutoProps {
  photoFile: string;
  productName: string;
  priceFrom?: string | null;
  priceTo: string;
  discountLabel: string;
  index: number;
  total: number;
}

export const CarrosselProduto: React.FC<CarrosselProdutoProps> = ({
  photoFile,
  productName,
  priceFrom,
  priceTo,
  discountLabel,
  index,
  total,
}) => {
  const fontsReady = useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <Img
        src={staticFile(photoFile)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.2)",
          filter: "blur(50px) brightness(0.5)",
        }}
      />
      <Img
        src={staticFile(photoFile)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.8) 76%, rgba(0,0,0,0.94) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 70,
          right: 50,
          fontFamily: POPPINS_EXTRABOLD,
          fontSize: 38,
          color: "white",
          opacity: 0.85,
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {index}/{total}
      </div>

      <div
        style={{
          position: "absolute",
          top: 70,
          left: 50,
          backgroundColor: "#ff4747",
          color: "white",
          fontFamily: POPPINS_EXTRABOLD,
          fontSize: 38,
          padding: "14px 26px",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {discountLabel}
      </div>

      <div style={{ position: "absolute", left: 50, right: 50, bottom: 70 }}>
        <div
          style={{
            fontFamily: POPPINS_BOLD,
            fontWeight: 700,
            fontSize: 42,
            color: "white",
            lineHeight: 1.2,
            marginBottom: 18,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {productName}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          {priceFrom ? (
            <span style={{ fontFamily: POPPINS_BOLD, fontSize: 30, color: "#d9d9d9", textDecoration: "line-through" }}>
              {priceFrom}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: POPPINS_EXTRABOLD,
              fontSize: 58,
              color: "#4dff88",
              textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            }}
          >
            {priceTo}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export interface CarrosselOutroProps {
  ctaLine1: string;
  ctaLine2: string;
}

export const CarrosselOutro: React.FC<CarrosselOutroProps> = ({ ctaLine1, ctaLine2 }) => {
  const fontsReady = useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #1a1a1a 0%, #0b0b0b 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            padding: 6,
            background: "linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)",
            marginBottom: 44,
          }}
        >
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "4px solid #0b0b0b" }}>
            <Img src={staticFile("logo-perfil.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        <div
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 48,
            color: "white",
            textAlign: "center",
            lineHeight: 1.3,
            marginBottom: 14,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {ctaLine1}
        </div>
        <div
          style={{
            fontFamily: POPPINS_BOLD,
            fontSize: 36,
            color: "#ffd700",
            textAlign: "center",
            lineHeight: 1.3,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {ctaLine2}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
