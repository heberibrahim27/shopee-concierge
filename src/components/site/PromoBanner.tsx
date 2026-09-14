/**
 * Banner do topo — por enquanto só o card com a arte pronta (texto já vem
 * desenhado na imagem — tudo bem aqui porque é copy fixa, não precisa de
 * campo editável como o buscador). Nada de scroll horizontal por ora: só
 * um card, sem "peek" de próximo slide.
 */
export function PromoBanner() {
  return (
    <a href="/categorias" className="dc-promo-single">
      <img src="/BANNER-FINAL.png" alt="Compare e economize: os menores preços dos maiores marketplaces, tudo em um só lugar" />
    </a>
  );
}
