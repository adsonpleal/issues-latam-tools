import { useState } from "react";

import { t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import type { Column as Column } from "../../lib/status";
import { useVotes } from "../votos/useVotos";
import type { ColumnGroup } from "./agrupar";
import { BoardColumn } from "./Coluna";
import { IssueCard } from "./IssueCard";

type Props = {
  columns: ColumnGroup[];
  loading: boolean;
  error: string | null;
  /** Passados só com sessão de admin: arrastar, seletor de coluna e painel. */
  onMove?: (id: string, column: Column) => void;
  onOpen?: (id: string) => void;
  /** Fixa `id` logo antes (ou depois) de `alvoId`, na pilha de `alvoId`. */
  onPin?: (id: string, targetId: string, before: boolean) => void;
  /** Devolve a coluna inteira à ordem automática. */
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
  // Qual card está no ar. Quem recebe o drop precisa saber disso para não se
  // oferecer de alvo para si mesmo — o dataTransfer não conta durante o
  // dragover, só no drop.
  const [arrastando, setArrastando] = useState<string | null>(null);

  if (error) return <p className="aviso aviso-erro">{t.loadError}</p>;
  if (loading) return <p className="aviso">{t.loading}</p>;

  const total = columns.reduce((n, c) => n + c.issues.length, 0);
  if (total === 0) return <p className="aviso">{t.emptyBoard}</p>;

  const votarSync = (id: string) => {
    void vote(id);
  };

  return (
    <div className="quadro">
      {columns.map(({ column, issues }) => (
        <BoardColumn
          key={column}
          column={column}
          quantidade={issues.length}
          onSoltar={onMove}
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
              onVote={votarSync}
              onMove={onMove}
              onOpen={onOpen}
              onPin={onPin}
              // As setas são o mesmo gesto do arrastar, dito com o vizinho da
              // tela: assim elas continuam certas com filtro ligado, em vez de
              // pular por cima de um card que o filtro escondeu.
              onDegrau={
                onPin
                  ? (delta) => {
                      const vizinho = issues[i + delta];
                      if (vizinho) onPin(issue.id, vizinho.id, delta < 0);
                    }
                  : undefined
              }
              primeiro={i === 0}
              last={i === issues.length - 1}
              arrastando={arrastando}
              onArrastar={setArrastando}
            />
          ))}
        </BoardColumn>
      ))}
    </div>
  );
}
