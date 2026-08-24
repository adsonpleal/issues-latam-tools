import { useState } from "react";

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
  /** Fixa `id` logo antes (ou depois) de `alvoId`, na pilha de `alvoId`. */
  onFixar?: (id: string, alvoId: string, antes: boolean) => void;
  /** Devolve a coluna inteira à ordem automática. */
  onOrdemAutomatica?: (coluna: TipoColuna) => void;
};

export function Board({
  colunas,
  carregando,
  erro,
  onMover,
  onAbrir,
  onFixar,
  onOrdemAutomatica,
}: Props) {
  const { jaVotou, votar } = useVotos();
  // Qual card está no ar. Quem recebe o drop precisa saber disso para não se
  // oferecer de alvo para si mesmo — o dataTransfer não conta durante o
  // dragover, só no drop.
  const [arrastando, setArrastando] = useState<string | null>(null);

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
        <Coluna
          key={coluna}
          coluna={coluna}
          quantidade={issues.length}
          onSoltar={onMover}
          onOrdemAutomatica={
            onOrdemAutomatica && issues.some((i) => i.ordem !== null)
              ? () => onOrdemAutomatica(coluna)
              : undefined
          }
        >
          {issues.map((issue: Issue, i) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              jaVotou={jaVotou(issue.id)}
              onVotar={votarSync}
              onMover={onMover}
              onAbrir={onAbrir}
              onFixar={onFixar}
              // As setas são o mesmo gesto do arrastar, dito com o vizinho da
              // tela: assim elas continuam certas com filtro ligado, em vez de
              // pular por cima de um card que o filtro escondeu.
              onDegrau={
                onFixar
                  ? (delta) => {
                      const vizinho = issues[i + delta];
                      if (vizinho) onFixar(issue.id, vizinho.id, delta < 0);
                    }
                  : undefined
              }
              primeiro={i === 0}
              ultimo={i === issues.length - 1}
              arrastando={arrastando}
              onArrastar={setArrastando}
            />
          ))}
        </Coluna>
      ))}
    </div>
  );
}
