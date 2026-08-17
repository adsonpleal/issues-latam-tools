import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

import { t } from "../i18n";
import { isProjeto } from "../lib/projetos";
import { BoardPage } from "../pages/BoardPage";
import { IssuePage } from "../pages/IssuePage";
import { NewIssuePage } from "../pages/NewIssuePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SiteFooter } from "./SiteFooter";
import { TopBar } from "./TopBar";

// A rota do admin (e, com ela, o SDK de auth) só é baixada por quem abre /admin.
const AdminPage = lazy(() =>
  import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);

const GravacoesPage = lazy(() =>
  import("../pages/GravacoesPage").then((m) => ({ default: m.GravacoesPage })),
);

/**
 * `/visuais` digitado na mão vira `/?projeto=visuais`. O esquema canônico é a
 * querystring — ela compõe com tipo e busca, e não briga com /admin, /novo e
 * /t/:id por espaço de nome.
 */
function AtalhoProjeto() {
  const { slug } = useParams();
  if (isProjeto(slug)) return <Navigate replace to={`/?projeto=${slug}`} />;
  return <NotFoundPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <TopBar />
      <main className="conteudo">
        <Suspense fallback={<p className="aviso">{t.carregando}</p>}>
          <Routes>
            <Route path="/" element={<BoardPage />} />
            <Route path="/novo" element={<NewIssuePage />} />
            <Route path="/t/:issueId" element={<IssuePage />} />
            <Route path="/admin" element={<AdminPage />} />
            {/* Vem antes do atalho de projeto — `/:slug` casa um segmento só,
                então não haveria conflito, mas a leitura fica na ordem certa. */}
            <Route path="/admin/gravacoes" element={<GravacoesPage />} />
            <Route path="/:slug" element={<AtalhoProjeto />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <SiteFooter />
    </BrowserRouter>
  );
}
