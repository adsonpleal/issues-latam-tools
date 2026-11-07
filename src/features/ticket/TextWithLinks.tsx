import { Fragment } from "react";

// Global only for the split (which needs it); the test uses a copy without `g`,
// because `test` on a global regex carries lastIndex and alternates its result
// on every call -- the classic silent bug.
const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;
const URL_TEST = /^https?:\/\//;
// Punctuation stuck to the end ("...?r=abc." at the end of a sentence) is not
// part of the URL.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

function Piece({ text }: { text: string }) {
  if (!URL_TEST.test(text)) return <>{text}</>;

  const trailing = text.match(TRAILING_PUNCTUATION)?.[0] ?? "";
  const url = trailing ? text.slice(0, -trailing.length) : text;

  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow">
        {url}
      </a>
      {trailing}
    </>
  );
}

/**
 * Somebody else's text always comes in as text: the links become <a> by
 * building React nodes, never through innerHTML. Without that, a description
 * with a <script> inside would be exactly what it looks like.
 */
export function TextWithLinks({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {line.split(URL_SPLIT).map((piece, i) => (
            <Piece key={i} text={piece} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
