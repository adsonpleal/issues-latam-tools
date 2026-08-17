import type { ResumoReplay } from "../../lib/issues";
import { linhasDoResumo } from "./gravacoes";

type Props = {
  replay: ResumoReplay;
  /** `painel-replay` no painel do card, `gravacao-resumo` na fila. */
  className?: string;
};

/** O resumo do parser, para a triagem ranquear sem baixar o .rrf. */
export function ResumoGravacao({ replay, className = "painel-replay" }: Props) {
  return (
    <dl className={className}>
      {linhasDoResumo(replay).map((linha) => (
        <div key={linha.chave}>
          <dt>
            {linha.rotulo}
            {linha.ajuda && <span className="campo-ajuda"> ({linha.ajuda})</span>}
          </dt>
          <dd>{linha.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
