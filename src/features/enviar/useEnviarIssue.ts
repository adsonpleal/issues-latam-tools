import { useState } from "react";

import { t } from "../../i18n";
import { createIssue, type NewIssue } from "../../lib/issues";

const CHAVE_ESPERA = "issues.latamtools.ultimoEnvio";
const ESPERA_MS = 60_000;

/**
 * Regra de segurança não sabe limitar taxa. O que dá para fazer no cliente é
 * encarecer o caso bobo: uma espera de um minuto entre envios e um campo-isca
 * que só robô preenche. Quem realmente quiser floodar consegue — o plano B
 * documentado é ligar o App Check com reCAPTCHA, e ele não está ligado.
 */
function esperaRestante(): number {
  try {
    const last = Number(localStorage.getItem(CHAVE_ESPERA) ?? 0);
    return Math.max(0, last + ESPERA_MS - Date.now());
  } catch {
    return 0;
  }
}

function submitMark(): void {
  try {
    localStorage.setItem(CHAVE_ESPERA, String(Date.now()));
  } catch {
    /* sem persistência, sem espera */
  }
}

export type SubmitState = "idle" | "sending" | "error";

export function useSubmitIssue() {
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(data: NewIssue & { isca?: string }): Promise<string | null> {
    // `anexos` já vem pronto do CampoAnexos: reduzido, validado e dentro do teto.
    if (data.isca) return null; // campo-isca preenchido: é robô, some em silêncio
    if (data.title.trim().length < 3) {
      setState("error");
      setErrorMessage(t.summaryTooShort);
      return null;
    }
    if (esperaRestante() > 0) {
      setState("error");
      setErrorMessage(t.slowDown);
      return null;
    }

    setState("sending");
    setErrorMessage(null);
    try {
      const id = await createIssue(data);
      submitMark();
      setState("idle");
      return id;
    } catch {
      setState("error");
      setErrorMessage(t.submitError);
      return null;
    }
  }

  return { state, errorMessage, submit };
}
