import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import type { SetVideoId } from "../../shared/contracts"
import type { MemoryReport, Ports, UndoHandle } from "../add-flow/add-flow"
import { emptySessionRevision, type GatherUndo, type SessionChange, type SessionMemory, type SessionPort, type SessionRevision, type SessionWrite } from "./session-memory"

declare const acct: AccountKey
declare const playlist: PlaylistId
declare const video: VideoId
declare const entry: SetVideoId
declare const memory: SessionMemory
declare const port: SessionPort
declare const ports: Omit<Ports, "session">

export const change: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "skip", acct, video, playlists: [playlist] }] }
export const gather: GatherUndo = { id: "engine:1", seq: 1, at: 1, auto: false, acct, playlist, added: [{ video, setVideoId: entry }, { video, setVideoId: null }] }
export const committed: SessionWrite = { kind: "committed", memory, revision: emptySessionRevision, sequence: 1 }
export const wired: Ports = { ...ports, session: port }
export const handle: UndoHandle = { kind: "gather", id: "engine:1" }
export const accountRevision: SessionRevision = { reset: 1, accounts: new Map([[acct, 2]]) }
// @ts-expect-error A change carries at least one edit, so an empty commit cannot pose as progress.
export const empty: SessionChange = { revision: emptySessionRevision, now: 1, edits: [] }
// @ts-expect-error A change names the owner revision it was captured under.
export const unrevised: SessionChange = { now: 1, edits: [{ kind: "pause", paused: true }] }
// @ts-expect-error Skips name every playlist or a list of playlists, nothing else.
export const someSkip: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "skip", acct, video, playlists: "some" }] }
// @ts-expect-error A gather record with nothing to undo is never kept.
export const hollow: GatherUndo = { id: "engine:1", seq: 1, at: 1, auto: false, acct, playlist, added: [] }
// @ts-expect-error A committed write always returns the confirmed memory.
export const blind: SessionWrite = { kind: "committed", revision: emptySessionRevision, sequence: 1 }
// @ts-expect-error A storage failure cannot be reported as remembered progress.
export const confirmedFailure: MemoryReport = { kind: "committed", memory, revision: emptySessionRevision, sequence: 1 }
// @ts-expect-error Handles are engine-scoped strings, never a bare counter a later engine could reissue.
export const numeric: UndoHandle = { kind: "add", id: 1 }
// @ts-expect-error The engine has no session-free form.
export const unwired: Ports = { ...ports }
// @ts-expect-error A private report scope cannot be named as anything but normal or private.
export const leaked: MemoryReport = { kind: "remembered", scope: "storage" }
// @ts-expect-error Revisions name validated account keys.
export const forgedRevision: SessionRevision = { reset: 0, accounts: new Map([["unvalidated", 1]]) }
// @ts-expect-error A captured revision exposes no mutable account counters.
accountRevision.accounts.set(acct, 3)

export const tabSeen: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "tab-seen", tabId: 1, info: { site: "www", signedIn: true, acct } }] }
export const tabGone: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "tab-forget", tabId: 1, expected: { site: "www", signedIn: false, acct: null } }] }
// @ts-expect-error A tab deletion names the exact captured row, so it cannot delete a replacement blindly.
export const blindTabDelete: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "tab-forget", tabId: 1 }] }
// @ts-expect-error A canonical tab edit has no browser object or private payload.
export const privateTab: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "tab-seen", tabId: 1, info: { site: "www", signedIn: true, acct, incognito: true } }] }

export const gatherWithClosed: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "gather",
  record: { id: "engine:3", at: 1, auto: false, acct, playlist, added: [{ video, setVideoId: entry }], windowId: 1, closed: [{ url: "https://www.youtube.com/watch?v=x", index: 0, title: "x" }] },
  recent: { at: 1, playlist: { id: playlist, title: "Later" }, videos: [{ id: video, title: "x" }] } }] }
// @ts-expect-error negative: session-gather-recent-one-write. A Recent entry rides only on its gather edit, never as its own edit.
export const loneRecent: SessionChange = { revision: emptySessionRevision, now: 1, edits: [{ kind: "recent-add", recent: { at: 1, playlist: { id: playlist, title: "Later" }, videos: [{ id: video, title: "x" }] } }] }
