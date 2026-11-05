import { mount } from "svelte"
import markSrc from "../../../src/assets/brand/icon.svg"
import { defaultSettings, defaultSetup } from "../../../src/shared/model/defaults"
import { isAccountKey, isPlaylistId, isVideoId } from "../../../src/shared/model/validation"
import { isBuildId } from "../../../src/shared/contracts/vocabulary"
import { isAutoAddLifetime } from "../../../src/shared/contracts/auto-add-choice"
import type { PlaylistRow } from "../../../src/shared/contracts/jobs"
import { isJsonValue } from "../../../src/shared/contracts/json"
import { isFeatureSettingChange, isSharedSettingChange } from "../../../src/shared/contracts/shared-settings"
import { featureSettings } from "../../../src/shared/model/first-run-view"
import { createScriptedBackend } from "../../../src/ui/backend/scripted"
import type { ExtensionPage } from "../../../src/ui/shell/start"
import { followTheme } from "../../../src/ui/lib/theme"
import Popup from "../../../src/ui/popup/Popup.svelte"
import Settings from "../../../src/ui/settings/Settings.svelte"
import FirstRun from "../../../src/ui/onboarding/FirstRun.svelte"
import OnboardingPage from "../../../src/ui/onboarding/OnboardingPage.svelte"
import { startFirstRun } from "../../../src/ui/onboarding/start"
import Picker from "../picker-ui/Fixture.svelte"
import { scenario as pickerScenario } from "../picker-ui/scenarios"
import { syntheticOwner, type Scenario } from "../ui-foundation/synthetic-owner"
import { englishFirstRunText, englishI18n } from "../localization/scripted"

// Preview proxies may use an HTTP LAN origin. This shim is confined to synthetic fixture operations.
if (typeof crypto.randomUUID !== "function") {
  Object.defineProperty(crypto, "randomUUID", {
    value: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6]! & 15) | 64
      bytes[8] = (bytes[8]! & 63) | 128
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
  })
}

const params = new URLSearchParams(location.search)
const view = params.get("view") ?? "popup"
if (view === "settings") await import("../../../src/ui/settings/settings.css")
else if (view === "onboarding" || view === "onboarding-host") await import("../../../src/ui/onboarding/onboarding.css")
else if (view === "picker") await import("../picker-ui/fixture.css")
else await import("../../../src/ui/popup/popup.css")
const scenario = params.get("scenario") ?? "ready"
const theme = params.get("theme") === "dark" ? "dark" : "light"
const site = params.get("site") === "music" ? "music" : "www"
const acct = "AAAAAAAAAAAAAAAA",
  playlist = "PLreview",
  video = "dQw4w9WgXcQ",
  build = "ui-review"
