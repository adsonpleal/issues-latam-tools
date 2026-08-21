import { useState } from "react";

import { LABEL_STATUS, t } from "../../i18n";
import type { Issue } from "../../lib/issues";
import { COLUNAS_ADMIN, type Coluna } from "../../lib/status";
import { FormularioEdicao, useContato, type CamposEditaveis } from "./AcoesIssue";

type Props = {
  issue: Issue;
  onMover: (coluna: Coluna) => void;
  onEditar: (campos: CamposEditaveis) => void;
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
  const contato = useContato(issue.id);

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
            <strong>{t.contatoLabel}:</strong> {contato ?? t.semContato}
          </p>
          <div className="acoes-admin-linha">
            <button type="button" className="botao botao-pequeno" onClick={() => setEditando(true)}>
              {t.editar}
            </button>
            <label className="campo-inline">
              <span className="visually-hidden">{t.moverPara}</span>
              <select
                value={issue.arquivado ? "arquivado" : issue.status}
                onChange={(e) => onMover(e.target.value as Coluna)}
              >
                {COLUNAS_ADMIN.map((c) => (
                  <option key={c} value={c}>
                    {LABEL_STATUS[c]}
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
