import { Suspense, lazy, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { PROJETOS, parseProjeto } from "../lib/projetos";
import { useSeo } from "../lib/seo";
import { isTipo } from "../lib/status";
import { useSessao } from "../features/admin/SessaoContext";
import { useAcoesAdmin } from "../features/admin/useAcoesAdmin";
import { agrupar, agruparAdmin } from "../features/board/agrupar";
import { Board } from "../features/board/Board";
import { useBoard } from "../features/board/useBoard";

const PainelIssue = lazy(() =>
  import("../features/admin/PainelIssue").then((m) => ({ default: m.PainelIssue })),
);

export function BoardPage() {
  const [params] = useSearchParams();
  const projeto = parseProjeto(params.get("projeto"));
  const { carregando: carregandoSessao } = useSessao();

  useSeo({
    title: projeto
      ? `${PROJETOS[projeto].nome} — ${t.siteNome} ${t.siteSub}`
      : `${t.siteNome} — ${t.siteSub}`,
    description: projeto
      ? `Bugs e sugestões de ${PROJETOS[projeto].nome}: ${PROJETOS[projeto].descricao}. Acompanhe o progresso.`
      : t.siteDescricao,
    path: projeto ? `/?projeto=${projeto}` : "/",
  });

  return (
    <>
      {projeto && (
        <p className="contexto-projeto">
          Mostrando só <strong>{PROJETOS[projeto].nome}</strong> —{" "}
          <a href={PROJETOS[projeto].url} target="_blank" rel="noopener noreferrer">
            {PROJETOS[projeto].url.replace("https://", "")}
          </a>
        </p>
      )}
      {/* O quadro só monta com a sessão já resolvida. Para o público isso é de
          graça — sem marca em localStorage, a sessão resolve na primeira render.
          Para o admin, evita assinar o Firestore duas vezes (a consulta muda com
          o `admin`) e evita o quadro já pintado piscar de volta para
          "Carregando…" quando o SDK de auth responde. */}
      {carregandoSessao ? <p className="aviso">{t.carregando}</p> : <Quadro />}
    </>
  );
}

function Quadro() {
  const [params, setParams] = useSearchParams();
  const projeto = parseProjeto(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const tipo = isTipo(tipoBruto) ? tipoBruto : null;
  const busca = params.get("busca") ?? "";

  const { sessao, admin } = useSessao();
  // Com admin, a consulta perde o where de arquivado — a regra permite listar
  // tudo para este e-mail, então a gaveta de arquivados aparece.
  const { issues, carregando, erro } = useBoard({ admin });
  const { mover, comentar, editar, erro: erroAcao } = useAcoesAdmin(sessao);

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
    () => (admin ? agruparAdmin : agrupar)(issues, { projeto, tipo, busca }),
    [admin, issues, projeto, tipo, busca],
  );
  // Procurado na lista inteira, não nas colunas: um link direto precisa abrir o
  // card mesmo quando o filtro em vigor o esconderia do quadro.
  const issueAberta = admin ? (issues.find((i) => i.id === aberto) ?? null) : null;

  return (
    <>
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}
      <Board
        colunas={colunas}
        carregando={carregando}
        erro={erro}
        onMover={admin ? (id, coluna) => void mover(id, coluna) : undefined}
        onAbrir={admin ? abrir : undefined}
      />
      {issueAberta && (
        <Suspense fallback={<p className="aviso">{t.carregando}</p>}>
          <PainelIssue
            issue={issueAberta}
            onFechar={() => abrir(null)}
            onComentar={(texto, imagens) => void comentar(issueAberta.id, texto, imagens)}
            onEditar={(campos) => void editar(issueAberta.id, campos)}
          />
        </Suspense>
      )}
    </>
  );
}
