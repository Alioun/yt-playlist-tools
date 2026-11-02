import { objectShape } from "./object-shape"
import { CONTRACT_VERSION } from "./protocol"
import type { BuildId } from "./vocabulary"
import type { RpcContract } from "../rpc/rpc"

/**
 * Gather tabs' UI calls (ARC-MSG-16, R129, R134). The background words every answer in YT-GT-32 and YT-GT-33's copy, so
 * the popup row, the Settings card, a page's toast and the toolbar's tooltip say the same thing. An action names what
 * the line's one button does: Undo and Try again name their gather, Choose opens the gather playlist chooser.
 */
export type GatherLineAction =
  | { readonly kind: "undo" | "retry"; readonly id: string }
  | { readonly kind: "choose" | "sign-in" | "open-youtube" }
export type GatherLine = { readonly text: string; readonly tone: "muted" | "confirmation" | "failure"; readonly action: GatherLineAction | null }
export type UiGatherAnswer = { readonly kind: "line"; readonly line: GatherLine } | { readonly kind: "off" | "busy" | "unavailable" }
/** `line` is the idle line: "Last gather: …" with Undo while it's offered, or the waiting line. `running` is a gather in this window. */
export type UiGathers = { readonly kind: "gathers"; readonly running: boolean; readonly line: GatherLine | null } | { readonly kind: "off" | "unavailable" }

type WindowClaim = { readonly windowId?: number }
export type UiGatherMessages = {
  readonly "ui.gather": { readonly payload: WindowClaim & { readonly retry?: string }; readonly result: UiGatherAnswer }
  readonly "ui.gatherUndo": { readonly payload: WindowClaim & { readonly id: string }; readonly result: UiGatherAnswer }
  readonly "ui.gathers": { readonly payload: WindowClaim; readonly result: UiGathers }
}

const natural = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const id = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200
const oneOf = (...values: readonly string[]) => (value: unknown) => typeof value === "string" && values.includes(value)
export function isGatherLineAction(value: unknown): value is GatherLineAction {
  return objectShape(value, { kind: oneOf("undo", "retry"), id }) || objectShape(value, { kind: oneOf("choose", "sign-in", "open-youtube") })
}
export function isGatherLine(value: unknown): value is GatherLine {
  return objectShape(value, { text: v => typeof v === "string" && v.length > 0 && v.length <= 2000, tone: oneOf("muted", "confirmation", "failure"),
    action: v => v === null || isGatherLineAction(v) })
}
const isAnswer = (value: unknown): value is UiGatherAnswer =>
  objectShape(value, { kind: v => v === "line", line: isGatherLine }) || objectShape(value, { kind: oneOf("off", "busy", "unavailable") })

export const uiGatherContract: RpcContract<UiGatherMessages> = {
  "ui.gather": {
    payload: (value): value is UiGatherMessages["ui.gather"]["payload"] => objectShape(value, {}, { windowId: natural, retry: id }),
    result: isAnswer,
    // A long gather into a playlist reads membership one video at a time. The popup may close meanwhile; the result waits in the session record.
    timeoutMs: 300_000
  },
  "ui.gatherUndo": {
    payload: (value): value is UiGatherMessages["ui.gatherUndo"]["payload"] => objectShape(value, { id }, { windowId: natural }),
    result: isAnswer,
    timeoutMs: 60_000
  },
  "ui.gathers": {
    payload: (value): value is UiGatherMessages["ui.gathers"]["payload"] => objectShape(value, {}, { windowId: natural }),
    result: (value): value is UiGathers => objectShape(value, { kind: v => v === "gathers", running: v => typeof v === "boolean", line: v => v === null || isGatherLine(v) })
      || objectShape(value, { kind: oneOf("off", "unavailable") }),
    timeoutMs: 10_000
  }
}

/**
 * `ui.gatherProgress`, pushed to open extension pages (ARC-MSG-16): a gather's progress and result, or the waiting line.
 * `windowId` is the gathering window, or null for a line that belongs to no window. Only a popup open on that window
 * answers `{ shown: true }`, which tells the background the popup is still there to show it.
 */
export type GatherPush = { readonly windowId: number | null; readonly running: boolean; readonly line: GatherLine | null }
export type GatherPushEnvelope = { readonly v: typeof CONTRACT_VERSION; readonly build: BuildId; readonly kind: "ui.gatherProgress"; readonly payload: GatherPush }
export function gatherPush(build: BuildId, payload: GatherPush): GatherPushEnvelope {
  return { v: CONTRACT_VERSION, build, kind: "ui.gatherProgress", payload }
}
export function isGatherPush(value: unknown, build: BuildId): value is GatherPushEnvelope {
  return objectShape(value, { v: v => v === CONTRACT_VERSION, build: v => v === build, kind: v => v === "ui.gatherProgress",
    payload: p => objectShape(p, { windowId: v => v === null || natural(v), running: v => typeof v === "boolean", line: v => v === null || isGatherLine(v) }) })
}
export const isGatherPushShown = (value: unknown): boolean => objectShape(value, { shown: v => v === true })
