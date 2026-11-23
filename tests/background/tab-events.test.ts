import { afterEach, expect, test } from "bun:test"
import type { Background } from "../../src/background/boot"
import { browser, started } from "./world"

const running: Background[] = []
afterEach(async () => {
  for (const background of running.splice(0)) await background.dispose().catch(() => {})
})

type Storage = { get(...args: unknown[]): Promise<unknown> }
type TabEvents = { remove(ids: number[]): Promise<void>; onRemoved: { listeners: Set<(tabId: number) => void> } }

test("closing tabs the extension never saw reads nothing from session storage (ADR-0012)", async () => {
  const world = browser({})
  await world.seed()
  for (let id = 1001; id <= 1010; id++) world.tabs.open(id, `https://example.com/${id}`)
  const w = world.worker()
  running.push(w.background)
  await started(w)
  await new Promise(resolve => setTimeout(resolve, 30))
  const native = w.native as unknown as { storage: { session: Storage }; tabs: TabEvents }
  const session = native.storage.session
  const get = session.get.bind(session)
  let reads = 0
  session.get = (...args) => {
    reads++
    return get(...args)
  }
  try {
    await native.tabs.remove([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010])
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(reads).toBe(0)
  } finally {
    session.get = get
  }
})
