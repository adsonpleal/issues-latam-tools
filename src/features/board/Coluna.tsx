import { useRef, useState, type ReactNode } from "react";

import { STATUS_HELP, STATUS_LABEL, t } from "../../i18n";
import { isStatus, type Column as Column } from "../../lib/status";

type Props = {
  column: Column;
  quantidade: number;
  children: ReactNode;
  /** Só com sessão de admin: transforma a coluna em alvo de drop. */
  onSoltar?: (id: string, column: Column) => void;
  /** Só quando a pilha está arrumada à mão: devolve a coluna ao automático. */
  onAutoOrder?: () => void;
};

export function BoardColumn({ column, quantidade, children, onSoltar, onAutoOrder }: Props) {
  // dragenter/dragleave disparam para cada filho: sem contar a profundidade, o
  // destaque pisca sempre que o ponteiro passa por cima de um card.
  const profundidade = useRef(0);
  const [sobre, setSobre] = useState(false);

  const target = onSoltar
    ? {
        // preventDefault no dragover é obrigatório: sem ele o `drop` simplesmente
        // nunca dispara.
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        },
        onDragEnter: () => {
          profundidade.current += 1;
          setSobre(true);
        },
        onDragLeave: () => {
          profundidade.current -= 1;
          if (profundidade.current <= 0) setSobre(false);
        },
        onDrop: (e: React.DragEvent) => {
          profundidade.current = 0;
          setSobre(false);
          // O drop sobe do card para cá. Se um card já o atendeu, ele chamou
          // preventDefault — e aí a coluna só apaga o destaque: soltar EM CIMA
          // de um card escolhe a posição, e mover sem posição jogaria fora a
          // escolha que acabou de ser feita.
          //
          // A pergunta é feita ao evento nativo, não ao sintético: o sintético é
          // um objeto do React, e ler dele um estado que muda no meio do
          // caminho é depender de detalhe interno dele.
          if (e.nativeEvent.defaultPrevented) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id) onSoltar(id, column);
        },
      }
    : {};

  return (
    <section
      className={`coluna coluna-${column}${sobre ? " coluna-alvo" : ""}`}
      aria-label={STATUS_LABEL[column]}
      {...target}
    >
      <header className="coluna-topo">
        <h2>{STATUS_LABEL[column]}</h2>
        <span className="coluna-contador" aria-hidden="true">
          {quantidade}
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
        {quantidade === 0 ? <p className="coluna-vazia">{t.emptyColumn}</p> : children}
      </div>
    </section>
  );
}
