// Experiment only: the least shimming that lets 1.x's Vitest files load under
// `bun test`. Bun already rewrites `from "vitest"` to bun:test in test files
// and provides vi.fn/spyOn/mock/useFakeTimers; these three are missing.
import { afterEach, mock, vi } from "bun:test"
import "fake-indexeddb/auto"

const stubbed = new Map<string, PropertyDescriptor | undefined>()

Object.assign(vi, {
  // A type-only helper in Vitest; at runtime it returns its argument.
  mocked: <T>(x: T) => x,
  stubGlobal(name: string, value: unknown) {
    if (!stubbed.has(name)) stubbed.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  },
  unstubAllGlobals() {
    for (const [name, desc] of stubbed) {
      if (desc) Object.defineProperty(globalThis, name, desc)
      else delete (globalThis as Record<string, unknown>)[name]
    }
    stubbed.clear()
  }
})

// vitest.config.ts sets restoreMocks: true; bunfig has no equivalent.
afterEach(() => {
  mock.restore()
  ;(vi as unknown as { unstubAllGlobals(): void }).unstubAllGlobals()
})
