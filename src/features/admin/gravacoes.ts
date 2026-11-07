import { t } from "../../i18n";
import type { Recording } from "../../lib/gravacoes";
import type { ReplaySummary } from "../../lib/issues";

/**
 * The triage queue, in three stacks.
 *
 * `queue` is what awaits a decision; `decided` joins `conferida` and
 * `descartada`, the two ways of closing without publishing; `promoted` already
 * became a card.
 */
export type RecordingQueue = {
  queue: Recording[];
  promoted: Recording[];
  decided: Recording[];
};

function timeOf(d: Date | null): number {
  return d ? d.getTime() : 0;
}

export function splitRecordings(recordings: Recording[]): RecordingQueue {
  // The queue sorts by arrival; the decided ones by the stamp -- there what
  // matters is what just left, not what was recorded first.
  const byArrival = (a: Recording, b: Recording) => timeOf(b.createdAt) - timeOf(a.createdAt);
  const byDecision = (a: Recording, b: Recording) => timeOf(b.decidedAt) - timeOf(a.decidedAt);

  return {
    queue: recordings.filter((g) => g.state === "fila").sort(byArrival),
    promoted: recordings.filter((g) => g.state === "promovida").sort(byDecision),
    decided: recordings
      .filter((g) => g.state === "conferida" || g.state === "descartada")
      .sort(byDecision),
  };
}

/** "2m 13s". The .rrf measures in milliseconds, and nobody reads 133400 as two minutes. */
export function formatDuration(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return min ? `${min}m ${sec}s` : `${sec}s`;
}

export type SummaryRow = { key: string; label: string; value: string; help?: string };

/**
 * What triage reads off a recording, in a single list -- the same one in the
 * queue and in the promoted card's panel. Living in one place is what stops the
 * two screens from disagreeing about what matters: equipment changes separate
 * "wrong formula" from "item missing from the database", and dummy hits are what
 * produce enough crits to close the arithmetic.
 */
export function summaryRows(replay: ReplaySummary): SummaryRow[] {
  const rows: SummaryRow[] = [
    {
      key: "character",
      label: t.recordingCharacter,
      value: `${replay.className ?? "?"} — ${replay.player ?? "?"} (nv ${replay.baseLevel ?? "?"}/${
        replay.jobLevel ?? "?"
      })`,
    },
    {
      key: "hits",
      label: t.recordingHits,
      value: `${replay.dummyHits ?? 0} em dummy · ${replay.damageEvents ?? 0} no total`,
    },
    { key: "changes", label: t.recordingEquipChanges, value: String(replay.equipChangeCount ?? 0) },
  ];

  if (replay.traits && Object.keys(replay.traits).length > 0) {
    rows.push({
      key: "traits",
      label: t.recordingTraits,
      // A visible separator: the double space that used to be here collapsed to
      // one in the HTML, and "POW 10 CON 5" read as one number after another.
      value: Object.entries(replay.traits)
        .map(([k, v]) => `${k.toUpperCase()} ${v}`)
        .join(" · "),
      // Where they came from changes the weight: read off the recording is a
      // fact, typed into the form is the word of whoever recorded it.
      help: replay.traitsSource === "replay" ? t.traitsFromRecording : t.traitsFromForm,
    });
  }

  if (replay.skippedItems && replay.skippedItems.length > 0) {
    rows.push({
      key: "items",
      label: t.recordingUnknownItems,
      value: replay.skippedItems.join(", "),
    });
  }

  const duration = formatDuration(replay.durationMs);
  if (duration) rows.push({ key: "duration", label: t.recordingDuration, value: duration });

  // The migration wrote an empty string when the source had no such field,
  // which is why this is `||` and not `??`.
  rows.push({ key: "version", label: t.recordingAppVersion, value: replay.appVersion || "?" });

  if (replay.fileName) {
    rows.push({ key: "file", label: t.recordingFile, value: replay.fileName });
  }

  return rows;
}
