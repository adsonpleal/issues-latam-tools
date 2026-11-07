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
import type { Session } from "../../lib/auth";
import type { Column } from "../../lib/status";

export function useAdminActions(session: Session | null) {
  const [error, setError] = useState<string | null>(null);

  const move = useCallback(
    async (id: string, column: Column) => {
      setError(null);
      // No local state: the board's onSnapshot already compensates for the
      // latency and paints the card in its new column before the write reaches
      // São Paulo.
      await moveIssue(id, column).catch((e: Error) => setError(e.message));
    },
    [],
  );

  const sort = useCallback(
    async (positions: Position[], moved?: { id: string; column: Column }) => {
      if (positions.length === 0 && !moved) return;
      setError(null);
      await sortIssues(positions, moved).catch((e: Error) => setError(e.message));
    },
    [],
  );

  const edit = useCallback(
    async (id: string, fields: Partial<Pick<Issue, "title" | "description" | "type" | "project">>) => {
      setError(null);
      await editIssue(id, fields).catch((e: Error) => setError(e.message));
    },
    [],
  );

  const comment = useCallback(
    async (issueId: string, text: string, images: PreparedAttachment[] = []) => {
      if (!session) return;
      setError(null);
      await addComment(issueId, text, session.name, session.uid, "comentario", images).catch(
        (e: Error) => setError(e.message),
      );
    },
    [session],
  );

  return { move, sort, edit, comment, error };
}
