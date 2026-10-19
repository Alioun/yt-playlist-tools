// THROWAWAY PROTOTYPE (ticket 14). Builds the rough dev extension into dist-ext/ the way ticket 17 shapes production:
// every page file is its own IIFE (WXT's unlisted-script wrapper would add ~253 B each); features link to the kit's
// Svelte and $kit through globals; the kit is built last and exports only the Svelte names the features used;
// popovers.js carries its own Svelte and Bits UI. Then it prints gzip sizes against ticket 17's rebalanced budgets.
// Usage: bun scripts/build-ext.ts [--full]   (--full: export the whole Svelte namespace, as dev builds would)
import { build, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { recordSvelteNames, svelteExports, isLinked, globalFor, used } from "../build/page-link";

const root = path.resolve(import.meta.dir, "..");
const out = path.join(root, "dist-ext");
const full = process.argv.includes("--full");

/** Where each file's minified bytes come from, grouped (Rolldown's renderedLength), like ticket 24's method. */
const shares: Record<string, Record<string, number>> = {};
function measure(name: string): Plugin {
  const group = (id: string) =>
    id.includes("node_modules/svelte/")
      ? "svelte runtime"
      : id.includes("node_modules/bits-ui") || id.includes("node_modules/svelte-toolbelt") || id.includes("node_modules/runed")
        ? "bits-ui + helpers"
        : id.includes("node_modules/@floating-ui")
          ? "floating-ui"
          : id.includes("node_modules/")
            ? "other deps"
            : id.includes("/site/proto/")
              ? "prototype stand-ins (view, fake flows, dev hooks)"
              : id.includes("/site/kit/")
                ? "kit (host, toaster, overlay, components, skin, icons)"
                : "our code";
  return {
    name: "pp-measure",
    generateBundle(_o, bundle) {
      const acc: Record<string, number> = {};
      for (const chunk of Object.values(bundle))
        if (chunk.type === "chunk") for (const [id, m] of Object.entries(chunk.modules)) acc[group(id)] = (acc[group(id)] ?? 0) + m.renderedLength;
      shares[name] = acc;
    },
  };
}

async function one(entry: string, name: string, opts: { linked?: boolean; plugins?: Plugin[] } = {}) {
  await build({
    configFile: false,
    root,
    logLevel: "error",
    plugins: [svelte({ emitCss: false, compilerOptions: { css: "injected", discloseVersion: false } }), measure(name), ...(opts.plugins ?? [])],
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      sourcemap: false,
      lib: { entry: path.join(root, entry), formats: ["iife"], name: `__pp_${name.replace(/[^\w]/g, "_")}`, fileName: () => `${name}.js` },
      rolldownOptions: opts.linked ? { external: (id: string) => isLinked(id), output: { globals: globalFor } } : {},
    },
  } as any);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Plain files: the gateway, the core and the background have no Svelte.
await one("src/entrypoints/page-www.ts", "page-www");
await one("src/entrypoints/core-www.ts", "core-www");
await one("src/entrypoints/background.ts", "background");
// 2. Linked features, recording the Svelte names they use.
const features = ["feature-shortcuts-www", "feature-quick-save", "feature-queue-button", "feature-watch-button", "feature-card-menu"];
for (const f of features) await one(`src/entrypoints/${f}.ts`, f, { linked: true, plugins: [recordSvelteNames()] });
// 3. The kit, last: the runtime with exactly those names (and whatever its own components need).
await one("src/entrypoints/kit-www.ts", "kit-www", { plugins: [svelteExports(full ? "full" : "used")] });
// 4. The lazy popovers: own Svelte, Bits UI.
await one("src/entrypoints/popovers.ts", "popovers");

copyFileSync(path.join(root, "ext/manifest.json"), path.join(out, "manifest.json"));

// Sizes against ticket 17 §5.1 (KB gzip, level 9).
const budget: Record<string, number> = {
  "page-www": 5,
  "core-www": 8,
  "kit-www": 18,
  "feature-shortcuts-www": 1,
  "feature-quick-save": 3,
  "feature-queue-button": 3,
  "feature-watch-button": 5,
  "feature-card-menu": 2,
  popovers: 50,
};
const rows: string[] = [];
let eager = 0;
for (const [name, b] of Object.entries(budget)) {
  const file = path.join(out, `${name}.js`);
  if (!existsSync(file)) continue;
  const buf = readFileSync(file);
  const gz = gzipSync(buf, { level: 9 }).length / 1024;
  if (name !== "popovers") eager += gz;
  rows.push(`${name.padEnd(24)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB min ${gz.toFixed(2).padStart(7)} KB gz   budget ${b} ${gz > b ? "OVER" : "ok"}`);
}
rows.push(`${"eager total (YouTube)".padEnd(24)} ${"".padStart(15)} ${eager.toFixed(2).padStart(7)} KB gz   budget 49 (with auto-add's 4) ${eager > 45 ? "OVER" : "ok"}`);
rows.push(`svelte names linked: ${used.client.size} from svelte/internal/client, ${used.index.size} from svelte${full ? " (full namespace exported)" : ""}`);
for (const name of ["kit-www", "popovers"]) {
  const s = shares[name];
  if (!s) continue;
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  rows.push(`${name} by source (share of minified bytes, before gzip):`);
  for (const [g, n] of Object.entries(s).sort((a, b) => b[1] - a[1])) rows.push(`  ${g.padEnd(56)} ${((100 * n) / total).toFixed(0).padStart(3)} %`);
}
const report = rows.join("\n");
console.log(report);
writeFileSync(path.join(out, "sizes.txt"), report + "\n");
