import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getDb } from "./firebase";
import { CONTACT_MAX, DESCRIPTION_MAX, TITLE_MAX, type ReplaySummary } from "./issues";

export const RECORDINGS_LIMIT = 300;

/**
 * One `.rrf` recording from "Ajude o simulador a acertar as contas".
 *
 * It is not a card: it is an inbox. It lives in a collection only the admin
 * reads, with the file in a subdocument, and becomes a board card when triage
 * promotes it -- that is when a public `issues/{id}` is born with the .rrf in
 * its attachments.
 *
 * This used to be an `arquivado: true` card, which gave one boolean two
 * meanings: "triage dispatched it" and "nobody has looked yet".
 *
 * These names are ours; the stored field names appear only in `toRecording`
 * below and in the writes further down.
 */
export type Recording = {
  id: string;
  title: string;
  /** What the submitter wrote in the notes box. */
  notes: string;
  /** What the parser read -- what triage reads to rank without downloading the .rrf. */
  summary: ReplaySummary;
  /** A nickname for credit. Only shows in public if the recording is promoted. */
  nick: string | null;
  /** Discord/e-mail. The whole collection is private, so no subdocument is needed. */
  contact: string | null;
  fileName: string;
  size: number;
  createdAt: Date | null;
  state: RecordingState;
  /** The card the promotion created. The only thing from here that reaches the public. */
  issueId: string | null;
  decidedAt: Date | null;
  /** Triage's annotation -- on the migrated ones, what was in the card's comment. */
  triageNote: string | null;
};

/**
 * `fila` is awaiting a decision; `promovida` became a public card; `conferida`
 * served as a test but is not going on the board; `descartada` is the "no good".
 *
 * `descartada` deletes nothing -- it is this collection's archive.
 *
 * The values are stored on the document, so they keep their spelling.
 */
export const RECORDING_STATES = ["fila", "promovida", "conferida", "descartada"] as const;
export type RecordingState = (typeof RECORDING_STATES)[number];

export function isRecordingState(v: unknown): v is RecordingState {
  return typeof v === "string" && (RECORDING_STATES as readonly string[]).includes(v);
}

function toRecording(snap: QueryDocumentSnapshot<DocumentData>): Recording {
  const d = snap.data();
  return {
    id: snap.id,
    title: String(d["titulo"] ?? ""),
    notes: String(d["notas"] ?? ""),
    summary:
      d["resumo"] && typeof d["resumo"] === "object" ? (d["resumo"] as ReplaySummary) : {},
    nick: typeof d["nick"] === "string" && d["nick"] ? d["nick"] : null,
    contact: typeof d["contato"] === "string" && d["contato"] ? d["contato"] : null,
    fileName: String(d["nome"] ?? ""),
    size: Number(d["tamanho"] ?? 0),
    createdAt: d["criadoEm"]?.toDate?.() ?? null,
    // A document outside the shape lands in the queue rather than vanishing
    // from the screen: this collection is private and small, and an invisible
    // recording would be worse than one in the wrong place.
    state: isRecordingState(d["estado"]) ? d["estado"] : "fila",
    issueId: typeof d["issueId"] === "string" && d["issueId"] ? d["issueId"] : null,
    decidedAt: d["decididaEm"]?.toDate?.() ?? null,
    triageNote:
      typeof d["notaTriagem"] === "string" && d["notaTriagem"] ? d["notaTriagem"] : null,
  };
}

/**
 * The whole queue, live. No `where`: the read rule is already `isAdmin()`, and
 * splitting by state happens in memory -- there are dozens of documents, and
 * the file itself lives outside them.
 */
