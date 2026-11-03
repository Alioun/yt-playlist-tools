import { expect, test } from "bun:test"
import { executeDeviceSetting } from "../store/device-setting"
import { createPageReceiver, type PageReceiverPorts } from "./ui-pages"
import type { SessionChange, SessionRead } from "../store/session-memory"
import type { UiRequester } from "../adapters/ui-requester"
import type { SyncJoinPreparation, SyncJoinResult } from "../store/sync-join-execution"

const acct = "AAAAAAAAAAAAAAAA" as never,
  other = "BBBBBBBBBBBBBBBB"
const memory = (paused: boolean) => ({ kind: "memory", revision: { reset: 0, accounts: new Map() }, sequence: 1, memory: { paused } }) as unknown as SessionRead
const ui = (incognito = false, page = "popup", principal = "p") =>
  ({ ui: { kind: "ui", page, origin: { kind: "ui", windowId: 3, incognito } }, requester: { windowId: 3, incognito, activeTabId: 9 }, principal }) as unknown as UiRequester

function receiver(overrides: Partial<PageReceiverPorts> = {}) {
  const changes: SessionChange[] = []
  const filters: unknown[] = []
  const removed: unknown[] = []
  const marked: string[] = [],
    agreements: unknown[] = [],
    acknowledged: unknown[] = [],
    discarded: string[] = [],
    recovered: unknown[] = []
  const removalJob = { kind: "held-job-selection", job: "removal" },
    syncJob = { kind: "held-job-selection", job: "sync" }
  const held: unknown[] = [
    { kind: "account-removal", selection: removalJob, occurrence: 1, record: { acct }, original: { v: 1, at: 1 }, recoverability: "exact-removal" },
    { kind: "sync-reset", selection: syncJob, record: {}, resume: "explicit-recovery" },
    { kind: "unsupported", operation: "legacy", reason: "invalid" }
  ]
  let paused = false
  const sync = {
    preparation: { kind: "automatic", review: { kind: "sync-join-review" }, reason: "empty-copy" } as SyncJoinPreparation,
    calls: [] as string[],
    cancelled: 0,
    started: 0,
    result: { kind: "committed", historyId: "h", replication: "pending", mutations: [] } as SyncJoinResult
  }
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
      async change(_origin, change) {
        filters.push(change)
        return change.desired.on ? { kind: "result", result: { ok: true } } : { kind: "result", result: { refused: "sync-full" } }
      },
      async changeFilterChannel(_origin, change) {
        filters.push(change)
        return { kind: "result", result: { ok: true } }
      },
      async removeKeptFilters() {
        return { kind: "removed", filters: 2 }
      },
      prepareAccountRemoval: async (_origin, removing) => ({ kind: "confirmation-required", confirmation: { removing } as never, acct: removing, label: "Ann", scope: { kind: "this-browser" } }),
      async removeAccountSetup(_origin, confirmation) {
        removed.push(confirmation)
        return { kind: "committed" }
      },
      exportSettings: async () => ({ kind: "unavailable", reason: "origin" }) as never,
      prepareSettingsImport: async () => ({ kind: "refused", reason: "invalid" }),
      importSettings: async () => ({ kind: "committed" }) as never,
      async markUpgradeNote(flag) {
        marked.push(flag)
        return "set"
      },
      readAgreement: async () => ({ kind: "review", version: 1, review: {} as never, presentation: { kind: "canonical", note: { state: "pending" } } }) as never,
      async agree(_origin, input) {
        agreements.push(input.choice)
        return { kind: "agreed" } as never
      },
      readClaimNotice: async () => ({ kind: "pending", notice: { acct: "AAAAAAAAAAAAAAAA", dropped: 1 } }) as never,
      async acknowledgeClaimNotice(origin, expected) {
        acknowledged.push({ origin, expected })
        return { kind: "committed", write: { kind: "resolved" } }
      },
      async discardUnclaimed() {
        discarded.push("discard")
        return { kind: "discarded" }
      },
      async readWithdrawnWork() {
        return held.length ? ({ kind: "held", review: { kind: "withdrawn-work-review" }, consent: null, work: held } as never) : { kind: "none" }
      },
      async recoverWithdrawnWork(_origin, input) {
        recovered.push(input.job)
        held.splice(0, 1)
        return { kind: "recovered" } as never
      },
      beginSyncJoin() {
        sync.calls.push("begin")
        return {
          result: Promise.resolve(sync.preparation),
          cancel() {
            sync.cancelled++
          }
        }
      },
      async applySyncJoin(_origin, input) {
        sync.calls.push(input.kind === "choice" ? `apply:${input.choice}` : "apply:automatic")
        return sync.result
      },
      async cancelSyncJoin() {
        sync.calls.push("cancel")
        return { kind: "cancelled" }
      },
      async resumeSyncJoin() {
        sync.calls.push("resume")
        return sync.result
      },
      async startSync() {
        sync.started++
      }
    },
    readAccess: async () => ({ www: true, music: false, browserMenu: false }),
    withdraw: async () => ({ kind: "withdrawn" }) as never,
    version: () => "2.0.0",
    session: { get: async () => [] },
    status: async () => ({ tab: { kind: "site", site: "www", tabId: 9, signedIn: true, acct }, health: [{ feature: "auto-add", site: "www", state: "not-working", gaps: [] }] }),
    now: () => 1000,
    ...overrides
  }
  const context = (incognito = false, page = "popup", principal = "p") => ({ ui: ui(incognito, page, principal), current: async () => ui(incognito, page, principal) })
  return { handlers: createPageReceiver(ports), changes, filters, removed, marked, agreements, acknowledged, discarded, recovered, removalJob, context, sync }
}