if (!isAccountKey(acct) || !isPlaylistId(playlist) || !isVideoId(video) || !isBuildId(build)) throw Error("Invalid review fixture identifiers")
const lifetime = crypto.randomUUID()
if (!isAutoAddLifetime(lifetime)) throw Error("Invalid review fixture lifetime")
const reviewPlaylists: PlaylistRow[] = [{ id: playlist, title: "Ideas to return to", count: 24 }]
if (scenario === "long-list" || scenario === "choice-refusal" || view === "onboarding-host") {
  for (let index = 1; index < 12; index++) {
    const id = `PLreview${index}`
    if (!isPlaylistId(id)) throw Error("Invalid review playlist")
    reviewPlaylists.push({ id, title: `Playlist ${index}`, count: index })
  }
}
const target = document.getElementById("app")
if (!target) throw Error("Missing review fixture host")
let stopTheme = followTheme(document.documentElement, theme, matchMedia("(prefers-color-scheme: dark)"))
const settings = defaultSettings()
settings.theme = theme
if (scenario !== "fresh") for (const key of Object.values(featureSettings)) settings[key].on = true
const setup = defaultSetup()
setup.label = { name: "Alex Morgan", handle: "@alexmorgan" }
setup.autoAdd = [{ pl: playlist, takes: "both" }]
setup.quickSave = playlist
setup.musicSave = playlist
let paused = scenario === "paused"
let skipped = false
const stamp = (data: object) => {
  const value = { v: 1, gen: "review", at: 1, by: "review-device", data: structuredClone(data) }
  if (!isJsonValue(value)) throw Error("Invalid review fixture record")
  return value
}
const scripted = createScriptedBackend({
  build,
  deadline: (ms, expire) => {
    const timer = setTimeout(expire, ms)
    return () => clearTimeout(timer)
  },
  records: {
    schema: 1,
    device: { id: "review-device", consent: scenario === "fresh" ? null : { v: 1, at: 1_700_000_000_000 }, syncOn: false },
    "doc:settings": stamp(settings),
    [`doc:setup:${acct}`]: stamp(setup),
    [`cache:${acct}`]: { listAt: Date.now(), playlists: reviewPlaylists, order: {}, created: [], labelAt: null }
  },
  grants: { www: scenario !== "held", music: scenario !== "held", browserMenu: scenario !== "held" },
  answers: [],
  respond: {
    "ui.accountInView": () =>
      scenario === "signed-out" ? { kind: "account", source: "active", tabId: 4, signedIn: false, acct: null } : { kind: "account", source: "active", tabId: 4, signedIn: true, acct },
    "ui.status": () => ({ kind: "status", paused, tab: { kind: "site", site, tabId: 4, signedIn: true, acct }, health: [] }),
    "ui.change": ({ change }) => {
      if (view === "onboarding-host" && change.kind === "first-run-agree") {
        for (const [feature, key] of Object.entries(featureSettings)) settings[key].on = change.selected.some(selected => selected === feature)
        scripted.replace({
          device: { id: "review-device", consent: { v: 1, at: Date.now() }, syncOn: false },
          "doc:settings": stamp(settings)
        })
        return {
          kind: "agreement",
          outcome: {
            kind: "agreed",
            attempt: change.attempt,
            applications: change.selected.map(feature => (feature === "shortcuts" ? { feature, state: "enabled", alsoOnMusic: "enabled" } : { feature, state: "enabled" }))
          }
        }
      }
      if (view === "onboarding-host" && change.kind === "setup-destination") {
        if (scenario === "choice-refusal") return { kind: "destination", outcome: { kind: "refused", reason: "sync-full" } }
        if (change.destination.kind === "shortcut") {
          if (change.playlist === null) delete setup.targets[change.destination.shortcut]
          else setup.targets[change.destination.shortcut] = change.playlist
        } else if (change.destination.kind === "quick-save") setup.quickSave = change.playlist
        else if (change.destination.kind === "music-save") setup.musicSave = change.playlist
        else setup.gather = change.playlist
        scripted.replace({ [`doc:setup:${acct}`]: stamp(setup) })
        return { kind: "destination", outcome: { kind: "confirmed", playlist: change.playlist } }
      }
      if (change.kind === "auto-add-read") {
        const chosen = setup.autoAdd.find(row => row.pl === change.playlist)
        return {
          kind: "auto-add-read",
          outcome: { kind: "value", acct, playlist: change.playlist, lifetime, fact: chosen ? { kind: "selected", takes: chosen.takes, pct: chosen.pct ?? null } : { kind: "absent" } }
        }
      }
      if (change.kind === "auto-add-choice") {
        if (view !== "onboarding-host" || scenario === "choice-refusal")
          return { kind: "auto-add-choice", outcome: { kind: "refused", reason: scenario === "choice-refusal" ? "sync-full" : "unconfirmed" } }
        const edit = change.edit
        let chosen = setup.autoAdd.find(row => row.pl === change.playlist)
        if (edit.kind === "auto-add") {
          setup.autoAdd = setup.autoAdd.filter(row => row.pl !== change.playlist)
          if (edit.chosen) setup.autoAdd.push({ pl: change.playlist, takes: "videos" })
        } else if (chosen && edit.kind === "takes") chosen.takes = edit.takes
        else if (chosen && edit.kind === "percentage") {
          if (edit.pct === null) delete chosen.pct
          else chosen.pct = edit.pct
        }
        chosen = setup.autoAdd.find(row => row.pl === change.playlist)
        scripted.replace({ [`doc:setup:${acct}`]: stamp(setup) })
        return {
          kind: "auto-add-choice",
          outcome: { kind: "auto-add-confirmed", acct, playlist: change.playlist, fact: chosen ? { kind: "selected", takes: chosen.takes, pct: chosen.pct ?? null } : { kind: "absent" } }
        }
      }
      if (isFeatureSettingChange(change)) {
        if (scenario === "error") return { kind: "feature-setting", outcome: { kind: "refused", reason: "unconfirmed" } }
        if (change.kind === "feature") settings[featureSettings[change.feature]].on = change.value
        else if (change.kind === "music-section") settings.musicSection = change.value
        else settings.shortcuts.music = change.value
        scripted.replace({ "doc:settings": stamp(settings) })
        return { kind: "feature-setting", outcome: { kind: "confirmed", change, status: "changed", limitedMusic: false, conflicts: 0, menuPermission: "unchanged" } }
      }
      if (isSharedSettingChange(change)) {
        if (change.kind === "theme") settings.theme = change.value
        else if (change.kind === "default-percentage") settings.autoAdd.pct = change.value
        else return { kind: "shared-setting", outcome: { kind: "refused", reason: "unconfirmed" } }
        scripted.replace({ "doc:settings": stamp(settings) })
        return { kind: "shared-setting", outcome: { kind: "confirmed", change, status: "changed" } }
      }
      throw Error(`The review fixture does not simulate ${change.kind}; use the production behavioral tests for this write`)
    },
    "ui.pause": payload => {
      paused = payload.paused
      return { kind: "paused", paused }
    },
    "ui.thisTab": () => ({
      kind: "video",
      tabId: 4,
      acct,
      video: {
        video,
        title: "A quieter way to keep track of what matters",
        watched: 35,
        state: skipped ? { kind: "skipped" } : paused ? { kind: "paused" } : { kind: "counting", goal: 50, watched: 35 },
        playlists: [{ pl: playlist, pct: 50, outcome: "waiting" }],
        channel: null
      }
    }),
    "ui.skip": payload => {
      skipped = payload.skip
      return { kind: skipped ? "skipped" : "unskipped" }
    },
    "ui.playlists": payload =>
      payload.action === "release"
        ? { kind: "released", operation: payload.operation }
        : payload.action === "open"
          ? { kind: "open", operation: payload.operation, cached: { rows: reviewPlaylists, at: Date.now() }, freshness: "fresh", refresh: null }
          : { kind: "unavailable", reason: "collaborator" },
    "ui.recentAdds": () => ({ kind: "recent", entries: [] }),
    "ui.heldAgree": () => ({ kind: "not-held" }),
    "ui.syncedChoices": () => ({ kind: "not-found" }),
    "ui.gathers": () => ({ kind: "gathers", running: false, line: null }),
    "ui.playingNow": () => ({ kind: "no-tab" }),
    "ui.diagnostics": () => ({ kind: "diagnostics", checks: [], signals: [], tabs: { www: true, music: false } })
  }
})
function openView(next: string, hash = "") {
  location.href = `/?view=${next}&scenario=${encodeURIComponent(scenario)}&theme=${theme}${hash}`
}
const page: ExtensionPage = {
  backend: scripted.backend,
  i18n: englishI18n(),
  platform: { browser: "chrome", os: "linux" },
  private: scenario === "private",
  windowId: 1,
  version: "2.0.0",
  beta: false,
  open: url => {
    document.documentElement.dataset.lastOpenedUrl = url
  },
  openSettings: hash => openView("settings", hash ? `#${hash}` : ""),
  openFirstRun: () => openView("onboarding"),
  commands: { read: async () => ({ kind: "unavailable" }), named: async () => null },
  canonical: async () => englishI18n(),
  applyTheme(preference) {
    stopTheme()
    stopTheme = followTheme(document.documentElement, preference, matchMedia("(prefers-color-scheme: dark)"))
  }
}
if (view === "onboarding-host") mount(OnboardingPage, { target, props: { ...startFirstRun(page), markSrc } })
else if (view === "settings") mount(Settings, { target, props: { page, markSrc } })
else if (view === "onboarding") {
  const choices: readonly Scenario[] = ["fresh", "synced", "denied", "unconfirmed", "no-picker", "signed-out"]
  const firstRunScenario = choices.find(choice => choice === scenario) ?? "fresh"
  mount(FirstRun, { target, props: { owner: syntheticOwner(firstRunScenario, "chrome"), text: englishFirstRunText(), markSrc } })
} else if (view === "picker") mount(Picker, { target, props: { scenario: pickerScenario(params.get("scenario")), markSrc } })
else mount(Popup, { target, props: { page, markSrc } })
window.addEventListener(
  "pagehide",
  () => {
    stopTheme()
    scripted.dispose()
  },
  { once: true }
)
