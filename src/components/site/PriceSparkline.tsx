/**
 * Gráfico simples de histórico de preço (SVG puro, sem lib de gráfico --
 * mesmo estilo do resto do site, ver icons.tsx). Só é chamado pela página
 * de produto quando `dailySeries.length >= 7` (ver catalog.ts) -- com
 * menos pontos que isso, uma linha quase reta passa desconfiança em vez
 * de transmitir dado real, então nem chega a renderizar.
 */
interface PriceSparklineProps {
  series: { day: string; minPrice: number }[];
  width?: number;
  height?: number;
}

export function PriceSparkline({ series, width = 280, height = 64 }: PriceSparklineProps) {
  const prices = series.map((p) => p.minPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padding = 4;

  const points = series.map((p, i) => {
    const x = padding + (i / Math.max(1, series.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p.minPrice - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

  const lowestIndex = prices.indexOf(min);
  const lowestPoint = points[lowestIndex];

  const firstDay = new Date(series[0].day + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const lastDay = new Date(series[series.length - 1].day + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="dc-price-sparkline">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path d={areaPath} fill="var(--dc-brand)" opacity="0.08" />
        <path d={linePath} fill="none" stroke="var(--dc-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lowestPoint.x} cy={lowestPoint.y} r="3.5" fill="var(--dc-brand)" />
      </svg>
      <div className="dc-price-sparkline-labels">
        <span>{firstDay}</span>
        <span>{lastDay}</span>
      </div>
    </div>
  );
}
