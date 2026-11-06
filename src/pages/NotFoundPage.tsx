import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";

export function NotFoundPage() {
  useSeo({ title: `${t.notFound} — ${t.siteName}` });
  return (
    <div className="pagina pagina-estreita">
      <h1>{t.notFound}</h1>
      <p className="subtitulo">{t.notFoundHelp}</p>
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>
    </div>
  );
}
