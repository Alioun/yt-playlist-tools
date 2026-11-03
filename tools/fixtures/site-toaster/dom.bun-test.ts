import { expect, spyOn, test } from "bun:test"
import { flushSync } from "svelte"
import { renderToaster } from "../../../src/site/kit/toaster/render"
import { createLayerHost } from "../../../src/site/kit/layer-host"
import { createNoticeOwner, type NoticePresentation } from "../../../src/site/core/notice"
import { plainNoticePresenter } from "../../../src/site/core/notice/plain"
import { toasterNoticePresenter } from "../../../src/site/kit/feedback/notice"
import { createFeedbackSession } from "../../../src/site/kit/feedback/session"
import { Scope } from "../../../src/site/core/scope"
import { englishI18n } from "../localization/scripted"
import { fixture, titles, playlist, press, raw, deferred, settle, labels, undoKey } from "./harness"
import type { ToastContent } from "../../../src/site/kit/toaster/types"

async function draw() {
  await settle()
  flushSync()
  await settle()
  flushSync()
}
function render(f: ReturnType<typeof fixture>, site: "www" | "music" = "www") {
  return renderToaster({
    owner: f.scope,
    document,
    site,
    source: f.toaster,
    onError: error => {
      f.errors.push(error)
    },
    onCosmetic: variable => {
      f.cosmetics.push(variable)
    }
  })
}

test("two actual Scope consumers share one session and the last release removes every presentation resource", async () => {
  const f = fixture()
  const one = new Scope({
    document,
    onError: error => {
      f.errors.push(error)
    }
  })
  const two = new Scope({
    document,
    onError: error => {
      f.errors.push(error)
    }
  })
  try {
    const session = createFeedbackSession({
      owner: f.scope,
      document,
      keys: f.keys,
      site: "www",
      i18n: englishI18n(),
      labels,
      initial: { undoKey, features: [] },
      now: f.timers.now,
      onError: error => {
        f.errors.push(error)
      },
      onCosmetic: variable => {
        f.cosmetics.push(variable)
      }
    })
    const first = session.use(one)
    const second = session.use(two)
    expect(first).toBe(second)
    expect(session.use(one)).toBe(first)
    first?.toaster.show({ text: "Shared", tone: "confirmation", auto: false, action: null })
    await draw()
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(1)
    const run = session.read()
    one.dispose()
    expect(session.read()).toBe(run)
    two.dispose()
    await draw()
    expect(session.read()).toBeNull()
    expect(run?.scope.resourceCount).toBe(0)
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
    expect(f.timers.count).toBe(0)
  } finally {
    one.dispose()
    two.dispose()
    f.dispose()
  }
})

test("actual Svelte uses safe text, roles, glyph rules and native action buttons", async () => {
  const f = fixture()
  const r = render(f)
  try {
    f.toaster.show({ text: "<img src=x onerror=bad()>", tone: "failure", auto: false, action: null })
    await draw()
    const host = r.readHost()
    const shadow = host?.shadowRoot
    expect(host?.style.cssText.startsWith("all: initial;")).toBe(true)
    expect(shadow?.mode).toBe("open")
    expect(shadow?.querySelector("img")).toBeNull()
    expect(shadow?.querySelector("[data-toast-text]")?.textContent).toBe("<img src=x onerror=bad()>")
    expect(shadow?.querySelector(".toast")?.getAttribute("role")).toBe("alert")
    expect(shadow?.querySelector("[data-glyph=error]")).not.toBeNull()
    f.report({ report: { kind: "auto-add", outcomes: { [playlist()]: { kind: "added" } }, shown: { tab: new Set(), session: new Set() } }, feedback: true, titles: titles(), action: null })
    await draw()
    expect(r.readHost()).toBe(host)
    expect(shadow?.querySelector("[data-glyph=mark]")).not.toBeNull()
    f.report({ report: { kind: "shortcut", outcomes: { [playlist()]: { kind: "already-in" } } }, feedback: true, titles: titles(), action: null })
    await draw()
    expect(shadow?.querySelector("[data-glyph=mark]")).toBeNull()
    expect(shadow?.querySelector("[data-glyph=error]")).toBeNull()
    expect(shadow?.querySelector(".toast")?.getAttribute("role")).toBe("status")
    expect(shadow?.querySelectorAll("button").length).toBe(0)
  } finally {
    f.dispose()
  }
})

