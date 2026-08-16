import { Link } from "react-router-dom";

import { LABEL_STATUS, LABEL_TIPO, t } from "../../i18n";
import { formatRelative } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJETOS } from "../../lib/projetos";
import { COLUNAS_ADMIN, type Coluna } from "../../lib/status";

type Props = {
  issue: Issue;
  jaVotou: boolean;
  onVotar: (id: string) => void;
  /** Presente só no /admin: liga o arrastar e o seletor de coluna. */
  onMover?: (id: string, coluna: Coluna) => void;
  /** Presente só no /admin: abre o painel lateral em vez de navegar. */
  onAbrir?: (id: string) => void;
};

export function IssueCard({ issue, jaVotou, onVotar, onMover, onAbrir }: Props) {
  const projeto = PROJETOS[issue.projeto];
  const admin = Boolean(onMover);

  return (
    <article
      className="issue-card"
      // `draggable` só existe no modo admin — o DOM público nem recebe o atributo.
      draggable={admin || undefined}
      onDragStart={
        admin
          ? (e) => {
              e.dataTransfer.setData("text/plain", issue.id);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
    >
      <div className="issue-card-topo">
        <span className="selo selo-projeto" style={{ borderColor: projeto.cor, color: projeto.cor }}>
          {projeto.nome}
        </span>
        <span className={`selo selo-tipo selo-${issue.tipo}`}>{LABEL_TIPO[issue.tipo]}</span>
      </div>

      <h3 className="issue-card-titulo">
        {onAbrir ? (
          <button type="button" className="link-botao" onClick={() => onAbrir(issue.id)}>
            {issue.titulo}
          </button>
        ) : (
          <Link to={`/t/${issue.id}`}>{issue.titulo}</Link>
        )}
      </h3>

      <div className="issue-card-rodape">
        <button
          type="button"
          className={jaVotou ? "voto voto-feito" : "voto"}
          onClick={() => onVotar(issue.id)}
          disabled={jaVotou}
          title={jaVotou ? t.jaVotou : t.votarTitulo}
          aria-label={jaVotou ? t.jaVotou : t.votarTitulo}
        >
          <span aria-hidden="true">▲</span> {issue.upvotes}
        </button>

        {issue.comentarios > 0 && (
          <span className="issue-card-meta" title={t.comentariosLabel(issue.comentarios)}>
            <span aria-hidden="true">💬</span> {issue.comentarios}
          </span>
        )}

        {issue.autor && <span className="issue-card-meta">{t.reportadoPor(issue.autor)}</span>}

        <time className="issue-card-meta issue-card-data" dateTime={issue.criadoEm?.toISOString()}>
          {formatRelative(issue.criadoEm)}
        </time>
      </div>

      {onMover && (
        // Arrastar não funciona em toque nenhum — nem Safari do iPhone, nem
        // Chrome do Android. O seletor é o mecanismo de verdade; o arrastar é só
        // o atalho no desktop. De quebra funciona no teclado e no leitor de tela.
        <label className="issue-card-mover">
          <span className="visually-hidden">{t.moverPara}</span>
          <select
            value={issue.arquivado ? "arquivado" : issue.status}
            onChange={(e) => onMover(issue.id, e.target.value as Coluna)}
          >
            {COLUNAS_ADMIN.map((c) => (
              <option key={c} value={c}>
                {LABEL_STATUS[c]}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
