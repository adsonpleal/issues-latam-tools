import { useCallback, useState } from "react";

import { upvoteIssue } from "../../lib/issues";

const CHAVE = "issues.latamtools.votos";

/**
 * Um voto por navegador, guardado em localStorage — mesma forma do quadro de
 * sugestões do recap. Limpar o storage ou trocar de navegador vota de novo, e
 * tudo bem: o voto é um termômetro de prioridade, não uma eleição. A regra do
 * Firestore garante só que cada escrita mexe em um campo e soma exatamente 1.
 */
function lerVotos(): Record<string, true> {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Record<string, true>) : {};
  } catch {
    // localStorage bloqueado (modo privado antigo, storage cheio): sem memória
    // de voto, mas o quadro continua funcionando.
    return {};
  }
}

function gravarVotos(votes: Record<string, true>): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(votes));
  } catch {
    /* sem persistência, segue o jogo */
  }
}

export function useVotes() {
  const [votes, setVotos] = useState<Record<string, true>>(lerVotos);

  const hasVoted = useCallback((id: string) => votes[id] === true, [votes]);

  const vote = useCallback(
    async (id: string) => {
      if (votes[id]) return;
      // Grava antes de mandar: se a escrita falhar, o pior caso é a pessoa achar
      // que votou. O contrário — deixar votar de novo por causa de uma falha de
      // rede — é pior e mais confuso.
      const nextParams = { ...votes, [id]: true as const };
      setVotos(nextParams);
      gravarVotos(nextParams);
      await upvoteIssue(id).catch(() => undefined);
    },
    [votes],
  );

  return { hasVoted, vote };
}
