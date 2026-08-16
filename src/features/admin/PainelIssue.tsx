import { useEffect, useState } from "react";

import { LABEL_TIPO, t } from "../../i18n";
import { subscribeComentarios, type Comentario } from "../../lib/comentarios";
import { getContato, type Issue } from "../../lib/issues";
import { PROJETOS, SLUGS_PROJETO, type Projeto } from "../../lib/projetos";
import { TIPOS, type Tipo } from "../../lib/status";
import { ListaComentarios } from "../ticket/ListaComentarios";

type Props = {
  issue: Issue;
  onFechar: () => void;
  onComentar: (texto: string) => void;
  onEditar: (campos: Partial<Pick<Issue, "titulo" | "descricao" | "tipo" | "projeto">>) => void;
};

export function PainelIssue({ issue, onFechar, onComentar, onEditar }: Props) {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [contato, setContato] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState({
    titulo: issue.titulo,
    descricao: issue.descricao,
    tipo: issue.tipo,
    projeto: issue.projeto,
  });

  useEffect(() => {
    setRascunho({
      titulo: issue.titulo,
      descricao: issue.descricao,
      tipo: issue.tipo,
      projeto: issue.projeto,
    });
    setEditando(false);
  }, [issue.id, issue.titulo, issue.descricao, issue.tipo, issue.projeto]);

  useEffect(
    () => subscribeComentarios(issue.id, setComentarios, () => setComentarios([])),
    [issue.id],
  );

  useEffect(() => {
    // Contato de quem reportou: mora num subdocumento que só o admin lê. Ausente
    // na maioria dos cards — é campo opcional, e os migrados das planilhas só têm
    // quando a pessoa preencheu.
    setContato(null);
    void getContato(issue.id).then(setContato).catch(() => setContato(null));
  }, [issue.id]);

  return (
    <aside className="painel" aria-label={issue.titulo}>
      <div className="painel-topo">
        <h2>{editando ? t.editar : issue.titulo}</h2>
        <button type="button" className="botao botao-pequeno" onClick={onFechar}>
          ✕
        </button>
      </div>

      {editando ? (
        <div className="painel-edicao">
          <label className="campo">
            <span>{t.campoTituloLabel}</span>
            <input
              value={rascunho.titulo}
              onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
              maxLength={120}
            />
          </label>
          <label className="campo">
            <span>{t.campoDescricao}</span>
            <textarea
              rows={8}
              value={rascunho.descricao}
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              maxLength={4000}
            />
          </label>
          <label className="campo">
            <span>{t.campoProjeto}</span>
            <select
              value={rascunho.projeto}
              onChange={(e) => setRascunho({ ...rascunho, projeto: e.target.value as Projeto })}
            >
              {SLUGS_PROJETO.map((s) => (
                <option key={s} value={s}>
                  {PROJETOS[s].nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>{t.campoTipo}</span>
            <select
              value={rascunho.tipo}
              onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value as Tipo })}
            >
              {TIPOS.map((tp) => (
                <option key={tp} value={tp}>
                  {LABEL_TIPO[tp]}
                </option>
              ))}
            </select>
          </label>
          <div className="formulario-acoes">
            <button
              type="button"
              className="botao botao-primario"
              onClick={() => {
                onEditar(rascunho);
                setEditando(false);
              }}
            >
              {t.salvar}
            </button>
            <button type="button" className="botao" onClick={() => setEditando(false)}>
              {t.cancelar}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="painel-meta">
            {PROJETOS[issue.projeto].nome} · {LABEL_TIPO[issue.tipo]} · ▲ {issue.upvotes}
            {issue.autor && <> · {t.reportadoPor(issue.autor)}</>}
          </p>
          {issue.descricao && <p className="painel-descricao">{issue.descricao}</p>}
          <p className="painel-contato">
            <strong>{t.contatoLabel}:</strong> {contato ?? t.semContato}
          </p>
          <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
            {t.editar}
          </button>
        </>
      )}

      <h3 className="secao">{t.comentariosLabel(comentarios.length)}</h3>
      <ListaComentarios comentarios={comentarios} />

      <form
        className="painel-comentar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return;
          onComentar(texto);
          setTexto("");
        }}
      >
        <label className="campo">
          <span className="visually-hidden">{t.comentar}</span>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t.comentarPlaceholder}
            maxLength={4000}
          />
        </label>
        <button type="submit" className="botao botao-primario">
          {t.comentar}
        </button>
      </form>
    </aside>
  );
}