test("status answers Pause, the popup's tab and its feature health", async () => {
  const { handlers, context } = receiver()
  expect(await handlers["ui.status"]({}, context())).toEqual({
    kind: "status",
    paused: false,
    tab: { kind: "site", site: "www", tabId: 9, signedIn: true, acct },
    health: [{ feature: "auto-add", site: "www", state: "not-working", gaps: [] }]
  })
})

test("OK on the claim result acknowledges the notice it showed, and never another account's or from a private window (ACC-32)", async () => {
  const { handlers, acknowledged, context } = receiver()
  expect(await handlers["ui.claimSeen"]({ acct: "BBBBBBBBBBBBBBBB" as never }, context())).toEqual({ kind: "unavailable" })
  expect(await handlers["ui.claimSeen"]({ acct }, context(true))).toEqual({ kind: "unavailable" })
  expect(acknowledged).toEqual([])
  expect(await handlers["ui.claimSeen"]({ acct }, context())).toEqual({ kind: "noted" })
  expect(acknowledged).toEqual([{ origin: { kind: "ui", windowId: 3, incognito: false }, expected: { acct, dropped: 1 } }])
})

test("Discard deletes the unclaimed setup, and a private window can't (ACC-33)", async () => {
  const { handlers, discarded, context } = receiver()
  expect(await handlers["ui.discardUnclaimed"]({}, context(true))).toEqual({ kind: "refused", reason: "private" })
  expect(await handlers["ui.discardUnclaimed"]({}, context())).toEqual({ kind: "discarded" })
  expect(discarded).toEqual(["discard"])
})

test("Privacy & data lists the work withdrawal paused, and Continue resumes only the job that page read (R167)", async () => {
  const { handlers, recovered, removalJob, context } = receiver()
  expect(await handlers["ui.pausedWork"]({ action: "read" }, context(false, "popup"))).toEqual({ kind: "refused", reason: "unavailable" })
  expect(await handlers["ui.pausedWork"]({ action: "continue", id: "1" }, context(false, "settings", "other"))).toEqual({ kind: "refused", reason: "unavailable" })
  expect(await handlers["ui.pausedWork"]({ action: "read" }, context(false, "settings"))).toEqual({
    kind: "work",
    jobs: [
      { id: "1", job: "removal", acct },
      { id: "2", job: "sync", acct: null }
    ]
  })
  expect(await handlers["ui.pausedWork"]({ action: "continue", id: "1" }, context(false, "settings"))).toEqual({ kind: "continued", jobs: [{ id: "1", job: "sync", acct: null }] })
  expect(recovered).toEqual([removalJob])
})

