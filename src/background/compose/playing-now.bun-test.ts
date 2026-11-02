import { expect, test } from "bun:test"
import type { NativeBrowser } from "../adapters/browser"
import type { Tabs } from "../tabs/ports"
import type { Actions } from "./actions"
import { composePlayingNow } from "./playing-now"
import { defaultSettings } from "../../shared/model/defaults"
import type { NowPlaying } from "../../shared/contracts"
import type { Settings } from "../../shared/model"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"

const song: NowPlaying = { videoId: "getLucky001" as never, title: "Get Lucky", artist: "Daft Punk", artwork: "https://lh3.googleusercontent.com/art", pos: 30, len: 248 }
const req = { windowId: 1, incognito: false, activeTabId: 2 }
const musicTab = (id: number, change: object = {}) => ({ id, windowId: 1, incognito: false, active: false, audible: false, discarded: false, lastAccessed: id, ...change })

function world(options: { settings?: (settings: Settings) => void; granted?: boolean; consented?: boolean; tabs?: object[];
  answer?: (tabId: number) => unknown; acct?: string | null; failing?: number[] } = {}) {
  const settings = defaultSettings()
  options.settings?.(settings)
  const ensured: { tabId: number; what: unknown }[] = [], ran: number[] = []
  const native = {
    tabs: { async query() { return options.tabs ?? [musicTab(5, { lastAccessed: 50 }), musicTab(6, { audible: true })] } },
    permissions: { async contains() { return options.granted ?? true } }
  } as unknown as NativeBrowser
  const tabs = {
    async known({ tabId }: { tabId: number }) { return [{ tabId, acct: options.acct === undefined ? "AAAAAAAAAAAAAAAA" : options.acct, privateTab: false }] },
    async runIn(tabId: number) { ran.push(tabId); return { kind: "result", tabId, result: options.answer ? options.answer(tabId) : { ok: true, route: "r", data: song } } }
  } as unknown as Tabs
  const read = composePlayingNow({ native, tabs, actions: { async settings() { return settings } } as unknown as Actions, consented: () => options.consented ?? true,
    registrar: { async ensure(tabId, what) { if (options.failing?.includes(tabId)) throw new Error("refused"); ensured.push({ tabId, what }) } } })
  return { read: () => read(req), ensured, ran }
}

test("Playing now reads the tab playing audio when no YouTube Music tab is active, through the site core alone", async () => {
  const w = world()
  expect(await w.read()).toEqual({ kind: "song", tabId: 6, song })
  expect(w.ensured).toEqual([{ tabId: 6, what: { core: true } }])
  const active = world({ tabs: [musicTab(5, { active: true }), musicTab(6, { audible: true })] })
  expect(await active.read()).toMatchObject({ kind: "song", tabId: 5 })
})

test("nothing playing, an ad, and a signed-out tab each name the tab and carry no song", async () => {
  expect(await world({ answer: () => ({ ok: true, route: "r", data: null }) }).read()).toEqual({ kind: "nothing-playing", tabId: 6 })
  expect(await world({ answer: () => ({ ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "adShowing" } }) }).read()).toEqual({ kind: "ad-playing", tabId: 6 })
  const signedOut = world({ acct: null })
  expect(await signedOut.read()).toEqual({ kind: "signed-out", tabId: 6 })
  expect(signedOut.ran).toEqual([])
})

test("a tab that can't be injected or read is skipped for the next one in order", async () => {
  const w = world({ failing: [6], answer: tabId => tabId === 5 ? { ok: true, route: "r", data: song } : { ok: false, reason: "failed" } })
  expect(await w.read()).toEqual({ kind: "song", tabId: 5, song })
})

test("before consent, with the section off, without access or with no YouTube Music tab, nothing is read or injected", async () => {
  const cases = [
    [world({ consented: false }), { kind: "unavailable" }],
    [world({ settings: settings => { settings.musicSection = false } }), { kind: "off" }],
    [world({ granted: false }), { kind: "no-access" }],
    [world({ tabs: [] }), { kind: "no-tab" }]
  ] as const
  for (const [w, answer] of cases) {
    expect(await w.read()).toEqual(answer)
    expect([w.ensured, w.ran]).toEqual([[], []])
  }
})

test("Save before consent reaches no tab", async () => {
  const tried: unknown[] = []
  const save = createPlayingSave({ consented: () => false, i18n: englishI18n(),
    actions: { async addFromPopup(...call) { tried.push(call); return { kind: "no-tab" } } } })
  const request = { site: "music", video: song.videoId, via: "quick-save", opener: "playing-now" } as const
  expect(await save(req, { tabId: 6, acct: "AAAAAAAAAAAAAAAA" as never, request })).toEqual({ kind: "unavailable" })
  expect(tried).toEqual([])
})
