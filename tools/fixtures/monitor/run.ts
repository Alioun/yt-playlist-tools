import { isJsonValue, type JsonValue } from "../../../src/shared/contracts/json"
import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import { context, monitorWorld, pageFeature, signalValue, syntheticHealthFacts } from "./harness"

export function stable(value: unknown): string {
  if (!isJsonValue(value)) throw Error("Monitor consumer output is not JSON")
  function order(value: JsonValue): JsonValue {
    if (value === null || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map(order)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, order(child)])
    )
  }
  const text = JSON.stringify(order(value)) + "\n"
  if (new TextEncoder().encode(text).byteLength > 65_536) throw Error("Monitor consumer exceeded its complete-output bound")
  return text
}
export async function runMonitorConsumer() {
  const h = monitorWorld(),
    normal = context("www", false, 1, null),
    privateTab = context("www", true, 2, null)
  async function view(input: typeof normal): Promise<TabView> {
    const read = await h.producer.produce(input)
    if (read.kind !== "view" || !isTabView(read.view)) throw Error("Real complete TabView producer unavailable or invalid")
    return read.view
  }
  try {
    h.seedContext(normal, { visible: true, fullscreen: false }, syntheticHealthFacts("www"))
    const enabled = [pageFeature("auto-add")]
    for (let count = 0; count < 2; count++) {
      const accepted = await h.monitor.signal(normal, signalValue("no-effect"), { kind: "job", online: true, otherRequestsAnswer: true })
      if (accepted.kind !== "accepted") throw Error("Real Monitor refused synthetic signal")
    }
    await h.monitor.wouldAct(normal, enabled, "auto-add")
    await h.advance(59)
    const before = await view(normal)
    await h.advance(1)
    const seen = await h.engine.seen(normal.tab.tabId, { ...normal.info, hidden: false, fresh: true }, h.producer)
    if (seen.kind !== "seen" || !isTabView(seen.view)) throw Error("Real Tabs hello did not produce a complete guarded view")
    const offered = seen.view
    const again = await view(normal)
    if (JSON.stringify(again.notices) !== JSON.stringify(offered.notices) || h.stored().shown !== undefined) throw Error("Reading a view prematurely acknowledged a notice")
    const read = await h.monitor.statusProducer.read(normal, enabled)
    if (read.kind !== "statuses") throw Error("Real Monitor status adapter unavailable")
    const delivery = await h.monitor.claimNotice(normal, read)
    if (delivery.kind !== "delivery" || !delivery.current()) throw Error("Real notice delivery unavailable")
    if ((await h.monitor.acknowledgeNotice(normal, delivery.token)).kind !== "accepted") throw Error("Actual display acknowledgement rejected")
    await h.advance(9_940)
    await h.monitor.flush()
    const after = await view(normal)
    const storedAfterNormal = h.stored()
    h.seedContext(privateTab, { visible: true, fullscreen: false }, syntheticHealthFacts("www"))
    await h.monitor.signal(privateTab, signalValue("cannot-measure", { job: null, route: null }), { kind: "playback" })
    const privateView = await view(privateTab),
      privateDiagnostics = await h.monitor.diagnostics(privateTab)
    if (JSON.stringify(h.stored()) !== JSON.stringify(storedAfterNormal)) throw Error("Private facts leaked into canonical persistence")
    h.hold(true)
    const held = await h.producer.produce(normal)
    if (held.kind !== "unavailable") throw Error("Unavailable producer reported working")
    return {
      kind: "monitor-consumer",
      syntheticInputs: ["native-tabs", "route-probe-facts", "visibility", "clock", "storage-host"],
      nativeProvenance: "unproven",
      productionAssembly: "absent",
      before,
      offered,
      after,
      privateView,
      privateDiagnostics,
      session: h.stored(),
      sessionWrites: h.sessionWrites(),
      held
    }
  } finally {
    await h.dispose()
  }
}
if (import.meta.main) process.stdout.write(stable(await runMonitorConsumer()))
