import { useCallback, useState } from "react";

import { addComentario } from "../../lib/comentarios";
import { editarIssue, moverIssue, type Issue } from "../../lib/issues";
import type { Sessao } from "../../lib/auth";
import type { Coluna } from "../../lib/status";

export function useAcoesAdmin(sessao: Sessao | null) {
  const [erro, setErro] = useState<string | null>(null);

  const mover = useCallback(
    async (id: string, coluna: Coluna) => {
      setErro(null);
      // Sem estado local: o onSnapshot do quadro já compensa a latência e pinta
      // o card na coluna nova antes da escrita chegar em São Paulo.
      await moverIssue(id, coluna).catch((e: Error) => setErro(e.message));
    },
    [],
  );

  const editar = useCallback(
    async (id: string, campos: Partial<Pick<Issue, "titulo" | "descricao" | "tipo" | "projeto">>) => {
      setErro(null);
      await editarIssue(id, campos).catch((e: Error) => setErro(e.message));
    },
    [],
  );

  const comentar = useCallback(
    async (issueId: string, texto: string) => {
      if (!sessao) return;
      setErro(null);
      await addComentario(issueId, texto, sessao.nome, sessao.uid).catch((e: Error) =>
        setErro(e.message),
      );
    },
    [sessao],
  );

  return { mover, editar, comentar, erro };
}