test("the sync switch joins at once when nothing needs choosing, starts syncing, and switches off (SYNC-08, SYNC-19)", async () => {
  const { handlers, context, sync } = receiver()
  expect(await handlers["ui.sync"]({ action: "join" }, context(false, "popup"))).toEqual({ kind: "unavailable", reason: "operation" })
  expect(await handlers["ui.sync"]({ action: "join" }, context(true, "settings")), "a private window may switch sync (SYNC-25)").toEqual({ kind: "on" })
  expect(sync.calls).toEqual(["begin", "apply:automatic"])
  expect(sync.started).toBe(1)
  expect(await handlers["ui.sync"]({ action: "off" }, context(false, "settings"))).toEqual({ kind: "off" })
  expect(sync.calls.at(-1)).toBe("cancel")
})

test("the join question comes back as a token only the page that asked can answer, and Cancel leaves sync off (UI-SET-13)", async () => {
  const { handlers, context, sync } = receiver()
  sync.preparation = { kind: "choice-required", review: { kind: "sync-join-review" }, reason: "independent-settings", defaultChoice: "use-synced" }
  const asked = await handlers["ui.sync"]({ action: "join" }, context(false, "settings", "page-a"))
  if (asked.kind !== "choose") throw Error(`Expected the join question, got ${JSON.stringify(asked)}`)
  expect(await handlers["ui.sync"]({ action: "choose", token: asked.token, choice: "use-synced" }, context(false, "settings", "page-b"))).toEqual({ kind: "unavailable", reason: "operation" })
  const again = await handlers["ui.sync"]({ action: "join" }, context(false, "settings", "page-a"))
  if (again.kind !== "choose") throw Error("Expected the question again")
  expect(await handlers["ui.sync"]({ action: "choose", token: again.token, choice: "use-this-browser" }, context(false, "settings", "page-a"))).toEqual({ kind: "on" })
  expect(sync.calls).toEqual(["begin", "begin", "apply:use-this-browser"])
  const third = await handlers["ui.sync"]({ action: "join" }, context(false, "settings", "page-a"))
  if (third.kind !== "choose") throw Error("Expected the question a third time")
  expect(await handlers["ui.sync"]({ action: "cancel", token: third.token }, context(false, "settings", "page-a"))).toEqual({ kind: "off" })
  expect(sync.cancelled).toBe(1)
  expect(await handlers["ui.sync"]({ action: "choose", token: third.token, choice: "use-synced" }, context(false, "settings", "page-a")), "a cancelled question can't be answered").toEqual({
    kind: "unavailable",
    reason: "operation"
  })
})

test("a join that doesn't fit names what takes the most room, and an interrupted join finishes on the next switch-on (SYNC-09)", async () => {
  const { handlers, context, sync } = receiver()
  sync.preparation = { kind: "refused", reason: "sync-full", quota: { exceeded: ["bytes"], bytes: 99_000, items: 40, largest: { kind: "filter", bytes: 40_000, items: 5 } } }
  expect(await handlers["ui.sync"]({ action: "join" }, context(false, "settings"))).toEqual({ kind: "refused", reason: "sync-full", largest: { kind: "filter", bytes: 40_000 } })
  sync.preparation = { kind: "unavailable", reason: "stale" }
  expect(await handlers["ui.sync"]({ action: "join" }, context(false, "settings"))).toEqual({ kind: "refused", reason: "changed" })
  sync.preparation = { kind: "unavailable", reason: "pending-join" }
  expect(await handlers["ui.sync"]({ action: "join" }, context(false, "settings"))).toEqual({ kind: "on" })
  expect(sync.calls.at(-1)).toBe("resume")
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
  expect(answer.kind === "recent" && answer.entries.map(entry => [entry.videos.map(video => video.title), entry.gather])).toEqual([
    [["One"], false],
    [["Three"], true]
  ])
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
    async set(items: Record<string, unknown>) {
      if (!options.dropWrite) Object.assign(records, structuredClone(items))
    }
  }
}
const agreed = { schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: false } }

