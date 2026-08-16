import { useEffect, useState, type ReactNode } from "react";

import { t } from "../../i18n";
import { entrar, observarSessao, sair, type Sessao } from "../../lib/auth";

type Props = { children: (sessao: Sessao) => ReactNode };

/**
 * Portão só de interface. Quem manda são as regras do Firestore: qualquer conta
 * Google consegue entrar e ganhar um registro de usuário, e nenhuma delas
 * consegue escrever nada além do e-mail de admin.
 */
export function AdminGate({ children }: Props) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelar: (() => void) | undefined;
    let vivo = true;
    void observarSessao((s) => {
      setSessao(s);
      setCarregando(false);
    }).then((fn) => {
      // O import dinâmico do SDK de auth pode terminar depois da desmontagem.
      if (vivo) cancelar = fn;
      else fn();
    });
    return () => {
      vivo = false;
      cancelar?.();
    };
  }, []);

  if (carregando) return <p className="aviso">{t.carregando}</p>;

  if (!sessao) {
    return (
      <div className="admin-portao">
        <p>{t.adminEntrarAjuda}</p>
        <button type="button" className="botao botao-primario" onClick={() => void entrar()}>
          {t.entrar}
        </button>
      </div>
    );
  }

  if (!sessao.admin) {
    return (
      <div className="admin-portao">
        <p className="aviso aviso-erro">{t.semPermissao}</p>
        <p className="campo-ajuda">{t.semPermissaoAjuda}</p>
        <button type="button" className="botao" onClick={() => void sair()}>
          {t.sair}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="admin-sessao">
        <span>{sessao.nome}</span>
        <button type="button" className="botao botao-pequeno" onClick={() => void sair()}>
          {t.sair}
        </button>
      </div>
      {children(sessao)}
    </>
  );
}
