import type { AccountKey } from "../../shared/model/validation"
import type { AccountData, Job, JobInvocation, JobResult } from "../../shared/contracts/jobs"
import type { Site } from "../../shared/contracts/vocabulary"
import type { TabHello, TabPing, TabViewScope } from "../../shared/contracts/tabs"
import type { Deadline, RpcOutcome } from "../../shared/rpc/rpc"
import type { KnownTab } from "./tabs"
import type { SessionPort, SessionRead, SessionWrite } from "../store/session-memory"

export type NativeTab = {
  readonly tabId: number
  readonly windowId: number
  readonly incognito: boolean
  readonly site: Site | null
  readonly lastAccessed: number
  readonly active: boolean
  readonly discarded: boolean
  readonly frozen: boolean
}
export type Requester = {
  readonly windowId: number
  readonly incognito: boolean
  readonly activeTabId: number | null
}
export type TabLookup = { readonly kind: "tab"; readonly tab: NativeTab } | { readonly kind: "gone" | "unavailable" }
export type TabReply<T> = RpcOutcome<T> | { readonly kind: "gone" }
export type TabNativePort = {
  query(site: Site | "all"): Promise<{ readonly kind: "tabs"; readonly tabs: readonly NativeTab[] } | { readonly kind: "unavailable" }>
  get(tabId: number): Promise<TabLookup>
  ping(tabId: number, milliseconds: number, signal: AbortSignal): Promise<TabReply<TabPing>>
  run<J extends Job>(tabId: number, invocation: JobInvocation<J>, milliseconds: number, signal: AbortSignal): Promise<TabReply<JobResult<J>>>
  view<View extends TabViewScope>(tabId: number, view: View, isView: (value: unknown) => value is View, milliseconds: number, signal: AbortSignal): Promise<TabReply<null>>
  dispose(): void
}
// Gather tabs' additions to the seam (ARC-ACC-72, ARC-ACC-76). A gathered tab is only read: address, title, place and access time,
// and the facts automatic gathering leaves tabs out by. Nothing here messages, injects into, activates, reloads or wakes a tab.
export type GatherTab = {
  readonly tabId: number
  readonly windowId: number
  readonly index: number
  readonly url: string
  readonly title: string
  readonly lastAccessed: number
  readonly incognito: boolean
  readonly active: boolean
  readonly pinned: boolean
  readonly audible: boolean
}
export type GatherTabRead = { readonly kind: "tab"; readonly tab: GatherTab; readonly status: "loading" | "complete" } | { readonly kind: "gone" | "unavailable" }
export type GatherNativePort = {
  // `null` reads every window at once, for automatic gathering's unvisited check (ARC-ACC-72).
  queryVideos(windowId: number | null, patterns: readonly string[]): Promise<{ readonly kind: "tabs"; readonly tabs: readonly GatherTab[] } | { readonly kind: "unavailable" }>
  read(tabId: number): Promise<GatherTabRead>
  // `reopened` marks an Undo reopen. Firefox opens it unloaded with its old title (ARC-ACC-76); other browsers ignore it.
  create(
    props: { readonly windowId: number; readonly url: string; readonly active: boolean; readonly index?: number },
    reopened?: { readonly title: string }
  ): Promise<{ readonly kind: "created"; readonly tabId: number } | { readonly kind: "window-gone" | "unavailable" }>
  createWindow(urls: readonly [string, ...string[]]): Promise<{ readonly kind: "created"; readonly tabIds: readonly number[] } | { readonly kind: "unavailable" }>
  remove(tabIds: readonly [number, ...number[]]): Promise<{ readonly kind: "removed" | "unavailable" }>
}
export type TabContext = { readonly tab: NativeTab & { readonly site: Site }; readonly info: TabPing }
export type TabViewProducer<View extends TabViewScope> = {
  produce(context: TabContext): Promise<{ readonly kind: "view"; readonly view: View } | { readonly kind: "unavailable" }>
  isView(value: unknown): value is View
}
export type AccountNeed = { readonly kind: "any" } | { readonly kind: "account"; readonly acct: AccountKey; readonly signedIn: boolean }
export type RoutingNeed = { readonly site: Site; readonly req: Requester; readonly account: AccountNeed }
export type RegistryResult = SessionWrite | { readonly kind: "remembered"; readonly scope: "private" }
export type AccountInView =
  | ({ readonly kind: "account"; readonly source: "active" | "recent"; readonly tabId: number } & AccountData)
  | { readonly kind: "account"; readonly source: "last-account"; readonly acct: AccountKey }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable"; readonly reason: "held" | "disposed" | "native" | "session" }
export type TabGuard = { readonly kind: "guard"; readonly reason: "held" | "disposed" | "site" | "privacy" | "accountChanged" | "signedOut" | "view" }
export type NoTab = { readonly kind: "no-tab"; readonly attempted: readonly number[] }
export type TabJobOutcome<J extends Job> =
  | { readonly kind: "result"; readonly tabId: number; readonly result: JobResult<J> }
  | {
      readonly kind: "transport"
      readonly tabId: number
      readonly failure: "gone" | Extract<RpcOutcome<never>, { kind: "failed" }>["failure"]
      readonly delivery: "unknown"
      readonly cleanup?: SessionWrite
    }
  | { readonly kind: "session"; readonly result: SessionRead | SessionWrite }
  | NoTab
  | TabGuard
export type TabsPorts = {
  readonly session: SessionPort
  readonly native: TabNativePort
  readonly registrar: {
    ensure(tabId: number, need: { readonly site: Site; readonly core: true; readonly signal: AbortSignal }): Promise<{ readonly kind: "ready" | "unavailable" }>
  }
  readonly accounts: {
    lastAccount(): Promise<AccountKey | null>
    hasSetup(acct: AccountKey): Promise<boolean>
  }
  readonly clock: { now(): number; wallNow(): number; readonly after: Deadline }
  enabled(): boolean
}
export type SeenResult<View extends TabViewScope> =
  | { readonly kind: "seen"; readonly registry: RegistryResult; readonly view: View }
  | { readonly kind: "session"; readonly result: SessionRead | SessionWrite }
  | { readonly kind: "unavailable" }
  | TabGuard
export type ViewTarget =
  | { readonly kind: "all" }
  | { readonly kind: "account"; readonly acct: AccountKey; readonly scope: "normal" | "private" | "all" }
  | { readonly kind: "tab"; readonly tabId: number }
export type PublicationResult = { readonly kind: "sent" | "skipped" }
export type Tabs = {
  known(target: ViewTarget, signal?: AbortSignal): Promise<readonly KnownTab[]>
  publish<View extends TabViewScope>(tab: KnownTab, producer: TabViewProducer<View>, signal: AbortSignal, beforeSend: () => boolean): Promise<PublicationResult>
  subscribeLifetime(revoked: () => void): () => void
  seen<View extends TabViewScope>(tabId: number, hello: TabHello, producer: TabViewProducer<View>): Promise<SeenResult<View>>
  accountInView(req: Requester): Promise<AccountInView>
  serve<J extends Job>(invocation: JobInvocation<J>, need: RoutingNeed): Promise<TabJobOutcome<J>>
  runIn<J extends Job>(tabId: number, invocation: JobInvocation<J>, need: RoutingNeed): Promise<TabJobOutcome<J>>
  push<View extends TabViewScope>(
    req: Requester,
    producer: TabViewProducer<View>
  ): Promise<{ readonly sent: number; readonly failed: number } | TabGuard | { readonly kind: "session"; readonly result: SessionRead | SessionWrite }>
  dispose(): void
}
