// THROWAWAY PROTOTYPE (ticket 15, popup and settings). Not production code.
//
// Four pages, built like the extension's own pages so their weight is real:
//   popup.html     the toolbar popup (ticket 24: 40 KB JS + 8 KB CSS up front, the rest lazy)
//   settings.html  the settings page (60 KB + 10 KB up front, PROVISIONAL; Diagnostics lazy)
//   onboarding.html first run and the 1.4.5 upgrade note (its own page, ticket 17)
//   index.html     the prototype's harness: scenarios, theme, variants, and the pages side by side in frames
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Each page is built on its own (`PAGE=popup vite build`, see package.json), as ticket 24 measured them: in one
// multi-page build the pages share chunks, so the popup would load Svelte runtime code only settings uses, split
// into dozens of small files (measured: +10 KB gzip on the popup's first view). Ticket 17's WXT build should do
// the same, or give the popup its own build.
const pages = {
  popup: path.resolve("popup.html"),
  settings: path.resolve("settings.html"),
  onboarding: path.resolve("onboarding.html"),
  index: path.resolve("index.html"),
};
const page = process.env.PAGE as keyof typeof pages | undefined;

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: { $lib: path.resolve("./src/ui/lib"), $ui: path.resolve("./src/ui"), $shared: path.resolve("./src/shared") },
  },
  build: {
    target: "es2022",
    // Extension pages load from the package: no preload polyfill, and nothing lazy is preloaded (ticket 24).
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: page ? { [page]: pages[page] } : pages,
      // Everything the first view needs, in one file. By default rolldown splits each module the entry shares with a
      // lazy part into its own small chunk (23 files for the popup, ~5 KB gzip lost to per-file overhead).
      // The fake Backend gets its own file, so the size check can count it as the product's browser adapter instead.
      // It takes its dependencies with it (the default), so it never imports back from first-view: with
      // includeDependenciesRecursively: false the two chunks formed a cycle, the HTML ran fake first, and pages
      // rendered blank ("n is not a function"). Check that pages render, not just their size.
      output: {
        codeSplitting: {
          groups: [
            { name: "fake", test: /src[\\/]ui[\\/](backend[\\/](fake|fake[\\/]seed)\.ts|lib[\\/]params\.ts)$/, priority: 2 },
            { name: "first-view", tags: ["$initial"], priority: 1 },
          ],
        },
      },
    },
  },
  // Client-only app. vite-plugin-svelte 7 pre-bundles svelte for the dev server's SSR environment, and with
  // rolldown 1.2 that fails ("Could not resolve 'node:module'"), which stops `bun run dev` (ticket 09's stack bug).
  environments: {
    ssr: { optimizeDeps: { exclude: ["svelte"], noDiscovery: true } },
  },
});
