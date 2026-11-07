import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { TYPE_LABEL, t } from "../../i18n";
import {
  NICK_MAX,
  CONTACT_MAX,
  DESCRIPTION_MAX,
  TITLE_MAX,
  type PreparedAttachment,
} from "../../lib/issues";
import { PROJECTS, PROJECT_SLUGS, parseProject, type Project } from "../../lib/projects";
import { FORM_ISSUE_TYPES, type IssueType } from "../../lib/status";
import { AttachmentField } from "./AttachmentField";
import { useSubmitIssue } from "./useSubmitIssue";

export function NewIssueForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, errorMessage, submit } = useSubmitIssue();

  // The project arrives pre-selected from the origin site's "Reportar" link.
  // The query parameter and the field ids are public, so they keep their
  // spelling.
  const [project, setProject] = useState<Project>(parseProject(params.get("projeto")) ?? "simulador");
  const [type, setType] = useState<IssueType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [contact, setContact] = useState("");
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [honeypot, setHoneypot] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = await submit({ project, type, title, description, author, contact, attachments, honeypot });
    if (id) navigate(`/t/${id}?novo=1`);
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="projeto">{t.fieldProject}</label>
        <select
          id="projeto"
          value={project}
          onChange={(e) => setProject(e.target.value as Project)}
          required
        >
          {PROJECT_SLUGS.map((slug) => (
            <option key={slug} value={slug}>
              {PROJECTS[slug].name} — {PROJECTS[slug].description}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="campo campo-radio">
        <legend>{t.fieldType}</legend>
        {/* The radios live in a div of their own: the fieldset inherits
            `flex-direction: column` from `.campo`, and it is the row that has
            to be horizontal, not the legend along with them. */}
        <div className="radio-linha">
          {FORM_ISSUE_TYPES.map((tp) => (
            <label key={tp} className="radio">
              <input
                type="radio"
                name="tipo"
                value={tp}
                checked={type === tp}
                onChange={() => setType(tp)}
              />
              {TYPE_LABEL[tp]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campo">
        <label htmlFor="titulo">{t.fieldSummary}</label>
        <input
          id="titulo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.fieldSummaryPlaceholder}
          maxLength={TITLE_MAX}
          required
          minLength={3}
        />
      </div>

      <div className="campo">
        <label htmlFor="descricao">{t.fieldDetails}</label>
        <textarea
          id="descricao"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.fieldDetailsPlaceholder}
          maxLength={DESCRIPTION_MAX}
          rows={7}
        />
      </div>

      <AttachmentField attachments={attachments} onChange={setAttachments} />

      <div className="campo">
        <label htmlFor="autor">{t.fieldNick}</label>
        <input
          id="autor"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={NICK_MAX}
          aria-describedby="ajuda-autor"
        />
        <p className="campo-ajuda" id="ajuda-autor">
          {t.fieldNickHelp}
        </p>
      </div>

      <div className="campo">
        <label htmlFor="contato">{t.fieldContact}</label>
        <input
          id="contato"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={CONTACT_MAX}
          aria-describedby="ajuda-contato"
        />
        <p className="campo-ajuda" id="ajuda-contato">
          {t.fieldContactHelp}
        </p>
      </div>

      {/* The honeypot: invisible and out of the tab order, so a person never
          fills it in. A robot filling forms wholesale does. The class name is
          the stylesheet's, so it keeps its spelling. */}
      <div className="isca" aria-hidden="true">
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {errorMessage && <p className="aviso aviso-erro">{errorMessage}</p>}

      <div className="formulario-acoes">
        <button type="submit" className="botao botao-primario" disabled={state === "sending"}>
          {state === "sending" ? t.submitting : t.submit}
        </button>
      </div>
    </form>
  );
}
