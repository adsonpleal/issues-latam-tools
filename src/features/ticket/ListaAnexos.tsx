import { useEffect, useMemo } from "react";

import { t } from "../../i18n";
import { formatSize, attachmentUrl, type Attachment } from "../../lib/anexos";

type Props = {
  attachments: Attachment[];
  /** Só com sessão de admin: qualquer pessoa anexa, então precisa dar para tirar. */
  onApagar?: (attachmentId: string) => void;
};

export function ListaAnexos({ attachments, onApagar }: Props) {
  const urls = useMemo(() => attachments.map(attachmentUrl), [attachments]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  if (attachments.length === 0) return null;

  return (
    <section className="anexos">
      <h3 className="secao">{t.attachmentsTitle}</h3>
      {/* `anexo-tipo-*` e não `anexo-imagem`: essa segunda forma colidia com a
          classe do próprio <img>, a regra da imagem acabava caindo também no
          <li> — que virava display:block, achatava para 2px e, de quebra, fazia
          o loading="lazy" concluir que a imagem estava fora de vista. */}
      <ul className="anexos-lista">
        {attachments.map((a, i) => (
          <li key={a.id} className={`anexo anexo-tipo-${a.type}`}>
            {a.type === "imagem" ? (
              <a
                className="anexo-link-imagem"
                href={urls[i]}
                target="_blank"
                rel="noopener noreferrer"
                title={t.openImage}
              >
                {/* Sem lazy: são no máximo 5 e os bytes já estão na memória. */}
                <img src={urls[i]} alt={a.name} className="anexo-preview" />
              </a>
            ) : (
              <span className="anexo-icone" aria-hidden="true">
                📄
              </span>
            )}
            <div className="anexo-info">
              <span className="anexo-nome">{a.name}</span>
              <span className="campo-ajuda">{formatSize(a.size)}</span>
            </div>
            {/* O arquivo já está na memória; o download sai do blob, sem rede. */}
            <a className="botao botao-pequeno" href={urls[i]} download={a.name}>
              {t.download}
            </a>
            {onApagar && (
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onApagar(a.id)}
              >
                {t.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
