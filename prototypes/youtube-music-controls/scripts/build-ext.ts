// THROWAWAY PROTOTYPE (ticket 27). Builds the rough dev extension into dist/ext: each page script as its own IIFE
// (like ticket 17's unlisted scripts), Svelte CSS injected into our shadow roots (ticket 24: emitCss off), then
// prints each file's gzip size against ticket 24's YouTube Music budget.
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { gzipSync } from "node:zlib";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const out = path.join(root, "dist/ext");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const entries: [string, string][] = [
  ["background", "src/ext/background.ts"],
  ["page-music", "src/ext/page-music.ts"],
  ["core-music", "src/ext/core-music.ts"],
  ["kit-music", "src/ext/kit-music.svelte.ts"],
  ["feature-music-actions", "src/ext/feature-music-actions.ts"],
  ["popovers", "src/ext/popovers.svelte.ts"],
];

for (const [name, entry] of entries) {
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    plugins: [svelte({ emitCss: false, compilerOptions: { css: "injected" } })],
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      lib: { entry: path.join(root, entry), formats: ["iife"], name: `pp27_${name.replace(/-/g, "_")}`, fileName: () => `${name}.js` },
    },
  });
}
copyFileSync(path.join(root, "src/ext/manifest.json"), path.join(out, "manifest.json"));

const kb = (f: string) => gzipSync(readFileSync(path.join(out, f)), { level: 9 }).length / 1024;
const rows = entries.map(([n]) => [n, kb(`${n}.js`)] as const);
console.log("\nRough dev build, gzip level 9 (KB):");
for (const [n, s] of rows) console.log(`  ${n.padEnd(24)} ${s.toFixed(1)}`);
const eager = rows.filter(([n]) => ["page-music", "core-music", "kit-music", "feature-music-actions"].includes(n)).reduce((a, [, s]) => a + s, 0);
console.log(`  eager on music.youtube.com: ${eager.toFixed(1)} KB (ticket 24 budget: 43, PROVISIONAL)`);
console.log(`  lazy picker (popovers.js):  ${kb("popovers.js").toFixed(1)} KB (budget: 50)`);
