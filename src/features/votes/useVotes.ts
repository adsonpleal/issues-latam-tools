import { useCallback, useState } from "react";

import { upvoteIssue } from "../../lib/issues";

/**
 * The stored key keeps its spelling: it is a localStorage key already set on
 * real machines, and renaming it would throw every vote cast so far away.
 */
const STORAGE_KEY = "issues.latamtools.votos";

/**
 * One vote per browser, kept in localStorage -- the same shape as the recap's
 * suggestion board. Clearing the storage or switching browsers votes again, and
 * that is fine: the vote is a thermometer for priority, not an election. The
 * Firestore rule only guarantees that each write touches one field and adds
 * exactly 1.
 */
function readVotes(): Record<string, true> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    // localStorage blocked (old private mode, storage full): no memory of the
    // vote, but the board keeps working.
    return {};
  }
}

function writeVotes(votes: Record<string, true>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
  } catch {
    /* no persistence; carry on */
  }
}

export function useVotes() {
  const [votes, setVotes] = useState<Record<string, true>>(readVotes);

  const hasVoted = useCallback((id: string) => votes[id] === true, [votes]);

  const vote = useCallback(
    async (id: string) => {
      if (votes[id]) return;
      // Stored before sending: if the write fails, the worst case is somebody
      // thinking they voted. The opposite -- letting them vote again because of
      // a network failure -- is worse and more confusing.
      const next = { ...votes, [id]: true as const };
      setVotes(next);
      writeVotes(next);
      await upvoteIssue(id).catch(() => undefined);
    },
    [votes],
  );

  return { hasVoted, vote };
}
