// THROWAWAY PROTOTYPE (ticket 15). Ticket 24's size check, in miniature: for each page, follow the HTML's scripts,
// modulepreloads and stylesheets, then each chunk's static imports, and sum gzip -9 bytes. Lazy chunks (dynamic
// imports) are listed with what each adds on first use.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const dist = process.env.DIST ? resolve(process.env.DIST) : resolve(import.meta.dir, "..", "dist");
const gz = (p: string) => Bun.gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (n: number) => (n / 1024).toFixed(1);

const staticRe = /(?:\bimport|\bexport)\s*(?:[\w$*{}\s,]*?from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g;
const dynamicRe = /\bimport\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g;

function closure(start: string[], seen = new Set<string>()): Set<string> {
  const stack = [...start];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8").replace(dynamicRe, "");
    for (const m of src.matchAll(staticRe)) stack.push(resolve(dirname(f), m[1]));
  }
  return seen;
}

function dynamicTargets(files: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(dynamicRe)) out.add(resolve(dirname(f), m[1]));
  }
  return out;
}

/** The prototype's stand-ins for the product's Backend: the fake adapter and its scenario seeds. The product's
 *  browser adapter replaces them; ADAPTER_ALLOWANCE is our estimate of its size (load, watch, change, a call stub). */
const isStandIn = (f: string) => /\/(fake|seed|params)-[^/]+\.js$/.test(f);
const ADAPTER_ALLOWANCE = 2 * 1024;

const budgets: Record<string, { js: number; css: number }> = {
  popup: { js: 40, css: 8 },
  settings: { js: 60, css: 10 },
};

const pages = readdirSync(dist).filter((f) => f.endsWith(".html") && f !== "index.html");
const lines: string[] = [];
let failed = false;
for (const page of pages) {
  const html = readFileSync(join(dist, page), "utf8");
  const name = page.replace(".html", "");
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g), ...html.matchAll(/<link rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) =>
    join(dist, m[1]),
  );
  const css = [...html.matchAll(/<link rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => join(dist, m[1]));
  const shell = closure(scripts);
  const cssBytes = css.reduce((a, f) => a + gz(f), 0);
  const b = budgets[name];
  // The popup loads the tab content for the site you're on before its first frame (Popup.svelte), so its first view
  // is the HTML's closure plus that tab's chunk, counted once per site.
  const firstViews: [string, Set<string>][] =
    name === "popup"
      ? (["YouTubeTab", "MusicTab"] as const).map((tab) => {
          const f = readdirSync(join(dist, "assets")).find((x) => x.startsWith(`${tab}-`) && x.endsWith(".js"));
          const label = tab === "YouTubeTab" ? "on YouTube" : "on YouTube Music";
          return [label, f ? closure([join(dist, "assets", f)], new Set(shell)) : shell] as [string, Set<string>];
        })
      : [["", shell]];
  for (const [label, initial] of firstViews) {
    const all = [...initial].reduce((a, f) => a + gz(f), 0);
    const standIn = [...initial].filter(isStandIn).reduce((a, f) => a + gz(f), 0);
    const js = all - standIn + (standIn ? ADAPTER_ALLOWANCE : 0);
    const over = b && (js / 1024 > b.js || cssBytes / 1024 > b.css);
    if (over) failed = true;
    const title = label ? `${name} ${label}` : name;
    lines.push(
      `${title.padEnd(26)} first view JS ${kb(js).padStart(5)} KB gzip   CSS ${kb(cssBytes).padStart(4)} KB${
        b ? `   budget ${b.js} + ${b.css} KB ${over ? "OVER" : "ok"}` : ""
      }`,
      standIn
        ? `${" ".repeat(26)} as built: ${kb(all)} KB in ${initial.size} files, of which ${kb(standIn)} KB is the fake Backend (counted as a ${kb(ADAPTER_ALLOWANCE)} KB browser adapter)`
        : `${" ".repeat(26)} ${initial.size} files`,
    );
  }
  const initial = new Set(firstViews.flatMap(([, s]) => [...s]));
  // Lazy chunks: what each dynamic import adds on top of what's already loaded.
  const lazy = new Map<string, number>();
  const visit = (loaded: Set<string>, depth: number) => {
    for (const t of dynamicTargets(loaded)) {
      if (loaded.has(t) || lazy.has(t)) continue;
      const add = [...closure([t])].filter((f) => !loaded.has(f));
      lazy.set(t, add.reduce((a, f) => a + gz(f), 0));
      if (depth < 3) visit(new Set([...loaded, ...add]), depth + 1);
    }
  };
  visit(initial, 0);
  for (const [f, n] of [...lazy].sort((a, b) => b[1] - a[1]).slice(0, 14))
    lines.push(`              lazy ${f.replace(dist + "/", "").padEnd(44)} +${kb(n)} KB`);
}
console.log("\nPage weight (gzip -9), ticket 24's method\n" + lines.join("\n") + "\n");
if (failed) {
  console.error("A page is over its budget.");
  process.exitCode = 1;
}
