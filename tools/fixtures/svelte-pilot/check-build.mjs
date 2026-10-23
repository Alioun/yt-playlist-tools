import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"

const fixtureRoot = new URL("./.output/", import.meta.url)
const productionRoot = new URL("../../../.output/", import.meta.url)
for (const target of ["chrome-mv3", "firefox-mv3"]) {
  const fixture = new URL(`${target}/`, fixtureRoot)
  const manifest = JSON.parse(await readFile(new URL("manifest.json", fixture), "utf8"))
  assert.equal(manifest.name, "Svelte build pilot")
  assert.equal(manifest.version, "0.0.0")
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.web_accessible_resources, undefined)
  const files = await readdir(fixture, { recursive: true })
  assert(files.includes("pilot.html"))
  assert(!files.some((file) => file.endsWith(".css")), "shadow styles must be injected")
  const chunks = files.filter((file) => file.endsWith(".js"))
  assert(chunks.length > 0)
  const code = (await Promise.all(chunks.map((file) => readFile(new URL(file, fixture), "utf8")))).join("\n")
  assert(code.includes("Svelte pilot popover"), "missing compiled Bits UI fixture")
  assert(code.includes("rgb(20, 80, 140)"), "missing injected component styles")
  const production = new URL(`${target}/`, productionRoot)
  for (const file of await readdir(production, { recursive: true })) {
    assert(!/pilot|svelte/i.test(file), `fixture artifact leaked into production: ${file}`)
    if (/\.(html|js|css|json)$/.test(file)) {
      const contents = await readFile(new URL(file, production), "utf8")
      assert(!contents.includes("Svelte pilot popover") && !contents.includes("Svelte build pilot"), `fixture code leaked into production: ${file}`)
    }
  }
  console.log(`${target}: fixture has injected styles and no manifest injection; production excludes the fixture`)
}
