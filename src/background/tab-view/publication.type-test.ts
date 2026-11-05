import { createViewPublication, viewChangeTarget, type PublicationPorts } from "./publication"
import type { KnownTab } from "../tabs/tabs"
import type { TabViewProducer } from "../tabs/ports"
import type { TabViewScope } from "../../shared/contracts/tabs"
import type { ConfirmedViewChange } from "../store/local-filter-writer"
import type { AccountKey } from "../../shared/model"

declare const ports: PublicationPorts
declare const partial: TabViewProducer<TabViewScope>
declare const live: KnownTab
declare const acct: AccountKey
const publisher = createViewPublication(ports)
void ports.tabs.known({ kind: "account", acct, scope: "all" })
void ports.tabs.publish(live, ports.producer, new AbortController().signal, () => true)
void viewChangeTarget({ kind: "skips-changed", acct, scope: "normal" })
// @ts-expect-error negative: publication-missing-producer. Every publication requires the complete producer.
createViewPublication({ owner: ports.owner, tabs: ports.tabs, monitor: ports.monitor, privateSkips: ports.privateSkips, clock: ports.clock })
// @ts-expect-error negative: publication-partial-producer. A scope does not supply a complete TabView.
createViewPublication({ ...ports, producer: partial })
// @ts-expect-error negative: publication-missing-validator. Delivery requires the concrete validator.
createViewPublication({ ...ports, producer: { produce: ports.producer.produce } })
// @ts-expect-error negative: publication-invented-target. Window broadcasts are outside the target vocabulary.
ports.tabs.known({ kind: "window", windowId: 1, incognito: false })
// @ts-expect-error negative: publication-fake-account. Raw identities require account validation.
ports.tabs.known({ kind: "account", acct: "AAAAAAAAAAAAAAAA", scope: "all" })
// @ts-expect-error negative: publication-privacy-mixing. A scope is one explicit target variant.
ports.tabs.known({ kind: "account", acct, scope: ["normal", "private"] })
// @ts-expect-error negative: publication-fabricated-handle. Tabs alone creates the nominal live-core identity.
ports.tabs.publish({ tabId: 1, acct, privateTab: false }, ports.producer, new AbortController().signal, () => true)
// @ts-expect-error negative: publication-disposed-handle. Disposal returns no live target handle.
ports.tabs.publish(publisher.dispose(), ports.producer, new AbortController().signal, () => true)
// @ts-expect-error negative: publication-monitor-required. No healthy or empty-notice fallback exists.
createViewPublication({ owner: ports.owner, tabs: ports.tabs, privateSkips: ports.privateSkips, producer: ports.producer, clock: ports.clock })
// @ts-expect-error negative: publication-private-storage-event. The canonical session owner cannot confirm private memory.
const privateStorage: ConfirmedViewChange = { kind: "skips-changed", acct, scope: "private" }
void privateStorage
// @ts-expect-error negative: publication-private-source-required. Private changes require the actual AddFlow subscription.
createViewPublication({ owner: ports.owner, tabs: ports.tabs, monitor: ports.monitor, producer: ports.producer, clock: ports.clock })
