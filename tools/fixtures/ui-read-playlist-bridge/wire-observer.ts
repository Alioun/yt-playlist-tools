import type { MemoryTrace } from "../../../src/shared/rpc/memory"

const observers = new Set<(trace: readonly MemoryTrace[]) => void>()
export function observeWireTrace(observer: (trace: readonly MemoryTrace[]) => void) {
  observers.add(observer)
  return () => {
    observers.delete(observer)
  }
}
export function recordWireTrace(trace: readonly MemoryTrace[]) {
  for (const observer of observers) observer(trace)
}
