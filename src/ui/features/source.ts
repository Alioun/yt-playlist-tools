import type { ChangeResult } from "../../shared/contracts/results"
import type { Site } from "../../shared/contracts/vocabulary"
import type { AccountKey } from "../../shared/model/validation"
import { createPageSource, shortcutKeys, type PagePickerPurpose } from "../backend/page-source"
import type { PageState } from "../lib/page-state.svelte"
import type { PopupOpener } from "../../shared/contracts/ui-add"
import type { UndoHandle } from "../../shared/contracts/tab-actions"
import type { SetVideoId } from "../../shared/contracts"
import type { PlaylistId, VideoId } from "../../shared/model/validation"
import type { ItemPort, PickerSource, Undo } from "../../shared/picker/source"

/** The video or song the popup's picker sheet saves, in the tab that shows it, as that tab's account (UI-POP-08, YM-POP-2). */
export type SheetTarget = {
  readonly tabId: number; readonly acct: AccountKey; readonly site: Site; readonly video: VideoId; readonly title: string | null; readonly opener: PopupOpener
}

/** A picker source for one account's setup, as the popup's and settings' choosers and lists read it. Lazy parts only. */
export function pickerSource(pageState: PageState, acct: AccountKey, site: Site, purpose: PagePickerPurpose) {
  const setup = pageState.ready?.setups.find(entry => entry.acct === acct)?.setup ?? null
  const device = pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null
  const settings = pageState.settings
  const backend = pageState.page.backend
  const confirmed = (answer: Awaited<ReturnType<typeof backend.call<"ui.device">>>): ChangeResult =>
    answer.kind === "answered" && answer.result.kind === "confirmed" ? { ok: true }
      : { refused: answer.kind === "answered" && answer.result.kind === "refused" && answer.result.reason === "private" ? "private" : "invalid" }
  return createPageSource(backend, {
    acct, site, private: pageState.private, tab: pageState.tab, signedIn: pageState.signedIn, agreed: pageState.agreed, setup,
    sortAZ: device?.pickerSortAZ ?? false, privacy: device?.newPlaylistVisibility ?? null,
    keys: settings ? shortcutKeys(settings, setup) : new Map(), purpose,
    device: {
      saveSortAZ: async value => confirmed(await backend.call("ui.device", { change: { field: "pickerSortAZ", value } })),
      savePrivacy: async value => confirmed(await backend.call("ui.device", { change: { field: "newPlaylistVisibility", value } }))
    }
  })
}

/**
 * The popup's picker sheet in save mode (UI-PICK-02, YM-POP-4): the account's list and pins as the extension pages read
 * them, and the item's membership, adds and removals run in the target's own tab through AddFlow.
 */
export function sheetSource(pageState: PageState, target: SheetTarget): PickerSource<ItemPort> & { dispose(): void } {
  const backend = pageState.page.backend
  const base = pickerSource(pageState, target.acct, target.site, { kind: "destination", destination: { kind: target.site === "music" ? "music-save" : "quick-save" } })
  const at = { tabId: target.tabId, acct: target.acct }
  const ticks = new Map<PlaylistId, UndoHandle>()
  const undoOf = (handle: UndoHandle): Undo => async () => {
    const answer = await backend.call("ui.addUndo", { ...at, handle, site: target.site })
    return { kind: answer.kind === "answered" && answer.result.kind === "undone" ? "undone" : "failed" }
  }
  const request = { site: target.site, video: target.video, opener: target.opener, ...(target.title ? { title: target.title } : {}) }
  const item: ItemPort = {
    async membership() {
      const answer = await backend.call("ui.membership", { ...at, site: target.site, video: target.video })
      return answer.kind === "answered" && answer.result.kind === "read" ? { kind: "read", rows: answer.result.rows } : { kind: "unreadable" }
    },
    async add(id) {
      const answer = await backend.call("ui.add", { ...at, request: { ...request, via: "picker", playlist: id } })
      const reply = answer.kind === "answered" ? answer.result : null
      if (reply?.kind === "already-in") return { kind: "already-in" }
      if (reply?.kind !== "added" || !reply.undo) return { kind: "failed" }
      ticks.set(id, reply.undo)
      // The model hands this entry back to `remove`; the add's handle names that exact entry for AddFlow.
      return { kind: "added", entry: reply.undo.id as SetVideoId, undo: undoOf(reply.undo) }
    },
    async remove(id) {
      const answer = await backend.call("ui.remove", { ...at, request: { site: target.site, video: target.video, playlist: id, opener: target.opener, tick: ticks.get(id) ?? null } })
      if (answer.kind !== "answered" || answer.result.kind !== "removed") return { kind: "failed" }
      ticks.delete(id)
      const handle = answer.result.undo
      return { kind: "removed", undo: handle ? undoOf(handle) : async () => ({ kind: "failed" }) }
    },
    async create(playlist) {
      const creation = backend.creation({ acct: target.acct, site: target.site })
      try {
        const answer = await creation.submit({ title: playlist.title, privacy: playlist.privacy, videoId: target.video })
        return answer.kind === "answered" && answer.result.kind === "created" ? { kind: "created", id: answer.result.id, undo: null } : { kind: "failed", reason: "failed" }
      } finally { creation.dispose() }
    }
  }
  return { ...base, tab: true, item }
}
