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
import { shrinkImage } from "../../lib/imagem";

type Props = {
  attachments: PreparedAttachment[];
  onChange: (attachments: PreparedAttachment[]) => void;
  /** Has to be unique on the page: the form and the comment panel coexist. */
  id?: string;
  /** A comment takes screenshots only -- the `.rrf` belongs to the report, not to the reply. */
  imagesOnly?: boolean;
};

export function AttachmentField({ attachments, onChange, id = "anexos", imagesOnly = false }: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // The thumbnails become object URLs; without revoking them, every file swap
  // leaves a blob stuck in the tab's memory.
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

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (input.current) input.current.value = "";
    if (picked.length === 0) return;

    setError(null);
    setPreparing(true);
    const next: PreparedAttachment[] = [];
    const problems: string[] = [];

    for (const file of picked) {
      if (attachments.length + next.length >= ATTACHMENTS_MAX) {
        problems.push(t.attachmentTooMany);
        break;
      }
      const type = classifyFile(file);
      if (!type || (imagesOnly && type !== "imagem")) {
        problems.push(
          imagesOnly ? t.attachmentImageOnly(file.name) : t.attachmentBadType(file.name),
        );
        continue;
      }
      try {
        if (type === "imagem") {
          const { data, name } = await shrinkImage(file);
          next.push({ name, type, data });
        } else {
          // The .rrf goes as it is -- shrinking a replay is not an option.
          if (file.size > ATTACHMENT_MAX_BYTES) {
            problems.push(t.attachmentTooBig(file.name, formatSize(ATTACHMENT_MAX_BYTES)));
            continue;
          }
          next.push({
            name: file.name,
            type,
            data: new Uint8Array(await file.arrayBuffer()),
          });
        }
      } catch {
        problems.push(t.attachmentUnreadable(file.name));
      }
    }

    setPreparing(false);
    if (problems.length) setError(problems.join(" "));
    if (next.length) onChange([...attachments, ...next]);
  }

  function remove(i: number) {
    onChange(attachments.filter((_, n) => n !== i));
  }

  return (
    <div className="campo">
      <label htmlFor={id}>{imagesOnly ? t.fieldImages : t.fieldAttachments}</label>
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        accept={imagesOnly ? "image/*" : ACCEPTED_EXTENSIONS}
        onChange={(e) => void onPick(e)}
        disabled={preparing || attachments.length >= ATTACHMENTS_MAX}
        aria-describedby={`ajuda-${id}`}
      />
      <p className="campo-ajuda" id={`ajuda-${id}`}>
        {imagesOnly ? t.fieldImagesHelp : t.fieldAttachmentsHelp}
      </p>

      {preparing && <p className="campo-ajuda">{t.attachmentPreparing}</p>}
      {error && <p className="aviso aviso-erro">{error}</p>}

      {attachments.length > 0 && (
        <ul className="anexos-picked">
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
              <button type="button" className="botao botao-pequeno" onClick={() => remove(i)}>
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
