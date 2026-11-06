import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { useSession } from "../features/admin/SessaoContext";

/**
 * A única porta. Não é linkada de lugar nenhum — e não precisa ser: só existe um
 * admin, e ele sabe o endereço.
 *
 * Ela liga o observador de sessão sem consultar a marca em localStorage, e é
 * isso que a torna o conserto para quando a marca se perde (storage limpo, outro
 * navegador do mesmo perfil): se a sessão do Firebase ainda estiver viva no
 * IndexedDB, esta página reconhece e redireciona sem popup nenhum.
 *
 * De quebra, subscrever na montagem já deixa o módulo de auth em cache antes do
 * clique. Sem isso, o `await import(...)` dentro do handler seria uma ida à rede
 * no meio de um gesto do usuário — que é exatamente o que o Safari conta como
 * perda de ativação para bloquear o popup.
 */
export function EntrarPage() {
  useSeo({ title: `${t.signIn} — ${t.siteName}` });
  const { session, admin, loading, ativar, entrar, signOut } = useSession();
  // O que o popup respondeu de errado. Sem isto, falhar em entrar é um clique
  // que não faz nada — e popup bloqueado, que é a falha mais comum, some sem
  // deixar rastro na tela.
  const [error, setError] = useState<string | null>(null);

  useEffect(ativar, [ativar]);

  if (admin) return <Navigate replace to="/" />;

  return (
    <div className="pagina pagina-estreita">
      <div className="admin-portao">
        {loading && <p className="aviso">{t.loading}</p>}

        {!loading && !session && (
          <>
            <p>{t.adminSignInHelp}</p>
            <button
              type="button"
              className="botao botao-primario"
              onClick={() => {
                setError(null);
                entrar().catch((e: { code?: string; message?: string }) =>
                  setError(e.code ?? e.message ?? "desconhecido"),
                );
              }}
            >
              {t.signIn}
            </button>
            {error && <p className="aviso aviso-erro">{t.signInError(error)}</p>}
          </>
        )}

        {!loading && session && (
          <>
            <p className="aviso aviso-erro">{t.noPermission}</p>
            <p className="campo-ajuda">{t.noPermissionHelp}</p>
            <button type="button" className="botao" onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
