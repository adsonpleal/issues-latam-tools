import { useState } from "react";
import { Link } from "react-router-dom";

import { STATUS_LABEL, TYPE_LABEL, t } from "../../i18n";
import { formatRelative } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJECTS } from "../../lib/projetos";
import { ADMIN_COLUMNS, type Column } from "../../lib/status";

type Props = {
  issue: Issue;
  hasVoted: boolean;
  onVote: (id: string) => void;
  /** Presente só com sessão de admin: liga o arrastar e o seletor de coluna. */
  onMove?: (id: string, column: Column) => void;
  /** Presente só com sessão de admin: abre o painel em vez de navegar. */
  onOpen?: (id: string) => void;
  /** Soltar um card em cima deste, acima ou abaixo da metade da altura. */
  onPin?: (id: string, targetId: string, before: boolean) => void;
  /** Um degrau para cima (-1) ou para baixo (1) na pilha. */
  onDegrau?: (delta: -1 | 1) => void;
  primeiro?: boolean;
  last?: boolean;
  /** Id do card em movimento no quadro inteiro, ou null. */
  arrastando?: string | null;
  onArrastar?: (id: string | null) => void;
};

/** Metade de cima do card significa "solta antes"; metade de baixo, "depois". */
function metadeDeCima(e: React.DragEvent<HTMLElement>): boolean {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2;
}

export function IssueCard({
  issue,
  hasVoted,
  onVote,
  onMove,
  onOpen,
  onPin,
  onDegrau,
  primeiro,
  last,
  arrastando,
  onArrastar,
}: Props) {
  const project = PROJECTS[issue.project];
  const admin = Boolean(onMove);
  const [insercao, setInsercao] = useState<"antes" | "depois" | null>(null);

  // Só vira alvo quando há outro card no ar: sem isso o card acusaria posição
  // de encaixe enquanto ele mesmo está sendo arrastado.
  const recebe = Boolean(onPin) && Boolean(arrastando) && arrastando !== issue.id;

  const target = recebe
    ? {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setInsercao(metadeDeCima(e) ? "antes" : "depois");
        },
        onDragLeave: (e: React.DragEvent<HTMLElement>) => {
          // dragleave também dispara ao entrar num filho (o botão de voto, o
          // seletor). Sair de verdade é quando o destino está fora do card.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsercao(null);
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          // O preventDefault é o que avisa a coluna, no caminho de subida, que
          // este drop já tem dono — senão ela move o card e joga a posição fora.
          e.preventDefault();
          setInsercao(null);
          const id = e.dataTransfer.getData("text/plain");
          if (id && id !== issue.id) onPin?.(id, issue.id, metadeDeCima(e));
        },
      }
    : {};

  // Amarrado ao `recebe`, não só ao estado: o arrasto pode terminar com o
  // ponteiro parado em cima deste card, e aí o risco de encaixe ficaria pintado
  // depois que já não há nada para encaixar.
  const marca = recebe && insercao ? ` issue-card-alvo issue-card-${insercao}` : "";
  const emMovimento = arrastando === issue.id ? " issue-card-arrastando" : "";

  return (
    <article
      className={`issue-card${marca}${emMovimento}`}
      // `draggable` só existe com sessão — o DOM público nem recebe o atributo.
      draggable={admin || undefined}
      onDragStart={
        admin
          ? (e) => {
              e.dataTransfer.setData("text/plain", issue.id);
              e.dataTransfer.effectAllowed = "move";
              onArrastar?.(issue.id);
            }
          : undefined
      }
      onDragEnd={
        admin
          ? () => {
              onArrastar?.(null);
              setInsercao(null);
            }
          : undefined
      }
      {...target}
    >
      <div className="issue-card-topo">
        <span className="selo selo-projeto" style={{ borderColor: project.color, color: project.color }}>
          {project.name}
        </span>
        <span className={`selo selo-tipo selo-${issue.type}`}>{TYPE_LABEL[issue.type]}</span>
      </div>

      <h3 className="issue-card-titulo">
        {onOpen ? (
          <button type="button" className="link-botao" onClick={() => onOpen(issue.id)}>
            {issue.title}
          </button>
        ) : (
          <Link to={`/t/${issue.id}`}>{issue.title}</Link>
        )}
      </h3>

      <div className="issue-card-rodape">
        <button
          type="button"
          className={hasVoted ? "voto voto-feito" : "voto"}
          onClick={() => onVote(issue.id)}
          disabled={hasVoted}
          title={hasVoted ? t.alreadyVoted : t.voteTitle}
          aria-label={hasVoted ? t.alreadyVoted : t.voteTitle}
        >
          <span aria-hidden="true">▲</span> {issue.upvotes}
        </button>

        {issue.comments > 0 && (
          <span className="issue-card-meta" title={t.commentCount(issue.comments)}>
            <span aria-hidden="true">💬</span> {issue.comments}
          </span>
        )}

        {issue.attachments > 0 && (
          <span className="issue-card-meta" title={t.attachmentsTitle}>
            <span aria-hidden="true">📎</span> {issue.attachments}
          </span>
        )}

        {issue.author && <span className="issue-card-meta">{t.reportedBy(issue.author)}</span>}

        <time className="issue-card-meta issue-card-data" dateTime={issue.createdAt?.toISOString()}>
          {formatRelative(issue.createdAt)}
        </time>
      </div>

      {onMove && (
        // Arrastar não funciona em toque nenhum — nem Safari do iPhone, nem
        // Chrome do Android. O seletor e as setas são o mecanismo de verdade; o
        // arrastar é só o atalho no desktop. De quebra funcionam no teclado e no
        // leitor de tela.
        <div className="issue-card-admin">
          <label className="issue-card-mover">
            <span className="visually-hidden">{t.moveTo}</span>
            <select
              value={issue.archived ? "arquivado" : issue.status}
              onChange={(e) => onMove(issue.id, e.target.value as Column)}
            >
              {ADMIN_COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {STATUS_LABEL[c]}
                </option>
              ))}
            </select>
          </label>

          {onDegrau && (
            <span className="issue-card-degrau">
              <button
                type="button"
                onClick={() => onDegrau(-1)}
                disabled={primeiro}
                title={t.moveUp}
                aria-label={t.moveUp}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                onClick={() => onDegrau(1)}
                disabled={last}
                title={t.moveDown}
                aria-label={t.moveDown}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </span>
          )}
        </div>
      )}
    </article>
  );
}
