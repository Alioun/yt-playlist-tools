// THROWAWAY PROTOTYPE (ticket 09, where things live). Not production code.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: { $lib: path.resolve("./src/lib") },
  },
  // Client-only app. vite-plugin-svelte 7 pre-bundles svelte for the dev server's SSR environment, and with
  // rolldown 1.2 that fails ("Could not resolve 'node:module'"), which stops `bun run dev`. Nothing here renders
  // on the server, so skip it.
  // One page holding every surface; size doesn't matter for a throwaway prototype.
  build: { chunkSizeWarningLimit: 1500 },
  environments: {
    ssr: { optimizeDeps: { exclude: ["svelte"], noDiscovery: true } },
  },
});
