import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { resolveSenderOrigin, type SenderOriginPorts } from "./sender-origin"

type Sender = Parameters<typeof resolveSenderOrigin>[1]["sender"]
type NativeBrowser = typeof import("wxt/browser").browser
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type NativeSenderProof = Check<Equal<Sender, NativeSender>>
const nativePorts = fakeBrowser satisfies SenderOriginPorts
let windowId: number
let popup: Sender
let settings: Sender
let firstRun: Sender
let content: Sender
let music: Sender

beforeEach(async () => {
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Synthetic window missing ID")
  windowId = window.id
  const tab = await fakeBrowser.tabs.create({ windowId, url: fakeBrowser.runtime.getURL("/options.html") })
  settings = { id: fakeBrowser.runtime.id, frameId: 0, url: tab.url, tab }
  popup = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }
  const onboarding = await fakeBrowser.tabs.create({ windowId, url: fakeBrowser.runtime.getURL("/onboarding.html") })
  firstRun = { id: fakeBrowser.runtime.id, frameId: 0, url: onboarding.url, tab: onboarding }
  content = { ...settings, url: "https://www.youtube.com/watch?v=abcdefghijk" }
  music = { ...settings, url: "https://music.youtube.com/watch?v=abcdefghijk" }
})

afterEach(() => mock.restore())

function resolve(sender: Sender, popupWindowId: unknown = windowId) {
  return resolveSenderOrigin(nativePorts, { sender, popupWindowId })
}

test("a page on a hash route is still that page", async () => {
  for (const hash of ["#youtube", "#queue-button&PL_saved"]) {
    expect(await resolve({ ...settings, url: `${settings.url}${hash}` })).toMatchObject({ kind: "ui", page: "settings" })
  }
  expect(await resolve({ ...firstRun, url: `${firstRun.url}#step` })).toMatchObject({ kind: "ui", page: "onboarding" })
  expect(await resolve({ ...settings, url: `${settings.url}?forged=1` })).toEqual({ kind: "unavailable", reason: "identity" })
})

test("exact tabless popup accepts only its supplied native window", async () => {
  for (const frameId of [undefined, 0]) {
    expect(await resolve({ ...popup, frameId })).toEqual({
      kind: "ui",
      page: "popup",
      origin: { kind: "ui", windowId, incognito: false }
    })
  }
  for (const supplied of [undefined, null, "1", -1, 0.5, NaN, Infinity]) {
    expect(await resolveSenderOrigin(nativePorts, { sender: popup, popupWindowId: supplied })).toEqual({
      kind: "unavailable",
      reason: "privacy",
      page: "popup"
    })
  }
})

test("settings, the first-run page and top-frame www and Music content derive their real tab and window", async () => {
  if (!content.tab || content.tab.id === undefined) throw Error("Synthetic tab missing ID")
  if (!firstRun.tab || firstRun.tab.id === undefined) throw Error("Synthetic first-run tab missing ID")
  const get = spyOn(fakeBrowser.windows, "get")
  for (const supplied of [undefined, null, -1, windowId + 100]) {
    expect(await resolveSenderOrigin(nativePorts, { sender: settings, popupWindowId: supplied })).toEqual({
      kind: "ui",
      page: "settings",
      origin: { kind: "ui", windowId, incognito: false }
    })
    expect(await resolveSenderOrigin(nativePorts, { sender: firstRun, popupWindowId: supplied })).toEqual({
      kind: "ui",
      page: "onboarding",
      origin: { kind: "ui", windowId, incognito: false }
    })
    expect(await resolveSenderOrigin(nativePorts, { sender: content, popupWindowId: supplied })).toEqual({
      kind: "tab",
      site: "www",
      origin: { kind: "tab", tabId: content.tab.id, incognito: false },
      windowId
    })
    expect(await resolveSenderOrigin(nativePorts, { sender: music, popupWindowId: supplied })).toEqual({
      kind: "tab",
      site: "music",
      origin: { kind: "tab", tabId: content.tab.id, incognito: false },
      windowId
    })
  }
  expect(get).toHaveBeenCalledTimes(16)
  expect(get.mock.calls.every(([id]) => id === windowId)).toBe(true)
})

