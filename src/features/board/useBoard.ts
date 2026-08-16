import { useEffect, useState } from "react";

import { subscribeIssues, type Issue } from "../../lib/issues";

export type EstadoQuadro = {
  issues: Issue[];
  carregando: boolean;
  erro: string | null;
};

/**
 * Uma assinatura ao vivo para o app inteiro. Como é onSnapshot, o quadro se move
 * sozinho na tela de quem está olhando quando eu arrasto um card — e a
 * compensação de latência do Firestore já pinta a mudança local antes da ida ao
 * servidor, então não existe estado otimista escrito à mão em lugar nenhum.
 */
export function useBoard(opts: { admin?: boolean } = {}): EstadoQuadro {
  const admin = opts.admin ?? false;
  const [issues, setIssues] = useState<Issue[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    const cancelar = subscribeIssues(
      (lista) => {
        setIssues(lista);
        setCarregando(false);
      },
      (e) => {
        setErro(e.message);
        setCarregando(false);
      },
      { admin },
    );
    return cancelar;
  }, [admin]);

  return { issues, carregando, erro };
}
