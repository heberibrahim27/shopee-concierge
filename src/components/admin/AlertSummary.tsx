import { AlertTriangleIcon, ShieldCheckIcon } from "./icons";

export function AlertSummary({
  blocked,
  dead,
  semPreco,
  semImagem,
  seeAllHref,
}: {
  blocked: number;
  dead: number;
  semPreco: number;
  semImagem: number;
  seeAllHref: string;
}) {
  const total = blocked + dead + semPreco + semImagem;
  const items = [
    { label: "verificações bloqueadas", count: blocked },
    { label: "links mortos", count: dead },
    { label: "sem preço", count: semPreco },
    { label: "sem imagem", count: semImagem },
  ];

  if (total === 0) {
    return (
      <div className="dc-admin-alert dc-admin-alert-ok">
        <p className="dc-admin-alert-title">
          <ShieldCheckIcon size={18} />
          Operação normal
        </p>
        <p className="dc-admin-alert-subtitle" style={{ color: "var(--dc-text-muted)" }}>
          Nenhum item precisa de atenção agora.
        </p>
      </div>
    );
  }

  return (
    <div className="dc-admin-alert">
      <p className="dc-admin-alert-title">
        <AlertTriangleIcon size={18} />
        Atenção necessária
      </p>
      <p className="dc-admin-alert-subtitle">Alguns itens precisam da sua atenção.</p>
      <div className="dc-admin-alert-grid">
        {items.map((item) => (
          <div className="dc-admin-alert-item" key={item.label}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <a className="dc-admin-alert-cta" href={seeAllHref}>
        Ver diagnóstico
      </a>
    </div>
  );
}
