import { supportsJob, type AccountData, type Job, type JobInvocation } from "../../shared/contracts/jobs"
import { sameTabAccount, type TabHello, type TabPing, type TabViewScope } from "../../shared/contracts/tabs"
import { sessionAccountCurrent, type SessionRead, type SessionRevision, type SessionWrite } from "../store/session-memory"
import { replaceTab, TAB_LIMIT, type TabRecord } from "./records"
import type {
  AccountInView,
  NativeTab,
  RegistryResult,
  Requester,
  RoutingNeed,
  SeenResult,
  TabContext,
  TabGuard,
  TabJobOutcome,
  Tabs,
  TabsPorts,
  TabViewProducer,
  ViewTarget,
  PublicationResult
} from "./ports"

export const CANDIDATE_MS = 2_000
export const JOB_MS = 10_000
const MAX_CANDIDATES = 3
type Snapshot = Extract<SessionRead, { kind: "memory" }>
type RegistryFailure = Exclude<SessionWrite, { kind: "committed" }>
type Bounded<T> = { kind: "value"; value: T } | { kind: "timeout" | "disposed" | "failed" }
type Probe = { kind: "ready"; context: TabContext; expiresAt: number } | { kind: "miss" } | TabGuard | { kind: "session"; result: SessionWrite }

class LiveTab {
  private readonly lifetime = Symbol("known tab")
  constructor(
    readonly tabId: number,
    readonly acct: TabRecord["acct"],
    readonly privateTab: boolean
  ) {}
}
export type KnownTab = LiveTab
export function matchesViewTarget(tab: KnownTab, target: ViewTarget): boolean {
  switch (target.kind) {
    case "all":
      return true
    case "tab":
      return tab.tabId === target.tabId
    case "account":
      return tab.acct === target.acct && (target.scope === "all" || tab.privateTab === (target.scope === "private"))
  }
}

