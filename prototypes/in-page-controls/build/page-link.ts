// THROWAWAY PROTOTYPE (ticket 14). A small version of ticket 17's build/page-link.ts: feature scripts mark svelte and
// $kit external and map them to globals the kit installs; a transform hook records which Svelte names they use, so the
// kit can export exactly those (production) instead of the whole namespace (development).
import type { Plugin } from "vite";

export const used = { client: new Set<string>(), index: new Set<string>() };

const SVELTE_FILE = /\.svelte(\.(ts|js))?($|\?)/;

export function recordSvelteNames(): Plugin {
  return {
    name: "pp-record-svelte-names",
    enforce: "post",
    transform(code, id) {
      if (!SVELTE_FILE.test(id)) return null;
      for (const m of code.matchAll(/\$\.([A-Za-z_$][\w$]*)/g)) used.client.add(m[1]);
      for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']svelte["']/g))
        for (const n of m[1].split(",")) if (n.trim()) used.index.add(n.trim().split(/\s+as\s+/)[0]);
      return null;
    },
  };
}

export const isLinked = (id: string) => id === "$kit" || id === "svelte" || id.startsWith("svelte/");

export function globalFor(id: string): string {
  if (id === "$kit") return "__pp.kit.lib";
  if (id === "svelte/internal/client") return "__pp.svelte.client";
  if (id === "svelte") return "__pp.svelte.index";
  throw new Error(`[page-link] ${id} isn't linked: a feature script may only import svelte, svelte/internal/client and $kit`);
}

/** The kit's virtual module: the Svelte names feature scripts use (production) or everything (development). */
export function svelteExports(mode: "used" | "full"): Plugin {
  const ID = "virtual:pp-svelte-exports";
  return {
    name: "pp-svelte-exports",
    resolveId: (id) => (id === ID ? "\0" + ID : null),
    load(id) {
      if (id !== "\0" + ID) return null;
      if (mode === "full")
        return `import * as client from "svelte/internal/client"; import * as index from "svelte"; export { client, index };`;
      // Some runtime names are reserved words (`$.if`), so pick them off the namespace with property access, which
      // Rolldown still tree-shakes.
      const c = [...used.client].sort();
      const i = [...used.index].sort();
      return [
        `import * as c from "svelte/internal/client";`,
        `import * as i from "svelte";`,
        `export const client = { ${c.map((n) => `${JSON.stringify(n)}: c.${n}`).join(", ")} };`,
        `export const index = { ${i.map((n) => `${JSON.stringify(n)}: i.${n}`).join(", ")} };`,
      ].join("\n");
    },
  };
}
