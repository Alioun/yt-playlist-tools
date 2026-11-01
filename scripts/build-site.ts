/**
 * Builds the GitHub Pages site from site/ into one folder that pages.yml
 * deploys (REL-STORE-12, REL-CI-43 to REL-CI-45). It copies site/ and the brand
 * images, then fills in what only the GitHub releases know:
 * - beta/updates.json, with every pre-release's signed .xpi and, as the
 *   hand-off, the newest release's AMO-signed .xpi (REL-CI-12, REL-CI-14);
 * - the /beta/ page's download link, from the newest pre-release;
 * - the home page's beta notice, kept only while a beta is the newest release;
 * - the privacy policy's effective date, the day v1.99.1 was published.
 *
 * Usage: bun scripts/build-site.ts --out DIR [--offline]
 *   Reads GITHUB_REPOSITORY (default Alioun/yt-playlist-tools) and, if set,
 *   GITHUB_TOKEN. --offline builds as if there were no releases yet.
 */
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"

export const GECKO_ID = "{cc70cd21-2cc6-444b-bd89-496909346091}"
export const FIREFOX_FLOOR = "140.0"
const FIRST_BETA = "1.99.1"

export type Release = {
  version: string
  prerelease: boolean
  publishedAt: string
  xpi?: { name: string; url: string }
}

export type UpdateEntry = {
  version: string
  update_link: string
  update_hash: string
  applications: { gecko: { strict_min_version: string } }
}

export type UpdatesManifest = { addons: Record<string, { updates: UpdateEntry[] }> }

type ApiRelease = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  assets: { name: string; browser_download_url: string }[]
}

function parts(version: string): number[] {
  return version.split(".").map(Number)
}

export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Published releases tagged vN.N.N, oldest first. A release may carry one .xpi. */
export function parseReleases(api: readonly ApiRelease[]): Release[] {
  const releases: Release[] = []
  for (const release of api) {
    const version = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1]
    if (!version || release.draft || !release.published_at) continue
    const xpis = release.assets.filter(asset => asset.name.endsWith(".xpi"))
    if (xpis.length > 1) throw Error(`${release.tag_name} has ${xpis.length} .xpi files; updates.json needs exactly one`)
    const xpi = xpis[0]
    releases.push({
      version,
      prerelease: release.prerelease,
      publishedAt: release.published_at,
      ...(xpi && { xpi: { name: xpi.name, url: xpi.browser_download_url } })
    })
  }
  return releases.sort((a, b) => compareVersions(a.version, b.version))
}

/** The releases updates.json serves: every pre-release .xpi, then the newest release's .xpi as the hand-off. */
export function servedReleases(releases: readonly Release[]): Release[] {
  const betas = releases.filter(release => release.prerelease && release.xpi)
  const handOff = releases.filter(release => !release.prerelease && release.xpi).at(-1)
  return handOff ? [...betas, handOff].sort((a, b) => compareVersions(a.version, b.version)) : betas
}

export function updatesManifest(served: readonly Release[], hashes: ReadonlyMap<string, string>): UpdatesManifest {
  const updates = served.map(release => {
    const link = release.xpi!.url
    const hash = hashes.get(link)
    if (!hash) throw Error(`no sha256 for ${link}`)
    if (!link.startsWith("https://")) throw Error(`${link} isn't HTTPS, which Firefox requires`)
    return {
      version: release.version,
      update_link: link,
      update_hash: `sha256:${hash}`,
      applications: { gecko: { strict_min_version: FIREFOX_FLOOR } }
    }
  })
  return { addons: { [GECKO_ID]: { updates } } }
}

export function newestBeta(releases: readonly Release[]): Release | undefined {
  return releases.filter(release => release.prerelease && release.xpi).at(-1)
}

/** A beta runs while the newest release is a pre-release. */
export function betaRunning(releases: readonly Release[]): boolean {
  return releases.at(-1)?.prerelease === true
}

