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
      {/* O quadro só monta com a sessão já resolvida. Para o público isso é de
          graça — sem marca em localStorage, a sessão resolve na primeira render.
          Para o admin, evita assinar o Firestore duas vezes (a consulta muda com
          o `admin`) e evita o quadro já pintado piscar de volta para
          "Carregando…" quando o SDK de auth responde. */}
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
  // Com admin, a consulta perde o where de arquivado — a regra permite listar
  // tudo para este e-mail, então a gaveta de arquivados aparece.
  const { issues, loading, error } = useBoard({ admin });
  const { move, sort, comment, edit, error: actionError } = useAdminActions(session);

  // O painel aberto mora na querystring, junto dos filtros: assim a URL da barra
  // de endereço já é o link do card, e voltar no navegador fecha o painel.
  const openId = params.get("card");
  function open(id: string | null) {
    const nextParams = new URLSearchParams(params);
    if (id) nextParams.set("card", id);
    else nextParams.delete("card");
    setParams(nextParams);
  }

  const columns = useMemo(
    () => (admin ? groupForAdmin : group)(issues, { project, type, search }),
    [admin, issues, project, type, search],
  );
  // Procurado na lista inteira, não nas colunas: um link direto precisa abrir o
  // card mesmo quando o filtro em vigor o esconderia do quadro.
  const openIssue = admin ? (issues.find((i) => i.id === openId) ?? null) : null;

  // Soltar em cima de um card fixa a posição. A conta roda sempre na pilha
  // COMPLETA da coluna de destino — o que está na tela pode ser um pedaço dela,
  // e renumerar só o pedaço embaralharia o que o filtro esconde.
  function pin(id: string, targetId: string, before: boolean) {
    const dragged = issues.find((i) => i.id === id);
    const target = issues.find((i) => i.id === targetId);
    if (!dragged || !target) return;
    const destination = columnOf(target);
    const positions = reorderStack(stack(issues, destination), dragged, targetId, before);
    // Veio de outra coluna: status e posição saem na mesma escrita, senão o card
    // aparece um instante na coluna nova e no lugar errado.
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
