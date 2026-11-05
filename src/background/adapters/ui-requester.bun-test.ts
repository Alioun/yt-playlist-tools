import { expect, test } from "bun:test"
import { authenticateUiRequester, type UiRequesterPorts } from "./ui-requester"
import { popup, settings } from "../../../tools/fixtures/ui-read-playlist-bridge/harness"

function native() {
  let queries = 0
  const ports: UiRequesterPorts = {
    runtime: { id: "fixture-extension", getURL: path => `chrome-extension://fixture-extension${path}` },
    windows: {
      async get(id) {
        if (id !== 1 && id !== 2) throw Error("Unknown fixture window")
        return { id, incognito: id === 2 }
      }
    },
    tabs: {
      async query({ windowId }) {
        queries++
        return [{ id: windowId === 1 ? 7 : 9, windowId, incognito: windowId === 2, active: true }]
      }
    }
  }
  return { ports, queries: () => queries }
}
test("native authentication precedes active-tab lookup", async () => {
  const h = native()
  expect((await authenticateUiRequester(h.ports, { sender: { ...popup(), id: "forged" }, windowId: 1 })).kind).toBe("rejected")
  expect((await authenticateUiRequester(h.ports, { sender: { ...popup(), frameId: 1 }, windowId: 1 })).kind).toBe("rejected")
  expect((await authenticateUiRequester(h.ports, { sender: popup(), windowId: 99 })).kind).toBe("rejected")
  expect(h.queries()).toBe(0)
})
test("popup active tab and privacy come from its verified native window", async () => {
  const h = native()
  const result = await authenticateUiRequester(h.ports, { sender: popup(2), windowId: 2 })
  expect(result.kind).toBe("accepted")
  if (result.kind === "accepted") expect(result.context.requester).toEqual({ windowId: 2, incognito: true, activeTabId: 9 })
  const wrong: UiRequesterPorts = {
    ...h.ports,
    tabs: {
      async query() {
        return [{ id: 7, windowId: 2, incognito: false, active: true }]
      }
    }
  }
  expect((await authenticateUiRequester(wrong, { sender: popup(2), windowId: 2 })).kind).toBe("rejected")
})
test("settings preserves its sender tab and refuses a body window claim", async () => {
  const h = native()
  expect((await authenticateUiRequester(h.ports, { sender: settings(), windowId: 1 })).kind).toBe("rejected")
  const result = await authenticateUiRequester(h.ports, { sender: settings(), windowId: undefined })
  expect(result.kind).toBe("accepted")
  if (result.kind === "accepted") expect(result.context.requester).toEqual({ windowId: 1, incognito: false, activeTabId: 20 })
  expect(h.queries()).toBe(0)
})
