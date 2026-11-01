import { describe, expect, test } from "bun:test"
import type { ToastContent } from "../../../src/site/kit/toaster/types"
import { fixture, playlist, titles, shortcut, undoKey, press, deferred, settle } from "./harness"

const text = (name: string, tone: ToastContent["tone"] = "confirmation", auto = false): ToastContent => ({ text: name, tone, auto, action: null })
const sticky = (name: string, run = () => {}) => ({ ...text(name, "failure", true), tone: "failure" as const, auto: true as const, dismiss: { label: "Dismiss notice", run }, presented() {} })

describe("six seconds of eligible display time", () => {
  for (const hover of [false, true]) for (const focus of [false, true]) for (const hidden of [false, true]) {
    test(`pause matrix hover=${hover} focus=${focus} hidden=${hidden}`, () => {
      const f = fixture()
      try {
        f.toaster.show(text("first")); f.timers.advance(1000)
        f.toaster.pause("hover", hover); f.toaster.pause("focus", focus)
        if (hidden) f.hidden(true)
        f.timers.advance(6000)
        if (hidden) f.hidden(false)
        if (hover || focus || hidden) {
          expect(f.toaster.read()?.content.text).toBe("first")
          f.toaster.pause("hover", false); f.toaster.pause("focus", false)
          f.timers.advance(4999); expect(f.toaster.read()?.content.text).toBe("first")
          f.timers.advance(1); expect(f.toaster.read()).toBeNull()
        } else expect(f.toaster.read()).toBeNull()
      } finally { f.dispose() }
    })
  }
  test("leaving hover retains focus and the remaining time", () => {
    const f = fixture()
    try {
      f.toaster.show(text("held")); f.timers.advance(2000)
      f.toaster.pause("focus", true); f.toaster.pause("hover", true); f.toaster.pause("hover", false)
      f.timers.advance(9000); expect(f.toaster.read()?.remaining).toBe(4000)
      f.toaster.pause("focus", false); f.timers.advance(3999)
      expect(f.toaster.read()?.content.text).toBe("held")
      f.timers.advance(1); expect(f.toaster.read()).toBeNull()
    } finally { f.dispose() }
  })
})

test("one hidden slot keeps newest failure ahead of later confirmations", () => {
  const f = fixture()
  try {
    f.hidden(true)
    f.toaster.show(text("confirmation")); f.toaster.show(text("old failure", "failure"))
    f.toaster.show(text("new failure", "failure")); f.toaster.show(text("later confirmation"))
    expect(f.toaster.read()).toBeNull(); expect(f.timers.count).toBe(0)
    f.hidden(false); expect(f.toaster.read()?.content.text).toBe("new failure")
    f.timers.advance(6000); expect(f.toaster.read()).toBeNull()
  } finally { f.dispose() }
})

test("automatic failures and notices wait in fullscreen; explicit outcomes show", () => {
  const f = fixture()
  try {
    f.fullscreen(document.documentElement)
    f.toaster.notice(sticky("notice")); f.toaster.show(text("auto failed", "failure", true))
    expect(f.toaster.read()).toBeNull()
    f.toaster.show(text("explicit")); expect(f.toaster.read()?.content.text).toBe("explicit")
    f.timers.advance(6000); expect(f.toaster.read()).toBeNull()
    f.fullscreen(null); expect(f.toaster.read()?.content.text).toBe("auto failed")
    f.timers.advance(6000); expect(f.toaster.read()?.content.text).toBe("notice")
  } finally { f.dispose() }
})

test("sticky notice revives and stale dismiss cannot dismiss its successor", () => {
  const f = fixture(); let dismissed = 0
  try {
    f.toaster.notice(sticky("one", () => { dismissed++ })); const old = f.toaster.read()
    f.toaster.show(text("new")); f.timers.advance(6000)
    expect(f.toaster.read()?.content.text).toBe("one")
    f.toaster.notice(sticky("two", () => { dismissed++ }))
    old?.dismiss?.run(); expect(dismissed).toBe(0)
    f.toaster.read()?.dismiss?.run(); expect(dismissed).toBe(1); expect(f.toaster.read()).toBeNull()
  } finally { f.dispose() }
})

