import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { compile } from "svelte/compiler"

const root = join(import.meta.dir, "../../src")

test("every Svelte component under src compiles without a warning", async () => {
  const files = (await readdir(root, { recursive: true })).filter(file => file.endsWith(".svelte")).sort()
  expect(files.length).toBeGreaterThan(0)
  const warnings: string[] = []
  for (const file of files) {
    const path = join(root, file)
    const { warnings: found } = compile(await Bun.file(path).text(), { filename: path, generate: "client", runes: true })
    for (const warning of found) warnings.push(`${file}:${warning.start?.line ?? 0} ${warning.code}`)
  }
  expect(warnings).toEqual([])
})
