import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Production is built with Svelte too, so the pilot is told apart by its own name and the text it compiles to.
export const pilotName = /pilot/i
export const pilotMarkers = ["Svelte pilot popover", "Svelte build pilot"]

assert(process.argv.length <= 3, "usage: node check-archives.mjs [output-directory]")
const output = resolve(process.argv[2] ?? fileURLToPath(new URL("../../../.output/", import.meta.url)))
const files = await readdir(output)
const sources = files.filter(file => file.endsWith("-sources.zip"))
const runtime = files.filter(file => file.endsWith("-firefox.zip"))
assert(sources.length > 0, `missing sources ZIP in ${output}; run bun run zip:firefox first`)
assert(runtime.length > 0, `missing Firefox runtime ZIP in ${output}; run bun run zip:firefox first`)

for (const archive of [...sources, ...runtime]) {
  const path = resolve(output, archive)
  const entries = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).trim().split("\n")
  assert(entries.length > 0 && entries[0] !== "", `empty archive: ${archive}`)
  for (const entry of entries) {
    assert(!/(^|\/)tools\/fixtures\/svelte-pilot(?:\/|$)/.test(entry), `fixture leaked into ${archive}: ${entry}`)
    if (!runtime.includes(archive)) continue
    assert(!pilotName.test(entry), `fixture artifact leaked into ${archive}: ${entry}`)
    if (/\.(html|js|css|json)$/.test(entry)) {
      const contents = execFileSync("unzip", ["-p", path, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      assert(!pilotMarkers.some(marker => contents.includes(marker)), `fixture code leaked into ${archive}: ${entry}`)
    }
  }
  console.log(`${archive}: ${entries.length} entries; no pilot fixture`)
}
