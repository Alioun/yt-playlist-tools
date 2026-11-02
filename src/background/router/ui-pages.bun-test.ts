import { expect, test } from "bun:test"
import { executeDeviceSetting } from "../store/device-setting"
import { createPageReceiver, type PageReceiverPorts } from "./ui-pages"
import type { SessionChange, SessionRead } from "../store/session-memory"
import type { UiRequester } from "../adapters/ui-requester"

const acct = "AAAAAAAAAAAAAAAA" as never, other = "BBBBBBBBBBBBBBBB"
const memory = (paused: boolean) => ({ kind: "memory", revision: { reset: 0, accounts: new Map() }, sequence: 1, memory: { paused } }) as unknown as SessionRead
const ui = (incognito = false, page = "popup", principal = "p") => ({ ui: { kind: "ui", page, origin: { kind: "ui", windowId: 3, incognito } },
  requester: { windowId: 3, incognito, activeTabId: 9 }, principal }) as unknown as UiRequester

function receiver(overrides: Partial<PageReceiverPorts> = {}) {
  const changes: SessionChange[] = []
  const filters: unknown[] = []
  const removed: unknown[] = []
  let paused = false
  const ports: PageReceiverPorts = {
    owner: {
      readSession: async () => memory(paused),
      async changeSession(change) {
        changes.push(change)
        const edit = change.edits[0]
        if (edit.kind === "pause") paused = edit.paused
        return { kind: "committed", revision: { reset: 0, accounts: new Map() }, sequence: 2, memory: { paused } } as never
      },
      changeDeviceSetting: async (_origin, change) => ({ kind: "confirmed", change }),
      async change(_origin, change) { filters.push(change); return change.desired.on ? { kind: "result", result: { ok: true } } : { kind: "result", result: { refused: "sync-full" } } },
      prepareAccountRemoval: async (_origin, removing) => ({ kind: "confirmation-required", confirmation: { removing } as never, acct: removing, label: "Ann", scope: { kind: "this-browser" } }),
      async removeAccountSetup(_origin, confirmation) { removed.push(confirmation); return { kind: "committed" } },
      exportSettings: async () => ({ kind: "unavailable", reason: "origin" }) as never,
      prepareSettingsImport: async () => ({ kind: "refused", reason: "invalid" }),
      importSettings: async () => ({ kind: "committed" }) as never
    },
    withdraw: async () => ({ kind: "withdrawn" }) as never,
    version: () => "2.0.0",
    session: { get: async () => [] },
    status: async () => ({ tab: { kind: "site", site: "www", tabId: 9, signedIn: true, acct }, health: [{ feature: "auto-add", site: "www", state: "not-working", gaps: [] }] }),
    now: () => 1000,
    ...overrides
  }
  const context = (incognito = false, page = "popup", principal = "p") => ({ ui: ui(incognito, page, principal), current: async () => ui(incognito, page, principal) })
  return { handlers: createPageReceiver(ports), changes, filters, removed, context }
}

test("status answers Pause, the popup's tab and its feature health", async () => {
  const { handlers, context } = receiver()
  expect(await handlers["ui.status"]({}, context())).toEqual({ kind: "status", paused: false,
    tab: { kind: "site", site: "www", tabId: 9, signedIn: true, acct }, health: [{ feature: "auto-add", site: "www", state: "not-working", gaps: [] }] })
})

test("Pause writes session memory and answers the committed state; a private window can't pause", async () => {
  const { handlers, changes, context } = receiver()
  expect(await handlers["ui.pause"]({ paused: true }, context())).toEqual({ kind: "paused", paused: true })
  expect(changes.map(change => change.edits)).toEqual([[{ kind: "pause", paused: true }]])
  expect(await handlers["ui.pause"]({ paused: false }, context(true))).toEqual({ kind: "refused", reason: "unavailable" })
})

test("recent adds list only the account in view's adds, singles and gathers alike", async () => {
  const rows = [
    { kind: "single", acct, at: 5, source: { kind: "feature", feature: "auto-add" }, playlists: [{ id: "PLa", title: "A" }], video: { id: "aaaaaaaaaaa", title: "One" } },
    { kind: "single", acct: other, at: 4, source: { kind: "feature", feature: "auto-add" }, playlists: [{ id: "PLb", title: "B" }], video: { id: "bbbbbbbbbbb", title: "Two" } },
    { kind: "gather", acct, at: 3, source: { kind: "feature", feature: "gather" }, playlists: [{ id: "PLa", title: "A" }], videos: [{ id: "ccccccccccc", title: "Three" }] },
    { kind: "single", acct, at: "bad" }
  ]
  const { handlers, context } = receiver({ session: { get: async () => rows } })
  const answer = await handlers["ui.recentAdds"]({ acct }, context())
  expect(answer.kind === "recent" && answer.entries.map(entry => [entry.videos.map(video => video.title), entry.gather])).toEqual([[["One"], false], [["Three"], true]])
})

