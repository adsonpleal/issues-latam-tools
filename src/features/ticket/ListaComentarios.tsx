import { useEffect, useMemo } from "react";

import { t } from "../../i18n";
import { attachmentUrl, type Attachment } from "../../lib/anexos";
import type { IssueComment } from "../../lib/comentarios";
import { formatDate } from "../../lib/datas";
import { TextWithLinks } from "./TextoComLinks";

type Props = {
  comments: IssueComment[];
  /** Só os anexos amarrados a comentário; os do card ficam na `ListaAnexos`. */
  images?: Attachment[];
  /** Só com sessão de admin: dá para tirar o print colado por engano. */
  onApagarImagem?: (attachmentId: string) => void;
};

export function CommentList({ comments, images = [], onApagarImagem }: Props) {
  // Um object URL por imagem, revogado junto — sem isto cada snapshot do
  // Firestore deixaria um blob preso na memória da aba.
  const urls = useMemo(() => new Map(images.map((a) => [a.id, attachmentUrl(a)])), [images]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const porComentario = useMemo(() => {
    const mapa = new Map<string, Attachment[]>();
    for (const a of images) {
      if (!a.commentId) continue;
      mapa.set(a.commentId, [...(mapa.get(a.commentId) ?? []), a]);
    }
    return mapa;
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
          {(porComentario.get(c.id)?.length ?? 0) > 0 && (
            <ul className="comentario-imagens">
              {porComentario.get(c.id)!.map((a) => (
                <li key={a.id}>
                  <a
                    href={urls.get(a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.openImage}
                  >
                    <img src={urls.get(a.id)} alt={a.name} className="anexo-preview" />
                  </a>
                  {onApagarImagem && (
                    <button
                      type="button"
                      className="botao botao-pequeno"
                      onClick={() => onApagarImagem(a.id)}
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
