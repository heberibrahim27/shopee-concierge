import { AdminShell } from "../../../components/admin/AdminShell";
import { AdminSectionHeader } from "../../../components/admin/RankingCard";
import { getAuthStatus, pinterestRedirectUri } from "../../../lib/pinterest/auth";
import { listBoards, type PinterestBoard } from "../../../lib/pinterest/client";

export const dynamic = "force-dynamic";

const buttonStyle = { width: "fit-content", padding: "9px 16px" } as const;

export default async function AdminPinterestPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const status = await getAuthStatus();
  const hasSecret = Boolean(process.env.PINTEREST_APP_SECRET);

  let boards: PinterestBoard[] = [];
  let boardsError: string | null = null;
  if (status.connected) {
    try {
      boards = await listBoards();
    } catch (err: any) {
      boardsError = String(err?.message ?? err).slice(0, 300);
    }
  }

  return (
    <AdminShell title="Pinterest">
      {ok && <p className="dc-admin-card" style={{ borderLeft: "4px solid #2e7d32" }}>{ok}</p>}
      {erro && <p className="dc-admin-card" style={{ borderLeft: "4px solid #c62828" }}>{erro}</p>}

      <section className="dc-admin-section">
        <div className="dc-admin-card">
          <AdminSectionHeader
            title="Conexão"
            subtitle={status.connected ? "Conta do Pinterest conectada." : "Conecte a conta do Pinterest para o Desconto Chegando publicar Pins."}
          />
          {status.connected && (
            <p style={{ fontSize: 13, opacity: 0.8 }}>
              Escopos: {status.scope ?? "—"} · token renova sozinho (acesso até {status.accessExpiresAt ? new Date(status.accessExpiresAt).toLocaleString("pt-BR") : "—"})
            </p>
          )}
          {!hasSecret && <p style={{ fontSize: 13, color: "#c62828" }}>PINTEREST_APP_SECRET ainda não configurado no ambiente.</p>}
          <a href="/api/admin/pinterest/connect" className="dc-admin-issue-action" style={buttonStyle}>
            {status.connected ? "Reconectar Pinterest" : "Conectar Pinterest"}
          </a>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>URL de retorno cadastrada no app: {pinterestRedirectUri()}</p>
        </div>
      </section>

      {status.connected && (
        <section className="dc-admin-section">
          <div className="dc-admin-card">
            <AdminSectionHeader title="Boards e Pin de teste" subtitle="Cria 1 Pin com o próximo produto do catálogo, apontando para a página dele no site." />
            {boardsError && <p style={{ fontSize: 13, color: "#c62828" }}>{boardsError}</p>}
            {boards.length === 0 && !boardsError && <p style={{ fontSize: 13 }}>Nenhum board encontrado -- crie um no Pinterest.</p>}
            {boards.length > 0 && (
              <form method="post" action="/api/admin/pinterest/test-pin" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select name="board_id" required style={{ padding: "8px 10px" }}>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
                <button type="submit" className="dc-admin-issue-action" style={buttonStyle}>
                  Criar Pin de teste
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </AdminShell>
  );
}
