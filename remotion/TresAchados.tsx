import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";
import { POPPINS_EXTRABOLD, POPPINS_BOLD, ensurePoppinsLoaded } from "./fonts";

export interface Achado {
  photoFile: string;
  productName: string;
  priceFrom: string;
  priceTo: string;
  discountLabel: string;
}

export interface TresAchadosProps {
  kicker: string;
  achados: [Achado, Achado, Achado];
  ctaLine1: string;
  ctaLine2: string;
}

const SAFE_TOP = 520;
const SAFE_BOTTOM = 1400;

function useFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = delayRender("loading Poppins (TresAchados)");
    ensurePoppinsLoaded();
    document.fonts.ready.then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, []);
  return ready;
}

const Intro: React.FC<{ kicker: string }> = ({ kicker }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontsReady = useFonts();
  const scaleSpring = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at 50% 40%, #1a1a1a 0%, #0b0b0b 70%)",
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${scaleSpring})` }}>
        <span
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 40,
            color: "#0b0b0b",
            backgroundColor: "#ffd700",
            padding: "10px 28px",
            borderRadius: 10,
            marginBottom: 36,
          }}
        >
          {kicker}
        </span>
        <div
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 100,
            color: "white",
            textAlign: "center",
            lineHeight: 1.05,
            textShadow: "0 4px 20px rgba(0,0,0,0.75)",
          }}
        >
          3 ACHADOS
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const AchadoSlide: React.FC<{ achado: Achado; index: number }> = ({ achado, index }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fontsReady = useFonts();

  const zoomScale = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const backgroundZoomScale = interpolate(frame, [0, durationInFrames], [1.15, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const textFade = interpolate(frame, [8, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? fadeIn : 0 }}>
      <Img
        src={staticFile(achado.photoFile)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${backgroundZoomScale})`,
          filter: "blur(50px) brightness(0.5)",
        }}
      />
      <Img
        src={staticFile(achado.photoFile)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `scale(${zoomScale})`,
        }}
      />

      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.78) 78%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      {/* Contador 1/3, 2/3, 3/3 */}
      <div
        style={{
          position: "absolute",
          top: 90,
          right: 60,
          fontFamily: POPPINS_EXTRABOLD,
          fontSize: 44,
          color: "white",
          opacity: 0.85,
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        {index}/3
      </div>

      {/* Selo de desconto */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 60,
          backgroundColor: "#ff4747",
          color: "white",
          fontFamily: POPPINS_EXTRABOLD,
          fontSize: 44,
          padding: "16px 30px",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {achado.discountLabel}
      </div>

      <div style={{ position: "absolute", left: 60, right: 170, bottom: SAFE_TOP === 0 ? 420 : 420, opacity: textFade }}>
        <div
          style={{
            fontFamily: POPPINS_BOLD,
            fontWeight: 700,
            fontSize: 50,
            color: "white",
            lineHeight: 1.2,
            marginBottom: 22,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {achado.productName}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ fontFamily: POPPINS_BOLD, fontSize: 36, color: "#d9d9d9", textDecoration: "line-through" }}>
            {achado.priceFrom}
          </span>
          <span
            style={{
              fontFamily: POPPINS_EXTRABOLD,
              fontSize: 70,
              color: "#4dff88",
              textShadow: "0 2px 12px rgba(0,0,0,0.6)",
            }}
          >
            {achado.priceTo}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ ctaLine1: string; ctaLine2: string }> = ({ ctaLine1, ctaLine2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fontsReady = useFonts();
  const badgeSpring = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? fadeIn : 0 }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #1a1a1a 0%, #0b0b0b 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 90px" }}>
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: "50%",
            padding: 6,
            background: "linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)",
            marginBottom: 48,
            transform: `scale(${badgeSpring})`,
          }}
        >
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "4px solid #0b0b0b" }}>
            <Img src={staticFile("logo-perfil.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
        <div
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 54,
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
            fontSize: 40,
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

export const TresAchados: React.FC<TresAchadosProps> = ({ kicker, achados, ctaLine1, ctaLine2 }) => {
  const introFrames = 45; // 1.5s
  const slideFrames = 105; // 3.5s
  const outroFrames = 75; // 2.5s

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={introFrames}>
        <Intro kicker={kicker} />
      </Sequence>
      <Sequence from={introFrames} durationInFrames={slideFrames}>
        <AchadoSlide achado={achados[0]} index={1} />
      </Sequence>
      <Sequence from={introFrames + slideFrames} durationInFrames={slideFrames}>
        <AchadoSlide achado={achados[1]} index={2} />
      </Sequence>
      <Sequence from={introFrames + slideFrames * 2} durationInFrames={slideFrames}>
        <AchadoSlide achado={achados[2]} index={3} />
      </Sequence>
      <Sequence from={introFrames + slideFrames * 3} durationInFrames={outroFrames}>
        <Outro ctaLine1={ctaLine1} ctaLine2={ctaLine2} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const TRES_ACHADOS_TOTAL_FRAMES = 45 + 105 * 3 + 75;
