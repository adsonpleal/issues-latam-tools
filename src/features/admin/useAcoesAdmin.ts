import { useCallback, useState } from "react";

import type { PreparedAttachment } from "../../lib/anexos";
import { addComment } from "../../lib/comentarios";
import {
  editIssue,
  moveIssue,
  sortIssues,
  type Issue,
  type Position,
} from "../../lib/issues";
import type { Sessao } from "../../lib/auth";
import type { Column } from "../../lib/status";

export function useAcoesAdmin(sessao: Sessao | null) {
  const [erro, setErro] = useState<string | null>(null);

  const mover = useCallback(
    async (id: string, column: Column) => {
      setErro(null);
      // Sem estado local: o onSnapshot do quadro já compensa a latência e pinta
      // o card na coluna nova antes da escrita chegar em São Paulo.
      await moveIssue(id, column).catch((e: Error) => setErro(e.message));
    },
    [],
  );

  const ordenar = useCallback(
    async (posicoes: Position[], movido?: { id: string; column: Column }) => {
      if (posicoes.length === 0 && !movido) return;
      setErro(null);
      await sortIssues(posicoes, movido).catch((e: Error) => setErro(e.message));
    },
    [],
  );

  const editar = useCallback(
    async (id: string, fields: Partial<Pick<Issue, "title" | "description" | "type" | "project">>) => {
      setErro(null);
      await editIssue(id, fields).catch((e: Error) => setErro(e.message));
    },
    [],
  );

  const comentar = useCallback(
    async (issueId: string, text: string, images: PreparedAttachment[] = []) => {
      if (!sessao) return;
      setErro(null);
      await addComment(issueId, text, sessao.name, sessao.uid, "comentario", images).catch(
        (e: Error) => setErro(e.message),
      );
    },
    [sessao],
  );

  return { mover, ordenar, editar, comentar, erro };
}
