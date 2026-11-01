import { afterEach, expect, spyOn, test } from "bun:test"
import { Pointer } from "./pointer"
import { focusVisibility, hitStack, move, owner } from "../../../tools/fixtures/pointer-keys/harness"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); document.body.replaceChildren() })
function fixture() {
  const pointer = new Pointer({ document, onError: error => { throw error } })
  const first = owner()
  const second = owner()
  const hits = hitStack()
  // happy-dom matches :focus-visible on the activeElement fallback, so an unfocused body would read as keyboard focus.
  const idle = focusVisibility(document.body, false)
  cleanups.push(() => { first.dispose(); second.dispose(); pointer.dispose(); hits.restore(); idle.restore() })
  const card = document.createElement("article")
  const child = document.createElement("button")
  card.id = "card"
  child.id = "child"
  card.append(child)
  document.body.append(card)
  hits.set([child, card])
  return { pointer, first, second, hits, card, child }
}

test("Pointer construction is inert and two features share one delegated tracker", () => {
  const native = spyOn(document, "addEventListener")
  const global = spyOn(window, "addEventListener")
  const observer = spyOn(window, "MutationObserver")
  const timer = spyOn(window, "setTimeout")
  try {
    const { pointer, first, second, child } = fixture()
    expect(native).not.toHaveBeenCalled()
    expect(global).not.toHaveBeenCalled()
    expect(observer).not.toHaveBeenCalled()
    expect(timer).not.toHaveBeenCalled()
    const release = pointer.track(first)
    pointer.track(second)
    expect(native.mock.calls.map(call => call[0])).toEqual(["pointerover", "pointermove", "pointerout", "pointerleave", "focusin"])
    expect(global.mock.calls.map(call => call[0])).toEqual(["blur"])
    expect(first.resourceCount).toBe(1)
    expect(second.resourceCount).toBe(1)
    move(child)
    release(); release()
    expect(pointer.read().kind).toBe("pointer")
    expect(first.resourceCount).toBe(0)
    second.dispose()
    expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
    expect(second.resourceCount).toBe(0)
  } finally { native.mockRestore(); global.mockRestore(); observer.mockRestore(); timer.mockRestore() }
})

test("last release removes every listener and reacquisition starts a fresh lifetime", () => {
  const { pointer, first, second, child } = fixture()
  const remove = spyOn(document, "removeEventListener")
  const global = spyOn(window, "removeEventListener")
  try {
    const release = pointer.track(first)
    move(child)
    release()
    expect(remove).toHaveBeenCalledTimes(5)
    expect(global).toHaveBeenCalledTimes(1)
    move(child)
    expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
    pointer.track(second)
    expect(pointer.read()).toEqual({ kind: "none", reason: "unmoved" })
    move(child)
    expect(pointer.read().kind).toBe("pointer")
  } finally { remove.mockRestore(); global.mockRestore() }
})

test("stationary pointer resolves a changed stack at invocation and retains preview order", () => {
  const { pointer, first, hits, card, child } = fixture()
  const preview = document.createElement("div")
  document.body.append(preview)
  hits.set([preview, child, card])
  pointer.track(first)
  move(child)
  expect(pointer.read()).toEqual({ kind: "pointer", point: { x: 12, y: 18 }, stack: [preview, child, card] })
  const replacement = document.createElement("article")
  document.body.append(replacement)
  hits.set([replacement])
  document.dispatchEvent(new Event("scroll"))
  expect(pointer.read()).toEqual({ kind: "pointer", point: { x: 12, y: 18 }, stack: [replacement] })
  replacement.id = "recycled"
  replacement.replaceChildren(document.createElement("a"))
  expect(pointer.read().kind).toBe("pointer")
  const current = pointer.read()
  expect(current.kind === "pointer" && current.stack[0]?.id).toBe("recycled")
  expect(hits.reads).toBe(4)
})

test("pointer leave targets nothing and a child's pointerleave preserves an inside point", () => {
  const { pointer, first, child, card } = fixture()
  pointer.track(first)
  move(child)
  child.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: card }))
  expect(pointer.read().kind).toBe("pointer")
  child.dispatchEvent(new PointerEvent("pointerout", { relatedTarget: null, bubbles: true }))
  expect(pointer.read()).toEqual({ kind: "none", reason: "outside" })
  move(child, -1, 2)
  expect(pointer.read()).toEqual({ kind: "none", reason: "outside" })
  move(child)
  document.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: null }))
  expect(pointer.read()).toEqual({ kind: "none", reason: "outside" })
})

test("keyboard-visible focus and pointer movement have an explicit last-moved order", () => {
  const { pointer, first, child, card } = fixture()
  const visibility = focusVisibility(child)
  cleanups.push(visibility.restore)
  pointer.track(first)
  child.focus()
  expect(pointer.read()).toEqual({ kind: "focus", element: child, stack: [child, card, document.body, document.documentElement] })
  move(card)
  expect(pointer.read().kind).toBe("pointer")
  child.blur(); child.focus()
  expect(pointer.read().kind).toBe("focus")
  visibility.set(false)
  expect(pointer.read()).toEqual({ kind: "none", reason: "focus-unavailable" })
  move(card, 13, 19)
  child.blur(); child.focus()
  expect(pointer.read().kind).toBe("pointer")
})