export function createTabs(ports: TabsPorts): Tabs {
  let disposed = false
  let privateRows: ReadonlyMap<number, TabRecord> = new Map()
  let adopted: { revision: SessionRevision; sequence: number } | undefined
  const pending = new Set<() => void>()
  const lifetimeListeners = new Set<() => void>()
  const live = new Map<number, { handle: KnownTab; row: TabRecord; windowId: number | null; build: TabPing["build"] | null }>()
  function trackLive(tabId: number, row: TabRecord, privateTab: boolean, native?: NativeTab, info?: TabPing) {
    const previous = live.get(tabId)
    if (
      previous &&
      previous.handle.privateTab === privateTab &&
      previous.row.site === row.site &&
      sameTabAccount(previous.row, row) &&
      (!native || previous.windowId === null || previous.windowId === native.windowId) &&
      (!info || previous.build === null || previous.build === info.build)
    ) {
      previous.row = row
      if (native) previous.windowId = native.windowId
      if (info) previous.build = info.build
      return
    }
    live.delete(tabId)
    live.set(tabId, { handle: new LiveTab(tabId, row.acct, privateTab), row, windowId: native?.windowId ?? null, build: info?.build ?? null })
    while (live.size > TAB_LIMIT * 2) {
      const first = live.keys().next()
      if (first.done) break
      live.delete(first.value)
    }
  }

  function guard(): TabGuard | undefined {
    if (disposed) return { kind: "guard", reason: "disposed" }
    if (!ports.enabled()) return { kind: "guard", reason: "held" }
  }
  function bounded<T>(milliseconds: number, work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<Bounded<T>> {
    if (disposed || signal?.aborted) return Promise.resolve({ kind: "disposed" })
    if (!ports.enabled() || milliseconds <= 0) return Promise.resolve({ kind: "timeout" })
    return new Promise(resolve => {
      let open = true,
        cancel = () => {}
      const controller = new AbortController()
      const finish = (value: Bounded<T>) => {
        if (!open) return
        open = false
        cancel()
        pending.delete(stop)
        signal?.removeEventListener("abort", stop)
        controller.abort()
        resolve(value)
      }
      const stop = () => finish({ kind: "disposed" })
      pending.add(stop)
      signal?.addEventListener("abort", stop, { once: true })
      cancel = ports.clock.after(milliseconds, () => finish({ kind: "timeout" }))
      if (!open) {
        cancel()
        return
      }
      try {
        work(controller.signal).then(
          value => finish({ kind: "value", value }),
          () => finish({ kind: "failed" })
        )
      } catch {
        finish({ kind: "failed" })
      }
    })
  }
  async function snapshot(signal?: AbortSignal): Promise<SessionRead> {
    const result = await bounded(CANDIDATE_MS, () => ports.session.read(), signal)
    if (result.kind !== "value") return { kind: "unavailable", reason: disposed ? "disposed" : "stale" }
    const read = result.value
    if (read.kind !== "memory") return read
    if (!adopted || read.sequence > adopted.sequence) {
      if (adopted) {
        const captured = adopted.revision
        privateRows = new Map([...privateRows].filter(([, row]) => sessionAccountCurrent(captured, read.revision, row.acct)))
      }
      if (adopted && adopted.revision.reset !== read.revision.reset) {
        live.clear()
        for (const listener of [...lifetimeListeners]) {
          try {
            listener()
          } catch {}
        }
      }
      for (const [tabId, row] of read.memory.tabs) {
        if (!live.get(tabId)?.handle.privateTab) trackLive(tabId, row, false)
      }
      adopted = { revision: read.revision, sequence: read.sequence }
    }
    return read
  }
  function eligible(tab: NativeTab, need: Pick<RoutingNeed, "site" | "req">): tab is NativeTab & { site: RoutingNeed["site"] } {
    return tab.site === need.site && tab.incognito === need.req.incognito && !tab.discarded && !tab.frozen
  }
  function infoRecord(info: TabPing, previous: TabRecord | undefined, hello?: TabHello): TabRecord {
    const same = previous && previous.site === info.site && sameTabAccount(previous, info) ? previous : undefined
    const extra = hello
      ? { hidden: hello.hidden, fresh: hello.fresh, at: ports.clock.wallNow() }
      : same
        ? { ...(same.hidden === undefined ? {} : { hidden: same.hidden }), ...(same.fresh === undefined ? {} : { fresh: same.fresh }), ...(same.at === undefined ? {} : { at: same.at }) }
        : {}
    const seenAt = !hello && same ? (same.seenAt ?? same.at ?? ports.clock.wallNow()) : ports.clock.wallNow()
    const account: AccountData = info.signedIn ? { signedIn: true, acct: info.acct } : { signedIn: false, acct: null }
    return { site: info.site, ...extra, seenAt, ...account }
  }
  async function remember(tab: NativeTab, info: TabPing, captured: Snapshot, hello?: TabHello): Promise<RegistryResult> {
    const rows = tab.incognito ? privateRows : captured.memory.tabs
    const row = infoRecord(info, rows.get(tab.tabId), hello)
    if (tab.incognito) {
      const current = await snapshot()
      if (current.kind !== "memory") return current
      if (!sessionAccountCurrent(captured.revision, current.revision, info.acct)) return { kind: "unavailable", reason: "revision" }
      if (guard()) return { kind: "unavailable", reason: disposed ? "disposed" : "consent-held" }
      privateRows = replaceTab(privateRows, tab.tabId, row)
      trackLive(tab.tabId, row, true, tab, info)
      return { kind: "remembered", scope: "private" }
    }
    const result = await ports.session.change({ revision: captured.revision, now: ports.clock.wallNow(), edits: [{ kind: "tab-seen", tabId: tab.tabId, info: row }] })
    if (result.kind === "committed" && !guard()) trackLive(tab.tabId, row, false, tab, info)
    return result
  }
  async function forget(tabId: number, incognito: boolean, captured: Snapshot): Promise<RegistryFailure | undefined> {
    if (disposed) return
    live.delete(tabId)
    if (incognito) {
      const next = new Map(privateRows)
      next.delete(tabId)
      privateRows = next
      return
    }
    const expected = captured.memory.tabs.get(tabId)
    if (expected) {
      const result = await ports.session.change({ revision: captured.revision, now: ports.clock.wallNow(), edits: [{ kind: "tab-forget", tabId, expected }] })
      if (result.kind !== "committed") return result
    }
  }
  async function probe(tabId: number, need: Pick<RoutingNeed, "site" | "req">, captured: Snapshot, injection: { used: boolean }, inject: boolean): Promise<Probe> {
    const started = ports.clock.now()
    const remaining = () => Math.max(0, CANDIDATE_MS - (ports.clock.now() - started))
    const result = await bounded(CANDIDATE_MS, async (signal): Promise<Probe> => {
      const stopped = () => signal.aborted || guard() !== undefined || remaining() <= 0
      const current = await ports.native.get(tabId)
      if (stopped()) return { kind: "miss" }
      if (current.kind === "gone") {
        const failed = await forget(tabId, need.req.incognito, captured)
        return failed ? { kind: "session", result: failed } : { kind: "miss" }
      }
      if (current.kind !== "tab") return { kind: "miss" }
      if (current.tab.incognito !== need.req.incognito) return { kind: "guard", reason: "privacy" }
      if (current.tab.site !== need.site) return { kind: "guard", reason: "site" }
      if (!eligible(current.tab, need)) return { kind: "miss" }
      let ping = await ports.native.ping(tabId, remaining(), signal)
      if (stopped()) return { kind: "miss" }
      if (ping.kind === "failed" && (ping.failure === "transport" || ping.failure === "invalid-answer") && inject && !injection.used) {
        injection.used = true
        const ensured = await ports.registrar.ensure(tabId, { site: need.site, core: true, signal })
        if (stopped() || ensured.kind !== "ready") return { kind: "miss" }
        const after = await ports.native.get(tabId)
        if (stopped() || after.kind !== "tab" || !eligible(after.tab, need)) return { kind: "miss" }
        ping = await ports.native.ping(tabId, remaining(), signal)
      }
      if (stopped()) return { kind: "miss" }
      if (ping.kind === "gone") {
        const failed = await forget(tabId, need.req.incognito, captured)
        return failed ? { kind: "session", result: failed } : { kind: "miss" }
      }
      if (ping.kind !== "answered" || ping.result.site !== need.site) return { kind: "miss" }
      const latest = await ports.native.get(tabId)
      if (stopped()) return { kind: "miss" }
      if (latest.kind === "gone") {
        const failed = await forget(tabId, need.req.incognito, captured)
        return failed ? { kind: "session", result: failed } : { kind: "miss" }
      }
      if (latest.kind !== "tab" || !eligible(latest.tab, need) || latest.tab.windowId !== current.tab.windowId) return { kind: "miss" }
      const registry = await remember(latest.tab, ping.result, captured)
      if (stopped()) return { kind: "miss" }
      if (registry.kind !== "committed" && registry.kind !== "remembered") return { kind: "session", result: registry }
      return { kind: "ready", context: { tab: { ...latest.tab, site: need.site }, info: ping.result }, expiresAt: started + CANDIDATE_MS }
    })
    if (result.kind === "value") return result.value
    return guard() ?? { kind: "miss" }
  }
  function accountGuard(info: TabPing, need: RoutingNeed): TabGuard | undefined {
    if (need.account.kind === "any") return
    if (need.account.signedIn && !info.signedIn) return { kind: "guard", reason: "signedOut" }
    if (info.acct !== need.account.acct) return { kind: "guard", reason: "accountChanged" }
  }
  function invocationGuard<J extends Job>(invocation: JobInvocation<J>, need: RoutingNeed): TabGuard | undefined {
    if (!supportsJob(need.site, invocation.job.kind)) return { kind: "guard", reason: "site" }
    if ("acct" in invocation && invocation.acct !== undefined && (need.account.kind !== "account" || need.account.acct !== invocation.acct)) return { kind: "guard", reason: "accountChanged" }
  }
  async function dispatch<J extends Job>(context: TabContext, expiresAt: number, invocation: JobInvocation<J>, need: RoutingNeed, captured: Snapshot): Promise<TabJobOutcome<J>> {
    const stopped = guard() ?? accountGuard(context.info, need)
    if (stopped) return stopped
    const remaining = () => Math.max(0, expiresAt - ports.clock.now())
    const prepared = await bounded(remaining(), async (signal): Promise<{ kind: "ready" } | TabJobOutcome<J>> => {
      const current = await ports.native.get(context.tab.tabId)
      if (signal.aborted || guard()) return guard() ?? { kind: "guard", reason: "disposed" }
      if (current.kind === "gone") {
        const failed = await forget(context.tab.tabId, need.req.incognito, captured)
        return failed ? { kind: "session", result: failed } : { kind: "no-tab", attempted: [context.tab.tabId] }
      }
      if (current.kind !== "tab") return { kind: "transport", tabId: context.tab.tabId, failure: "transport", delivery: "unknown" }
      if (current.tab.incognito !== need.req.incognito) return { kind: "guard", reason: "privacy" }
      if (!eligible(current.tab, need) || current.tab.windowId !== context.tab.windowId) return { kind: "guard", reason: "site" }
      // The endpoint must guard the invocation's account again after this ping.
      const ping = await ports.native.ping(context.tab.tabId, remaining(), signal)
      if (signal.aborted || guard()) return guard() ?? { kind: "guard", reason: "disposed" }
      if (ping.kind === "gone") {
        const failed = await forget(context.tab.tabId, need.req.incognito, captured)
        return failed ? { kind: "session", result: failed } : { kind: "no-tab", attempted: [context.tab.tabId] }
      }
      if (ping.kind !== "answered") return { kind: "transport", tabId: context.tab.tabId, failure: ping.failure, delivery: "unknown" }
      if (ping.result.site !== need.site) return { kind: "guard", reason: "site" }
      const changed = accountGuard(ping.result, need)
      if (changed) return changed
      const checked = await ports.native.get(context.tab.tabId)
      if (signal.aborted || guard()) return guard() ?? { kind: "guard", reason: "disposed" }
      if (checked.kind !== "tab" || !eligible(checked.tab, need) || checked.tab.windowId !== current.tab.windowId) return { kind: "no-tab", attempted: [context.tab.tabId] }
      return { kind: "ready" }
    })
    if (prepared.kind !== "value") return guard() ?? { kind: "no-tab", attempted: [context.tab.tabId] }
    if (prepared.value.kind !== "ready") return prepared.value
    if (guard() || remaining() <= 0) return guard() ?? { kind: "no-tab", attempted: [context.tab.tabId] }
    const result = await bounded(JOB_MS, async (signal): Promise<TabJobOutcome<J>> => {
      const answer = await ports.native.run<J>(context.tab.tabId, invocation, JOB_MS, signal)
      if (answer.kind === "answered") return { kind: "result", tabId: context.tab.tabId, result: answer.result }
      const cleanup = answer.kind === "gone" ? await forget(context.tab.tabId, need.req.incognito, captured) : undefined
      return { kind: "transport", tabId: context.tab.tabId, failure: answer.kind === "gone" ? "gone" : answer.failure, delivery: "unknown", ...(cleanup ? { cleanup } : {}) }
    })
    if (result.kind === "value") return result.value
    return guard() ?? { kind: "transport", tabId: context.tab.tabId, failure: result.kind === "timeout" ? "timeout" : "transport", delivery: "unknown" }
  }
  async function seen<View extends TabViewScope>(tabId: number, hello: TabHello, producer: TabViewProducer<View>): Promise<SeenResult<View>> {
    const stopped = guard()
    if (stopped) return stopped
    const captured = await snapshot()
    if (captured.kind !== "memory") return { kind: "session", result: captured }
    const result = await bounded(CANDIDATE_MS, async (signal): Promise<SeenResult<View>> => {
      const native = await ports.native.get(tabId)
      if (signal.aborted || guard()) return guard() ?? { kind: "unavailable" }
      if (native.kind !== "tab" || native.tab.site !== hello.site) return { kind: "guard", reason: "site" }
      const registry = await remember(native.tab, hello, captured, hello)
      if (signal.aborted || guard()) return guard() ?? { kind: "unavailable" }
      if (registry.kind !== "committed" && registry.kind !== "remembered") return { kind: "session", result: registry }
      const projected = await producer.produce({ tab: { ...native.tab, site: hello.site }, info: hello })
      if (signal.aborted || guard()) return guard() ?? { kind: "unavailable" }
      if (
        projected.kind !== "view" ||
        !producer.isView(projected.view) ||
        projected.view.private !== native.tab.incognito ||
        projected.view.build !== hello.build ||
        !sameTabAccount(projected.view, hello)
      )
        return { kind: "guard", reason: "view" }
      const current = await ports.native.get(tabId)
      if (signal.aborted || guard()) return guard() ?? { kind: "unavailable" }
      if (current.kind !== "tab" || current.tab.site !== hello.site || current.tab.incognito !== native.tab.incognito || current.tab.windowId !== native.tab.windowId) return { kind: "unavailable" }
      return { kind: "seen", registry, view: projected.view }
    })
    return result.kind === "value" ? result.value : (guard() ?? { kind: "unavailable" })
  }
  async function accountInView(req: Requester): Promise<AccountInView> {
    const stopped = guard()
    if (stopped) return { kind: "unavailable", reason: stopped.reason === "disposed" ? "disposed" : "held" }
    const captured = await snapshot()
    if (captured.kind !== "memory") return { kind: "unavailable", reason: "session" }
    const native = await bounded(CANDIDATE_MS, () => ports.native.query("all"))
    if (guard()) return { kind: "unavailable", reason: disposed ? "disposed" : "held" }
    if (native.kind !== "value" || native.value.kind !== "tabs") return { kind: "unavailable", reason: "native" }
    const sameKind = native.value.tabs.filter(tab => tab.incognito === req.incognito && tab.site !== null && !tab.discarded && !tab.frozen)
    const active = sameKind.find(tab => tab.tabId === req.activeTabId && tab.windowId === req.windowId)
    const recent = sameKind.filter(tab => tab !== active).sort((a, b) => b.lastAccessed - a.lastAccessed || a.tabId - b.tabId)
    const candidates = (active ? [active, ...recent] : recent).slice(0, MAX_CANDIDATES)
    for (const tab of candidates) {
      if (tab.site === null) continue
      const found = await probe(tab.tabId, { site: tab.site, req }, captured, { used: false }, false)
      if (found.kind === "ready")
        return {
          kind: "account",
          source: tab === active ? "active" : "recent",
          tabId: tab.tabId,
          ...(found.context.info.signedIn ? { signedIn: true, acct: found.context.info.acct } : { signedIn: false, acct: null })
        }
      if (found.kind === "session") return { kind: "unavailable", reason: "session" }
      if (guard()) return { kind: "unavailable", reason: disposed ? "disposed" : "held" }
    }
    if (req.incognito) return { kind: "none" }
    const fallback = await bounded(CANDIDATE_MS, async () => {
      const acct = await ports.accounts.lastAccount({ kind: "normal-window", windowId: req.windowId, incognito: false })
      return acct !== null && (await ports.accounts.hasSetup(acct)) ? acct : null
    })
    if (guard()) return { kind: "unavailable", reason: disposed ? "disposed" : "held" }
    return fallback.kind === "value" && fallback.value !== null ? { kind: "account", source: "last-account", acct: fallback.value } : { kind: "none" }
  }
  async function serve<J extends Job>(invocation: JobInvocation<J>, need: RoutingNeed): Promise<TabJobOutcome<J>> {
    const stopped = guard() ?? invocationGuard(invocation, need)
    if (stopped) return stopped
    const captured = await snapshot()
    if (captured.kind !== "memory") return { kind: "session", result: captured }
    const queried = await bounded(CANDIDATE_MS, () => ports.native.query(need.site))
    if (queried.kind !== "value" || queried.value.kind !== "tabs") return guard() ?? { kind: "no-tab", attempted: [] }
    const rows = need.req.incognito ? privateRows : captured.memory.tabs
    const candidates = queried.value.tabs
      .filter(tab => eligible(tab, need))
      .filter(tab => {
        const row = rows.get(tab.tabId)
        return need.account.kind === "any" || row === undefined || row.site !== need.site || row.acct === need.account.acct
      })
    const rank = (tab: NativeTab) =>
      tab.tabId === need.req.activeTabId && tab.windowId === need.req.windowId ? 0 : rows.get(tab.tabId)?.acct === (need.account.kind === "account" ? need.account.acct : undefined) ? 1 : 2
    candidates.sort((a, b) => rank(a) - rank(b) || b.lastAccessed - a.lastAccessed || a.tabId - b.tabId)
    const attempted: number[] = [],
      injection = { used: false }
    for (const tab of candidates.slice(0, MAX_CANDIDATES)) {
      if (guard()) return guard() ?? { kind: "no-tab", attempted }
      attempted.push(tab.tabId)
      const found = await probe(tab.tabId, need, captured, injection, true)
      if (found.kind === "session") return found
      if (found.kind === "guard") {
        if (found.reason === "site" || found.reason === "privacy") continue
        return found
      }
      if (found.kind === "ready" && !accountGuard(found.context.info, need)) {
        const dispatched = await dispatch(found.context, found.expiresAt, invocation, need, captured)
        if (dispatched.kind === "no-tab" || (dispatched.kind === "guard" && ["accountChanged", "signedOut", "site", "privacy"].includes(dispatched.reason))) continue
        return dispatched
      }
    }
    return { kind: "no-tab", attempted }
  }
  async function runIn<J extends Job>(tabId: number, invocation: JobInvocation<J>, need: RoutingNeed): Promise<TabJobOutcome<J>> {
    const stopped = guard() ?? invocationGuard(invocation, need)
    if (stopped) return stopped
    const captured = await snapshot()
    if (captured.kind !== "memory") return { kind: "session", result: captured }
    const found = await probe(tabId, need, captured, { used: false }, true)
    return found.kind === "ready"
      ? dispatch(found.context, found.expiresAt, invocation, need, captured)
      : found.kind === "session" || found.kind === "guard"
        ? found
        : { kind: "no-tab", attempted: [tabId] }
  }
  async function push<View extends TabViewScope>(req: Requester, producer: TabViewProducer<View>) {
    const stopped = guard()
    if (stopped) return stopped
    const captured = await snapshot()
    if (captured.kind !== "memory") return { kind: "session" as const, result: captured }
    const rows = req.incognito ? privateRows : captured.memory.tabs
    let sent = 0,
      failed = 0
    for (const [tabId, row] of [...rows].slice(0, TAB_LIMIT)) {
      const stopped = guard()
      if (stopped) return stopped
      const native = await bounded(CANDIDATE_MS, () => ports.native.get(tabId))
      if (native.kind !== "value" || native.value.kind !== "tab") {
        if (native.kind === "value" && native.value.kind === "gone") {
          const cleanup = await bounded(CANDIDATE_MS, () => forget(tabId, req.incognito, captured))
          if (guard()) return guard() ?? { sent, failed }
          if (cleanup.kind === "value" && cleanup.value) return { kind: "session" as const, result: cleanup.value }
        }
        failed++
        continue
      }
      const found = await probe(tabId, { site: row.site, req }, captured, { used: true }, false)
      if (found.kind === "session") return found
      if (found.kind !== "ready") {
        failed++
        continue
      }
      const context = found.context
      const answer = await bounded(CANDIDATE_MS, async (signal): Promise<boolean | { kind: "session"; result: SessionWrite }> => {
        const projected = await producer.produce(context)
        if (
          signal.aborted ||
          guard() ||
          projected.kind !== "view" ||
          !producer.isView(projected.view) ||
          projected.view.private !== req.incognito ||
          projected.view.build !== context.info.build ||
          !sameTabAccount(projected.view, context.info)
        )
          return false
        const ping = await ports.native.ping(tabId, CANDIDATE_MS, signal)
        if (signal.aborted || guard() || ping.kind !== "answered" || ping.result.site !== row.site || !sameTabAccount(ping.result, context.info)) return false
        const latest = await ports.native.get(tabId)
        if (signal.aborted || guard() || latest.kind !== "tab" || !eligible(latest.tab, { site: row.site, req })) return false
        const reply = await ports.native.view(tabId, projected.view, producer.isView, CANDIDATE_MS, signal)
        if (reply.kind === "gone") {
          const failed = await forget(tabId, req.incognito, captured)
          if (failed) return { kind: "session", result: failed }
        }
        return reply.kind === "answered"
      })
      if (guard()) return guard() ?? { sent, failed }
      if (answer.kind === "value" && typeof answer.value !== "boolean") return answer.value
      if (answer.kind === "value" && answer.value) sent++
      else failed++
    }
    return { sent, failed }
  }
  async function known(target: ViewTarget, signal?: AbortSignal): Promise<readonly KnownTab[]> {
    if (guard() || signal?.aborted) return []
    const read = await snapshot(signal)
    if (guard() || signal?.aborted || read.kind !== "memory") return []
    return [...live.values()].map(row => row.handle).filter(tab => matchesViewTarget(tab, target))
  }
  async function publish<View extends TabViewScope>(handle: KnownTab, producer: TabViewProducer<View>, signal: AbortSignal, beforeSend: () => boolean): Promise<PublicationResult> {
    const record = live.get(handle.tabId)
    const valid = () => !signal.aborted && !guard() && live.get(handle.tabId) === record && record?.handle === handle
    if (!record || !valid()) return { kind: "skipped" }
    const answer = await bounded(
      CANDIDATE_MS,
      async (cancellation): Promise<PublicationResult> => {
        const stopped = () => cancellation.aborted || !valid()
        const captured = await snapshot(cancellation)
        if (stopped() || captured.kind !== "memory") return { kind: "skipped" }
        const native = await ports.native.get(handle.tabId)
        if (stopped() || native.kind !== "tab") {
          if (native.kind === "gone") live.delete(handle.tabId)
          return { kind: "skipped" }
        }
        const eligibleCore = (tab: NativeTab) =>
          tab.site === record.row.site && tab.incognito === handle.privateTab && !tab.discarded && !tab.frozen && (record.windowId === null || record.windowId === tab.windowId)
        if (!eligibleCore(native.tab) || native.tab.site === null) return { kind: "skipped" }
        const ping = await ports.native.ping(handle.tabId, CANDIDATE_MS, cancellation)
        if (stopped() || ping.kind !== "answered" || ping.result.site !== native.tab.site || !sameTabAccount(ping.result, record.row) || (record.build !== null && record.build !== ping.result.build))
          return { kind: "skipped" }
        const context: TabContext = { tab: { ...native.tab, site: native.tab.site }, info: ping.result }
        const projected = await producer.produce(context)
        if (
          stopped() ||
          projected.kind !== "view" ||
          !producer.isView(projected.view) ||
          projected.view.build !== context.info.build ||
          projected.view.private !== handle.privateTab ||
          !sameTabAccount(projected.view, context.info)
        )
          return { kind: "skipped" }
        const latestPing = await ports.native.ping(handle.tabId, CANDIDATE_MS, cancellation)
        if (
          stopped() ||
          latestPing.kind !== "answered" ||
          latestPing.result.site !== context.info.site ||
          latestPing.result.build !== context.info.build ||
          !sameTabAccount(latestPing.result, context.info)
        )
          return { kind: "skipped" }
        const revision = await snapshot(cancellation)
        if (stopped() || revision.kind !== "memory" || !sessionAccountCurrent(captured.revision, revision.revision, context.info.acct)) return { kind: "skipped" }
        const latest = await ports.native.get(handle.tabId)
        if (stopped() || latest.kind !== "tab" || !eligibleCore(latest.tab) || latest.tab.windowId !== native.tab.windowId || !beforeSend() || stopped()) return { kind: "skipped" }
        const reply = await ports.native.view(handle.tabId, projected.view, producer.isView, CANDIDATE_MS, cancellation)
        if (reply.kind === "gone" && valid()) live.delete(handle.tabId)
        return { kind: !stopped() && reply.kind === "answered" ? "sent" : "skipped" }
      },
      signal
    )
    return answer.kind === "value" ? answer.value : { kind: "skipped" }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const listener of [...lifetimeListeners]) {
      try {
        listener()
      } catch {}
    }
    lifetimeListeners.clear()
    live.clear()
    for (const stop of [...pending]) stop()
    privateRows = new Map()
    ports.native.dispose()
  }
  return {
    seen,
    accountInView,
    serve,
    runIn,
    push,
    known,
    publish,
    subscribeLifetime(listener) {
      if (disposed) {
        listener()
        return () => {}
      }
      lifetimeListeners.add(listener)
      return () => {
        lifetimeListeners.delete(listener)
      }
    },
    dispose
  }
}
