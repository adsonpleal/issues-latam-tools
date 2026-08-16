import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";

export function NotFoundPage() {
  useSeo({ title: `${t.naoEncontrado} — ${t.siteNome}` });
  return (
    <div className="pagina pagina-estreita">
      <h1>{t.naoEncontrado}</h1>
      <p className="subtitulo">{t.naoEncontradoAjuda}</p>
      <p>
        <Link to="/" className="link-voltar">
          ← {t.voltar}
        </Link>
      </p>
    </div>
  );
}
