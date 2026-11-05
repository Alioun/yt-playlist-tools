import { expect, test } from "bun:test"
import { createFirstRunHarness } from "../../../tools/fixtures/first-run-backend/harness"
import { matchesRenderedDisclosure, FIRST_RUN_DISCLOSURE_VERSION } from "./rendered-disclosure"
import catalogue from "../../public/_locales/en/messages.json"
import { englishFirstRunText, scriptedMessages } from "../../../tools/fixtures/localization/scripted"
import { createBrowserBackend, createBrowserI18n } from "./browser"

test("Chrome starts one combined native request before awaiting permission observations", async () => {
  const h = await createFirstRunHarness()
  try {
    const view = h.openView()
    h.grants.music = false
    h.grants.browserMenu = false
    const grant = view.firstRun.requestPermissions({ music: true, browserMenu: true })
    expect(h.order).toEqual(["request"])
    expect(h.requests).toEqual([{ origins: ["https://music.youtube.com/*"], permissions: ["contextMenus"] }])
    expect(await grant).toEqual({ music: false, browserMenu: false })
  } finally {
    await h.dispose()
  }
})
test("Firefox asks for YouTube Music and never for its required contextMenus", async () => {
  const h = await createFirstRunHarness({ browser: "firefox" })
  try {
    const view = h.openView()
    h.grants.music = false
    const grant = view.firstRun.requestPermissions({ music: true, browserMenu: true })
    expect(h.order).toEqual(["request"])
    expect(h.requests).toEqual([{ origins: ["https://music.youtube.com/*"] }])
    expect(await grant).toEqual({ music: false, browserMenu: true })
    h.requests.length = 0
    expect(await view.firstRun.requestPermissions({ music: false, browserMenu: true })).toEqual({ music: false, browserMenu: true })
    expect(h.requests).toEqual([])
  } finally {
    await h.dispose()
  }
})
test("the frozen manifest's absent optional declarations cannot produce a request", async () => {
  const h = await createFirstRunHarness({ missingDeclarations: true })
  try {
    h.grants.music = false
    h.grants.browserMenu = false
    expect(await h.openView().firstRun.requestPermissions({ music: true, browserMenu: true })).toEqual({ music: false, browserMenu: false })
    expect(h.requests).toEqual([])
  } finally {
    await h.dispose()
  }
})
test("native permission request failures use local fixed observations", async () => {
  const h = await createFirstRunHarness()
  try {
    h.grants.music = false
    h.grants.browserMenu = false
    h.permissionFailure(true)
    expect(await h.openView().firstRun.requestPermissions({ music: true, browserMenu: true })).toEqual({ music: false, browserMenu: false })
    expect(h.answerBytes).toEqual([])
  } finally {
    await h.dispose()
  }
})
test("the disclosure version is pinned to the actual rendered text for both builds", () => {
  expect(FIRST_RUN_DISCLOSURE_VERSION).toBe(1)
  const disclosure = englishFirstRunText().disclosure
  for (const browser of ["chrome", "firefox"] as const) {
    expect(matchesRenderedDisclosure(browser, disclosure)).toBe(true)
    expect(matchesRenderedDisclosure(browser, { ...disclosure, intro: "Different disclosure" })).toBe(false)
    expect(matchesRenderedDisclosure(browser, { ...disclosure, headings: { ...disclosure.headings, "first-run": "Different heading" } })).toBe(false)
  }
})
test("the native localization binding preserves substitutions without Backend authority", () => {
  const calls: unknown[] = []
  const native = scriptedMessages()
  const i18n = createBrowserI18n(
    {
      i18n: {
        getUILanguage: () => "en",
        getMessage(name: string, substitutions?: string | string[]) {
          calls.push([name, substitutions])
          return native.getMessage(name, substitutions)
        }
      }
    },
    catalogue
  )
  expect(calls).toEqual([])
  expect(i18n.message("copy_list_two", { second: "B", first: "A" })).toBe("A and B")
  expect(calls).toEqual([["copy_list_two", ["A", "B"]]])
})
test("changed canonical text refuses agreement without upgrading displayed version", async () => {
  const before = catalogue.disclosure_intro.message
  const h = await createFirstRunHarness()
  const writes = h.store.batches.length
  try {
    const older = h.openView()
    catalogue.disclosure_intro.message = before + " Changed canonical disclosure."
    const current = h.openView()
    expect(FIRST_RUN_DISCLOSURE_VERSION).toBe(1)
    for (const view of [older, current]) {
      expect(matchesRenderedDisclosure("chrome", view.text.disclosure)).toBe(false)
      expect(await view.firstRun.agree({ displayed: view.text.disclosure, attempt: 1, selected: [], syncOn: false, permissions: Promise.resolve({ music: false, browserMenu: false }) })).toEqual({
        kind: "not-agreed",
        attempt: 1,
        reason: "unavailable"
      })
    }
    expect(h.requestBytes).toEqual([])
    expect(h.store.batches).toHaveLength(writes)
  } finally {
    catalogue.disclosure_intro.message = before
    await h.dispose()
  }
})
test("arbitrary native translations cannot prove reviewed agreement", async () => {
  const h = await createFirstRunHarness({ messageOverrides: { disclosure_intro: "Unreviewed native output" } })
  const writes = h.store.batches.length
  try {
    const view = h.openView()
    expect(matchesRenderedDisclosure("chrome", view.text.disclosure)).toBe(false)
    expect((await view.firstRun.agree({ displayed: view.text.disclosure, attempt: 1, selected: [], syncOn: false, permissions: Promise.resolve({ music: false, browserMenu: false }) })).kind).toBe(
      "not-agreed"
    )
    expect(h.requestBytes).toEqual([])
    expect(h.store.batches).toHaveLength(writes)
  } finally {
    await h.dispose()
  }
})
test("agreement cannot use a different view's displayed snapshot", async () => {
  const h = await createFirstRunHarness()
  try {
    const first = h.openView(),
      second = h.openView()
    const writes = h.store.batches.length
    expect(await first.firstRun.agree({ displayed: second.text.disclosure, attempt: 1, selected: [], syncOn: false, permissions: Promise.resolve({ music: false, browserMenu: false }) })).toEqual({
      kind: "not-agreed",
      attempt: 1,
      reason: "unavailable"
    })
    expect(h.requestBytes).toEqual([])
    expect(h.store.batches).toHaveLength(writes)
  } finally {
    await h.dispose()
  }
})
test("an unavailable chooser is explicit and cannot report a saved destination", async () => {
  const h = await createFirstRunHarness()
  try {
    const view = h.openView()
    await view.firstRun.agree({ displayed: view.text.disclosure, attempt: 1, selected: ["quick-save"], syncOn: false, permissions: Promise.resolve({ music: true, browserMenu: true }) })
    const before = h.store.batches.length
    h.choose({ kind: "unavailable" })
    expect(await view.firstRun.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })).toEqual({ kind: "failed", reason: "picker-unavailable" })
    expect(h.store.batches.length).toBe(before)
  } finally {
    await h.dispose()
  }
})
test("Setup reads use the serving account and never the stored last account", async () => {
  const h = await createFirstRunHarness()
  try {
    const view = h.openView()
    await view.firstRun.agree({ displayed: view.text.disclosure, attempt: 1, selected: ["quick-save"], syncOn: false, permissions: Promise.resolve({ music: true, browserMenu: true }) })
    h.store.foreign(records => {
      records.lastAccount = "BBBBBBBBBBBBBBBB"
    })
    const read = await view.firstRun.readSetup()
    expect(read.kind === "ready" && read.youtube).toEqual({ kind: "account", account: { name: "Fixture account" } })
    expect(h.uiReads.at(-1)).toEqual(["schema", "device", "doc:settings", "doc:setup:AAAAAAAAAAAAAAAA"])
    expect(h.requestBytes).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})
test("a fresh first-run context starts no account service or chooser work", async () => {
  const h = await createFirstRunHarness()
  try {
    const view = h.openView()
    expect(await view.firstRun.readSetup()).toEqual({ kind: "unavailable" })
    expect(await view.firstRun.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })).toEqual({ kind: "failed", reason: "unavailable" })
    expect(h.stats().accountReads).toBe(0)
    expect(h.stats().chooserCalls).toBe(0)
  } finally {
    await h.dispose()
  }
})

