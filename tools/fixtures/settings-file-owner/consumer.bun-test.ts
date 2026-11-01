import { expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { settingsPageConsumer } from "./consumer"
import { harness, clone } from "./harness"
import type { SenderOriginPorts, NativeSender } from "../../../src/background/adapters/sender-origin"

async function nativeFacts(privacy: boolean | "unavailable") {
  const window = await fakeBrowser.windows.create({ incognito: privacy === true })
  if (window?.id === undefined) throw Error("missing-dummy-window")
  const tab = await fakeBrowser.tabs.create({ windowId: window.id, url: "moz-extension://dummy/options.html" })
  const calls: unknown[] = []
  const ports: SenderOriginPorts = {
    runtime: { id: "dummy-extension", getURL: path => `moz-extension://dummy${path}` },
    windows: { async get(id) {
      calls.push({ window: id })
      if (privacy === "unavailable") throw Error("dummy-window-unavailable")
      return { id, incognito: privacy }
    } }
  }
  const sender: NativeSender = { id: "dummy-extension", frameId: 0, url: "moz-extension://dummy/options.html",
    tab: { ...tab, windowId: window.id, incognito: privacy === true } }
  return { calls, ports, sender, windowId: window.id }
}

for (const privacy of [false, true, "unavailable"] as const) test(`consumer obtains privacy from the real resolver over dummy native facts ${privacy}`, async () => {
  const h = harness(); await h.ready()
  const before = clone(h.records), facts = await nativeFacts(privacy)
  const result = await settingsPageConsumer(h.owner, facts.ports, facts.sender)
  expect(facts.calls).toEqual([{ window: facts.windowId }])
  if (privacy === "unavailable") {
    expect(result).toEqual({ kind: "unavailable" })
    expect(h.calls).toEqual([])
  } else {
    if (result.kind !== "checked") throw Error("missing-consumer-file")
    expect(result.file.filename).toBe("perchling-settings-2026-10-30.json")
    expect(result.file.mime).toBe("application/json")
    expect(result.file.text).not.toContain("PRIVATE")
    if (privacy) expect(result.checked).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
    else expect(result.checked.kind === "import-plan" && result.checked.accountCount).toBe(3)
    expect(h.calls).toEqual(privacy ? [{ get: null }, { get: null }] : [{ get: null }, { get: null }, { get: null }, { get: null }])
  }
  expect(h.records).toEqual(before)
  await h.owner.dispose()
})

test("a settings sender's claimed privacy cannot override independent window facts", async () => {
  const h = harness(); await h.ready()
  const facts = await nativeFacts(true)
  if (!facts.sender.tab) throw Error("missing-dummy-tab")
  facts.sender.tab.incognito = false
  expect(await settingsPageConsumer(h.owner, facts.ports, facts.sender)).toEqual({ kind: "unavailable" })
  expect(h.calls).toEqual([])
  await h.owner.dispose()
})
