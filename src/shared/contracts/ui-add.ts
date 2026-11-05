import { isAccountKey, isPlaylistId, isVideoId, type AccountKey, type PlaylistId, type VideoId } from "../model/validation"
import { objectShape } from "./object-shape"
import { isUndoHandle, TITLE_LIMIT, type UndoHandle } from "./tab-actions"
import type { MembershipRow } from "./jobs"
import { isSite, type Site } from "./vocabulary"
import type { RpcContract } from "../rpc/rpc"

/**
 * A save from the popup's Playing now (06 §6.8.3 `ui.add`). AddFlow runs it in the tab `ui.playingNow` read, as the
 * account the song was read with, never as the account in view (ARC-ACC-68, YM-POP-2, YM-POP-5). No in-page feature
 * opened it, so the YouTube Music section switch is the one switch it obeys (YM-POP-10).
 */
export type PopupAddRequest =
  | { readonly site: "music"; readonly video: VideoId; readonly title?: string; readonly via: "quick-save"; readonly opener: "playing-now" }
  /** The popup's picker sheet, from Playing now's ▾ or This video's Save to…, ticking one playlist (UI-POP-14, YM-POP-4). */
  | { readonly site: Site; readonly video: VideoId; readonly title?: string; readonly via: "picker" | "choose-quick-save"; readonly opener: PopupOpener; readonly playlist: PlaylistId }
export type PopupOpener = "playing-now" | "popup"
/** The popup's picker sheet unticking a playlist. `tick` is the add this sheet made, which names that exact entry. */
export type PopupRemoveRequest = { readonly site: Site; readonly video: VideoId; readonly playlist: PlaylistId; readonly opener: PopupOpener; readonly tick: UndoHandle | null }
export type UiRemovePayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly request: PopupRemoveRequest }
export type UiRemoveAnswer = { readonly kind: "removed"; readonly undo: UndoHandle | null } | { readonly kind: "failed" | "no-tab" | "account-changed" | "unavailable" }
/** The picker sheet's membership read, in the same tab as the same account (UI-PICK-04). */
export type UiMembershipPayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly site: Site; readonly video: VideoId }
export type UiMembershipAnswer = { readonly kind: "read"; readonly rows: readonly MembershipRow[] } | { readonly kind: "unreadable" | "no-tab" | "account-changed" | "unavailable" }
export type UiAddPayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly request: PopupAddRequest }
/** `text` is the save's answer in YM-SAVE's words, which the row shows in place (YM-POP-3). A save carries its Undo. */
export type UiAddAnswer =
  | { readonly kind: "added"; readonly text: string; readonly undo?: UndoHandle }
  | { readonly kind: "already-in" | "failed"; readonly text: string }
  | { readonly kind: "choose" | "signed-out" | "no-tab" | "account-changed" | "unavailable" }
/** Undo of Playing now's save, in the same tab as the same account (YM-POP-3). */
export type UiAddUndoPayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly handle: UndoHandle; readonly site?: Site }
export type UiAddUndoAnswer = { readonly kind: "undone" | "expired" | "no-tab" | "account-changed" | "unavailable" } | { readonly kind: "failed"; readonly text: string }
export type UiAddMessages = {
  readonly "ui.add": { readonly payload: UiAddPayload; readonly result: UiAddAnswer }
  readonly "ui.remove": { readonly payload: UiRemovePayload; readonly result: UiRemoveAnswer }
  readonly "ui.membership": { readonly payload: UiMembershipPayload; readonly result: UiMembershipAnswer }
  readonly "ui.addUndo": { readonly payload: UiAddUndoPayload; readonly result: UiAddUndoAnswer }
}

const natural = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const is = (expected: string) => (value: unknown) => value === expected
const oneOf =
  (...values: readonly string[]) =>
  (value: unknown) =>
    typeof value === "string" && values.includes(value)
const optionalTitle = { title: (title: unknown) => typeof title === "string" && title.length <= TITLE_LIMIT }
const opener = oneOf("playing-now", "popup")
function isPopupAddRequest(value: unknown): value is PopupAddRequest {
  return (
    objectShape(value, { site: is("music"), video: isVideoId, via: is("quick-save"), opener: is("playing-now") }, optionalTitle) ||
    objectShape(value, { site: isSite, video: isVideoId, via: oneOf("picker", "choose-quick-save"), opener, playlist: isPlaylistId }, optionalTitle)
  )
}
const membershipRow = (row: unknown) =>
  objectShape(
    row,
    { id: isPlaylistId, title: v => typeof v === "string" && v.length <= 1000, contains: v => typeof v === "boolean" },
    { privacy: oneOf("PRIVATE", "UNLISTED", "PUBLIC"), count: natural }
  )
export const uiAddContract: RpcContract<UiAddMessages> = {
  "ui.add": {
    payload: (value): value is UiAddPayload => objectShape(value, { tabId: natural, acct: isAccountKey, request: isPopupAddRequest }, { windowId: natural }),
    result: (value): value is UiAddAnswer =>
      objectShape(value, { kind: oneOf("added"), text: text => typeof text === "string" && text.length <= 2000 }, { undo: isUndoHandle }) ||
      objectShape(value, { kind: oneOf("already-in", "failed"), text: text => typeof text === "string" && text.length <= 2000 }) ||
      objectShape(value, { kind: oneOf("choose", "signed-out", "no-tab", "account-changed", "unavailable") }),
    // A save waits for the tab's membership read and the write, and for a playlist made under 30 s ago to be 30 s old (YM-SAVE-13).
    timeoutMs: 60_000
  },
  "ui.remove": {
    payload: (value): value is UiRemovePayload =>
      objectShape(
        value,
        { tabId: natural, acct: isAccountKey, request: r => objectShape(r, { site: isSite, video: isVideoId, playlist: isPlaylistId, opener, tick: t => t === null || isUndoHandle(t) }) },
        { windowId: natural }
      ),
    result: (value): value is UiRemoveAnswer =>
      objectShape(value, { kind: oneOf("removed"), undo: u => u === null || isUndoHandle(u) }) || objectShape(value, { kind: oneOf("failed", "no-tab", "account-changed", "unavailable") }),
    timeoutMs: 60_000
  },
  "ui.membership": {
    payload: (value): value is UiMembershipPayload => objectShape(value, { tabId: natural, acct: isAccountKey, site: isSite, video: isVideoId }, { windowId: natural }),
    result: (value): value is UiMembershipAnswer =>
      objectShape(value, { kind: oneOf("read"), rows: r => Array.isArray(r) && r.length <= 5000 && r.every(membershipRow) }) ||
      objectShape(value, { kind: oneOf("unreadable", "no-tab", "account-changed", "unavailable") }),
    timeoutMs: 45_000
  },
  "ui.addUndo": {
    payload: (value): value is UiAddUndoPayload => objectShape(value, { tabId: natural, acct: isAccountKey, handle: isUndoHandle }, { windowId: natural, site: isSite }),
    result: (value): value is UiAddUndoAnswer =>
      objectShape(value, { kind: oneOf("undone", "expired", "no-tab", "account-changed", "unavailable") }) ||
      objectShape(value, { kind: oneOf("failed"), text: text => typeof text === "string" && text.length <= 2000 }),
    timeoutMs: 60_000
  }
}
