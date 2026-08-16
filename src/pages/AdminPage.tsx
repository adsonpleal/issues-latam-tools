import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { t } from "../i18n";
import { parseProjeto } from "../lib/projetos";
import { useSeo } from "../lib/seo";
import { isTipo } from "../lib/status";
import { AdminGate } from "../features/admin/AdminGate";
import { PainelIssue } from "../features/admin/PainelIssue";
import { useAcoesAdmin } from "../features/admin/useAcoesAdmin";
import { agruparAdmin } from "../features/board/agrupar";
import { Board } from "../features/board/Board";
import { useBoard } from "../features/board/useBoard";

export function AdminPage() {
  useSeo({ title: `${t.adminTitulo} — ${t.siteNome}`, path: "/admin" });

  return (
    <div className="pagina">
      <h1>{t.adminTitulo}</h1>
      <AdminGate>{(sessao) => <QuadroAdmin sessao={sessao} />}</AdminGate>
    </div>
  );
}

function QuadroAdmin({ sessao }: { sessao: import("../lib/auth").Sessao }) {
  const [params] = useSearchParams();
  const projeto = parseProjeto(params.get("projeto"));
  const tipoBruto = params.get("tipo");
  const tipo = isTipo(tipoBruto) ? tipoBruto : null;
  const busca = params.get("busca") ?? "";

  // `admin: true` tira o where de arquivado da consulta — a regra permite listar
  // tudo para este e-mail, então a gaveta de arquivados aparece.
  const { issues, carregando, erro } = useBoard({ admin: true });
  const { mover, comentar, editar, erro: erroAcao } = useAcoesAdmin(sessao);

  const [aberto, setAberto] = useState<string | null>(null);
  const colunas = useMemo(
    () => agruparAdmin(issues, { projeto, tipo, busca }),
    [issues, projeto, tipo, busca],
  );
  const issueAberta = issues.find((i) => i.id === aberto) ?? null;

  return (
    <>
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}
      <Board
        colunas={colunas}
        carregando={carregando}
        erro={erro}
        onMover={(id, coluna) => void mover(id, coluna)}
        onAbrir={setAberto}
      />
      {issueAberta && (
        <PainelIssue
          issue={issueAberta}
          onFechar={() => setAberto(null)}
          onComentar={(texto) => void comentar(issueAberta.id, texto)}
          onEditar={(campos) => void editar(issueAberta.id, campos)}
        />
      )}
    </>
  );
}
