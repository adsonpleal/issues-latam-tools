import { useMemo } from "react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { splitRecordings } from "../features/admin/gravacoes";
import { RecordingList } from "../features/admin/ListaGravacoes";
import { useRecordings } from "../features/admin/useGravacoes";
import { useSession } from "../features/admin/SessaoContext";
import { NotFoundPage } from "./NotFoundPage";

/**
 * The inbox for the recordings from "Ajude o simulador a acertar as contas".
 *
 * They are not cards: they live in a collection only the admin reads, and the
 * Promote button is what creates the public record with the .rrf attached.
 * Before that there is no URL that hands the recording to anybody -- which is
 * what the consent promises.
 *
 * Without an admin session the page is "not found", like any address that does
 * not exist: not even the queue's existence is an answer anybody is owed.
 */
export function GravacoesPage() {
  const { admin, loading } = useSession();

  // Without the loading branch the admin themself would see a flash of 404 on
  // every reload, while the auth SDK was still coming up.
  if (loading) return <p className="aviso">{t.loading}</p>;
  if (!admin) return <NotFoundPage />;

  return <Queue />;
}

function Queue() {
  useSeo({ title: `${t.recordingsTitle} — ${t.siteName}`, path: "/gravacoes" });
  const { recordings, loading, error, actionError, promote, mark, remove } = useRecordings();
  const { queue, promoted, decided } = useMemo(() => splitRecordings(recordings), [recordings]);

  return (
    <div className="pagina">
      <h1>{t.recordingsTitle}</h1>
      <p className="subtitulo">{t.recordingsSubtitle}</p>
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>
      {actionError && <p className="aviso aviso-erro">{actionError}</p>}
      <RecordingList
        queue={queue}
        promoted={promoted}
        decided={decided}
        loading={loading}
        error={error}
        onPromote={(g) => void promote(g)}
        onMark={(id, state) => void mark(id, state)}
        onDelete={(id) => void remove(id)}
      />
    </div>
  );
}
