import { AbsoluteFill, Img, staticFile, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";
import { POPPINS_EXTRABOLD, POPPINS_BOLD, ensurePoppinsLoaded } from "./fonts";

export interface CoverProps {
  photoFile: string;
  kicker: string;
  headline: string;
  price: number;
}

// A grade do Instagram corta o Reels vertical (1080x1920) num quadrado
// central pro thumbnail -- margem extra de segurança além do cálculo
// geométrico (420-1500), corte real pode não ser perfeitamente centralizado.
const SAFE_TOP = 520;
const SAFE_BOTTOM = 1400;

/**
 * Capa estilo manchete de anúncio -- modelo fechado com o Heber
 * (2026-09-24) depois de rodada de referência real gerada no ChatGPT
 * (kicker em destaque + produto + preço enorme + CTA). Correções dele
 * sobre a versão do ChatGPT, aplicadas aqui: (1) só o ícone redondo do
 * perfil, sem o wordmark "Desconto Chegando" escrito -- duplicava peso
 * visual; (2) verde só no preço -- o resto (kicker, produto, botão)
 * neutro/branco, pra não poluir.
 */
export const Cover: React.FC<CoverProps> = ({ photoFile, kicker, headline, price }) => {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const handle = delayRender("loading Poppins");
    ensurePoppinsLoaded();
    document.fonts.ready.then(() => {
      setFontsReady(true);
      continueRender(handle);
    });
  }, []);

  const reais = Math.floor(price);
  const centavos = Math.round((price - reais) * 100);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <Img src={staticFile(photoFile)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />

      {/* Gradiente escurecendo a metade inferior pra manchete ler bem, sem virar tarja sólida */}
      <AbsoluteFill
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 58%, rgba(0,0,0,0.88) 100%)" }}
      />

      {/* Selo do perfil -- só o ícone, sem wordmark (Heber, 2026-09-24) */}
      <div
        style={{
          position: "absolute",
          top: SAFE_TOP,
          left: 50,
          width: 110,
          height: 110,
          borderRadius: "50%",
          padding: 5,
          background: "linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "3px solid #0b0b0b" }}>
          <Img src={staticFile("logo-perfil.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>

      {/* Manchete: kicker amarelo, produto branco, preço enorme (único elemento verde) */}
      <div style={{ position: "absolute", left: 50, right: 50, top: SAFE_BOTTOM - 540 }}>
        <span
          style={{
            display: "inline-block",
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 32,
            color: "#0b0b0b",
            backgroundColor: "#ffd700",
            padding: "8px 22px",
            borderRadius: 8,
            marginBottom: 26,
          }}
        >
          {kicker}
        </span>
        <div
          style={{
            fontFamily: POPPINS_EXTRABOLD,
            fontSize: 64,
            lineHeight: 1.05,
            color: "white",
            textShadow: "0 4px 20px rgba(0,0,0,0.75)",
            marginBottom: 16,
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <span style={{ fontFamily: POPPINS_EXTRABOLD, fontSize: 42, color: "#4dff88", marginTop: 20, marginRight: 8, textShadow: "0 4px 20px rgba(0,0,0,0.75)" }}>
            R$
          </span>
          <span style={{ fontFamily: POPPINS_EXTRABOLD, fontSize: 142, lineHeight: 1, color: "#4dff88", textShadow: "0 4px 20px rgba(0,0,0,0.75)" }}>
            {reais}
          </span>
          <span style={{ fontFamily: POPPINS_EXTRABOLD, fontSize: 48, color: "#4dff88", marginTop: 18, marginLeft: 6, textShadow: "0 4px 20px rgba(0,0,0,0.75)" }}>
            ,{String(centavos).padStart(2, "0")}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
