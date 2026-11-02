import { isAccountKey, isVideoId, type AccountKey, type VideoId } from "../model/validation"
import { objectShape } from "./object-shape"
import { TITLE_LIMIT } from "./tab-actions"
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
/** `text` is the save's answer in YM-SAVE's words, which the row shows in place (YM-POP-3). */
export type UiAddAnswer =
  | { readonly kind: "added" | "already-in" | "failed"; readonly text: string }
  | { readonly kind: "choose" | "signed-out" | "no-tab" | "account-changed" | "unavailable" }
export type UiAddMessages = { readonly "ui.add": { readonly payload: UiAddPayload; readonly result: UiAddAnswer } }

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
    result: (value): value is UiAddAnswer => objectShape(value, { kind: oneOf("added", "already-in", "failed"), text: text => typeof text === "string" && text.length <= 2000 })
      || objectShape(value, { kind: oneOf("choose", "signed-out", "no-tab", "account-changed", "unavailable") }),
    // A save waits for the tab's membership read and the write, as a page's own save does.
    timeoutMs: 30_000
  }
}
