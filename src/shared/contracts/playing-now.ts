import { isNowPlaying, type NowPlaying } from "./media"
import { isAccountKey, type AccountKey } from "../model/validation"
import { objectShape } from "./object-shape"
import type { RpcContract } from "../rpc/rpc"

/**
 * The popup's Playing now row (03 §17): the song playing in the tab ARC-ACC-68 picks, read when the popup opens
 * (YM-POP-14). A save from the row goes to that `tabId`, as `acct`, the account the song was read with (YM-POP-2, YM-POP-5).
 * `off` is the YouTube Music section switch, and `unavailable` covers missing consent (YM-POP-7, YM-POP-10).
 */
export type PlayingNow =
  | { readonly kind: "song"; readonly tabId: number; readonly acct: AccountKey; readonly song: NowPlaying }
  | { readonly kind: "nothing-playing" | "ad-playing" | "signed-out"; readonly tabId: number }
  | { readonly kind: "no-tab" | "no-access" | "off" | "unavailable" }
export type PlayingNowMessages = {
  readonly "ui.playingNow": { readonly payload: { readonly windowId?: number }; readonly result: PlayingNow }
}

const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const oneOf =
  (...values: readonly string[]) =>
  (value: unknown) =>
    typeof value === "string" && values.includes(value)
export function isPlayingNow(value: unknown): value is PlayingNow {
  return (
    objectShape(value, { kind: oneOf("song"), tabId: natural, acct: isAccountKey, song: isNowPlaying }) ||
    objectShape(value, { kind: oneOf("nothing-playing", "ad-playing", "signed-out"), tabId: natural }) ||
    objectShape(value, { kind: oneOf("no-tab", "no-access", "off", "unavailable") })
  )
}
export const playingNowContract: RpcContract<PlayingNowMessages> = {
  "ui.playingNow": {
    payload: (value): value is PlayingNowMessages["ui.playingNow"]["payload"] => objectShape(value, {}, { windowId: natural }),
    result: isPlayingNow,
    // An open waits for a tab's injection and its page half, at most once per tab it tries.
    timeoutMs: 20_000
  }
}
