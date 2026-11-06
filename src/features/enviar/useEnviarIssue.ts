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
    const ultimo = Number(localStorage.getItem(CHAVE_ESPERA) ?? 0);
    return Math.max(0, ultimo + ESPERA_MS - Date.now());
  } catch {
    return 0;
  }
}

function marcaEnvio(): void {
  try {
    localStorage.setItem(CHAVE_ESPERA, String(Date.now()));
  } catch {
    /* sem persistência, sem espera */
  }
}

export type EstadoEnvio = "parado" | "enviando" | "erro";

export function useEnviarIssue() {
  const [state, setEstado] = useState<EstadoEnvio>("parado");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  async function enviar(data: NewIssue & { isca?: string }): Promise<string | null> {
    // `anexos` já vem pronto do CampoAnexos: reduzido, validado e dentro do teto.
    if (data.isca) return null; // campo-isca preenchido: é robô, some em silêncio
    if (data.title.trim().length < 3) {
      setEstado("erro");
      setMensagemErro(t.summaryTooShort);
      return null;
    }
    if (esperaRestante() > 0) {
      setEstado("erro");
      setMensagemErro(t.slowDown);
      return null;
    }

    setEstado("enviando");
    setMensagemErro(null);
    try {
      const id = await createIssue(data);
      marcaEnvio();
      setEstado("parado");
      return id;
    } catch {
      setEstado("erro");
      setMensagemErro(t.submitError);
      return null;
    }
  }

  return { state, mensagemErro, enviar };
}
