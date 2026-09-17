import { AdminSectionHeader } from "./RankingCard";
import { EmptyState } from "./EmptyState";

interface DayPoint {
  day: string;
  visits: number;
  clicks: number;
}

function formatDayLabel(dayKey: string): string {
  const [, m, d] = dayKey.split("-");
  return `${d}/${m}`;
}

export function DailyTrendCard({ points }: { points: DayPoint[] }) {
  const totalVisits = points.reduce((a, p) => a + p.visits, 0);
  const totalClicks = points.reduce((a, p) => a + p.clicks, 0);
  const max = Math.max(1, ...points.map((p) => p.visits));

  return (
    <div className="dc-admin-card">
      <AdminSectionHeader title="Visitantes e cliques por dia" subtitle={`${points.length} dias`} />
      {totalVisits === 0 && totalClicks === 0 ? (
        <EmptyState message="Nenhuma visita ou clique registrado nesse período ainda." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {points.map((p) => (
            <div key={p.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--dc-text-muted)", width: 34, flexShrink: 0 }}>
                {formatDayLabel(p.day)}
              </span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <div
                  title={`${p.visits} visitas`}
                  style={{
                    height: 7,
                    borderRadius: 999,
                    background: "var(--dc-green)",
                    width: `${Math.max(3, (p.visits / max) * 100)}%`,
                  }}
                />
                <div
                  title={`${p.clicks} cliques`}
                  style={{
                    height: 7,
                    borderRadius: 999,
                    background: "var(--admin-blue)",
                    width: `${Math.max(3, (p.clicks / max) * 100)}%`,
                  }}
                />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, width: 62, textAlign: "right", flexShrink: 0 }}>
                {p.visits} / {p.clicks}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 11, color: "var(--dc-text-muted)" }}>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "var(--dc-green)", marginRight: 5 }} />
              Visitas ({totalVisits})
            </span>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "var(--admin-blue)", marginRight: 5 }} />
              Cliques ({totalClicks})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
