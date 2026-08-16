import { useEffect, useMemo } from "react";

import { t } from "../../i18n";
import { formataTamanho, urlDoAnexo, type Anexo } from "../../lib/anexos";

type Props = {
  anexos: Anexo[];
  /** Presente só no /admin: qualquer pessoa anexa, então precisa dar para tirar. */
  onApagar?: (anexoId: string) => void;
};

export function ListaAnexos({ anexos, onApagar }: Props) {
  const urls = useMemo(() => anexos.map(urlDoAnexo), [anexos]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  if (anexos.length === 0) return null;

  return (
    <section className="anexos">
      <h3 className="secao">{t.anexosTitulo}</h3>
      {/* `anexo-tipo-*` e não `anexo-imagem`: essa segunda forma colidia com a
          classe do próprio <img>, a regra da imagem acabava caindo também no
          <li> — que virava display:block, achatava para 2px e, de quebra, fazia
          o loading="lazy" concluir que a imagem estava fora de vista. */}
      <ul className="anexos-lista">
        {anexos.map((a, i) => (
          <li key={a.id} className={`anexo anexo-tipo-${a.tipo}`}>
            {a.tipo === "imagem" ? (
              <a
                className="anexo-link-imagem"
                href={urls[i]}
                target="_blank"
                rel="noopener noreferrer"
                title={t.abrirImagem}
              >
                {/* Sem lazy: são no máximo 5 e os bytes já estão na memória. */}
                <img src={urls[i]} alt={a.nome} className="anexo-preview" />
              </a>
            ) : (
              <span className="anexo-icone" aria-hidden="true">
                📄
              </span>
            )}
            <div className="anexo-info">
              <span className="anexo-nome">{a.nome}</span>
              <span className="campo-ajuda">{formataTamanho(a.tamanho)}</span>
            </div>
            {/* O arquivo já está na memória; o download sai do blob, sem rede. */}
            <a className="botao botao-pequeno" href={urls[i]} download={a.nome}>
              {t.baixar}
            </a>
            {onApagar && (
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onApagar(a.id)}
              >
                {t.remover}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
