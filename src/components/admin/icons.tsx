import { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DashboardIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <rect x="3.5" y="3.5" width="7.5" height="9" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="5.5" rx="1.5" />
      <rect x="13" y="12" width="7.5" height="8.5" rx="1.5" />
      <rect x="3.5" y="15.5" width="7.5" height="5" rx="1.5" />
    </svg>
  );
}

export function PackageIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M3.5 7.5 12 3l8.5 4.5L12 12 3.5 7.5Z" />
      <path d="M3.5 7.5V16l8.5 4.5V12" />
      <path d="M20.5 7.5V16L12 20.5" />
    </svg>
  );
}

export function SwapIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M4 8h13.5M17.5 8 14 4.5M4 8l3.5 3.5" />
      <path d="M20 16H6.5M6.5 16 10 19.5M20 16l-3.5-3.5" />
    </svg>
  );
}

export function ChartIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2.5 20.5h19" />
    </svg>
  );
}

export function MoreIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EyeIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ClickIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M9 3.5v3M4.5 6l2.1 2.1M3.5 12.5h3" />
      <path d="M11 9.5 20 13l-4 1.3-1.3 4L11 9.5Z" />
    </svg>
  );
}

export function ImageIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5 9.5 12l3 3 3-3.5 4.5 6" />
    </svg>
  );
}

export function LinkOffIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M12 6.5 14 4.5a3 3 0 0 1 4.2 4.2L16.2 10.7" />
      <path d="M12 17.5 10 19.5a3 3 0 0 1-4.2-4.2L7.8 13.3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M12 3.5 19 6v6c0 4.5-3 7-7 8.5-4-1.5-7-4-7-8.5V6l7-2.5Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function RefreshIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M20 11a8 8 0 0 0-14.5-4.5M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5M20 19v-4h-4" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M9 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </svg>
  );
}

export function LogoutIcon({ size = 16, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...line} aria-hidden="true" style={style}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function TagIcon({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
