import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

if (process.argv.length !== 2) throw Error("check-source.mjs accepts no arguments")
assert.equal(process.versions.node.split(".")[0], "24", "Run check-source.mjs with Node 24")
const root = fileURLToPath(new URL("./", import.meta.url))
const repository = resolve(root, "../../../..")
const output = resolve(root, ".output")
const extracted = resolve(output, "source-rebuild")
await mkdir(output, { recursive: true })
const commands = []
async function run(name, command, args, cwd = repository) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
  await writeFile(resolve(output, `${name}.log`), `${result.stdout ?? ""}${result.stderr ?? ""}`)
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${name} failed; read .output/${name}.log`)
  commands.push({ command, args, cwd, status: result.status })
  return result.stdout
}
const wxt = resolve(repository, "node_modules/wxt/bin/wxt.mjs")
await run("source-zip", process.execPath, [wxt, "zip", "-b", "firefox"])
const { name, version } = JSON.parse(await readFile(resolve(repository, "package.json"), "utf8"))
const archive = resolve(repository, `.output/${name}-${version}-sources.zip`)
const entries = (await run("source-entries", "unzip", ["-Z1", archive])).trim().split("\n")
assert(entries.includes("build/page-link.ts"))
assert(!entries.some((entry) => /(^|\/)tools\/fixtures\/svelte-pilot(\/|$)/.test(entry)))
await rm(extracted, { recursive: true, force: true })
await mkdir(extracted, { recursive: true })
await run("source-extract", "unzip", ["-q", archive, "-d", extracted])
const hash = (value) => createHash("sha256").update(value).digest("hex")
const linkerHash = hash(await readFile(resolve(repository, "build/page-link.ts")))
assert.equal(hash(await readFile(resolve(extracted, "build/page-link.ts"))), linkerHash)
await run("source-install", "bun", ["install", "--frozen-lockfile", "--ignore-scripts"], extracted)
const extractedWxt = resolve(extracted, "node_modules/wxt/bin/wxt.mjs")
await run("source-prepare", process.execPath, [extractedWxt, "prepare"], extracted)
await run("source-chrome", process.execPath, [extractedWxt, "build"], extracted)
await run("source-firefox", process.execPath, [extractedWxt, "build", "-b", "firefox"], extracted)
await writeFile(resolve(output, "source-rebuild.json"), JSON.stringify({ node: process.version, archive, entries: entries.length, linkerHash, fixtureExcluded: true, commands }, null, 2))
console.log("Fresh source ZIP contains the exact linker and excludes the nested fixture. Extracted production Chrome and Firefox builds passed on Node 24.")
