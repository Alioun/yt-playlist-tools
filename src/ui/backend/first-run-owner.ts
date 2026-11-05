import { isAgreeChange, type DestinationChange, type SetupDestination } from "../../shared/contracts/first-run"
import { isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model/validation"
import type { SetupProjection, SettingsProjection } from "../../shared/model/first-run-view"
import { display } from "../../shared/keys/policy"
import type { Platform } from "../../shared/keys/types"
import type {
  FirstRunOwner,
  YouTubeState,
  AccountLabel,
  ChoiceRequest,
  ChoiceOutcome,
  PlaylistSelection,
  PlaylistTarget,
  SetupRow,
  SetupView,
  SyncedChoices,
  SyncedChoicesLookup
} from "../onboarding/owner"
import type { PageFeatureId } from "../onboarding/features"
import type { Backend } from "./backend"
import type { FirstRunText } from "../onboarding/text"
import { FIRST_RUN_DISCLOSURE_VERSION, matchesRenderedDisclosure } from "./rendered-disclosure"

export type ServingAccount = Exclude<YouTubeState, { kind: "account" }> | { readonly kind: "account"; readonly key: AccountKey; readonly account: AccountLabel }
export type FirstRunServices = {
  readonly account: { read(): Promise<ServingAccount> }
  readonly playlists: { title(acct: AccountKey, playlist: PlaylistId): Promise<string | undefined> }
  readonly chooser: {
    choose(input: { readonly account: Extract<ServingAccount, { kind: "account" }>; readonly request: ChoiceRequest; readonly settings: SettingsProjection; readonly setup: SetupProjection }): Promise<
      | { readonly kind: "cancelled" }
      | { readonly kind: "unavailable" }
      | { readonly kind: "chosen"; readonly destination: SetupDestination; readonly playlist: PlaylistId | null }
      /** The picker saved the choice itself, through the store's own change, so nothing is left to write. */
      | { readonly kind: "saved"; readonly destination: SetupDestination }
    >
    /** Auto-add's list, which saves each tick itself (UI-ONB-05). Resolves when the user closes it. */
    manage?(input: { readonly account: Extract<ServingAccount, { kind: "account" }> }): Promise<void>
  }
  open(destination: Parameters<FirstRunOwner["open"]>[0]): void
}

function destinationValue(setup: SetupProjection, destination: SetupDestination): PlaylistId | null {
  return destination.kind === "shortcut"
    ? (setup.targets[destination.shortcut] ?? null)
    : destination.kind === "quick-save"
      ? setup.quickSave
      : destination.kind === "music-save"
        ? setup.musicSave
        : setup.gather
}
function matchesChoice(request: ChoiceRequest, destination: SetupDestination, settings: SettingsProjection): boolean {
  return (
    (request.feature === "quick-save" && request.purpose === "quick-save" && destination.kind === "quick-save") ||
    (request.feature === "music-actions" && request.purpose === "music-quick-save" && destination.kind === "music-save") ||
    (request.feature === "shortcuts" && request.purpose === "shortcut" && destination.kind === "shortcut" && settings.shortcuts.some(row => row.id === destination.shortcut))
  )
}

export function createFirstRunOwner(backend: Backend, services: FirstRunServices, platform: Platform, text: FirstRunText): FirstRunOwner & { dispose(): void } {
  let active = true
  let confirmed = false
  const cancellations = new Set<() => void>()
  async function selection(acct: AccountKey, playlists: readonly PlaylistId[]): Promise<PlaylistSelection | undefined> {
    if (!playlists.length) return { kind: "none" }
    const titles = await Promise.all(playlists.map(playlist => services.playlists.title(acct, playlist)))
    if (!active || titles.some(title => title === undefined)) return
    return { kind: "chosen", titles: titles.filter((title): title is string => typeof title === "string") }
  }
  function lookupSyncedChoices(): SyncedChoicesLookup {
    if (!active) return { result: Promise.resolve({ kind: "unavailable" }), cancel() {} }
    let cancel = () => {}
    const result = new Promise<SyncedChoices>(resolve => {
      let open = true
      const settle = (value: SyncedChoices) => {
        if (!open) return
        open = false
        cancellations.delete(cancel)
        resolve(value)
      }
      cancel = () => settle({ kind: "unavailable" })
      cancellations.add(cancel)
      void backend.call("ui.syncedChoices", {}).then(
        answer => {
          settle(active && answer.kind === "answered" ? answer.result : { kind: "unavailable" })
        },
        () => settle({ kind: "failed" })
      )
    })
    return { result, cancel }
  }
  async function readSetup(): Promise<SetupView> {
    if (!active || !confirmed) return { kind: "unavailable" }
    try {
      const account = await services.account.read()
      if (!active) return { kind: "unavailable" }
      const snapshot = await backend.load(account.kind === "account" ? { acct: account.key } : undefined)
      if (
        !active ||
        snapshot.kind !== "snapshot" ||
        snapshot.layout !== "current" ||
        snapshot.device.kind !== "current" ||
        snapshot.device.consent !== "agreed" ||
        snapshot.device.upgradePending ||
        !("value" in snapshot.settings)
      )
        return { kind: "unavailable" }
      const [www, music, browserMenu] = await Promise.all([backend.access.has("www"), backend.access.has("music"), backend.access.hasBrowserMenu()])
      if (!active) return { kind: "unavailable" }
      const settings = snapshot.settings.value
      const setup = "value" in snapshot.setup ? snapshot.setup.value : undefined
      if (account.kind === "account" && !setup) return { kind: "unavailable" }
      const rows: SetupRow[] = []
      for (const feature of settings.selected) {
        let target: PlaylistTarget | undefined
        if (account.kind === "account" && setup) {
          let ids: readonly PlaylistId[] = []
          let purpose: "auto-add" | "quick-save" | "music-quick-save" | undefined
          if (feature === "auto-add") {
            purpose = "auto-add"
            ids = setup.autoAdd
          }
          if (feature === "quick-save") {
            purpose = "quick-save"
            ids = setup.quickSave ? [setup.quickSave] : []
          }
          if (feature === "music-actions") {
            purpose = "music-quick-save"
            ids = setup.musicSave ? [setup.musicSave] : []
          }
          if (purpose) {
            const chosen = await selection(account.key, ids)
            if (!chosen) return { kind: "unavailable" }
            target = { purpose, selection: chosen }
          }
          if (feature === "shortcuts" && settings.shortcuts.length === 1) {
            const row = settings.shortcuts[0]
            if (row?.key) {
              const playlist = setup.targets[row.id] ?? (row.watchLaterOnEveryAccount ? "WL" : null)
              const ids: PlaylistId[] = []
              if (playlist !== null) {
                if (isPlaylistId(playlist)) ids.push(playlist)
              }
              const chosen = await selection(account.key, ids)
              if (!chosen) return { kind: "unavailable" }
              target = { purpose: "shortcut", key: display(row.key, platform.os), selection: chosen }
            }
          }
        }
        const needsMusic = feature === "music-actions" || feature === "music-keys" || feature === "any-tab-keys"
        const held =
          feature === "browser-menu" && !browserMenu
            ? "browser-menu-permission"
            : (!www && feature !== "music-actions" && feature !== "music-keys") || (needsMusic && !music)
              ? "site-access"
              : undefined
        rows.push({ feature, ...(held ? { held } : {}), ...(feature === "shortcuts" && settings.shortcutsOnMusic && !music ? { alsoOnMusicHeld: true } : {}), ...(target ? { target } : {}) })
      }
      if (!active) return { kind: "unavailable" }
      const youtube: YouTubeState = account.kind === "account" ? { kind: "account", account: { ...account.account } } : account
      return {
        kind: "ready",
        youtube,
        musicAccess: settings.selected.some(feature => (feature === "shortcuts" && settings.shortcutsOnMusic) || feature === "music-actions" || feature === "music-keys" || feature === "any-tab-keys")
          ? music
            ? "granted"
            : "missing"
          : "not-needed",
        rows
      }
    } catch {
      return { kind: "unavailable" }
    }
  }
  async function choosePlaylist(request: ChoiceRequest): Promise<ChoiceOutcome> {
    if (!active || !confirmed) return { kind: "failed", reason: "unavailable" }
    if (request.purpose === "auto-add" && !services.chooser.manage) return { kind: "failed", reason: "picker-unavailable" }
    try {
      const account = await services.account.read()
      if (!active || account.kind !== "account") return { kind: "failed", reason: "unavailable" }
      const snapshot = await backend.load({ acct: account.key })
      if (
        !active ||
        snapshot.kind !== "snapshot" ||
        snapshot.layout !== "current" ||
        snapshot.device.kind !== "current" ||
        snapshot.device.consent !== "agreed" ||
        snapshot.device.upgradePending ||
        !("value" in snapshot.settings) ||
        !("value" in snapshot.setup) ||
        !snapshot.settings.value.selected.includes(request.feature)
      )
        return { kind: "failed", reason: "unavailable" }
      if (request.purpose === "auto-add" && services.chooser.manage) {
        await services.chooser.manage({ account })
        const after = await backend.load({ acct: account.key })
        if (!active || after.kind !== "snapshot" || !("value" in after.setup)) return { kind: "failed", reason: "unavailable" }
        const selected = await selection(account.key, after.setup.value.autoAdd)
        return selected && active ? { kind: "confirmed", selection: selected } : { kind: "failed", reason: "unavailable" }
      }
      const chosen = await services.chooser.choose({ account, request, settings: snapshot.settings.value, setup: snapshot.setup.value })
      if (!active) return { kind: "failed", reason: "unavailable" }
      if (chosen.kind === "cancelled") return { kind: "cancelled" }
      if (chosen.kind === "saved") {
        if (!matchesChoice(request, chosen.destination, snapshot.settings.value)) return { kind: "failed", reason: "picker-unavailable" }
        const after = await backend.load({ acct: account.key })
        if (!active || after.kind !== "snapshot" || !("value" in after.setup)) return { kind: "failed", reason: "unavailable" }
        const playlist = destinationValue(after.setup.value, chosen.destination)
        const selected = await selection(account.key, playlist === null ? [] : [playlist])
        return selected && active ? { kind: "confirmed", selection: selected } : { kind: "failed", reason: "unavailable" }
      }
      if (chosen.kind === "unavailable" || !matchesChoice(request, chosen.destination, snapshot.settings.value)) return { kind: "failed", reason: "picker-unavailable" }
      const currentAccount = await services.account.read()
      if (!active || currentAccount.kind !== "account" || currentAccount.key !== account.key) return { kind: "failed", reason: "unavailable" }
      const change: DestinationChange = {
        kind: "setup-destination",
        acct: account.key,
        destination: chosen.destination,
        playlist: chosen.playlist,
        expected: snapshot.setup.kind === "current" ? { setup: "live", playlist: destinationValue(snapshot.setup.value, chosen.destination) } : { setup: "none" }
      }
      const outcome = await backend.change(change)
      if (!active) return { kind: "failed", reason: "unavailable" }
      if (outcome.kind !== "confirmed")
        return { kind: "failed", reason: outcome.reason === "private" ? "private" : outcome.reason === "rejected" ? "rejected" : outcome.reason === "unconfirmed" ? "unconfirmed" : "unavailable" }
      const selected = await selection(account.key, outcome.playlist === null ? [] : [outcome.playlist])
      return selected && active ? { kind: "confirmed", selection: selected } : { kind: "failed", reason: "unavailable" }
    } catch {
      return { kind: "failed", reason: "unavailable" }
    }
  }
  return {
    browser: platform.browser,
    lookupSyncedChoices,
    requestPermissions: needs => (active ? backend.access.requestCombined(needs) : Promise.resolve({ music: false, browserMenu: false })),
    async agree(request) {
      confirmed = false
      const change = { kind: "first-run-agree", displayedVersion: FIRST_RUN_DISCLOSURE_VERSION, attempt: request.attempt, selected: [...request.selected], syncOn: request.syncOn } as const
      if (!active || request.displayed !== text.disclosure || !matchesRenderedDisclosure(platform.browser, text.disclosure))
        return { kind: "not-agreed", attempt: request.attempt, reason: "unavailable" }
      if (!isAgreeChange(change)) return { kind: "not-agreed", attempt: request.attempt, reason: "invalid" }
      try {
        await request.permissions
      } catch {
        return { kind: "not-agreed", attempt: change.attempt, reason: "rejected" }
      }
      if (!active || request.displayed !== text.disclosure || !matchesRenderedDisclosure(platform.browser, text.disclosure))
        return { kind: "not-agreed", attempt: change.attempt, reason: "unavailable" }
      const outcome = await backend.change(change)
      confirmed = active && outcome.kind === "agreed"
      return active ? outcome : { kind: "not-agreed", attempt: change.attempt, reason: "unavailable" }
    },
    readSetup,
    choosePlaylist,
    requestSiteAccess: site => (active ? backend.access.request(site) : Promise.resolve(false)),
    open(destination) {
      if (active) services.open(destination)
    },
    dispose() {
      if (!active) return
      active = false
      for (const cancel of cancellations) cancel()
      cancellations.clear()
    }
  }
}
