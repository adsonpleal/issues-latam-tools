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

import { ANEXOS_MAX, enviarAnexo, type AnexoPronto } from "./anexos";
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
  anexos: number;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
  /** Nick público e opcional de quem reportou. */
  autor: string | null;
  /**
   * Posição fixada à mão dentro da coluna, menor em cima. `null` é o normal: o
   * card não foi arrumado e continua fluindo pela regra da coluna (votos ou
   * data). Só a triagem escreve isto, arrastando um card em cima de outro.
   */
  ordem: number | null;
  /**
   * Só nas fichas `tipo: "replay"`: o que o parser leu da gravação (classe,
   * níveis, golpes, trocas de equipamento, talentos). Fica desnormalizado aqui
   * para a triagem ranquear sem baixar o .rrf, que tem centenas de kB.
   */
  replay: ResumoReplay | null;
};

/** Campos que a triagem usa. O mapa guardado tem mais, e passa direto. */
export type ResumoReplay = {
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
    // Os 62 cards migrados são anteriores ao campo e não o têm.
    anexos: Number(d["anexos"] ?? 0),
    criadoEm: d["criadoEm"]?.toDate?.() ?? null,
    atualizadoEm: d["atualizadoEm"]?.toDate?.() ?? null,
    autor: typeof d["autor"] === "string" && d["autor"] ? d["autor"] : null,
    ordem: typeof d["ordem"] === "number" ? d["ordem"] : null,
    replay: d["replay"] && typeof d["replay"] === "object" ? (d["replay"] as ResumoReplay) : null,
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

// Mora em `anexos.ts`, junto do resto do assunto — comentário também sobe
// arquivo agora, e importar de `issues` para isso seria caminho torto.
export type { AnexoPronto } from "./anexos";

export type NovoIssue = {
  projeto: Projeto;
  tipo: Tipo;
  titulo: string;
  descricao: string;
  /** Nick público, opcional. */
  autor?: string;
  /** Discord/e-mail, opcional — vai para o subdocumento privado, nunca aparece. */
  contato?: string;
  /** Já reduzidos e validados pelo formulário. */
  anexos?: AnexoPronto[];
};

export async function createIssue(dados: NovoIssue): Promise<string> {
  const db = getDb();
  const anexos = (dados.anexos ?? []).slice(0, ANEXOS_MAX);

  const payload: Record<string, unknown> = {
    projeto: dados.projeto,
    tipo: dados.tipo,
    titulo: dados.titulo.trim().slice(0, TITULO_MAX),
    descricao: dados.descricao.trim().slice(0, DESCRICAO_MAX),
    status: "reportado",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: anexos.length,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };
  const autor = dados.autor?.trim().slice(0, AUTOR_MAX);
  if (autor) payload["autor"] = autor;

  // O card vai primeiro, com o id gerado no cliente. Se algum anexo falhar
  // depois, o relato — que é a parte que importa — já está salvo; o pior caso
  // é o selo do card dizer 2 e existir 1. O contrário (anexo órfão embaixo de
  // um card que nunca nasceu) seria byte invisível e impossível de limpar.
  const ref = doc(collection(db, "issues"));
  await setDoc(ref, payload);

  for (const anexo of anexos) {
    await enviarAnexo(ref.id, crypto.randomUUID(), anexo.nome, anexo.tipo, anexo.dados).catch(
      () => undefined,
    );
  }

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

/** Arquivar preserva o status real, para desarquivar devolver certo. */
function patchColuna(coluna: Coluna): Record<string, unknown> {
  return coluna === "arquivado"
    ? { arquivado: true, atualizadoEm: serverTimestamp() }
    : { arquivado: false, status: coluna, atualizadoEm: serverTimestamp() };
}

/**
 * Move o card de coluna — e apaga a ordem manual, porque ela só quer dizer
 * alguma coisa dentro da pilha onde foi arrumada. Quem quiser mover E escolher
 * a posição solta o card em cima de outro, o que cai em `ordenarIssues`.
 */
export async function moverIssue(id: string, coluna: Coluna): Promise<void> {
  await updateDoc(doc(getDb(), "issues", id), {
    ...patchColuna(coluna),
    ordem: deleteField(),
  });
}

/** Uma escrita de ordenação. `ordem: null` apaga o campo e devolve o card ao fluxo. */
export type Posicao = { id: string; ordem: number | null };

/**
 * Grava a pilha renumerada num lote só — ou o quadro pisca com metade dos cards
 * na posição nova e metade na velha.
 *
 * `movido` é o card que mudou de coluna no mesmo gesto (soltar em cima de um
 * card de outra pilha): status e posição saem juntos, na mesma escrita.
 */
export async function ordenarIssues(
  posicoes: Posicao[],
  movido?: { id: string; coluna: Coluna },
): Promise<void> {
  if (posicoes.length === 0 && !movido) return;
  const db = getDb();
  const lote = writeBatch(db);
  for (const p of posicoes) {
    lote.update(doc(db, "issues", p.id), {
      ordem: p.ordem === null ? deleteField() : p.ordem,
      ...(movido?.id === p.id ? patchColuna(movido.coluna) : {}),
    });
  }
  if (movido && !posicoes.some((p) => p.id === movido.id)) {
    lote.update(doc(db, "issues", movido.id), patchColuna(movido.coluna));
  }
  await lote.commit();
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
