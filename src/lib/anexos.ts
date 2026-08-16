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
 * Teto por arquivo. O limite duro do Firestore é 1 MiB por documento; 900 kB
 * deixa folga para os outros campos. Mesmo número que o simulador usa para
 * receber .rrf, e .rrf de verdade fica entre 50 e 100 kB.
 */
export const ANEXO_MAX_BYTES = 900_000;
export const ANEXOS_MAX = 5;

export const EXTENSOES_ACEITAS = ".rrf,image/*";

export type TipoAnexo = "rrf" | "imagem";

export type Anexo = {
  id: string;
  nome: string;
  tipo: TipoAnexo;
  tamanho: number;
  bytes: Uint8Array;
  criadoEm: Date | null;
};

export function classificaArquivo(arquivo: File): TipoAnexo | null {
  if (arquivo.type.startsWith("image/")) return "imagem";
  if (arquivo.name.toLowerCase().endsWith(".rrf")) return "rrf";
  return null;
}

export function formataTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Grava um anexo. O id é do cliente porque o card pode nem existir ainda. */
export async function enviarAnexo(
  issueId: string,
  anexoId: string,
  nome: string,
  tipo: TipoAnexo,
  dados: Uint8Array,
): Promise<void> {
  await setDoc(doc(getDb(), "issues", issueId, "anexos", anexoId), {
    nome: nome.slice(0, 200),
    tipo,
    tamanho: dados.byteLength,
    bytes: Bytes.fromUint8Array(dados),
    criadoEm: serverTimestamp(),
  });
}

export function subscribeAnexos(
  issueId: string,
  onAnexos: (a: Anexo[]) => void,
  onError: (e: Error) => void,
): () => void {
  const q = query(collection(getDb(), "issues", issueId, "anexos"), orderBy("criadoEm", "asc"));
  return onSnapshot(
    q,
    (snap) =>
      onAnexos(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            nome: String(v["nome"] ?? ""),
            tipo: v["tipo"] === "imagem" ? "imagem" : "rrf",
            tamanho: Number(v["tamanho"] ?? 0),
            bytes: v["bytes"]?.toUint8Array?.() ?? new Uint8Array(),
            criadoEm: v["criadoEm"]?.toDate?.() ?? null,
          };
        }),
      ),
    onError,
  );
}

/** Só o admin consegue — é a moderação de quem subiu o que não devia. */
export async function apagarAnexo(issueId: string, anexoId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "issues", issueId, "anexos", anexoId));
}

const MIME_POR_TIPO: Record<TipoAnexo, string> = {
  imagem: "image/webp",
  rrf: "application/octet-stream",
};

/**
 * Object URL para exibir ou baixar. Quem chama precisa revogar depois — os
 * componentes fazem isso no cleanup do efeito.
 */
export function urlDoAnexo(anexo: Anexo): string {
  const tipo = anexo.tipo === "imagem" ? adivinhaMime(anexo.nome) : MIME_POR_TIPO.rrf;
  // Uint8Array vindo do Firestore pode ter byteOffset; o slice normaliza.
  const copia = anexo.bytes.slice();
  return URL.createObjectURL(new Blob([copia as unknown as BlobPart], { type: tipo }));
}

function adivinhaMime(nome: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
