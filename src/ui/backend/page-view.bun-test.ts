import { expect, test } from "bun:test"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend } from "./scripted"
import type { PageView } from "./backend"

const build = (() => { const value = "page-view-test"; if (!isBuildId(value)) throw Error("build"); return value })()
const acct = "AAAAAAAAAAAAAAAA", other = "BBBBBBBBBBBBBBBB"
const stamped = (data: object) => ({ v: 1, gen: "g", at: 1, by: "device", data }) as never

function backend(records: Record<string, unknown>) {
  return createScriptedBackend({ build, deadline: () => () => {}, answers: [], records: records as never })
}
function view(page: PageView) {
  if (page.kind !== "view") throw Error(`unavailable: ${page.reason}`)
  return page
}

test("a page view reads every setup with its filters and cache, and drops watch progress and 1.x leftovers", async () => {
  const scripted = backend({
    schema: 1, device: { id: "device", consent: { v: 1, at: 5 }, syncOn: true, recentAdds: false },
    [`doc:setup:${acct}`]: stamped({ label: { name: "Zed" }, autoAdd: [{ pl: "PLzed", takes: "both", pct: 30 }] }),
    [`doc:setup:${other}`]: stamped({ label: { name: "Ann" }, quickSave: "PLann" }),
    [`doc:filter:${acct}:PLzed`]: stamped({ mode: "allow", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Tiny Science"]] }),
    [`cache:${acct}`]: { listAt: 10, playlists: [{ id: "PLzed", title: "Later" }], order: {}, created: [], labelAt: null },
    [`progress:${acct}:0`]: { huge: true },
    oauthToken: "dummy-1x-token",
    sync: { joined: null, pushed: {}, status: "full", editedSinceOff: false }
  })
  const page = view(await scripted.backend.loadPage())
  expect(page.layout).toBe("current")
  expect(page.device.kind === "current" && page.device.device.recentAdds).toBe(false)
  expect(page.setups.map(entry => [entry.acct, entry.setup.label?.name])).toEqual([[other, "Ann"], [acct, "Zed"]])
  const zed = page.setups[1]!
  expect(zed.setup.autoAdd).toEqual([{ pl: "PLzed", takes: "both", pct: 30 }])
  expect(zed.filters.get("PLzed" as never)?.channels).toEqual([["UCaaaaaaaaaaaaaaaaaaaaaa", "Tiny Science"]])
  expect(zed.cache?.playlists.map(row => row.title)).toEqual(["Later"])
  expect(page.sync?.status).toBe("full")
  expect(JSON.stringify(page)).not.toContain("dummy-1x-token")
  expect(JSON.stringify(page)).not.toContain("huge")
  scripted.dispose()
})

test("a removed setup isn't listed, and a record that doesn't decode reads as absent", async () => {
  const scripted = backend({
    schema: 1, device: { id: "device", consent: null, syncOn: false },
    [`doc:setup:${acct}`]: { v: 1, gen: "g", at: 1, by: "device", deleted: true },
    [`doc:setup:${other}`]: stamped({ autoAdd: "not a list" }),
    sync: { status: 7 }
  })
  const page = view(await scripted.backend.loadPage())
  expect(page.setups).toEqual([])
  expect(page.sync).toBeNull()
  expect(page.device.kind === "current" && page.device.device.consent).toBeNull()
  scripted.dispose()
})

test("a watched page redraws for a setup change and not for watch progress", async () => {
  const scripted = backend({ schema: 1, device: { id: "device", consent: { v: 1, at: 5 }, syncOn: false } })
  const seen: number[] = []
  const stop = scripted.backend.watchPage(event => { seen.push(view(event.view).setups.length) })
  scripted.replace({ [`progress:${acct}:3`]: { any: 1 } })
  scripted.replace({ [`doc:setup:${acct}`]: stamped({ quickSave: "PLx" }) })
  await Bun.sleep(0)
  await Bun.sleep(0)
  expect(seen).toEqual([1])
  stop()
  expect(scripted.listening()).toBe(0)
  scripted.dispose()
})
