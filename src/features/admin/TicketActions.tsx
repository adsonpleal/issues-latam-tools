import { useState } from "react";

import { STATUS_LABEL, t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import { ADMIN_COLUMNS, type Column } from "../../lib/status";
import { EditForm, useContact, type EditableFields } from "./IssueActions";

type Props = {
  issue: Issue;
  onMove: (column: Column) => void;
  onEdit: (fields: EditableFields) => void;
};

/**
 * What `/t/:id` gains right below the record when there is an admin session --
 * the same URL the public opens. The comment form is not here: it sits at the
 * end of the page, after the list, which is where one replies.
 *
 * The column selector is no ornament: this is where a card gets unarchived, and
 * the card's page became the only place an archived card is reachable from a
 * direct link.
 */
export function TicketActions({ issue, onMove, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const contact = useContact(issue.id);

  return (
    <section className="acoes-admin">
      {editing ? (
        <EditForm
          issue={issue}
          onSave={(fields) => {
            onEdit(fields);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="linha-contato">
            <strong>{t.contactLabel}:</strong> {contact ?? t.noContact}
          </p>
          <div className="acoes-admin-linha">
            <button type="button" className="botao botao-pequeno" onClick={() => setEditing(true)}>
              {t.edit}
            </button>
            <label className="campo-inline">
              <span className="visually-hidden">{t.moveTo}</span>
              <select
                value={issue.archived ? "arquivado" : issue.status}
                onChange={(e) => onMove(e.target.value as Column)}
              >
                {ADMIN_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {STATUS_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  );
}
