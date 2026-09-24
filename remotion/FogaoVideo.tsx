import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export interface FogaoVideoProps {
  photoFile: string;
  productName: string;
  priceFrom: string;
  priceTo: string;
  discountLabel: string;
}

export const FogaoVideo: React.FC<FogaoVideoProps> = ({
  photoFile,
  productName,
  priceFrom,
  priceTo,
  discountLabel,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Achado real (Heber, 2026-09-24: "quando vc corta demais o produto e
  // da o zoom nele, não vejo o produto no celular"): objectFit:"cover"
  // numa foto quadrada/retangular dentro de um quadro 9:16 bem estreito
  // já cortava as bordas SÓ pra preencher a tela, antes mesmo do zoom --
  // o zoom em cima (até 1.18x) cortava ainda mais a cada segundo. Fix:
  // camada de fundo com blur (pode cortar à vontade, é só atmosfera) +
  // camada de frente com "contain" (produto inteiro sempre visível) e
  // zoom bem mais sutil (até 1.06x, não corta o produto pra fora do
  // quadro).
  const zoomScale = interpolate(frame, [0, durationInFrames], [1, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const backgroundZoomScale = interpolate(frame, [0, durationInFrames], [1.15, 1.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  const badgeSpring = spring({ frame: frame - 35, fps, config: { damping: 12, stiffness: 120 } });
  const badgeTranslateY = interpolate(badgeSpring, [0, 1], [40, 0]);

  const nameFade = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        {/* Fundo borrado só pra preencher a tela -- pode cortar à vontade, é atmosfera, não é onde o produto precisa ficar visível */}
        <Img
          src={staticFile(photoFile)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${backgroundZoomScale})`,
            filter: "blur(50px) brightness(0.5)",
          }}
        />
        {/* Produto inteiro sempre visível -- "contain", nunca corta */}
        <Img
          src={staticFile(photoFile)}
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
      </AbsoluteFill>

      {/* Gradiente inferior pra legibilidade do texto por cima da foto */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.75) 78%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      {/* Selo de desconto, canto superior */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 60,
          transform: `translateY(${badgeTranslateY}px)`,
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

      {/*
        Bloco de texto: nome + preço. bottom:420 (não 140) e right:170
        (não 60) de propósito -- achado real testando no celular
        (2026-09-24, Heber mandou print): o Instagram cobre o rodapé do
        Reels com a própria interface (usuário, música, legenda) e a
        coluna direita com os ícones de like/comentar/compartilhar. Texto
        colado no rodapé real fica ilegível, cortado pela UI nativa.
      */}
      <div style={{ position: "absolute", left: 60, right: 170, bottom: 420, opacity: nameFade }}>
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
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: 40,
              color: "#d9d9d9",
              textDecoration: "line-through",
            }}
          >
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
