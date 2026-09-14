import { Logo } from "./Logo";
import { buildWhatsAppLink } from "./constants";
import { WhatsAppIcon } from "./icons";

export function Header() {
  return (
    <header className="dc-header">
      <div className="dc-shell dc-header-row">
        <Logo />
        <a
          className="dc-whatsapp-link"
          href={buildWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsAppIcon size={16} />
          WhatsApp
        </a>
      </div>
    </header>
  );
}
