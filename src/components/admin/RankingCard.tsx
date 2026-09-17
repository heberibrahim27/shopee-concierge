import { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export function AdminSectionHeader({
  title,
  subtitle,
  seeAllHref,
  seeAllLabel,
}: {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className="dc-admin-section-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {seeAllHref ? (
        <a className="dc-admin-see-all" href={seeAllHref}>
          {seeAllLabel ?? "Ver todos"} →
        </a>
      ) : null}
    </div>
  );
}

export function RankingCard({
  title,
  subtitle,
  rows,
  emptyMessage,
  icon,
}: {
  title: string;
  subtitle?: string;
  rows: [string, number][];
  emptyMessage: string;
  icon?: ReactNode;
}) {
  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title={title} subtitle={subtitle} />
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div>
          {rows.map(([label, value], i) => (
            <div className="dc-admin-ranking-row" key={label}>
              <span className="dc-admin-ranking-index">{i + 1}</span>
              {icon}
              <span className="dc-admin-ranking-label">{label}</span>
              <span className="dc-admin-ranking-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
