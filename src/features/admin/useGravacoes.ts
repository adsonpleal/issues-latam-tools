import { useCallback, useEffect, useState } from "react";

import {
  deleteRecording,
  markRecording,
  promoteRecording,
  subscribeRecordings,
  type RecordingState,
  type Recording,
} from "../../lib/gravacoes";

export type QueueState = {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
};

/**
 * A caixa de entrada ao vivo, mais as ações da triagem.
 *
 * Só a rota /gravacoes usa: a regra de leitura da coleção é `isAdmin()`,
 * então para qualquer outra pessoa isto não devolve nada — nem uma lista vazia,
 * um erro de permissão.
 */
export function useRecordings() {
  const [recordings, setGravacoes] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    return subscribeRecordings(
      (lista) => {
        setGravacoes(lista);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
    );
  }, []);

  // Sem estado otimista: o onSnapshot repinta a linha na pilha nova assim que a
  // escrita é aceita, e é o mesmo mecanismo que move card no quadro.
  const promote = useCallback(async (g: Recording) => {
    setActionError(null);
    return promoteRecording(g).catch((e: Error) => {
      setActionError(e.message);
      return null;
    });
  }, []);

  const mark = useCallback(async (id: string, state: RecordingState) => {
    setActionError(null);
    await markRecording(id, state).catch((e: Error) => setActionError(e.message));
  }, []);

  const remove = useCallback(async (id: string) => {
    setActionError(null);
    await deleteRecording(id).catch((e: Error) => setActionError(e.message));
  }, []);

  return { recordings, loading, error, actionError, promote, mark, remove };
}
