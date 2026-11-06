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
  watchSession,
  signOut as sairDoGoogle,
  maybeHasSession,
  type Session,
} from "../../lib/auth";

type SessionState = {
  session: Session | null;
  /** Atalho de `sessao?.admin` — é o que quase todo mundo quer perguntar. */
  admin: boolean;
  /** Verdadeiro só enquanto o SDK de auth ainda não respondeu. */
  loading: boolean;
  /** Liga o observador mesmo sem a marca. Só a /entrar chama. */
  ativar: () => void;
  entrar: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<SessionState | null>(null);

/**
 * A sessão de admin, para o app inteiro. Não existe mais rota de admin: cada
 * página pergunta aqui se deve mostrar os controles.
 *
 * O contrato caro é este: **sem a marca em localStorage, nada disto toca o SDK
 * de auth**. Visitante sem marca sai daqui já resolvido, na primeira render, com
 * `carregando: false` — nenhum flash de "carregando", nenhum kB a mais.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // Inicializador do useState, não efeito: o público precisa sair resolvido já
  // na primeira render, sem uma segunda passada.
  const [observando, setObservando] = useState(maybeHasSession);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(observando);

  useEffect(() => {
    if (!observando) return;
    let cancel: (() => void) | undefined;
    let vivo = true;
    void watchSession((s) => {
      setSession(s);
      setLoading(false);
    })
      .then((fn) => {
        // O import dinâmico do SDK pode terminar depois da desmontagem.
        if (vivo) cancel = fn;
        else fn();
      })
      .catch(() => {
        // Offline, ou bloqueador comendo o chunk. Sem este ramo o quadro ficaria
        // preso em "carregando" para sempre, porque as páginas esperam a sessão
        // resolver antes de assinar o Firestore.
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
      cancel?.();
    };
  }, [observando]);

  // Ligar o observador sem marca nenhuma. O guarda importa: chamar de novo
  // depois de resolvido prenderia `carregando` em true para sempre, porque o
  // onAuthStateChanged não dispara uma segunda vez.
  const ativar = useCallback(() => {
    if (observando) return;
    setObservando(true);
    setLoading(true);
  }, [observando]);

  const entrar = useCallback(async () => {
    await entrarNoGoogle();
  }, []);

  const signOut = useCallback(async () => {
    await sairDoGoogle();
  }, []);

  return (
    <Context.Provider
      value={{ session, admin: Boolean(session?.admin), loading, ativar, entrar, signOut }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSession(): SessionState {
  const state = useContext(Context);
  if (!state) throw new Error("useSessao fora do SessaoProvider");
  return state;
}
