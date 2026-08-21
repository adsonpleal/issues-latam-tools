import { getFirebaseApp } from "./firebase";

/** O único e-mail com poder de escrita. Espelha `isAdmin()` em firestore.rules. */
export const EMAIL_ADMIN = "adsonpleal@gmail.com";

/**
 * Marca de "esta máquina já entrou alguma vez", no mesmo namespace dos votos.
 *
 * Ela existe por causa do peso. As ações de admin moram nas MESMAS URLs do
 * público, então alguém precisa decidir se vale baixar o SDK de auth (~40 kB gz)
 * para descobrir se há sessão. Sem marca, o provider resolve "sem sessão" sem
 * nem tocar no import — visitante nenhum paga por uma pergunta cuja resposta é
 * quase sempre não.
 *
 * Não é segurança: forjar a marca só faz baixar o SDK e descobrir que não há
 * sessão. Quem manda continua sendo `isAdmin()` nas regras do Firestore.
 *
 * Perder a marca (storage limpo, outro navegador) também não tranca ninguém
 * para fora: `/entrar` liga o observador sem consultá-la, e o Firebase reconhece
 * a sessão que ainda está no IndexedDB.
 */
const CHAVE_SESSAO = "issues.latamtools.admin";

export type Sessao = {
  uid: string;
  nome: string;
  email: string;
  admin: boolean;
};

export function talvezTemSessao(): boolean {
  try {
    return localStorage.getItem(CHAVE_SESSAO) === "1";
  } catch {
    // localStorage bloqueado (modo privado antigo, storage cheio): o quadro
    // público segue igual, e entrar continua funcionando por /entrar.
    return false;
  }
}

function marcarSessao(tem: boolean): void {
  try {
    if (tem) localStorage.setItem(CHAVE_SESSAO, "1");
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* sem persistência, segue o jogo */
  }
}

/**
 * O SDK de auth é importado dinamicamente: quem só abre o quadro nunca baixa
 * esse código. Só chega aqui quem tem a marca acima ou quem abre /entrar.
 */
async function authModule() {
  const mod = await import("firebase/auth");
  return { mod, auth: mod.getAuth(getFirebaseApp()) };
}

export async function observarSessao(cb: (s: Sessao | null) => void): Promise<() => void> {
  const { mod, auth } = await authModule();
  return mod.onAuthStateChanged(auth, (user) => {
    // A marca acompanha o observador nos dois sentidos — inclusive quando o
    // sair aconteceu em outra aba, que é onde o onAuthStateChanged desemboca.
    marcarSessao(user !== null);
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
  marcarSessao(true);
}

export async function sair(): Promise<void> {
  const { mod, auth } = await authModule();
  marcarSessao(false);
  await mod.signOut(auth);
}
