import { useEffect, useState } from "react";

import { subscribeIssues, type Issue } from "../../lib/issues";

export type EstadoQuadro = {
  issues: Issue[];
  loading: boolean;
  error: string | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const cancel = subscribeIssues(
      (lista) => {
        setIssues(lista);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      },
      { admin },
    );
    return cancel;
  }, [admin]);

  return { issues, loading, error };
}
