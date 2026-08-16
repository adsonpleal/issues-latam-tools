import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Sem `base: "./"`. O caminho relativo quebraria as rotas fundas (`/t/:id`), porque
 * o index.html servido em `/t/abc` procuraria os assets em `/t/assets/...`.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    // O SDK do Firestore sozinho passa de 500 kB. O de auth já sai num chunk
    // separado (só /admin importa), e o resto é react + router.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
