import type { ChangeResult } from "../../shared/contracts/results"
import type { SetupDestination } from "../../shared/contracts/first-run"
import type { Site } from "../../shared/contracts/vocabulary"
import type { AutoAddLifetime } from "../../shared/contracts/auto-add-choice"
import type { Key, Setup } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import { isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model/validation"
import type { CreateAnswer, PickerSource } from "../../shared/picker/source"
import type { Backend } from "./backend"

/** What a page picker chooses for: the auto-add list (many mode), or one setup destination (choose mode). */
export type PagePickerPurpose = { readonly kind: "auto-add" } | { readonly kind: "destination"; readonly destination: SetupDestination }
export type PageSourceContext = {
  readonly acct: AccountKey
  readonly site: Site
  readonly private: boolean
  /** A tab serves this account, so lists refresh and playlists can be created (FT-54). */
  readonly tab: boolean
  readonly signedIn: boolean
  readonly agreed: boolean
  readonly setup: Snapshot<Setup> | null
  readonly sortAZ: boolean
  readonly privacy: Snapshot<Exclude<import("../../shared/model/types").Device["newPlaylistVisibility"], null>> | null
  readonly keys: ReadonlyMap<PlaylistId, Key>
  readonly purpose: PagePickerPurpose
  /** The device's own choices, which the store keeps outside account setups. */
  readonly device: {
    saveSortAZ(on: boolean): Promise<ChangeResult>
    savePrivacy(privacy: NonNullable<PageSourceContext["privacy"]>): Promise<ChangeResult>
  }
}

const ok: ChangeResult = { ok: true }
function result(answer: { readonly kind: string; readonly reason?: string }): ChangeResult {
  if (answer.kind !== "refused") return ok
  return { refused: answer.reason === "private" || answer.reason === "sync-full" || answer.reason === "update-needed" ? answer.reason : "invalid" }
}
export function destinationValue(setup: Snapshot<Setup> | null, destination: SetupDestination): PlaylistId | null {
  if (!setup) return null
  const value = destination.kind === "shortcut" ? setup.targets[destination.shortcut] ?? null
    : destination.kind === "quick-save" ? setup.quickSave : destination.kind === "music-save" ? setup.musicSave : setup.gather
  return isPlaylistId(value) ? value : null
}

/**
 * A picker source for the extension pages (UI-PICK-01): the cached list and its refresh through the backend's
 * list operation, creation through a serving tab, and choices as the store's own setup and auto-add changes.
 * It has no item, so it serves choose and many modes; the popup's save sheet needs AddFlow's `ui.add`.
 */
export function createPageSource(backend: Backend, context: PageSourceContext): PickerSource<null> & { dispose(): void } {
  const list = backend.playlistList({ acct: context.acct, site: context.site })
  const lifetimes = new Map<PlaylistId, AutoAddLifetime>()
  const chosen = context.purpose.kind === "auto-add"
    ? (context.setup?.autoAdd ?? []).map(row => row.pl).filter(isPlaylistId)
    : [destinationValue(context.setup, context.purpose.destination)].filter((id): id is PlaylistId => id !== null)
  async function destination(target: SetupDestination, playlist: PlaylistId | null): Promise<ChangeResult> {
    const answer = await backend.change({
      kind: "setup-destination", acct: context.acct, destination: target, playlist,
      expected: context.setup ? { setup: "live", playlist: destinationValue(context.setup, target) } : { setup: "none" }
    })
    return result(answer)
  }
  async function autoAdd(id: PlaylistId, on: boolean): Promise<ChangeResult> {
    let lifetime = lifetimes.get(id)
    let expected = chosen.includes(id)
    if (!lifetime) {
      const read = await backend.change({ kind: "auto-add-read", acct: context.acct, playlist: id })
      if (read.kind !== "value") return result(read)
      lifetime = read.lifetime
      expected = read.fact.kind === "selected"
      lifetimes.set(id, lifetime)
    }
    const answer = await backend.change({ kind: "auto-add-choice", acct: context.acct, playlist: id, lifetime, edit: { kind: "auto-add", expected, chosen: on } })
    if (answer.kind === "refused") lifetimes.delete(id)
    return result(answer)
  }
  return {
    item: null,
    private: context.private,
    tab: context.tab,
    creation: context.signedIn ? "available" : "signedOut",
    sortAZ: context.sortAZ,
    privacy: context.privacy,
    quickSave: context.setup && isPlaylistId(context.setup.quickSave) ? context.setup.quickSave : null,
    chosen,
    keys: context.keys,
    marks: new Map(Object.entries(context.setup?.marks ?? {}).filter((entry): entry is [PlaylistId, "missing" | "full"] => isPlaylistId(entry[0]))),
    authorized: () => context.agreed,
    now: () => Date.now(),
    cachedList: () => list.cachedList(),
    freshList: () => context.tab ? list.freshList() : Promise.resolve({ kind: "noTab" }),
    async create(playlist): Promise<CreateAnswer> {
      const creation = backend.creation({ acct: context.acct, site: context.site })
      try {
        const answer = await creation.submit({ title: playlist.title, privacy: playlist.privacy })
        if (answer.kind !== "answered") return { kind: "failed", reason: "failed" }
        const created = answer.result
        if (created.kind === "created") return { kind: "created", id: created.id, undo: null }
        const failure = created.kind === "not-created" && created.outcome.kind === "result" && !created.outcome.result.ok ? created.outcome.result : undefined
        return { kind: "failed", reason: failure && "http" in failure && failure.http === 429 ? "rateLimited" : "failed" }
      } finally { creation.dispose() }
    },
    pin: id => destination({ kind: "quick-save" }, id),
    choose(id, on) {
      if (context.purpose.kind === "auto-add") return autoAdd(id, on)
      return destination(context.purpose.destination, on ? id : null)
    },
    saveSortAZ: on => context.device.saveSortAZ(on),
    savePrivacy: privacy => context.device.savePrivacy(privacy),
    dispose: () => list.dispose()
  }
}

/** Takes and Adds at for one ticked auto-add playlist, each read fresh so it never writes over a newer edit (UI-PICK-20). */
export function createAutoAddEditor(backend: Backend, acct: AccountKey) {
  async function edit(playlist: PlaylistId, make: (fact: { readonly takes: "videos" | "shorts" | "both"; readonly pct: number | null }) => import("../../shared/contracts/auto-add-choice").AutoAddEdit | null): Promise<boolean> {
    const read = await backend.change({ kind: "auto-add-read", acct, playlist })
    if (read.kind !== "value" || read.fact.kind !== "selected") return false
    const next = make(read.fact)
    if (!next) return true
    const answer = await backend.change({ kind: "auto-add-choice", acct, playlist, lifetime: read.lifetime, edit: next })
    return answer.kind === "auto-add-confirmed"
  }
  return {
    takes: (playlist: PlaylistId, takes: "videos" | "shorts" | "both") => edit(playlist, fact => fact.takes === takes ? null : { kind: "takes", expected: fact.takes, takes }),
    pct: (playlist: PlaylistId, pct: number | null) => edit(playlist, fact => fact.pct === pct ? null : { kind: "percentage", expected: fact.pct, pct })
  }
}
/** The keys of playlist shortcuts that save to each playlist on this account, for the picker's chips (UI-PICK-05). */
export function shortcutKeys(settings: Snapshot<import("../../shared/model/types").Settings>, setup: Snapshot<Setup> | null): ReadonlyMap<PlaylistId, Key> {
  const keys = new Map<PlaylistId, Key>()
  for (const row of settings.shortcuts.list) {
    const target = setup?.targets[row.id] ?? (row.watchLaterOnEveryAccount ? "WL" : null)
    if (row.key && isPlaylistId(target) && !keys.has(target)) keys.set(target, { ...row.key })
  }
  return keys
}