test("actual DOM key/button race, focus pause and propagation keep one Undo", async () => {
  const f = fixture()
  const r = render(f)
  let calls = 0
  const answer = deferred<ToastContent | null>()
  try {
    f.report({
      report: { kind: "shortcut", outcomes: { [playlist()]: { kind: "added" } } },
      feedback: true,
      titles: titles(),
      action: f.action("undo", () => {
        calls++
        return answer.promise
      })
    })
    expect(press().defaultPrevented).toBe(false)
    await draw()
    const host = r.readHost()
    const button = host?.shadowRoot?.querySelector("button")
    if (!(button instanceof HTMLButtonElement)) throw Error("Expected a native Undo button")
    button.focus()
    await draw()
    f.timers.advance(8000)
    expect(f.toaster.read()).not.toBeNull()
    let escaped = 0
    const release = f.scope.on(document, "click", () => {
      escaped++
    })
    button.click()
    expect(press().defaultPrevented).toBe(false)
    expect(calls).toBe(1)
    expect(escaped).toBe(0)
    answer.resolve(null)
    await draw()
    expect(f.toaster.hasUndo()).toBe(false)
    release()
    r.dispose()
    await draw()
    f.timers.advance(0)
    expect(f.toaster.hasUndo()).toBe(false)
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
    f.scope.dispose()
    expect(f.scope.resourceCount).toBe(0)
    expect(f.timers.count).toBe(0)
  } finally {
    f.dispose()
  }
})

test("all required click pointer mouse contextmenu and key events stop at the host", async () => {
  const f = fixture()
  try {
    const layer = await createLayerHost({
      owner: f.scope,
      document,
      site: "www",
      onError: error => {
        f.errors.push(error)
      },
      onCosmetic: variable => {
        f.cosmetics.push(variable)
      }
    })
    if (!layer) throw Error("Expected a layer")
    const target = document.createElement("button")
    layer.root.append(target)
    for (const name of ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu", "keydown", "keyup"]) {
      let seen = 0
      const release = f.scope.on<EventTarget, string>(document, name, () => {
        seen++
      })
      target.dispatchEvent(new Event(name, { bubbles: true, composed: true, cancelable: true }))
      expect(seen).toBe(0)
      release()
    }
    f.scope.dispose()
    expect(layer.host.isConnected).toBe(false)
    expect(layer.scope.resourceCount).toBe(0)
  } finally {
    f.dispose()
  }
})

test("fullscreen placement preserves host identity and restores body", async () => {
  const f = fixture()
  const r = render(f)
  const video = document.createElement("div")
  document.body.append(video)
  try {
    f.toaster.show({ text: "explicit", tone: "confirmation", auto: false, action: null })
    await draw()
    const host = r.readHost()
    expect(host?.parentElement).toBe(document.body)
    f.fullscreen(video)
    await draw()
    expect(r.readHost()).toBe(host)
    expect(host?.parentElement).toBe(video)
    expect(host?.style.getPropertyValue("--toast-bottom")).toBe("88px")
    f.fullscreen(null)
    await draw()
    expect(host?.parentElement).toBe(document.body)
    f.fullscreen(document.documentElement)
    await draw()
    expect(host?.parentElement).toBe(document.body)
  } finally {
    f.dispose()
    video.remove()
  }
})

