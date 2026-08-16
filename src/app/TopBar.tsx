import { Link, useSearchParams } from "react-router-dom";

import { LABEL_TIPO, t } from "../i18n";
import { PROJETOS, SLUGS_PROJETO, parseProjeto } from "../lib/projetos";
import { TIPOS, isTipo } from "../lib/status";

/**
 * Os filtros moram na querystring, não em estado local: mudar o filtro já deixa
 * a URL pronta para compartilhar, e é essa mesma URL que o botão "Acompanhar"
 * dos outros sites abre (`/?projeto=visuais`).
 */
export function TopBar() {
  const [params, setParams] = useSearchParams();
  const projeto = parseProjeto(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const tipo = isTipo(tipoBruto) ? tipoBruto : null;
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
            {SLUGS_PROJETO.map((slug) => (
              <option key={slug} value={slug}>
                {PROJETOS[slug].nome}
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
            {TIPOS.map((tp) => (
              <option key={tp} value={tp}>
                {LABEL_TIPO[tp]}
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
