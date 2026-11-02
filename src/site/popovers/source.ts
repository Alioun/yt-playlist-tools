import type { ChangeResult, JobOf, SetVideoId } from "../../shared/contracts"
import type { DestinationAnswer, SetupDestination } from "../../shared/contracts/first-run"
import type { TabView } from "../../shared/contracts/tab-view"
import type { UndoHandle } from "../../shared/contracts/tab-actions"
import type { Key, PlaylistId } from "../../shared/model"
import type { AddAnswer, ItemPort, Mark, PickerSource, Undo } from "../../shared/picker/source"
import type { TabActions } from "../core/actions"
import type { PageLink } from "../core/page-link"
import type { OpenPicker } from "./types"

export type PageSourceDeps = {
  readonly actions: TabActions
  readonly page: Pick<PageLink, "run">
  readonly view: TabView
  readonly request: OpenPicker
  now(): number
  /** Consent stands and the tab is still on this account (R173). */
  live(): boolean
}

function changeResult(answer: DestinationAnswer): ChangeResult {
  if (answer.kind === "confirmed") return { ok: true }
  return { refused: answer.reason === "private" || answer.reason === "sync-full" || answer.reason === "update-needed" ? answer.reason : "invalid" }
}

/**
 * The in-page picker's `PickerSource` (UI-PICK-01): membership through this tab's gateway, every write through
 * the background's add flow and store, and the account's facts from this tab's view (ARC-MSG-05).
 */
export function pagePickerSource(deps: PageSourceDeps): PickerSource<ItemPort> {
  const { actions, page, view, request } = deps
  const { site } = view
  const setup = view.setup?.kind === "live" ? view.setup.setup : null
  const acct = view.signedIn ? view.acct : null
  const shortcut = request.mode.kind === "choose" ? request.mode.shortcut : null
  // YouTube Music's one-click Save has its own playlist, separate from YouTube's thumbnail quick-save (YM-ACC-2).
  const quickSaveDestination: SetupDestination = { kind: site === "music" ? "music-save" : "quick-save" }
  const destination: SetupDestination = shortcut ? { kind: "shortcut", shortcut } : quickSaveDestination
  let quickSave = ((site === "music" ? setup?.musicSave : setup?.quickSave) ?? null) as PlaylistId | null
  let current: PlaylistId | null = (shortcut ? setup?.targets[shortcut] as PlaylistId | undefined : quickSave) ?? null
  let live = setup !== null
  const ticks = new Map<PlaylistId, UndoHandle>()
  const via = request.mode.kind === "save" ? "picker" : shortcut ? "choose-shortcut" : "choose-quick-save"

  function undoOf(handle: UndoHandle | null): Undo {
    return async () => {
      if (!handle) return { kind: "failed" }
      const answer = await actions.undo(handle)
      return { kind: answer.kind === "undone" ? "undone" : "failed" }
    }
  }
  async function set(kind: SetupDestination, playlist: PlaylistId | null, previous: PlaylistId | null): Promise<ChangeResult> {
    const answer = await actions.destination({ destination: kind, playlist,
      expected: live ? { setup: "live", playlist: previous } : { setup: "none" } })
    if (answer.kind === "confirmed") live = true
    return changeResult(answer)
  }
  const item: ItemPort = {
    async membership() {
      if (acct === null) return { kind: "unreadable" }
      const answer = await page.run<JobOf<"membership">>({ job: { kind: "membership", videoId: request.video }, acct })
      return answer.ok ? { kind: "read", rows: answer.data } : { kind: "unreadable" }
    },
    async add(id): Promise<AddAnswer> {
      const report = await actions.add({ site, video: request.video, via, opener: request.opener, playlist: id })
      if (report.kind !== "report") return { kind: "failed" }
      const outcome = report.outcomes[id]
      if (outcome?.kind === "already-in") return { kind: "already-in" }
      if (outcome?.kind !== "added" || !report.undo) return { kind: "failed" }
      ticks.set(id, report.undo)
      // The model hands this entry back to `remove`; the add's handle is what names that exact entry for AddFlow.
      return { kind: "added", entry: report.undo.id as SetVideoId, undo: undoOf(report.undo) }
    },
    async remove(id) {
      const report = await actions.remove({ site, video: request.video, playlist: id, opener: request.opener, tick: ticks.get(id) ?? null })
      if (report.kind !== "removed") return { kind: "failed" }
      ticks.delete(id)
      return { kind: "removed", undo: undoOf(report.undo) }
    },
    async create(playlist) {
      const answer = await actions.create({ title: playlist.title, privacy: playlist.privacy, video: request.video })
      return answer.kind === "created" ? { kind: "created", id: answer.id, undo: null } : answer
    }
  }
  const keys = new Map<PlaylistId, Key>()
  // A Music tab view lists Playlist shortcuts only while "Also on YouTube Music" is on, so its keys are live here (YM-PICK-4).
  const shortcuts = view.features.find(feature => feature.id === "shortcuts")
  if (shortcuts?.id === "shortcuts") {
    for (const entry of shortcuts.options.list) {
      const target = entry.watchLaterOnEveryAccount ? "WL" : setup?.targets[entry.id]
      if (entry.key && target && !keys.has(target as PlaylistId)) keys.set(target as PlaylistId, structuredClone(entry.key) as Key)
    }
  }
  const marks = new Map<PlaylistId, Mark>(Object.entries(setup?.marks ?? {}).map(([id, mark]) => [id as PlaylistId, mark]))
  const label = setup?.label
  return {
    item,
    private: view.private,
    tab: true,
    creation: acct === null ? "signedOut" : label && !label.handle ? "noChannel" : "available",
    sortAZ: view.pickerSortAZ,
    privacy: null,
    quickSave,
    chosen: request.mode.kind === "choose" && current ? [current] : [],
    keys,
    marks,
    authorized: () => deps.live(),
    now: () => deps.now(),
    async cachedList() {
      const answer = await actions.playlists(false)
      return answer.kind === "cached" || answer.kind === "listed" ? answer.listing : null
    },
    async freshList() {
      const answer = await actions.playlists(true)
      if (answer.kind === "listed") return { kind: "listed", listing: answer.listing }
      return { kind: answer.kind === "noTab" ? "noTab" : "failed" }
    },
    async create(playlist) {
      const answer = await actions.create({ title: playlist.title, privacy: playlist.privacy, video: null })
      return answer.kind === "created" ? { kind: "created", id: answer.id, undo: null } : answer
    },
    async pin(id) {
      const result = await set(quickSaveDestination, id, quickSave)
      if ("ok" in result) { quickSave = id; if (!shortcut) current = id }
      return result
    },
    async choose(id, on) {
      const next = on ? id : null
      const result = await set(destination, next, current)
      if ("ok" in result) { current = next; if (!shortcut) quickSave = next }
      return result
    },
    // No store operation saves this browser's sort order or last visibility from a page yet.
    saveSortAZ: async () => ({ refused: "invalid" }),
    savePrivacy: async () => ({ refused: "invalid" })
  }
}
