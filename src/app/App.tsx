import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

import { SessionProvider } from "../features/admin/SessionContext";
import { t } from "../i18n";
import { isProject } from "../lib/projects";
import { BoardPage } from "../pages/BoardPage";
import { IssuePage } from "../pages/IssuePage";
import { NewIssuePage } from "../pages/NewIssuePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SiteFooter } from "./SiteFooter";
import { TopBar } from "./TopBar";

// These two are the only pages that exist with a session. Lazy because there is
// no reason for the public to download them -- but the real weight, the auth
// SDK, is held back by the mark in localStorage (see lib/auth.ts), not by the
// route.
const SignInPage = lazy(() =>
  import("../pages/SignInPage").then((m) => ({ default: m.SignInPage })),
);

const RecordingsPage = lazy(() =>
  import("../pages/RecordingsPage").then((m) => ({ default: m.RecordingsPage })),
);

/**
 * `/visuais` typed by hand becomes `/?projeto=visuais`. The canonical scheme is
 * the query string -- it composes with type and search, and does not fight
 * /novo, /t/:id and /gravacoes over the name space.
 *
 * The paths and the query parameters are public URLs, so they keep their
 * Portuguese spelling.
 */
function ProjectShortcut() {
  const { slug } = useParams();
  if (isProject(slug)) return <Navigate replace to={`/?projeto=${slug}`} />;
  return <NotFoundPage />;
}

/**
 * There is no admin URL space. The same routes serve everybody, and having a
 * session or not is what decides whether the controls appear -- see
 * `SessionProvider`. The only route that makes sense for the admin alone is
 * `/entrar`, which is linked from nowhere.
 */
export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <TopBar />
        <main className="conteudo">
          <Suspense fallback={<p className="aviso">{t.loading}</p>}>
            <Routes>
              <Route path="/" element={<BoardPage />} />
              <Route path="/novo" element={<NewIssuePage />} />
              <Route path="/t/:issueId" element={<IssuePage />} />
              <Route path="/entrar" element={<SignInPage />} />
              {/* These come before the project shortcut -- router v7 orders by
                  specificity, so `/:slug` would not steal either of them
                  anyway, but it reads in the right order. */}
              <Route path="/gravacoes" element={<RecordingsPage />} />
              <Route path="/:slug" element={<ProjectShortcut />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <SiteFooter />
      </SessionProvider>
    </BrowserRouter>
  );
}