test("switching recent adds off clears the list at once (DATA-52)", async () => {
  const { handlers, changes, context } = receiver()
  expect(await handlers["ui.device"]({ change: { field: "recentAdds", value: false } }, context())).toEqual({ kind: "confirmed", change: { field: "recentAdds", value: false } })
  expect(changes.map(change => change.edits)).toEqual([[{ kind: "recent-adds-clear" }]])
  await handlers["ui.device"]({ change: { field: "pickerSortAZ", value: true } }, context())
  expect(changes).toHaveLength(1)
})

function local(records: Record<string, unknown>, options: { changeBeforeWrite?: boolean; dropWrite?: boolean } = {}) {
  let reads = 0
  return {
    records,
    async get(keys: readonly string[] | null) {
      reads++
      if (options.changeBeforeWrite && reads === 2) records.device = { ...(records.device as object), detailedLog: true }
      return structuredClone(keys === null ? records : Object.fromEntries(keys.filter(key => key in records).map(key => [key, records[key]])))
    },
    async set(items: Record<string, unknown>) { if (!options.dropWrite) Object.assign(records, structuredClone(items)) }
  }
}
const agreed = { schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: false } }

test("a device setting is written, read back and keeps the rest of the record", async () => {
  const store = local(structuredClone(agreed))
  expect(await executeDeviceSetting({ local: store as never, change: { field: "pickerSortAZ", value: true }, isStopped: () => false }))
    .toEqual({ kind: "confirmed", change: { field: "pickerSortAZ", value: true } })
  expect(store.records.device).toEqual({ id: "device", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: true })
})

test("a device setting refuses before consent, when the record changed meanwhile, and when the write didn't land", async () => {
  const change = { field: "detailedLog", value: true } as const
  expect(await executeDeviceSetting({ local: local({ schema: 1, device: { id: "d", consent: null, syncOn: false } }) as never, change, isStopped: () => false }))
    .toEqual({ kind: "refused", reason: "unavailable" })
  expect(await executeDeviceSetting({ local: local(structuredClone(agreed), { changeBeforeWrite: true }) as never, change: { field: "pickerSortAZ", value: true }, isStopped: () => false }))
    .toEqual({ kind: "refused", reason: "unavailable" })
  expect(await executeDeviceSetting({ local: local(structuredClone(agreed), { dropWrite: true }) as never, change, isStopped: () => false }))
    .toEqual({ kind: "refused", reason: "unconfirmed" })
})

test("a filter setting reaches the store with its confirmation, and the store's refusal comes back", async () => {
  const { handlers, filters, context } = receiver()
  const change = { acct, playlist: "PLa" as never, desired: { mode: "deny", on: true } as const, clearListed: true, expectedGeneration: "gen-1" }
  expect(await handlers["ui.filter"]({ change }, context())).toEqual({ kind: "confirmed" })
  expect(filters).toEqual([{ acct, playlist: "PLa", desired: { mode: "deny", on: true }, clearListedChannels: "confirmed", expectedGeneration: "gen-1" }])
  expect(await handlers["ui.filter"]({ change: { ...change, desired: { mode: "deny", on: false }, clearListed: false } }, context())).toEqual({ kind: "refused", reason: "sync-full" })
  expect(await handlers["ui.filter"]({ change }, context(true))).toEqual({ kind: "refused", reason: "private" })
})

test("removing a setup confirms with the token the same page got, and only Settings can ask", async () => {
  const { handlers, removed, context } = receiver()
  expect(await handlers["ui.removeSetup"]({ action: "prepare", acct }, context())).toEqual({ kind: "unavailable", reason: "operation" })
  const prepared = await handlers["ui.removeSetup"]({ action: "prepare", acct }, context(false, "settings"))
  if (prepared.kind !== "confirm") throw Error("no confirmation")
  expect(prepared.scope).toBe("this-browser")
  expect(await handlers["ui.removeSetup"]({ action: "confirm", token: prepared.token }, context(false, "settings", "other"))).toEqual({ kind: "unavailable", reason: "operation" })
  const again = await handlers["ui.removeSetup"]({ action: "prepare", acct }, context(false, "settings"))
  if (again.kind !== "confirm") throw Error("no confirmation")
  expect(await handlers["ui.removeSetup"]({ action: "confirm", token: again.token }, context(false, "settings"))).toEqual({ kind: "removed" })
  expect(removed).toEqual([{ removing: acct }])
})

test("withdrawal runs only from Settings, and an unusable import file is refused as such", async () => {
  const { handlers, context } = receiver()
  expect(await handlers["ui.withdraw"]({ expected: { v: 1, at: 1 } }, context())).toEqual({ kind: "unavailable", reason: "operation" })
  expect(await handlers["ui.withdraw"]({ expected: { v: 1, at: 1 } }, context(false, "settings"))).toEqual({ kind: "withdrawn" })
  expect(await handlers["ui.importSettings"]({ action: "prepare", text: "{}" }, context(false, "settings"))).toEqual({ kind: "refused", reason: "invalid-file" })
  expect(await handlers["ui.importSettings"]({ action: "prepare", text: "{}" }, context(true, "settings"))).toEqual({ kind: "refused", reason: "private" })
})
