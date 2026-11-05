import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { Scope } from "./scope"

const owned: Scope[] = []
const errors: unknown[] = []
function scope() {
  const result = new Scope({ document, onError: error => { errors.push(error) } })
  owned.push(result)
  return result
}
const delivered = () => new Promise<void>(resolve => window.setTimeout(resolve, 10))
afterEach(() => { for (const item of owned.splice(0)) item.dispose(); errors.length = 0 })

test("unused Scope adds no native resource or DOM", () => {
  const listen = spyOn(document, "addEventListener")
  const timer = spyOn(window, "setTimeout")
  const observer = spyOn(window, "MutationObserver")
  const before = document.body.innerHTML
  try {
    const owner = scope()
    expect(owner.resourceCount).toBe(0)
    expect(listen).not.toHaveBeenCalled()
    expect(timer).not.toHaveBeenCalled()
    expect(observer).not.toHaveBeenCalled()
    expect(document.body.innerHTML).toBe(before)
    owner.dispose()
    owner.dispose()
  } finally { listen.mockRestore(); timer.mockRestore(); observer.mockRestore() }
})

test("capture and bubble listeners release independently with matching capture semantics", () => {
  const owner = scope()
  const parent = document.createElement("div")
  const child = document.createElement("button")
  parent.append(child)
  const seen: string[] = []
  const capture = owner.on(parent, "click", () => { seen.push("capture") }, true)
  const bubble = owner.on(parent, "click", () => { seen.push("bubble") }, { capture: false })
  child.click()
  expect(seen).toEqual(["capture", "bubble"])
  capture(); capture()
  expect(owner.resourceCount).toBe(1)
  child.click()
  expect(seen).toEqual(["capture", "bubble", "bubble"])
  bubble()
  owner.dispose()
  child.click()
  expect(seen).toEqual(["capture", "bubble", "bubble"])
  expect(owner.resourceCount).toBe(0)
})

test("once, abort, pre-abort and explicit release end ownership", () => {
  const owner = scope()
  const button = document.createElement("button")
  const controller = new AbortController()
  const seen: string[] = []
  owner.on(button, "click", () => { seen.push("once") }, { once: true })
  owner.on(button, "click", () => { seen.push("abort") }, { signal: controller.signal })
  button.click()
  expect(owner.resourceCount).toBe(1)
  controller.abort()
  expect(owner.resourceCount).toBe(0)
  owner.on(button, "click", () => { seen.push("already aborted") }, { signal: controller.signal })
  button.click()
  expect(seen).toEqual(["once", "abort"])
  expect(owner.resourceCount).toBe(0)
})

test("a fired deadline releases ownership and canceled deadlines do no work", async () => {
  const owner = scope()
  const seen: string[] = []
  owner.timeout(() => { seen.push("fired") }, 0)
  const stop = owner.timeout(() => { seen.push("released") }, 0)
  stop(); stop()
  await delivered()
  expect(seen).toEqual(["fired"])
  expect(owner.resourceCount).toBe(0)
  owner.timeout(() => { seen.push("disposed") }, 0)
  owner.dispose()
  await delivered()
  expect(seen).toEqual(["fired"])
})

test("real MutationObserver delivers on a detached element and stops on release", async () => {
  const owner = scope()
  const target = document.createElement("article")
  const seen: string[] = []
  const release = owner.observe(target, { attributes: true }, records => {
    seen.push(...records.flatMap(record => record.attributeName ?? []))
  })
  target.setAttribute("data-first", "yes")
  await delivered()
  expect(seen).toEqual(["data-first"])
  release(); release()
  target.setAttribute("data-late", "yes")
  await delivered()
  expect(seen).toEqual(["data-first"])
  expect(owner.resourceCount).toBe(0)
})

test("queued observer delivery and all later registrations are inert after disposal", async () => {
  const owner = scope()
  const target = document.createElement("div")
  const seen: string[] = []
  owner.observe(target, { childList: true }, () => { seen.push("observer") })
  target.append(document.createElement("span"))
  owner.dispose()
  owner.on(target, "click", () => { seen.push("listener") })
  owner.observe(target, { attributes: true }, () => { seen.push("late observer") })
  owner.timeout(() => { seen.push("deadline") }, 0)
  owner.add(() => { seen.push("late cleanup") })
  target.click()
  target.setAttribute("data-late", "yes")
  await delivered()
  expect(seen).toEqual(["late cleanup"])
  expect(owner.resourceCount).toBe(0)
})

