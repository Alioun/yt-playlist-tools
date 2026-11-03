import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { buildSite, GECKO_ID, parseReleases, type Release } from "../../scripts/build-site"

const root = resolve(import.meta.dir, "../..")
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function outDir() {
  const directory = mkdtempSync(join(tmpdir(), "site-"))
  directories.push(directory)
  return join(directory, "_site")
}

const asset = (tag: string, name: string) => ({ name, browser_download_url: `https://github.com/Alioun/yt-playlist-tools/releases/download/${tag}/${name}` })
const apiRelease = (tag: string, prerelease: boolean, published: string, assets: { name: string; browser_download_url: string }[] = []) => ({
  tag_name: tag,
  draft: false,
  prerelease,
  published_at: published,
  assets
})

function build(releases: Release[]) {
  const out = outDir()
  const hashes = new Map(releases.flatMap(release => (release.xpi ? [[release.xpi.url, `hash-of-${release.version}`] as const] : [])))
  buildSite({ root, out, releases, hashes })
  const read = (path: string) => readFileSync(join(out, path), "utf8")
  return { out, read, updates: JSON.parse(read("beta/updates.json")) }
}

const during = parseReleases([
  apiRelease("v1.99.2", true, "2026-12-09T10:00:00Z", [asset("v1.99.2", "perchling-1.99.2.xpi"), asset("v1.99.2", "perchling-1.99.2-chrome.zip")]),
  apiRelease("v1.99.1", true, "2026-12-01T10:00:00Z", [asset("v1.99.1", "perchling-1.99.1.xpi")]),
  { ...apiRelease("v1.99.3", true, "2026-12-15T10:00:00Z"), draft: true },
  apiRelease("archive/token-broker", false, "2026-10-01T10:00:00Z")
])

test("before the first beta, the site has the policy, no beta notice and an empty update list", () => {
  const { out, read, updates } = build([])
  for (const page of ["index.html", "privacy/index.html", "beta/index.html", "style.css", "assets/icon.svg", "assets/lockup-on-light.svg", "assets/lockup-on-dark.svg"]) {
    expect(existsSync(join(out, page))).toBe(true)
  }
  expect(updates).toEqual({ addons: { [GECKO_ID]: { updates: [] } } })
  expect(read("index.html")).not.toContain("is in beta")
  expect(read("beta/index.html")).toContain("No beta build is out yet.")
  expect(read("privacy/index.html")).toContain("Effective with the release of version 1.99.1.")
})

test("during the beta, testers get every signed beta in version order, with HTTPS links and hashes", () => {
  const { updates } = build(during)
  expect(updates.addons[GECKO_ID].updates).toEqual([
    {
      version: "1.99.1",
      update_link: "https://github.com/Alioun/yt-playlist-tools/releases/download/v1.99.1/perchling-1.99.1.xpi",
      update_hash: "sha256:hash-of-1.99.1",
      applications: { gecko: { strict_min_version: "140.0" } }
    },
    {
      version: "1.99.2",
      update_link: "https://github.com/Alioun/yt-playlist-tools/releases/download/v1.99.2/perchling-1.99.2.xpi",
      update_hash: "sha256:hash-of-1.99.2",
      applications: { gecko: { strict_min_version: "140.0" } }
    }
  ])
})

test("during the beta, the home page invites testers and the beta page links the newest build", () => {
  const { read } = build(during)
  expect(read("index.html")).toContain("Perchling 2.0 is in beta.")
  const beta = read("beta/index.html")
  expect(beta).toContain(`href="https://github.com/Alioun/yt-playlist-tools/releases/download/v1.99.2/perchling-1.99.2.xpi">Download Perchling 1.99.2 for Firefox`)
  expect(beta).not.toContain("No beta build is out yet.")
  expect(read("privacy/index.html")).toContain("Effective 1 December 2026.")
})

test("at launch, the AMO-signed 2.0.0 is the last entry, so testers move to the listed version", () => {
  const launched = parseReleases([
    apiRelease("v1.99.1", true, "2026-12-01T10:00:00Z", [asset("v1.99.1", "perchling-1.99.1.xpi")]),
    apiRelease("v1.99.2", true, "2026-12-09T10:00:00Z", [asset("v1.99.2", "perchling-1.99.2.xpi")]),
    apiRelease("v2.0.0", false, "2027-01-05T10:00:00Z", [asset("v2.0.0", "perchling_for_youtube-2.0.0.xpi")])
  ])
  const { read, updates } = build(launched)
  expect(updates.addons[GECKO_ID].updates.map((entry: { version: string }) => entry.version)).toEqual(["1.99.1", "1.99.2", "2.0.0"])
  expect(read("index.html")).not.toContain("is in beta")
})

test("a stable release without an attached .xpi adds no hand-off entry", () => {
  const { updates } = build(parseReleases([apiRelease("v1.99.1", true, "2026-12-01T10:00:00Z", [asset("v1.99.1", "a.xpi")]), apiRelease("v2.0.0", false, "2027-01-05T10:00:00Z")]))
  expect(updates.addons[GECKO_ID].updates.map((entry: { version: string }) => entry.version)).toEqual(["1.99.1"])
})

test("a release with two .xpi files fails the build rather than guessing", () => {
  expect(() => parseReleases([apiRelease("v1.99.1", true, "2026-12-01T10:00:00Z", [asset("v1.99.1", "a.xpi"), asset("v1.99.1", "b.xpi")])])).toThrow("v1.99.1 has 2 .xpi files")
})

test("versions sort by number, not as text", () => {
  const releases = parseReleases([apiRelease("v1.99.10", true, "2026-12-20T10:00:00Z", [asset("v1.99.10", "c.xpi")]), apiRelease("v1.99.9", true, "2026-12-19T10:00:00Z", [asset("v1.99.9", "b.xpi")])])
  expect(releases.map(release => release.version)).toEqual(["1.99.9", "1.99.10"])
})

test("the site is static: no scripts, no third-party fonts or styles, nothing left to fill", () => {
  const { out, read } = build(during)
  const pages = readdirSync(out, { recursive: true, encoding: "utf8" }).filter(path => path.endsWith(".html"))
  expect(pages.sort()).toEqual(["beta/index.html", "index.html", "privacy/index.html"])
  for (const page of pages) {
    const html = read(page)
    expect(html).not.toMatch(/<script|<iframe/i)
    expect(html).not.toMatch(/<link[^>]+href="https?:/i)
    expect(html).not.toMatch(/<img[^>]+src="https?:/i)
    expect(html).not.toContain("{{")
    expect(html).toContain("Not affiliated with or endorsed by YouTube or Google. YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.")
  }
  expect(read("style.css")).not.toMatch(/@import|url\(/)
})

test("the home page links the privacy policy, one click from the homepage as Chrome requires", () => {
  const { read } = build([])
  expect(read("index.html")).toContain(`<a href="privacy/">privacy policy</a>`)
  expect(read("privacy/index.html")).toContain("The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.")
})

test("the command line builds an offline site", () => {
  const out = outDir()
  const ran = spawnSync(process.execPath, ["scripts/build-site.ts", "--out", out, "--offline"], { cwd: root, encoding: "utf8" })
  expect(ran.status).toBe(0)
  expect(ran.stdout).toContain("0 update(s) in beta/updates.json")
  expect(existsSync(join(out, "privacy/index.html"))).toBe(true)
})
