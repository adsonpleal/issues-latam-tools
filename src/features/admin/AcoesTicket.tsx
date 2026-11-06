import { useState } from "react";

import { STATUS_LABEL, t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import { ADMIN_COLUMNS, type Column } from "../../lib/status";
import { FormularioEdicao, useContato, type EditableFields } from "./AcoesIssue";

type Props = {
  issue: Issue;
  onMover: (column: Column) => void;
  onEditar: (campos: EditableFields) => void;
};

/**
 * O que `/t/:id` ganha logo abaixo da ficha quando existe sessão de admin —
 * mesma URL que o público abre. O formulário de comentário não está aqui: ele
 * fica no fim da página, depois da lista, que é onde se responde.
 *
 * O seletor de coluna não é enfeite: é por aqui que se desarquiva um card, e a
 * página do card virou o único lugar onde um card arquivado é alcançável pelo
 * link direto.
 */
export function AcoesTicket({ issue, onMover, onEditar }: Props) {
  const [editando, setEditando] = useState(false);
  const contact = useContato(issue.id);

  return (
    <section className="acoes-admin">
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
          <p className="linha-contato">
            <strong>{t.contactLabel}:</strong> {contact ?? t.noContact}
          </p>
          <div className="acoes-admin-linha">
            <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
              {t.edit}
            </button>
            <label className="campo-inline">
              <span className="visually-hidden">{t.moveTo}</span>
              <select
                value={issue.archived ? "arquivado" : issue.status}
                onChange={(e) => onMover(e.target.value as Column)}
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
