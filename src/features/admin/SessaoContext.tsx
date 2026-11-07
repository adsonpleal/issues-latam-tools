import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  signInWithGoogle,
  watchSession,
  signOut as signOutOfGoogle,
  maybeHasSession,
  type Session,
} from "../../lib/auth";

type SessionState = {
  session: Session | null;
  /** Shorthand for `session?.admin` -- what almost everybody wants to ask. */
  admin: boolean;
  /** True only while the auth SDK has not answered yet. */
  loading: boolean;
  /** Turns the watcher on even without the mark. Only /entrar calls this. */
  activate: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<SessionState | null>(null);

/**
 * The admin session, for the whole app. There is no admin route any more: each
 * page asks here whether it should show the controls.
 *
 * This is the contract that costs something: **without the mark in
 * localStorage, none of this touches the auth SDK**. A visitor with no mark
 * leaves here already resolved, on the first render, with `loading: false` --
 * no flash of "loading", not one extra kB.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // A useState initialiser, not an effect: the public has to come out resolved
  // on the very first render, without a second pass.
  const [watching, setWatching] = useState(maybeHasSession);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(watching);

  useEffect(() => {
    if (!watching) return;
    let cancel: (() => void) | undefined;
    let alive = true;
    void watchSession((s) => {
      setSession(s);
      setLoading(false);
    })
      .then((fn) => {
        // The SDK's dynamic import can finish after the unmount.
        if (alive) cancel = fn;
        else fn();
      })
      .catch(() => {
        // Offline, or a blocker eating the chunk. Without this branch the board
        // would be stuck on "loading" forever, because the pages wait for the
        // session to resolve before subscribing to Firestore.
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      cancel?.();
    };
  }, [watching]);

  // Turning the watcher on with no mark at all. The guard matters: calling it
  // again after it has resolved would pin `loading` to true forever, because
  // onAuthStateChanged does not fire a second time.
  const activate = useCallback(() => {
    if (watching) return;
    setWatching(true);
    setLoading(true);
  }, [watching]);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const signOut = useCallback(async () => {
    await signOutOfGoogle();
  }, []);

  return (
    <Context.Provider
      value={{ session, admin: Boolean(session?.admin), loading, activate, signIn, signOut }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSession(): SessionState {
  const state = useContext(Context);
  if (!state) throw new Error("useSession outside SessionProvider");
  return state;
}
