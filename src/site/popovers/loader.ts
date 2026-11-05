import { pageGlobal } from "../global"
import type { Popovers } from "./types"

export const popoversTimeoutMs = 5_000
function waiters(): Set<(popovers: Popovers) => void> {
  const global = pageGlobal()
  return global.popoverWaiters ??= new Set()
}

/** `popovers.js` calls this once it has installed itself, which wakes every open still waiting for it. */
export function announcePopovers(popovers: Popovers): void {
  pageGlobal().popovers = popovers
  for (const wake of [...waiters()]) wake(popovers)
}

/**
 * Loads `popovers.js` through the background (ARC-MAN-16) and waits for it at most 5 s (ARC-MOD-17).
 * Null means it didn't load: an explicit open shows the failure toast, a hover preload only logs.
 */
export function loadPopovers(need: () => Promise<boolean>, timer: (ms: number, done: () => void) => () => void): Promise<Popovers | null> {
  const present = pageGlobal().popovers
  if (present) return Promise.resolve(present)
  return new Promise(resolve => {
    let settled = false
    const finish = (popovers: Popovers | null) => {
      if (settled) return
      settled = true
      waiters().delete(wake)
      cancel()
      resolve(popovers)
    }
    const wake = (popovers: Popovers) => finish(popovers)
    waiters().add(wake)
    const cancel = timer(popoversTimeoutMs, () => finish(null))
    void need().then(ok => { if (!ok) finish(pageGlobal().popovers ?? null) }, () => finish(null))
  })
}
