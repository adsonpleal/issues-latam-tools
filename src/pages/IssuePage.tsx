import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { deleteAttachment, subscribeAttachments, type Attachment } from "../lib/anexos";
import { subscribeComments, type IssueComment } from "../lib/comentarios";
import { subscribeIssue, type Issue } from "../lib/issues";
import { useSeo } from "../lib/seo";
import { useSessao } from "../features/admin/SessaoContext";
import { useAcoesAdmin } from "../features/admin/useAcoesAdmin";
import { IssueDetail } from "../features/ticket/IssueDetail";
import { ListaAnexos } from "../features/ticket/ListaAnexos";
import { ListaComentarios } from "../features/ticket/ListaComentarios";

const AcoesTicket = lazy(() =>
  import("../features/admin/AcoesTicket").then((m) => ({ default: m.AcoesTicket })),
);

const FormularioComentario = lazy(() =>
  import("../features/admin/AcoesIssue").then((m) => ({ default: m.FormularioComentario })),
);

export function IssuePage() {
  const { issueId = "" } = useParams();
  const [params] = useSearchParams();
  const acabouDeCriar = params.get("novo") === "1";

  const { sessao, admin, carregando: carregandoSessao } = useSessao();
  const uid = sessao?.uid ?? null;
  const { mover, editar, comentar, erro: erroAcao } = useAcoesAdmin(sessao);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComentarios] = useState<IssueComment[]>([]);
  const [attachments, setAnexos] = useState<Attachment[]>([]);
  const [carregando, setCarregando] = useState(true);

  // As três assinaturas esperam a sessão resolver, e re-assinam quando o uid
  // muda. Não é capricho: card arquivado nega a leitura para quem não é admin, e
  // um onSnapshot que toma permission-denied MORRE — não tenta de novo quando o
  // token chega depois. Assinar antes da hora deixaria o admin olhando um "não
  // encontrado" que nada mais consertaria.
  useEffect(() => {
    if (!issueId || carregandoSessao) return;
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
  }, [issueId, carregandoSessao, uid]);

  useEffect(() => {
    if (!issueId || carregandoSessao) return;
    return subscribeComments(issueId, setComentarios, () => setComentarios([]));
  }, [issueId, carregandoSessao, uid]);

  useEffect(() => {
    if (!issueId || carregandoSessao) return;
    return subscribeAttachments(issueId, setAnexos, () => setAnexos([]));
  }, [issueId, carregandoSessao, uid]);

  // Uma subscrição só para os dois usos: o que veio no relato fica na lista de
  // anexos, o que foi colado numa atualização aparece dentro dela. Memoizado
  // porque as duas listas viram object URL — recriá-las a cada render churnaria
  // blob à toa.
  const [anexosDoCard, imagensDeComentario] = useMemo(
    () => [attachments.filter((a) => !a.commentId), attachments.filter((a) => a.commentId)],
    [attachments],
  );

  useSeo({
    title: issue ? `${issue.title} — ${t.siteName}` : `${t.siteName} — ${t.siteSubtitle}`,
    description: issue?.description.slice(0, 160) || t.siteDescription,
    path: `/t/${issueId}`,
  });

  // Qualquer pessoa anexa arquivo, então precisa existir moderação — e ela mora
  // onde o arquivo aparece, não numa tela à parte.
  const apagar = admin ? (attachmentId: string) => void deleteAttachment(issueId, attachmentId) : undefined;

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>

      {acabouDeCriar && <p className="aviso aviso-ok">{t.submitted}</p>}
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}

      {(carregando || carregandoSessao) && <p className="aviso">{t.loading}</p>}

      {!carregando && !carregandoSessao && !issue && (
        <>
          <h1>{t.notFound}</h1>
          <p className="subtitulo">{t.notFoundHelp}</p>
        </>
      )}

      {issue && (
        <>
          <IssueDetail issue={issue} />
          {admin && (
            <Suspense fallback={<p className="aviso">{t.loading}</p>}>
              <AcoesTicket
                issue={issue}
                onMover={(column) => void mover(issue.id, column)}
                onEditar={(campos) => void editar(issue.id, campos)}
              />
            </Suspense>
          )}
          <ListaAnexos attachments={anexosDoCard} onApagar={apagar} />
          <h2 className="secao">{t.commentCount(comments.length)}</h2>
          <ListaComentarios
            comments={comments}
            images={imagensDeComentario}
            onApagarImagem={apagar}
          />
          {admin && (
            <Suspense fallback={null}>
              {/* Id próprio: o painel do quadro tem o mesmo formulário, e o
                  `htmlFor` do campo de anexos precisa ser único no documento. */}
              <FormularioComentario
                id="imagens-comentario-ticket"
                onEnviar={(text, images) => void comentar(issue.id, text, images)}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