function effectiveDate(releases: readonly Release[]): string {
  const first = releases.find(release => release.version === FIRST_BETA)
  if (!first) return `with the release of version ${FIRST_BETA}`
  return new Date(first.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function replaceBlock(html: string, name: string, content: string): string {
  const block = new RegExp(`[ \\t]*<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->\\n?`)
  if (!block.test(html)) throw Error(`no ${name} block`)
  return html.replace(block, content)
}

/** Fills one page of site/ for the given releases. */
export function renderPage(path: string, html: string, releases: readonly Release[]): string {
  let page = html
  if (path === "index.html" && !betaRunning(releases)) page = replaceBlock(page, "beta", "")
  if (path === "beta/index.html") {
    const beta = newestBeta(releases)
    if (beta) {
      const link = `    <p><a class="button" href="${escapeHtml(beta.xpi!.url)}">Download Perchling ${beta.version} for Firefox</a></p>\n`
      page = replaceBlock(page, "download", link)
    }
  }
  page = page.replaceAll("{{effective}}", escapeHtml(effectiveDate(releases)))
  const left = /\{\{[^}]*\}\}/.exec(page)
  if (left) throw Error(`${path} still has ${left[0]}`)
  return page
}

export type BuildSiteOptions = {
  root: string
  out: string
  releases: readonly Release[]
  hashes: ReadonlyMap<string, string>
}

export function buildSite({ root, out, releases, hashes }: BuildSiteOptions): void {
  rmSync(out, { recursive: true, force: true })
  cpSync(join(root, "site"), out, { recursive: true })
  mkdirSync(join(out, "assets"), { recursive: true })
  cpSync(join(root, "assets/icon/icon.svg"), join(out, "assets/icon.svg"))
  for (const name of ["lockup-on-light.svg", "lockup-on-dark.svg"]) cpSync(join(root, "assets/brand", name), join(out, "assets", name))

  for (const path of readdirSync(out, { recursive: true, encoding: "utf8" }).filter(path => path.endsWith(".html"))) {
    const file = join(out, path)
    writeFileSync(file, renderPage(path.split("\\").join("/"), readFileSync(file, "utf8"), releases))
  }

  mkdirSync(join(out, "beta"), { recursive: true })
  writeFileSync(join(out, "beta/updates.json"), JSON.stringify(updatesManifest(servedReleases(releases), hashes), null, 2) + "\n")
}

async function fetchReleases(repo: string, token: string | undefined): Promise<ApiRelease[]> {
  const all: ApiRelease[] = []
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, {
      headers: { accept: "application/vnd.github+json", ...(token && { authorization: `Bearer ${token}` }) }
    })
    if (!response.ok) throw Error(`GitHub releases: HTTP ${response.status}`)
    const batch = await response.json() as ApiRelease[]
    all.push(...batch)
    if (batch.length < 100) return all
  }
}

async function sha256Of(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`)
  return createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex")
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { out: { type: "string" }, offline: { type: "boolean", default: false } } })
  if (!values.out) {
    console.error("usage: build-site.ts --out DIR [--offline]")
    return 2
  }
  const repo = process.env.GITHUB_REPOSITORY || "Alioun/yt-playlist-tools"
  const releases = values.offline ? [] : parseReleases(await fetchReleases(repo, process.env.GITHUB_TOKEN))
  const hashes = new Map<string, string>()
  for (const release of servedReleases(releases)) hashes.set(release.xpi!.url, await sha256Of(release.xpi!.url))

  const out = resolve(values.out)
  buildSite({ root: process.cwd(), out, releases, hashes })
  const beta = newestBeta(releases)
  console.log(`Built ${out}: ${hashes.size} update(s) in beta/updates.json; newest beta ${beta?.version ?? "none"}; beta notice ${betaRunning(releases) ? "shown" : "hidden"}.`)
  return 0
}

if (import.meta.main) process.exit(await main())
