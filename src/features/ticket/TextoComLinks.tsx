import { Fragment } from "react";

// Global só para o split (que precisa dele); o teste usa uma cópia sem `g`,
// porque `test` em regex global carrega lastIndex e alterna resultado a cada
// chamada — bug clássico e silencioso.
const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;
const URL_TESTE = /^https?:\/\//;
// Pontuação colada no fim ("...?r=abc." no fim da frase) não faz parte da URL.
const PONTUACAO_FINAL = /[.,;:!?)\]]+$/;

function Pedaco({ texto }: { texto: string }) {
  if (!URL_TESTE.test(texto)) return <>{texto}</>;

  const sobra = texto.match(PONTUACAO_FINAL)?.[0] ?? "";
  const url = sobra ? texto.slice(0, -sobra.length) : texto;

  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow">
        {url}
      </a>
      {sobra}
    </>
  );
}

/**
 * Texto de terceiro sempre entra como texto: os links viram <a> montando nós do
 * React, nunca por innerHTML. Sem isso, uma descrição com <script> dentro seria
 * exatamente o que parece.
 */
export function TextoComLinks({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("\n").map((linha, iLinha) => (
        <Fragment key={iLinha}>
          {iLinha > 0 && <br />}
          {linha.split(URL_SPLIT).map((pedaco, i) => (
            <Pedaco key={i} texto={pedaco} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
