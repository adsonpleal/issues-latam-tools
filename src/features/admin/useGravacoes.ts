import { useCallback, useEffect, useState } from "react";

import {
  deleteRecording,
  markRecording,
  promoteRecording,
  subscribeRecordings,
  type RecordingState,
  type Recording,
} from "../../lib/gravacoes";

export type QueueState = {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
};

/**
 * The live inbox, plus triage's actions.
 *
 * Only the /gravacoes route uses it: the collection's read rule is `isAdmin()`,
 * so for anybody else this returns nothing -- not even an empty list, a
 * permission error.
 */
export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    return subscribeRecordings(
      (list) => {
        setRecordings(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  // No optimistic state: the onSnapshot repaints the row in its new stack as
  // soon as the write is accepted, the same mechanism that moves a card on the
  // board.
  const promote = useCallback(async (g: Recording) => {
    setActionError(null);
    return promoteRecording(g).catch((e: Error) => {
      setActionError(e.message);
      return null;
    });
  }, []);

  const mark = useCallback(async (id: string, state: RecordingState) => {
    setActionError(null);
    await markRecording(id, state).catch((e: Error) => setActionError(e.message));
  }, []);

  const remove = useCallback(async (id: string) => {
    setActionError(null);
    await deleteRecording(id).catch((e: Error) => setActionError(e.message));
  }, []);

  return { recordings, loading, error, actionError, promote, mark, remove };
}
