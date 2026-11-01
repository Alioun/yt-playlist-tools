import type { BrowserKind, FirstRunOwner, PageFeatureId, SetupRow, SetupView } from "../../../src/ui/onboarding"

// Test-only owner data. Nothing here reads storage, permissions, tabs or YouTube, and none of it ships.
export type Scenario = "fresh" | "synced" | "denied" | "unconfirmed" | "no-picker" | "signed-out"

const later = <T>(value: T, ms = 400) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))

function rowFor(feature: PageFeatureId, denied: boolean): SetupRow {
  switch (feature) {
    case "auto-add": return { feature, target: { purpose: "auto-add", selection: { kind: "chosen", titles: ["Synthetic list A", "Synthetic list B"] } } }
    case "shortcuts": return { feature, ...(denied && { alsoOnMusicHeld: true as const }), target: { purpose: "shortcut", key: "Alt+W", selection: { kind: "chosen", titles: ["Watch later"] } } }
    case "quick-save": return { feature, target: { purpose: "quick-save", selection: { kind: "none" } } }
    case "music-actions":
    case "music-keys": return denied ? { feature, held: "site-access" } : { feature, target: { purpose: "music-quick-save", selection: { kind: "none" } } }
    default: return { feature }
  }
}

export function syntheticOwner(scenario: Scenario, browser: BrowserKind): FirstRunOwner {
  let selected: readonly PageFeatureId[] = []
  let musicGranted = scenario !== "denied"
  return {
    browser,
    lookupSyncedChoices() {
      let cancelled = false
      const result = later(scenario === "synced"
        ? { kind: "found" as const, features: ["auto-add", "music-actions"] as PageFeatureId[] }
        : { kind: "not-found" as const }, 1500).then(found => cancelled ? { kind: "not-found" as const } : found)
      return { result, cancel() { cancelled = true } }
    },
    requestPermissions(needs) {
      return later({ music: needs.music && musicGranted, browserMenu: needs.browserMenu })
    },
    async agree(request) {
      const grant = await request.permissions
      selected = request.selected
      if (scenario === "unconfirmed") return later({ kind: "not-agreed" as const, attempt: request.attempt, reason: "unconfirmed" as const })
      const held = browser === "chrome" && !grant.music
      return later({
        kind: "agreed" as const,
        attempt: request.attempt,
        applications: request.selected.map(feature => feature === "shortcuts"
          ? { feature, state: "enabled" as const, alsoOnMusic: held ? "held-site-access" as const : "enabled" as const }
          : { feature, state: held && (feature === "music-actions" || feature === "music-keys" || feature === "any-tab-keys") ? "held-site-access" as const : "enabled" as const })
      })
    },
    readSetup(): Promise<SetupView> {
      const denied = browser === "chrome" && !musicGranted
      const needsMusic = selected.some(feature => feature === "shortcuts" || feature === "music-actions" || feature === "music-keys" || feature === "any-tab-keys")
      return later({
        kind: "ready",
        youtube: scenario === "signed-out" ? { kind: "signed-out" } : { kind: "account", account: { name: "Synthetic Account", handle: "@synthetic-fixture" } },
        musicAccess: !needsMusic ? "not-needed" : denied ? "missing" : "granted",
        rows: selected.map(feature => rowFor(feature, denied))
      })
    },
    requestSiteAccess(site) {
      if (site === "music") musicGranted = true
      return later(true)
    },
    choosePlaylist() {
      return later(scenario === "no-picker"
        ? { kind: "failed" as const, reason: "picker-unavailable" as const }
        : { kind: "confirmed" as const, selection: { kind: "chosen" as const, titles: ["Synthetic chosen list"] } })
    },
    open() {}
  }
}
