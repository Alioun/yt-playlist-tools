// Fake timers with happy-dom registered. GlobalRegistrator replaces
// globalThis.setTimeout with happy-dom's window.setTimeout, so this checks
// that Bun's fake clock still drives it.
import { afterEach, expect, jest, test } from "bun:test"

afterEach(() => {
  jest.useRealTimers()
})

test("advanceTimersByTime drives setTimeout under happy-dom", () => {
  jest.useFakeTimers()
  let fired = 0
  setTimeout(() => fired++, 1000)
  jest.advanceTimersByTime(999)
  expect(fired).toBe(0)
  jest.advanceTimersByTime(1)
  expect(fired).toBe(1)
})

test("setInterval and Date.now move together", () => {
  jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") })
  const ticks: number[] = []
  const id = setInterval(() => ticks.push(Date.now()), 500)
  jest.advanceTimersByTime(1500)
  clearInterval(id)
  expect(ticks).toEqual([1767225600500, 1767225601000, 1767225601500])
})
