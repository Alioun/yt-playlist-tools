// THROWAWAY PROTOTYPE (ticket 27, YouTube Music controls). Not production code.
// Builds the clickable mock (index.html). The rough dev build of the extension is built by scripts/build-ext.ts.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: { outDir: "dist/mock", chunkSizeWarningLimit: 1500 },
  // Client-only app. vite-plugin-svelte 7 pre-bundles svelte for the dev server's SSR environment, and with
  // rolldown 1.2 that fails ("Could not resolve 'node:module'"), which stops `bun run dev` (found in ticket 09).
  environments: {
    ssr: { optimizeDeps: { exclude: ["svelte"], noDiscovery: true } },
  },
});
