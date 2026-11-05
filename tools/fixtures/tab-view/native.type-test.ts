import type { TabView } from "../../../src/shared/contracts/tab-view"
import { isTabView } from "../../../src/shared/contracts/tab-view"
import type { TabViewScope } from "../../../src/shared/contracts/tabs"
import type { TabViewProducer, TabContext } from "../../../src/background/tabs/ports"
import type { ExtLinkOptions } from "../../../src/site/core/extlink"
import type { SessionMemory } from "../../../src/background/store/session-memory"

declare const producer: TabViewProducer<TabView>
declare const context: TabContext
declare const options: Omit<ExtLinkOptions<TabView, unknown>, "isView">
declare const scopeGuard: (value: unknown) => value is TabViewScope
declare const session: SessionMemory
declare const view: TabView

export const complete = producer.produce(context)
export const fullGuard: ExtLinkOptions<TabView, unknown> = { ...options, isView: isTabView }
// @ts-expect-error The complete validator is required by ExtLink.
export const missingValidator: ExtLinkOptions<TabView, unknown> = options
// @ts-expect-error A Tabs producer must supply its complete validator.
export const blindProducer: TabViewProducer<TabView> = { produce: producer.produce }
// @ts-expect-error A scope guard cannot establish a complete TabView.
export const permissiveValidator: ExtLinkOptions<TabView, unknown> = { ...options, isView: scopeGuard }
// @ts-expect-error The actual owner session cannot enter the wire contract.
export const wholeSession: TabView = { ...view, session }
