import { t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import type { Coluna as TipoColuna } from "../../lib/status";
import { useVotos } from "../votos/useVotos";
import type { Agrupado } from "./agrupar";
import { Coluna } from "./Coluna";
import { IssueCard } from "./IssueCard";

type Props = {
  colunas: Agrupado[];
  carregando: boolean;
  erro: string | null;
  /** Passados só com sessão de admin: arrastar, seletor de coluna e painel. */
  onMover?: (id: string, coluna: TipoColuna) => void;
  onAbrir?: (id: string) => void;
};

export function Board({ colunas, carregando, erro, onMover, onAbrir }: Props) {
  const { jaVotou, votar } = useVotos();

  if (erro) return <p className="aviso aviso-erro">{t.erroCarregar}</p>;
  if (carregando) return <p className="aviso">{t.carregando}</p>;

  const total = colunas.reduce((n, c) => n + c.issues.length, 0);
  if (total === 0) return <p className="aviso">{t.quadroVazio}</p>;

  const votarSync = (id: string) => {
    void votar(id);
  };

  return (
    <div className="quadro">
      {colunas.map(({ coluna, issues }) => (
        <Coluna key={coluna} coluna={coluna} quantidade={issues.length} onSoltar={onMover}>
          {issues.map((issue: Issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              jaVotou={jaVotou(issue.id)}
              onVotar={votarSync}
              onMover={onMover}
              onAbrir={onAbrir}
            />
          ))}
        </Coluna>
      ))}
    </div>
  );
}
