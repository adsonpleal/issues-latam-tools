import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { t } from "../i18n";
import { useSeo } from "../lib/seo";
import { useSessao } from "../features/admin/SessaoContext";

/**
 * A única porta. Não é linkada de lugar nenhum — e não precisa ser: só existe um
 * admin, e ele sabe o endereço.
 *
 * Ela liga o observador de sessão sem consultar a marca em localStorage, e é
 * isso que a torna o conserto para quando a marca se perde (storage limpo, outro
 * navegador do mesmo perfil): se a sessão do Firebase ainda estiver viva no
 * IndexedDB, esta página reconhece e redireciona sem popup nenhum.
 *
 * De quebra, subscrever na montagem já deixa o módulo de auth em cache antes do
 * clique. Sem isso, o `await import(...)` dentro do handler seria uma ida à rede
 * no meio de um gesto do usuário — que é exatamente o que o Safari conta como
 * perda de ativação para bloquear o popup.
 */
export function EntrarPage() {
  useSeo({ title: `${t.entrar} — ${t.siteNome}` });
  const { sessao, admin, carregando, ativar, entrar, sair } = useSessao();
  // O que o popup respondeu de errado. Sem isto, falhar em entrar é um clique
  // que não faz nada — e popup bloqueado, que é a falha mais comum, some sem
  // deixar rastro na tela.
  const [erro, setErro] = useState<string | null>(null);

  useEffect(ativar, [ativar]);

  if (admin) return <Navigate replace to="/" />;

  return (
    <div className="pagina pagina-estreita">
      <div className="admin-portao">
        {carregando && <p className="aviso">{t.carregando}</p>}

        {!carregando && !sessao && (
          <>
            <p>{t.adminEntrarAjuda}</p>
            <button
              type="button"
              className="botao botao-primario"
              onClick={() => {
                setErro(null);
                entrar().catch((e: { code?: string; message?: string }) =>
                  setErro(e.code ?? e.message ?? "desconhecido"),
                );
              }}
            >
              {t.entrar}
            </button>
            {erro && <p className="aviso aviso-erro">{t.erroEntrar(erro)}</p>}
          </>
        )}

        {!carregando && sessao && (
          <>
            <p className="aviso aviso-erro">{t.semPermissao}</p>
            <p className="campo-ajuda">{t.semPermissaoAjuda}</p>
            <button type="button" className="botao" onClick={() => void sair()}>
              {t.sair}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
