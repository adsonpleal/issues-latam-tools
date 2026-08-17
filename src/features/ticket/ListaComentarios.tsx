import { useEffect, useMemo } from "react";

import { t } from "../../i18n";
import { urlDoAnexo, type Anexo } from "../../lib/anexos";
import type { Comentario } from "../../lib/comentarios";
import { formatData } from "../../lib/datas";
import { TextoComLinks } from "./TextoComLinks";

type Props = {
  comentarios: Comentario[];
  /** Só os anexos amarrados a comentário; os do card ficam na `ListaAnexos`. */
  imagens?: Anexo[];
  /** Presente só no /admin: dá para tirar o print colado por engano. */
  onApagarImagem?: (anexoId: string) => void;
};

export function ListaComentarios({ comentarios, imagens = [], onApagarImagem }: Props) {
  // Um object URL por imagem, revogado junto — sem isto cada snapshot do
  // Firestore deixaria um blob preso na memória da aba.
  const urls = useMemo(() => new Map(imagens.map((a) => [a.id, urlDoAnexo(a)])), [imagens]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const porComentario = useMemo(() => {
    const mapa = new Map<string, Anexo[]>();
    for (const a of imagens) {
      if (!a.comentarioId) continue;
      mapa.set(a.comentarioId, [...(mapa.get(a.comentarioId) ?? []), a]);
    }
    return mapa;
  }, [imagens]);

  if (comentarios.length === 0) return <p className="aviso">{t.semComentarios}</p>;

  return (
    <ol className="comentarios">
      {comentarios.map((c) => (
        <li key={c.id} className={`comentario comentario-${c.tipo}`}>
          <div className="comentario-topo">
            <strong>{c.autor}</strong>
            <time dateTime={c.criadoEm?.toISOString()}>{formatData(c.criadoEm)}</time>
          </div>
          <div className="comentario-texto">
            <TextoComLinks texto={c.texto} />
          </div>
          {(porComentario.get(c.id)?.length ?? 0) > 0 && (
            <ul className="comentario-imagens">
              {porComentario.get(c.id)!.map((a) => (
                <li key={a.id}>
                  <a
                    href={urls.get(a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.abrirImagem}
                  >
                    <img src={urls.get(a.id)} alt={a.nome} className="anexo-preview" />
                  </a>
                  {onApagarImagem && (
                    <button
                      type="button"
                      className="botao botao-pequeno"
                      onClick={() => onApagarImagem(a.id)}
                    >
                      {t.remover}
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
