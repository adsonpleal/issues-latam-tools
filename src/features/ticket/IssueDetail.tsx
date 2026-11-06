import { Link } from "react-router-dom";

import { STATUS_LABEL, TYPE_LABEL, t } from "../../i18n";
import { formatData } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJECTS } from "../../lib/projetos";
import { useVotos } from "../votos/useVotos";
import { TextoComLinks } from "./TextoComLinks";

export function IssueDetail({ issue }: { issue: Issue }) {
  const { jaVotou, votar } = useVotos();
  const project = PROJECTS[issue.projeto];
  const votou = jaVotou(issue.id);

  return (
    <article className="issue-detalhe">
      <div className="issue-detalhe-selos">
        <Link
          className="selo selo-projeto"
          style={{ borderColor: project.color, color: project.color }}
          to={`/?projeto=${issue.projeto}`}
        >
          {project.name}
        </Link>
        <span className={`selo selo-tipo selo-${issue.tipo}`}>{TYPE_LABEL[issue.tipo]}</span>
        <span className={`selo selo-status selo-${issue.status}`}>
          {STATUS_LABEL[issue.status]}
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
