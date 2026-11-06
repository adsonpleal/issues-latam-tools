import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { RECORDING_STATE_LABEL, t } from "../../i18n";
import { formatSize } from "../../lib/anexos";
import { formatRelative } from "../../lib/datas";
import { getRecordingFile, type RecordingState, type Recording } from "../../lib/gravacoes";
import { ResumoGravacao } from "./ResumoGravacao";

type Acoes = {
  onPromover: (g: Recording) => void;
  onMarcar: (id: string, state: RecordingState) => void;
  onApagar: (id: string) => void;
};

type Props = Acoes & {
  fila: Recording[];
  promovidas: Recording[];
  decididas: Recording[];
  carregando: boolean;
  erro: string | null;
};

export function ListaGravacoes({
  fila,
  promovidas,
  decididas,
  carregando,
  erro,
  ...acoes
}: Props) {
  if (erro) return <p className="aviso aviso-erro">{t.recordingsError}</p>;
  if (carregando) return <p className="aviso">{t.loading}</p>;
  if (fila.length + promovidas.length + decididas.length === 0) {
    return <p className="aviso">{t.recordingsEmpty}</p>;
  }

  return (
    <>
      <Secao title={t.recordingsQueue} ajuda={t.recordingsQueueHelp} recordings={fila} vazio={t.queueEmpty}>
        {(g) => <Ficha key={g.id} recording={g} {...acoes} />}
      </Secao>

      {promovidas.length > 0 && (
        <Secao
          title={t.recordingsPromoted}
          ajuda={t.recordingsPromotedHelp}
          recordings={promovidas}
        >
          {(g) => <Ficha key={g.id} recording={g} {...acoes} />}
        </Secao>
      )}

      {decididas.length > 0 && (
        <Secao
          title={t.recordingsClosed}
          ajuda={t.recordingsClosedHelp}
          recordings={decididas}
        >
          {(g) => <Ficha key={g.id} recording={g} {...acoes} />}
        </Secao>
      )}
    </>
  );
}

function Secao({
  title,
  ajuda,
  recordings,
  vazio,
  children,
}: {
  title: string;
  ajuda: string;
  recordings: Recording[];
  vazio?: string;
  children: (g: Recording) => ReactNode;
}) {
  return (
    <section className="gravacoes-secao">
      <h2 className="secao">
        {title} <span className="coluna-contador">{recordings.length}</span>
      </h2>
      <p className="campo-ajuda">{ajuda}</p>
      {recordings.length === 0 ? (
        <p className="aviso">{vazio}</p>
      ) : (
        <ul className="gravacoes-lista">{recordings.map(children)}</ul>
      )}
    </section>
  );
}

function Ficha({
  recording,
  onPromover,
  onMarcar,
  onApagar,
}: Acoes & { recording: Recording }) {
  const naFila = recording.state === "fila";
  const promovida = recording.state === "promovida";

  return (
    <li className="gravacao">
      <div className="gravacao-topo">
        <h3 className="gravacao-titulo">{recording.title}</h3>
        <span className={`selo selo-${recording.state}`}>{RECORDING_STATE_LABEL[recording.state]}</span>
      </div>

      {recording.summary && Object.keys(recording.summary).length > 0 ? (
        <ResumoGravacao replay={recording.summary} className="gravacao-resumo" />
      ) : (
        <p className="campo-ajuda">{t.recordingNoSummary}</p>
      )}

      {recording.notes && (
        <p className="gravacao-notas">
          <strong>{t.submitterNotes}:</strong> {recording.notes}
        </p>
      )}
      {recording.triageNote && (
        <p className="gravacao-notas">
          <strong>{t.triageNote}:</strong> {recording.triageNote}
        </p>
      )}

      <div className="gravacao-rodape">
        {/* Nick e contato só existem nesta tela: a coleção é privada, e o nick
            só chega ao público se a ficha virar card. */}
        {recording.nick && <span className="issue-card-meta">{t.reportedBy(recording.nick)}</span>}
        {recording.contact && (
          <span className="issue-card-meta">
            <span aria-hidden="true">✉</span> {recording.contact}
          </span>
        )}
        <time className="issue-card-meta" dateTime={recording.createdAt?.toISOString()}>
          {formatRelative(recording.createdAt)}
        </time>
        <span className="issue-card-meta">{formatSize(recording.size)}</span>
        {promovida && recording.issueId && (
          <Link className="issue-card-meta" to={`/t/${recording.issueId}`}>
            {t.viewCard}
          </Link>
        )}
      </div>

      <div className="gravacao-acoes">
        <BotaoBaixar recording={recording} />

        {naFila ? (
          <>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.markReviewedTitle}
              onClick={() => onMarcar(recording.id, "conferida")}
            >
              {t.markReviewed}
            </button>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.discardTitle}
              onClick={() => onMarcar(recording.id, "descartada")}
            >
              {t.discard}
            </button>
            <button
              type="button"
              className="botao botao-primario botao-pequeno"
              title={t.promoteTitle}
              onClick={() => onPromover(recording)}
            >
              {t.promote}
            </button>
          </>
        ) : (
          // Promovida não volta para a fila: o card já existe, e o caminho de
          // desfazer é arquivá-lo no quadro.
          !promovida && (
            <>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onMarcar(recording.id, "fila")}
              >
                {t.returnToQueue}
              </button>
              <button
                type="button"
                className="botao botao-pequeno botao-perigo"
                title={t.deleteRecordingTitle}
                onClick={() => {
                  // Apagar é para upload que não devia ter entrado, e não tem
                  // volta — por isso é o único clique do site que pergunta.
                  if (window.confirm(t.deleteRecordingConfirm(recording.title))) {
                    onApagar(recording.id);
                  }
                }}
              >
                {t.deleteRecording}
              </button>
            </>
          )
        )}
      </div>
    </li>
  );
}

/**
 * O .rrf mora num subdocumento, então só é baixado quando alguém pede — a lista
 * inteira com os arquivos dentro seriam megabytes por abertura de página.
 */
function BotaoBaixar({ recording }: { recording: Recording }) {
  const [state, setEstado] = useState<"pronto" | "baixando" | "erro">("pronto");

  async function baixar() {
    setEstado("baixando");
    const file = await getRecordingFile(recording.id).catch(() => null);
    if (!file) {
      setEstado("erro");
      return;
    }
    // Uint8Array vindo do Firestore pode ter byteOffset; o slice normaliza.
    const copia = file.bytes.slice();
    const url = URL.createObjectURL(
      new Blob([copia as unknown as BlobPart], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || `${recording.id}.rrf`;
    a.click();
    URL.revokeObjectURL(url);
    setEstado("pronto");
  }

  return (
    <button
      type="button"
      className="botao botao-pequeno"
      disabled={state === "baixando"}
      onClick={() => void baixar()}
    >
      {state === "baixando" ? t.opening : state === "erro" ? t.downloadError : t.downloadRrf}
    </button>
  );
}
