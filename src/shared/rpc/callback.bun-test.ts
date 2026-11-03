import { expect, test } from "bun:test"
import { callbackTransport, type CallbackListener, type CallbackPort } from "./callback"

function deferred() {
  let resolve: (value: unknown) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function port() {
  const listeners = new Set<CallbackListener<{ readonly id: string }>>()
  let removed = 0
  const runtime: CallbackPort<{ readonly id: string }> = {
    sendMessage: message => Promise.resolve(message),
    onMessage: {
      addListener: listener => {
        listeners.add(listener)
      },
      removeListener: listener => {
        removed++
        listeners.delete(listener)
      }
    }
  }
  return {
    runtime,
    listeners,
    get removed() {
      return removed
    },
    deliver(respond: (value?: unknown) => void) {
      return [...listeners].map(listener => listener("message", { id: "synthetic" }, respond))
    }
  }
}
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

test("the shared bridge declines unclaimed and thrown receives synchronously without answering", () => {
  for (const mode of ["undefined", "throw"] as const) {
    const h = port(),
      replies: unknown[] = []
    const stop = callbackTransport(h.runtime).listen(() => {
      if (mode === "throw") throw Error("Synthetic receive")
      return undefined
    })
    expect(
      h.deliver(value => {
        replies.push(value)
      })
    ).toEqual([false])
    expect(replies).toEqual([])
    stop()
    stop()
    expect(h.listeners.size).toBe(0)
    expect(h.removed).toBe(1)
  }
})

test("the shared bridge claims with literal true, contains response errors and releases rejections once", async () => {
  const h = port(),
    pending = deferred(),
    replies: unknown[] = []
  const stop = callbackTransport(h.runtime).listen(() => pending.promise)
  expect(
    h.deliver(value => {
      replies.push(value)
      throw Error("Synthetic closed port")
    })
  ).toEqual([true])
  pending.reject(Error("Synthetic receive rejection"))
  await settle()
  expect(replies).toEqual([undefined])
  stop()
  stop()
  expect(replies).toEqual([undefined])
  expect(h.removed).toBe(1)
})

test("shared bridge disposal releases pending replies and suppresses later answers", async () => {
  const h = port(),
    pending = deferred(),
    replies: unknown[] = []
  const stop = callbackTransport(h.runtime).listen(() => pending.promise)
  expect(
    h.deliver(value => {
      replies.push(value)
    })
  ).toEqual([true])
  stop()
  stop()
  expect(replies).toEqual([undefined])
  pending.resolve("late")
  await settle()
  expect(replies).toEqual([undefined])
  expect(h.listeners.size).toBe(0)
  expect(h.removed).toBe(1)
})

test("shared bridge disposal inside receive and inside sendResponse preserves a single answer", async () => {
  for (const mode of ["receive", "response"] as const) {
    const h = port(),
      replies: unknown[] = []
    let stop = () => {}
    stop = callbackTransport(h.runtime).listen(() => {
      if (mode === "receive") stop()
      return Promise.resolve("answer")
    })
    expect(
      h.deliver(value => {
        replies.push(value)
        if (mode === "response") stop()
      })
    ).toEqual([true])
    await settle()
    expect(replies).toEqual([mode === "receive" ? undefined : "answer"])
    stop()
    expect(h.listeners.size).toBe(0)
    expect(h.removed).toBe(1)
  }
})
