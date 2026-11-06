import {
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { ATTACHMENTS_MAX, uploadAttachment, type PreparedAttachment } from "./anexos";
import { getDb } from "./firebase";
import type { Project } from "./projetos";
import { isProject } from "./projetos";
import type { Column, Status, IssueType } from "./status";
import { isStatus, isIssueType } from "./status";

export const BOARD_LIMIT = 500;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const NICK_MAX = 40;
export const CONTACT_MAX = 120;

/**
 * A card, as the rest of the app sees it.
 *
 * These names are ours. The stored field names they come from are Firestore's
 * and are a contract with the live database, the security rules and the
 * composite indexes -- they appear only as string literals, in `toIssue` below
 * and in the writes at the bottom of this file. Those are the two places where
 * the two vocabularies meet, and nowhere else in `src/` needs to know the
 * stored spelling.
 */
export type Issue = {
  id: string;
  project: Project;
  title: string;
  description: string;
  type: IssueType;
  status: Status;
  archived: boolean;
  upvotes: number;
  comments: number;
  attachments: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** The reporter's public, optional nickname. */
  author: string | null;
  /**
   * A position pinned by hand within the column, lowest at the top. `null` is
   * the normal case: the card has not been arranged and keeps flowing by the
   * column's own rule (votes, or date). Only triage writes this, by dragging
   * one card onto another.
   */
  order: number | null;
  /**
   * Only on `replay` cards: what the parser read out of the recording (class,
   * levels, hits, equipment changes, traits). It is denormalised here so triage
   * can rank a recording without downloading the .rrf, which runs to hundreds
   * of kB.
   */
  replay: ReplaySummary | null;
};

/**
 * The fields triage uses. The stored map holds more and passes straight
 * through; its keys come from the simulator's parser, so they stay as they are.
 */
export type ReplaySummary = {
  player?: string;
  className?: string;
  baseLevel?: number;
  jobLevel?: number;
  durationMs?: number;
  damageEvents?: number;
  dummyHits?: number;
  equipChangeCount?: number;
  learnedSkillCount?: number;
  skippedItems?: number[];
  appVersion?: string;
  fileName?: string;
  traits?: Record<string, number>;
  traitsSource?: "replay" | "form";
  [k: string]: unknown;
};

function toIssue(snap: QueryDocumentSnapshot<DocumentData>): Issue | null {
  const d = snap.data();
  // A document outside the shape is dropped rather than taking the board down.
  // It can only happen through a hand edit in the console, but then it is one
  // card going missing, not a blank screen.
  if (!isProject(d["projeto"]) || !isStatus(d["status"]) || !isIssueType(d["tipo"])) return null;

  return {
    id: snap.id,
    project: d["projeto"],
    title: String(d["titulo"] ?? ""),
    description: String(d["descricao"] ?? ""),
    type: d["tipo"],
    status: d["status"],
    archived: Boolean(d["arquivado"]),
    upvotes: Number(d["upvotes"] ?? 0),
    comments: Number(d["comentarios"] ?? 0),
    // The 62 migrated cards predate the field and do not carry it.
    attachments: Number(d["anexos"] ?? 0),
    createdAt: d["criadoEm"]?.toDate?.() ?? null,
    updatedAt: d["atualizadoEm"]?.toDate?.() ?? null,
    author: typeof d["autor"] === "string" && d["autor"] ? d["autor"] : null,
    order: typeof d["ordem"] === "number" ? d["ordem"] : null,
    replay: d["replay"] && typeof d["replay"] === "object" ? (d["replay"] as ReplaySummary) : null,
  };
}

/**
 * One subscription for the whole app. The `where` and the `limit` are not an
 * optimisation: the `allow list` rule REQUIRES both, and without them the query
 * is rejected before a single document is read (see firestore.rules).
 *
 * Filtering by project/type/search happens in memory, in agrupar.ts -- the
 * collection is a few dozen cards, so switching filters is instant and costs no
 * reads.
 */
export function subscribeIssues(
  onIssues: (issues: Issue[]) => void,
  onError: (e: Error) => void,
  opts: { admin?: boolean } = {},
): () => void {
  const col = collection(getDb(), "issues");
  const q = opts.admin
    ? query(col, orderBy("criadoEm", "desc"), limit(BOARD_LIMIT))
    : query(
        col,
        where("arquivado", "==", false),
        orderBy("criadoEm", "desc"),
        limit(BOARD_LIMIT),
      );

  return onSnapshot(
    q,
    (snap) => onIssues(snap.docs.map(toIssue).filter((i): i is Issue => i !== null)),
    onError,
  );
}

/** A single card. Returns null both for missing and for denied (archived). */
export function subscribeIssue(
  id: string,
  onIssue: (issue: Issue | null) => void,
  onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "issues", id),
    (snap) => onIssue(snap.exists() ? toIssue(snap as QueryDocumentSnapshot<DocumentData>) : null),
    onError,
  );
}

export async function getIssue(id: string): Promise<Issue | null> {
  const snap = await getDoc(doc(getDb(), "issues", id));
  return snap.exists() ? toIssue(snap as QueryDocumentSnapshot<DocumentData>) : null;
}

// Lives in `anexos.ts`, with the rest of that subject -- a comment uploads a
// file too now, and importing from `issues` for that would be a crooked path.
export type { PreparedAttachment } from "./anexos";

