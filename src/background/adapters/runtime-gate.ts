import type { RuntimePort } from "./runtime"

type NativeListener = Parameters<RuntimePort["onMessage"]["addListener"]>[0]

/**
 * MV3 needs the message listener in the worker's first turn, but the routers exist only once the store is
 * ready. The gate is that first-turn listener: it holds each message until `open()`, then hands it to the
 * routers that listen through `runtime`, as the browser would. A message nobody claims gets `undefined`.
 */
export function createRuntimeGate(native: RuntimePort) {
  const listeners = new Set<NativeListener>()
  const waiting: (() => void)[] = []
  const answered = new Set<() => void>()
  let open = false
  function deliver(message: unknown, sender: Parameters<NativeListener>[1], sendResponse: Parameters<NativeListener>[2]): boolean {
    const respond = (value: unknown) => {
      sendResponse(value)
      for (const listener of [...answered]) {
        try {
          listener()
        } catch {}
      }
    }
    let claimed = false
    for (const listener of [...listeners]) {
      try {
        if ((listener(message, sender, respond) as unknown) === true) claimed = true
      } catch {}
    }
    return claimed
  }
  native.onMessage.addListener((message, sender, sendResponse) => {
    if (open) return deliver(message, sender, sendResponse)
    waiting.push(() => {
      if (!deliver(message, sender, sendResponse)) sendResponse(undefined)
    })
    return true
  })
  return {
    runtime: {
      sendMessage: (message: unknown) => native.sendMessage(message),
      onMessage: {
        addListener(listener: NativeListener) {
          listeners.add(listener)
        },
        removeListener(listener: NativeListener) {
          listeners.delete(listener)
        }
      }
    } satisfies RuntimePort,
    /** Runs after each answer, so state that a message changed can be re-read. */
    onAnswered(listener: () => void) {
      answered.add(listener)
      return () => {
        answered.delete(listener)
      }
    },
    open() {
      if (open) return
      open = true
      for (const run of waiting.splice(0)) run()
    }
  }
}
