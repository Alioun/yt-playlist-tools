import { readFile } from "node:fs/promises"
import { dirname, join, normalize } from "node:path"

// Follows static value imports and re-exports. A statement made only of `import type` or `export type` is erased.
// Mixed and all-`type` named lists stay edges, which over-approximates the bundle. A dynamic import is reported as a package.
const fromClause = /^(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/gm
const bare = /^import\s*["']([^"']+)["']/gm
const dynamic = /\bimport\s*\(/

async function source(path: string): Promise<{ path: string; text: string } | undefined> {
  for (const candidate of path.endsWith(".ts") ? [path] : [`${path}.ts`, join(path, "index.ts")]) {
    try { return { path: candidate, text: await readFile(candidate, "utf8") } } catch { /* Try the next resolution. */ }
  }
  return undefined
}

export async function reachableModules(entry: string): Promise<{ files: string[]; packages: string[] }> {
  const files = new Set<string>()
  const packages = new Set<string>()
  const pending = [normalize(entry)]
  while (pending.length > 0) {
    const next = pending.pop()
    if (next === undefined || files.has(next)) continue
    const loaded = await source(next)
    if (!loaded) { packages.add(`unresolved:${next}`); continue }
    if (files.has(loaded.path)) continue
    files.add(loaded.path)
    if (dynamic.test(loaded.text)) packages.add(`dynamic:${loaded.path}`)
    const specifiers = [
      ...[...loaded.text.matchAll(fromClause)].filter(match => match[2] === undefined).map(match => match[4] ?? ""),
      ...[...loaded.text.matchAll(bare)].map(match => match[1] ?? "")
    ]
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) pending.push(normalize(join(dirname(loaded.path), specifier)))
      else packages.add(specifier)
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() }
}
