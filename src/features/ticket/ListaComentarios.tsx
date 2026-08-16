import { t } from "../../i18n";
import type { Comentario } from "../../lib/comentarios";
import { formatData } from "../../lib/datas";
import { TextoComLinks } from "./TextoComLinks";

export function ListaComentarios({ comentarios }: { comentarios: Comentario[] }) {
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
        </li>
      ))}
    </ol>
  );
}
