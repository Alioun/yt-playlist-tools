import { expect, test } from "bun:test"
import { watchSiteTabs, type SiteTabsPort } from "./site-tabs"

type Listener = Parameters<SiteTabsPort["onUpdated"]["addListener"]>[0]
function browserTabs(open: readonly { id: number; url?: string }[] = []) {
  const listeners = new Set<Listener>()
  const closeListeners = new Set<(tabId: number) => void>()
  const port: SiteTabsPort = {
    query: async () => open,
    onUpdated: { addListener: listener => void listeners.add(listener), removeListener: listener => void listeners.delete(listener) },
    onRemoved: { addListener: listener => void closeListeners.add(listener), removeListener: listener => void closeListeners.delete(listener) }
  }
  // The browser names a tab's address only on a site the extension can read.
  const update = (id: number, url?: string) => {
    for (const listener of [...listeners]) listener(id, {}, url === undefined ? { id } : { id, url })
  }
  const close = (id: number) => {
    for (const listener of [...closeListeners]) listener(id)
  }
  return { port, update, close, listening: () => listeners.size + closeListeners.size }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test("a tab that showed YouTube and no longer does has left, and a reload or another tab's page load hasn't", async () => {
  const tabs = browserTabs([{ id: 1, url: "https://www.youtube.com/watch?v=a" }, { id: 2 }])
  let left = 0
  const stop = watchSiteTabs(tabs.port, () => left++)
  await settle()
  tabs.update(1, "https://www.youtube.com/watch?v=a")
  tabs.update(1, "https://www.youtube.com/results?search_query=b")
  tabs.update(2)
  tabs.update(3)
  expect(left).toBe(0)
  tabs.update(1)
  expect(left).toBe(1)
  tabs.update(1)
  expect(left).toBe(1)
  stop()
  expect(tabs.listening()).toBe(0)
})

test("a tab that opens YouTube after the page did is watched too, and a move to the other site is a leave", async () => {
  const tabs = browserTabs()
  let left = 0
  const stop = watchSiteTabs(tabs.port, () => left++)
  await settle()
  tabs.update(4, "https://www.youtube.com/")
  tabs.update(4, "https://music.youtube.com/")
  expect(left).toBe(1)
  tabs.update(4, "https://example.com/")
  expect(left).toBe(2)
  stop()
  tabs.update(4, "https://www.youtube.com/")
  tabs.update(4)
  expect(left).toBe(2)
})

test("a tab that left before the first read of the open tabs answered still counts as having left", async () => {
  let answer: (tabs: readonly { id: number; url?: string }[]) => void = () => {}
  const tabs = browserTabs()
  const port: SiteTabsPort = { ...tabs.port, query: () => new Promise(resolve => (answer = resolve)) }
  let left = 0
  const stop = watchSiteTabs(port, () => left++)
  tabs.update(1, "https://www.youtube.com/")
  tabs.update(1)
  answer([{ id: 1, url: "https://www.youtube.com/" }, { id: 5, url: "https://www.youtube.com/" }])
  await settle()
  expect(left).toBe(1)
  tabs.update(5)
  expect(left).toBe(2)
  stop()
})

test("a tab that showed YouTube and closes has left, and a closing tab that showed no site hasn't", async () => {
  const tabs = browserTabs([{ id: 1, url: "https://www.youtube.com/watch?v=a" }, { id: 2 }, { id: 3, url: "https://music.youtube.com/" }])
  let left = 0
  const stop = watchSiteTabs(tabs.port, () => left++)
  await settle()
  tabs.close(2)
  tabs.close(9)
  expect(left).toBe(0)
  tabs.close(1)
  expect(left).toBe(1)
  tabs.close(1)
  expect(left).toBe(1)
  tabs.close(3)
  expect(left).toBe(2)
  stop()
  expect(tabs.listening()).toBe(0)
})
