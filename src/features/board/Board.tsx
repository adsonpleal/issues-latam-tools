import { useState } from "react";

import { t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import type { Column } from "../../lib/status";
import { useVotes } from "../votes/useVotes";
import type { ColumnGroup } from "./group";
import { BoardColumn } from "./BoardColumn";
import { IssueCard } from "./IssueCard";

type Props = {
  columns: ColumnGroup[];
  loading: boolean;
  error: string | null;
  /** Passed only with an admin session: dragging, column selector and panel. */
  onMove?: (id: string, column: Column) => void;
  onOpen?: (id: string) => void;
  /** Pins `id` right before (or after) `targetId`, in `targetId`'s stack. */
  onPin?: (id: string, targetId: string, before: boolean) => void;
  /** Returns the whole column to automatic order. */
  onAutoOrder?: (column: Column) => void;
};

export function Board({
  columns,
  loading,
  error,
  onMove,
  onOpen,
  onPin,
  onAutoOrder,
}: Props) {
  const { hasVoted, vote } = useVotes();
  // Which card is in the air. Whoever receives the drop needs to know, so it
  // does not offer itself as a target to itself -- the dataTransfer is not
  // readable during dragover, only on drop.
  const [dragging, setDragging] = useState<string | null>(null);

  if (error) return <p className="aviso aviso-erro">{t.loadError}</p>;
  if (loading) return <p className="aviso">{t.loading}</p>;

  const total = columns.reduce((n, c) => n + c.issues.length, 0);
  if (total === 0) return <p className="aviso">{t.emptyBoard}</p>;

  const voteSync = (id: string) => {
    void vote(id);
  };

  return (
    <div className="quadro">
      {columns.map(({ column, issues }) => (
        <BoardColumn
          key={column}
          column={column}
          count={issues.length}
          onDropCard={onMove}
          onAutoOrder={
            onAutoOrder && issues.some((i) => i.order !== null)
              ? () => onAutoOrder(column)
              : undefined
          }
        >
          {issues.map((issue: Issue, i) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              hasVoted={hasVoted(issue.id)}
              onVote={voteSync}
              onMove={onMove}
              onOpen={onOpen}
              onPin={onPin}
              // The arrows are the same gesture as dragging, said with the
              // neighbour on screen: that way they stay right with a filter on,
              // instead of jumping over a card the filter hid.
              onStep={
                onPin
                  ? (delta) => {
                      const neighbour = issues[i + delta];
                      if (neighbour) onPin(issue.id, neighbour.id, delta < 0);
                    }
                  : undefined
              }
              first={i === 0}
              last={i === issues.length - 1}
              dragging={dragging}
              onDragging={setDragging}
            />
          ))}
        </BoardColumn>
      ))}
    </div>
  );
}
