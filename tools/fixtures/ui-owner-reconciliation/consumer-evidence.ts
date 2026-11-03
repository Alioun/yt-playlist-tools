import { deepStrictEqual, equal, ok } from "node:assert/strict"
import { uiBridgeJson } from "../ui-read-playlist-bridge/run"
import { progressiveConsumer } from "../ui-playlist-progressive/run"
import { reconciliationConsumer } from "./run"
import { observeWireTrace } from "../ui-read-playlist-bridge/wire-observer"
import { uiContract } from "../../../src/shared/contracts/ui"
import type { MemoryTrace } from "../../../src/shared/rpc/memory"

const fixture = process.argv[2]
const run = fixture === "bridge" ? uiBridgeJson : fixture === "progressive" ? progressiveConsumer : fixture === "reconciliation" ? reconciliationConsumer : undefined
ok(run, "known consumer")
const traces: unknown[] = []
let generatedRequests = 0
const stop = observeWireTrace(trace => {
  const callers = new Map<string, string>(),
    operations = new Map<string, string>(),
    captures = new Map<string, string>()
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  function name(values: Map<string, string>, value: string, prefix: string) {
    if (!values.has(value)) values.set(value, `${prefix}-${values.size + 1}`)
    return values.get(value)
  }
  function normalize(value: unknown, key = ""): unknown {
    if (typeof value === "string") {
      const parts = value.split(":")
      if (parts.length === 2 && uuid.test(parts[0] ?? "") && /^[1-9]\d*$/.test(parts[1] ?? "")) return `${name(callers, parts[0]!, "caller")}:${parts[1]}`
      if (uuid.test(value)) return name(operations, value, "operation")
      if (key === "lifetime") return name(captures, value, "capture")
      return value
    }
    if (Array.isArray(value)) return value.map(item => normalize(item))
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, normalize(item, field)]))
    return value
  }
  const events = trace.map((event: MemoryTrace) => {
    if (!("text" in event) || event.text === null) return event
    const packet = JSON.parse(event.text)
    const contract = Object.entries(uiContract).find(([kind]) => kind === packet.kind)?.[1]
    ok(contract, "request or answer belongs to actual composed catalogue")
    if (event.event === "sent") {
      ok(contract.payload(packet.payload), "actual payload guard validates IDs before normalization")
      if (typeof packet.id === "string" && packet.id.includes(":")) {
        const [caller, sequence] = packet.id.split(":")
        ok(uuid.test(caller ?? "") && /^[1-9]\d*$/.test(sequence ?? ""), "generated caller namespace and positive sequence")
        generatedRequests++
      }
    } else if ("result" in packet) ok(contract.result(packet.result), "actual answer guard before normalization")
    return { ...event, text: JSON.stringify(normalize(packet)) }
  })
  traces.push(events)
})
try {
  const output = await run()
  equal(output.endsWith("\n") && !output.endsWith("\n\n"), true)
  deepStrictEqual(JSON.parse(output).at(-1), { case: "eof", nativeListeners: 0, localListeners: 0, deadlines: 0 })
  ok(generatedRequests > 0, "real browser Backend generated requests")
  process.stdout.write(JSON.stringify({ fixture, output, traces, generatedRequests }) + "\n")
} finally {
  stop()
}
