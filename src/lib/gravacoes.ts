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
import { CONTATO_MAX, DESCRICAO_MAX, TITULO_MAX, type ResumoReplay } from "./issues";

export const LIMITE_GRAVACOES = 300;

/**
 * Uma gravação `.rrf` do "Ajude o simulador a acertar as contas".
 *
 * Não é card: é caixa de entrada. Mora numa coleção que só o admin lê, com o
 * arquivo num subdocumento, e vira ficha do quadro quando a triagem promove —
 * aí sim nasce um `issues/{id}` público com o .rrf nos anexos.
 *
 * Antes isso era um card `arquivado: true`, o que dava dois sentidos para o
 * mesmo booleano: "a triagem despachou" e "ninguém olhou ainda".
 */
export type Gravacao = {
  id: string;
  titulo: string;
  /** O que quem enviou escreveu na caixa de observações. */
  notas: string;
  /** O que o parser leu — é o que a triagem lê para ranquear sem baixar o .rrf. */
  resumo: ResumoReplay;
  /** Nick para crédito. Só aparece em público se a ficha for promovida. */
  nick: string | null;
  /** Discord/e-mail. A coleção inteira é privada, então não precisa de subdocumento. */
  contato: string | null;
  nome: string;
  tamanho: number;
  criadoEm: Date | null;
  estado: EstadoGravacao;
  /** O card criado pela promoção. É a única coisa daqui que chega ao público. */
  issueId: string | null;
  decididaEm: Date | null;
  /** Anotação da triagem — nas migradas, o que estava no comentário da ficha. */
  notaTriagem: string | null;
};

/**
 * `fila` espera decisão; `promovida` virou card público; `conferida` já serviu
 * de teste mas não vai para o quadro; `descartada` é o "não presta".
 *
 * `descartada` não apaga nada — é o arquivar daqui.
 */
export const ESTADOS = ["fila", "promovida", "conferida", "descartada"] as const;
export type EstadoGravacao = (typeof ESTADOS)[number];

export function isEstado(v: unknown): v is EstadoGravacao {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}

function toGravacao(snap: QueryDocumentSnapshot<DocumentData>): Gravacao {
  const d = snap.data();
  return {
    id: snap.id,
    titulo: String(d["titulo"] ?? ""),
    notas: String(d["notas"] ?? ""),
    resumo: d["resumo"] && typeof d["resumo"] === "object" ? (d["resumo"] as ResumoReplay) : {},
    nick: typeof d["nick"] === "string" && d["nick"] ? d["nick"] : null,
    contato: typeof d["contato"] === "string" && d["contato"] ? d["contato"] : null,
    nome: String(d["nome"] ?? ""),
    tamanho: Number(d["tamanho"] ?? 0),
    criadoEm: d["criadoEm"]?.toDate?.() ?? null,
    // Documento fora do formato cai na fila em vez de sumir da tela: aqui o
    // acervo é privado e pequeno, e uma gravação invisível seria pior do que
    // uma gravação no lugar errado.
    estado: isEstado(d["estado"]) ? d["estado"] : "fila",
    issueId: typeof d["issueId"] === "string" && d["issueId"] ? d["issueId"] : null,
    decididaEm: d["decididaEm"]?.toDate?.() ?? null,
    notaTriagem:
      typeof d["notaTriagem"] === "string" && d["notaTriagem"] ? d["notaTriagem"] : null,
  };
}

/**
 * A fila inteira, ao vivo. Sem `where`: a regra de leitura já é `isAdmin()`, e
 * separar por estado acontece na memória — são dezenas de documentos, e o
 * arquivo em si mora fora deles.
 */
