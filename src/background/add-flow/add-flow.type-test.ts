import type { Origin } from "../../shared/contracts"
import type { AccountKey, ChannelId, PlaylistId, ShortcutId, VideoId } from "../../shared/model"
import type { PrivateSkipRequest, PrivateSkipRead } from "./add-flow"
import type { AddFlow, AddReport, AddRequest, Answer, BatchReport, BatchRequest, Execution, RemoveReport, RemoveRequest, UndoHandle, UndoReport } from "./add-flow"

declare const flow: AddFlow
declare const exec: Execution
declare const origin: Origin
declare const video: VideoId
declare const playlist: PlaylistId
declare const shortcut: ShortcutId
declare const channel: ChannelId
declare const acct: AccountKey

const quick: AddRequest = { via: "quick-save", site: "www", video, opener: "quick-save" }
export const accepted: AddRequest[] = [
  { via: "auto-add", site: "www", video, playlists: [playlist], channel: null },
  { via: "auto-add", site: "music", video, playlists: [playlist], channel },
  { via: "shortcut", site: "music", video, shortcut },
  quick,
  { via: "picker", site: "www", video, playlist, opener: "watch-button" },
  { via: "choose-shortcut", site: "www", video, playlist, opener: "shortcuts" }
]
export const report: Promise<AddReport> = flow.add(quick, origin)
export const untick: Promise<RemoveReport> = flow.remove({ site: "www", video, playlist, opener: "quick-save", tick: null }, origin)
export const gathered: Promise<BatchReport> = flow.batch({ playlist, videos: [video], auto: false }, origin)
export const undone: Promise<UndoReport> = flow.undo({ kind: "gather", id: "engine:1" }, origin)
export const drained: Promise<void> = flow.quiesce()
declare const privateContext: PrivateSkipRequest
export const privateSkips: Promise<PrivateSkipRead> = flow.readPrivateSkips(privateContext)
// @ts-expect-error A private read requires the current owner revision.
void flow.readPrivateSkips({ context: privateContext.context })
// @ts-expect-error A normal context cannot read private skips.
void flow.readPrivateSkips({ ...privateContext, context: { ...privateContext.context, tab: { ...privateContext.context.tab, incognito: false } } })
// @ts-expect-error An unauthenticated account cannot select private memory.
void flow.readPrivateSkips({ ...privateContext, context: { ...privateContext.context, info: { ...privateContext.context.info, signedIn: false, acct: null } } })
// @ts-expect-error The read exposes no whole private session.
void privateSkips.then(read => read.memory)
export const unreadable: Answer<"membership"> = { kind: "fact", fact: "unreadable" }
export const removalHandle: UndoHandle = { kind: "remove", id: "engine:2" }
export const observedBatch: Answer<"addBatch"> = {
  kind: "observed",
  results: [
    { videoId: video, fact: "duplicate" },
    { videoId: video, fact: "refused" },
    { videoId: video, setVideoId: null }
  ]
}
export const stoppedBatch: BatchReport = { kind: "stopped", outcomes: [{ video, outcome: { kind: "added" } }], pending: [], undo: null }
// @ts-expect-error A recognized duplicate cannot also be a confirmed addition.
export const bothBatch: Answer<"addBatch"> = { kind: "observed", results: [{ videoId: video, fact: "duplicate", setVideoId: null }] }
// @ts-expect-error A recognized refusal cannot carry an independent generic failure.
export const bothRefusal: Answer<"addBatch"> = { kind: "observed", results: [{ videoId: video, fact: "refused", failure: { ok: false, reason: "failed" } }] }
// @ts-expect-error Normalized per-video observations belong only to a batch add.
export const wrongObservation: Answer<"remove"> = { kind: "observed", results: [] }
// @ts-expect-error Stopped batches cannot grant write authority.
export const stoppedWriter: BatchReport = { kind: "stopped", outcomes: [], pending: [], undo: removalHandle }
// @ts-expect-error A stopped result must retain its observations and pending work.
export const erasedProgress: BatchReport = { kind: "stopped" }
// @ts-expect-error A removed result must identify the video and playlist for its container.
export const vagueRemoval: RemoveReport = { kind: "removed", feedback: true }
export const read: Promise<Answer<"membership">> = exec.run.membership({ job: { kind: "membership", videoId: video }, acct })

export const rejected: AddRequest[] = [
  // @ts-expect-error Channel filters belong to auto-add, so explicit adds carry no channel.
  { via: "shortcut", site: "www", video, shortcut, channel },
  // @ts-expect-error A picker tick names its playlist.
  { via: "picker", site: "www", video, opener: "quick-save" },
  // @ts-expect-error Auto-add states its channel, null when it is unknown.
  { via: "auto-add", site: "www", video, playlists: [playlist] },
  // @ts-expect-error A video is a validated VideoId.
  { via: "quick-save", site: "www", video: "dQw4w9WgXcQ", opener: "quick-save" },
  // @ts-expect-error The opener is a settled feature ID.
  { via: "picker", site: "www", video, playlist, opener: "toolbar" },
  // @ts-expect-error There is no duplicate-check bypass.
  { via: "quick-save", site: "www", video, opener: "quick-save", allowDuplicate: true }
]

// @ts-expect-error Facts are recognised domain observations, not raw YouTube statuses.
export const status: Answer<"add"> = { kind: "fact", fact: "STATUS_SUCCEEDED" }
// @ts-expect-error Only a membership read can be unreadable.
export const unreadableWrite: Answer<"add"> = { kind: "fact", fact: "unreadable" }
// @ts-expect-error A removal has no duplicate answer.
export const duplicateRemoval: Answer<"remove"> = { kind: "fact", fact: "duplicate" }
// @ts-expect-error A confirmed add carries its data and route, never a bare ok.
export const bare: Answer<"add"> = { kind: "result", result: { ok: true } }
// @ts-expect-error Gathers are never filtered.
export const filteredGather: BatchReport = { kind: "report", outcomes: [{ video, outcome: { kind: "filtered", decision: "filtered" } }], undo: null }
// @ts-expect-error A complete Undo carries no partial count.
export const vagueUndo: UndoReport = { kind: "undone", removed: 1 }
// @ts-expect-error Queue Undo is outside the playlist coordinator.
export const queueUndo: UndoHandle = { kind: "queue", id: "engine:1" }
// @ts-expect-error Ordinary Undo requires an engine-scoped string handle.
export const numericUndo: UndoHandle = { kind: "add", id: 1 }
// @ts-expect-error A gather says whether it runs unattended.
export const unstated: BatchRequest = { playlist, videos: [video] }
// @ts-expect-error An untick states whether this picker's own tick added the entry.
export const unknownTick: RemoveRequest = { site: "www", video, playlist, opener: "quick-save" }
// @ts-expect-error Every add runs for an account.
export const anonymous = exec.run.add({ job: { kind: "add", playlistId: playlist, videoId: video } })
// @ts-expect-error The add flow takes no options bag.
export const forced = flow.add(quick, origin, { force: true })
export const privateSubscription: () => void = flow.subscribePrivateSkips(event => {
  const acct: AccountKey = event.acct
  const scope: "private" = event.scope
  void acct
  void scope
})
// @ts-expect-error negative: add-flow-private-scope. Private memory never emits normal session events.
flow.subscribePrivateSkips((event: { acct: AccountKey; scope: "normal" }) => {
  void event
})
