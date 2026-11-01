import { readFileSync } from "node:fs"
import { basename, join } from "node:path"

export type ManifestBuild = { readonly browser: "chrome" | "firefox"; readonly beta: boolean }

const betaUpdateUrl = "https://alioun.github.io/yt-playlist-tools/beta/updates.json"

/** The exact manifest each build must ship (ARC-MAN-01, Q-CI-3, G21), written out independently of build/manifest.ts. */
export function expectedManifest(build: ManifestBuild, version: string): Record<string, unknown> {
  const firefox = build.browser === "firefox"
  return {
    manifest_version: 3,
    default_locale: "en",
    name: "__MSG_extName__",
    short_name: "__MSG_extShortName__",
    description: "__MSG_extDescription__",
    version,
    icons: firefox
      ? { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 96: "brand/icon-96.png", 128: "brand/icon-128.png" }
      : { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 128: "brand/store-128.png" },
    permissions: ["storage", "scripting"],
    host_permissions: ["https://www.youtube.com/*"],
    optional_host_permissions: ["https://music.youtube.com/*"],
    optional_permissions: ["contextMenus"],
    background: firefox ? { scripts: ["background.js"] } : { service_worker: "background.js" },
    action: {
      default_title: "__MSG_actionTitle__",
      default_icon: { 16: "brand/icon-16.png", 24: "brand/icon-24.png", 32: "brand/icon-32.png" },
      default_popup: "popup.html"
    },
    options_ui: { page: "options.html", open_in_tab: true },
    commands: {
      _execute_action: {},
      "save-playing-song": { description: "__MSG_command_savePlayingSong__" },
      "like-playing-song": { description: "__MSG_command_likePlayingSong__" },
      "watch-later-current-video": { description: "__MSG_command_watchLaterCurrentVideo__" }
    },
    ...(firefox
      ? { browser_specific_settings: { gecko: {
        id: "{cc70cd21-2cc6-444b-bd89-496909346091}",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
        ...(build.beta && { update_url: betaUpdateUrl })
      } } }
      : { minimum_chrome_version: "121" })
  }
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted((value as Record<string, unknown>)[key])]))
}

/** Every key whose value differs from the expectation, by top-level name. Empty means the manifest is exact. */
export function manifestDifferences(actual: Record<string, unknown>, expected: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()
  return keys.flatMap(key => {
    if (!(key in expected)) return [`unexpected ${key}`]
    if (!(key in actual)) return [`missing ${key}`]
    const want = JSON.stringify(sorted(expected[key]))
    const got = JSON.stringify(sorted(actual[key]))
    return want === got ? [] : [`${key} is ${got}, expected ${want}`]
  })
}

export function buildOf(directory: string): ManifestBuild {
  const name = basename(directory)
  const match = /^(chrome|firefox)-mv3(-beta)?$/.exec(name)
  if (!match) throw new Error(`Don't know how to check ${name}`)
  if (match[2] && match[1] !== "firefox") throw new Error(`Only Firefox has a beta build: ${name}`)
  return { browser: match[1] === "firefox" ? "firefox" : "chrome", beta: match[2] !== undefined }
}

export function checkManifests(directories: readonly string[], version: string, read = (path: string) => readFileSync(path, "utf8")): string[] {
  if (directories.length === 0) throw new Error("Usage: bun scripts/check-manifest.ts <output dir>...")
  return directories.flatMap(directory => {
    const build = buildOf(directory)
    const manifest: unknown = JSON.parse(read(join(directory, "manifest.json")))
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return [`${basename(directory)}: manifest is not an object`]
    return manifestDifferences(manifest as Record<string, unknown>, expectedManifest(build, version)).map(line => `${basename(directory)}: ${line}`)
  })
}

if (import.meta.main) {
  try {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
    const directories = process.argv.slice(2)
    const failures = checkManifests(directories, version)
    for (const failure of failures) console.error(`::error::${failure}`)
    if (failures.length) process.exit(1)
    console.log(`Manifests match: ${directories.map(directory => basename(directory)).join(", ")}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
