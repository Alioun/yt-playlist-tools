import type { AccountData, Job } from "../../shared/contracts/jobs"
import {
  sameTabAccount, tabHelloMessages, tabJobReceiverMessages, tabMessages,
  type TabHelloMessages, type TabJobMessages, type TabMessages, type TabViewScope
} from "../../shared/contracts/tabs"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { createRpc, createRpcCaller, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import type { PageLink, PageLinkState } from "./page-link"

export type ExtLinkRuntime<Sender> = {
  readonly transport: Transport<Sender>
  identity(): string | undefined
  senderId(sender: Sender): string | undefined
}
export type ExtLinkState =
  | { readonly kind: "waiting" | "ready" }
  | { readonly kind: "disarmed"; readonly reason: "accountChanged" | "unavailable" }
  | { readonly kind: "disposed"; readonly reason: "owner" | "page" | "orphaned" }
export type ExtLinkOptions<View extends TabViewScope, Sender> = {
  readonly build: BuildId
  readonly site: Site
  readonly page: PageLink
  readonly runtime: ExtLinkRuntime<Sender>
  readonly deadline: Deadline
  readonly hiddenAtStart: boolean
  isView(value: unknown): value is View
}
export interface ExtLink<View extends TabViewScope> {
  readonly state: ExtLinkState
  readonly view: View | null
  onView(listener: (view: View | null) => void): () => void
  dispose(): void
}

export function createExtLink<View extends TabViewScope, Sender>(options: ExtLinkOptions<View, Sender>): ExtLink<View> {
  const { build, site, page, runtime, deadline, hiddenAtStart } = options
  let state: ExtLinkState = { kind: "waiting" }
  let current: View | null = null
  let extensionId: string | undefined
  let epoch = 0
  let pushed = 0
  let stopPage = () => {}
  const listeners = new Set<(view: View | null) => void>()
  function isView(value: unknown): value is View {
    try { return options.isView(value) } catch { return false }
  }
  const hello = createRpcCaller<TabHelloMessages<View>>(runtime.transport, { build, deadline, contract: tabHelloMessages(isView) })
  type Incoming = TabMessages<View> & TabJobMessages<Job>
  const incoming = createRpc<Incoming, Sender>(runtime.transport, {
    build, deadline, contract: { ...tabMessages(isView), ...tabJobReceiverMessages() }
  })

  function publish(view: View | null) {
    current = view
    for (const listener of [...listeners]) {
      if (current !== view || state.kind === "disposed" && view !== null) break
      if (!listeners.has(listener)) continue
      try { listener(view) } catch {}
    }
  }
  function stop(reason: Extract<ExtLinkState, { kind: "disposed" }>["reason"]) {
    if (state.kind === "disposed") return
    state = { kind: "disposed", reason }
    epoch++
    for (const release of [hello.dispose, incoming.dispose, stopPage, page.dispose]) {
      try { release() } catch {}
    }
    publish(null)
    listeners.clear()
  }
  function live(): boolean {
    if (state.kind === "disposed") return false
    try {
      const identity = runtime.identity()
      if (typeof identity === "string" && identity.length > 0 && identity === extensionId) return true
    } catch {}
    stop("orphaned")
    return false
  }
  function account(): AccountData {
    if (!live()) throw new Error("ExtLink disposed")
    const trusted = page.state
    if (trusted.kind !== "ready") throw new Error("PageLink unavailable")
    return trusted.snapshot.signedIn ? { signedIn: true, acct: trusted.snapshot.acct } : { signedIn: false, acct: null }
  }
  function apply(view: View): boolean {
    if (!live()) return false
    const trusted = page.state
    if (state.kind !== "ready" || trusted.kind !== "ready" || view.build !== build || !sameTabAccount(view, trusted.snapshot)) return false
    publish(view)
    return true
  }
  function pageState(next: PageLinkState) {
    if (!live()) return
    if (next.kind === "disposed") { stop("page"); return }
    if (next.kind === "ready") {
      if (state.kind === "waiting") state = { kind: "ready" }
      return
    }
    if (next.kind === "connecting") return
    state = { kind: "disarmed", reason: next.kind }
    epoch++
    hello.dispose()
    publish(null)
  }

  try { extensionId = runtime.identity() } catch {}
  if (!live()) return result()
  incoming.handle({
    authenticate({ sender }) {
      return live() && runtime.senderId(sender) === extensionId
        ? { kind: "accepted", context: { kind: "extension" } }
        : { kind: "rejected" }
    },
    handlers: {
      "bg.ping": () => ({ ...account(), site, build }),
      "bg.view"(view) {
        if (apply(view)) pushed++
        return null
      },
      async "bg.job"(invocation) {
        if (!live()) throw new Error("ExtLink disposed")
        const answer = await page.run(invocation)
        if (!live()) throw new Error("ExtLink disposed")
        return answer
      }
    }
  })
  const unsubscribe = page.onState(pageState)
  if (!live()) unsubscribe()
  else stopPage = unsubscribe
  void page.hello.then(async answer => {
    if (!answer.ok || !live() || state.kind !== "ready") return
    const trusted = page.state
    if (trusted.kind !== "ready" || !sameTabAccount(answer.snapshot, trusted.snapshot)) return
    const ticket = epoch
    const response = await hello.call("tab.hello", {
      ...account(), site, build,
      hidden: answer.snapshot.startedHidden && hiddenAtStart,
      fresh: answer.snapshot.navType === "navigate"
    })
    if (!live() || epoch !== ticket || pushed !== 0) return
    if (response.kind === "answered" && response.result !== null) apply(response.result)
  }).catch(() => { stop("page") })

  function result(): ExtLink<View> {
    return {
      get state() { live(); return state },
      get view() { return live() ? current : null },
      onView(listener) {
        if (!live()) return () => {}
        listeners.add(listener)
        try { listener(current) } catch {}
        return () => { listeners.delete(listener) }
      },
      dispose: () => stop("owner")
    }
  }
  return result()
}
