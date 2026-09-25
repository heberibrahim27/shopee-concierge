/**
 * Ícones em SVG puro (sem emoji) — herdam cor via `currentColor`, então o
 * tamanho/cor é controlado 100% por CSS a partir de quem usa o ícone.
 */
import { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

const lineProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function WhatsAppIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.05 2C6.578 2 2.13 6.447 2.13 11.92c0 1.826.5 3.535 1.362 5.001L2 22l5.223-1.454a9.876 9.876 0 0 0 4.827 1.226h.004c5.472 0 9.92-4.448 9.92-9.92C21.974 6.38 17.522 2 12.05 2zm0 18.11h-.003a8.19 8.19 0 0 1-4.174-1.145l-.3-.178-3.099.863.83-3.05-.196-.312a8.176 8.176 0 0 1-1.253-4.368c0-4.516 3.677-8.192 8.198-8.192 2.19 0 4.248.853 5.795 2.402a8.14 8.14 0 0 1 2.4 5.796c0 4.516-3.677 8.184-8.198 8.184z" />
    </svg>
  );
}

export function CameraIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.6l.9-1.6A1.5 1.5 0 0 1 9.3 4.6h5.4a1.5 1.5 0 0 1 1.3.8l.9 1.6h1.6A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z" />
      <circle cx="12" cy="12.5" r="3.3" />
    </svg>
  );
}

export function FlameIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d="M12.5 2c.6 2.4-.4 3.7-1.6 5-1.4 1.5-2.9 3.1-2.9 5.8a4 4 0 0 0 8 0c0-1-.3-1.8-.7-2.5.9.6 1.7 1.7 1.7 3.5a5 5 0 0 1-10 0c0-4 2.3-6 4-7.7C11.9 4.9 12.6 3.7 12.5 2Z" />
    </svg>
  );
}

export function AwardIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 13.5 7.5 21l4.5-2.3L16.5 21 15 13.5" />
    </svg>
  );
}

export function StarIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d="M12 2.5l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.6l-5.6 3 1.4-6.3-4.8-4.3 6.4-.6L12 2.5Z" />
    </svg>
  );
}

export function HomeIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function PlugIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M9 2.5v4M15 2.5v4" />
      <path d="M6.5 6.5h11v4a5.5 5.5 0 0 1-11 0v-4Z" />
      <path d="M12 16v3M9 21.5h6" />
    </svg>
  );
}

export function WrenchIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
    </svg>
  );
}

export function SparkleIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <path d="M12 2c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5C10.1 7 11.5 5.6 12 2Z" />
      <path d="M18.5 15c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8Z" />
    </svg>
  );
}

export function ShirtIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M8 3 4 6.5 6 9l2-1.5V20h8V7.5L18 9l2-2.5L16 3l-2 2h-4L8 3Z" />
    </svg>
  );
}

export function HeartIcon({ size = 18, style, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d="M12 20.5s-7.5-4.6-10-9.3C.4 7.8 2 4.5 5.3 3.7c2-.5 4 .3 5.2 2 .3.4.8.4 1 0 1.2-1.7 3.2-2.5 5.2-2 3.3.8 4.9 4.1 3.3 7.5-2.5 4.7-10 9.3-10 9.3Z" />
    </svg>
  );
}

export function SearchIcon({ size = 18, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="M20 20l-4.35-4.35" />
    </svg>
  );
}

export function GridIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function CartIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20.5 8H6.2" />
      <circle cx="9.5" cy="20.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="20.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M4 12h15.5" />
      <path d="M13.5 5.5 20 12l-6.5 6.5" />
    </svg>
  );
}

export const CATEGORY_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  casa: HomeIcon,
  eletronicos: PlugIcon,
  ferramentas: WrenchIcon,
  beleza: SparkleIcon,
  moda: ShirtIcon,
  infantil: GiftIcon,
};

export function GiftIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 9h16v3.5H4z" />
      <path d="M12 9v11" />
      <path d="M12 9c-1-2.5-3-3.5-4.2-2.7C6.6 7 7 9 12 9Zm0 0c1-2.5 3-3.5 4.2-2.7C17.4 7 17 9 12 9Z" />
    </svg>
  );
}

export function ShareIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <circle cx="18" cy="5" r="2.3" />
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="18" cy="19" r="2.3" />
      <path d="M8.1 10.8 15.9 6.2M8.1 13.2l7.8 4.6" />
    </svg>
  );
}

export function BulbIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...lineProps} aria-hidden="true" style={style}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.95V16h5v-.15c0-.8.4-1.5 1-1.95A6 6 0 0 0 12 3Z" />
    </svg>
  );
}
