import assert from "node:assert/strict"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { parseSync } from "vite"

if (process.argv.length !== 2) throw Error("check-build.mjs accepts no arguments")
const sizes = {}
for (const browser of ["chrome", "firefox"]) {
  const root = new URL(`./.output/${browser}-mv3/`, import.meta.url)
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"))
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.web_accessible_resources, undefined)
  const files = await readdir(root, { recursive: true })
  assert(!files.some((file) => file.endsWith(".css")))
  const scripts = files.filter((file) => file.endsWith(".js"))
  sizes[browser] = {}
  for (const file of scripts) {
    const source = await readFile(new URL(file, root))
    sizes[browser][file] = { bytes: source.length, gzip9: gzipSync(source, { level: 9 }).length }
    if (!file.includes("/")) {
      const ast = parseSync(file, source.toString(), { sourceType: "script" })
      assert.equal(ast.errors.length, 0, `${file} is an independent script`)
    }
  }
  for (const name of ["feature-auto-add", "core-www", "core-music", "consumer-www", "consumer-music", "late-www", "late-music", "page-www", "page-music", "kit-www", "kit-music", "popovers"]) {
    assert(scripts.includes(`${name}.js`))
    const record = JSON.parse(await readFile(new URL(`./.output/evidence/${browser}-build/${name}.json`, import.meta.url), "utf8"))
    assert.equal(record.chunks.length, 1)
    assert.equal(record.chunks[0].file, `${name}.js`)
    assert.deepEqual(record.chunks[0].dynamicImports, [])
    const modules = record.chunks[0].modules
    if (!name.startsWith("kit-") && name !== "popovers") assert(!modules.some((id) => id.includes("/node_modules/svelte/")), `${name} bundles Svelte`)
    if (name !== "popovers") assert(!modules.some((id) => id.includes("/node_modules/bits-ui/")), `${name} eagerly bundles Bits UI`)
    if (/^(consumer|late|feature)-/.test(name)) assert(!modules.some((id) => id.includes("/src/site/kit/")), `${name} bundles kit implementation`)
    if (name === "feature-auto-add") {
      assert.deepEqual(record.bundle, { kind: "feature", site: "www" })
      assert(modules.some((id) => id.endsWith("/site/unsuffixed/Unsuffixed.svelte")))
      assert(record.names.client.includes("each"))
    }
    if (name.startsWith("kit-")) {
      assert(record.names.root.includes("onMount"))
      assert(record.names.client.includes("if"))
      assert(record.names.client.includes("state"))
      assert(record.contributions.some((id) => id.endsWith(".svelte")))
      assert(record.contributions.some((id) => id.endsWith(".svelte.ts")))
      assert(modules.some((id) => id.endsWith("/svelte/src/internal/disclose-version.js")))
      const firstKit = record.buildOrder.findIndex((entry) => entry.startsWith("kit-"))
      assert(record.buildOrder.filter((entry) => /^(consumer|late|feature)-/.test(entry)).every((entry) => record.buildOrder.indexOf(entry) < firstKit))
    }
    if (name === "popovers") {
      assert(modules.some((id) => id.includes("/node_modules/bits-ui/")))
      assert(modules.some((id) => id.includes("/node_modules/svelte/")))
    }
  }
}
await writeFile(new URL("./.output/sizes.json", import.meta.url), JSON.stringify(sizes, null, 2))
console.log("Both target manifests, independent scripts, collected component/rune imports, kit order, CSS and module provenance passed. Gzip9 fixture data saved to .output/sizes.json.")
