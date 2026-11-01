import { expect, test } from "bun:test"
import { createMemoryNetwork } from "./memory"
import type { Delivery } from "./transport"

type Sender = { context: string; frameId: number }

test("delivers fresh JSON copies of the message and the out-of-band sender to every other connection", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const sender = { context: "tab", frameId: 0 }
  const caller = network.connect(sender)
  const receiver = network.connect({ context: "background", frameId: 0 })
  const deliveries: Delivery<Sender>[] = []
  caller.listen(() => Promise.resolve("own connection"))
  receiver.listen(delivery => {
    deliveries.push(delivery)
    delivery.sender.frameId = 9
    return Promise.resolve({ echo: delivery.message, at: new Date(0) })
  })
  const message = { list: [1], skipped: undefined, when: new Date(0) }
  const answer = await caller.send(message)
  await caller.send(message)
  sender.frameId = 4
  expect(answer).toEqual({ echo: { list: [1], when: "1970-01-01T00:00:00.000Z" }, at: "1970-01-01T00:00:00.000Z" })
  expect(deliveries.map(delivery => delivery.sender)).toEqual([{ context: "tab", frameId: 9 }, { context: "tab", frameId: 9 }])
  expect(deliveries[0]!.sender).not.toBe(deliveries[1]!.sender)
  expect(deliveries[0]!.message).not.toBe(message)
  expect(deliveries[0]!.message).toStrictEqual({ list: [1], when: "1970-01-01T00:00:00.000Z" })
  const later: Delivery<Sender>[] = []
  network.connect({ context: "settings", frameId: 0 }).listen(delivery => { later.push(delivery); return undefined })
  await caller.send(null)
  expect(later[0]!.sender).toEqual({ context: "tab", frameId: 0 })
})

test("rejects unserializable messages and sends nobody claims without delivering them as answers", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const caller = network.connect({ context: "tab", frameId: 0 })
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  await expect(caller.send(cyclic)).rejects.toThrow("Unserializable memory message")
  await expect(caller.send(() => 1)).rejects.toThrow("Unserializable memory message")
  network.connect({ context: "background", frameId: 0 }).listen(() => undefined)
  await expect(caller.send({ kind: "x" })).rejects.toThrow("Memory send failed")
  expect(network.trace()).toEqual([
    { event: "rejected", to: 0, reason: "unserializable" },
    { event: "rejected", to: 0, reason: "unserializable" },
    { event: "sent", from: 0, text: '{"kind":"x"}' },
    { event: "rejected", to: 0, reason: "no-receiver" }
  ])
})

test("holds queued sends until each one-shot script step runs", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "queued" })
  const caller = network.connect({ context: "tab", frameId: 0 })
  let received = 0
  network.connect({ context: "background", frameId: 0 }).listen(delivery => { received++; return Promise.resolve(delivery.message) })
  const first = caller.send("first")
  const second = caller.send("second")
  expect(network.queued().map(item => item.text)).toEqual(['"first"', '"second"'])
  expect(received).toBe(0)
  const [one, two] = network.queued()
  two!.deliver()
  two!.reject()
  one!.reject()
  one!.deliver()
  expect(await second).toBe("second")
  await expect(first).rejects.toThrow("Memory send failed")
  expect(received).toBe(1)
  expect(network.queued()).toEqual([])
})

test("removes each listener exactly once", () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const connection = network.connect({ context: "tab", frameId: 0 })
  const stopFirst = connection.listen(() => undefined)
  connection.listen(() => undefined)
  expect(network.listening()).toBe(2)
  stopFirst()
  stopFirst()
  expect(network.listening()).toBe(1)
})
