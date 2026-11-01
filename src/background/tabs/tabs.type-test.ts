import type { AccountKey } from "../../shared/model/validation"
import type { JobOf } from "../../shared/contracts/jobs"
import type { TabHello, TabViewScope } from "../../shared/contracts/tabs"
import type { TabRecord } from "./records"
import type { RoutingNeed, TabJobOutcome, TabsPorts, TabViewProducer } from "./ports"
import { createTabs } from "./tabs"

declare const ports: TabsPorts
declare const need: RoutingNeed
declare const acct: AccountKey
declare const hello: TabHello
type ConcreteView = TabViewScope & { readonly features: readonly string[] }
declare const producer: TabViewProducer<ConcreteView>
const tabs = createTabs(ports)

export const serving: Promise<TabJobOutcome<JobOf<"playlists">>> = tabs.serve<JobOf<"playlists">>({ job: { kind: "playlists" }, acct }, need)
export const original: Promise<TabJobOutcome<JobOf<"playlists">>> = tabs.runIn<JobOf<"playlists">>(1, { job: { kind: "playlists" }, acct }, need)
export const free = tabs.serve({ job: { kind: "resolveChannel", input: "@fixture" } }, { ...need, account: { kind: "any" } })
export const seen = tabs.seen(1, hello, producer)
export const pushed = tabs.push(need.req, producer)
export const out: TabRecord = { site: "music", signedIn: false, acct: null }

// @ts-expect-error Account-scoped jobs require their account pin.
tabs.serve({ job: { kind: "playlists" } }, need)
// @ts-expect-error Account-free jobs cannot carry an account pin.
tabs.serve({ job: { kind: "resolveChannel", input: "@fixture" }, acct }, need)
// @ts-expect-error Seen has no dummy or implicit view producer.
tabs.seen(1, hello)
// @ts-expect-error Push requires the concrete producer and its complete validator.
tabs.push(need.req)
// @ts-expect-error An empty object cannot stand in for a complete view.
tabs.seen(1, hello, { produce: async () => ({ kind: "view", view: {} }), isView: producer.isView })
// @ts-expect-error A signed-out registry row cannot claim an account.
export const impossible: TabRecord = { site: "www", signedIn: false, acct }
// @ts-expect-error A persisted record has no privacy field.
export const privateRecord: TabRecord = { site: "www", signedIn: true, acct, private: true }
// @ts-expect-error The account fallback cannot silently omit the Setup existence check.
export const unchecked: TabsPorts = { ...ports, accounts: { lastAccount: ports.accounts.lastAccount } }
// @ts-expect-error There is no session-free Tabs engine.
createTabs({ native: ports.native, registrar: ports.registrar, accounts: ports.accounts, clock: ports.clock, enabled: ports.enabled })

// @ts-expect-error negative: tabs-target-account-required. Account targets carry a validated account.
tabs.known({ kind: "account", scope: "all" })
// @ts-expect-error negative: tabs-target-not-requester. A UI requester cannot select publication targets.
tabs.known(need.req)
// @ts-expect-error negative: tabs-target-opaque. A numeric tab ID cannot replace a live handle.
tabs.publish(1, producer, new AbortController().signal, () => true)
// @ts-expect-error negative: tabs-publish-cancellation. A target delivery needs its lifetime signal.
tabs.publish({ tabId: 1 }, producer)