export function subscribeGravacoes(
  onGravacoes: (g: Gravacao[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(
    collection(getDb(), "gravacoes"),
    orderBy("criadoEm", "desc"),
    limit(LIMITE_GRAVACOES),
  );
  return onSnapshot(q, (snap) => onGravacoes(snap.docs.map(toGravacao)), onError);
}

export type ArquivoGravacao = { nome: string; tamanho: number; bytes: Uint8Array };

/**
 * A descrição do card que a promoção cria: a observação de quem enviou primeiro,
 * e depois o que o parser leu, em uma frase.
 *
 * Montar isto aqui, e não no simulador, é de propósito — o texto é do quadro, e
 * o simulador não deveria ter que saber escrever em pt-BR para o tracker.
 */
export function descricaoDaGravacao(g: Gravacao): string {
  const s = g.resumo;
  const partes: string[] = [];
  if (g.notas) partes.push(g.notas);
  const dur = typeof s.durationMs === "number" ? `${Math.round(s.durationMs / 1000)}s` : "?";
  partes.push(
    `Gravação de ${dur} com ${s.dummyHits ?? 0} golpes em dummy ` +
      `(${s.damageEvents ?? 0} eventos de dano no total), ` +
      `${s.equipChangeCount ?? 0} trocas de equipamento e ` +
      `${s.learnedSkillCount ?? 0} habilidades aprendidas. ` +
      `Mapa ${s["map"] ?? "?"}. Arquivo ${g.nome || "?"}.`,
  );
  return partes.join("\n\n").slice(0, DESCRICAO_MAX);
}

/**
 * Promover é o que publica: cria o card em backlog com o .rrf anexado, o contato
 * no subdocumento privado, e carimba a gravação com o id do card.
 *
 * Numa escrita atômica só. Meio caminho aqui seria um card sem a gravação (o
 * anexo é o motivo do card existir) ou uma gravação carimbada como promovida
 * apontando para um card que não existe.
 *
 * O card herda o id da gravação — a origem fica legível sem campo extra — e a
 * data do envio, não a de hoje: o crédito é de quem gravou, e o quadro não deve
 * dizer que a ficha é de agora.
 */
export async function promoverGravacao(g: Gravacao): Promise<string> {
  const db = getDb();
  const arquivo = await getArquivo(g.id);
  const lote = writeBatch(db);

  const card = doc(db, "issues", g.id);
  lote.set(card, {
    projeto: "simulador",
    titulo: g.titulo.slice(0, TITULO_MAX),
    descricao: descricaoDaGravacao(g),
    tipo: "replay",
    status: "backlog",
    arquivado: false,
    upvotes: 0,
    comentarios: 0,
    anexos: arquivo ? 1 : 0,
    criadoEm: g.criadoEm ? Timestamp.fromDate(g.criadoEm) : serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    // Desnormalizado no card para o painel do /admin mostrar o resumo sem ir
    // buscar a gravação de origem.
    replay: g.resumo,
    ...(g.nick ? { autor: g.nick } : {}),
  });

  if (arquivo) {
    lote.set(doc(db, "issues", g.id, "anexos", "gravacao"), {
      nome: arquivo.nome.slice(0, 200),
      tipo: "rrf",
      tamanho: arquivo.bytes.byteLength,
      bytes: Bytes.fromUint8Array(arquivo.bytes),
      criadoEm: serverTimestamp(),
    });
  }

  if (g.contato) {
    lote.set(doc(db, "issues", g.id, "privado", "contato"), {
      contato: g.contato.slice(0, CONTATO_MAX),
      criadoEm: serverTimestamp(),
    });
  }

  lote.update(doc(db, "gravacoes", g.id), {
    estado: "promovida",
    issueId: g.id,
    decididaEm: serverTimestamp(),
  });

  await lote.commit();
  return g.id;
}

/**
 * Carimbo da triagem para o que não vira card. `descartada` é o arquivar daqui:
 * marca, não apaga.
 */
export async function marcarGravacao(id: string, estado: EstadoGravacao): Promise<void> {
  await updateDoc(doc(getDb(), "gravacoes", id), {
    estado,
    decididaEm: estado === "fila" ? null : serverTimestamp(),
  });
}

/**
 * Apaga a gravação e o arquivo. Exceção ao "nada é apagado nunca" pela mesma
 * razão dos anexos: isto é escrita pública, então precisa existir moderação do
 * que não devia ter entrado. Para gravação legítima que não presta, o caminho é
 * descartar.
 */
export async function apagarGravacao(id: string): Promise<void> {
  const db = getDb();
  // Subcoleção não some com o pai — o arquivo é o documento pesado, e deixá-lo
  // para trás guardaria justamente o que se quis apagar.
  await deleteDoc(doc(db, "gravacoes", id, "arquivo", "rrf")).catch(() => undefined);
  await deleteDoc(doc(db, "gravacoes", id));
}

/** O .rrf, sob demanda. Fica fora do documento para a lista não baixar tudo. */
export async function getArquivo(gravacaoId: string): Promise<ArquivoGravacao | null> {
  const snap = await getDoc(doc(getDb(), "gravacoes", gravacaoId, "arquivo", "rrf"));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    nome: String(d["nome"] ?? ""),
    tamanho: Number(d["tamanho"] ?? 0),
    bytes: d["bytes"]?.toUint8Array?.() ?? new Uint8Array(),
  };
}
