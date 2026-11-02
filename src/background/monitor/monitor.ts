import { isBreakageSignal } from "../../shared/contracts/diagnostics"
import { isTabViewFacts, sameTabViewFacts, isPageFeatureId, type FeatureStatus, type TabFeature } from "../../shared/contracts/tab-view"
import type { AccountKey } from "../../shared/model/validation"
import type { FeatureId, JobId } from "../../shared/contracts/vocabulary"
import type { AnchorId } from "../../shared/features/registry"
import { anchors } from "../../shared/features/registry"
import type { TabContext } from "../tabs/ports"
import { tabViewFacts, type StatusProducer, type NoticeProducer, type StatusRead } from "../tab-view/producer"
import { sessionAccountCurrent, type SessionEdit, type SessionRead, type SessionRevision, type SessionWrite } from "../store/session-memory"
import { applyMonitorOperation, emptyMonitorJournal, isMonitorInstance, readMonitorBucket, type MonitorJournal, type MonitorOperation, type SignalEvidence } from "../store/monitor-session"
import { anchorMissing, deriveStatus, pageStatuses } from "./derive"
import type { AnchorObservation, ContextRead, EnabledMonitorFeature, MonitorPorts, MonitorViewChange } from "./ports"
import { MONITOR_BATCH_MS, MONITOR_SIGNALS, MONITOR_WRITE_MS } from "./thresholds"

type MemoryRead = Extract<SessionRead, { kind: "memory" }>
type ContextLease = Extract<ContextRead, { kind: "context" }>
type Capture = { readonly context: TabContext; readonly lease: ContextLease; readonly read: MemoryRead; readonly generation: number; readonly noticeExpiry: number | null }
type Pending = { readonly acct: AccountKey | null; readonly revision: SessionRevision; readonly operation: MonitorOperation }
type Acknowledged = { readonly acct: AccountKey | null; readonly revision: SessionRevision; readonly key: string }
type PendingNotice = { readonly key: string; readonly feature: FeatureId; readonly site: "www" | "music"; readonly private: boolean; readonly acct: AccountKey | null; readonly revision: SessionRevision; readonly dueAt: number }
export type NoticeToken = { readonly instance: MonitorPorts["instance"]; readonly sequence: number }
type Delivery = { readonly token: NoticeToken; readonly capture: Capture; readonly keys: readonly string[] }
export type MonitorWrite = SessionWrite | { readonly kind: "idle" | "disposed" } | { readonly kind: "deferred"; readonly at: number }
export type NonBreakage = "signed-out" | "account-changed" | "rate-limited" | "server-error" | "offline" | "status-failed"
type RecordResult = { readonly kind: "accepted"; readonly scope: "normal" | "private" } | { readonly kind: "unavailable" | "invalid" } | { readonly kind: "write"; readonly result: SessionWrite }
const unavailable = { kind: "unavailable" } as const
const noticeKey = (site: "www" | "music", feature: FeatureId) => `monitor:${site}:${feature}`
const pendingKey = (privateTab: boolean, key: string) => `${privateTab ? "private" : "normal"}:${key}`

