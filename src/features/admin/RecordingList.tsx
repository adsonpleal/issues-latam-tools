import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { RECORDING_STATE_LABEL, t } from "../../i18n";
import { formatSize } from "../../lib/attachments";
import { formatRelative } from "../../lib/dates";
import { getRecordingFile, type RecordingState, type Recording } from "../../lib/recordings";
import { RecordingSummary } from "./RecordingSummary";

type Actions = {
  onPromote: (g: Recording) => void;
  onMark: (id: string, state: RecordingState) => void;
  onDelete: (id: string) => void;
};

type Props = Actions & {
  queue: Recording[];
  promoted: Recording[];
  decided: Recording[];
  loading: boolean;
  error: string | null;
};

export function RecordingList({
  queue,
  promoted,
  decided,
  loading,
  error,
  ...actions
}: Props) {
  if (error) return <p className="aviso aviso-erro">{t.recordingsError}</p>;
  if (loading) return <p className="aviso">{t.loading}</p>;
  if (queue.length + promoted.length + decided.length === 0) {
    return <p className="aviso">{t.recordingsEmpty}</p>;
  }

  return (
    <>
      <Section title={t.recordingsQueue} help={t.recordingsQueueHelp} recordings={queue} empty={t.queueEmpty}>
        {(g) => <RecordingRow key={g.id} recording={g} {...actions} />}
      </Section>

      {promoted.length > 0 && (
        <Section
          title={t.recordingsPromoted}
          help={t.recordingsPromotedHelp}
          recordings={promoted}
        >
          {(g) => <RecordingRow key={g.id} recording={g} {...actions} />}
        </Section>
      )}

      {decided.length > 0 && (
        <Section
          title={t.recordingsClosed}
          help={t.recordingsClosedHelp}
          recordings={decided}
        >
          {(g) => <RecordingRow key={g.id} recording={g} {...actions} />}
        </Section>
      )}
    </>
  );
}

function Section({
  title,
  help,
  recordings,
  empty,
  children,
}: {
  title: string;
  help: string;
  recordings: Recording[];
  empty?: string;
  children: (g: Recording) => ReactNode;
}) {
  return (
    <section className="gravacoes-secao">
      <h2 className="secao">
        {title} <span className="coluna-contador">{recordings.length}</span>
      </h2>
      <p className="campo-ajuda">{help}</p>
      {recordings.length === 0 ? (
        <p className="aviso">{empty}</p>
      ) : (
        <ul className="gravacoes-lista">{recordings.map(children)}</ul>
      )}
    </section>
  );
}

function RecordingRow({
  recording,
  onPromote,
  onMark,
  onDelete,
}: Actions & { recording: Recording }) {
  const inQueue = recording.state === "fila";
  const isPromoted = recording.state === "promovida";

  return (
    <li className="gravacao">
      <div className="gravacao-topo">
        <h3 className="gravacao-titulo">{recording.title}</h3>
        <span className={`selo selo-${recording.state}`}>{RECORDING_STATE_LABEL[recording.state]}</span>
      </div>

      {recording.summary && Object.keys(recording.summary).length > 0 ? (
        <RecordingSummary replay={recording.summary} className="gravacao-resumo" />
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
        {/* The nick and the contact exist only on this screen: the collection is
            private, and the nick only reaches the public if the recording
            becomes a card. */}
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
        {isPromoted && recording.issueId && (
          <Link className="issue-card-meta" to={`/t/${recording.issueId}`}>
            {t.viewCard}
          </Link>
        )}
      </div>

      <div className="gravacao-acoes">
        <DownloadButton recording={recording} />

        {inQueue ? (
          <>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.markReviewedTitle}
              onClick={() => onMark(recording.id, "conferida")}
            >
              {t.markReviewed}
            </button>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.discardTitle}
              onClick={() => onMark(recording.id, "descartada")}
            >
              {t.discard}
            </button>
            <button
              type="button"
              className="botao botao-primario botao-pequeno"
              title={t.promoteTitle}
              onClick={() => onPromote(recording)}
            >
              {t.promote}
            </button>
          </>
        ) : (
          // A promoted recording does not go back to the queue: the card already
          // exists, and the way to undo it is to archive it on the board.
          !isPromoted && (
            <>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onMark(recording.id, "fila")}
              >
                {t.returnToQueue}
              </button>
              <button
                type="button"
                className="botao botao-pequeno botao-perigo"
                title={t.deleteRecordingTitle}
                onClick={() => {
                  // Deleting is for an upload that should never have arrived,
                  // and there is no way back -- which is why it is the only
                  // click on the site that asks.
                  if (window.confirm(t.deleteRecordingConfirm(recording.title))) {
                    onDelete(recording.id);
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
 * The .rrf lives in a subdocument, so it is only downloaded when somebody asks
 * -- the whole list with the files inside would be megabytes per page open.
 */
function DownloadButton({ recording }: { recording: Recording }) {
  const [state, setState] = useState<"ready" | "downloading" | "error">("ready");

  async function download() {
    setState("downloading");
    const file = await getRecordingFile(recording.id).catch(() => null);
    if (!file) {
      setState("error");
      return;
    }
    // A Uint8Array off Firestore may carry a byteOffset; the slice normalises it.
    const copy = file.bytes.slice();
    const url = URL.createObjectURL(
      new Blob([copy as unknown as BlobPart], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name || `${recording.id}.rrf`;
    a.click();
    URL.revokeObjectURL(url);
    setState("ready");
  }

  return (
    <button
      type="button"
      className="botao botao-pequeno"
      disabled={state === "downloading"}
      onClick={() => void download()}
    >
      {state === "downloading" ? t.opening : state === "error" ? t.downloadError : t.downloadRrf}
    </button>
  );
}
