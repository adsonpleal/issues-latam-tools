import { getFirebaseApp } from "./firebase";

/** O único e-mail com poder de escrita. Espelha `isAdmin()` em firestore.rules. */
export const EMAIL_ADMIN = "adsonpleal@gmail.com";

export type Sessao = {
  uid: string;
  nome: string;
  email: string;
  admin: boolean;
};

/**
 * O SDK de auth (~40 kB gz) é importado dinamicamente: quem só abre o quadro
 * nunca baixa esse código. Só a rota /admin chega aqui.
 */
async function authModule() {
  const mod = await import("firebase/auth");
  return { mod, auth: mod.getAuth(getFirebaseApp()) };
}

export async function observarSessao(cb: (s: Sessao | null) => void): Promise<() => void> {
  const { mod, auth } = await authModule();
  return mod.onAuthStateChanged(auth, (user) => {
    if (!user) {
      cb(null);
      return;
    }
    cb({
      uid: user.uid,
      nome: user.displayName ?? user.email ?? "admin",
      email: user.email ?? "",
      // Espelho da UI. Quem manda de verdade são as regras: qualquer conta
      // Google consegue entrar e criar um registro de usuário, e nenhuma delas
      // consegue escrever nada além deste e-mail.
      admin: user.email === EMAIL_ADMIN && user.emailVerified,
    });
  });
}

export async function entrar(): Promise<void> {
  const { mod, auth } = await authModule();
  const provider = new mod.GoogleAuthProvider();
  // Popup, não redirect: o fluxo de redirect depende de um cookie cross-site em
  // firebaseapp.com que o ITP do Safari corta.
  await mod.signInWithPopup(auth, provider);
}

export async function sair(): Promise<void> {
  const { mod, auth } = await authModule();
  await mod.signOut(auth);
}
