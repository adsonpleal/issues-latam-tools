import type { ReplaySummary } from "../../lib/issues";
import { summaryRows } from "./recordings";

type Props = {
  replay: ReplaySummary;
  /** `painel-replay` in the card's panel, `gravacao-resumo` in the queue. */
  className?: string;
};

/** The parser's summary, for triage to rank without downloading the .rrf. */
export function RecordingSummary({ replay, className = "painel-replay" }: Props) {
  return (
    <dl className={className}>
      {summaryRows(replay).map((row) => (
        <div key={row.key}>
          <dt>
            {row.label}
            {row.help && <span className="campo-ajuda"> ({row.help})</span>}
          </dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
