import { Link } from "react-router-dom";

import { STATUS_LABEL, TYPE_LABEL, t } from "../../i18n";
import { formatDate } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJECTS } from "../../lib/projetos";
import { useVotes } from "../votos/useVotos";
import { TextWithLinks } from "./TextoComLinks";

export function IssueDetail({ issue }: { issue: Issue }) {
  const { hasVoted, vote } = useVotes();
  const project = PROJECTS[issue.project];
  const votou = hasVoted(issue.id);

  return (
    <article className="issue-detalhe">
      <div className="issue-detalhe-selos">
        <Link
          className="selo selo-projeto"
          style={{ borderColor: project.color, color: project.color }}
          to={`/?projeto=${issue.project}`}
        >
          {project.name}
        </Link>
        <span className={`selo selo-tipo selo-${issue.type}`}>{TYPE_LABEL[issue.type]}</span>
        <span className={`selo selo-status selo-${issue.status}`}>
          {STATUS_LABEL[issue.status]}
        </span>
      </div>

      <h1>{issue.title}</h1>

      <p className="issue-detalhe-meta">
        {formatDate(issue.createdAt)}
        {issue.author && <> · {t.reportedBy(issue.author)}</>}
      </p>

      {issue.description && (
        <div className="issue-detalhe-descricao">
          <TextWithLinks text={issue.description} />
        </div>
      )}

      <button
        type="button"
        className={votou ? "voto voto-feito" : "voto"}
        onClick={() => void vote(issue.id)}
        disabled={votou}
        title={votou ? t.alreadyVoted : t.voteTitle}
      >
        <span aria-hidden="true">▲</span> {issue.upvotes} {votou ? "" : t.vote}
      </button>
    </article>
  );
}
