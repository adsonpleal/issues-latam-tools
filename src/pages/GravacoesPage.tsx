import { useMemo } from "react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { AdminGate } from "../features/admin/AdminGate";
import { separarGravacoes } from "../features/admin/gravacoes";
import { ListaGravacoes } from "../features/admin/ListaGravacoes";
import { useGravacoes } from "../features/admin/useGravacoes";

/**
 * A caixa de entrada das gravações do "Ajude o simulador a acertar as contas".
 *
 * Elas não são cards: vivem numa coleção que só o admin lê, e o botão Promover é
 * o que cria a ficha pública com o .rrf anexado. Antes disso não existe URL que
 * devolva a gravação para ninguém — que é o que o consentimento promete.
 */
export function GravacoesPage() {
  useSeo({ title: `${t.gravacoesTitulo} — ${t.siteNome}`, path: "/admin/gravacoes" });

  return (
    <div className="pagina">
      <h1>{t.gravacoesTitulo}</h1>
      <p className="subtitulo">{t.gravacoesSub}</p>
      <p>
        <Link to="/admin" className="link-voltar">
          ← {t.voltarQuadroAdmin}
        </Link>
      </p>
      <AdminGate>{() => <Fila />}</AdminGate>
    </div>
  );
}

function Fila() {
  const { gravacoes, carregando, erro, erroAcao, promover, marcar, apagar } = useGravacoes();
  const { fila, promovidas, decididas } = useMemo(() => separarGravacoes(gravacoes), [gravacoes]);

  return (
    <>
      {erroAcao && <p className="aviso aviso-erro">{erroAcao}</p>}
      <ListaGravacoes
        fila={fila}
        promovidas={promovidas}
        decididas={decididas}
        carregando={carregando}
        erro={erro}
        onPromover={(g) => void promover(g)}
        onMarcar={(id, estado) => void marcar(id, estado)}
        onApagar={(id) => void apagar(id)}
      />
    </>
  );
}
