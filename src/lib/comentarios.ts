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

import { getDb } from "./firebase";

export const COMENTARIO_MAX = 4000;

export type TipoComentario = "comentario" | "mudanca";

export type Comentario = {
  id: string;
  texto: string;
  autor: string;
  criadoEm: Date | null;
  tipo: TipoComentario;
};

/**
 * Subcoleção, não array no card. O motivo que pesa mais não é tamanho: é que
 * manter os comentários fora do documento deixa `upvotes` como a ÚNICA coisa que
 * o público escreve no card, e é isso que torna a regra de upvote demonstrável.
 */
export function subscribeComentarios(
  issueId: string,
  onComentarios: (c: Comentario[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(
    collection(getDb(), "issues", issueId, "comentarios"),
    orderBy("criadoEm", "asc"),
  );
  return onSnapshot(
    q,
    (snap) =>
      onComentarios(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            texto: String(v["texto"] ?? ""),
            autor: String(v["autor"] ?? ""),
            criadoEm: v["criadoEm"]?.toDate?.() ?? null,
            tipo: v["tipo"] === "mudanca" ? "mudanca" : "comentario",
          };
        }),
      ),
    onError,
  );
}

export async function addComentario(
  issueId: string,
  texto: string,
  autor: string,
  autorUid: string,
  tipo: TipoComentario = "comentario",
): Promise<void> {
  const db = getDb();
  await addDoc(collection(db, "issues", issueId, "comentarios"), {
    texto: texto.trim().slice(0, COMENTARIO_MAX),
    autor,
    autorUid,
    tipo,
    criadoEm: serverTimestamp(),
  });
  // Contador desnormalizado para o selo do card: o quadro nunca lê a subcoleção.
  // Se esta segunda escrita falhar o comentário continua lá, só o selo fica atrás
  // — preferível a uma transação que poderia recusar o comentário inteiro.
  await updateDoc(doc(db, "issues", issueId), {
    comentarios: increment(1),
    atualizadoEm: serverTimestamp(),
  }).catch(() => undefined);
}
