import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  entrar as entrarNoGoogle,
  observarSessao,
  sair as sairDoGoogle,
  talvezTemSessao,
  type Sessao,
} from "../../lib/auth";

type Estado = {
  sessao: Sessao | null;
  /** Atalho de `sessao?.admin` — é o que quase todo mundo quer perguntar. */
  admin: boolean;
  /** Verdadeiro só enquanto o SDK de auth ainda não respondeu. */
  carregando: boolean;
  /** Liga o observador mesmo sem a marca. Só a /entrar chama. */
  ativar: () => void;
  entrar: () => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<Estado | null>(null);

/**
 * A sessão de admin, para o app inteiro. Não existe mais rota de admin: cada
 * página pergunta aqui se deve mostrar os controles.
 *
 * O contrato caro é este: **sem a marca em localStorage, nada disto toca o SDK
 * de auth**. Visitante sem marca sai daqui já resolvido, na primeira render, com
 * `carregando: false` — nenhum flash de "carregando", nenhum kB a mais.
 */
export function SessaoProvider({ children }: { children: ReactNode }) {
  // Inicializador do useState, não efeito: o público precisa sair resolvido já
  // na primeira render, sem uma segunda passada.
  const [observando, setObservando] = useState(talvezTemSessao);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(observando);

  useEffect(() => {
    if (!observando) return;
    let cancelar: (() => void) | undefined;
    let vivo = true;
    void observarSessao((s) => {
      setSessao(s);
      setCarregando(false);
    })
      .then((fn) => {
        // O import dinâmico do SDK pode terminar depois da desmontagem.
        if (vivo) cancelar = fn;
        else fn();
      })
      .catch(() => {
        // Offline, ou bloqueador comendo o chunk. Sem este ramo o quadro ficaria
        // preso em "carregando" para sempre, porque as páginas esperam a sessão
        // resolver antes de assinar o Firestore.
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
      cancelar?.();
    };
  }, [observando]);

  // Ligar o observador sem marca nenhuma. O guarda importa: chamar de novo
  // depois de resolvido prenderia `carregando` em true para sempre, porque o
  // onAuthStateChanged não dispara uma segunda vez.
  const ativar = useCallback(() => {
    if (observando) return;
    setObservando(true);
    setCarregando(true);
  }, [observando]);

  const entrar = useCallback(async () => {
    await entrarNoGoogle();
  }, []);

  const sair = useCallback(async () => {
    await sairDoGoogle();
  }, []);

  return (
    <Contexto.Provider
      value={{ sessao, admin: Boolean(sessao?.admin), carregando, ativar, entrar, sair }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useSessao(): Estado {
  const estado = useContext(Contexto);
  if (!estado) throw new Error("useSessao fora do SessaoProvider");
  return estado;
}
