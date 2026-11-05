import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

test("kit-free runtime import closure contains no Svelte Bits UI or kit", () => {
  const seen = new Set<string>()
  function visit(path: string) {
    if (seen.has(path)) return
    seen.add(path)
    const source = readFileSync(path, "utf8")
    for (const match of source.matchAll(/(?:import|export)\s+(?!type\b)(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g)) {
      const specifier = match[1]
      if (!specifier) throw Error("Missing import capture")
      expect(specifier === "svelte" || specifier.startsWith("svelte/") || specifier === "bits-ui" || specifier.includes("/kit/")).toBe(false)
      if (specifier.startsWith(".")) visit(resolve(dirname(path), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`))
    }
  }
  visit(resolve("src/site/core/notice/plain.ts"))
  visit(resolve("src/site/core/notice/index.ts"))
  expect(seen.has(resolve("src/site/core/notice/host.ts"))).toBe(true)
})
