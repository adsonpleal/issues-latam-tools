import { useRef, useState, type ReactNode } from "react";

import { AJUDA_STATUS, LABEL_STATUS, t } from "../../i18n";
import { isStatus, type Coluna as TipoColuna } from "../../lib/status";

type Props = {
  coluna: TipoColuna;
  quantidade: number;
  children: ReactNode;
  /** Só com sessão de admin: transforma a coluna em alvo de drop. */
  onSoltar?: (id: string, coluna: TipoColuna) => void;
  /** Só quando a pilha está arrumada à mão: devolve a coluna ao automático. */
  onOrdemAutomatica?: () => void;
};

export function Coluna({ coluna, quantidade, children, onSoltar, onOrdemAutomatica }: Props) {
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
        {onOrdemAutomatica && (
          <button
            type="button"
            className="coluna-auto"
            onClick={onOrdemAutomatica}
            title={t.ordemAutomaticaTitulo}
          >
            {t.ordemAutomatica}
          </button>
        )}
      </header>
      {isStatus(coluna) && <p className="coluna-ajuda">{AJUDA_STATUS[coluna]}</p>}
      <div className="coluna-lista">
        {quantidade === 0 ? <p className="coluna-vazia">{t.colunaVazia}</p> : children}
      </div>
    </section>
  );
}
