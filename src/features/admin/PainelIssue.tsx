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
  FormularioEdicao,
  useContato,
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
 * O card aberto sem sair do quadro — é onde a triagem acontece, porque dá para
 * ler a ficha e arrastar a coluna na mesma tela. A mesma ficha, inteira e com os
 * mesmos poderes, também abre em `/t/:id`; as peças de edição são as mesmas.
 */
export function IssuePanel({ issue, onClose, onComment, onEdit }: Props) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editando, setEditando] = useState(false);
  const contact = useContato(issue.id);

  useEffect(() => setEditando(false), [issue.id]);

  useEffect(
    () => subscribeComments(issue.id, setComments, () => setComments([])),
    [issue.id],
  );

  useEffect(() => subscribeAttachments(issue.id, setAttachments, () => setAttachments([])), [issue.id]);

  // Mesma subcoleção, dois lugares na tela: sem `comentarioId` é anexo do card,
  // com `comentarioId` é print colado numa atualização.
  const [cardAttachments, commentImages] = useMemo(
    () => [attachments.filter((a) => !a.commentId), attachments.filter((a) => a.commentId)],
    [attachments],
  );

  return (
    <aside className="painel" aria-label={issue.title}>
      <div className="painel-topo">
        <h2>{editando ? t.edit : issue.title}</h2>
        <button type="button" className="botao botao-pequeno" onClick={onClose}>
          ✕
        </button>
      </div>

      {editando ? (
        <FormularioEdicao
          issue={issue}
          onSave={(fields) => {
            onEdit(fields);
            setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
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
          <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
            {t.edit}
          </button>
        </>
      )}

      <AttachmentList attachments={cardAttachments} onDelete={(attachmentId) => void deleteAttachment(issue.id, attachmentId)} />

      <h3 className="secao">{t.commentCount(comments.length)}</h3>
      <CommentList
        comments={comments}
        images={commentImages}
        onApagarImagem={(attachmentId) => void deleteAttachment(issue.id, attachmentId)}
      />

      <CommentForm id="imagens-comentario-painel" onSubmit={onComment} />
    </aside>
  );
}