export function createMonitor(ports: MonitorPorts) {
  if (!isMonitorInstance(ports.instance)) throw Error("Monitor requires an injected instance identity")
  const vocabulary = structuredClone(ports.vocabulary)
  let disposed = false, generation = 0, sequence = 0, deliverySequence = 0
  let knownRevision: SessionRevision | undefined, lastWrittenAt: number | undefined, flushAt: number | undefined
  let cancelFlush: (() => void) | undefined, cancelNotice: (() => void) | undefined, noticeAt: number | undefined
  let pending: Pending[] = [], acknowledged: Acknowledged[] = []
  const privateJournals = new Map<AccountKey | null, MonitorJournal>()
  const shownNormal = new Set<string>(), shownPrivate = new Set<string>(), notices = new Map<string, PendingNotice>()
  const deliveries = new Map<number, Delivery>(), listeners = new Set<() => void>()
  const viewListeners = new Set<(event: MonitorViewChange) => void>()
  const viewRevocations = new Set<() => void>()
  type ObservedView = { context: TabContext; enabled: readonly TabFeature[]; baseline: string | undefined; running: boolean; dirty: boolean }
  const observedViews = new Map<number, ObservedView>()
  function observeView(context: TabContext, enabled: readonly TabFeature[]) {
    const previous = observedViews.get(context.tab.tabId)
    if (previous && sameTabViewFacts(tabViewFacts(previous.context), tabViewFacts(context))) {
      previous.enabled = structuredClone(enabled)
      return
    }
    observedViews.set(context.tab.tabId, { context: structuredClone(context), enabled: structuredClone(enabled), baseline: undefined, running: false, dirty: false })
  }
  async function refreshView(row: ObservedView): Promise<void> {
    if (row.running || disposed || !viewListeners.size) return
    row.running = true
    try {
      while (row.dirty && !disposed && viewListeners.size && observedViews.get(row.context.tab.tabId) === row) {
        row.dirty = false
        const health = await statuses(row.context, row.enabled)
        if (disposed || health.kind !== "statuses" || !health.current()) continue
        const page = pageStatuses(health.statuses, row.enabled)
        const notices = await readNotices(row.context, page)
        if (disposed || !viewListeners.size || observedViews.get(row.context.tab.tabId) !== row || !health.current() || notices.kind !== "notices" || !notices.current()) continue
        const next = JSON.stringify({ statuses: page, notices: notices.notices })
        const changed = row.baseline !== undefined && row.baseline !== next
        row.baseline = next
        if (changed) for (const listener of [...viewListeners]) {
          if (disposed || !viewListeners.has(listener)) continue
          try { listener({ kind: "tab", tabId: row.context.tab.tabId }) } catch {}
        }
      }
    } catch { /* An unavailable projection supplies no evidence of a view change. */ }
    finally { row.running = false }
  }
  let flushing: Promise<MonitorWrite> | undefined
  const changed = (revisionOnly = false) => {
    if (!revisionOnly) generation++
    for (const listener of [...listeners]) { try { listener() } catch { /* One subscriber cannot revoke another subscriber's update. */ } }
    for (const row of observedViews.values()) { row.dirty = true; void refreshView(row) }
  }
  const unsubscribe = ports.authority.subscribe(event => {
    if (disposed) return
    if (event.kind === "removal") {
      pending = pending.filter(row => row.acct !== event.acct)
      acknowledged = acknowledged.filter(row => row.acct !== event.acct)
      privateJournals.delete(event.acct)
      for (const [key, notice] of notices) if (notice.acct === event.acct) notices.delete(key)
    }
    changed()
  })
  function absorbRevision(read: MemoryRead): void {
    const previous = knownRevision
    const revoked = previous && (previous.reset !== read.revision.reset || [...new Set([...previous.accounts.keys(), ...read.revision.accounts.keys()])].some(acct => !sessionAccountCurrent(previous, read.revision, acct)))
    if (revoked) {
      for (const acct of privateJournals.keys()) if (!sessionAccountCurrent(previous, read.revision, acct)) privateJournals.delete(acct)
      pending = pending.filter(row => sessionAccountCurrent(row.revision, read.revision, row.acct))
      acknowledged = acknowledged.filter(row => sessionAccountCurrent(row.revision, read.revision, row.acct))
      for (const [key, notice] of notices) if (!sessionAccountCurrent(notice.revision, read.revision, notice.acct)) notices.delete(key)
      deliveries.clear()
    }
    knownRevision = structuredClone(read.revision)
    if (revoked) changed(true)
    const storedTime = read.memory.breakage.global.monitorWrittenAt
    if (typeof storedTime === "number") lastWrittenAt = storedTime
  }
  async function capture(input: TabContext): Promise<Capture | undefined> {
    if (disposed) return
    const initial = generation, context = structuredClone(input), facts = tabViewFacts(context)
    if (!isTabViewFacts(facts)) return
    let lease: ContextRead, read: SessionRead
    try {
      lease = await ports.authority.capture(structuredClone(context))
      if (disposed || initial !== generation || lease.kind !== "context" || !lease.current() || !sameTabViewFacts(facts, lease.facts)) return
      read = await ports.owner.readSession()
    } catch { return }
    if (disposed || initial !== generation || read.kind !== "memory" || !lease.current()) return
    absorbRevision(read)
    const expiries = facts.private ? [] : [...read.memory.monitorClaims.values()].map(claim => claim.until).filter(until => until > ports.clock.now())
    return { context, lease, read, generation, noticeExpiry: expiries.length ? Math.min(...expiries) : null }
  }
  const current = (captured: Capture) => !disposed && captured.generation === generation && captured.lease.current() &&
    !!knownRevision && sessionAccountCurrent(captured.read.revision, knownRevision, captured.lease.facts.acct) &&
    (captured.noticeExpiry === null || ports.clock.now() < captured.noticeExpiry)
  function journal(captured: Capture): MonitorJournal | undefined {
    const facts = captured.lease.facts, acct = facts.acct
    if (facts.private) return structuredClone(privateJournals.get(acct) ?? emptyMonitorJournal)
    const bucket = acct === null ? captured.read.memory.breakage.global : captured.read.memory.breakage.accounts.get(acct) ?? {}
    let state = readMonitorBucket(bucket, vocabulary)
    if (!state) return
    for (const item of pending) if (item.acct === acct && sessionAccountCurrent(item.revision, captured.read.revision, acct)) {
      if (!Object.hasOwn(state.seen, item.operation.instance) && Object.keys(state.seen).length >= MONITOR_SIGNALS) return
      state = applyMonitorOperation(state, item.operation)
    }
    return state
  }
  function armFlush(): void {
    if (disposed || cancelFlush || !pending.length && !acknowledged.length) return
    const now = ports.clock.now()
    flushAt = Math.max(now + MONITOR_WRITE_MS, lastWrittenAt === undefined ? now : lastWrittenAt + MONITOR_WRITE_MS)
    const at = flushAt
    cancelFlush = ports.clock.after(Math.max(0, at - now), () => {
      cancelFlush = undefined
      if (disposed || flushAt !== at) return
      void flush()
    })
  }
  function armNotice(): void {
    if (disposed || cancelNotice) return
    const now = ports.clock.now(), next = [...notices.values()].map(notice => notice.dueAt).filter(at => at > now).sort((a, b) => a - b)[0]
    if (next === undefined) return
    noticeAt = next
    cancelNotice = ports.clock.after(next - now, () => {
      cancelNotice = undefined
      if (disposed || noticeAt !== next) return
      noticeAt = undefined; changed(); armNotice()
    })
  }
  async function record(input: TabContext, create: (base: { instance: MonitorPorts["instance"]; sequence: number; tabId: number; site: "www" | "music" }) => MonitorOperation): Promise<RecordResult> {
    const captured = await capture(input)
    if (!captured || !current(captured) || pending.length + acknowledged.length >= 2_000) return unavailable
    const state = journal(captured)
    if (!state || !Object.hasOwn(state.seen, ports.instance) && Object.keys(state.seen).length >= MONITOR_SIGNALS) return unavailable
    const facts = captured.lease.facts
    const operation = create({ instance: ports.instance, sequence: ++sequence, tabId: facts.tabId, site: facts.site })
    if (facts.private) privateJournals.set(facts.acct, applyMonitorOperation(state, operation))
    else pending.push({ acct: facts.acct, revision: structuredClone(captured.read.revision), operation: structuredClone(operation) })
    changed(); armFlush()
    return { kind: "accepted", scope: facts.private ? "private" : "normal" }
  }
  async function signal(context: TabContext, value: unknown, evidence: Exclude<SignalEvidence, { kind: "anchor" }>): Promise<RecordResult> {
    if (!isBreakageSignal(value, vocabulary) || value.site !== context.tab.site || value.count !== 1 || value.kind === "anchor-missing" ||
      value.kind === "cannot-measure" && (evidence.kind !== "playback" || value.feature !== "auto-add") ||
      evidence.kind === "gather" && value.feature !== "gather") return { kind: "invalid" }
    const safe = structuredClone(value), facts = structuredClone(evidence)
    return record(context, base => ({ ...base, kind: "signal", signal: safe, evidence: facts }))
  }
  async function observeAnchor(context: TabContext, input: { readonly anchor: AnchorId; readonly observation: AnchorObservation; readonly signal: unknown }): Promise<RecordResult> {
    if (anchors[input.anchor].site !== context.tab.site || !anchorMissing(input.observation) || !isBreakageSignal(input.signal, vocabulary) || input.signal.kind !== "anchor-missing" || input.signal.site !== context.tab.site || input.signal.count !== 1) return { kind: "invalid" }
    const safe = structuredClone(input.signal)
    return record(context, base => ({ ...base, kind: "signal", signal: safe, evidence: { kind: "anchor", anchor: input.anchor } }))
  }
  async function statuses(context: TabContext, enabled: readonly EnabledMonitorFeature[]) {
    const captured = await capture(context)
    if (!captured) return unavailable
    let health
    try { health = await ports.authority.health(structuredClone(captured.context)) } catch { return unavailable }
    if (!current(captured) || health.kind !== "health" || !health.current() || health.facts.site !== captured.lease.facts.site) return unavailable
    const state = journal(captured)
    if (!state) return unavailable
    const derived = deriveStatus({ enabled: structuredClone(enabled), facts: structuredClone(health.facts), journal: state, tabId: captured.lease.facts.tabId })
    if (derived.kind !== "statuses") return unavailable
    const healthLease = health
    return { kind: "statuses", facts: structuredClone(captured.lease.facts), statuses: structuredClone(derived.statuses), current: () => current(captured) && healthLease.current() } as const
  }
  const statusProducer: StatusProducer = { async read(context, enabled) {
    const result = await statuses(context, enabled)
    if (result.kind !== "statuses") return unavailable
    observeView(context, enabled)
    return { ...result, statuses: pageStatuses(result.statuses, enabled) }
  } }
  function shown(captured: Capture, key: string): boolean {
    return captured.lease.facts.private ? shownPrivate.has(key) : shownNormal.has(key) || captured.read.memory.shown.global.has(key)
  }
  async function wouldAct(context: TabContext, enabled: readonly EnabledMonitorFeature[], feature: FeatureId): Promise<RecordResult> {
    const result = await statuses(context, enabled)
    if (result.kind !== "statuses" || !result.current()) return unavailable
    if (!result.statuses.some(status => status.feature === feature && status.state === "not-working")) {
      if (notices.delete(pendingKey(result.facts.private, noticeKey(result.facts.site, feature)))) changed()
      return { kind: "accepted", scope: result.facts.private ? "private" : "normal" }
    }
    const captured = await capture(context)
    if (!captured || !result.current() || !current(captured)) return unavailable
    const facts = captured.lease.facts, key = noticeKey(facts.site, feature), id = pendingKey(facts.private, key)
    if (!shown(captured, key) && !notices.has(id)) {
      const existing = [...notices.values()].find(notice => notice.site === facts.site && notice.private === facts.private && notice.dueAt > ports.clock.now())
      notices.set(id, { key, site: facts.site, private: facts.private, feature, acct: facts.acct, revision: structuredClone(captured.read.revision), dueAt: existing?.dueAt ?? ports.clock.now() + MONITOR_BATCH_MS })
      changed(); armNotice()
    }
    return { kind: "accepted", scope: facts.private ? "private" : "normal" }
  }
  function due(captured: Capture, statuses: readonly FeatureStatus[]): PendingNotice[] {
    const facts = captured.lease.facts
    if (!captured.lease.visible || captured.lease.fullscreen) return []
    return [...notices.values()].filter(notice => {
      const claim = facts.private ? undefined : captured.read.memory.monitorClaims.get(notice.key)
      if (claim && claim.until > ports.clock.now() && ![...deliveries.values()].some(delivery => current(delivery.capture) && `${delivery.token.instance}:${delivery.token.sequence}` === claim.token)) return false
      return notice.site === facts.site && notice.private === facts.private && notice.dueAt <= ports.clock.now() &&
      sessionAccountCurrent(notice.revision, captured.read.revision, notice.acct) && !shown(captured, notice.key) &&
      statuses.some(status => status.feature === notice.feature && status.state === "not-working")
    })
  }
  async function readNotices(context: TabContext, statuses: readonly FeatureStatus[]): ReturnType<NoticeProducer["read"]> {
    const captured = await capture(context)
    if (!captured || !current(captured)) return unavailable
    const rows = due(captured, statuses)
    const allowed = rows.filter(row => ![...deliveries.values()].some(delivery => delivery.keys.includes(pendingKey(row.private, row.key)) && delivery.capture.lease.facts.tabId !== captured.lease.facts.tabId && current(delivery.capture)))
    const features = allowed.map(row => row.feature).filter(isPageFeatureId)
    return { kind: "notices", facts: structuredClone(captured.lease.facts), notices: features.length ? [{ kind: "not-working", features }] : [], current: () => current(captured) }
  }
  const noticeProducer: NoticeProducer = { async read(context, statuses) {
    const result = await readNotices(context, statuses)
    const observed = observedViews.get(context.tab.tabId)
    if (result.kind === "notices" && result.current() && observed && sameTabViewFacts(tabViewFacts(observed.context), result.facts)) {
      observed.baseline = JSON.stringify({ statuses, notices: result.notices })
    }
    return result
  } }
  async function releaseNotice(token: NoticeToken): Promise<RecordResult> {
    const delivery = token.instance === ports.instance ? deliveries.get(token.sequence) : undefined
    if (disposed || !delivery) return unavailable
    deliveries.delete(token.sequence)
    if (!delivery.capture.lease.facts.private) {
      let read: SessionRead
      try { read = await ports.owner.readSession() } catch { return unavailable }
      if (disposed || read.kind !== "memory") return unavailable
      const [first, ...rest] = delivery.keys.map(id => id.slice("normal:".length))
      if (first === undefined) return unavailable
      let result: SessionWrite
      try { result = await ports.owner.changeSession({ revision: read.revision, now: ports.clock.now(), edits: [{ kind: "monitor-notice", scope: "normal", acct: null,
        action: "release", token: `${token.instance}:${token.sequence}`, keys: [first, ...rest] }] }) } catch { return { kind: "write", result: { kind: "unconfirmed", cause: { kind: "readback" } } } }
      if (result.kind !== "committed") return { kind: "write", result }
    }
    changed()
    return { kind: "accepted", scope: delivery.capture.lease.facts.private ? "private" : "normal" }
  }
  async function claimNotice(context: TabContext, statusRead: Extract<StatusRead, { kind: "statuses" }>) {
    if (!statusRead.current()) return unavailable
    const captured = await capture(context)
    if (!captured || !current(captured) || !statusRead.current() || !sameTabViewFacts(captured.lease.facts, statusRead.facts)) return unavailable
    let rows = due(captured, statusRead.statuses).filter(row => ![...deliveries.values()].some(delivery => delivery.keys.includes(pendingKey(row.private, row.key)) && current(delivery.capture)))
    if (!rows.length) return { kind: "none" } as const
    const token: NoticeToken = { instance: ports.instance, sequence: ++deliverySequence }
    let confirmed = captured
    if (!captured.lease.facts.private) {
      const [first, ...rest] = rows.map(row => row.key)
      if (first === undefined) return { kind: "none" } as const
      let result: SessionWrite
      try { result = await ports.owner.changeSession({ revision: captured.read.revision, now: ports.clock.now(), edits: [{
        kind: "monitor-notice", scope: "normal", acct: captured.lease.facts.acct, action: "claim", token: `${token.instance}:${token.sequence}`, keys: [first, ...rest]
      }] }) } catch { return { kind: "write", result: { kind: "unconfirmed", cause: { kind: "readback" } } } as const }
      if (result.kind !== "committed") return { kind: "write", result } as const
      const next = await capture(context)
      if (!next || !current(next) || !sessionAccountCurrent(captured.read.revision, next.read.revision, captured.lease.facts.acct)) return unavailable
      rows = rows.filter(row => {
        const claim = next.read.memory.monitorClaims.get(row.key)
        return !next.read.memory.shown.global.has(row.key) && claim?.token === `${token.instance}:${token.sequence}` && claim.until > ports.clock.now()
      })
      confirmed = next
    }
    if (!rows.length) return { kind: "none" } as const
    changed()
    const committedCapture = { ...confirmed, generation }
    deliveries.set(token.sequence, { token, capture: committedCapture, keys: rows.map(row => pendingKey(row.private, row.key)) })
    return { kind: "delivery", token: structuredClone(token), features: rows.map(row => row.feature), current: () => current(committedCapture) } as const
  }
  async function acknowledgeNotice(context: TabContext, token: NoticeToken): Promise<RecordResult> {
    const delivery = token.instance === ports.instance ? deliveries.get(token.sequence) : undefined
    if (!delivery || !current(delivery.capture)) return unavailable
    const captured = await capture(context)
    if (!captured || !current(captured) || !sameTabViewFacts(captured.lease.facts, delivery.capture.lease.facts)) return unavailable
    for (const id of delivery.keys) {
      const notice = notices.get(id)
      if (!notice || !sessionAccountCurrent(notice.revision, captured.read.revision, notice.acct)) return unavailable
    }
    for (const id of delivery.keys) {
      const notice = notices.get(id)
      if (!notice) continue
      if (notice.private) shownPrivate.add(notice.key)
      else shownNormal.add(notice.key)
      notices.delete(id)
    }
    let acknowledgement: SessionWrite | undefined
    if (!captured.lease.facts.private) {
      const [first, ...rest] = delivery.keys.map(id => id.slice("normal:".length))
      if (first === undefined) return unavailable
      try { acknowledgement = await ports.owner.changeSession({ revision: captured.read.revision, now: ports.clock.now(), edits: [{
        kind: "monitor-notice", scope: "normal", acct: captured.lease.facts.acct, action: "acknowledge", token: `${token.instance}:${token.sequence}`, keys: [first, ...rest]
      }] }) } catch { acknowledgement = { kind: "unconfirmed", cause: { kind: "readback" } } }
      if (acknowledgement.kind === "committed") {
        const once = acknowledgement.memory.shown.global
        if ([first, ...rest].some(key => !once.has(key))) acknowledgement = { kind: "unavailable", reason: "stale" }
      }
      if (acknowledgement.kind !== "committed") for (const key of [first, ...rest]) acknowledged.push({ acct: captured.lease.facts.acct, revision: structuredClone(captured.read.revision), key })
    }
    deliveries.delete(token.sequence); changed(); armFlush()
    if (acknowledgement && acknowledgement.kind !== "committed") return { kind: "write", result: acknowledgement }
    return { kind: "accepted", scope: captured.lease.facts.private ? "private" : "normal" }
  }
  async function flushOnce(): Promise<MonitorWrite> {
    if (disposed) return { kind: "disposed" }
    cancelFlush?.(); cancelFlush = undefined
    const now = ports.clock.now()
    if (!pending.length && !acknowledged.length) { flushAt = undefined; return { kind: "idle" } }
    if (flushAt !== undefined && now < flushAt) { const at = flushAt; armFlushAt(at); return { kind: "deferred", at } }
    let read: SessionRead
    try { read = await ports.owner.readSession() } catch { return unavailableWithReason() }
    if (disposed) return { kind: "disposed" }
    if (read.kind !== "memory") return read
    absorbRevision(read)
    const latest = lastWrittenAt === undefined ? undefined : lastWrittenAt + MONITOR_WRITE_MS
    if (latest !== undefined && now < latest) { flushAt = latest; armFlushAt(latest); return { kind: "deferred", at: latest } }
    const first = pending[0] ?? acknowledged[0]
    if (!first) { flushAt = undefined; return { kind: "idle" } }
    const acct = first.acct, operations = pending.filter(row => row.acct === acct), acks = acknowledged.filter(row => row.acct === acct)
    const edits: [SessionEdit, ...SessionEdit[]] = [{ kind: "monitor", scope: "normal", acct, vocabulary, operations: operations.map(row => row.operation) }]
    if (acks.length) edits.push({ kind: "shown-global", scope: "normal", acct, keys: acks.map(row => row.key) })
    let result: SessionWrite
    try { result = await ports.owner.changeSession({ revision: read.revision, now, edits }) } catch { result = { kind: "unconfirmed", cause: { kind: "readback" } } }
    if (disposed) return result
    if (result.kind === "committed") {
      const accepted = new Set(operations)
      pending = pending.filter(row => !accepted.has(row))
      const acceptedAcks = new Set(acks)
      acknowledged = acknowledged.filter(row => !acceptedAcks.has(row))
      absorbRevision({ ...result, kind: "memory" }); lastWrittenAt = now; flushAt = undefined; changed(); armFlush()
    } else {
      // Every rejection retains accepted evidence. Only a confirmed later read and idempotent edit can retire it.
      flushAt = undefined; changed()
    }
    return result
  }
  function unavailableWithReason(): SessionWrite { return { kind: "unavailable", reason: "session-host" } }
  function armFlushAt(at: number): void {
    if (disposed || cancelFlush) return
    flushAt = at
    cancelFlush = ports.clock.after(Math.max(0, at - ports.clock.now()), () => { cancelFlush = undefined; if (!disposed && flushAt === at) void flush() })
  }
  function flush(): Promise<MonitorWrite> {
    if (flushing) return flushing
    flushing = flushOnce().finally(() => { flushing = undefined })
    return flushing
  }
  return {
    signal, observeAnchor, statuses, wouldAct, claimNotice, releaseNotice, acknowledgeNotice, flush, statusProducer, noticeProducer,
    succeeded(context: TabContext, job: JobId) { return record(context, base => ({ ...base, kind: "success", job })) },
    interrupted(context: TabContext, job: JobId, _reason: NonBreakage) { return record(context, base => ({ ...base, kind: "interrupted", job })) },
    measured(context: TabContext) { return record(context, base => ({ ...base, kind: "measured" })) },
    reloadPassed(context: TabContext) { return record(context, base => ({ ...base, kind: "reload-passed" })) },
    async diagnostics(context: TabContext) { const captured = await capture(context); return captured && current(captured) ? journal(captured) : undefined },
    subscribeView(listener: (event: MonitorViewChange) => void, revoked: () => void = () => {}) {
      if (disposed) { revoked(); return () => {} }
      const registered = (event: MonitorViewChange) => listener(event)
      const stop = () => revoked()
      viewListeners.add(registered)
      viewRevocations.add(stop)
      return () => {
        viewListeners.delete(registered)
        viewRevocations.delete(stop)
        if (!viewListeners.size) observedViews.clear()
      }
    },
    subscribe(listener: () => void) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() {
      if (disposed) return
      disposed = true; cancelFlush?.(); cancelNotice?.(); cancelFlush = undefined; cancelNotice = undefined
      unsubscribe(); generation++; pending = []; acknowledged = []; privateJournals.clear(); notices.clear(); deliveries.clear(); shownNormal.clear(); shownPrivate.clear(); listeners.clear(); viewListeners.clear(); observedViews.clear()
      const stops = [...viewRevocations]
      viewRevocations.clear()
      for (const stop of stops) { try { stop() } catch {} }
    }
  }
}
export type Monitor = ReturnType<typeof createMonitor>