test("stationary pointerover from scrolling does not supersede newer keyboard focus", () => {
  const { pointer, first, child, card } = fixture()
  const visibility = focusVisibility(child)
  cleanups.push(visibility.restore)
  pointer.track(first)
  move(card)
  child.focus()
  card.dispatchEvent(new PointerEvent("pointerover", { clientX: 12, clientY: 18, bubbles: true }))
  expect(pointer.read().kind).toBe("focus")
  move(card, 14, 20)
  expect(pointer.read().kind).toBe("pointer")
})

test("removed focus and detached or foreign hit elements cannot become targets", () => {
  const { pointer, first, hits, child } = fixture()
  const visibility = focusVisibility(child)
  cleanups.push(visibility.restore)
  pointer.track(first)
  child.focus()
  child.remove()
  expect(pointer.read()).toEqual({ kind: "none", reason: "focus-unavailable" })
  const foreign = document.implementation.createHTMLDocument("foreign").body
  hits.set([child, foreign])
  move(document.body)
  expect(pointer.read()).toEqual({ kind: "pointer", point: { x: 12, y: 18 }, stack: [] })
})

test("open shadow focus resolves its deepest active element and composed ancestors", () => {
  const { pointer, first, card } = fixture()
  const root = card.attachShadow({ mode: "open" })
  const input = document.createElement("button")
  root.append(input)
  const visibility = focusVisibility(input)
  cleanups.push(visibility.restore)
  pointer.track(first)
  input.focus()
  const facts = pointer.read()
  expect(facts.kind).toBe("focus")
  expect(facts.kind === "focus" && facts.element).toBe(input)
  expect(facts.kind === "focus" && facts.stack).toContain(card)
})

test("disposal during native acquisition removes late-acquired resources", () => {
  const { pointer, first, child } = fixture()
  const original = document.addEventListener.bind(document)
  const add = spyOn(document, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    original(type, listener, options)
    first.dispose()
  })
  try { pointer.track(first) } finally { add.mockRestore() }
  move(child)
  expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
  expect(first.resourceCount).toBe(0)
})

test("cleanup reentry creates a new generation before the old cleanup finishes", () => {
  const { pointer, first, second, child } = fixture()
  const release = pointer.track(first)
  const original = document.removeEventListener.bind(document)
  let entered = false
  const remove = spyOn(document, "removeEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
    original(type, listener, options)
    if (!entered) { entered = true; pointer.track(second) }
  })
  try { release() } finally { remove.mockRestore() }
  expect(pointer.read()).toEqual({ kind: "none", reason: "unmoved" })
  move(child)
  expect(pointer.read().kind).toBe("pointer")
  second.dispose()
  expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
})

test("service disposal is idempotent and prevents new tracking", () => {
  const { pointer, first, second, child } = fixture()
  pointer.track(first)
  pointer.dispose(); pointer.dispose()
  pointer.track(second)()
  move(child)
  expect(first.resourceCount).toBe(0)
  expect(second.resourceCount).toBe(0)
  expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
})

test("a detached document cannot supply a live point", () => {
  const frame = document.createElement("iframe")
  frame.srcdoc = "<!doctype html><body></body>"
  document.body.append(frame)
  const doc = frame.contentDocument
  const realm = doc?.defaultView
  if (!doc || !realm) throw new Error("Expected an iframe document realm")
  const button = doc.createElement("button")
  doc.body.append(button)
  Object.defineProperty(doc, "elementsFromPoint", { configurable: true, value: () => [button] })
  const pointer = new Pointer({ document: doc, onError: error => { throw error } })
  const scope = owner()
  cleanups.push(() => { pointer.dispose(); scope.dispose(); frame.remove() })
  pointer.track(scope)
  button.dispatchEvent(new realm.PointerEvent("pointerover", { clientX: 10, clientY: 10, bubbles: true }))
  expect(pointer.read().kind).toBe("pointer")
  frame.remove()
  expect(pointer.read()).toEqual({ kind: "none", reason: "document-unavailable" })
})

test("service disposal during acquisition cannot revive a tracker", () => {
  const { pointer, first, second, child } = fixture()
  const original = document.addEventListener.bind(document)
  const add = spyOn(document, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    original(type, listener, options)
    pointer.dispose()
  })
  try { pointer.track(first) } finally { add.mockRestore() }
  pointer.track(second)
  move(child)
  expect(pointer.read()).toEqual({ kind: "none", reason: "inactive" })
  expect(first.resourceCount).toBe(0)
  expect(second.resourceCount).toBe(0)
})
