import { staticFile } from "remotion";

// Poppins -- mesma fonte da marca no site (public/fonts), pedido do
// Heber (2026-09-24: "melhore essa fonte, não tá premium" -- Arial
// genérico não passava a mesma identidade visual do site.
export const POPPINS_EXTRABOLD = "Poppins-ExtraBold";
export const POPPINS_BOLD = "Poppins-Bold";

let injected = false;

export function ensurePoppinsLoaded() {
  if (injected) return;
  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: '${POPPINS_EXTRABOLD}';
      src: url('${staticFile("fonts/Poppins-ExtraBold.ttf")}') format('truetype');
      font-weight: 800;
    }
    @font-face {
      font-family: '${POPPINS_BOLD}';
      src: url('${staticFile("fonts/Poppins-Bold.ttf")}') format('truetype');
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
  injected = true;
}
