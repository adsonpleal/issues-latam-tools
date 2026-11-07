import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { useSession } from "../features/admin/SessaoContext";

/**
 * The only door. It is linked from nowhere -- and does not need to be: there is
 * exactly one admin, and they know the address.
 *
 * It turns the session watcher on without consulting the localStorage mark, and
 * that is what makes it the repair for a lost mark (cleared storage, another
 * browser on the same profile): if the Firebase session is still alive in
 * IndexedDB, this page recognises it and redirects with no popup at all.
 *
 * As a bonus, subscribing on mount leaves the auth module cached before the
 * click. Without that, the `await import(...)` inside the handler would be a
 * network round trip in the middle of a user gesture -- exactly what Safari
 * counts as losing activation, and blocks the popup for.
 */
export function EntrarPage() {
  useSeo({ title: `${t.signIn} — ${t.siteName}` });
  const { session, admin, loading, activate, signIn, signOut } = useSession();
  // What the popup answered wrong. Without this, a failed sign-in is a click
  // that does nothing -- and a blocked popup, which is the commonest failure,
  // vanishes without leaving a trace on screen.
  const [error, setError] = useState<string | null>(null);

  useEffect(activate, [activate]);

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
                signIn().catch((e: { code?: string; message?: string }) =>
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
