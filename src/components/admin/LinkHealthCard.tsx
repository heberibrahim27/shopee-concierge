import { RevalidateLinksButton } from "./RevalidateLinksButton";
import { AdminSectionHeader } from "./RankingCard";
import { EmptyState } from "./EmptyState";
import { LinkHealthChip } from "./StatusChip";
import { ExternalLinkIcon, RefreshIcon } from "./icons";

interface IssueItem {
  slug: string;
  name: string;
  imageUrl: string | null;
  url: string | null;
  statusCode: number | null;
  kind: "blocked" | "dead";
}

export function LinkHealthCard({
  ok,
  blocked,
  dead,
  timeout,
  total,
  lastCheckedAt,
  needsAttention,
  showAll = false,
  seeAllHref,
}: {
  ok: number;
  blocked: number;
  dead: number;
  timeout: number;
  total: number;
  lastCheckedAt: string | null;
  needsAttention: IssueItem[];
  showAll?: boolean;
  seeAllHref?: string;
}) {
  const visibleIssues = showAll ? needsAttention : needsAttention.slice(0, 4);

  return (
    <div className="dc-admin-card">
      <div className="dc-admin-section-header">
        <div>
          <h2>Saúde dos links</h2>
          <p>
            {total === 0
              ? "Ainda não checamos os links."
              : `Última checagem${lastCheckedAt ? `: ${new Date(lastCheckedAt).toLocaleString("pt-BR")}` : ""}`}
          </p>
        </div>
        <RevalidateLinksButton />
      </div>

      {total === 0 ? (
        <EmptyState message='Clica em "Revalidar agora" pra checar os links pela primeira vez.' />
      ) : (
        <>
          <div className="dc-admin-link-health-grid">
            <div className="dc-admin-link-health-item">
              <strong>{ok}</strong>
              <span>OK</span>
            </div>
            <div className="dc-admin-link-health-item">
              <strong>{blocked}</strong>
              <span>Bloqueado (403)</span>
            </div>
            <div className="dc-admin-link-health-item">
              <strong>{dead}</strong>
              <span>Mortos (404/410)</span>
            </div>
            <div className="dc-admin-link-health-item">
              <strong>{timeout}</strong>
              <span>Timeout/erro</span>
            </div>
          </div>

          <div className="dc-admin-info">
            <RefreshIcon size={14} />
            403 pode indicar bloqueio da verificação automática, não necessariamente link quebrado.
          </div>

          {needsAttention.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <AdminSectionHeader
                title="Itens que precisam de atenção"
                seeAllHref={!showAll ? seeAllHref : undefined}
                seeAllLabel={`Ver todos (${needsAttention.length})`}
              />
              {visibleIssues.map((item) => (
                <div className="dc-admin-issue-row" key={item.slug}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dc-admin-issue-thumb" src={item.imageUrl} alt="" />
                  ) : (
                    <span className="dc-admin-issue-thumb" />
                  )}
                  <div className="dc-admin-issue-info">
                    <p className="dc-admin-issue-name">{item.name}</p>
                    <div className="dc-admin-issue-chips">
                      <LinkHealthChip kind={item.kind} />
                      {item.statusCode ? <StatusChipRaw code={item.statusCode} /> : null}
                    </div>
                  </div>
                  {item.url ? (
                    <div className="dc-admin-issue-actions">
                      <a className="dc-admin-issue-action" href={item.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLinkIcon size={13} />
                        Ver
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusChipRaw({ code }: { code: number }) {
  return <span className="dc-status-chip dc-status-chip-neutral">{code}</span>;
}
