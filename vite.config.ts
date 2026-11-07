import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * No `base: "./"`. A relative path would break the deep routes (`/t/:id`),
 * because the index.html served at `/t/abc` would look for the assets at
 * `/t/assets/...`.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    // The Firestore SDK alone is over 500 kB. The auth one already comes out
    // in a chunk of its own (only whoever signs in imports it), and the rest is
    // react + router.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tools/**/*.test.mjs"],
  },
});
