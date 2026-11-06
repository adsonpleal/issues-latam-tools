import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { getDb } from "./firebase";

/**
 * The per-file ceiling. Firestore's hard limit is 1 MiB per document; 900 kB
 * leaves room for the other fields. Same number the simulator uses to accept a
 * .rrf, and a real .rrf runs between 50 and 100 kB.
 */
export const ATTACHMENT_MAX_BYTES = 900_000;
export const ATTACHMENTS_MAX = 5;

export const ACCEPTED_EXTENSIONS = ".rrf,image/*";

/** The values are stored on the document, so they keep their spelling. */
export type AttachmentType = "rrf" | "imagem";

export type Attachment = {
  id: string;
  name: string;
  type: AttachmentType;
  size: number;
  bytes: Uint8Array;
  createdAt: Date | null;
  /**
   * When present, the image was pasted into a comment and shows inside it --
   * not in the card's attachment list. The same subcollection on purpose: it
   * reuses the read rule (archived denies both) and does not add another
   * onSnapshot per comment on the page.
   */
  commentId: string | null;
};

/** A file already read and shrunk by the browser, ready to upload. */
export type PreparedAttachment = {
  name: string;
  type: AttachmentType;
  data: Uint8Array;
};

export function classifyFile(file: File): AttachmentType | null {
  if (file.type.startsWith("image/")) return "imagem";
  if (file.name.toLowerCase().endsWith(".rrf")) return "rrf";
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Writes one attachment. The id comes from the client because the card may not
 * even exist yet.
 *
 * The keys written below are Firestore's and are spelled the way they are
 * stored, each one in full rather than by shorthand.
 */
export async function uploadAttachment(
  issueId: string,
  attachmentId: string,
  name: string,
  type: AttachmentType,
  data: Uint8Array,
  commentId?: string,
): Promise<void> {
  await setDoc(doc(getDb(), "issues", issueId, "anexos", attachmentId), {
    nome: name.slice(0, 200),
    tipo: type,
    tamanho: data.byteLength,
    bytes: Bytes.fromUint8Array(data),
    criadoEm: serverTimestamp(),
    // Absent is different from empty: the rule only demands admin when the
    // field is there, so an ordinary attachment stays a public write.
    ...(commentId ? { comentarioId: commentId } : {}),
  });
}

export function subscribeAttachments(
  issueId: string,
  onAttachments: (a: Attachment[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(collection(getDb(), "issues", issueId, "anexos"), orderBy("criadoEm", "asc"));
  return onSnapshot(
    q,
    (snap) =>
      onAttachments(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            name: String(v["nome"] ?? ""),
            type: v["tipo"] === "imagem" ? "imagem" : "rrf",
            size: Number(v["tamanho"] ?? 0),
            bytes: v["bytes"]?.toUint8Array?.() ?? new Uint8Array(),
            createdAt: v["criadoEm"]?.toDate?.() ?? null,
            commentId: v["comentarioId"] ? String(v["comentarioId"]) : null,
          };
        }),
      ),
    onError,
  );
}

/** Admin only -- this is the moderation path for somebody uploading what they should not. */
export async function deleteAttachment(issueId: string, attachmentId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "issues", issueId, "anexos", attachmentId));
}

const MIME_BY_TYPE: Record<AttachmentType, string> = {
  imagem: "image/webp",
  rrf: "application/octet-stream",
};

/**
 * An object URL to display or download. The caller has to revoke it afterwards
 * -- the components do that in their effect cleanup.
 */
export function attachmentUrl(attachment: Attachment): string {
  const mime = attachment.type === "imagem" ? guessMime(attachment.name) : MIME_BY_TYPE.rrf;
  // A Uint8Array from Firestore can carry a byteOffset; the slice normalises it.
  const copy = attachment.bytes.slice();
  return URL.createObjectURL(new Blob([copy as unknown as BlobPart], { type: mime }));
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
