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
    // do Canva ("Nome do produto aqui", "R$ 29,90", "50% OFF"). CTA fixo
    // da moldura começa em ~1155 — o conteúdo dinâmico se centraliza
    // verticalmente nesse vão, então funciona igual com ou sem selo de
    // desconto (sem isso, sem desconto sobrava um vão vazio feio).
    mask: { top: 832, height: 1150 - 832 },
    paddingX: { left: 90, right: 76 },
    badgeSize: { width: 290, height: 170 },
  },
  story: {
    width: 1080,
    height: 1920,
    frame: frameStoryDataUri,
    photo: { left: 164, top: 248, width: 751, height: 784 },
    mask: { top: 1034, height: 1660 - 1034 },
    paddingX: { left: 0, right: 0 },
    badgeSize: { width: 440, height: 170 },
  },
} as const;

// Selo "ACHADO SHOPEE" (topo-direita) é pixel fixo dentro do PNG da
// moldura (exportado do Canva) — não dá pra trocar o texto por código,
// só cobrir. Coordenadas medidas nos dois PNGs (1080 de largura em
// ambas as variantes; a zona do selo fica na mesma posição vertical
// independente da altura total do canvas). Usado só quando
// platform != "shopee" (pedido do Heber, 2026-09-21 — produtos da Awin
// não podem sair com selo "ACHADO SHOPEE").
const SHOPEE_BADGE_MASK = { left: 695, top: 55, width: 335, height: 80 };

// Marquinhas decorativas "⟋⟋" no canto superior direito, acima do selo
// "ACHADO SHOPEE" — também pixel fixo da moldura. Achado pelo Heber
// (2026-09-22): "esses 3 tracinhos era efeito do card da shopee em
// cima, não seria melhor retirar?" — sem o selo ao lado (mascarado
// acima pra platform != shopee), ficam boiando sem contexto. Cobre
// generosamente (fundo ali é branco liso, sem risco de "vazar" nada
// como acontecia na barra de CTA).
const DECORATIVE_MARKS_MASK = { left: 960, top: 0, width: 120, height: 60 };

