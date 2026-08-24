import { useState } from "react";
import { Link } from "react-router-dom";

import { LABEL_STATUS, LABEL_TIPO, t } from "../../i18n";
import { formatRelative } from "../../lib/datas";
import type { Issue } from "../../lib/issues";
import { PROJETOS } from "../../lib/projetos";
import { COLUNAS_ADMIN, type Coluna } from "../../lib/status";

type Props = {
  issue: Issue;
  jaVotou: boolean;
  onVotar: (id: string) => void;
  /** Presente só com sessão de admin: liga o arrastar e o seletor de coluna. */
  onMover?: (id: string, coluna: Coluna) => void;
  /** Presente só com sessão de admin: abre o painel em vez de navegar. */
  onAbrir?: (id: string) => void;
  /** Soltar um card em cima deste, acima ou abaixo da metade da altura. */
  onFixar?: (id: string, alvoId: string, antes: boolean) => void;
  /** Um degrau para cima (-1) ou para baixo (1) na pilha. */
  onDegrau?: (delta: -1 | 1) => void;
  primeiro?: boolean;
  ultimo?: boolean;
  /** Id do card em movimento no quadro inteiro, ou null. */
  arrastando?: string | null;
  onArrastar?: (id: string | null) => void;
};

/** Metade de cima do card significa "solta antes"; metade de baixo, "depois". */
function metadeDeCima(e: React.DragEvent<HTMLElement>): boolean {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY < r.top + r.height / 2;
}

export function IssueCard({
  issue,
  jaVotou,
  onVotar,
  onMover,
  onAbrir,
  onFixar,
  onDegrau,
  primeiro,
  ultimo,
  arrastando,
  onArrastar,
}: Props) {
  const projeto = PROJETOS[issue.projeto];
  const admin = Boolean(onMover);
  const [insercao, setInsercao] = useState<"antes" | "depois" | null>(null);

  // Só vira alvo quando há outro card no ar: sem isso o card acusaria posição
  // de encaixe enquanto ele mesmo está sendo arrastado.
  const recebe = Boolean(onFixar) && Boolean(arrastando) && arrastando !== issue.id;

  const alvo = recebe
    ? {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setInsercao(metadeDeCima(e) ? "antes" : "depois");
        },
        onDragLeave: (e: React.DragEvent<HTMLElement>) => {
          // dragleave também dispara ao entrar num filho (o botão de voto, o
          // seletor). Sair de verdade é quando o destino está fora do card.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsercao(null);
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
          // O preventDefault é o que avisa a coluna, no caminho de subida, que
          // este drop já tem dono — senão ela move o card e joga a posição fora.
          e.preventDefault();
          setInsercao(null);
          const id = e.dataTransfer.getData("text/plain");
          if (id && id !== issue.id) onFixar?.(id, issue.id, metadeDeCima(e));
        },
      }
    : {};

  // Amarrado ao `recebe`, não só ao estado: o arrasto pode terminar com o
  // ponteiro parado em cima deste card, e aí o risco de encaixe ficaria pintado
  // depois que já não há nada para encaixar.
  const marca = recebe && insercao ? ` issue-card-alvo issue-card-${insercao}` : "";
  const emMovimento = arrastando === issue.id ? " issue-card-arrastando" : "";

  return (
    <article
      className={`issue-card${marca}${emMovimento}`}
      // `draggable` só existe com sessão — o DOM público nem recebe o atributo.
      draggable={admin || undefined}
      onDragStart={
        admin
          ? (e) => {
              e.dataTransfer.setData("text/plain", issue.id);
              e.dataTransfer.effectAllowed = "move";
              onArrastar?.(issue.id);
            }
          : undefined
      }
      onDragEnd={
        admin
          ? () => {
              onArrastar?.(null);
              setInsercao(null);
            }
          : undefined
      }
      {...alvo}
    >
      <div className="issue-card-topo">
        <span className="selo selo-projeto" style={{ borderColor: projeto.cor, color: projeto.cor }}>
          {projeto.nome}
        </span>
        <span className={`selo selo-tipo selo-${issue.tipo}`}>{LABEL_TIPO[issue.tipo]}</span>
      </div>

      <h3 className="issue-card-titulo">
        {onAbrir ? (
          <button type="button" className="link-botao" onClick={() => onAbrir(issue.id)}>
            {issue.titulo}
          </button>
        ) : (
          <Link to={`/t/${issue.id}`}>{issue.titulo}</Link>
        )}
      </h3>

      <div className="issue-card-rodape">
        <button
          type="button"
          className={jaVotou ? "voto voto-feito" : "voto"}
          onClick={() => onVotar(issue.id)}
          disabled={jaVotou}
          title={jaVotou ? t.jaVotou : t.votarTitulo}
          aria-label={jaVotou ? t.jaVotou : t.votarTitulo}
        >
          <span aria-hidden="true">▲</span> {issue.upvotes}
        </button>

        {issue.comentarios > 0 && (
          <span className="issue-card-meta" title={t.comentariosLabel(issue.comentarios)}>
            <span aria-hidden="true">💬</span> {issue.comentarios}
          </span>
        )}

        {issue.anexos > 0 && (
          <span className="issue-card-meta" title={t.anexosTitulo}>
            <span aria-hidden="true">📎</span> {issue.anexos}
          </span>
        )}

        {issue.autor && <span className="issue-card-meta">{t.reportadoPor(issue.autor)}</span>}

        <time className="issue-card-meta issue-card-data" dateTime={issue.criadoEm?.toISOString()}>
          {formatRelative(issue.criadoEm)}
        </time>
      </div>

      {onMover && (
        // Arrastar não funciona em toque nenhum — nem Safari do iPhone, nem
        // Chrome do Android. O seletor e as setas são o mecanismo de verdade; o
        // arrastar é só o atalho no desktop. De quebra funcionam no teclado e no
        // leitor de tela.
        <div className="issue-card-admin">
          <label className="issue-card-mover">
            <span className="visually-hidden">{t.moverPara}</span>
            <select
              value={issue.arquivado ? "arquivado" : issue.status}
              onChange={(e) => onMover(issue.id, e.target.value as Coluna)}
            >
              {COLUNAS_ADMIN.map((c) => (
                <option key={c} value={c}>
                  {LABEL_STATUS[c]}
                </option>
              ))}
            </select>
          </label>

          {onDegrau && (
            <span className="issue-card-degrau">
              <button
                type="button"
                onClick={() => onDegrau(-1)}
                disabled={primeiro}
                title={t.subirNaPilha}
                aria-label={t.subirNaPilha}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                onClick={() => onDegrau(1)}
                disabled={ultimo}
                title={t.descerNaPilha}
                aria-label={t.descerNaPilha}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </span>
          )}
        </div>
      )}
    </article>
  );
}
