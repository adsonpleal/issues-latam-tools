import { useEffect, useState } from "react";

import { TYPE_LABEL, t } from "../../i18n";
import type { PreparedAttachment } from "../../lib/anexos";
import { getContact, type Issue } from "../../lib/issues";
import { PROJECTS, PROJECT_SLUGS, type Project } from "../../lib/projetos";
import { ISSUE_TYPES, type IssueType } from "../../lib/status";
import { CampoAnexos } from "../enviar/CampoAnexos";

export type EditableFields = Pick<Issue, "title" | "description" | "type" | "project">;

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
  const [contact, setContato] = useState<string | null>(null);

  useEffect(() => {
    setContato(null);
    void getContact(issueId)
      .then(setContato)
      .catch(() => setContato(null));
  }, [issueId]);

  return contact;
}

type PropsEdicao = {
  issue: Issue;
  onSalvar: (campos: EditableFields) => void;
  onCancelar: () => void;
};

export function FormularioEdicao({ issue, onSalvar, onCancelar }: PropsEdicao) {
  const [rascunho, setRascunho] = useState<EditableFields>({
    title: issue.title,
    description: issue.description,
    type: issue.type,
    project: issue.project,
  });

  // O quadro é onSnapshot: se o card mudar embaixo do formulário — outra aba, ou
  // a própria escrita voltando do servidor — o rascunho volta para o que vale.
  useEffect(() => {
    setRascunho({
      title: issue.title,
      description: issue.description,
      type: issue.type,
      project: issue.project,
    });
  }, [issue.id, issue.title, issue.description, issue.type, issue.project]);

  return (
    <div className="form-edicao">
      <label className="campo">
        <span>{t.fieldSummary}</span>
        <input
          value={rascunho.title}
          onChange={(e) => setRascunho({ ...rascunho, title: e.target.value })}
          maxLength={120}
        />
      </label>
      <label className="campo">
        <span>{t.fieldDetails}</span>
        <textarea
          rows={8}
          value={rascunho.description}
          onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })}
          maxLength={4000}
        />
      </label>
      <label className="campo">
        <span>{t.fieldProject}</span>
        <select
          value={rascunho.project}
          onChange={(e) => setRascunho({ ...rascunho, project: e.target.value as Project })}
        >
          {PROJECT_SLUGS.map((s) => (
            <option key={s} value={s}>
              {PROJECTS[s].name}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>{t.fieldType}</span>
        <select
          value={rascunho.type}
          onChange={(e) => setRascunho({ ...rascunho, type: e.target.value as IssueType })}
        >
          {ISSUE_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {TYPE_LABEL[tp]}
            </option>
          ))}
        </select>
      </label>
      <div className="formulario-acoes">
        <button type="button" className="botao botao-primario" onClick={() => onSalvar(rascunho)}>
          {t.save}
        </button>
        <button type="button" className="botao" onClick={onCancelar}>
          {t.cancel}
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
  onEnviar: (text: string, images: PreparedAttachment[]) => void;
};

export function FormularioComentario({ id, onEnviar }: PropsComentario) {
  const [text, setTexto] = useState("");
  const [images, setImagens] = useState<PreparedAttachment[]>([]);

  return (
    <form
      className="form-comentar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onEnviar(text, images);
        setTexto("");
        setImagens([]);
      }}
    >
      <label className="campo">
        <span className="visually-hidden">{t.comment}</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t.commentPlaceholder}
          maxLength={4000}
        />
      </label>
      <CampoAnexos id={id} apenasImagens attachments={images} onChange={setImagens} />
      <button type="submit" className="botao botao-primario">
        {t.comment}
      </button>
    </form>
  );
}