test("foreign extensions, other pages, URL tricks, subframes and wrong tab attachment fail before window lookup", async () => {
  const get = spyOn(fakeBrowser.windows, "get")
  const forged: Sender[] = [
    { ...popup, id: "foreign-extension" },
    { ...settings, id: undefined },
    { ...content, id: "foreign-extension" },
    { ...popup, frameId: 1 },
    { ...settings, frameId: 2 },
    { ...content, frameId: 3 },
    { ...settings, frameId: undefined },
    { ...content, frameId: undefined },
    { ...popup, url: fakeBrowser.runtime.getURL("/other.html") },
    { ...popup, url: popup.url + "?windowId=1" },
    { ...popup, url: popup.url + ".forged" },
    { ...settings, url: settings.url + "?forged=1" },
    { ...settings, url: settings.url + "/suffix" },
    { ...firstRun, id: "foreign-extension" },
    { ...firstRun, frameId: 1 },
    { ...firstRun, frameId: undefined },
    { ...firstRun, url: firstRun.url + "?forged=1" },
    { ...firstRun, url: firstRun.url + ".forged" },
    { ...popup, url: firstRun.url },
    { ...music, id: "foreign-extension" },
    { ...music, frameId: 2 },
    { ...music, frameId: undefined },
    { ...content, url: "https://www.youtube.com.evil.invalid/" },
    { ...content, url: "https://www.youtube.com@evil.invalid/" },
    { ...content, url: "https://evil.invalid/?url=https://www.youtube.com/" },
    { ...content, url: "http://www.youtube.com/" },
    { ...content, url: "https://music.youtube.com.evil.invalid/" },
    { ...content, url: "https://music.youtube.com@evil.invalid/" },
    { ...content, url: "http://music.youtube.com/" },
    { ...content, url: "https://music.youtube.com" },
    { ...content, url: "https://youtube.com/" },
    { ...content, url: "https://m.youtube.com/" },
    { ...content, url: undefined },
    { ...popup, tab: settings.tab },
    { ...settings, tab: undefined },
    { ...firstRun, tab: undefined },
    { ...content, tab: undefined },
    { ...music, tab: undefined }
  ]
  if (!settings.tab) throw Error("Synthetic tab missing")
  for (const id of [undefined, -1, 0.5, NaN]) {
    for (const source of [settings, firstRun, content, music]) forged.push({ ...source, tab: { ...settings.tab, id } })
  }
  for (const sender of forged) expect(await resolve(sender)).toEqual({ kind: "unavailable", reason: "identity" })
  expect(get).not.toHaveBeenCalled()
})

test("missing native window or privacy metadata never becomes normal", async () => {
  if (!settings.tab) throw Error("Synthetic tab missing")
  const get = spyOn(fakeBrowser.windows, "get")
  for (const patch of [{ windowId: undefined }, { windowId: -1 }, { windowId: 0.5 }, { incognito: undefined }]) {
    for (const [sender, page] of [
      [settings, "settings"],
      [firstRun, "onboarding"],
      [content, "tab"],
      [music, "tab"]
    ] as const) {
      const tab = { ...settings.tab }
      Object.assign(tab, patch)
      expect(await resolve({ ...sender, tab })).toEqual({ kind: "unavailable", reason: "privacy", page })
    }
  }
  expect(get).not.toHaveBeenCalled()
  const window = await fakeBrowser.windows.get(windowId)
  for (const patch of [{ id: undefined }, { id: windowId + 1 }, { incognito: undefined }]) {
    const missing = { ...window }
    Object.assign(missing, patch)
    get.mockImplementation(async () => missing)
    for (const sender of [popup, settings, firstRun, content, music]) expect(await resolve(sender)).toMatchObject({ kind: "unavailable", reason: "privacy" })
  }
  get.mockImplementation(async () => {
    throw Error("Synthetic closed window")
  })
  for (const sender of [popup, settings, firstRun, content, music]) expect(await resolve(sender)).toMatchObject({ kind: "unavailable", reason: "privacy" })
})

