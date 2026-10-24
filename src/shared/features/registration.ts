import type { FeatureId, Site } from "../contracts/vocabulary"
import type { Settings } from "../model/types"

export type SettingsPath = {
  [K in keyof Settings]: Settings[K] extends { on: boolean } ? K : never
}[keyof Settings]

export type RegistrationPage = {
  readonly file?: string
  readonly matches?: readonly string[]
  readonly needs: readonly "kit"[]
  readonly lazy?: "popovers"
  readonly when?: (settings: Settings) => boolean
}
export type RegistrationFeature = {
  readonly id: FeatureId
  readonly setting: SettingsPath | "device.syncOn"
  readonly pages: Readonly<Partial<Record<Site, RegistrationPage>>>
}
export type PageBundle = { kind: "feature" | "kit"; site: Site } | { kind: "page" | "unrelated" }
export type EntryOwnership = Readonly<Record<string, PageBundle>>

export const siteBundles = {
  www: { match: "https://www.youtube.com/*", page: "page-www", core: "core-www", kit: "kit-www" },
  music: { match: "https://music.youtube.com/*", page: "page-music", core: "core-music", kit: "kit-music" }
} as const satisfies Record<Site, { match: string; page: string; core: string; kit: string }>
export const popoversBundle = "popovers"
const sites: readonly Site[] = ["www", "music"]

export type RegisteredScript = {
  id: "pp-www-page" | "pp-www" | "pp-music-page" | "pp-music"
  matches: string[]
  js: string[]
  world: "MAIN" | "ISOLATED"
  runAt: "document_start" | "document_idle"
  allFrames: false
  persistAcrossSessions: true
}

export function pageLinkEntries(registry: readonly RegistrationFeature[]): EntryOwnership {
  const entries: Record<string, PageBundle> = { [popoversBundle]: { kind: "page" } }
  for (const site of sites) {
    const names = siteBundles[site]
    entries[names.page] = { kind: "page" }
    entries[names.core] = { kind: "page" }
    entries[names.kit] = { kind: "kit", site }
  }
  const ids = new Set<FeatureId>()
  for (const feature of registry) {
    if (ids.has(feature.id)) throw Error(`Duplicate registration feature ${feature.id}`)
    ids.add(feature.id)
    for (const site of sites) {
      const page = feature.pages[site]
      if (!page) continue
      const prefix = siteBundles[site].match.slice(0, -1)
      if (page.matches && (!page.matches.length || page.matches.some((match) => !match.startsWith(prefix) || /[\s#]/.test(match)))) {
        throw Error(`Off-site or invalid registration matches for ${feature.id} on ${site}`)
      }
      if (!page.file) {
        if (page.file !== undefined) throw Error(`Invalid registration file for ${feature.id}`)
        continue
      }
      if (!/^[a-z][a-z0-9-]*$/.test(page.file)) throw Error(`Invalid registration file ${page.file}`)
      const previous = entries[page.file]
      if (previous && (previous.kind !== "feature" || previous.site !== site)) throw Error(`Conflicting registration file ${page.file}`)
      entries[page.file] = { kind: "feature", site }
    }
  }
  return entries
}

export function desired(
  registry: readonly RegistrationFeature[],
  settings: Settings,
  consent: boolean,
  access: Readonly<Record<Site, boolean>>,
  schemaOk: boolean,
): RegisteredScript[] {
  if (!consent || !schemaOk) return []
  pageLinkEntries(registry)
  const result: RegisteredScript[] = []
  for (const site of sites) {
    if (!access[site] || (site === "music" && !settings.musicSection)) continue
    const selected: RegistrationPage[] = []
    for (const feature of registry) {
      if (feature.setting === "device.syncOn" || !settings[feature.setting].on) continue
      const page = feature.pages[site]
      if (page && (!page.when || page.when(settings))) selected.push(page)
    }
    if (!selected.length) continue
    const names = siteBundles[site]
    const matches = [...new Set(selected.flatMap((page) => page.matches ?? [names.match]))]
    const effectiveMatches = matches.includes(names.match) ? [names.match] : matches
    const files = [...new Set(selected.flatMap((page) => page.file ? [`${page.file}.js`] : []))]
    const js = [`${names.core}.js`, ...(selected.some((page) => page.needs.includes("kit")) ? [`${names.kit}.js`] : []), ...files]
    result.push(
      { id: `pp-${site}-page`, matches: [...effectiveMatches], js: [`${names.page}.js`], world: "MAIN", runAt: "document_start", allFrames: false, persistAcrossSessions: true },
      { id: `pp-${site}`, matches: [...effectiveMatches], js, world: "ISOLATED", runAt: "document_idle", allFrames: false, persistAcrossSessions: true }
    )
  }
  return result
}
