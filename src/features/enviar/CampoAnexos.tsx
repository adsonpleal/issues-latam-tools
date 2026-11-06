import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { t } from "../../i18n";
import {
  ATTACHMENTS_MAX,
  ATTACHMENT_MAX_BYTES,
  ACCEPTED_EXTENSIONS,
  classifyFile,
  formatSize,
} from "../../lib/anexos";
import type { PreparedAttachment } from "../../lib/anexos";
import { reduzirImagem } from "../../lib/imagem";

type Props = {
  attachments: PreparedAttachment[];
  onChange: (attachments: PreparedAttachment[]) => void;
  /** Precisa ser único na página: o formulário e o painel de comentar coexistem. */
  id?: string;
  /** No comentário só entra print — `.rrf` é coisa do relato, não da resposta. */
  apenasImagens?: boolean;
};

export function CampoAnexos({ attachments, onChange, id = "anexos", apenasImagens = false }: Props) {
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // As miniaturas viram object URL; sem revogar, cada troca de arquivo deixa um
  // blob preso na memória da aba.
  const previews = useMemo(
    () =>
      attachments.map((a) =>
        a.type === "imagem"
          ? URL.createObjectURL(new Blob([a.data.slice() as unknown as BlobPart]))
          : null,
      ),
    [attachments],
  );
  useEffect(
    () => () => previews.forEach((u) => u && URL.revokeObjectURL(u)),
    [previews],
  );

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const escolhidos = Array.from(e.target.files ?? []);
    if (input.current) input.current.value = "";
    if (escolhidos.length === 0) return;

    setErro(null);
    setPreparando(true);
    const novos: PreparedAttachment[] = [];
    const problemas: string[] = [];

    for (const file of escolhidos) {
      if (attachments.length + novos.length >= ATTACHMENTS_MAX) {
        problemas.push(t.attachmentTooMany);
        break;
      }
      const type = classifyFile(file);
      if (!type || (apenasImagens && type !== "imagem")) {
        problemas.push(
          apenasImagens ? t.attachmentImageOnly(file.name) : t.attachmentBadType(file.name),
        );
        continue;
      }
      try {
        if (type === "imagem") {
          const { data, name } = await reduzirImagem(file);
          novos.push({ name, type, data });
        } else {
          // .rrf vai como está — encolher um replay não é opção.
          if (file.size > ATTACHMENT_MAX_BYTES) {
            problemas.push(t.attachmentTooBig(file.name, formatSize(ATTACHMENT_MAX_BYTES)));
            continue;
          }
          novos.push({
            name: file.name,
            type,
            data: new Uint8Array(await file.arrayBuffer()),
          });
        }
      } catch {
        problemas.push(t.attachmentUnreadable(file.name));
      }
    }

    setPreparando(false);
    if (problemas.length) setErro(problemas.join(" "));
    if (novos.length) onChange([...attachments, ...novos]);
  }

  function remover(i: number) {
    onChange(attachments.filter((_, n) => n !== i));
  }

  return (
    <div className="campo">
      <label htmlFor={id}>{apenasImagens ? t.fieldImages : t.fieldAttachments}</label>
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        accept={apenasImagens ? "image/*" : ACCEPTED_EXTENSIONS}
        onChange={(e) => void aoEscolher(e)}
        disabled={preparando || attachments.length >= ATTACHMENTS_MAX}
        aria-describedby={`ajuda-${id}`}
      />
      <p className="campo-ajuda" id={`ajuda-${id}`}>
        {apenasImagens ? t.fieldImagesHelp : t.fieldAttachmentsHelp}
      </p>

      {preparando && <p className="campo-ajuda">{t.attachmentPreparing}</p>}
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      {attachments.length > 0 && (
        <ul className="anexos-escolhidos">
          {attachments.map((a, i) => (
            <li key={`${a.name}-${i}`}>
              {previews[i] ? (
                <img src={previews[i]!} alt="" className="anexo-thumb" />
              ) : (
                <span className="anexo-icone" aria-hidden="true">
                  📄
                </span>
              )}
              <span className="anexo-nome">{a.name}</span>
              <span className="campo-ajuda">{formatSize(a.data.byteLength)}</span>
              <button type="button" className="botao botao-pequeno" onClick={() => remover(i)}>
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
