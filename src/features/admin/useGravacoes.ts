import { useCallback, useEffect, useState } from "react";

import {
  apagarGravacao,
  marcarGravacao,
  promoverGravacao,
  subscribeGravacoes,
  type EstadoGravacao,
  type Gravacao,
} from "../../lib/gravacoes";

export type EstadoFila = {
  gravacoes: Gravacao[];
  carregando: boolean;
  erro: string | null;
};

/**
 * A caixa de entrada ao vivo, mais as ações da triagem.
 *
 * Só a rota /admin/gravacoes usa: a regra de leitura da coleção é `isAdmin()`,
 * então para qualquer outra pessoa isto não devolve nada — nem uma lista vazia,
 * um erro de permissão.
 */
export function useGravacoes() {
  const [gravacoes, setGravacoes] = useState<Gravacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    return subscribeGravacoes(
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
  const promover = useCallback(async (g: Gravacao) => {
    setErroAcao(null);
    return promoverGravacao(g).catch((e: Error) => {
      setErroAcao(e.message);
      return null;
    });
  }, []);

  const marcar = useCallback(async (id: string, estado: EstadoGravacao) => {
    setErroAcao(null);
    await marcarGravacao(id, estado).catch((e: Error) => setErroAcao(e.message));
  }, []);

  const apagar = useCallback(async (id: string) => {
    setErroAcao(null);
    await apagarGravacao(id).catch((e: Error) => setErroAcao(e.message));
  }, []);

  return { gravacoes, carregando, erro, erroAcao, promover, marcar, apagar };
}
