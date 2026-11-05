import assert from "node:assert/strict"
import { readFile, readdir, stat } from "node:fs/promises"
import { createHash } from "node:crypto"

const root = new URL("../ui-foundation/.output/", import.meta.url)
for (const target of ["chrome-mv3", "firefox-mv3"]) {
  const directory = new URL(target + "/", root)
  const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"))
  assert.equal(manifest.name, "Perchling UI foundation fixture")
  assert.equal(manifest.manifest_version, 3)
  for (const key of ["permissions", "host_permissions", "optional_permissions", "content_scripts", "background", "web_accessible_resources"]) assert.equal(manifest[key], undefined)
  if (target === "chrome-mv3") assert.equal(manifest.minimum_chrome_version, "121")
  else assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "140.0")
  const names = await readdir(directory, { recursive: true })
  assert(names.includes("onboarding.html"))
  assert(names.some(name => name.endsWith(".svg")))
  const files = []
  for (const name of names)
    if ((await stat(new URL(name, directory))).isFile()) {
      const bytes = await readFile(new URL(name, directory))
      files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
    }
  const code = (await Promise.all(names.filter(name => name.endsWith(".js")).map(name => readFile(new URL(name, directory), "utf8")))).join("\n")
  const css = (await Promise.all(names.filter(name => name.endsWith(".css")).map(name => readFile(new URL(name, directory), "utf8")))).join("\n")
  assert(code.includes("What should Perchling do?"))
  assert(code.includes("https://alioun.github.io/yt-playlist-tools/privacy/"))
  assert(!/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*["']?https?:/.test(code))
  for (const token of ["--brand-wash", "--primary", "prefers-reduced-motion", ".dark"]) assert(css.includes(token))
  console.log(JSON.stringify({ target, fixtureChecksPassed: true, files, productionAssembly: "absent-and-held", productionLeakCheck: "unperformed" }))
}
