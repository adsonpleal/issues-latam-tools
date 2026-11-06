import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { NovoIssueForm } from "../features/enviar/NovoIssueForm";

export function NewIssuePage() {
  useSeo({
    title: `${t.formTitle} — ${t.siteName} ${t.siteSubtitle}`,
    description: t.formSubtitle,
    path: "/novo",
  });

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>
      <h1>{t.formTitle}</h1>
      <p className="subtitulo">{t.formSubtitle}</p>
      <NovoIssueForm />
    </div>
  );
}
