import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { NovoIssueForm } from "../features/enviar/NovoIssueForm";

export function NewIssuePage() {
  useSeo({
    title: `${t.novoTitulo} — ${t.siteNome} ${t.siteSub}`,
    description: t.novoSub,
    path: "/novo",
  });

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.voltar}
        </Link>
      </p>
      <h1>{t.novoTitulo}</h1>
      <p className="subtitulo">{t.novoSub}</p>
      <NovoIssueForm />
    </div>
  );
}