export type NewIssue = {
  project: Project;
  type: IssueType;
  title: string;
  description: string;
  /** Public nickname, optional. */
  author?: string;
  /** Discord/e-mail, optional -- goes to the private subdocument, never shown. */
  contact?: string;
  /** Already shrunk and validated by the form. */
  attachments?: PreparedAttachment[];
};

export async function createIssue(data: NewIssue): Promise<string> {
  const db = getDb();
  const attachments = (data.attachments ?? []).slice(0, ATTACHMENTS_MAX);

  // Every key here is a Firestore field name, written out in full rather than
  // by shorthand: shorthand is what would let renaming one of our names
  // silently rename a stored field.
  const payload: Record<string, unknown> = {
    projeto: data.project,
    tipo: data.type,
    titulo: data.title.trim().slice(0, TITLE_MAX),
    descricao: data.description.trim().slice(0, DESCRIPTION_MAX),
    status: "reportado",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: attachments.length,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };
  const author = data.author?.trim().slice(0, NICK_MAX);
  if (author) payload["autor"] = author;

  // The card goes first, with an id generated on the client. If an attachment
  // fails afterwards, the report -- the part that matters -- is already saved;
  // the worst case is the card's badge saying 2 when there is 1. The other way
  // round (an orphan attachment under a card that was never born) would be
  // invisible bytes, impossible to clean up.
  const ref = doc(collection(db, "issues"));
  await setDoc(ref, payload);

  for (const attachment of attachments) {
    await uploadAttachment(
      ref.id,
      crypto.randomUUID(),
      attachment.name,
      attachment.type,
      attachment.data,
    ).catch(() => undefined);
  }

  const contact = data.contact?.trim().slice(0, CONTACT_MAX);
  if (contact) {
    // A separate document, because a security rule cannot hide a field: the
    // contact has to live where `allow read` is admin-only. Failing here must
    // not lose the card that was already created, so the error is swallowed on
    // purpose.
    await setDoc(doc(db, "issues", ref.id, "privado", "contato"), {
      contato: contact,
      criadoEm: serverTimestamp(),
    }).catch(() => undefined);
  }

  return ref.id;
}

/**
 * The only public write path besides creating. `increment(1)` is resolved on
 * the server before the rules run, and they check that only `upvotes` changed
 * and that it changed by exactly +1.
 */
export async function upvoteIssue(id: string): Promise<void> {
  await updateDoc(doc(getDb(), "issues", id), { upvotes: increment(1) });
}

/** Archiving preserves the real status, so un-archiving puts it back right. */
function columnPatch(column: Column): Record<string, unknown> {
  return column === "arquivado"
    ? { arquivado: true, atualizadoEm: serverTimestamp() }
    : { arquivado: false, status: column, atualizadoEm: serverTimestamp() };
}

/**
 * Moves the card to another column -- and clears the manual order, because an
 * order only means something inside the stack it was arranged in. Anyone who
 * wants to move AND choose the position drops the card onto another one, which
 * lands in `sortIssues`.
 */
export async function moveIssue(id: string, column: Column): Promise<void> {
  await updateDoc(doc(getDb(), "issues", id), {
    ...columnPatch(column),
    ordem: deleteField(),
  });
}

/** One ordering write. `order: null` clears the field and returns the card to the flow. */
export type Position = { id: string; order: number | null };

/**
 * Writes the renumbered stack in a single batch -- otherwise the board flickers
 * with half the cards in their new position and half in the old one.
 *
 * `moved` is the card that changed column in the same gesture (dropped onto a
 * card in another stack): status and position go out together, in one write.
 */
export async function sortIssues(
  positions: Position[],
  moved?: { id: string; column: Column },
): Promise<void> {
  if (positions.length === 0 && !moved) return;
  const db = getDb();
  const batch = writeBatch(db);
  for (const p of positions) {
    batch.update(doc(db, "issues", p.id), {
      ordem: p.order === null ? deleteField() : p.order,
      ...(moved?.id === p.id ? columnPatch(moved.column) : {}),
    });
  }
  if (moved && !positions.some((p) => p.id === moved.id)) {
    batch.update(doc(db, "issues", moved.id), columnPatch(moved.column));
  }
  await batch.commit();
}

/** What the admin panel may edit on a card. */
export type EditableFields = Partial<
  Pick<Issue, "title" | "description" | "type" | "project" | "status">
>;

/**
 * Each of our names is translated to its stored one here, one by one. This used
 * to spread the argument straight into `updateDoc`, which quietly made the
 * field names and our names the same thing -- rename one and the write lands on
 * a field the rules and the indexes do not know.
 */
export async function editIssue(id: string, fields: EditableFields): Promise<void> {
  const patch: Record<string, unknown> = { atualizadoEm: serverTimestamp() };
  if (fields.title !== undefined) patch["titulo"] = fields.title;
  if (fields.description !== undefined) patch["descricao"] = fields.description;
  if (fields.type !== undefined) patch["tipo"] = fields.type;
  if (fields.project !== undefined) patch["projeto"] = fields.project;
  if (fields.status !== undefined) patch["status"] = fields.status;
  await updateDoc(doc(getDb(), "issues", id), patch);
}

/** The reporter's private contact. Only the admin can read it -- the rule refuses the rest. */
export async function getContact(issueId: string): Promise<string | null> {
  const snap = await getDoc(doc(getDb(), "issues", issueId, "privado", "contato"));
  const v = snap.exists() ? snap.data()["contato"] : null;
  return typeof v === "string" ? v : null;
}
