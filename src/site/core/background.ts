import type { BuildId } from "../../shared/contracts"
import {
  tabAddMessages, type TabAddMessages, type TabAddReport, type TabAddRequest, type TabProgress, type TabUndoHandle, type TabUndoReport
} from "../../shared/contracts/tab-add"
import type { TabView } from "../../shared/contracts/tab-view"
import type { AccountKey, VideoId } from "../../shared/model"
import { createRpcCaller, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import type { ExtLink } from "./extlink"

/**
 * The feature context's way to the background (06 §6.4.2): `add`, `undo` and auto-add's progress checkpoints. Every
 * call carries the account of the view this tab holds now, and nothing is sent while the link is disarmed.
 */
export type BackgroundLink = {
  add(request: TabAddRequest, title?: string): Promise<TabAddReport | null>
  undo(handle: TabUndoHandle): Promise<TabUndoReport | null>
  readonly progress: {
    load(video: VideoId): Promise<TabProgress | null>
    save(video: VideoId, progress: TabProgress): Promise<void>
  }
  cantMeasure(): Promise<boolean>
  dispose(): void
}

export function createBackgroundLink(options: {
  readonly build: BuildId
  readonly deadline: Deadline
  readonly transport: Pick<Transport<never>, "send">
  readonly link: Pick<ExtLink<TabView>, "view">
}): BackgroundLink {
  const caller = createRpcCaller<TabAddMessages>(options.transport, { build: options.build, deadline: options.deadline, contract: tabAddMessages() })
  function account(): AccountKey | null {
    const view = options.link.view
    return view?.signedIn ? view.acct : null
  }
  async function call<K extends keyof TabAddMessages & string>(kind: K, payload: (acct: AccountKey) => TabAddMessages[K]["payload"]): Promise<TabAddMessages[K]["result"] | null> {
    const acct = account()
    if (acct === null) return null
    try {
      const answer = await caller.call(kind, payload(acct))
      return answer.kind === "answered" ? answer.result : null
    } catch { return null }
  }
  return {
    add: (request, title) => call("tab.add", acct => title === undefined ? { acct, request } : { acct, request, title }),
    undo: handle => call("tab.undo", acct => ({ acct, handle })),
    progress: {
      load: video => call("tab.progress.load", acct => ({ acct, video })),
      async save(video, progress) { await call("tab.progress.save", acct => ({ acct, video, len: progress.len, parts: progress.parts })) }
    },
    async cantMeasure() { return (await call("tab.cantMeasure", acct => ({ acct })))?.show ?? false },
    dispose: () => caller.dispose()
  }
}
