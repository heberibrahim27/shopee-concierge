import { AdminShell } from "../../../components/admin/AdminShell";
import { AdminSectionHeader } from "../../../components/admin/RankingCard";
import { LogoutIcon } from "../../../components/admin/icons";

export const dynamic = "force-dynamic";

export default function AdminMorePage() {
  return (
    <AdminShell title="Mais">
      <section className="dc-admin-section">
        <div className="dc-admin-card">
          <AdminSectionHeader title="Conta" />
          <a
            href="/api/admin/logout"
            className="dc-admin-issue-action"
            style={{ width: "fit-content", padding: "9px 16px" }}
          >
            <LogoutIcon size={14} />
            Sair do painel
          </a>
        </div>
      </section>
    </AdminShell>
  );
}
