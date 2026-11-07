import { useEffect } from "react";

export const SITE_URL = "https://issues.latam-tools.com.br";

function setMeta(selector: string, attr: "content" | "href", value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/** Sets title/description/canonical per route. It is a SPA, so all client-side. */
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
