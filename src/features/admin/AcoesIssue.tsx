import { useEffect, useState } from "react";

import { TYPE_LABEL, t } from "../../i18n";
import type { PreparedAttachment } from "../../lib/anexos";
import { getContact, type Issue } from "../../lib/issues";
import { PROJECTS, PROJECT_SLUGS, type Project } from "../../lib/projetos";
import { ISSUE_TYPES, type IssueType } from "../../lib/status";
import { AttachmentField } from "../enviar/CampoAnexos";

export type EditableFields = Pick<Issue, "title" | "description" | "type" | "project">;

/**
 * The editing pieces the board's panel and the card's page use alike.
 *
 * They lived inside `IssuePanel` while the panel was the only place with
 * powers. Now that `/t/:id` edits too, what must not happen is the same draft
 * rule living in two files and drifting apart.
 */

/**
 * The reporter's contact: it lives in a subdocument only the admin reads.
 * Missing from most cards -- it is an optional field, and the ones migrated from
 * the spreadsheets only have it where the person filled it in.
 */
export function useContact(issueId: string): string | null {
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    setContact(null);
    void getContact(issueId)
      .then(setContact)
      .catch(() => setContact(null));
  }, [issueId]);

  return contact;
}

type EditProps = {
  issue: Issue;
  onSave: (fields: EditableFields) => void;
  onCancel: () => void;
};

export function EditForm({ issue, onSave, onCancel }: EditProps) {
  const [draft, setDraft] = useState<EditableFields>({
    title: issue.title,
    description: issue.description,
    type: issue.type,
    project: issue.project,
  });

  // The board is onSnapshot: if the card changes underneath the form -- another
  // tab, or this very write coming back from the server -- the draft returns to
  // what holds.
  useEffect(() => {
    setDraft({
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
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          maxLength={120}
        />
      </label>
      <label className="campo">
        <span>{t.fieldDetails}</span>
        <textarea
          rows={8}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          maxLength={4000}
        />
      </label>
      <label className="campo">
        <span>{t.fieldProject}</span>
        <select
          value={draft.project}
          onChange={(e) => setDraft({ ...draft, project: e.target.value as Project })}
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
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as IssueType })}
        >
          {ISSUE_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {TYPE_LABEL[tp]}
            </option>
          ))}
        </select>
      </label>
      <div className="formulario-acoes">
        <button type="button" className="botao botao-primario" onClick={() => onSave(draft)}>
          {t.save}
        </button>
        <button type="button" className="botao" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </div>
  );
}

type CommentProps = {
  /**
   * The attachment field's id, mandatory: `AttachmentField`'s `htmlFor` has to
   * be unique in the document, and there are now two instances of this form in
   * the app.
   */
  id: string;
  onSubmit: (text: string, images: PreparedAttachment[]) => void;
};

export function CommentForm({ id, onSubmit }: CommentProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<PreparedAttachment[]>([]);

  return (
    <form
      className="form-comentar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSubmit(text, images);
        setText("");
        setImages([]);
      }}
    >
      <label className="campo">
        <span className="visually-hidden">{t.comment}</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.commentPlaceholder}
          maxLength={4000}
        />
      </label>
      <AttachmentField id={id} imagesOnly attachments={images} onChange={setImages} />
      <button type="submit" className="botao botao-primario">
        {t.comment}
      </button>
    </form>
  );
}
