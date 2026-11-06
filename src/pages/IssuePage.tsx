import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { deleteAttachment, subscribeAttachments, type Attachment } from "../lib/anexos";
import { subscribeComments, type IssueComment } from "../lib/comentarios";
import { subscribeIssue, type Issue } from "../lib/issues";
import { useSeo } from "../lib/seo";
import { useSession } from "../features/admin/SessaoContext";
import { useAdminActions } from "../features/admin/useAcoesAdmin";
import { IssueDetail } from "../features/ticket/IssueDetail";
import { AttachmentList } from "../features/ticket/ListaAnexos";
import { CommentList } from "../features/ticket/ListaComentarios";

const TicketActions = lazy(() =>
  import("../features/admin/AcoesTicket").then((m) => ({ default: m.TicketActions })),
);

const CommentForm = lazy(() =>
  import("../features/admin/AcoesIssue").then((m) => ({ default: m.CommentForm })),
);

export function IssuePage() {
  const { issueId = "" } = useParams();
  const [params] = useSearchParams();
  const acabouDeCriar = params.get("novo") === "1";

  const { session, admin, loading: loadingSession } = useSession();
  const uid = session?.uid ?? null;
  const { move, edit, comment, error: actionError } = useAdminActions(session);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

  // As três assinaturas esperam a sessão resolver, e re-assinam quando o uid
  // muda. Não é capricho: card arquivado nega a leitura para quem não é admin, e
  // um onSnapshot que toma permission-denied MORRE — não tenta de novo quando o
  // token chega depois. Assinar antes da hora deixaria o admin olhando um "não
  // encontrado" que nada mais consertaria.
  useEffect(() => {
    if (!issueId || loadingSession) return;
    setLoading(true);
    // Card arquivado devolve permission-denied, e inexistente devolve vazio. Os
    // dois viram o MESMO "não encontrado" de propósito: a diferença entre as
    // respostas contaria que existe um card arquivado com aquele id.
    const cancel = subscribeIssue(
      issueId,
      (i) => {
        setIssue(i);
        setLoading(false);
      },
      () => {
        setIssue(null);
        setLoading(false);
      },
    );
    return cancel;
  }, [issueId, loadingSession, uid]);

  useEffect(() => {
    if (!issueId || loadingSession) return;
    return subscribeComments(issueId, setComments, () => setComments([]));
  }, [issueId, loadingSession, uid]);

  useEffect(() => {
    if (!issueId || loadingSession) return;
    return subscribeAttachments(issueId, setAttachments, () => setAttachments([]));
  }, [issueId, loadingSession, uid]);

  // Uma subscrição só para os dois usos: o que veio no relato fica na lista de
  // anexos, o que foi colado numa atualização aparece dentro dela. Memoizado
  // porque as duas listas viram object URL — recriá-las a cada render churnaria
  // blob à toa.
  const [cardAttachments, commentImages] = useMemo(
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
  const remove = admin ? (attachmentId: string) => void deleteAttachment(issueId, attachmentId) : undefined;

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>

      {acabouDeCriar && <p className="aviso aviso-ok">{t.submitted}</p>}
      {actionError && <p className="aviso aviso-erro">{actionError}</p>}

      {(loading || loadingSession) && <p className="aviso">{t.loading}</p>}

      {!loading && !loadingSession && !issue && (
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
              <TicketActions
                issue={issue}
                onMove={(column) => void move(issue.id, column)}
                onEdit={(fields) => void edit(issue.id, fields)}
              />
            </Suspense>
          )}
          <AttachmentList attachments={cardAttachments} onDelete={remove} />
          <h2 className="secao">{t.commentCount(comments.length)}</h2>
          <CommentList
            comments={comments}
            images={commentImages}
            onApagarImagem={remove}
          />
          {admin && (
            <Suspense fallback={null}>
              {/* Id próprio: o painel do quadro tem o mesmo formulário, e o
                  `htmlFor` do campo de anexos precisa ser único no documento. */}
              <CommentForm
                id="imagens-comentario-ticket"
                onSubmit={(text, images) => void comment(issue.id, text, images)}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
