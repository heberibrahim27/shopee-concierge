import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface EndCardProps {
  photoFile: string;
  productName: string;
  priceFrom: string;
  priceTo: string;
  discountLabel: string;
}

/**
 * Card final curto (não o vídeo inteiro) -- pra colar DEPOIS de um clipe
 * já pronto (Veo, filmagem real etc) via ffmpeg concat, não por cima
 * dele. Reusa o mesmo layout/paleta do FogaoVideo.tsx (selo + nome +
 * preço), só que como remate de ~2.5s em vez de composição de 8s
 * inteira -- pedido do Heber (2026-09-24): gerar a cena no Veo a partir
 * de uma imagem de referência do ChatGPT, e só colar o card de
 * preço/produto no final.
 */
export const EndCard: React.FC<EndCardProps> = ({ photoFile, productName, priceFrom, priceTo, discountLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const badgeSpring = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 120 } });
  const textFade = interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fadeIn }}>
      <Img
        src={staticFile(photoFile)}
        style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(50px) brightness(0.5)" }}
      />
      <Img
        src={staticFile(photoFile)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
      />

      <AbsoluteFill
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%)" }}
      />

      <div
        style={{
          position: "absolute",
          top: 90,
          left: 60,
          opacity: badgeSpring,
          backgroundColor: "#ff4747",
          color: "white",
          fontFamily: "Arial, sans-serif",
          fontWeight: 900,
          fontSize: 54,
          padding: "18px 34px",
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {discountLabel}
      </div>

      <div style={{ position: "absolute", left: 60, right: 170, bottom: 200, opacity: textFade }}>
        <div
          style={{
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            fontSize: 58,
            color: "white",
            lineHeight: 1.15,
            marginBottom: 24,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          {productName}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 40, color: "#d9d9d9", textDecoration: "line-through" }}>
            {priceFrom}
          </span>
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontWeight: 900,
              fontSize: 76,
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
