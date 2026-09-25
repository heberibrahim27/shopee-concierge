// Breadcrumb real (link crawlável + BreadcrumbList) -- Google documenta
// isso como ajuda pra entender hierarquia da página, sugestão do
// ChatGPT na revisão das páginas de intenção de compra. Server
// component simples, sem JS no cliente.
const SITE_URL = "https://descontochegando.com.br";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  };

  return (
    <nav className="dc-breadcrumb" aria-label="Caminho da página">
      {items.map((item, i) => (
        <span key={i}>
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
          {i < items.length - 1 ? " › " : ""}
        </span>
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
