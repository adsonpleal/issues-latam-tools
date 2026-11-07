import { useEffect, useMemo } from "react";

import { t } from "../../i18n";
import { attachmentUrl, type Attachment } from "../../lib/anexos";
import type { IssueComment } from "../../lib/comentarios";
import { formatDate } from "../../lib/datas";
import { TextWithLinks } from "./TextoComLinks";

type Props = {
  comments: IssueComment[];
  /** Only the attachments tied to a comment; the card's live in `AttachmentList`. */
  images?: Attachment[];
  /** Only with an admin session: the screenshot pasted by mistake can be removed. */
  onDeleteImage?: (attachmentId: string) => void;
};

export function CommentList({ comments, images = [], onDeleteImage }: Props) {
  // One object URL per image, revoked with it -- without this every Firestore
  // snapshot would leave a blob stuck in the tab's memory.
  const urls = useMemo(() => new Map(images.map((a) => [a.id, attachmentUrl(a)])), [images]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const byComment = useMemo(() => {
    const byId = new Map<string, Attachment[]>();
    for (const a of images) {
      if (!a.commentId) continue;
      byId.set(a.commentId, [...(byId.get(a.commentId) ?? []), a]);
    }
    return byId;
  }, [images]);

  if (comments.length === 0) return <p className="aviso">{t.noComments}</p>;

  return (
    <ol className="comentarios">
      {comments.map((c) => (
        <li key={c.id} className={`comentario comentario-${c.type}`}>
          <div className="comentario-topo">
            <strong>{c.author}</strong>
            <time dateTime={c.createdAt?.toISOString()}>{formatDate(c.createdAt)}</time>
          </div>
          <div className="comentario-texto">
            <TextWithLinks text={c.text} />
          </div>
          {(byComment.get(c.id)?.length ?? 0) > 0 && (
            <ul className="comentario-imagens">
              {byComment.get(c.id)!.map((a) => (
                <li key={a.id}>
                  <a
                    href={urls.get(a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.openImage}
                  >
                    <img src={urls.get(a.id)} alt={a.name} className="anexo-preview" />
                  </a>
                  {onDeleteImage && (
                    <button
                      type="button"
                      className="botao botao-pequeno"
                      onClick={() => onDeleteImage(a.id)}
                    >
                      {t.remove}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