test("missing, rejected and stale actions never fabricate success", async () => {
  const f = fixture()
  try {
    f.toaster.show(text("without action")); await f.toaster.read()?.act(); expect(f.toaster.read()?.content.action).toBeNull()
    const wait = deferred<ToastContent | null>(); let calls = 0
    const old = f.toaster.show({ ...text("saved"), action: { kind: "undo", label: "Undo", run: () => { calls++; return wait.promise } } })
    const snapshot = f.toaster.read(); const action = snapshot?.act()
    await snapshot?.act(); expect(calls).toBe(1)
    f.toaster.show(text("newer")); expect(old.replace(text("stale handle"))).toBe(false)
    wait.resolve(text("stale completion")); await action
    expect(f.toaster.read()?.content.text).toBe("newer")
    await snapshot?.act(); expect(calls).toBe(1)
    f.toaster.show({ ...text("save"), action: { kind: "undo", label: "Undo", run: async () => { throw Error("synthetic rejection") } } })
    await f.toaster.read()?.act(); expect(f.toaster.read()?.content.text).toBe("Couldn't undo.")
    expect(f.errors.length).toBe(1)
  } finally { f.dispose() }
})

test("real core Undo key and button share one in-flight action", async () => {
  const f = fixture(); const answer = deferred<ToastContent | null>(); let calls = 0
  try {
    f.toaster.show({ ...text("saved"), action: { kind: "undo", label: "Undo", run: () => { calls++; return answer.promise } } })
    f.present()
    const button = f.toaster.read(); expect(press().defaultPrevented).toBe(true)
    await button?.act(); expect(calls).toBe(1)
    answer.resolve(null); await settle()
    expect(press().defaultPrevented).toBe(false)
    f.update({ undoKey, features: [shortcut] }); expect(press().defaultPrevented).toBe(true)
    expect(f.toaster.read()?.content.text).toBe("Nothing to undo.")
    await settle(); f.update({ undoKey: null, features: [shortcut] }); expect(press().defaultPrevented).toBe(false)
    f.update({ undoKey: { ...undoKey, code: "KeyP" }, features: [shortcut] })
    expect(press().defaultPrevented).toBe(false)
    expect(press({ code: "KeyP", key: "p" }).defaultPrevented).toBe(true)
  } finally { f.dispose() }
})

test("hidden deferred Undo is inactive and replacement never revives its callback", async () => {
  const f = fixture(); let calls = 0
  try {
    f.toaster.show({ ...text("save"), action: { kind: "undo", label: "Undo", run: () => { calls++; return null } } })
    f.present()
    const stale = f.toaster.read(); f.hidden(true)
    expect(f.toaster.hasUndo()).toBe(false); expect(press().defaultPrevented).toBe(false)
    await stale?.act(); expect(calls).toBe(0)
    f.toaster.show(text("replacement")); f.hidden(false)
    await stale?.act(); expect(calls).toBe(0); expect(f.toaster.hasUndo()).toBe(false)
  } finally { f.dispose() }
})

test("unused captured action cannot invoke an older handle after replacement", async () => {
  const f = fixture(); let calls = 0
  try {
    f.toaster.show({ ...text("old"), action: { kind: "undo", label: "Undo", run: () => { calls++; return null } } })
    const old = f.toaster.read()
    f.toaster.show(text("new")); await old?.act()
    expect(calls).toBe(0); expect(f.toaster.read()?.content.text).toBe("new")
  } finally { f.dispose() }
})

