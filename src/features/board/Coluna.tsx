import { useRef, useState, type ReactNode } from "react";

import { AJUDA_STATUS, LABEL_STATUS, t } from "../../i18n";
import { isStatus, type Coluna as TipoColuna } from "../../lib/status";

type Props = {
  coluna: TipoColuna;
  quantidade: number;
  children: ReactNode;
  /** Só no /admin: transforma a coluna em alvo de drop. */
  onSoltar?: (id: string, coluna: TipoColuna) => void;
};

export function Coluna({ coluna, quantidade, children, onSoltar }: Props) {
  // dragenter/dragleave disparam para cada filho: sem contar a profundidade, o
  // destaque pisca sempre que o ponteiro passa por cima de um card.
  const profundidade = useRef(0);
  const [sobre, setSobre] = useState(false);

  const alvo = onSoltar
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
          e.preventDefault();
          profundidade.current = 0;
          setSobre(false);
          const id = e.dataTransfer.getData("text/plain");
          if (id) onSoltar(id, coluna);
        },
      }
    : {};

  return (
    <section
      className={`coluna coluna-${coluna}${sobre ? " coluna-alvo" : ""}`}
      aria-label={LABEL_STATUS[coluna]}
      {...alvo}
    >
      <header className="coluna-topo">
        <h2>{LABEL_STATUS[coluna]}</h2>
        <span className="coluna-contador" aria-hidden="true">
          {quantidade}
        </span>
      </header>
      {isStatus(coluna) && <p className="coluna-ajuda">{AJUDA_STATUS[coluna]}</p>}
      <div className="coluna-lista">
        {quantidade === 0 ? <p className="coluna-vazia">{t.colunaVazia}</p> : children}
      </div>
    </section>
  );
}
