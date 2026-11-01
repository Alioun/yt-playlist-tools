import { expect, test } from "bun:test"
import { createRuntimeGate } from "./runtime-gate"
import type { RuntimePort } from "./runtime"

type Listener = Parameters<RuntimePort["onMessage"]["addListener"]>[0]
function nativeRuntime() {
  const listeners: Listener[] = []
  const runtime: RuntimePort = { sendMessage: async () => undefined, onMessage: { addListener: listener => { listeners.push(listener) }, removeListener() {} } }
  function send(message: unknown) {
    const answers: unknown[] = []
    const kept = listeners.map(listener => listener(message, { id: "extension" }, value => { answers.push(value) }) as unknown)
    return { kept, answers }
  }
  return { runtime, listeners, send }
}

test("the gate is the one first-turn listener, holds messages until the routers exist, then lets them answer", () => {
  const native = nativeRuntime()
  const gate = createRuntimeGate(native.runtime)
  expect(native.listeners).toHaveLength(1)
  const early = native.send({ kind: "ui.ping" })
  const stray = native.send({ kind: "unknown" })
  expect(early.kept).toEqual([true])
  let answered = 0
  gate.onAnswered(() => { answered++ })
  gate.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as { kind?: string }).kind !== "ui.ping") return false
    sendResponse("pong")
    return true
  })
  expect(early.answers).toEqual([])
  gate.open()
  expect([early.answers, stray.answers, answered]).toEqual([["pong"], [undefined], 1])
  const late = native.send({ kind: "ui.ping" })
  expect([late.kept, late.answers]).toEqual([[true], ["pong"]])
  expect(native.send({ kind: "unknown" }).kept).toEqual([false])
})
