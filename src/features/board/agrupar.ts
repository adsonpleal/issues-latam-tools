import type { Issue } from "../../lib/issues";
import type { Project } from "../../lib/projetos";
import type { Column, IssueType } from "../../lib/status";
import { COLUMNS, ADMIN_COLUMNS, sortsByUpdatedAt } from "../../lib/status";

export type Filters = {
  project: Project | null;
  type: IssueType | null;
  search: string;
};

export const NO_FILTERS: Filters = { project: null, type: null, search: "" };

/** Lowercase and unaccented, so "gravitacional" finds "Gravitacional". */
function normalise(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function filter(issues: Issue[], filters: Filters): Issue[] {
  const term = normalise(filters.search.trim());
  return issues.filter((i) => {
    if (filters.project && i.project !== filters.project) return false;
    if (filters.type && i.type !== filters.type) return false;
    if (term && !normalise(`${i.title} ${i.description}`).includes(term)) return false;
    return true;
  });
}

function timeOf(d: Date | null): number {
  return d ? d.getTime() : 0;
}

/**
 * The column a card shows in. `arquivado` is not a status: it is the boolean
 * that takes the card out of the five columns and drops it in the drawer.
 */
export function columnOf(issue: Issue): Column {
  return issue.archived ? "arquivado" : issue.status;
}

function compare(a: Issue, b: Issue, column: Column): number {
  // Arranged by hand wins over everything. Whatever was not arranged flows
  // below it by the column's own rule -- that is what makes a new card land at
  // the end of an arranged stack instead of wedging into the middle of it.
  if (a.order !== null || b.order !== null) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    if (a.order !== b.order) return a.order - b.order;
  }
  if (sortsByUpdatedAt(column)) {
    // The closing columns: whatever shipped most recently comes first.
    return timeOf(b.updatedAt) - timeOf(a.updatedAt);
  }
  // The rest of the board: most voted first, ties broken by the newest.
  if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
  return timeOf(b.createdAt) - timeOf(a.createdAt);
}

export type ColumnGroup = { column: Column; issues: Issue[] };

/**
 * One column's stack, in screen order.
 *
 * Grouping passes the already-filtered list; anything about to **write** an
 * order passes the whole list, unfiltered. That is not a detail: dragging with
 * a filter on must not shuffle what the filter is hiding. Because the complete
 * stack preserves the relative position of the hidden cards, "drop before card
 * X" means the same thing in both.
 */
export function stack(issues: Issue[], column: Column): Issue[] {
  return issues.filter((i) => columnOf(i) === column).sort((a, b) => compare(a, b, column));
}

/**
 * Filters, groups by status and sorts. A pure function on purpose -- it is the
 * one part of the board that can be tested without Firestore, and it is where
 * all the logic lives.
 */
export function group(issues: Issue[], filters: Filters): ColumnGroup[] {
  const visible = filter(issues, filters);
  return COLUMNS.map((column) => ({
    column: column as Column,
    issues: stack(visible, column),
  }));
}

/** Same as `group`, plus the archived drawer at the end. Only with a session. */
export function groupForAdmin(issues: Issue[], filters: Filters): ColumnGroup[] {
  const visible = filter(issues, filters);
  return ADMIN_COLUMNS.map((column) => ({ column, issues: stack(visible, column) }));
}
