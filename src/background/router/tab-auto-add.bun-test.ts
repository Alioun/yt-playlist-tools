import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createAutoAddTabRouter, CANT_MEASURE_SHOWN } from "./tab-auto-add"
import { runtimeTransport } from "../adapters/runtime"
import type { ProgressLoad, ProgressSave, ProgressSaveRequest, ProgressRequest } from "../store/progress"
import { emptySessionMemory, type SessionChange, type SessionRead } from "../store/session-memory"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { build, manualClock, settle } from "../../../tools/fixtures/tabs/harness"
import { isAccountKey, isVideoId, type AccountKey } from "../../shared/model"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())
function key(value: string): AccountKey { if (!isAccountKey(value)) throw Error("Invalid fixture account"); return value }
const acct = key("AAAAAAAAAAAAAAAA"), other = key("BBBBBBBBBBBBBBBB"), video = "ccccccccccc"
if (!isVideoId(video)) throw Error("Invalid fixture video")

async function world(options: { incognito?: boolean; registered?: AccountKey | null } = {}) {
  const incognito = options.incognito ?? false
  const window = await fakeBrowser.windows.create({ incognito })
  if (window?.id === undefined) throw Error("Missing fixture window")
  const created = await fakeBrowser.tabs.create({ windowId: window.id, url: "https://www.youtube.com/watch?v=ccccccccccc" })
  if (created.id === undefined) throw Error("Missing fixture tab")
  const raw = { ...created, incognito, active: true, windowId: window.id }
  spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => raw)
  const registered = options.registered === undefined ? acct : options.registered
  const loads: ProgressRequest[] = [], saves: ProgressSaveRequest[] = [], changes: SessionChange[] = []
  let session: SessionRead = { kind: "memory", memory: emptySessionMemory, revision: { reset: 0, accounts: new Map() }, sequence: 1 }
  const owner = {
    async loadProgress(request: ProgressRequest): Promise<ProgressLoad> { loads.push(request); return { kind: "progress", progress: { len: 300, parts: [[0, 60]] } } },
    async saveProgress(request: ProgressSaveRequest): Promise<ProgressSave> { saves.push(request); return { kind: "committed" } },
    async readSession() { return session },
    async changeSession(change: SessionChange) {
      changes.push(change)
      if (session.kind === "memory") session = { ...session, memory: { ...session.memory, shown: { ...session.memory.shown, global: new Set([CANT_MEASURE_SHOWN]) } } }
      return { kind: "committed" } as never
    }
  }
  const tabs = { async known() { return registered === null ? [] : [{ acct: registered, privateTab: incognito }] } }
  const clock = manualClock()
  const router = createAutoAddTabRouter({ transport: runtimeTransport(fakeBrowser.runtime), senders: fakeBrowser, build, deadline: clock.after, tabs, owner, now: () => 5 })
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: raw.url, tab: raw }
  let n = 0
  async function send(kind: string, payload: unknown): Promise<unknown> {
    const replies: unknown[] = []
    await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: `m-${++n}`, kind, payload }, sender, value => replies.push(value))
    await settle()
    const reply = replies[0] as { result?: unknown } | undefined
    return reply && "result" in reply ? reply.result : "no answer"
  }
  return { send, loads, saves, changes, dispose: () => router.dispose() }
}

test("a registered tab loads and saves its own account's progress", async () => {
  const h = await world()
  try {
    expect(await h.send("tab.progress.load", { acct, video })).toEqual({ len: 300, parts: [[0, 60]] })
    expect(await h.send("tab.progress.save", { acct, video, len: 300, parts: [[0, 90]] })).toBeNull()
    expect(h.loads).toEqual([{ acct, video, private: false }])
    expect(h.saves).toEqual([{ acct, video, private: false, len: 300, parts: [[0, 90]] }])
  } finally { h.dispose() }
})

test("a page claiming another account than the registry's gets nothing and writes nothing", async () => {
  const h = await world({ registered: other })
  try {
    expect(await h.send("tab.progress.load", { acct, video })).toBeNull()
    expect(await h.send("tab.progress.save", { acct, video, len: 300, parts: [[0, 90]] })).toBeNull()
    expect(h.loads).toEqual([])
    expect(h.saves).toEqual([])
  } finally { h.dispose() }
})

test("a private tab's progress never reaches the store", async () => {
  const h = await world({ incognito: true })
  try {
    expect(await h.send("tab.progress.load", { acct, video })).toBeNull()
    expect(await h.send("tab.progress.save", { acct, video, len: 300, parts: [[0, 90]] })).toBeNull()
    expect(h.loads).toEqual([])
    expect(h.saves).toEqual([])
  } finally { h.dispose() }
})

test("only the first can't-measure playback in a browser session shows its toast", async () => {
  const h = await world()
  try {
    expect(await h.send("tab.cantMeasure", { acct })).toEqual({ show: true })
    expect(await h.send("tab.cantMeasure", { acct })).toEqual({ show: false })
    expect(h.changes.map(change => change.edits)).toEqual([[{ kind: "shown-global", acct, scope: "normal", keys: [CANT_MEASURE_SHOWN] }]])
  } finally { h.dispose() }
})
