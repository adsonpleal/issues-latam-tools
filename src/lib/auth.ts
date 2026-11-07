import { getFirebaseApp } from "./firebase";

/** The one e-mail with write power. Mirrors `isAdmin()` in firestore.rules. */
export const ADMIN_EMAIL = "adsonpleal@gmail.com";

/**
 * The "this machine has signed in at some point" mark, in the same namespace
 * as the votes.
 *
 * It exists because of weight. The admin actions live at the SAME URLs as the
 * public ones, so something has to decide whether it is worth downloading the
 * auth SDK (~40 kB gz) to find out whether there is a session. With no mark,
 * the provider resolves "no session" without even touching the import -- no
 * visitor pays for a question whose answer is almost always no.
 *
 * It is not security: forging the mark only downloads the SDK and finds out
 * there is no session. What decides is still `isAdmin()` in the Firestore
 * rules.
 *
 * Losing the mark (cleared storage, another browser) does not lock anybody out
 * either: `/entrar` turns the watcher on without consulting it, and Firebase
 * recognises the session that is still in IndexedDB.
 *
 * The stored key keeps its spelling: it is a localStorage key already set on
 * real machines, and renaming it would read as "never signed in here".
 */
const SESSION_KEY = "issues.latamtools.admin";

export type Session = {
  uid: string;
  name: string;
  email: string;
  admin: boolean;
};

export function maybeHasSession(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // localStorage blocked (old private mode, storage full): the public board
    // works the same, and signing in still works through /entrar.
    return false;
  }
}

function markSession(has: boolean): void {
  try {
    if (has) localStorage.setItem(SESSION_KEY, "1");
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* no persistence; carry on */
  }
}

/**
 * The auth SDK is imported dynamically: anyone who only opens the board never
 * downloads that code. Only somebody with the mark above, or somebody opening
 * /entrar, gets this far.
 */
async function authModule() {
  const mod = await import("firebase/auth");
  return { mod, auth: mod.getAuth(getFirebaseApp()) };
}

export async function watchSession(cb: (s: Session | null) => void): Promise<() => void> {
  const { mod, auth } = await authModule();
  return mod.onAuthStateChanged(auth, (user) => {
    // The mark follows the watcher in both directions -- including when the
    // sign-out happened in another tab, which is where onAuthStateChanged
    // comes out.
    markSession(user !== null);
    if (!user) {
      cb(null);
      return;
    }
    cb({
      uid: user.uid,
      name: user.displayName ?? user.email ?? "admin",
      email: user.email ?? "",
      // A mirror for the UI. What really decides is the rules: any Google
      // account can sign in and create a user record, and none of them can
      // write anything except this e-mail.
      admin: user.email === ADMIN_EMAIL && user.emailVerified,
    });
  });
}

export async function signInWithGoogle(): Promise<void> {
  const { mod, auth } = await authModule();
  const provider = new mod.GoogleAuthProvider();
  // A popup, not a redirect: the redirect flow depends on a cross-site cookie
  // on firebaseapp.com that Safari's ITP cuts off.
  await mod.signInWithPopup(auth, provider);
  markSession(true);
}

export async function signOut(): Promise<void> {
  const { mod, auth } = await authModule();
  markSession(false);
  await mod.signOut(auth);
}
