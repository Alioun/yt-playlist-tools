import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { compile } from "svelte/compiler"

const files = []
function collect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`
    if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") collect(path)
    else if (item.isFile() && item.name.endsWith(".svelte")) files.push(path)
  }
}
collect("src")
collect("tools/fixtures")
if (files.length === 0) throw Error("No real Svelte compilation inputs")
const expected = JSON.parse(readFileSync(new URL("./svelte-inputs.json", import.meta.url), "utf8"))
if (JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(expected).sort())) throw Error("Incomplete Svelte compiler inclusion")
for (const file of files.sort()) {
  const source = readFileSync(file, "utf8")
  if (createHash("sha256").update(source).digest("hex") !== expected[file].sha256) throw Error(`Changed Svelte input ${file}`)
  const result = compile(source, { filename: resolve(file), generate: "client" })
  if (!result.js.code) throw Error(`Missing compiled Svelte output for ${file}`)
}
process.stdout.write(`${JSON.stringify({ kind: "real-svelte-compilation", count: files.length, files })}\n`)
