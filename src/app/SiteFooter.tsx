import { t } from "../i18n";

const DISCORD = "https://discord.gg/JCXTqqWq9Q";
const REPO = "https://github.com/adsonpleal/issues-latam-tools";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        {t.maisFerramentas}{" "}
        <a href="https://latam-tools.com.br" target="_blank" rel="noopener noreferrer">
          latam-tools.com.br
        </a>
        .
      </p>
      <p>
        {t.entreNoDiscord}{" "}
        <a href={DISCORD} target="_blank" rel="noopener noreferrer">
          Discord
        </a>
        . {t.codigoAberto}{" "}
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </p>
    </footer>
  );
}
