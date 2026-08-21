import { useEffect, useMemo, useState } from "react";

import { LABEL_TIPO, t } from "../../i18n";
import { apagarAnexo, subscribeAnexos, type Anexo, type AnexoPronto } from "../../lib/anexos";
import { subscribeComentarios, type Comentario } from "../../lib/comentarios";
import type { Issue } from "../../lib/issues";
import { PROJETOS } from "../../lib/projetos";
import { ListaAnexos } from "../ticket/ListaAnexos";
import { ListaComentarios } from "../ticket/ListaComentarios";
import {
  FormularioComentario,
  FormularioEdicao,
  useContato,
  type CamposEditaveis,
} from "./AcoesIssue";
import { ResumoGravacao } from "./ResumoGravacao";

type Props = {
  issue: Issue;
  onFechar: () => void;
  onComentar: (texto: string, imagens: AnexoPronto[]) => void;
  onEditar: (campos: CamposEditaveis) => void;
};

/**
 * O card aberto sem sair do quadro — é onde a triagem acontece, porque dá para
 * ler a ficha e arrastar a coluna na mesma tela. A mesma ficha, inteira e com os
 * mesmos poderes, também abre em `/t/:id`; as peças de edição são as mesmas.
 */
export function PainelIssue({ issue, onFechar, onComentar, onEditar }: Props) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [editando, setEditando] = useState(false);
  const contato = useContato(issue.id);

  useEffect(() => setEditando(false), [issue.id]);

  useEffect(
    () => subscribeComentarios(issue.id, setComentarios, () => setComentarios([])),
    [issue.id],
  );

  useEffect(() => subscribeAnexos(issue.id, setAnexos, () => setAnexos([])), [issue.id]);

  // Mesma subcoleção, dois lugares na tela: sem `comentarioId` é anexo do card,
  // com `comentarioId` é print colado numa atualização.
  const [anexosDoCard, imagensDeComentario] = useMemo(
    () => [anexos.filter((a) => !a.comentarioId), anexos.filter((a) => a.comentarioId)],
    [anexos],
  );

  return (
    <aside className="painel" aria-label={issue.titulo}>
      <div className="painel-topo">
        <h2>{editando ? t.editar : issue.titulo}</h2>
        <button type="button" className="botao botao-pequeno" onClick={onFechar}>
          ✕
        </button>
      </div>

      {editando ? (
        <FormularioEdicao
          issue={issue}
          onSalvar={(campos) => {
            onEditar(campos);
            setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <p className="painel-meta">
            {PROJETOS[issue.projeto].nome} · {LABEL_TIPO[issue.tipo]} · ▲ {issue.upvotes}
            {issue.autor && <> · {t.reportadoPor(issue.autor)}</>}
          </p>
          {issue.descricao && <p className="painel-descricao">{issue.descricao}</p>}
          {issue.replay && <ResumoGravacao replay={issue.replay} />}
          <p className="linha-contato">
            <strong>{t.contatoLabel}:</strong> {contato ?? t.semContato}
          </p>
          <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
            {t.editar}
          </button>
        </>
      )}

      <ListaAnexos anexos={anexosDoCard} onApagar={(anexoId) => void apagarAnexo(issue.id, anexoId)} />

      <h3 className="secao">{t.comentariosLabel(comentarios.length)}</h3>
      <ListaComentarios
        comentarios={comentarios}
        imagens={imagensDeComentario}
        onApagarImagem={(anexoId) => void apagarAnexo(issue.id, anexoId)}
      />

      <FormularioComentario id="imagens-comentario-painel" onEnviar={onComentar} />
    </aside>
  );
}
