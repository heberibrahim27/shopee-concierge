import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { useEffect, useState } from "react";
import { POPPINS_EXTRABOLD, ensurePoppinsLoaded } from "./fonts";

// Capa de Destaque (Highlight) do Instagram -- quadrado, o próprio app
// recorta em círculo, então o conteúdo relevante fica centralizado
// num raio seguro. Sem API pra gerenciar Destaque em si (plataforma
// inteira não expõe isso, não é limitação da Windsor) -- isso só gera
// a imagem da capa, o Heber salva manualmente uma vez por categoria.
export interface DestaqueCapaProps {
  label: string;
  accentColor: string;
}

function useFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = delayRender("loading Poppins (DestaqueCapa)");
    ensurePoppinsLoaded();
    document.fonts.ready.then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, []);
  return ready;
}

export const DestaqueCapa: React.FC<DestaqueCapaProps> = ({ label, accentColor }) => {
  const fontsReady = useFonts();
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", opacity: fontsReady ? 1 : 0 }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 620,
            height: 620,
            borderRadius: "50%",
            backgroundColor: accentColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: POPPINS_EXTRABOLD,
              fontSize: label.length > 6 ? 68 : 84,
              color: "#0b0b0b",
              textAlign: "center",
              lineHeight: 1.1,
              padding: "0 40px",
            }}
          >
            {label}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
