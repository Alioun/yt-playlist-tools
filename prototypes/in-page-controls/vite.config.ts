// THROWAWAY PROTOTYPE (ticket 14, in-page controls). The hi-fi mock: YouTube's pages faked in YouTube's look, with
// the real site core, kit, features and popovers running on them in one bundle. (The dev build for real YouTube is
// scripts/build-ext.ts, which links them the way ticket 17 does.)
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

export default defineConfig({
  plugins: [svelte({ emitCss: false, compilerOptions: { css: "injected", discloseVersion: false } })],
  resolve: { alias: { $kit: path.resolve("./src/site/kit/index.ts") } },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
  // vite-plugin-svelte 7 + rolldown 1.2 break `vite dev` while pre-bundling svelte for SSR (ticket 09's finding).
  environments: { ssr: { optimizeDeps: { exclude: ["svelte"], noDiscovery: true } } },
});
