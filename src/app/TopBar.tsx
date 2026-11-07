import { Link, useSearchParams } from "react-router-dom";

import { useSession } from "../features/admin/SessaoContext";
import { TYPE_LABEL, t } from "../i18n";
import { PROJECTS, PROJECT_SLUGS, parseProject } from "../lib/projetos";
import { ISSUE_TYPES, isIssueType } from "../lib/status";

/**
 * The filters live in the query string, not in local state: changing a filter
 * already leaves the URL ready to share, and it is that same URL the other
 * sites' "Acompanhar" button opens (`/?projeto=visuais`).
 *
 * The bar is the same for everybody. With an admin session it gains the name,
 * the recordings link and Sair -- which used to be the header of the /admin
 * gate, back when there was a route to hang it on.
 *
 * The parameter names are public URLs, so they keep their spelling.
 */
export function TopBar() {
  const { session, admin, signOut } = useSession();
  const [params, setParams] = useSearchParams();
  const project = parseProject(params.get("projeto"));
  const rawType = params.get("tipo");
  const type = isIssueType(rawType) ? rawType : null;
  const search = params.get("busca") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <header className="topbar">
      <div className="topbar-marca">
        <Link to="/" className="topbar-titulo">
          {t.siteName} <span className="topbar-sub">{t.siteSubtitle}</span>
        </Link>
      </div>

      <div className="topbar-filtros">
        <label className="campo-inline">
          <span className="visually-hidden">{t.filterByProject}</span>
          <select
            value={project ?? ""}
            onChange={(e) => update("projeto", e.target.value)}
            title={t.filterByProject}
          >
            <option value="">{t.allProjects}</option>
            {PROJECT_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {PROJECTS[slug].name}
              </option>
            ))}
          </select>
        </label>

        <label className="campo-inline">
          <span className="visually-hidden">{t.filterByType}</span>
          <select
            value={type ?? ""}
            onChange={(e) => update("tipo", e.target.value)}
            title={t.filterByType}
          >
            <option value="">{t.allTypes}</option>
            {ISSUE_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {TYPE_LABEL[tp]}
              </option>
            ))}
          </select>
        </label>

        <label className="campo-inline">
          <span className="visually-hidden">{t.search}</span>
          <input
            type="search"
            value={search}
            placeholder={t.searchPlaceholder}
            onChange={(e) => update("busca", e.target.value)}
          />
        </label>
      </div>

      <div className="topbar-acoes">
        {admin && (
          <span className="admin-sessao">
            <span>{session?.name}</span>
            <Link to="/gravacoes">{t.recordingsLink}</Link>
            <button type="button" className="botao botao-pequeno" onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </span>
        )}
        <Link
          className="botao botao-primario"
          to={project ? `/novo?projeto=${project}` : "/novo"}
          title={t.reportTitle}
        >
          {t.report}
        </Link>
      </div>
    </header>
  );
}
