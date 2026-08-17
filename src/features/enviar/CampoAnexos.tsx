import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { t } from "../../i18n";
import {
  ANEXOS_MAX,
  ANEXO_MAX_BYTES,
  EXTENSOES_ACEITAS,
  classificaArquivo,
  formataTamanho,
} from "../../lib/anexos";
import type { AnexoPronto } from "../../lib/anexos";
import { reduzirImagem } from "../../lib/imagem";

type Props = {
  anexos: AnexoPronto[];
  onChange: (anexos: AnexoPronto[]) => void;
  /** Precisa ser único na página: o formulário e o painel de comentar coexistem. */
  id?: string;
  /** No comentário só entra print — `.rrf` é coisa do relato, não da resposta. */
  apenasImagens?: boolean;
};

export function CampoAnexos({ anexos, onChange, id = "anexos", apenasImagens = false }: Props) {
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // As miniaturas viram object URL; sem revogar, cada troca de arquivo deixa um
  // blob preso na memória da aba.
  const previews = useMemo(
    () =>
      anexos.map((a) =>
        a.tipo === "imagem"
          ? URL.createObjectURL(new Blob([a.dados.slice() as unknown as BlobPart]))
          : null,
      ),
    [anexos],
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
    const novos: AnexoPronto[] = [];
    const problemas: string[] = [];

    for (const arquivo of escolhidos) {
      if (anexos.length + novos.length >= ANEXOS_MAX) {
        problemas.push(t.anexoDemais);
        break;
      }
      const tipo = classificaArquivo(arquivo);
      if (!tipo || (apenasImagens && tipo !== "imagem")) {
        problemas.push(
          apenasImagens ? t.anexoSoImagem(arquivo.name) : t.anexoTipoInvalido(arquivo.name),
        );
        continue;
      }
      try {
        if (tipo === "imagem") {
          const { dados, nome } = await reduzirImagem(arquivo);
          novos.push({ nome, tipo, dados });
        } else {
          // .rrf vai como está — encolher um replay não é opção.
          if (arquivo.size > ANEXO_MAX_BYTES) {
            problemas.push(t.anexoGrande(arquivo.name, formataTamanho(ANEXO_MAX_BYTES)));
            continue;
          }
          novos.push({
            nome: arquivo.name,
            tipo,
            dados: new Uint8Array(await arquivo.arrayBuffer()),
          });
        }
      } catch {
        problemas.push(t.anexoFalhou(arquivo.name));
      }
    }

    setPreparando(false);
    if (problemas.length) setErro(problemas.join(" "));
    if (novos.length) onChange([...anexos, ...novos]);
  }

  function remover(i: number) {
    onChange(anexos.filter((_, n) => n !== i));
  }

  return (
    <div className="campo">
      <label htmlFor={id}>{apenasImagens ? t.campoImagens : t.campoAnexos}</label>
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        accept={apenasImagens ? "image/*" : EXTENSOES_ACEITAS}
        onChange={(e) => void aoEscolher(e)}
        disabled={preparando || anexos.length >= ANEXOS_MAX}
        aria-describedby={`ajuda-${id}`}
      />
      <p className="campo-ajuda" id={`ajuda-${id}`}>
        {apenasImagens ? t.campoImagensAjuda : t.campoAnexosAjuda}
      </p>

      {preparando && <p className="campo-ajuda">{t.anexoPreparando}</p>}
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      {anexos.length > 0 && (
        <ul className="anexos-escolhidos">
          {anexos.map((a, i) => (
            <li key={`${a.nome}-${i}`}>
              {previews[i] ? (
                <img src={previews[i]!} alt="" className="anexo-thumb" />
              ) : (
                <span className="anexo-icone" aria-hidden="true">
                  📄
                </span>
              )}
              <span className="anexo-nome">{a.nome}</span>
              <span className="campo-ajuda">{formataTamanho(a.dados.byteLength)}</span>
              <button type="button" className="botao botao-pequeno" onClick={() => remover(i)}>
                {t.remover}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
