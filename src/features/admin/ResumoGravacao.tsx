import type { ReplaySummary } from "../../lib/issues";
import { summaryRows } from "./gravacoes";

type Props = {
  replay: ReplaySummary;
  /** `painel-replay` no painel do card, `gravacao-resumo` na fila. */
  className?: string;
};

/** O resumo do parser, para a triagem ranquear sem baixar o .rrf. */
export function RecordingSummary({ replay, className = "painel-replay" }: Props) {
  return (
    <dl className={className}>
      {summaryRows(replay).map((linha) => (
        <div key={linha.chave}>
          <dt>
            {linha.rotulo}
            {linha.help && <span className="campo-ajuda"> ({linha.help})</span>}
          </dt>
          <dd>{linha.value}</dd>
        </div>
      ))}
    </dl>
  );
}
