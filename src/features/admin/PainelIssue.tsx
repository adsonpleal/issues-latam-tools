import { useEffect, useMemo, useState } from "react";

import { TYPE_LABEL, t } from "../../i18n";
import { deleteAttachment, subscribeAttachments, type Attachment, type PreparedAttachment } from "../../lib/anexos";
import { subscribeComments, type IssueComment } from "../../lib/comentarios";
import type { Issue } from "../../lib/issues";
import { PROJECTS } from "../../lib/projetos";
import { AttachmentList } from "../ticket/ListaAnexos";
import { CommentList } from "../ticket/ListaComentarios";
import {
  CommentForm,
  EditForm,
  useContact,
  type EditableFields,
} from "./AcoesIssue";
import { RecordingSummary } from "./ResumoGravacao";

type Props = {
  issue: Issue;
  onClose: () => void;
  onComment: (text: string, images: PreparedAttachment[]) => void;
  onEdit: (fields: EditableFields) => void;
};

/**
 * The card opened without leaving the board -- this is where triage happens,
 * because the record can be read and the column dragged on the same screen. The
 * same record, whole and with the same powers, also opens at `/t/:id`; the
 * editing pieces are the same ones.
 */
export function IssuePanel({ issue, onClose, onComment, onEdit }: Props) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editing, setEditing] = useState(false);
  const contact = useContact(issue.id);

  useEffect(() => setEditing(false), [issue.id]);

  useEffect(
    () => subscribeComments(issue.id, setComments, () => setComments([])),
    [issue.id],
  );

  useEffect(() => subscribeAttachments(issue.id, setAttachments, () => setAttachments([])), [issue.id]);

  // One subcollection, two places on screen: with no `comentarioId` it is the
  // card's attachment, with one it is a screenshot pasted into an update.
  const [cardAttachments, commentImages] = useMemo(
    () => [attachments.filter((a) => !a.commentId), attachments.filter((a) => a.commentId)],
    [attachments],
  );

  return (
    <aside className="painel" aria-label={issue.title}>
      <div className="painel-topo">
        <h2>{editing ? t.edit : issue.title}</h2>
        <button type="button" className="botao botao-pequeno" onClick={onClose}>
          ✕
        </button>
      </div>

      {editing ? (
        <EditForm
          issue={issue}
          onSave={(fields) => {
            onEdit(fields);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="painel-meta">
            {PROJECTS[issue.project].name} · {TYPE_LABEL[issue.type]} · ▲ {issue.upvotes}
            {issue.author && <> · {t.reportedBy(issue.author)}</>}
          </p>
          {issue.description && <p className="painel-descricao">{issue.description}</p>}
          {issue.replay && <RecordingSummary replay={issue.replay} />}
          <p className="linha-contato">
            <strong>{t.contactLabel}:</strong> {contact ?? t.noContact}
          </p>
          <button type="button" className="botao botao-pequeno" onClick={() => setEditing(true)}>
            {t.edit}
          </button>
        </>
      )}

      <AttachmentList attachments={cardAttachments} onDelete={(attachmentId) => void deleteAttachment(issue.id, attachmentId)} />

      <h3 className="secao">{t.commentCount(comments.length)}</h3>
      <CommentList
        comments={comments}
        images={commentImages}
        onDeleteImage={(attachmentId) => void deleteAttachment(issue.id, attachmentId)}
      />

      <CommentForm id="imagens-comentario-painel" onSubmit={onComment} />
    </aside>
  );
}
