import type { JobFailure } from "../../shared/contracts"

export interface GatewayClock {
  now(): number
  after(ms: number, callback: () => void): () => void
}
export const systemClock: GatewayClock = {
  now: () => Date.now(),
  after(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  }
}
export type Lane = "playlist" | "app-state"
export type JobScope = {
  readonly deadline: number
  readonly active: boolean
  remaining(): number
  onClose(cleanup: () => void): () => void
}
type Entry = { start(): void; expire(): void }

export function createLanes(clock: GatewayClock) {
  const queues: Record<Lane, Entry[]> = { playlist: [], "app-state": [] }
  const running: Record<Lane, Entry | undefined> = { playlist: undefined, "app-state": undefined }
  const owned = new Set<Entry>()
  let disposed = false
  function pump(lane: Lane): void {
    if (disposed || running[lane]) return
    const next = queues[lane].shift()
    if (next) {
      running[lane] = next
      next.start()
    }
  }
  return {
    run<T>(lane: Lane, work: (scope: JobScope) => Promise<T>, budget = 10_000): Promise<T | JobFailure> {
      if (disposed) return Promise.resolve({ ok: false, reason: "unavailable" })
      return new Promise(resolve => {
        let active = true
        let stopTimer = () => {}
        const cleanups = new Set<() => void>()
        const deadline = clock.now() + budget
        const scope: JobScope = {
          deadline,
          get active() {
            return active && !disposed && clock.now() < deadline
          },
          remaining: () => Math.max(0, deadline - clock.now()),
          onClose(cleanup) {
            if (!active) {
              cleanup()
              return () => {}
            }
            cleanups.add(cleanup)
            return () => {
              cleanups.delete(cleanup)
            }
          }
        }
        const finish = (result: T | JobFailure) => {
          if (!active) return
          active = false
          stopTimer()
          for (const cleanup of cleanups) {
            try {
              cleanup()
            } catch {}
          }
          cleanups.clear()
          owned.delete(entry)
          const index = queues[lane].indexOf(entry)
          if (index >= 0) queues[lane].splice(index, 1)
          if (running[lane] === entry) running[lane] = undefined
          resolve(result)
          pump(lane)
        }
        const entry: Entry = {
          start() {
            if (!scope.active) {
              entry.expire()
              return
            }
            try {
              void work(scope).then(finish, () => finish({ ok: false, reason: "unconfirmed" }))
            } catch {
              finish({ ok: false, reason: "unconfirmed" })
            }
          },
          expire() {
            finish({ ok: false, reason: disposed ? "unavailable" : "unconfirmed" })
          }
        }
        owned.add(entry)
        stopTimer = clock.after(budget, entry.expire)
        queues[lane].push(entry)
        pump(lane)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const entry of [...owned]) entry.expire()
    }
  }
}
