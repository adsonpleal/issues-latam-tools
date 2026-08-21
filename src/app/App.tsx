import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";

import { SessaoProvider } from "../features/admin/SessaoContext";
import { t } from "../i18n";
import { isProjeto } from "../lib/projetos";
import { BoardPage } from "../pages/BoardPage";
import { IssuePage } from "../pages/IssuePage";
import { NewIssuePage } from "../pages/NewIssuePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SiteFooter } from "./SiteFooter";
import { TopBar } from "./TopBar";

// Estas duas são as únicas páginas que só existem com sessão. Lazy porque não há
// razão para o público carregá-las — mas o peso de verdade, o SDK de auth, quem
// segura é a marca em localStorage (ver lib/auth.ts), não a rota.
const EntrarPage = lazy(() =>
  import("../pages/EntrarPage").then((m) => ({ default: m.EntrarPage })),
);

const GravacoesPage = lazy(() =>
  import("../pages/GravacoesPage").then((m) => ({ default: m.GravacoesPage })),
);

/**
 * `/visuais` digitado na mão vira `/?projeto=visuais`. O esquema canônico é a
 * querystring — ela compõe com tipo e busca, e não briga com /novo, /t/:id e
 * /gravacoes por espaço de nome.
 */
function AtalhoProjeto() {
  const { slug } = useParams();
  if (isProjeto(slug)) return <Navigate replace to={`/?projeto=${slug}`} />;
  return <NotFoundPage />;
}

/**
 * Não existe espaço de URL de admin. As mesmas rotas servem todo mundo, e é ter
 * ou não sessão que decide se os controles aparecem — ver `SessaoProvider`. A
 * única rota que só faz sentido para o admin é `/entrar`, que não é linkada de
 * lugar nenhum.
 */
export function App() {
  return (
    <BrowserRouter>
      <SessaoProvider>
        <TopBar />
        <main className="conteudo">
          <Suspense fallback={<p className="aviso">{t.carregando}</p>}>
            <Routes>
              <Route path="/" element={<BoardPage />} />
              <Route path="/novo" element={<NewIssuePage />} />
              <Route path="/t/:issueId" element={<IssuePage />} />
              <Route path="/entrar" element={<EntrarPage />} />
              {/* Vêm antes do atalho de projeto — o router v7 ordena por
                  especificidade, então `/:slug` não roubaria nenhuma das duas de
                  qualquer jeito, mas a leitura fica na ordem certa. */}
              <Route path="/gravacoes" element={<GravacoesPage />} />
              <Route path="/:slug" element={<AtalhoProjeto />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <SiteFooter />
      </SessaoProvider>
    </BrowserRouter>
  );
}
