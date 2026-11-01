import { expect, test } from "bun:test"
import { createDirectPageChannel, createDomPageChannel, pageEventTypes, type PageWire } from "./page-channel"

const wires: readonly PageWire[] = ["req", "res", "retire"]

test("DOM frames are composed bubbling custom events carrying the exact string", () => {
  const channel = createDomPageChannel(document)
  for (const wire of wires) {
    const seen: Event[] = []
    const record = (event: Event) => seen.push(event)
    document.addEventListener(pageEventTypes[wire], record)
    try {
      channel.send(wire, '{"kind":"hello"}')
      expect(seen).toHaveLength(1)
      const [event] = seen
      expect(event instanceof CustomEvent && event.detail).toBe('{"kind":"hello"}')
      expect([event?.type, event?.bubbles, event?.composed, event?.target]).toEqual([`ppt:${wire}`, true, true, document])
    } finally {
      document.removeEventListener(pageEventTypes[wire], record)
    }
  }
})

test("DOM requests dispatch on the item and every other frame dispatches on document", () => {
  const channel = createDomPageChannel(document)
  const item = document.createElement("ytmusic-responsive-list-item-renderer")
  document.body.append(item)
  const frames: [PageWire, unknown, Element | null][] = []
  const stops = wires.map(wire => channel.listen(wire, (detail, target) => frames.push([wire, detail, target])))
  try {
    channel.send("req", "item", item)
    channel.send("req", "document")
    channel.send("res", "answer", item)
    channel.send("retire", "retire", item)
    expect(frames).toEqual([["req", "item", item], ["req", "document", null], ["res", "answer", null], ["retire", "retire", null]])
    expect(item.attributes).toHaveLength(0)
  } finally {
    stops.forEach(stop => stop())
    item.remove()
  }
})

test("DOM listeners pass untrusted detail through and their disposer is idempotent", () => {
  const channel = createDomPageChannel(document)
  const details: unknown[] = []
  const stop = channel.listen("req", detail => details.push(detail))
  document.dispatchEvent(new CustomEvent("ppt:req", { detail: { kind: "hello" } }))
  document.dispatchEvent(new Event("ppt:req"))
  stop()
  stop()
  channel.send("req", "after")
  expect(details).toEqual([{ kind: "hello" }, undefined])
})

test("direct frames reach only listeners of their wire, with the item only on requests", () => {
  const channel = createDirectPageChannel()
  const item = document.createElement("div")
  const frames: [PageWire, unknown, Element | null][] = []
  const stops = wires.map(wire => channel.listen(wire, (detail, target) => frames.push([wire, detail, target])))
  channel.send("req", "a", item)
  channel.send("res", "b", item)
  channel.send("retire", "c")
  stops.forEach(stop => stop())
  channel.send("req", "after")
  expect(frames).toEqual([["req", "a", item], ["res", "b", null], ["retire", "c", null]])
})

test("direct delivery follows DOM listener order for removal and addition during dispatch", () => {
  const channel = createDirectPageChannel()
  const calls: string[] = []
  let stopSecond = () => {}
  channel.listen("res", () => {
    calls.push("first")
    stopSecond()
    channel.listen("res", () => calls.push("late"))
  })
  stopSecond = channel.listen("res", () => calls.push("second"))
  channel.send("res", "x")
  expect(calls).toEqual(["first"])
})

test("a throwing direct listener still lets the others run and surfaces its error", () => {
  const channel = createDirectPageChannel()
  const calls: string[] = []
  channel.listen("res", () => { throw new Error("synthetic listener failure") })
  channel.listen("res", () => calls.push("after"))
  expect(() => channel.send("res", "x")).toThrow("synthetic listener failure")
  expect(calls).toEqual(["after"])
})

test("two direct channels share nothing", () => {
  const a = createDirectPageChannel()
  const b = createDirectPageChannel()
  const seen: unknown[] = []
  a.listen("req", detail => seen.push(detail))
  b.send("req", "other")
  a.send("req", "own")
  expect(seen).toEqual(["own"])
})
