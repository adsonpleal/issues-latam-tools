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

import { ANEXOS_MAX, enviarAnexo, type AnexoPronto } from "./anexos";
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
  imagens: AnexoPronto[] = [],
): Promise<void> {
  const db = getDb();
  const ref = await addDoc(collection(db, "issues", issueId, "comentarios"), {
    texto: texto.trim().slice(0, COMENTARIO_MAX),
    autor,
    autorUid,
    tipo,
    criadoEm: serverTimestamp(),
  });

  // Comentário primeiro, imagens depois — mesma ordem de `createIssue` e pelo
  // mesmo motivo: o texto é a parte que importa, e imagem que falha some sem
  // levar a atualização junto. Vão para a subcoleção de anexos amarradas ao id
  // do comentário; o selo de anexos do card NÃO conta estas, ele fala do que
  // veio no relato.
  for (const imagem of imagens.slice(0, ANEXOS_MAX)) {
    await enviarAnexo(
      issueId,
      crypto.randomUUID(),
      imagem.nome,
      imagem.tipo,
      imagem.dados,
      ref.id,
    ).catch(() => undefined);
  }

  // Contador desnormalizado para o selo do card: o quadro nunca lê a subcoleção.
  // Se esta segunda escrita falhar o comentário continua lá, só o selo fica atrás
  // — preferível a uma transação que poderia recusar o comentário inteiro.
  await updateDoc(doc(db, "issues", issueId), {
    comentarios: increment(1),
    atualizadoEm: serverTimestamp(),
  }).catch(() => undefined);
}
