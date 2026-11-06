import { Link, useSearchParams } from "react-router-dom";

import { useSessao } from "../features/admin/SessaoContext";
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
  const { sessao, admin, sair } = useSessao();
  const [params, setParams] = useSearchParams();
  const projeto = parseProject(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const tipo = isIssueType(tipoBruto) ? tipoBruto : null;
  const busca = params.get("busca") ?? "";

  function atualiza(chave: string, valor: string) {
    const novos = new URLSearchParams(params);
    if (valor) novos.set(chave, valor);
    else novos.delete(chave);
    setParams(novos, { replace: true });
  }

  return (
    <header className="topbar">
      <div className="topbar-marca">
        <Link to="/" className="topbar-titulo">
          {t.siteNome} <span className="topbar-sub">{t.siteSub}</span>
        </Link>
      </div>

      <div className="topbar-filtros">
        <label className="campo-inline">
          <span className="visually-hidden">{t.filtrarProjeto}</span>
          <select
            value={projeto ?? ""}
            onChange={(e) => atualiza("projeto", e.target.value)}
            title={t.filtrarProjeto}
          >
            <option value="">{t.todosProjetos}</option>
            {PROJECT_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {PROJECTS[slug].name}
              </option>
            ))}
          </select>
        </label>

        <label className="campo-inline">
          <span className="visually-hidden">{t.filtrarTipo}</span>
          <select
            value={tipo ?? ""}
            onChange={(e) => atualiza("tipo", e.target.value)}
            title={t.filtrarTipo}
          >
            <option value="">{t.todosTipos}</option>
            {ISSUE_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {TYPE_LABEL[tp]}
              </option>
            ))}
          </select>
        </label>

        <label className="campo-inline">
          <span className="visually-hidden">{t.buscar}</span>
          <input
            type="search"
            value={busca}
            placeholder={t.buscarPlaceholder}
            onChange={(e) => atualiza("busca", e.target.value)}
          />
        </label>
      </div>

      <div className="topbar-acoes">
        {admin && (
          <span className="admin-sessao">
            <span>{sessao?.nome}</span>
            <Link to="/gravacoes">{t.gravacoesLink}</Link>
            <button type="button" className="botao botao-pequeno" onClick={() => void sair()}>
              {t.sair}
            </button>
          </span>
        )}
        <Link
          className="botao botao-primario"
          to={projeto ? `/novo?projeto=${projeto}` : "/novo"}
          title={t.reportarTitulo}
        >
          {t.reportar}
        </Link>
      </div>
    </header>
  );
}