test("actual private windows remain private for every admitted caller", async () => {
  const window = await fakeBrowser.windows.create({ incognito: true })
  if (window?.id === undefined) throw Error("Synthetic private window missing ID")
  const created = await fakeBrowser.tabs.create({ windowId: window.id, url: fakeBrowser.runtime.getURL("/options.html") })
  if (created.id === undefined) throw Error("Synthetic private tab missing ID")
  const tab = { ...created, id: created.id, incognito: true }
  expect(await resolve(popup, window.id)).toEqual({
    kind: "ui",
    page: "popup",
    origin: { kind: "ui", windowId: window.id, incognito: true }
  })
  expect(await resolve({ ...settings, tab })).toEqual({
    kind: "ui",
    page: "settings",
    origin: { kind: "ui", windowId: window.id, incognito: true }
  })
  expect(await resolve({ ...firstRun, tab })).toEqual({
    kind: "ui",
    page: "onboarding",
    origin: { kind: "ui", windowId: window.id, incognito: true }
  })
  expect(await resolve({ ...content, tab })).toEqual({
    kind: "tab",
    site: "www",
    origin: { kind: "tab", tabId: tab.id, incognito: true },
    windowId: window.id
  })
  expect(await resolve({ ...music, tab })).toEqual({
    kind: "tab",
    site: "music",
    origin: { kind: "tab", tabId: tab.id, incognito: true },
    windowId: window.id
  })
})

test("conflicting native tab and window privacy remains unavailable", async () => {
  if (!settings.tab) throw Error("Synthetic tab missing")
  for (const source of [settings, firstRun, content, music]) {
    expect(await resolve({ ...source, tab: { ...settings.tab, incognito: true } })).toMatchObject({ kind: "unavailable", reason: "privacy" })
  }
  const window = await fakeBrowser.windows.get(windowId)
  spyOn(fakeBrowser.windows, "get").mockImplementation(async () => ({ ...window, incognito: true }))
  for (const source of [settings, firstRun, content, music]) expect(await resolve(source)).toMatchObject({ kind: "unavailable", reason: "privacy" })
})

test("payload Origin, account and incognito fields cannot supply caller authority", async () => {
  let reads = 0
  const input = {
    sender: settings,
    popupWindowId: windowId + 100,
    get origin() {
      reads++
      return { kind: "background" }
    },
    get accountKey() {
      reads++
      return "BBBBBBBBBBBBBBBB"
    },
    get incognito() {
      reads++
      return true
    }
  }
  expect(await resolveSenderOrigin(nativePorts, input)).toEqual({
    kind: "ui",
    page: "settings",
    origin: { kind: "ui", windowId, incognito: false }
  })
  expect(reads).toBe(0)
})

test("malformed native URL fields are refused before window lookup", async () => {
  const get = spyOn(fakeBrowser.windows, "get")
  for (const url of [null, 17, {}, []]) {
    const sender = { ...content }
    Object.assign(sender, { url })
    expect(await resolve(sender)).toStrictEqual({ kind: "unavailable", reason: "identity" })
  }
  expect(get).not.toHaveBeenCalled()
})

test("each resolution checks current window facts and snapshots the sender before an asynchronous lookup", async () => {
  if (!content.tab || content.tab.id === undefined) throw Error("Synthetic tab missing")
  const tabId = content.tab.id
  const originalTab = { ...content.tab }
  const sender = { ...content, tab: { ...originalTab } }
  let finish!: (window: { id: number; incognito: boolean }) => void
  let observe: SenderOriginPorts["windows"]["get"] = () =>
    new Promise(resolve => {
      finish = resolve
    })
  const calls: number[] = []
  const ports: SenderOriginPorts = {
    runtime: nativePorts.runtime,
    windows: {
      get(id) {
        calls.push(id)
        return observe(id)
      }
    }
  }
  const pending = resolveSenderOrigin(ports, { sender, popupWindowId: undefined })
  Object.assign(sender.tab, { id: tabId + 1, windowId: windowId + 1, incognito: true })
  finish({ id: windowId, incognito: false })
  expect(await pending).toStrictEqual({ kind: "tab", site: "www", origin: { kind: "tab", tabId, incognito: false }, windowId })
  observe = async id => ({ id, incognito: true })
  expect(await resolveSenderOrigin(ports, { sender: content, popupWindowId: undefined })).toStrictEqual({ kind: "unavailable", reason: "privacy", page: "tab" })
  observe = async id => ({ id, incognito: false })
  expect(await resolveSenderOrigin(ports, { sender: content, popupWindowId: undefined })).toStrictEqual({ kind: "tab", site: "www", origin: { kind: "tab", tabId, incognito: false }, windowId })
  expect(calls).toStrictEqual([windowId, windowId, windowId])
})
