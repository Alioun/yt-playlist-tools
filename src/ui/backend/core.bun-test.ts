import { expect, test } from "bun:test"
import { createBackend } from "./core"
import { createScriptedBackend } from "./scripted"
import { readFirstRunSnapshot } from "../../shared/model/first-run-view"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { isAccountKey, isPlaylistId } from "../../shared/model/validation"
import type { LocalListener, UiEvent } from "./backend"
import { isAutoAddLifetime, type AutoAddChoiceChange } from "../../shared/contracts/auto-add-choice"
import type { ChangeAnswer } from "../../shared/contracts/first-run"

function build() {
  const value = "local-read-test"
  if (!isBuildId(value)) throw Error("fixture build")
  return value
}
const options = { build: build(), deadline: () => () => {} }
const seed = { schema: 1, device: { id: "SENTINEL_DEVICE_ID", consent: null, syncOn: false, unknown: "SENTINEL_UNKNOWN" } }

test("Backend keeps auto-add answers separate and rejects wrong account, playlist and edited fact", async () => {
  const acct = "AAAAAAAAAAAAAAAA",
    other = "BBBBBBBBBBBBBBBB",
    playlist = "PL_one",
    wrongPlaylist = "PL_wrong",
    lifetime = "00000000-0000-4000-8000-000000000001"
  if (!isAccountKey(acct) || !isAccountKey(other) || !isPlaylistId(playlist) || !isPlaylistId(wrongPlaylist) || !isAutoAddLifetime(lifetime)) throw Error("fixture identities")
  const request: AutoAddChoiceChange = { kind: "auto-add-choice", acct, playlist, lifetime, edit: { kind: "takes", expected: "videos", takes: "both" } }
  const valid = { kind: "auto-add-confirmed", acct, playlist, fact: { kind: "selected", takes: "both", pct: null } } as const
  const results: ChangeAnswer[] = [
    { kind: "agreement", outcome: { kind: "agreed", attempt: 1, applications: [] } },
    { kind: "destination", outcome: { kind: "confirmed", playlist } },
    { kind: "auto-add-choice", outcome: { ...valid, acct: other } },
    { kind: "auto-add-choice", outcome: { ...valid, playlist: wrongPlaylist } },
    { kind: "auto-add-choice", outcome: { ...valid, fact: { kind: "selected", takes: "videos", pct: null } } }
  ]
  for (const result of results) {
    const fake = createScriptedBackend({ ...options, answers: [{ kind: "ui.change", result }] })
    try {
      expect(await fake.backend.change(request)).toEqual({ kind: "refused", reason: "unconfirmed" })
    } finally {
      fake.dispose()
    }
  }
  const fake = createScriptedBackend({ ...options, answers: [{ kind: "ui.change", result: { kind: "auto-add-choice", outcome: valid } }] })
  try {
    expect(await fake.backend.change({ kind: "setup-destination", acct, playlist, destination: { kind: "quick-save" }, expected: { setup: "none" } })).toEqual({
      kind: "refused",
      reason: "unconfirmed"
    })
  } finally {
    fake.dispose()
  }
})
test("a timed-out or lost auto-add answer sends the mutation once and never retries", async () => {
  const acct = "AAAAAAAAAAAAAAAA",
    playlist = "PL_one",
    lifetime = "00000000-0000-4000-8000-000000000001"
  if (!isAccountKey(acct) || !isPlaylistId(playlist) || !isAutoAddLifetime(lifetime)) throw Error("fixture identities")
  let expire = () => {},
    answer: (value: unknown) => void = () => {},
    sends = 0
  const backend = createBackend(
    {
      local: {
        async get() {
          return {}
        },
        async all() {
          return {}
        },
        onChanged: { addListener() {}, removeListener() {} }
      },
      send() {
        sends++
        return new Promise(resolve => {
          answer = resolve
        })
      },
      access: { has: async () => false, request: async () => false, requestCombined: async () => ({ music: false, browserMenu: false }), hasBrowserMenu: async () => false }
    },
    {
      build: build(),
      deadline(_ms, fn) {
        expire = fn
        return () => {}
      }
    }
  )
  try {
    const pending = backend.change({ kind: "auto-add-choice", acct, playlist, lifetime, edit: { kind: "auto-add", expected: false, chosen: true } })
    expire()
    expect(await pending).toEqual({ kind: "refused", reason: "unavailable" })
    answer(undefined)
    await Promise.resolve()
    expect(sends).toBe(1)
  } finally {
    backend.dispose()
  }
})
function controlled() {
  const listeners = new Set<LocalListener>()
  const pending: ((records: Readonly<Record<string, unknown>>) => void)[] = []
  const reads: (readonly string[])[] = []
  let sends = 0,
    adds = 0,
    removes = 0
  const backend = createBackend(
    {
      local: {
        get(keys) {
          reads.push([...keys])
          return new Promise(resolve => {
            pending.push(resolve)
          })
        },
        all() {
          reads.push(["*"])
          return new Promise(resolve => {
            pending.push(resolve)
          })
        },
        onChanged: {
          addListener(fn) {
            adds++
            listeners.add(fn)
          },
          removeListener(fn) {
            removes++
            listeners.delete(fn)
          }
        }
      },
      async send() {
        sends++
        return undefined
      },
      access: { has: async () => true, request: async () => false, requestCombined: async () => ({ music: false, browserMenu: false }), hasBrowserMenu: async () => false }
    },
    options
  )
  return {
    backend,
    reads,
    pending,
    emit() {
      for (const listener of listeners) listener({ "doc:settings": {} }, "local")
    },
    stats: () => ({ sends, adds, removes, listeners: listeners.size })
  }
}
test("snapshots omit device identity, account memory, unknown bodies and retained records", () => {
  const acct = "AAAAAAAAAAAAAAAA"
  if (!isAccountKey(acct)) throw Error("fixture account")
  const records = {
    ...seed,
    lastAccount: acct,
    legacyRetained: "SENTINEL_RETAINED",
    "doc:settings": { v: 1, gen: "g", at: 1, by: "SENTINEL_AUTHOR", data: { quickSave: { on: true }, unknown: "SENTINEL_SETTINGS" } },
    [`doc:setup:${acct}`]: { v: 1, gen: "g", at: 1, by: "SENTINEL_AUTHOR", data: { quickSave: "PL_chosen", unknown: "SENTINEL_SETUP" } }
  }
  const view = readFirstRunSnapshot(records, { acct })
  expect(JSON.stringify(view)).not.toMatch(/SENTINEL|lastAccount|AAAAAAAAAAAAAAAA|gen|unknown|label/)
  expect(view.kind === "snapshot" && view.settings.kind === "current" && view.settings.value.selected).toEqual(["quick-save"])
  const expectedPlaylist = "PL_chosen"
  if (!isPlaylistId(expectedPlaylist)) throw Error("fixture playlist")
  expect(view.kind === "snapshot" && view.setup.kind === "current" && view.setup.value.quickSave).toBe(expectedPlaylist)
})
test("read projections distinguish missing, deleted, current, invalid and newer records", () => {
  const acct = "AAAAAAAAAAAAAAAA"
  if (!isAccountKey(acct)) throw Error("fixture account")
  const key = `doc:setup:${acct}`
  for (const [raw, expected] of [
    [undefined, "missing"],
    [{ v: 1, gen: "g", at: 1, by: "test", deleted: true }, "deleted"],
    [{ v: 1, gen: "g", at: 1, by: "test", data: {} }, "current"],
    [{ v: "bad" }, "invalid"],
    [{ v: 2, gen: "g", at: 1, by: "test", data: { unknown: "SENTINEL_NEWER" } }, "newer-version"]
  ] as const) {
    const view = readFirstRunSnapshot({ schema: 1, "doc:settings": raw, [key]: raw }, { acct })
    expect(view.kind === "snapshot" && view.settings.kind).toBe(expected)
    expect(view.kind === "snapshot" && view.setup.kind).toBe(expected)
    expect(JSON.stringify(view)).not.toContain("SENTINEL_NEWER")
  }
  const missing = readFirstRunSnapshot({ schema: 1 })
  expect(missing.kind === "snapshot" && missing.device).toEqual({ kind: "missing" })
  const invalid = readFirstRunSnapshot({ schema: 1, device: { consent: null, syncOn: false } })
  expect(invalid.kind === "snapshot" && invalid.device.kind).toBe("invalid")
})
test("UI snapshot values detach from storage aliases and cannot mutate another view", () => {
  const settings = { shortcuts: { on: true, list: [{ id: "short1", label: "Original", key: null, watchLaterOnEveryAccount: false }] } }
  const view = readFirstRunSnapshot({ ...seed, "doc:settings": { v: 1, gen: "g", at: 1, by: "test", data: settings } })
  const first = settings.shortcuts.list[0]
  if (!first) throw Error("fixture shortcut")
  first.label = "Changed"
  expect(view.kind === "snapshot" && "value" in view.settings && view.settings.value.shortcuts[0]?.label).toBe("Original")
  expect(Object.isFrozen(view)).toBe(true)
})
test("the scripted Backend uses the RPC JSON contract and exact read-only local keys", async () => {
  const fake = createScriptedBackend({ ...options, records: seed, answers: [{ kind: "ui.syncedChoices", result: { kind: "found", features: ["any-tab-keys"] } }] })
  try {
    expect(fake.reads()).toEqual([])
    await fake.backend.load()
    expect(fake.reads()).toEqual([["schema", "device", "doc:settings"]])
    expect(fake.remaining()).toBe(1)
    expect(await fake.backend.call("ui.syncedChoices", {})).toEqual({ kind: "answered", result: { kind: "found", features: ["any-tab-keys"] } })
    expect(fake.remaining()).toBe(0)
  } finally {
    fake.dispose()
  }
})
test("watch ignores sync, session and unrelated local keys and removes one listener", async () => {
  const fake = createScriptedBackend({ ...options, records: seed, answers: [] })
  const events: UiEvent[] = []
  const stop = fake.backend.watch(event => events.push(event))
  fake.replace({ device: seed.device }, "sync")
  fake.replace({ device: seed.device }, "session")
  fake.replace({ irrelevant: true })
  await Promise.resolve()
  await Promise.resolve()
  expect(fake.reads()).toEqual([])
  expect(events).toEqual([])
  expect(fake.listening()).toBe(1)
  stop()
  stop()
  fake.dispose()
  fake.dispose()
  expect(fake.listening()).toBe(0)
})
test("an older load resolves to the newer observed view instead of reverting it", async () => {
  const c = controlled(),
    events: UiEvent[] = []
  let observed = () => {}
  const changed = new Promise<void>(resolve => {
    observed = resolve
  })
  c.backend.watch(event => {
    events.push(event)
    observed()
  })
  const old = c.backend.load()
  await Promise.resolve()
  c.emit()
  await Promise.resolve()
  expect(c.pending).toHaveLength(2)
  c.pending[1]?.({ ...seed, "doc:settings": { v: 1, gen: "new", at: 1, by: "test", data: { quickSave: { on: true } } } })
  await changed
  c.pending[0]?.(seed)
  const answer = await old
  const event = events[0]
  if (!event) throw Error("missing observed snapshot")
  expect(answer).toEqual(event.snapshot)
  expect(answer.kind === "snapshot" && "value" in answer.settings && answer.settings.value.selected).toEqual(["quick-save"])
  expect(events).toHaveLength(1)
  expect(c.stats().sends).toBe(0)
  c.backend.dispose()
})
test("disposal drops late storage answers and removes the native listener once", async () => {
  const c = controlled(),
    events: UiEvent[] = []
  const stop = c.backend.watch(event => events.push(event))
  const reading = c.backend.load()
  await Promise.resolve()
  c.backend.dispose()
  stop()
  c.backend.dispose()
  stop()
  c.pending[0]?.(seed)
  expect(await reading).toEqual({ kind: "unavailable", reason: "disposed" })
  expect(events).toEqual([])
  expect(c.stats()).toEqual({ sends: 0, adds: 1, removes: 1, listeners: 0 })
  expect(await c.backend.access.request("music")).toBe(false)
})
test("unsubscribing a view drops an invalidation answer already in flight", async () => {
  const c = controlled(),
    events: UiEvent[] = []
  const stop = c.backend.watch(event => events.push(event))
  c.emit()
  await Promise.resolve()
  stop()
  c.pending[0]?.(seed)
  for (let index = 0; index < 10; index++) await Promise.resolve()
  expect(events).toEqual([])
  expect(c.stats().removes).toBe(1)
  c.backend.dispose()
})
