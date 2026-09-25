import { AdminShell } from "../../../components/admin/AdminShell";
import { KpiCard } from "../../../components/admin/KpiCard";
import { AdminSectionHeader } from "../../../components/admin/RankingCard";
import { EmptyState } from "../../../components/admin/EmptyState";
import { StatusChip } from "../../../components/admin/StatusChip";
import { TagIcon, ClickIcon, ChartIcon, AlertTriangleIcon } from "../../../components/admin/icons";
import { getAdminCoupons } from "../../../lib/admin/coupons";

export const dynamic = "force-dynamic";

/**
 * Cupons — por que o site decidiu o que decidiu sobre cada um. Só
 * leitura nesta versão (pausar/corrigir associação: ver CONTINUIDADE.md).
 */
export default async function AdminCouponsPage() {
  const { rows, kpis } = await getAdminCoupons();

  return (
    <AdminShell title="Cupons">
      <p style={{ margin: "-8px 0 16px", fontSize: 12.5, color: "var(--dc-text-muted)" }}>
        Cada cupom com a regra que o site extraiu do texto, o motivo de calcular ou não o preço estimado, e os
        votos de quem usou. Os cupons vêm das redes (Awin, Lomadee, Shopee) — o texto é o que a loja mandou.
      </p>

      <section className="dc-admin-section">
        <div className="dc-admin-kpi-grid">
          <KpiCard icon={<TagIcon size={16} />} label="Cupons ativos" value={kpis.ativos} />
          <KpiCard icon={<ClickIcon size={16} />} label="Com código" value={kpis.comCodigo} />
          <KpiCard icon={<ChartIcon size={16} />} label="Com preço estimado liberado" value={kpis.estimativaLiberada} />
          <KpiCard icon={<AlertTriangleIcon size={16} />} label="Votos (7 dias)" value={kpis.votos7d} />
        </div>
      </section>

      <section className="dc-admin-section">
        <div className="dc-admin-card">
          <AdminSectionHeader
            title="Decisão por cupom"
            subtitle={`${kpis.expirados30d} expiraram nos últimos 30 dias. Votos contam os últimos 30 dias.`}
          />
          {rows.length === 0 ? (
            <EmptyState message="Nenhum cupom ativo agora." />
          ) : (
            <div>
              {rows.map((row) => (
                <div key={row.id} className="dc-admin-coupon-row">
                  <div className="dc-admin-coupon-head">
                    <strong>{row.storeLabel}</strong>
                    <span className="dc-admin-coupon-source">{row.source}</span>
                    {row.code ? (
                      <code className="dc-admin-coupon-code">
                        {row.code}
                        {row.codeFromText ? " (lido do título)" : ""}
                      </code>
                    ) : (
                      <StatusChip label="sem código" tone="neutral" />
                    )}
                    <StatusChip label={row.estimate.allowed ? "estimativa liberada" : "sem estimativa"} tone={row.estimate.allowed ? "ok" : "neutral"} />
                  </div>
                  <p className="dc-admin-coupon-title">{row.title}</p>
                  <dl className="dc-admin-coupon-facts">
                    <dt>Regra extraída</dt>
                    <dd>{row.ruleLine ?? "nenhuma (sem valor, sem escopo)"}</dd>
                    <dt>Escopo</dt>
                    <dd>
                      {row.rule.scopeKind === "none"
                        ? "genérico"
                        : `${row.rule.scopeKind === "brand" ? "marca" : "categoria"}: ${row.rule.scopeTerms.join(", ")}`}
                      {row.matchedProducts !== null ? ` · ${row.matchedProducts} produtos da loja casam` : ""}
                    </dd>
                    <dt>Restrições</dt>
                    <dd>
                      {row.rule.eligibilityRestricted ? "itens selecionados / promoção / quantidade" : "nenhuma no texto"}
                      {row.rule.minPurchase ? ` · mínimo R$${row.rule.minPurchase}` : ""}
                      {row.rule.maxDiscount ? ` · teto R$${row.rule.maxDiscount}` : ""}
                    </dd>
                    <dt>Validade</dt>
                    <dd>
                      <StatusChip label={row.validity.label} tone={row.validity.tone} />
                      {row.updatedAt ? ` · atualizado ${new Date(row.updatedAt).toLocaleDateString("pt-BR")}` : ""}
                    </dd>
                    <dt>Decisão</dt>
                    <dd>{row.estimate.reason}</dd>
                    <dt>Votos</dt>
                    <dd>
                      {row.votes.up + row.votes.down === 0
                        ? "nenhum ainda"
                        : `${row.votes.up} funcionou · ${row.votes.down} não funcionou (amostra de ${row.votes.up + row.votes.down})`}
                    </dd>
                  </dl>
                  <div className="dc-admin-issue-actions">
                    <a className="dc-admin-issue-action" href={`/cupom/${row.storeSlug}`} target="_blank" rel="noreferrer">
                      Ver no site
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
