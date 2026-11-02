import type { DestinationAnswer } from "../../shared/contracts/first-run"
import type { BuildId, Privacy } from "../../shared/contracts/vocabulary"
import {
  tabActionContract, type TabActionMessages, type TabAddReport, type TabAddRequest, type TabCreated, type TabDestinationChange,
  type TabPlaylists, type TabRemoveReport, type TabRemoveRequest, type TabUndoReport, type UndoHandle
} from "../../shared/contracts/tab-actions"
import type { AccountKey, VideoId } from "../../shared/model"
import { createRpcCaller, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"

/** No answer came back, so the background may or may not have acted. A write is never retried (ARC-MSG-08). */
export type Unanswered = { readonly kind: "unanswered" }
export type TabActions = {
  add(request: TabAddRequest): Promise<TabAddReport | Unanswered>
  remove(request: TabRemoveRequest): Promise<TabRemoveReport | Unanswered>
  undo(handle: UndoHandle): Promise<TabUndoReport | Unanswered>
  release(handle: UndoHandle): void
  /** Asks the background to inject `popovers.js` into this tab (ARC-MAN-16). */
  need(): Promise<boolean>
  playlists(refresh: boolean): Promise<TabPlaylists>
  create(playlist: { readonly title: string; readonly privacy: Privacy; readonly video: VideoId | null }): Promise<TabCreated>
  destination(change: TabDestinationChange): Promise<DestinationAnswer>
  /** Auto-add's watch progress at DATA-27's checkpoints, kept per account by the background. */
  readonly progress: {
    load(video: VideoId): Promise<TabProgress | null>
    save(video: VideoId, progress: TabProgress): Promise<void>
  }
  /** Whether this playback that can't be measured is the browser session's first, which alone gets a toast (YT-AA-41). */
  cantMeasure(): Promise<boolean>
  /** The video auto-add ticked the toolbar icon for has changed in-app, so the background clears the tick (ARC-MOD-38). */
  videoChanged(): void
  dispose(): void
}

/**
 * The tab's side of a user action (06 §6.8.2). Every request carries the account PageLink trusts, which the
 * background compares with its tab registry (ARC-ACC-49). Without a trusted account nothing is sent.
 */
export function createTabActions(options: {
  readonly transport: Pick<Transport<never>, "send">
  readonly build: BuildId
  readonly deadline: Deadline
  account(): AccountKey | null | undefined
}): TabActions {
  const rpc = createRpcCaller<TabActionMessages>(options.transport, { build: options.build, deadline: options.deadline, contract: tabActionContract })
  const unanswered: Unanswered = { kind: "unanswered" }
  async function call<K extends keyof TabActionMessages, F>(kind: K, request: TabActionMessages[K]["payload"] extends { request: infer R } ? R : never, fallback: F):
    Promise<TabActionMessages[K]["result"] | F> {
    const acct = options.account()
    if (acct === undefined) return fallback
    const payload = { acct, request } as TabActionMessages[K]["payload"]
    const answer = await rpc.call(kind, payload)
    return answer.kind === "answered" ? answer.result : fallback
  }
  return {
    add: request => call("tab.add", request, unanswered),
    remove: request => call("tab.remove", request, unanswered),
    undo: handle => call("tab.undo", handle, unanswered),
    release(handle) { void rpc.call("tab.release", { handle }) },
    async need() {
      const answer = await rpc.call("tab.need", { popovers: true })
      return answer.kind === "answered" && answer.result.kind === "ok"
    },
    playlists: refresh => call("tab.playlists", { refresh }, { kind: "failed" } as const),
    create: playlist => call("tab.create", playlist, { kind: "failed", reason: "failed" } as const),
    destination: change => call("tab.destination", change, { kind: "refused", reason: "unavailable" } as const),
    progress: {
      load: video => call("tab.progress.load", { video }, null),
      async save(video, progress) { await call("tab.progress.save", { video, progress }, null) }
    },
    async cantMeasure() {
      const answer = await call("tab.cantMeasure", null, null)
      return answer?.show === true
    },
    videoChanged() { void call("tab.videoChanged", null, null) },
    dispose: () => rpc.dispose()
  }
}