// Barra "CORRE PRA SHOPEE" (rodapé do Feed, com ícone da sacola Shopee)
// também é pixel fixo da moldura — mesmo caso do selo acima. Achado ao
// vivo pelo Heber num post real de tênis Olympikus (2026-09-21): a
// barra ficava lá mesmo pra platform=awin, mandando gente errado pra
// Shopee num produto que não é da Shopee. Story não tem essa barra (o
// "comente EU QUERO" já vem embutido no design do Story todo).
//
// Bug real corrigido em 2026-09-22 (achado pelo Heber: "vc colocou um
// botão em cima do outro"): a máscara branca tinha EXATAMENTE o mesmo
// left/width do botão preto novo (zero margem lateral/superior) — a
// sombra/borda arredondada do botão original "CORRE PRA SHOPEE" (com
// leve anti-aliasing/drop-shadow no PNG) vazava por baixo do botão
// novo, parecendo dois botões sobrepostos. Máscara agora bem maior que
// o botão visível em todas as direções (não só embaixo), e o botão
// fica centralizado dentro da máscara em vez de ancorado no mesmo canto.
const SHOPEE_CTA_BAR_MASK = { left: 66, top: 1130, width: 948, height: 146 };
const CTA_BUTTON = { width: 900, height: 86 };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const img = searchParams.get("img") || "";
  const rawTitle = searchParams.get("title") || "Oferta imperdível";
  const de = searchParams.get("de");
  const por = searchParams.get("por") || "";
  const variant = searchParams.get("variant") === "story" ? "story" : "feed";
  const platform = (searchParams.get("platform") || "shopee").toLowerCase();

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
      {/* Tamanhos medidos direto no Canva (painel de fonte): título 41,9pt
          e preço 71,4pt no design do Feed (1122px de largura nativa),
          escalados pra largura do render (1080px) — ver conversa de
          2026-09-16. Story usa a mesma proporção até medir o valor real
          dele.
          "Por" empilhado ACIMA do preço (não do lado, achado pelo Heber
          2026-09-22: "esse 'Por' deveria está em cima do 'R$'"). */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: variant === "story" ? "38px" : "34px", fontWeight: 700, color: BRAND_GREEN_DARK, lineHeight: 1.1 }}>
          Por
        </div>
        <div style={{ display: "flex", fontSize: variant === "story" ? "86px" : "69px", fontWeight: 800, color: BRAND_GREEN_DARK }}>
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
        // A cor sólida ficava "achatada" perto do gradiente real do selo
        // no Canva — medido pixel a pixel no PNG exportado (topo mais
        // claro, base mais escura, vertical, não diagonal).
        backgroundImage: "linear-gradient(180deg, #00B539 0%, #008027 100%)",
        borderRadius: "20px",
        padding: "18px 28px",
        width: `${L.badgeSize.width}px`,
        height: `${L.badgeSize.height}px`,
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

        {platform !== "shopee" ? (
          <>
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: `${SHOPEE_BADGE_MASK.top}px`,
                left: `${SHOPEE_BADGE_MASK.left}px`,
                width: `${SHOPEE_BADGE_MASK.width}px`,
                height: `${SHOPEE_BADGE_MASK.height}px`,
                background: "#ffffff",
              }}
            />
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: `${DECORATIVE_MARKS_MASK.top}px`,
                left: `${DECORATIVE_MARKS_MASK.left}px`,
                width: `${DECORATIVE_MARKS_MASK.width}px`,
                height: `${DECORATIVE_MARKS_MASK.height}px`,
                background: "#ffffff",
              }}
            />
          </>
        ) : null}

        {platform !== "shopee" && variant === "feed" ? (
          <>
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: `${SHOPEE_CTA_BAR_MASK.top}px`,
                left: `${SHOPEE_CTA_BAR_MASK.left}px`,
                width: `${SHOPEE_CTA_BAR_MASK.width}px`,
                height: `${SHOPEE_CTA_BAR_MASK.height}px`,
                background: "#fefefe",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                top: `${SHOPEE_CTA_BAR_MASK.top + (SHOPEE_CTA_BAR_MASK.height - CTA_BUTTON.height) / 2}px`,
                left: `${SHOPEE_CTA_BAR_MASK.left + (SHOPEE_CTA_BAR_MASK.width - CTA_BUTTON.width) / 2}px`,
                width: `${CTA_BUTTON.width}px`,
                height: `${CTA_BUTTON.height}px`,
                borderRadius: "999px",
                background: "#141414",
                gap: "18px",
              }}
            >
              <div style={{ display: "flex", fontSize: "34px" }}>🔥</div>
              <div style={{ display: "flex", fontSize: "34px", fontWeight: 800, color: "white" }}>
                CONFIRA A OFERTA
              </div>
              <div style={{ display: "flex", fontSize: "34px", color: "white" }}>→</div>
            </div>
          </>
        ) : null}

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
            flexDirection: "column",
            position: "absolute",
            top: `${L.mask.top}px`,
            left: `${L.paddingX.left}px`,
            width: `${L.width - L.paddingX.left - L.paddingX.right}px`,
            height: `${L.mask.height}px`,
            justifyContent: "center",
            alignItems: variant === "story" ? "center" : "flex-start",
            gap: "26px",
          }}
        >
          <div
            style={{
              display: "flex",
              width: "100%",
              fontSize: variant === "story" ? "44px" : "40px",
              fontWeight: 800,
              color: "#141414",
              lineHeight: 1.2,
              justifyContent: variant === "story" ? "center" : "flex-start",
              textAlign: variant === "story" ? "center" : "left",
            }}
          >
            {title}
          </div>

          {variant === "feed" ? (
            <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
              {PriceBlock}
              {DiscountBadge}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "26px" }}>
              {PriceBlock}
              {DiscountBadge}
            </div>
          )}
        </div>
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
