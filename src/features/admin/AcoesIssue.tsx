import { useEffect, useState } from "react";

import { LABEL_TIPO, t } from "../../i18n";
import type { AnexoPronto } from "../../lib/anexos";
import { getContato, type Issue } from "../../lib/issues";
import { PROJETOS, SLUGS_PROJETO, type Projeto } from "../../lib/projetos";
import { TIPOS, type Tipo } from "../../lib/status";
import { CampoAnexos } from "../enviar/CampoAnexos";

export type CamposEditaveis = Pick<Issue, "titulo" | "descricao" | "tipo" | "projeto">;

/**
 * As peças de edição que o painel do quadro e a página do card usam iguais.
 *
 * Elas moravam dentro do `PainelIssue` enquanto o painel era o único lugar com
 * poderes. Agora que `/t/:id` também edita, o que não pode acontecer é a mesma
 * regra de rascunho existir em dois arquivos e divergir.
 */

/**
 * Contato de quem reportou: mora num subdocumento que só o admin lê. Ausente na
 * maioria dos cards — é campo opcional, e os migrados das planilhas só têm
 * quando a pessoa preencheu.
 */
export function useContato(issueId: string): string | null {
  const [contato, setContato] = useState<string | null>(null);

  useEffect(() => {
    setContato(null);
    void getContato(issueId)
      .then(setContato)
      .catch(() => setContato(null));
  }, [issueId]);

  return contato;
}

type PropsEdicao = {
  issue: Issue;
  onSalvar: (campos: CamposEditaveis) => void;
  onCancelar: () => void;
};

export function FormularioEdicao({ issue, onSalvar, onCancelar }: PropsEdicao) {
  const [rascunho, setRascunho] = useState<CamposEditaveis>({
    titulo: issue.titulo,
    descricao: issue.descricao,
    tipo: issue.tipo,
    projeto: issue.projeto,
  });

  // O quadro é onSnapshot: se o card mudar embaixo do formulário — outra aba, ou
  // a própria escrita voltando do servidor — o rascunho volta para o que vale.
  useEffect(() => {
    setRascunho({
      titulo: issue.titulo,
      descricao: issue.descricao,
      tipo: issue.tipo,
      projeto: issue.projeto,
    });
  }, [issue.id, issue.titulo, issue.descricao, issue.tipo, issue.projeto]);

  return (
    <div className="form-edicao">
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
        <button type="button" className="botao botao-primario" onClick={() => onSalvar(rascunho)}>
          {t.salvar}
        </button>
        <button type="button" className="botao" onClick={onCancelar}>
          {t.cancelar}
        </button>
      </div>
    </div>
  );
}

type PropsComentario = {
  /**
   * Id do campo de anexos, obrigatório: o `htmlFor` do `CampoAnexos` precisa ser
   * único no documento, e agora existem duas instâncias deste formulário no app.
   */
  id: string;
  onEnviar: (texto: string, imagens: AnexoPronto[]) => void;
};

export function FormularioComentario({ id, onEnviar }: PropsComentario) {
  const [texto, setTexto] = useState("");
  const [imagens, setImagens] = useState<AnexoPronto[]>([]);

  return (
    <form
      className="form-comentar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!texto.trim()) return;
        onEnviar(texto, imagens);
        setTexto("");
        setImagens([]);
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
      <CampoAnexos id={id} apenasImagens anexos={imagens} onChange={setImagens} />
      <button type="submit" className="botao botao-primario">
        {t.comentar}
      </button>
    </form>
  );
}
