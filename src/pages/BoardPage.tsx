import { Suspense, lazy, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { PROJECTS, parseProject } from "../lib/projetos";
import { useSeo } from "../lib/seo";
import { isIssueType, type Column } from "../lib/status";
import { useSessao } from "../features/admin/SessaoContext";
import { useAcoesAdmin } from "../features/admin/useAcoesAdmin";
import { agrupar, agruparAdmin, colunaDe, pilha } from "../features/board/agrupar";
import { Board } from "../features/board/Board";
import { reordenarPilha, soltarPilha } from "../features/board/ordem";
import { useBoard } from "../features/board/useBoard";

const PainelIssue = lazy(() =>
  import("../features/admin/PainelIssue").then((m) => ({ default: m.PainelIssue })),
);

export function BoardPage() {
  const [params] = useSearchParams();
  const project = parseProject(params.get("projeto"));
  const { carregando: carregandoSessao } = useSessao();

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
      {carregandoSessao ? <p className="aviso">{t.loading}</p> : <Quadro />}
    </>
  );
}

function Quadro() {
  const [params, setParams] = useSearchParams();
  const project = parseProject(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const type = isIssueType(tipoBruto) ? tipoBruto : null;
  const busca = params.get("busca") ?? "";

  const { sessao, admin } = useSessao();
  // Com admin, a consulta perde o where de arquivado — a regra permite listar
  // tudo para este e-mail, então a gaveta de arquivados aparece.
  const { issues, carregando, erro } = useBoard({ admin });
  const { mover, ordenar, comentar, editar, erro: erroAcao } = useAcoesAdmin(sessao);

  // O painel aberto mora na querystring, junto dos filtros: assim a URL da barra
  // de endereço já é o link do card, e voltar no navegador fecha o painel.
  const aberto = params.get("card");
  function abrir(id: string | null) {
    const novos = new URLSearchParams(params);
    if (id) novos.set("card", id);
    else novos.delete("card");
    setParams(novos);
  }

  const colunas = useMemo(
    () => (admin ? agruparAdmin : agrupar)(issues, { project, type, busca }),
    [admin, issues, project, type, busca],
  );
  // Procurado na lista inteira, não nas colunas: um link direto precisa abrir o
  // card mesmo quando o filtro em vigor o esconderia do quadro.
  const issueAberta = admin ? (issues.find((i) => i.id === aberto) ?? null) : null;

  // Soltar em cima de um card fixa a posição. A conta roda sempre na pilha
  // COMPLETA da coluna de destino — o que está na tela pode ser um pedaço dela,
  // e renumerar só o pedaço embaralharia o que o filtro esconde.
  function fixar(id: string, alvoId: string, antes: boolean) {
    const arrastado = issues.find((i) => i.id === id);
    const alvo = issues.find((i) => i.id === alvoId);
    if (!arrastado || !alvo) return;
    const destino = colunaDe(alvo);
    const posicoes = reordenarPilha(pilha(issues, destino), arrastado, alvoId, antes);
    // Veio de outra coluna: status e posição saem na mesma escrita, senão o card
    // aparece um instante na coluna nova e no lugar errado.
    const mudouDeColuna = colunaDe(arrastado) !== destino;
    void ordenar(posicoes, mudouDeColuna ? { id, column: destino } : undefined);
  }

  function ordemAutomatica(column: Column) {
    void ordenar(soltarPilha(pilha(issues, column)));
  }

  return (
    <>
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}
      <Board
        colunas={colunas}
        carregando={carregando}
        erro={erro}
        onMover={admin ? (id, column) => void mover(id, column) : undefined}
        onAbrir={admin ? abrir : undefined}
        onFixar={admin ? fixar : undefined}
        onOrdemAutomatica={admin ? ordemAutomatica : undefined}
      />
      {issueAberta && (
        <Suspense fallback={<p className="aviso">{t.loading}</p>}>
          <PainelIssue
            issue={issueAberta}
            onFechar={() => abrir(null)}
            onComentar={(text, images) => void comentar(issueAberta.id, text, images)}
            onEditar={(campos) => void editar(issueAberta.id, campos)}
          />
        </Suspense>
      )}
    </>
  );
}
