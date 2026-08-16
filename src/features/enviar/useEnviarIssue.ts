import { useState } from "react";

import { t } from "../../i18n";
import { createIssue, type NovoIssue } from "../../lib/issues";

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
  const [estado, setEstado] = useState<EstadoEnvio>("parado");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  async function enviar(dados: NovoIssue & { isca?: string }): Promise<string | null> {
    if (dados.isca) return null; // campo-isca preenchido: é robô, some em silêncio
    if (dados.titulo.trim().length < 3) {
      setEstado("erro");
      setMensagemErro(t.erroTituloCurto);
      return null;
    }
    if (esperaRestante() > 0) {
      setEstado("erro");
      setMensagemErro(t.espereUmPouco);
      return null;
    }

    setEstado("enviando");
    setMensagemErro(null);
    try {
      const id = await createIssue(dados);
      marcaEnvio();
      setEstado("parado");
      return id;
    } catch {
      setEstado("erro");
      setMensagemErro(t.erroEnviar);
      return null;
    }
  }

  return { estado, mensagemErro, enviar };
}
