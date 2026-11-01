import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import type { UndoReport } from "../add-flow/add-flow"
import type { GatherClosedTab, GatherClosing, GatherReopen, GatherSent, SessionEdit } from "../store/session-memory"
import type { GatherNativePort } from "../tabs/ports"
import type { ExecutionTabs } from "./execution"
import type { Gather, GatherState, GatherUndoResult } from "./gather"

declare const acct: AccountKey
declare const playlist: PlaylistId
declare const video: VideoId
declare const native: GatherNativePort
declare const tabs: ExecutionTabs
declare const gather: Gather

const tab: GatherClosedTab = { url: "https://www.youtube.com/watch?v=gat00000001", index: 0, title: "One" }
export const closing: GatherClosing = { tabId: 10, video, tab }
export const evidence: UndoReport = { kind: "undone", reopen: { windowId: 1, closed: [tab], closing: [closing] } }
export const reopenOnly: GatherReopen = { id: "g", seq: 1, at: 1, auto: false, acct, playlist, windowId: 1, closing: [closing] }
export const sent: GatherSent = { id: "g", seq: 1, at: 1, auto: false, to: "queue", windowId: 1, count: 3 }
export const keptEdit: SessionEdit = { kind: "gather-kept", add: [101], remove: [] }
export const closedEdit: SessionEdit = { kind: "gather-closed", id: "g", acct, closed: [tab] }
export const partial: GatherUndoResult = { kind: "undone", reopened: 1, unopened: 1 }
export const reopened = native.create({ windowId: 1, url: tab.url, active: false, index: 0 }, { title: "One" })
export const served = tabs.serve
export const activation: Promise<void> = gather.activated(101, "normal")
export const state = (value: GatherState) => value.history

// @ts-expect-error negative: gather-plan-tab-id. Undo reconciles a saved plan by each planned tab's ID, so a plan entry without one is refused.
export const idlessPlan: UndoReport = { kind: "undone", reopen: { windowId: 1, closed: [], closing: [tab] } }
// @ts-expect-error negative: gather-reopen-window. A reopen-only record names the window its tabs came from.
export const windowless: GatherReopen = { id: "g", seq: 1, at: 1, auto: false, acct, playlist, closing: [closing] }
// @ts-expect-error negative: gather-sent-no-account. A player or queue record is no account data and names no playlist account.
export const accountSent: GatherSent = { id: "g", seq: 1, at: 1, auto: false, to: "player", windowId: 1, count: 1, acct }
// @ts-expect-error negative: gather-sent-destination. Only the player and the queue are sent records; a playlist gather has its own kinds.
export const playlistSent: GatherSent = { id: "g", seq: 1, at: 1, auto: false, to: "playlist", windowId: 1, count: 1 }
// @ts-expect-error negative: gather-kept-not-account. Kept tab IDs are not account data, so the edit takes no account.
export const accountKept: SessionEdit = { kind: "gather-kept", add: [101], remove: [], acct }
// @ts-expect-error negative: gather-closing-video-branded. A planned tab's video is a validated ID, never a raw string.
export const rawVideo: GatherClosing = { tabId: 10, video: "gat00000001", tab }
// @ts-expect-error negative: gather-reopen-title-string. Firefox's reopen title is the closed tab's title text.
void native.create({ windowId: 1, url: tab.url, active: false, index: 0 }, { title: 1 })
// @ts-expect-error negative: gather-execution-no-push. The execution adapter routes jobs only; it cannot push views to tabs.
void tabs.push
