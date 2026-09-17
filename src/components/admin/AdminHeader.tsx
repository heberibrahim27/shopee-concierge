import { DashboardIcon, LogoutIcon } from "./icons";

/**
 * "Atualizado há X" é calculado no server a partir de um timestamp real
 * passado por quem monta a página (ex: hora da última leitura do banco) —
 * nunca um texto fixo. `null` quando não há nada pra comparar ainda.
 */
function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return "agora";
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.floor(diffH / 24)}d`;
}

export function AdminHeader({
  title = "Painel — Desconto Chegando",
  updatedAt = null,
}: {
  title?: string;
  updatedAt?: string | null;
}) {
  return (
    <header className="dc-admin-header">
      <div className="dc-admin-header-title">
        <span className="dc-admin-header-icon">
          <DashboardIcon size={18} />
        </span>
        <div>
          <h1>{title}</h1>
          <p className="dc-admin-header-status">
            <span className="dc-admin-status-dot" />
            Atualizado {formatUpdatedAt(updatedAt)}
          </p>
        </div>
      </div>
      <a href="/api/admin/logout" className="dc-admin-logout">
        <LogoutIcon size={14} />
        Sair
      </a>
    </header>
  );
}