export function subscribeRecordings(
  onRecordings: (g: Recording[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(
    collection(getDb(), "gravacoes"),
    orderBy("criadoEm", "desc"),
    limit(RECORDINGS_LIMIT),
  );
  return onSnapshot(q, (snap) => onRecordings(snap.docs.map(toRecording)), onError);
}

export type RecordingFile = { name: string; size: number; bytes: Uint8Array };

/**
 * The description of the card a promotion creates: the submitter's own note
 * first, then what the parser read, in one sentence.
 *
 * Building this here rather than in the simulator is deliberate -- the text
 * belongs to the board, and the simulator should not have to know how to write
 * pt-BR for the tracker. The text itself is read by the community, so it stays
 * in Portuguese.
 */
export function recordingDescription(g: Recording): string {
  const s = g.summary;
  const parts: string[] = [];
  if (g.notes) parts.push(g.notes);
  const dur = typeof s.durationMs === "number" ? `${Math.round(s.durationMs / 1000)}s` : "?";
  parts.push(
    `Gravação de ${dur} com ${s.dummyHits ?? 0} golpes em dummy ` +
      `(${s.damageEvents ?? 0} eventos de dano no total), ` +
      `${s.equipChangeCount ?? 0} trocas de equipamento e ` +
      `${s.learnedSkillCount ?? 0} habilidades aprendidas. ` +
      `Mapa ${s["map"] ?? "?"}. Arquivo ${g.fileName || "?"}.`,
  );
  return parts.join("\n\n").slice(0, DESCRIPTION_MAX);
}

/**
 * Promoting is what publishes: it creates the card in backlog with the .rrf
 * attached, the contact in the private subdocument, and stamps the recording
 * with the card's id.
 *
 * In one atomic write. Stopping halfway here would leave a card without the
 * recording (the attachment is the reason the card exists) or a recording
 * stamped as promoted pointing at a card that does not exist.
 *
 * The card inherits the recording's id -- the origin stays readable with no
 * extra field -- and the submission's date rather than today's: the credit
 * belongs to whoever recorded it, and the board should not claim the card is
 * from now.
 *
 * Every key written below is a Firestore field name, in full rather than by
 * shorthand.
 */
export async function promoteRecording(g: Recording): Promise<string> {
  const db = getDb();
  const file = await getRecordingFile(g.id);
  const batch = writeBatch(db);

  const card = doc(db, "issues", g.id);
  batch.set(card, {
    projeto: "simulador",
    titulo: g.title.slice(0, TITLE_MAX),
    descricao: recordingDescription(g),
    tipo: "replay",
    status: "backlog",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: file ? 1 : 0,
    criadoEm: g.createdAt ? Timestamp.fromDate(g.createdAt) : serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    // Denormalised onto the card so the triage panel can show the summary
    // without fetching the recording it came from.
    replay: g.summary,
    ...(g.nick ? { autor: g.nick } : {}),
  });

  if (file) {
    batch.set(doc(db, "issues", g.id, "anexos", "gravacao"), {
      nome: file.name.slice(0, 200),
      tipo: "rrf",
      tamanho: file.bytes.byteLength,
      bytes: Bytes.fromUint8Array(file.bytes),
      criadoEm: serverTimestamp(),
    });
  }

  if (g.contact) {
    batch.set(doc(db, "issues", g.id, "privado", "contato"), {
      contato: g.contact.slice(0, CONTACT_MAX),
      criadoEm: serverTimestamp(),
    });
  }

  batch.update(doc(db, "gravacoes", g.id), {
    estado: "promovida",
    issueId: g.id,
    decididaEm: serverTimestamp(),
  });

  await batch.commit();
  return g.id;
}

/**
 * Triage's stamp for what does not become a card. `descartada` is this
 * collection's archive: it marks, it does not delete.
 */
export async function markRecording(id: string, state: RecordingState): Promise<void> {
  await updateDoc(doc(getDb(), "gravacoes", id), {
    estado: state,
    decididaEm: state === "fila" ? null : serverTimestamp(),
  });
}

/**
 * Deletes the recording and the file. An exception to "nothing is ever deleted"
 * for the same reason as attachments: this is a public write, so there has to
 * be a way to moderate what should never have come in. For a legitimate
 * recording that is no good, the path is to discard it.
 */
export async function deleteRecording(id: string): Promise<void> {
  const db = getDb();
  // A subcollection does not go with its parent -- the file is the heavy
  // document, and leaving it behind would keep exactly what was meant to go.
  await deleteDoc(doc(db, "gravacoes", id, "arquivo", "rrf")).catch(() => undefined);
  await deleteDoc(doc(db, "gravacoes", id));
}

/** The .rrf, on demand. It lives outside the document so the list does not download everything. */
export async function getRecordingFile(recordingId: string): Promise<RecordingFile | null> {
  const snap = await getDoc(doc(getDb(), "gravacoes", recordingId, "arquivo", "rrf"));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    name: String(d["nome"] ?? ""),
    size: Number(d["tamanho"] ?? 0),
    bytes: d["bytes"]?.toUint8Array?.() ?? new Uint8Array(),
  };
}
