import { isAccountKey, isVideoId, type AccountKey, type VideoId } from "../model/validation"
import { objectShape } from "./object-shape"
import { isUndoHandle, TITLE_LIMIT, type UndoHandle } from "./tab-actions"
import type { RpcContract } from "../rpc/rpc"

/**
 * A save from the popup's Playing now (06 §6.8.3 `ui.add`). AddFlow runs it in the tab `ui.playingNow` read, as the
 * account the song was read with, never as the account in view (ARC-ACC-68, YM-POP-2, YM-POP-5). No in-page feature
 * opened it, so the YouTube Music section switch is the one switch it obeys (YM-POP-10).
 */
export type PopupAddRequest = {
  readonly site: "music"; readonly video: VideoId; readonly title?: string; readonly via: "quick-save"; readonly opener: "playing-now"
}
export type UiAddPayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly request: PopupAddRequest }
/** `text` is the save's answer in YM-SAVE's words, which the row shows in place (YM-POP-3). A save carries its Undo. */
export type UiAddAnswer =
  | { readonly kind: "added"; readonly text: string; readonly undo?: UndoHandle }
  | { readonly kind: "already-in" | "failed"; readonly text: string }
  | { readonly kind: "choose" | "signed-out" | "no-tab" | "account-changed" | "unavailable" }
/** Undo of Playing now's save, in the same tab as the same account (YM-POP-3). */
export type UiAddUndoPayload = { readonly windowId?: number; readonly tabId: number; readonly acct: AccountKey; readonly handle: UndoHandle }
export type UiAddUndoAnswer = { readonly kind: "undone" | "expired" | "no-tab" | "account-changed" | "unavailable" } | { readonly kind: "failed"; readonly text: string }
export type UiAddMessages = {
  readonly "ui.add": { readonly payload: UiAddPayload; readonly result: UiAddAnswer }
  readonly "ui.addUndo": { readonly payload: UiAddUndoPayload; readonly result: UiAddUndoAnswer }
}

const natural = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const is = (expected: string) => (value: unknown) => value === expected
const oneOf = (...values: readonly string[]) => (value: unknown) => typeof value === "string" && values.includes(value)
function isPopupAddRequest(value: unknown): value is PopupAddRequest {
  return objectShape(value, { site: is("music"), video: isVideoId, via: is("quick-save"), opener: is("playing-now") },
    { title: title => typeof title === "string" && title.length <= TITLE_LIMIT })
}
export const uiAddContract: RpcContract<UiAddMessages> = {
  "ui.add": {
    payload: (value): value is UiAddPayload => objectShape(value, { tabId: natural, acct: isAccountKey, request: isPopupAddRequest }, { windowId: natural }),
    result: (value): value is UiAddAnswer => objectShape(value, { kind: oneOf("added"), text: text => typeof text === "string" && text.length <= 2000 }, { undo: isUndoHandle })
      || objectShape(value, { kind: oneOf("already-in", "failed"), text: text => typeof text === "string" && text.length <= 2000 })
      || objectShape(value, { kind: oneOf("choose", "signed-out", "no-tab", "account-changed", "unavailable") }),
    // A save waits for the tab's membership read and the write, and for a playlist made under 30 s ago to be 30 s old (YM-SAVE-13).
    timeoutMs: 60_000
  },
  "ui.addUndo": {
    payload: (value): value is UiAddUndoPayload => objectShape(value, { tabId: natural, acct: isAccountKey, handle: isUndoHandle }, { windowId: natural }),
    result: (value): value is UiAddUndoAnswer => objectShape(value, { kind: oneOf("undone", "expired", "no-tab", "account-changed", "unavailable") })
      || objectShape(value, { kind: oneOf("failed"), text: text => typeof text === "string" && text.length <= 2000 }),
    timeoutMs: 60_000
  }
}
