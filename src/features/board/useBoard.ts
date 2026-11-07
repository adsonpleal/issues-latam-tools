import { useEffect, useState } from "react";

import { subscribeIssues, type Issue } from "../../lib/issues";

export type BoardState = {
  issues: Issue[];
  loading: boolean;
  error: string | null;
};

/**
 * One live subscription for the whole app. Because it is onSnapshot, the board
 * moves by itself on the screen of whoever is watching when I drag a card --
 * and Firestore's latency compensation already paints the local change before
 * the round trip, so there is no hand-written optimistic state anywhere.
 */
export function useBoard(opts: { admin?: boolean } = {}): BoardState {
  const admin = opts.admin ?? false;
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const cancel = subscribeIssues(
      (list) => {
        setIssues(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
      { admin },
    );
    return cancel;
  }, [admin]);

  return { issues, loading, error };
}
