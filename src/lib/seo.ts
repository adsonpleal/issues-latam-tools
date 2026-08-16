import { useEffect } from "react";

export const SITE_URL = "https://issues.latam-tools.com.br";

function setMeta(seletor: string, attr: "content" | "href", valor: string) {
  const el = document.head.querySelector(seletor);
  if (el) el.setAttribute(attr, valor);
}

/** Ajusta título/description/canonical por rota. SPA, então é tudo no cliente. */
export function useSeo(opts: { title: string; description?: string; path?: string }): void {
  const { title, description, path } = opts;
  useEffect(() => {
    document.title = title;
    if (description) {
      setMeta('meta[name="description"]', "content", description);
      setMeta('meta[property="og:description"]', "content", description);
    }
    setMeta('meta[property="og:title"]', "content", title);
    const url = `${SITE_URL}${path ?? ""}`;
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:url"]', "content", url);
  }, [title, description, path]);
}
