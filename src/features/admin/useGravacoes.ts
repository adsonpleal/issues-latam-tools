import { useCallback, useEffect, useState } from "react";

import {
  deleteRecording,
  markRecording,
  promoteRecording,
  subscribeRecordings,
  type RecordingState,
  type Recording,
} from "../../lib/gravacoes";

export type EstadoFila = {
  recordings: Recording[];
  carregando: boolean;
  erro: string | null;
};

/**
 * A caixa de entrada ao vivo, mais as ações da triagem.
 *
 * Só a rota /gravacoes usa: a regra de leitura da coleção é `isAdmin()`,
 * então para qualquer outra pessoa isto não devolve nada — nem uma lista vazia,
 * um erro de permissão.
 */
export function useGravacoes() {
  const [recordings, setGravacoes] = useState<Recording[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    return subscribeRecordings(
      (lista) => {
        setGravacoes(lista);
        setCarregando(false);
      },
      (e) => {
        setErro(e.message);
        setCarregando(false);
      },
    );
  }, []);

  // Sem estado otimista: o onSnapshot repinta a linha na pilha nova assim que a
  // escrita é aceita, e é o mesmo mecanismo que move card no quadro.
  const promover = useCallback(async (g: Recording) => {
    setErroAcao(null);
    return promoteRecording(g).catch((e: Error) => {
      setErroAcao(e.message);
      return null;
    });
  }, []);

  const marcar = useCallback(async (id: string, state: RecordingState) => {
    setErroAcao(null);
    await markRecording(id, state).catch((e: Error) => setErroAcao(e.message));
  }, []);

  const apagar = useCallback(async (id: string) => {
    setErroAcao(null);
    await deleteRecording(id).catch((e: Error) => setErroAcao(e.message));
  }, []);

  return { recordings, carregando, erro, erroAcao, promover, marcar, apagar };
}
