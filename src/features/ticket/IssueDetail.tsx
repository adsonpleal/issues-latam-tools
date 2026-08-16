import { Link } from "react-router-dom";

import { LABEL_STATUS, LABEL_TIPO, t } from "../../i18n";
import { formatData } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJETOS } from "../../lib/projetos";
import { useVotos } from "../votos/useVotos";
import { TextoComLinks } from "./TextoComLinks";

export function IssueDetail({ issue }: { issue: Issue }) {
  const { jaVotou, votar } = useVotos();
  const projeto = PROJETOS[issue.projeto];
  const votou = jaVotou(issue.id);

  return (
    <article className="issue-detalhe">
      <div className="issue-detalhe-selos">
        <Link
          className="selo selo-projeto"
          style={{ borderColor: projeto.cor, color: projeto.cor }}
          to={`/?projeto=${issue.projeto}`}
        >
          {projeto.nome}
        </Link>
        <span className={`selo selo-tipo selo-${issue.tipo}`}>{LABEL_TIPO[issue.tipo]}</span>
        <span className={`selo selo-status selo-${issue.status}`}>
          {LABEL_STATUS[issue.status]}
        </span>
      </div>

      <h1>{issue.titulo}</h1>

      <p className="issue-detalhe-meta">
        {formatData(issue.criadoEm)}
        {issue.autor && <> · {t.reportadoPor(issue.autor)}</>}
      </p>

      {issue.descricao && (
        <div className="issue-detalhe-descricao">
          <TextoComLinks texto={issue.descricao} />
        </div>
      )}

      <button
        type="button"
        className={votou ? "voto voto-feito" : "voto"}
        onClick={() => void votar(issue.id)}
        disabled={votou}
        title={votou ? t.jaVotou : t.votarTitulo}
      >
        <span aria-hidden="true">▲</span> {issue.upvotes} {votou ? "" : t.votar}
      </button>
    </article>
  );
}
