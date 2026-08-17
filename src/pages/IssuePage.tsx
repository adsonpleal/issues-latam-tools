import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { subscribeAnexos, type Anexo } from "../lib/anexos";
import { subscribeComentarios, type Comentario } from "../lib/comentarios";
import { subscribeIssue, type Issue } from "../lib/issues";
import { useSeo } from "../lib/seo";
import { IssueDetail } from "../features/ticket/IssueDetail";
import { ListaAnexos } from "../features/ticket/ListaAnexos";
import { ListaComentarios } from "../features/ticket/ListaComentarios";

export function IssuePage() {
  const { issueId = "" } = useParams();
  const [params] = useSearchParams();
  const acabouDeCriar = params.get("novo") === "1";

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!issueId) return;
    setCarregando(true);
    // Card arquivado devolve permission-denied, e inexistente devolve vazio. Os
    // dois viram o MESMO "não encontrado" de propósito: a diferença entre as
    // respostas contaria que existe um card arquivado com aquele id.
    const cancelar = subscribeIssue(
      issueId,
      (i) => {
        setIssue(i);
        setCarregando(false);
      },
      () => {
        setIssue(null);
        setCarregando(false);
      },
    );
    return cancelar;
  }, [issueId]);

  useEffect(() => {
    if (!issueId) return;
    return subscribeComentarios(issueId, setComentarios, () => setComentarios([]));
  }, [issueId]);

  useEffect(() => {
    if (!issueId) return;
    return subscribeAnexos(issueId, setAnexos, () => setAnexos([]));
  }, [issueId]);

  // Uma subscrição só para os dois usos: o que veio no relato fica na lista de
  // anexos, o que foi colado numa atualização aparece dentro dela. Memoizado
  // porque as duas listas viram object URL — recriá-las a cada render churnaria
  // blob à toa.
  const [anexosDoCard, imagensDeComentario] = useMemo(
    () => [anexos.filter((a) => !a.comentarioId), anexos.filter((a) => a.comentarioId)],
    [anexos],
  );

  useSeo({
    title: issue ? `${issue.titulo} — ${t.siteNome}` : `${t.siteNome} — ${t.siteSub}`,
    description: issue?.descricao.slice(0, 160) || t.siteDescricao,
    path: `/t/${issueId}`,
  });

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.voltar}
        </Link>
      </p>

      {acabouDeCriar && <p className="aviso aviso-ok">{t.enviado}</p>}

      {carregando && <p className="aviso">{t.carregando}</p>}

      {!carregando && !issue && (
        <>
          <h1>{t.naoEncontrado}</h1>
          <p className="subtitulo">{t.naoEncontradoAjuda}</p>
        </>
      )}

      {issue && (
        <>
          <IssueDetail issue={issue} />
          <ListaAnexos anexos={anexosDoCard} />
          <h2 className="secao">{t.comentariosLabel(comentarios.length)}</h2>
          <ListaComentarios comentarios={comentarios} imagens={imagensDeComentario} />
        </>
      )}
    </div>
  );
}
