import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import type { BatchRecord, BatchRequest, UndoReport } from "../add-flow/add-flow"
import type { GatherClosedTab, GatherUndo } from "../store/session-memory"
import type { GatherNativePort } from "../tabs/ports"
import { createGather, type GatherPorts, type GatherResult } from "./gather"

declare const ports: GatherPorts
declare const native: GatherNativePort
declare const acct: AccountKey
declare const playlist: PlaylistId
declare const video: VideoId
declare const undo: GatherUndo

export const gather = createGather(ports)
export const result: Promise<GatherResult> = gather.now({ windowId: 1, incognito: false, activeTabId: null })
export const closed: GatherClosedTab = { url: "https://www.youtube.com/watch?v=gat00000001", index: 0, title: "One" }
export const planned: BatchRecord = { windowId: 1, closed: [closed], recent: { playlist: { id: playlist, title: "Later" }, videos: [{ id: video, title: "One" }] } }
export const request: BatchRequest = { playlist, videos: [video], auto: false, acct, record: async () => planned }
export const reopened: UndoReport = { kind: "undone", reopen: { windowId: 1, closed: [closed] } }
export const recorded: GatherUndo = { ...undo, windowId: 1, closed: [closed] }

// @ts-expect-error negative: gather-no-session-free. The controller has no form without the canonical session reader.
createGather({ ...ports, session: undefined })
// @ts-expect-error negative: gather-native-no-message. The gather seam cannot message a gathered tab.
void native.send(1, {})
// @ts-expect-error negative: gather-close-nonempty. Closing names at least one tab, so an empty close cannot pose as a close.
void native.remove([])
// @ts-expect-error negative: gather-closed-no-tab-id. An Undo record keeps the address, place and title, never the tab ID.
export const leakedId: GatherClosedTab = { url: closed.url, index: 0, title: "One", tabId: 1 }
// @ts-expect-error negative: gather-recent-nonempty. A Recent entry for a gather names at least one added video.
export const hollowRecent: BatchRecord = { windowId: 1, closed: [], recent: { playlist: { id: playlist, title: "Later" }, videos: [] } }
// @ts-expect-error negative: gather-reopen-window. Reopening names the window the tabs came from.
export const windowless: UndoReport = { kind: "undone", reopen: { closed: [closed] } }
export const playerResult: GatherResult = { id: "x", windowId: 1, scope: "normal", at: 1, kind: "player", count: 1, confirmed: true, closed: 0, navigated: 0 }
// @ts-expect-error negative: gather-player-confirmation-stated. A player result always says whether the list was confirmed.
export const unstated: GatherResult = { id: "x", windowId: 1, scope: "normal", at: 1, kind: "player", count: 1, closed: 0, navigated: 0 }
// @ts-expect-error negative: gather-scope-closed. A result belongs to the normal or private realm only.
export const leakedScope: GatherResult = { id: "x", windowId: 1, scope: "storage", at: 1, kind: "no-videos" }
// @ts-expect-error negative: gather-batch-account-branded. The playlist's account is a validated key, never a raw string.
export const rawAccount: BatchRequest = { playlist, videos: [video], auto: false, acct: "unvalidated" }
