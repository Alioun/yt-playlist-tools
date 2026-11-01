import type { Receive, Transport } from "./transport"

export type MemoryTrace =
  | { readonly event: "sent"; readonly from: number; readonly text: string }
  | { readonly event: "answered"; readonly to: number; readonly text: string | null }
  | { readonly event: "dropped"; readonly to: number; readonly text: string | null }
  | { readonly event: "rejected"; readonly to: number; readonly reason: "unserializable" | "no-receiver" | "receiver-error" | "scripted" | "lost" }
export type QueuedSend = {
  readonly from: number
  readonly text: string
  deliver(): void
  reject(): void
  lose(): void
}
export type MemoryNetwork<Sender> = {
  connect(sender: Sender): Transport<Sender>
  queued(): readonly QueuedSend[]
  trace(): readonly MemoryTrace[]
  listening(): number
}

type Listener<Sender> = { readonly connection: number; readonly receive: Receive<Sender> }

function serialize(value: unknown): { ok: true; text: string | null } | { ok: false } {
  try {
    const text: unknown = JSON.stringify(value)
    return { ok: true, text: typeof text === "string" ? text : null }
  } catch {
    return { ok: false }
  }
}

export function createMemoryNetwork<Sender>(options: { readonly delivery: "immediate" | "queued" }): MemoryNetwork<Sender> {
  const listeners: Listener<Sender>[] = []
  const queue: QueuedSend[] = []
  const log: MemoryTrace[] = []
  let connections = 0

  function connect(sender: Sender): Transport<Sender> {
    const from = connections++
    const identity = structuredClone(sender)

    function send(message: unknown): Promise<unknown> {
      const wire = serialize(message)
      if (!wire.ok || wire.text === null) {
        log.push({ event: "rejected", to: from, reason: "unserializable" })
        return Promise.reject(new Error("Unserializable memory message"))
      }
      const text = wire.text
      log.push({ event: "sent", from, text })
      return new Promise((resolve, reject) => {
        let done = false
        const fail = (reason: "no-receiver" | "receiver-error" | "scripted" | "lost") => {
          log.push({ event: "rejected", to: from, reason })
          reject(new Error("Memory send failed"))
        }
        const run = (lost: boolean) => {
          const claims = listeners.filter(listener => listener.connection !== from).flatMap(listener => {
            try {
              const claim = listener.receive({ message: JSON.parse(text), sender: structuredClone(identity) })
              return claim === undefined ? [] : [claim]
            } catch {
              return [Promise.reject(new Error("Memory receiver threw"))]
            }
          })
          if (claims.length === 0) return fail("no-receiver")
          if (lost) fail("lost")
          let answered = lost
          for (const claim of claims) {
            claim.then(value => {
              const answer = serialize(value)
              if (answered || !answer.ok) {
                log.push({ event: "dropped", to: from, text: answer.ok ? answer.text : null })
                return
              }
              answered = true
              log.push({ event: "answered", to: from, text: answer.text })
              resolve(answer.text === null ? undefined : JSON.parse(answer.text))
            }, () => {
              if (answered) return
              answered = true
              fail("receiver-error")
            })
          }
        }
        const item: QueuedSend = {
          from, text,
          deliver: () => settle(() => run(false)),
          reject: () => settle(() => fail("scripted")),
          lose: () => settle(() => run(true))
        }
        function settle(action: () => void) {
          if (done) return
          done = true
          const index = queue.indexOf(item)
          if (index >= 0) queue.splice(index, 1)
          action()
        }
        if (options.delivery === "immediate") item.deliver()
        else queue.push(item)
      })
    }

    function listen(receive: Receive<Sender>): () => void {
      const listener = { connection: from, receive }
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    }

    return { send, listen }
  }

  return {
    connect,
    queued: () => [...queue],
    trace: () => [...log],
    listening: () => listeners.length
  }
}
