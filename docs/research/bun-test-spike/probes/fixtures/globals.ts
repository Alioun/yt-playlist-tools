// A non-test module: what it sees of bun:test's globals.
export function seenGlobals() {
  const g = globalThis as Record<string, unknown>
  return {
    globalThisAfterEach: typeof g.afterEach,
    // @ts-ignore -- deliberately undeclared here
    bareAfterEach: typeof afterEach,
    // @ts-ignore -- deliberately undeclared here
    bareJest: typeof jest
  }
}