test("same-reference replacement invalidates an older in-flight completion", async () => {
  const f = fixture(); const result = deferred<ToastContent | null>(); let calls = 0
  try {
    const content: ToastContent = { ...text("saved"), action: { kind: "undo", label: "Undo", run: () => { calls++; return result.promise } } }
    const handle = f.toaster.show(content); const before = f.toaster.read(); const pending = before?.act()
    expect(handle.replace(content)).toBe(true)
    await f.toaster.read()?.act(); expect(calls).toBe(1)
    expect(f.toaster.read()?.content.action).toBeNull()
    result.resolve(text("stale result")); await pending
    expect(f.toaster.read()?.content.text).toBe("saved")
    expect(f.toaster.read()?.generation).not.toBe(before?.generation)
  } finally { f.dispose() }
})

test("fullscreen exit promotes the eligible deferred failure immediately", () => {
  const f = fixture()
  try {
    f.fullscreen(document.documentElement)
    f.toaster.show(text("deferred failure", "failure", true))
    f.toaster.show(text("explicit")); f.timers.advance(1000)
    f.fullscreen(null)
    expect(f.toaster.read()?.content.text).toBe("deferred failure")
  } finally { f.dispose() }
})

test("pending belongs to one operation and turns into its outcome in place", () => {
  const f = fixture()
  try {
    const op = f.begin({ playlists: [playlist()], titles: titles(), feedback: true, keyWithoutButton: true })
    f.timers.advance(999); expect(f.toaster.read()).toBeNull()
    f.timers.advance(1); const pending = f.toaster.read()
    expect(pending?.content.text).toBe("Saving “Song” to Music…")
    op.finish({ report: { kind: "shortcut", outcomes: { [playlist()]: { kind: "added" } } }, titles: titles(), action: null })
    expect(f.toaster.read()?.id).toBe(pending?.id); expect(f.toaster.read()?.kind).toBe("transient")
    expect(f.toaster.read()?.content.text).toBe("Saved “Song” to Music")
    const late = f.begin({ playlists: [playlist()], titles: titles(), feedback: true, keyWithoutButton: true })
    f.toaster.show(text("newer")); late.finish({ report: { kind: "undo-failed" }, titles: {}, action: null })
    f.timers.advance(1000); expect(f.toaster.read()?.content.text).toBe("newer")
  } finally { f.dispose() }
})

test("feedback off suppresses pending and confirmation but keeps failure", () => {
  const f = fixture()
  try {
    const op = f.begin({ playlists: [playlist()], titles: titles(), feedback: false, keyWithoutButton: true })
    f.timers.advance(2000); expect(f.toaster.read()).toBeNull(); expect(f.timers.count).toBe(0)
    op.finish({ report: { kind: "shortcut", outcomes: { [playlist()]: { kind: "added" } } }, titles: titles(), action: null })
    expect(f.toaster.read()).toBeNull()
    const failed = f.begin({ playlists: [playlist()], titles: titles(), feedback: false, keyWithoutButton: true })
    failed.finish({ report: { kind: "undo-failed" }, titles: {}, action: null })
    expect(f.toaster.read()?.content.tone).toBe("failure")
  } finally { f.dispose() }
})

test("hidden pending keeps zero timers and restores once; disposal rejects every late callback", async () => {
  const f = fixture()
  try {
    f.hidden(true)
    const op = f.begin({ playlists: [playlist()], titles: titles(), feedback: true, keyWithoutButton: true })
    expect(f.timers.count).toBe(0); f.timers.advance(2000); expect(f.toaster.read()).toBeNull()
    f.hidden(false); f.timers.advance(0); expect(f.toaster.read()?.kind).toBe("pending")
    const view = f.toaster.read(); f.scope.dispose()
    op.finish({ report: { kind: "undo-failed" }, titles: {}, action: null }); await view?.act()
    f.timers.advance(10000); expect(f.toaster.read()).toBeNull(); expect(f.timers.count).toBe(0); expect(f.scope.resourceCount).toBe(0)
  } finally { f.dispose() }
})