test("a page hears Gather's pushes from the background only, and answers shown only when it showed one", async () => {
  type Listener = (message: unknown, sender: { id?: string; tab?: unknown }, respond: (answer?: unknown) => void) => boolean
  const listeners = new Set<Listener>()
  const backend = createBrowserBackend(
    {
      storage: { local: { get: async () => ({}) }, onChanged: { addListener() {}, removeListener() {} } },
      runtime: {
        id: "perchling",
        sendMessage: async () => undefined,
        getManifest: () => ({ version: "2.0.0" }) as never,
        onMessage: {
          addListener: (fn: Listener) => {
            listeners.add(fn)
          },
          removeListener: (fn: Listener) => {
            listeners.delete(fn)
          }
        } as never
      },
      permissions: { contains: async () => true, request: async () => true }
    } as never,
    { build: "page-test" as never, deadline: () => () => {} }
  )
  const heard: string[] = []
  const stop = backend.watchGather(push => {
    heard.push(push.line?.text ?? "")
    return !push.running
  })
  const deliver = (payload: unknown, sender: { id?: string; tab?: unknown }) => {
    const answers: unknown[] = []
    for (const listener of listeners)
      listener({ v: 1, build: "page-test", kind: "ui.gatherProgress", payload }, sender, answer => {
        answers.push(answer)
      })
    return answers
  }
  const line = (text: string) => ({ text, tone: "muted", action: null })
  expect(deliver({ windowId: 1, running: true, line: line("Checking 1 of 3…") }, { id: "perchling" })).toEqual([])
  expect(deliver({ windowId: 1, running: false, line: line("Saved 3 videos to Later.") }, { id: "perchling" })).toEqual([{ shown: true }])
  expect(deliver({ windowId: 1, running: false, line: line("From a page") }, { id: "perchling", tab: { id: 4 } })).toEqual([])
  expect(deliver({ windowId: 1, running: false, line: line("From elsewhere") }, { id: "another-extension" })).toEqual([])
  expect(heard).toEqual(["Checking 1 of 3…", "Saved 3 videos to Later."])
  stop()
  expect(listeners.size).toBe(0)
  backend.dispose()
})
