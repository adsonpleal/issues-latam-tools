import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { deleteAttachment, subscribeAttachments, type Attachment } from "../lib/attachments";
import { subscribeComments, type IssueComment } from "../lib/comments";
import { subscribeIssue, type Issue } from "../lib/issues";
import { useSeo } from "../lib/seo";
import { useSession } from "../features/admin/SessionContext";
import { useAdminActions } from "../features/admin/useAdminActions";
import { IssueDetail } from "../features/ticket/IssueDetail";
import { AttachmentList } from "../features/ticket/AttachmentList";
import { CommentList } from "../features/ticket/CommentList";

const TicketActions = lazy(() =>
  import("../features/admin/TicketActions").then((m) => ({ default: m.TicketActions })),
);

const CommentForm = lazy(() =>
  import("../features/admin/IssueActions").then((m) => ({ default: m.CommentForm })),
);

export function IssuePage() {
  const { issueId = "" } = useParams();
  const [params] = useSearchParams();
  // The query parameter is a public URL, so it keeps its spelling.
  const justCreated = params.get("novo") === "1";

  const { session, admin, loading: loadingSession } = useSession();
  const uid = session?.uid ?? null;
  const { move, edit, comment, error: actionError } = useAdminActions(session);

  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

  // The three subscriptions wait for the session to resolve, and resubscribe
  // when the uid changes. This is not fussiness: an archived card denies the
  // read to anybody who is not the admin, and an onSnapshot that takes a
  // permission-denied DIES -- it does not retry when the token arrives later.
  // Subscribing too early would leave the admin staring at a "not found" that
  // nothing else would repair.
  useEffect(() => {
    if (!issueId || loadingSession) return;
    setLoading(true);
    // An archived card answers permission-denied, and a non-existent one answers
    // empty. Both become the SAME "not found" on purpose: the difference between
    // the answers would tell that an archived card with that id exists.
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

  // One subscription for both uses: what came with the report stays in the
  // attachment list, what was pasted into an update shows up inside it.
  // Memoised because both lists become object URLs -- rebuilding them on every
  // render would churn blobs for nothing.
  const [cardAttachments, commentImages] = useMemo(
    () => [attachments.filter((a) => !a.commentId), attachments.filter((a) => a.commentId)],
    [attachments],
  );

  useSeo({
    title: issue ? `${issue.title} — ${t.siteName}` : `${t.siteName} — ${t.siteSubtitle}`,
    description: issue?.description.slice(0, 160) || t.siteDescription,
    path: `/t/${issueId}`,
  });

  // Anybody can attach a file, so moderation has to exist -- and it lives where
  // the file shows up, not on a screen of its own.
  const remove = admin ? (attachmentId: string) => void deleteAttachment(issueId, attachmentId) : undefined;

  return (
    <div className="pagina pagina-estreita">
      <p>
        <Link to="/" className="link-voltar">
          ← {t.backToBoard}
        </Link>
      </p>

      {justCreated && <p className="aviso aviso-ok">{t.submitted}</p>}
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
            onDeleteImage={remove}
          />
          {admin && (
            <Suspense fallback={null}>
              {/* An id of its own: the board's panel has the same form, and the
                  attachment field's `htmlFor` has to be unique in the document. */}
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
