import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"

const fixtureRoot = new URL("./.output/", import.meta.url)
const productionRoot = new URL("../../../.output/", import.meta.url)
const marker = "What should Perchling do?"
for (const target of ["chrome-mv3", "firefox-mv3"]) {
  const fixture = new URL(`${target}/`, fixtureRoot)
  const manifest = JSON.parse(await readFile(new URL("manifest.json", fixture), "utf8"))
  assert.equal(manifest.name, "Perchling UI foundation fixture")
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.permissions, undefined, "the fixture adds no permissions")
  assert.equal(manifest.host_permissions, undefined, "the fixture adds no host access")
  assert.equal(manifest.optional_permissions, undefined)
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.background, undefined)
  assert.equal(manifest.web_accessible_resources, undefined)
  if (target === "chrome-mv3") assert.equal(manifest.minimum_chrome_version, "121")
  else assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "140.0")
  const files = await readdir(fixture, { recursive: true })
  assert(files.includes("onboarding.html"), "missing onboarding.html")
  assert(files.some((file) => file.endsWith(".svg")), "missing the packaged mark")
  const code = (await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => readFile(new URL(file, fixture), "utf8")))).join("\n")
  assert(code.includes(marker), "missing the compiled first-run page")
  assert(code.includes("https://alioun.github.io/yt-playlist-tools/privacy/"), "missing the policy link")
  assert(!/fonts\.googleapis|fonts\.gstatic|@import\s+url\(\s*["']?https?:/.test(code), "remote font or stylesheet in code")
  const css = (await Promise.all(files.filter((file) => file.endsWith(".css")).map((file) => readFile(new URL(file, fixture), "utf8")))).join("\n")
  for (const token of ["--brand-wash", "--primary", "prefers-reduced-motion", ".dark"]) assert(css.includes(token), `missing ${token} in the stylesheet`)
  const production = new URL(`${target}/`, productionRoot)
  for (const file of await readdir(production, { recursive: true })) {
    if (/\.(html|js|css|json)$/.test(file)) {
      const contents = await readFile(new URL(file, production), "utf8")
      assert(!contents.includes("Perchling UI foundation fixture") && !contents.includes("Synthetic Account"), `fixture leaked into production: ${file}`)
    }
  }
  console.log(`${target}: fixture page built with its stylesheet, no permissions, and nothing leaked into production`)
}