test("a device setting is written, read back and keeps the rest of the record", async () => {
  const store = local(structuredClone(agreed))
  expect(await executeDeviceSetting({ local: store as never, change: { field: "pickerSortAZ", value: true }, isStopped: () => false })).toEqual({
    kind: "confirmed",
    change: { field: "pickerSortAZ", value: true }
  })
  expect(store.records.device).toEqual({ id: "device", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: true })
})

test("a device setting refuses before consent, when the record changed meanwhile, and when the write didn't land", async () => {
  const change = { field: "detailedLog", value: true } as const
  expect(await executeDeviceSetting({ local: local({ schema: 1, device: { id: "d", consent: null, syncOn: false } }) as never, change, isStopped: () => false })).toEqual({
    kind: "refused",
    reason: "unavailable"
  })
  expect(await executeDeviceSetting({ local: local(structuredClone(agreed), { changeBeforeWrite: true }) as never, change: { field: "pickerSortAZ", value: true }, isStopped: () => false })).toEqual({
    kind: "refused",
    reason: "unavailable"
  })
  expect(await executeDeviceSetting({ local: local(structuredClone(agreed), { dropWrite: true }) as never, change, isStopped: () => false })).toEqual({ kind: "refused", reason: "unconfirmed" })
})

test("a filter setting reaches the store with its confirmation, and the store's refusal comes back", async () => {
  const { handlers, filters, context } = receiver()
  const change = { acct, playlist: "PLa" as never, desired: { mode: "deny", on: true } as const, clearListed: true, expectedGeneration: "gen-1" }
  expect(await handlers["ui.filter"]({ change }, context())).toEqual({ kind: "confirmed" })
  expect(filters).toEqual([{ acct, playlist: "PLa", desired: { mode: "deny", on: true }, clearListedChannels: "confirmed", expectedGeneration: "gen-1" }])
  expect(await handlers["ui.filter"]({ change: { ...change, desired: { mode: "deny", on: false }, clearListed: false } }, context())).toEqual({ kind: "refused", reason: "sync-full" })
  expect(await handlers["ui.filter"]({ change }, context(true))).toEqual({ kind: "refused", reason: "private" })
})

test("a channel edit carries a confirmed switch with its generation, and Remove kept filters answers how many went", async () => {
  const { handlers, filters, context } = receiver()
  const channel = ["UCAAAAAAAAAAAAAAAAAAAAAA", "Lofi Girl"] as never
  const change = { acct, playlist: "PLa" as never, channel, action: "list", mode: "allow", clearListed: true, expectedGeneration: "gen-2" } as const
  expect(await handlers["ui.filterChannel"]({ change }, context())).toEqual({ kind: "confirmed" })
  expect(await handlers["ui.filterChannel"]({ change: { ...change, action: "unlist", mode: null, clearListed: false } }, context())).toEqual({ kind: "confirmed" })
  expect(filters).toEqual([
    { acct, playlist: "PLa", channel, action: "list", mode: "allow", clearListedChannels: "confirmed", expectedGeneration: "gen-2" },
    { acct, playlist: "PLa", channel, action: "unlist", mode: null, clearListedChannels: "not-confirmed" }
  ])
  expect(await handlers["ui.filterChannel"]({ change }, context(true))).toEqual({ kind: "refused", reason: "private" })
  expect(await handlers["ui.removeKeptFilters"]({}, context())).toEqual({ kind: "removed", filters: 2 })
  expect(await handlers["ui.removeKeptFilters"]({}, context(true))).toEqual({ kind: "refused", reason: "private" })
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

test("only the first-run page marks the note seen, and its Agree carries the question's answer as the note's choice", async () => {
  const { handlers, marked, agreements, context } = receiver()
  expect(await handlers["ui.noteSeen"]({}, context())).toEqual({ kind: "unavailable" })
  expect(await handlers["ui.noteSeen"]({}, context(false, "onboarding"))).toEqual({ kind: "noted" })
  expect(marked).toEqual(["seen"])
  await handlers["ui.noteAgree"]({ change: { displayedVersion: 1, attempt: 1, selected: ["auto-add"], syncOn: false, percentage: "half" } }, context(false, "onboarding"))
  expect(agreements).toEqual([{ kind: "upgrade-note", selected: ["auto-add"], syncOn: false, percentage: "half" }])
})
