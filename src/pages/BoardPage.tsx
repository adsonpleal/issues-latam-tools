import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { PROJETOS, parseProjeto } from "../lib/projetos";
import { useSeo } from "../lib/seo";
import { isTipo } from "../lib/status";
import { agrupar } from "../features/board/agrupar";
import { Board } from "../features/board/Board";
import { useBoard } from "../features/board/useBoard";

export function BoardPage() {
  const [params] = useSearchParams();
  const projeto = parseProjeto(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const tipo = isTipo(tipoBruto) ? tipoBruto : null;
  const busca = params.get("busca") ?? "";

  const { issues, carregando, erro } = useBoard();
  const colunas = useMemo(
    () => agrupar(issues, { projeto, tipo, busca }),
    [issues, projeto, tipo, busca],
  );

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
      <Board colunas={colunas} carregando={carregando} erro={erro} />
    </>
  );
}
