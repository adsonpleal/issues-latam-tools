import {
  addDoc,
  collection,
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
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getDb } from "./firebase";
import type { Projeto } from "./projetos";
import { isProjeto } from "./projetos";
import type { Coluna, Status, Tipo } from "./status";
import { isStatus, isTipo } from "./status";

export const LIMITE_QUADRO = 500;
export const TITULO_MAX = 120;
export const DESCRICAO_MAX = 4000;
export const AUTOR_MAX = 40;
export const CONTATO_MAX = 120;

export type Issue = {
  id: string;
  projeto: Projeto;
  titulo: string;
  descricao: string;
  tipo: Tipo;
  status: Status;
  arquivado: boolean;
  upvotes: number;
  comentarios: number;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
  /** Nick público e opcional de quem reportou. */
  autor: string | null;
};

function toIssue(snap: QueryDocumentSnapshot<DocumentData>): Issue | null {
  const d = snap.data();
  // Documento fora do formato é descartado em vez de derrubar o quadro. Só pode
  // acontecer por edição manual no console, mas aí é um card que some, não uma
  // tela em branco.
  if (!isProjeto(d["projeto"]) || !isStatus(d["status"]) || !isTipo(d["tipo"])) return null;

  return {
    id: snap.id,
    projeto: d["projeto"],
    titulo: String(d["titulo"] ?? ""),
    descricao: String(d["descricao"] ?? ""),
    tipo: d["tipo"],
    status: d["status"],
    arquivado: Boolean(d["arquivado"]),
    upvotes: Number(d["upvotes"] ?? 0),
    comentarios: Number(d["comentarios"] ?? 0),
    criadoEm: d["criadoEm"]?.toDate?.() ?? null,
    atualizadoEm: d["atualizadoEm"]?.toDate?.() ?? null,
    autor: typeof d["autor"] === "string" && d["autor"] ? d["autor"] : null,
  };
}

/**
 * Uma assinatura só para o app inteiro. O `where` e o `limit` não são otimização:
 * a regra `allow list` EXIGE os dois, e sem eles a consulta é rejeitada antes de
 * ler qualquer documento (ver firestore.rules).
 *
 * Filtrar por projeto/tipo/busca acontece na memória, em agrupar.ts — o acervo é
 * de algumas dezenas de cards, então trocar de filtro é instantâneo e custa zero
 * leitura.
 */
export function subscribeIssues(
  onIssues: (issues: Issue[]) => void,
  onError: (e: Error) => void,
  opts: { admin?: boolean } = {},
): () => void {
  const col = collection(getDb(), "issues");
  const q = opts.admin
    ? query(col, orderBy("criadoEm", "desc"), limit(LIMITE_QUADRO))
    : query(
        col,
        where("arquivado", "==", false),
        orderBy("criadoEm", "desc"),
        limit(LIMITE_QUADRO),
      );

  return onSnapshot(
    q,
    (snap) => onIssues(snap.docs.map(toIssue).filter((i): i is Issue => i !== null)),
    onError,
  );
}

/** Card único. Devolve null tanto para inexistente quanto para negado (arquivado). */
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

export type NovoIssue = {
  projeto: Projeto;
  tipo: Tipo;
  titulo: string;
  descricao: string;
  /** Nick público, opcional. */
  autor?: string;
  /** Discord/e-mail, opcional — vai para o subdocumento privado, nunca aparece. */
  contato?: string;
};

export async function createIssue(dados: NovoIssue): Promise<string> {
  const db = getDb();

  const payload: Record<string, unknown> = {
    projeto: dados.projeto,
    tipo: dados.tipo,
    titulo: dados.titulo.trim().slice(0, TITULO_MAX),
    descricao: dados.descricao.trim().slice(0, DESCRICAO_MAX),
    status: "reportado",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };
  const autor = dados.autor?.trim().slice(0, AUTOR_MAX);
  if (autor) payload["autor"] = autor;

  const ref = await addDoc(collection(db, "issues"), payload);

  const contato = dados.contato?.trim().slice(0, CONTATO_MAX);
  if (contato) {
    // Documento à parte porque regra de segurança não esconde campo: o contato
    // precisa ficar onde `allow read` é só do admin. Falhar aqui não pode perder
    // o card que já foi criado, então o erro é engolido de propósito.
    await setDoc(doc(db, "issues", ref.id, "privado", "contato"), {
      contato,
      criadoEm: serverTimestamp(),
    }).catch(() => undefined);
  }

  return ref.id;
}

/**
 * Único caminho de escrita pública além de criar. `increment(1)` é resolvido no
 * servidor antes das regras, que conferem que só `upvotes` mudou e que mudou de
 * exatamente +1.
 */
export async function upvoteIssue(id: string): Promise<void> {
  await updateDoc(doc(getDb(), "issues", id), { upvotes: increment(1) });
}

/** Move o card. Arquivar preserva o status real, para desarquivar devolver certo. */
export async function moverIssue(id: string, coluna: Coluna): Promise<void> {
  const patch =
    coluna === "arquivado"
      ? { arquivado: true, atualizadoEm: serverTimestamp() }
      : { arquivado: false, status: coluna, atualizadoEm: serverTimestamp() };
  await updateDoc(doc(getDb(), "issues", id), patch);
}

export async function editarIssue(
  id: string,
  campos: Partial<Pick<Issue, "titulo" | "descricao" | "tipo" | "projeto" | "status">>,
): Promise<void> {
  await updateDoc(doc(getDb(), "issues", id), { ...campos, atualizadoEm: serverTimestamp() });
}

/** Contato privado de quem reportou. Só o admin consegue ler — a regra recusa o resto. */
export async function getContato(issueId: string): Promise<string | null> {
  const snap = await getDoc(doc(getDb(), "issues", issueId, "privado", "contato"));
  const v = snap.exists() ? snap.data()["contato"] : null;
  return typeof v === "string" ? v : null;
}
