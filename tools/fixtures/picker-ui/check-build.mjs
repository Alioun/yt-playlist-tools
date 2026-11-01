import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"

for (const target of ["chrome-mv3", "firefox-mv3"]) {
  const root = new URL(`./.output/${target}/`, import.meta.url)
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"))
  assert.equal(manifest.name, "Perchling synthetic picker fixture")
  for (const field of ["permissions", "host_permissions", "optional_permissions", "content_scripts", "background", "web_accessible_resources"]) {
    assert.equal(manifest[field], undefined, `Synthetic fixture unexpectedly declares ${field}`)
  }
  const files = await readdir(root, { recursive: true })
  assert(files.includes("picker.html"))
  assert(files.some(file => file.endsWith(".svg")), "The packaged mark must be emitted")
  const css = (await Promise.all(files.filter(file => file.endsWith(".css")).map(file => readFile(new URL(file, root), "utf8")))).join("\n")
  for (const token of ["--primary", "--success", "--card", ".dark", "prefers-reduced-motion"]) assert(css.includes(token), `Missing accepted theme rule ${token}`)
  const code = (await Promise.all(files.filter(file => file.endsWith(".js")).map(file => readFile(new URL(file, root), "utf8")))).join("\n")
  assert(code.includes("Synthetic picker fixture"))
  assert(code.includes("Gather playlist"))
  assert(!/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*["']?https?:/.test(code))
  process.stdout.write(JSON.stringify({ target, fixtureOnly: true, files: files.length }) + "\n")
}
