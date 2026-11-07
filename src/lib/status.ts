/**
 * The five public columns, in board order.
 *
 * The values are the `status` strings stored on a card, so they keep the
 * database's spelling.
 *
 * `arquivado` is NOT a status: it is a separate boolean on the document. That
 * is what lets the security rule hide an archived card (see firestore.rules),
 * and it is what makes un-archiving return a card to `resolvido` instead of
 * dropping it back into `reportado`.
 */
export const COLUMNS = [
  "reportado",
  "backlog",
  "em_progresso",
  "resolvido",
  "nao_sera_feito",
] as const;

export type Status = (typeof COLUMNS)[number];

/**
 * A column on the admin board: the five status ones plus the archived drawer.
 * `arquivado` names that drawer and is the field name it reads from, so it is
 * spelled the same way.
 */
export type Column = Status | "arquivado";

export const ADMIN_COLUMNS: Column[] = [...COLUMNS, "arquivado"];

/**
 * `replay` is the .rrf recording that arrives through "Ajude o simulador a
 * acertar as contas". It is nobody's request: it is review material, and it
 * doubles as the label triage uses to find those among the rest.
 */
export const ISSUE_TYPES = ["bug", "feature", "replay"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/** The public form offers only these two -- a recording arrives via the simulator. */
export const FORM_ISSUE_TYPES = ["bug", "feature"] as const;

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (COLUMNS as readonly string[]).includes(value);
}

export function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPES as readonly string[]).includes(value);
}

/**
 * The closing columns sort by when a card was last touched rather than by
 * votes: what matters there is "what just shipped", not "what was asked for
 * most". The archived drawer is the same idea -- nobody goes looking there for
 * the most upvoted card.
 */
export function sortsByUpdatedAt(column: Column): boolean {
  return column === "resolvido" || column === "nao_sera_feito" || column === "arquivado";
}
