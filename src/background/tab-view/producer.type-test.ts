import { createTabViewProducer, type TabViewPorts, type StatusProducer, type NoticeProducer } from "./producer"
import type { TabViewProducer } from "../tabs/ports"
import type { TabView } from "../../shared/contracts/tab-view"

declare const ports: TabViewPorts
declare const noHealth: Omit<TabViewPorts, "statuses">
declare const noNotices: Omit<TabViewPorts, "notices">
export const concrete: TabViewProducer<TabView> = createTabViewProducer(ports)
// @ts-expect-error Missing monitoring cannot become a default healthy implementation.
void createTabViewProducer(noHealth)
// @ts-expect-error Missing due-notice production cannot become an empty default.
void createTabViewProducer(noNotices)
// @ts-expect-error Status facts require the actual tab/account/site/build/privacy context.
export const unboundStatus: StatusProducer = { async read() { return { kind: "statuses", statuses: [] } } }
// @ts-expect-error Notice facts require the actual context.
export const unboundNotice: NoticeProducer = { async read() { return { kind: "notices", notices: [] } } }
