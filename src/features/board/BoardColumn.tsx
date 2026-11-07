import { useRef, useState, type ReactNode } from "react";

import { STATUS_HELP, STATUS_LABEL, t } from "../../i18n";
import { isStatus, type Column } from "../../lib/status";

type Props = {
  column: Column;
  count: number;
  children: ReactNode;
  /** Only with an admin session: makes the column a drop target. */
  onDropCard?: (id: string, column: Column) => void;
  /** Only while the stack is arranged by hand: returns the column to automatic. */
  onAutoOrder?: () => void;
};

export function BoardColumn({ column, count, children, onDropCard, onAutoOrder }: Props) {
  // dragenter/dragleave fire for every child: without counting the depth, the
  // highlight flickers every time the pointer passes over a card.
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const target = onDropCard
    ? {
        // preventDefault on dragover is mandatory: without it `drop` simply
        // never fires.
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        onDragEnter: () => {
          depth.current += 1;
          setOver(true);
        },
        onDragLeave: () => {
          depth.current -= 1;
          if (depth.current <= 0) setOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          depth.current = 0;
          setOver(false);
          // The drop comes up from the card to here. If a card already served
          // it, that card called preventDefault -- and then the column only
          // clears the highlight: dropping ON a card picks the position, and
          // moving without a position would throw away the choice just made.
          //
          // The question goes to the native event, not the synthetic one: the
          // synthetic one is a React object, and reading a state off it that
          // changes along the way means depending on its internals.
          if (e.nativeEvent.defaultPrevented) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id) onDropCard(id, column);
        },
      }
    : {};

  return (
    <section
      className={`coluna coluna-${column}${over ? " coluna-alvo" : ""}`}
      aria-label={STATUS_LABEL[column]}
      {...target}
    >
      <header className="coluna-topo">
        <h2>{STATUS_LABEL[column]}</h2>
        <span className="coluna-contador" aria-hidden="true">
          {count}
        </span>
        {onAutoOrder && (
          <button
            type="button"
            className="coluna-auto"
            onClick={onAutoOrder}
            title={t.autoOrderTitle}
          >
            {t.autoOrder}
          </button>
        )}
      </header>
      {isStatus(column) && <p className="coluna-ajuda">{STATUS_HELP[column]}</p>}
      <div className="coluna-lista">
        {count === 0 ? <p className="coluna-vazia">{t.emptyColumn}</p> : children}
      </div>
    </section>
  );
}
