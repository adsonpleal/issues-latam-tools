import { Suspense, lazy, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { PROJECTS, parseProject } from "../lib/projetos";
import { useSeo } from "../lib/seo";
import { isIssueType, type Column } from "../lib/status";
import { useSession } from "../features/admin/SessaoContext";
import { useAdminActions } from "../features/admin/useAcoesAdmin";
import { group, groupForAdmin, columnOf, stack } from "../features/board/agrupar";
import { Board } from "../features/board/Board";
import { reorderStack, releaseStack } from "../features/board/ordem";
import { useBoard } from "../features/board/useBoard";

const IssuePanel = lazy(() =>
  import("../features/admin/PainelIssue").then((m) => ({ default: m.IssuePanel })),
);

export function BoardPage() {
  const [params] = useSearchParams();
  // The query parameters are public URLs, so they keep their spelling.
  const project = parseProject(params.get("projeto"));
  const { loading: loadingSession } = useSession();

  useSeo({
    title: project
      ? `${PROJECTS[project].name} — ${t.siteName} ${t.siteSubtitle}`
      : `${t.siteName} — ${t.siteSubtitle}`,
    description: project
      ? `Bugs e sugestões de ${PROJECTS[project].name}: ${PROJECTS[project].description}. Acompanhe o progresso.`
      : t.siteDescription,
    path: project ? `/?projeto=${project}` : "/",
  });

  return (
    <>
      {project && (
        <p className="contexto-projeto">
          Mostrando só <strong>{PROJECTS[project].name}</strong> —{" "}
          <a href={PROJECTS[project].url} target="_blank" rel="noopener noreferrer">
            {PROJECTS[project].url.replace("https://", "")}
          </a>
        </p>
      )}
      {/* The board only mounts with the session already resolved. For the public
          that is free -- with no mark in localStorage, the session resolves on
          the first render. For the admin it avoids subscribing to Firestore
          twice (the query changes with `admin`) and keeps an already painted
          board from flashing back to "Carregando…" when the auth SDK answers. */}
      {loadingSession ? <p className="aviso">{t.loading}</p> : <BoardBody />}
    </>
  );
}

function BoardBody() {
  const [params, setParams] = useSearchParams();
  const project = parseProject(params.get("projeto"));
  const rawType = params.get("tipo");
  const type = isIssueType(rawType) ? rawType : null;
  const search = params.get("busca") ?? "";

  const { session, admin } = useSession();
  // With an admin, the query loses the archived `where` -- the rule allows
  // listing everything for this e-mail, so the archive drawer shows up.
  const { issues, loading, error } = useBoard({ admin });
  const { move, sort, comment, edit, error: actionError } = useAdminActions(session);

  // The open panel lives in the query string, next to the filters: that way the
  // address bar's URL is already the card's link, and going back in the browser
  // closes the panel.
  const openId = params.get("card");
  function open(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("card", id);
    else next.delete("card");
    setParams(next);
  }

  const columns = useMemo(
    () => (admin ? groupForAdmin : group)(issues, { project, type, search }),
    [admin, issues, project, type, search],
  );
  // Looked up in the whole list, not in the columns: a direct link has to open
  // the card even when the filter in force would hide it from the board.
  const openIssue = admin ? (issues.find((i) => i.id === openId) ?? null) : null;

  // Dropping onto a card pins the position. The arithmetic always runs on the
  // destination column's COMPLETE stack -- what is on screen may be a slice of
  // it, and renumbering only the slice would shuffle what the filter hides.
  function pin(id: string, targetId: string, before: boolean) {
    const dragged = issues.find((i) => i.id === id);
    const target = issues.find((i) => i.id === targetId);
    if (!dragged || !target) return;
    const destination = columnOf(target);
    const positions = reorderStack(stack(issues, destination), dragged, targetId, before);
    // It came from another column: status and position go out in the same
    // write, otherwise the card shows for an instant in the new column and in
    // the wrong place.
    const changedColumn = columnOf(dragged) !== destination;
    void sort(positions, changedColumn ? { id, column: destination } : undefined);
  }

  function autoOrder(column: Column) {
    void sort(releaseStack(stack(issues, column)));
  }

  return (
    <>
      {actionError && <p className="aviso aviso-erro">{actionError}</p>}
      <Board
        columns={columns}
        loading={loading}
        error={error}
        onMove={admin ? (id, column) => void move(id, column) : undefined}
        onOpen={admin ? open : undefined}
        onPin={admin ? pin : undefined}
        onAutoOrder={admin ? autoOrder : undefined}
      />
      {openIssue && (
        <Suspense fallback={<p className="aviso">{t.loading}</p>}>
          <IssuePanel
            issue={openIssue}
            onClose={() => open(null)}
            onComment={(text, images) => void comment(openIssue.id, text, images)}
            onEdit={(fields) => void edit(openIssue.id, fields)}
          />
        </Suspense>
      )}
    </>
  );
}