test("Music reads bounded surfaces at show 0.4s 1.2s, none while hidden, then restores once", async () => {
  const f = fixture("music")
  const r = render(f, "music")
  let reads = 0
  const watched = new Set<MutationObserver>()
  const nativeObserve = window.MutationObserver.prototype.observe
  const nativeDisconnect = window.MutationObserver.prototype.disconnect
  const observing = spyOn(window.MutationObserver.prototype, "observe").mockImplementation(function (this: MutationObserver, target, options) {
    nativeObserve.call(this, target, options)
    watched.add(this)
  })
  const disconnecting = spyOn(window.MutationObserver.prototype, "disconnect").mockImplementation(function (this: MutationObserver) {
    nativeDisconnect.call(this)
    watched.delete(this)
  })
  const surfaces = ["ytmusic-player-bar", "ytmusic-miniplayer", "ytmusic-mealbar-promo-renderer", "tp-yt-paper-toast"].map((name, index) => {
    const el = document.createElement(name)
    raw(el, "getBoundingClientRect", () => {
      reads++
      return new DOMRect(0, window.innerHeight - 80 - index * 40, 320, 40)
    })
    document.body.append(el)
    return el
  })
  try {
    f.toaster.show({ text: "Music saved", tone: "confirmation", auto: false, action: null })
    await draw()
    const host = r.readHost()
    expect(reads).toBe(4)
    expect(host?.shadowRoot?.querySelector("[data-glyph=mark]")).toBeNull()
    f.timers.advance(400)
    expect(reads).toBe(8)
    f.timers.advance(800)
    expect(reads).toBe(12)
    expect(host?.style.getPropertyValue("--toast-bottom")).toBe("212px")
    f.hidden(true)
    const html = host?.shadowRoot?.innerHTML
    expect(watched.size).toBe(0)
    expect(f.timers.count).toBe(0)
    f.toaster.show({ text: "deferred", tone: "failure", auto: false, action: null })
    f.timers.advance(10000)
    window.dispatchEvent(new Event("resize"))
    document.documentElement.toggleAttribute("dark")
    await draw()
    expect(reads).toBe(12)
    expect(host?.shadowRoot?.innerHTML).toBe(html)
    f.hidden(false)
    await draw()
    expect(reads).toBe(16)
    f.scope.dispose()
    expect(f.timers.count).toBe(0)
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
    expect(watched.size).toBe(0)
  } finally {
    f.dispose()
    observing.mockRestore()
    disconnecting.mockRestore()
    for (const el of surfaces) el.remove()
    document.documentElement.removeAttribute("dark")
  }
})

test("plain notice transfers current due data to kit without duplicate visuals or stale generation effects", async () => {
  const f = fixture()
  let shown = 0,
    dismissals = 0,
    details = 0
  const plain = plainNoticePresenter({
    owner: f.scope,
    document,
    site: "www",
    onError: error => {
      f.errors.push(error)
    },
    onCosmetic: variable => {
      f.cosmetics.push(variable)
    }
  })
  const owner = createNoticeOwner({
    scope: f.scope,
    initial: plain,
    onError: error => {
      f.errors.push(error)
    }
  })
  const due = { kind: "not-working", features: ["card-menu"] } satisfies NoticePresentation["due"]
  const generation = {}
  try {
    owner.update({
      due,
      generation,
      text: "Synthetic localized due notice.",
      detailsLabel: "Details",
      dismissLabel: "Dismiss notice",
      details(received, identity, destination) {
        expect(received).toBe(due)
        expect(identity).toBe(generation)
        expect(destination).toBe("#diagnostics")
        details++
      },
      dismiss(received, identity) {
        expect(received).toBe(due)
        expect(identity).toBe(generation)
        dismissals++
      },
      presented() {
        shown++
      }
    })
    await draw()
    const old = document.querySelector("pp-toast-layer")?.shadowRoot?.querySelector("button")
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(1)
    expect(shown).toBe(1)
    old?.click()
    expect(details).toBe(1)
    const r = render(f)
    owner.transfer(toasterNoticePresenter({ source: f.toaster, scope: f.scope, document }))
    await draw()
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(1)
    expect(shown).toBe(1)
    old?.click()
    expect(details).toBe(1)
    const buttons = r.readHost()?.shadowRoot?.querySelectorAll("button")
    expect(buttons?.length).toBe(2)
    buttons?.[1]?.click()
    await draw()
    expect(dismissals).toBe(1)
    expect(owner.read()).toBeNull()
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
  } finally {
    f.dispose()
  }
})

test("plain notice hidden/fullscreen deferral and disposal reject late host creation", async () => {
  const f = fixture()
  let shown = 0
  try {
    const p = plainNoticePresenter({
      owner: f.scope,
      document,
      site: "www",
      onError: error => {
        f.errors.push(error)
      },
      onCosmetic: variable => {
        f.cosmetics.push(variable)
      }
    })
    f.hidden(true)
    const release = p.present({
      due: { kind: "not-working", features: ["card-menu"] },
      generation: {},
      text: "Due",
      detailsLabel: "Details",
      dismissLabel: "Dismiss",
      details() {},
      dismiss() {},
      presented() {
        shown++
      }
    })
    await draw()
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
    f.fullscreen(document.documentElement)
    f.hidden(false)
    await draw()
    expect(shown).toBe(0)
    f.fullscreen(null)
    release()
    await draw()
    expect(shown).toBe(0)
    expect(document.querySelectorAll("pp-toast-layer").length).toBe(0)
    f.scope.dispose()
    expect(f.scope.resourceCount).toBe(0)
    expect(f.timers.count).toBe(0)
  } finally {
    f.dispose()
  }
})