test("throwing cleanup, disposal reentry and a throwing error sink do not skip cleanup", () => {
  const seen: string[] = []
  const owner = new Scope({ document, onError() { seen.push("error"); throw Error("sink") } })
  owner.add(() => { seen.push("first"); owner.dispose(); throw Error("cleanup") })
  owner.add(() => { seen.push("second"); owner.add(() => { seen.push("late") }) })
  owner.dispose(); owner.dispose()
  expect(seen).toEqual(["first", "error", "second", "late"])
  expect(owner.resourceCount).toBe(0)
})

test("listener acquisition that disposes its scope is undone before returning", () => {
  const owner = scope()
  const target = document.createElement("button")
  const add = target.addEventListener.bind(target)
  const registration = spyOn(target, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    add(type, listener, options)
    owner.dispose()
  })
  let calls = 0
  try { owner.on(target, "click", () => { calls++ }) } finally { registration.mockRestore() }
  target.click()
  expect(calls).toBe(0)
  expect(owner.resourceCount).toBe(0)
})

test("native registrations use the target document realm", async () => {
  const frame = document.createElement("iframe")
  frame.srcdoc = "<!doctype html><title>Scope realm</title>"
  document.body.append(frame)
  const doc = frame.contentDocument
  if (!doc?.defaultView) throw Error("Expected a happy-dom iframe realm")
  const target = doc.createElement("div")
  const NativeObserver = doc.defaultView.MutationObserver
  const observer = mock(() => {})
  doc.defaultView.MutationObserver = class extends NativeObserver {
    constructor(callback: MutationCallback) { super(callback); observer() }
  }
  const timer = spyOn(doc.defaultView, "setTimeout")
  const owner = new Scope({ document: doc, onError: error => { errors.push(error) } })
  let changes = 0
  let deadlines = 0
  try {
    owner.observe(target, { attributes: true }, () => { changes++ })
    owner.timeout(() => { deadlines++ }, 0)
    target.setAttribute("data-change", "yes")
    await delivered()
    expect(observer).toHaveBeenCalledTimes(1)
    expect(timer).toHaveBeenCalledTimes(1)
    expect(changes).toBe(1)
    expect(deadlines).toBe(1)
    owner.dispose()
    target.setAttribute("data-after", "yes")
    await delivered()
    expect(changes).toBe(1)
    expect(owner.resourceCount).toBe(0)
  } finally { owner.dispose(); doc.defaultView.MutationObserver = NativeObserver; timer.mockRestore(); frame.remove() }
})

test("a resource acquired outside the scope after disposal is released by add immediately", () => {
  const owner = scope()
  const target = document.createElement("div")
  owner.dispose()
  const late = document.createElement("span")
  target.append(late)
  const release = owner.add(() => late.remove())
  expect(target.childElementCount).toBe(0)
  release(); release()
  expect(owner.resourceCount).toBe(0)
})

test("observer acquisition that revokes ownership disconnects the real observer", async () => {
  const owner = scope()
  const target = document.createElement("div")
  const native = window.MutationObserver.prototype.observe
  const registration = spyOn(window.MutationObserver.prototype, "observe").mockImplementation(function (this: MutationObserver, el, init) {
    native.call(this, el, init)
    owner.dispose()
  })
  let calls = 0
  try { owner.observe(target, { attributes: true }, () => { calls++ }) } finally { registration.mockRestore() }
  target.setAttribute("data-late", "yes")
  await delivered()
  expect(calls).toBe(0)
  expect(owner.resourceCount).toBe(0)
})

test("deadline acquisition that revokes ownership cancels the native deadline", async () => {
  const owner = scope()
  const realm: Window = window
  const native = realm.setTimeout.bind(realm)
  const registration = spyOn(realm, "setTimeout").mockImplementation((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    const id = native(fn, ms, ...args)
    owner.dispose()
    return id
  })
  let calls = 0
  try { owner.timeout(() => { calls++ }, 0) } finally { registration.mockRestore() }
  await delivered()
  expect(calls).toBe(0)
  expect(owner.resourceCount).toBe(0)
})

test("a failing observer acquisition does not retain a registration", () => {
  const owner = scope()
  const target = document.createElement("div")
  expect(() => owner.observe(target, {}, () => {})).toThrow()
  expect(owner.resourceCount).toBe(0)
  owner.dispose()
})
