import { useState } from "react";
import { Link } from "react-router-dom";

import { STATUS_LABEL, TYPE_LABEL, t } from "../../i18n";
import { formatRelative } from "../../lib/dates";
import type { Issue } from "../../lib/issues";
import { PROJECTS } from "../../lib/projects";
import { ADMIN_COLUMNS, type Column } from "../../lib/status";

type Props = {
  issue: Issue;
  hasVoted: boolean;
  onVote: (id: string) => void;
  /** Only with an admin session: turns dragging and the column selector on. */
  onMove?: (id: string, column: Column) => void;
  /** Only with an admin session: opens the panel instead of navigating. */
  onOpen?: (id: string) => void;
  /** Dropping a card onto this one, above or below half its height. */
  onPin?: (id: string, targetId: string, before: boolean) => void;
  /** One step up (-1) or down (1) the stack. */
  onStep?: (delta: -1 | 1) => void;
  first?: boolean;
  last?: boolean;
  /** Id of the card in motion anywhere on the board, or null. */
  dragging?: string | null;
  onDragging?: (id: string | null) => void;
};

/** The top half of the card means "drop before"; the bottom half, "after". */
function isTopHalf(e: React.DragEvent<HTMLElement>): boolean {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2;
}

/**
 * The insertion marks are CSS class names, part of the stylesheet's contract,
 * so they keep their Portuguese spelling while the state above them is ours.
 */
const INSERTION_CLASS = {
  before: "issue-card-antes",
  after: "issue-card-depois",
} as const;

export function IssueCard({
  issue,
  hasVoted,
  onVote,
  onMove,
  onOpen,
  onPin,
  onStep,
  first,
  last,
  dragging,
  onDragging,
}: Props) {
  const project = PROJECTS[issue.project];
  const admin = Boolean(onMove);
  const [insertion, setInsertion] = useState<"before" | "after" | null>(null);

  // It only becomes a target while another card is in the air: without this the
  // card would show a drop position while it is the one being dragged.
  const isTarget = Boolean(onPin) && Boolean(dragging) && dragging !== issue.id;

  const target = isTarget
    ? {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setInsertion(isTopHalf(e) ? "before" : "after");
        },
        onDragLeave: (e: React.DragEvent<HTMLElement>) => {
          // dragleave also fires on entering a child (the vote button, the
          // selector). A real exit is when the destination is outside the card.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsertion(null);
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          // The preventDefault is what tells the column, on the way up, that
          // this drop already has an owner -- otherwise it moves the card and
          // throws the position away.
          e.preventDefault();
          setInsertion(null);
          const id = e.dataTransfer.getData("text/plain");
          if (id && id !== issue.id) onPin?.(id, issue.id, isTopHalf(e));
        },
      }
    : {};

  // Tied to `isTarget`, not only to the state: the drag can end with the
  // pointer resting on this card, and then the insertion line would stay
  // painted after there is nothing left to insert.
  const mark = isTarget && insertion ? ` issue-card-alvo ${INSERTION_CLASS[insertion]}` : "";
  const moving = dragging === issue.id ? " issue-card-arrastando" : "";

  return (
    <article
      className={`issue-card${mark}${moving}`}
      // `draggable` only exists with a session -- the public DOM never even
      // receives the attribute.
      draggable={admin || undefined}
      onDragStart={
        admin
          ? (e) => {
              e.dataTransfer.setData("text/plain", issue.id);
              e.dataTransfer.effectAllowed = "move";
              onDragging?.(issue.id);
            }
          : undefined
      }
      onDragEnd={
        admin
          ? () => {
              onDragging?.(null);
              setInsertion(null);
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
        // Dragging works on no touch device at all -- not iPhone Safari, not
        // Android Chrome. The selector and the arrows are the real mechanism;
        // dragging is only the desktop shortcut. As a bonus they work with the
        // keyboard and the screen reader.
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

          {onStep && (
            <span className="issue-card-degrau">
              <button
                type="button"
                onClick={() => onStep(-1)}
                disabled={first}
                title={t.moveUp}
                aria-label={t.moveUp}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                onClick={() => onStep(1)}
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
