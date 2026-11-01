import type { Monitor, NoticeToken } from "./monitor"
import type { MonitorPorts, HealthFacts, JobRoutes, MonitorStatus } from "./ports"
import type { SessionEdit } from "../store/session-memory"
import type { MonitorOperation, MonitorInstance } from "../store/monitor-session"
import type { BreakageSignal, DiagnosticVocabulary } from "../../shared/contracts/diagnostics"
import type { FeatureStatus } from "../../shared/contracts/tab-view"
import type { AccountKey } from "../../shared/model/validation"
import type { TabContext } from "../tabs/ports"

declare const monitor: Monitor
declare const ports: MonitorPorts
declare const vocabulary: DiagnosticVocabulary
declare const operation: MonitorOperation
declare const acct: AccountKey
declare const context: TabContext
declare const instance: MonitorInstance
declare const signal: BreakageSignal
declare const status: MonitorStatus

export const normal: SessionEdit = { kind: "monitor", scope: "normal", acct, vocabulary, operations: [operation] }
export const signedOut: SessionEdit = { kind: "monitor", scope: "normal", acct: null, vocabulary, operations: [operation] }
export const token: NoticeToken = { instance, sequence: 1 }
// @ts-expect-error Private Monitor state has no canonical persistence edit.
export const privateEdit: SessionEdit = { kind: "monitor", scope: "private", acct, vocabulary, operations: [operation] }
// @ts-expect-error An account envelope requires a validated account identity.
export const rawAccount: SessionEdit = { kind: "monitor", scope: "normal", acct: "unvalidated", vocabulary, operations: [operation] }
// @ts-expect-error Diagnostic vocabulary is a required boundary collaborator.
export const unvalidated: SessionEdit = { kind: "monitor", scope: "normal", acct, operations: [operation] }
// @ts-expect-error A route without any shipped route fact cannot assert job health.
export const emptyRoutes: JobRoutes = { routes: [] }
// @ts-expect-error Route identities must pass the identifier boundary.
export const rawRoute: JobRoutes = { routes: [{ route: "arbitrary-url", state: "usable" }] }
// @ts-expect-error Registry dependencies cannot substitute for current core, account, anchor and destination facts.
export const missingFacts: HealthFacts = { site: "www", jobs: new Map() }
// @ts-expect-error A page status cannot carry a background-only feature identifier.
export const backgroundAsPage: FeatureStatus = { feature: "browser-menu", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }
// @ts-expect-error A due read does not provide a display acknowledgement method.
monitor.noticeProducer.acknowledge(context)
// @ts-expect-error A delivery acknowledgement requires the exact token.
monitor.acknowledgeNotice(context)
// @ts-expect-error A signal never serializes authenticated account scope.
export const accountInSignal: BreakageSignal = { ...signal, acct }
// @ts-expect-error The injected instance identity cannot be an arbitrary string.
export const inventedInstance: NoticeToken = { instance: "tab-1", sequence: 1 }
// @ts-expect-error Current route authority is required even when a registry exists.
export const noAuthority: MonitorPorts = { owner: ports.owner, vocabulary, instance, clock: ports.clock }
// @ts-expect-error An injected one-shot scheduler is required.
export const pollingClock: MonitorPorts = { ...ports, clock: { now: () => 0 } }
// @ts-expect-error Status detail is immutable to consumers.
status.actions.push("save")

monitor.subscribeView(event => { const tabId: number = event.tabId; void tabId })
// @ts-expect-error negative: monitor-view-not-generic. Projected changes identify the affected tab.
monitor.subscribeView((event: { kind: "all" }) => { void event })
