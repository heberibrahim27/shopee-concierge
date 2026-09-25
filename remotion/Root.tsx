import { Composition } from "remotion";
import { FogaoVideo } from "./FogaoVideo";
import { EndCard } from "./EndCard";
import { Cover } from "./Cover";
import { TresAchados, TRES_ACHADOS_TOTAL_FRAMES } from "./TresAchados";
import { CarrosselCover, CarrosselProduto, CarrosselOutro } from "./CarrosselSlide";
import { DestaqueCapa } from "./DestaqueCapa";

const FPS = 30;
const DURATION_SECONDS = 8;
const END_CARD_DURATION_SECONDS = 2.5;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FogaoVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "fogao-suggar.jpg",
          productName: "Fogão 4 Bocas Suggar Cook Glass",
          priceFrom: "R$ 1.136,72",
          priceTo: "R$ 659,30",
          discountLabel: "42% OFF",
        }}
      />
      <Composition
        id="TabletVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "tablet-front-crop.jpg",
          productName: 'Tablet 10.1" com Teclado + Mouse 6GB RAM 128GB Android 13',
          priceFrom: "R$ 1.510,78",
          priceTo: "R$ 558,99",
          discountLabel: "63% OFF",
        }}
      />
      <Composition
        id="TabletSceneVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "tablet-scene.webp",
          productName: 'Tablet 10.1" com Teclado + Mouse 6GB RAM 128GB Android 13',
          priceFrom: "R$ 1.510,78",
          priceTo: "R$ 558,99",
          discountLabel: "63% OFF",
        }}
      />
      <Composition
        id="TabletEndCard"
        component={EndCard}
        durationInFrames={Math.round(24 * END_CARD_DURATION_SECONDS)}
        fps={24}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "tablet-front-crop.jpg",
          productName: 'Tablet 10.1" com Teclado + Mouse 6GB RAM 128GB Android 13',
          priceFrom: "R$ 1.510,78",
          priceTo: "R$ 558,99",
          discountLabel: "63% OFF",
        }}
      />
      <Composition
        id="ParafusadeiraVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-parafusadeira.png",
          productName: "Parafusadeira Furadeira 48V Bateria De Lítio",
          priceFrom: "R$ 196,06",
          priceTo: "R$ 99,99",
          discountLabel: "49% OFF",
        }}
      />
      <Composition
        id="MesaVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-mesa.png",
          productName: "Mesa de Cabeceira Retrô Compacta com Nicho",
          priceFrom: "R$ 49,85",
          priceTo: "R$ 32,90",
          discountLabel: "34% OFF",
        }}
      />
      <Composition
        id="CafeteiraVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-cafeteira.png",
          productName: "Cafeteira Italiana Inox Premium Expressa",
          priceFrom: "R$ 83,13",
          priceTo: "R$ 39,90",
          discountLabel: "52% OFF",
        }}
      />
      <Composition
        id="TenisVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-tenis.png",
          productName: "Tênis Feminino Casual Vizzano Metalizado",
          priceFrom: "R$ 220,00",
          priceTo: "R$ 167,20",
          discountLabel: "24% OFF",
        }}
      />
      <Composition
        id="FloresVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-flores.png",
          productName: "30 Peças Flores Artificiais Gypsophila",
          priceFrom: "R$ 38,17",
          priceTo: "R$ 27,48",
          discountLabel: "28% OFF",
        }}
      />
      <Composition
        id="ColchaoVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-colchao.png",
          productName: "Capa de Colchão Pelúcia Veludo",
          priceFrom: "R$ 105,50",
          priceTo: "R$ 105,50",
          discountLabel: "MENOR PREÇO",
        }}
      />
      <Composition
        id="MoletomVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-moletom.png",
          productName: "Calça Pantalona Wide Leg Moletom Feminina",
          priceFrom: "R$ 70,13",
          priceTo: "R$ 46,99",
          discountLabel: "33% OFF",
        }}
      />
      <Composition
        id="KitSacolinhaVideo"
        component={FogaoVideo}
        durationInFrames={FPS * DURATION_SECONDS}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "cinema-kit-sacolinha.png",
          productName: "Kit 100 Brinquedos Sortidos Sacolinha Surpresa",
          priceFrom: "R$ 40,96",
          priceTo: "R$ 29,90",
          discountLabel: "27% OFF",
        }}
      />
      <Composition
        id="TresAchadosR40"
        component={TresAchados}
        durationInFrames={TRES_ACHADOS_TOTAL_FRAMES}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          kicker: "ABAIXO DE R$ 40",
          achados: [
            {
              photoFile: "achado-suporte.jpg",
              productName: "Suporte Magnético de Celular para Carro",
              priceFrom: "R$ 18,17",
              priceTo: "R$ 10,90",
              discountLabel: "40% OFF",
            },
            {
              photoFile: "achado-cozedor.jpg",
              productName: "Cozedor de Ovos Elétrico Portátil 7 Ovos",
              priceFrom: "R$ 70,16",
              priceTo: "R$ 39,99",
              discountLabel: "43% OFF",
            },
            {
              photoFile: "achado-pentes.jpg",
              productName: "Kit 10 Ferramentas para Tranças e Penteados",
              priceFrom: "R$ 42,20",
              priceTo: "R$ 18,99",
              discountLabel: "55% OFF",
            },
          ],
          ctaLine1: "Segue a Descontos Chegando",
          ctaLine2: "amanhã tem mais 3 achados",
        }}
      />
      <Composition
        id="CarrosselCover"
        component={CarrosselCover}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={{
          kicker: "ABAIXO DE R$ 40",
          headline: "3 achados",
        }}
      />
      <Composition
        id="CarrosselProduto"
        component={CarrosselProduto}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={{
          photoFile: "achado-suporte.jpg",
          productName: "Suporte Magnético de Celular para Carro",
          priceFrom: "R$ 18,17",
          priceTo: "R$ 10,90",
          discountLabel: "40% OFF",
          index: 1,
          total: 3,
        }}
      />
      <Composition
        id="CarrosselOutro"
        component={CarrosselOutro}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={{
          ctaLine1: "Segue a Descontos Chegando",
          ctaLine2: "amanhã tem mais achados",
        }}
      />
      <Composition
        id="DestaqueCapa"
        component={DestaqueCapa}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          label: "CASA",
          accentColor: "#f59e0b",
        }}
      />
      <Composition
        id="CoverExample"
        component={Cover}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          photoFile: "tablet-scene.webp",
          kicker: "ACHADINHO DE HOJE",
          headline: "Tablet com teclado",
          price: 558.99,
        }}
      />
    </>
  );
};
