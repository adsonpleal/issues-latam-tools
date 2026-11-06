import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { ATTACHMENTS_MAX, uploadAttachment, type PreparedAttachment } from "./anexos";
import { getDb } from "./firebase";

export const COMMENT_MAX = 4000;

/** The values are stored on the document, so they keep their spelling. */
export type CommentType = "comentario" | "mudanca";

export type IssueComment = {
  id: string;
  text: string;
  author: string;
  createdAt: Date | null;
  type: CommentType;
};

/**
 * A subcollection, not an array on the card. The reason that weighs most is not
 * size: keeping the comments out of the document leaves `upvotes` as the ONLY
 * thing the public writes to a card, and that is what makes the upvote rule
 * demonstrable.
 */
export function subscribeComments(
  issueId: string,
  onComments: (c: IssueComment[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(
    collection(getDb(), "issues", issueId, "comentarios"),
    orderBy("criadoEm", "asc"),
  );
  return onSnapshot(
    q,
    (snap) =>
      onComments(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            text: String(v["texto"] ?? ""),
            author: String(v["autor"] ?? ""),
            createdAt: v["criadoEm"]?.toDate?.() ?? null,
            type: v["tipo"] === "mudanca" ? "mudanca" : "comentario",
          };
        }),
      ),
    onError,
  );
}

export async function addComment(
  issueId: string,
  text: string,
  author: string,
  authorUid: string,
  type: CommentType = "comentario",
  images: PreparedAttachment[] = [],
): Promise<void> {
  const db = getDb();
  // Firestore's field names, each written out in full.
  const ref = await addDoc(collection(db, "issues", issueId, "comentarios"), {
    texto: text.trim().slice(0, COMMENT_MAX),
    autor: author,
    autorUid: authorUid,
    tipo: type,
    criadoEm: serverTimestamp(),
  });

  // The comment first, images after -- same order as `createIssue` and for the
  // same reason: the text is the part that matters, and an image that fails
  // disappears without taking the update with it. They go to the attachments
  // subcollection tied to the comment's id; the card's attachment badge does
  // NOT count these, it speaks for what came with the report.
  for (const image of images.slice(0, ATTACHMENTS_MAX)) {
    await uploadAttachment(
      issueId,
      crypto.randomUUID(),
      image.name,
      image.type,
      image.data,
      ref.id,
    ).catch(() => undefined);
  }

  // A denormalised counter for the card's badge: the board never reads the
  // subcollection. If this second write fails the comment is still there and
  // only the badge lags -- preferable to a transaction that could refuse the
  // whole comment.
  await updateDoc(doc(db, "issues", issueId), {
    comentarios: increment(1),
    atualizadoEm: serverTimestamp(),
  }).catch(() => undefined);
}
