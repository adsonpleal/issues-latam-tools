import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { LABEL_ESTADO, t } from "../../i18n";
import { formataTamanho } from "../../lib/anexos";
import { formatRelative } from "../../lib/datas";
import { getArquivo, type EstadoGravacao, type Gravacao } from "../../lib/gravacoes";
import { ResumoGravacao } from "./ResumoGravacao";

type Acoes = {
  onPromover: (g: Gravacao) => void;
  onMarcar: (id: string, estado: EstadoGravacao) => void;
  onApagar: (id: string) => void;
};

type Props = Acoes & {
  fila: Gravacao[];
  promovidas: Gravacao[];
  decididas: Gravacao[];
  carregando: boolean;
  erro: string | null;
};

export function ListaGravacoes({
  fila,
  promovidas,
  decididas,
  carregando,
  erro,
  ...acoes
}: Props) {
  if (erro) return <p className="aviso aviso-erro">{t.erroGravacoes}</p>;
  if (carregando) return <p className="aviso">{t.carregando}</p>;
  if (fila.length + promovidas.length + decididas.length === 0) {
    return <p className="aviso">{t.gravacoesVazio}</p>;
  }

  return (
    <>
      <Secao titulo={t.gravacoesFila} ajuda={t.gravacoesFilaAjuda} gravacoes={fila} vazio={t.filaVazia}>
        {(g) => <Ficha key={g.id} gravacao={g} {...acoes} />}
      </Secao>

      {promovidas.length > 0 && (
        <Secao
          titulo={t.gravacoesPromovidas}
          ajuda={t.gravacoesPromovidasAjuda}
          gravacoes={promovidas}
        >
          {(g) => <Ficha key={g.id} gravacao={g} {...acoes} />}
        </Secao>
      )}

      {decididas.length > 0 && (
        <Secao
          titulo={t.gravacoesDecididas}
          ajuda={t.gravacoesDecididasAjuda}
          gravacoes={decididas}
        >
          {(g) => <Ficha key={g.id} gravacao={g} {...acoes} />}
        </Secao>
      )}
    </>
  );
}

function Secao({
  titulo,
  ajuda,
  gravacoes,
  vazio,
  children,
}: {
  titulo: string;
  ajuda: string;
  gravacoes: Gravacao[];
  vazio?: string;
  children: (g: Gravacao) => ReactNode;
}) {
  return (
    <section className="gravacoes-secao">
      <h2 className="secao">
        {titulo} <span className="coluna-contador">{gravacoes.length}</span>
      </h2>
      <p className="campo-ajuda">{ajuda}</p>
      {gravacoes.length === 0 ? (
        <p className="aviso">{vazio}</p>
      ) : (
        <ul className="gravacoes-lista">{gravacoes.map(children)}</ul>
      )}
    </section>
  );
}

function Ficha({
  gravacao,
  onPromover,
  onMarcar,
  onApagar,
}: Acoes & { gravacao: Gravacao }) {
  const naFila = gravacao.estado === "fila";
  const promovida = gravacao.estado === "promovida";

  return (
    <li className="gravacao">
      <div className="gravacao-topo">
        <h3 className="gravacao-titulo">{gravacao.titulo}</h3>
        <span className={`selo selo-${gravacao.estado}`}>{LABEL_ESTADO[gravacao.estado]}</span>
      </div>

      {gravacao.resumo && Object.keys(gravacao.resumo).length > 0 ? (
        <ResumoGravacao replay={gravacao.resumo} className="gravacao-resumo" />
      ) : (
        <p className="campo-ajuda">{t.gravacaoSemResumo}</p>
      )}

      {gravacao.notas && (
        <p className="gravacao-notas">
          <strong>{t.notasDeQuemEnviou}:</strong> {gravacao.notas}
        </p>
      )}
      {gravacao.notaTriagem && (
        <p className="gravacao-notas">
          <strong>{t.notaDaTriagem}:</strong> {gravacao.notaTriagem}
        </p>
      )}

      <div className="gravacao-rodape">
        {/* Nick e contato só existem nesta tela: a coleção é privada, e o nick
            só chega ao público se a ficha virar card. */}
        {gravacao.nick && <span className="issue-card-meta">{t.reportadoPor(gravacao.nick)}</span>}
        {gravacao.contato && (
          <span className="issue-card-meta">
            <span aria-hidden="true">✉</span> {gravacao.contato}
          </span>
        )}
        <time className="issue-card-meta" dateTime={gravacao.criadoEm?.toISOString()}>
          {formatRelative(gravacao.criadoEm)}
        </time>
        <span className="issue-card-meta">{formataTamanho(gravacao.tamanho)}</span>
        {promovida && gravacao.issueId && (
          <Link className="issue-card-meta" to={`/t/${gravacao.issueId}`}>
            {t.verCard}
          </Link>
        )}
      </div>

      <div className="gravacao-acoes">
        <BotaoBaixar gravacao={gravacao} />

        {naFila ? (
          <>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.marcarConferidaTitulo}
              onClick={() => onMarcar(gravacao.id, "conferida")}
            >
              {t.marcarConferida}
            </button>
            <button
              type="button"
              className="botao botao-pequeno"
              title={t.descartarTitulo}
              onClick={() => onMarcar(gravacao.id, "descartada")}
            >
              {t.descartar}
            </button>
            <button
              type="button"
              className="botao botao-primario botao-pequeno"
              title={t.promoverTitulo}
              onClick={() => onPromover(gravacao)}
            >
              {t.promover}
            </button>
          </>
        ) : (
          // Promovida não volta para a fila: o card já existe, e o caminho de
          // desfazer é arquivá-lo no quadro.
          !promovida && (
            <>
              <button
                type="button"
                className="botao botao-pequeno"
                onClick={() => onMarcar(gravacao.id, "fila")}
              >
                {t.devolverParaFila}
              </button>
              <button
                type="button"
                className="botao botao-pequeno botao-perigo"
                title={t.apagarGravacaoTitulo}
                onClick={() => {
                  // Apagar é para upload que não devia ter entrado, e não tem
                  // volta — por isso é o único clique do site que pergunta.
                  if (window.confirm(t.apagarGravacaoConfirma(gravacao.titulo))) {
                    onApagar(gravacao.id);
                  }
                }}
              >
                {t.apagarGravacao}
              </button>
            </>
          )
        )}
      </div>
    </li>
  );
}

/**
 * O .rrf mora num subdocumento, então só é baixado quando alguém pede — a lista
 * inteira com os arquivos dentro seriam megabytes por abertura de página.
 */
function BotaoBaixar({ gravacao }: { gravacao: Gravacao }) {
  const [estado, setEstado] = useState<"pronto" | "baixando" | "erro">("pronto");

  async function baixar() {
    setEstado("baixando");
    const arquivo = await getArquivo(gravacao.id).catch(() => null);
    if (!arquivo) {
      setEstado("erro");
      return;
    }
    // Uint8Array vindo do Firestore pode ter byteOffset; o slice normaliza.
    const copia = arquivo.bytes.slice();
    const url = URL.createObjectURL(
      new Blob([copia as unknown as BlobPart], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.nome || `${gravacao.id}.rrf`;
    a.click();
    URL.revokeObjectURL(url);
    setEstado("pronto");
  }

  return (
    <button
      type="button"
      className="botao botao-pequeno"
      disabled={estado === "baixando"}
      onClick={() => void baixar()}
    >
      {estado === "baixando" ? t.baixando : estado === "erro" ? t.erroBaixar : t.baixarRrf}
    </button>
  );
}
