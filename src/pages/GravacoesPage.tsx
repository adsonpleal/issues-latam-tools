import { useMemo } from "react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { separarGravacoes } from "../features/admin/gravacoes";
import { ListaGravacoes } from "../features/admin/ListaGravacoes";
import { useGravacoes } from "../features/admin/useGravacoes";
import { useSessao } from "../features/admin/SessaoContext";
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
  const { admin, carregando } = useSessao();

  // Sem o ramo de carregando, o próprio admin veria um lampejo de 404 a cada
  // recarga, enquanto o SDK de auth ainda estivesse subindo.
  if (carregando) return <p className="aviso">{t.loading}</p>;
  if (!admin) return <NotFoundPage />;

  return <Fila />;
}

function Fila() {
  useSeo({ title: `${t.recordingsTitle} — ${t.siteName}`, path: "/gravacoes" });
  const { recordings, carregando, erro, erroAcao, promover, marcar, apagar } = useGravacoes();
  const { fila, promovidas, decididas } = useMemo(() => separarGravacoes(recordings), [recordings]);

  return (
    <div className="pagina">
      <h1>{t.recordingsTitle}</h1>
      <p className="subtitulo">{t.recordingsSubtitle}</p>
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}
      <ListaGravacoes
        fila={fila}
        promovidas={promovidas}
        decididas={decididas}
        carregando={carregando}
        erro={erro}
        onPromover={(g) => void promover(g)}
        onMarcar={(id, state) => void marcar(id, state)}
        onApagar={(id) => void apagar(id)}
      />
    </div>
  );
}
