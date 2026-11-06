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
 * A caixa de entrada das gravações do "Ajude o simulador a acertar as contas".
 *
 * Elas não são cards: vivem numa coleção que só o admin lê, e o botão Promover é
 * o que cria a ficha pública com o .rrf anexado. Antes disso não existe URL que
 * devolva a gravação para ninguém — que é o que o consentimento promete.
 *
 * Sem sessão de admin a página é "não encontrado", igual a qualquer endereço que
 * não existe: nem a existência da fila é resposta que se deva a alguém.
 */
export function GravacoesPage() {
  const { admin, loading } = useSession();

  // Sem o ramo de carregando, o próprio admin veria um lampejo de 404 a cada
  // recarga, enquanto o SDK de auth ainda estivesse subindo.
  if (loading) return <p className="aviso">{t.loading}</p>;
  if (!admin) return <NotFoundPage />;

  return <Queue />;
}

function Queue() {
  useSeo({ title: `${t.recordingsTitle} — ${t.siteName}`, path: "/gravacoes" });
  const { recordings, loading, error, actionError, promote, mark, remove } = useRecordings();
  const { queue, promovidas, decididas } = useMemo(() => splitRecordings(recordings), [recordings]);

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
        promovidas={promovidas}
        decididas={decididas}
        loading={loading}
        error={error}
        onPromover={(g) => void promote(g)}
        onMark={(id, state) => void mark(id, state)}
        onDelete={(id) => void remove(id)}
      />
    </div>
  );
}
