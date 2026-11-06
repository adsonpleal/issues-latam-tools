import { Link, useSearchParams } from "react-router-dom";

import { useSession } from "../features/admin/SessaoContext";
import { TYPE_LABEL, t } from "../i18n";
import { PROJECTS, PROJECT_SLUGS, parseProject } from "../lib/projetos";
import { ISSUE_TYPES, isIssueType } from "../lib/status";

/**
 * Os filtros moram na querystring, não em estado local: mudar o filtro já deixa
 * a URL pronta para compartilhar, e é essa mesma URL que o botão "Acompanhar"
 * dos outros sites abre (`/?projeto=visuais`).
 *
 * A barra é a mesma para todo mundo. Com sessão de admin ela ganha o nome, o
 * link das gravações e o Sair — que era o cabeçalho do portão de /admin, na
 * época em que existia uma rota para pendurá-lo.
 */
export function TopBar() {
  const { session, admin, signOut } = useSession();
  const [params, setParams] = useSearchParams();
  const project = parseProject(params.get("projeto"));
  const rawType = params.get("tipo");
  const type = isIssueType(rawType) ? rawType : null;
  const search = params.get("busca") ?? "";

  function atualiza(chave: string, value: string) {
    const nextParams = new URLSearchParams(params);
    if (value) nextParams.set(chave, value);
    else nextParams.delete(chave);
    setParams(nextParams, { replace: true });
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
            onChange={(e) => atualiza("projeto", e.target.value)}
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
            onChange={(e) => atualiza("tipo", e.target.value)}
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
            onChange={(e) => atualiza("busca", e.target.value)}
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
