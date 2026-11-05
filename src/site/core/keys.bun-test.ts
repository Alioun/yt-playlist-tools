import { afterEach, expect, spyOn, test } from "bun:test"
import { Keys, registerCoreUndo } from "./keys"
import { deferred, enabled, keysFixture, otherKey, owner, press, settled, undoKey } from "../../../tools/fixtures/pointer-keys/harness"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); document.body.replaceChildren() })
function fixture() {
  const result = keysFixture()
  const first = owner()
  const second = owner()
  cleanups.push(() => { result.keys.dispose(); first.dispose(); second.dispose() })
  return { ...result, first, second }
}

test("Keys construction is inert and two features share one capture listener", () => {
  const add = spyOn(window, "addEventListener")
  const remove = spyOn(window, "removeEventListener")
  try {
    const { keys, first, second } = fixture()
    expect(add).not.toHaveBeenCalled()
    const one = keys.register(first, { target: { kind: "picker" }, run() {} }, enabled)
    const two = keys.register(second, { target: { kind: "undo" }, run() {} }, enabled)
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]?.[0]).toBe("keydown")
    expect(add.mock.calls[0]?.[2]).toMatchObject({ capture: true })
    one.release(); one.release()
    expect(remove).not.toHaveBeenCalled()
    two.release()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(first.resourceCount).toBe(0)
    expect(second.resourceCount).toBe(0)
    expect(press().defaultPrevented).toBe(false)
  } finally { add.mockRestore(); remove.mockRestore() }
})

test("matching keys suppress later listeners before invoking the action", () => {
  const { keys, first } = fixture()
  const seen: string[] = []
  let current: KeyboardEvent | undefined
  let consumedDuringAction = false
  const before = (event: KeyboardEvent) => { current = event }
  window.addEventListener("keydown", before, true)
  cleanups.push(() => window.removeEventListener("keydown", before, true))
  keys.register(first, { target: { kind: "picker" }, run() {
    consumedDuringAction = current?.defaultPrevented === true
    seen.push("action")
  } }, enabled)
  const later = () => { seen.push("later") }
  window.addEventListener("keydown", later, true)
  cleanups.push(() => window.removeEventListener("keydown", later, true))
  const event = press()
  expect(event.defaultPrevented).toBe(true)
  expect(seen).toEqual(["action"])
  expect(consumedDuringAction).toBe(true)
  const unmatched = press(document.body, { key: "z", code: "KeyZ" })
  expect(unmatched.defaultPrevented).toBe(false)
  expect(seen).toEqual(["action", "later"])
})

test("disabled actions and actual key updates change behavior without multiple listeners", () => {
  const { keys, first } = fixture()
  const add = spyOn(window, "addEventListener")
  let calls = 0
  try {
    const registration = keys.register(first, { target: { kind: "picker" }, run() { calls++ } }, { kind: "disabled" })
    expect(add).not.toHaveBeenCalled()
    expect(press().defaultPrevented).toBe(false)
    registration.update(enabled)
    expect(press().defaultPrevented).toBe(true)
    registration.update({ kind: "enabled", key: otherKey })
    expect(press().defaultPrevented).toBe(false)
    expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
    registration.update({ kind: "disabled" })
    expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(false)
    registration.update(enabled)
    expect(add).toHaveBeenCalledTimes(2)
    expect(calls).toBe(2)
  } finally { add.mockRestore() }
})

test("duplicate semantic actions dispatch once and share pending ownership after individual release", async () => {
  const { keys, first, second } = fixture()
  const action = deferred()
  let calls = 0
  const one = keys.register(first, { target: { kind: "playlist", id: "same" }, run() { calls++; return action.promise } }, enabled)
  keys.register(second, { target: { kind: "playlist", id: "same" }, run() { calls++; return action.promise } }, enabled)
  expect(press().defaultPrevented).toBe(true)
  expect(calls).toBe(1)
  one.release()
  expect(press().defaultPrevented).toBe(false)
  expect(calls).toBe(1)
  action.resolve()
  await settled()
  expect(press().defaultPrevented).toBe(true)
  expect(calls).toBe(2)
})

test("pending and unmatched events reach later listeners untouched", async () => {
  const { keys, first } = fixture()
  const action = deferred()
  keys.register(first, { target: { kind: "picker" }, run: () => action.promise }, enabled)
  let later = 0
  const observe = () => { later++ }
  window.addEventListener("keydown", observe)
  cleanups.push(() => window.removeEventListener("keydown", observe))
  press()
  expect(later).toBe(0)
  expect(press().defaultPrevented).toBe(false)
  expect(later).toBe(1)
  action.resolve()
  await settled()
})

test("same callback identity does not merge distinct semantic actions", () => {
  const { keys, first, second } = fixture()
  let calls = 0
  const run = () => { calls++ }
  keys.register(first, { target: { kind: "playlist", id: "one" }, run }, enabled)
  keys.register(second, { target: { kind: "playlist", id: "two" }, run }, { kind: "enabled", key: otherKey })
  press()
  press(document.body, { key: "p", code: "KeyP" })
  expect(calls).toBe(2)
})

test("conflicting keys preserve canonical first-binding precedence even while it is pending", async () => {
  const { keys, first, second } = fixture()
  const action = deferred()
  const seen: string[] = []
  keys.register(first, { target: { kind: "picker" }, run() { seen.push("first"); return action.promise } }, enabled)
  keys.register(second, { target: { kind: "undo" }, run() { seen.push("second") } }, enabled)
  press()
  expect(press().defaultPrevented).toBe(false)
  expect(seen).toEqual(["first"])
  action.resolve()
  await settled()
})

test("the first active duplicate supplies the current key and releasing it exposes the next", () => {
  const { keys, first, second } = fixture()
  const seen: string[] = []
  const one = keys.register(first, { target: { kind: "picker" }, run() { seen.push("one") } }, enabled)
  keys.register(second, { target: { kind: "picker" }, run() { seen.push("two") } }, { kind: "enabled", key: otherKey })
  expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(false)
  one.release()
  expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(true)
  expect(seen).toEqual(["two"])
})

for (const tag of ["input", "textarea", "select"]) {
  test(`typing in ${tag} passes through`, () => {
    const { keys, first } = fixture()
    let calls = 0
    keys.register(first, { target: { kind: "picker" }, run() { calls++ } }, enabled)
    const element = document.createElement(tag)
    document.body.append(element)
    expect(press(element).defaultPrevented).toBe(false)
    expect(calls).toBe(0)
  })
}

for (const role of ["textbox", "searchbox", "combobox", "spinbutton", "presentation textbox"]) {
  test(`typing role ${role} passes through`, () => {
    const { keys, first } = fixture()
    keys.register(first, { target: { kind: "picker" }, run() { throw Error("Typing must pass through") } }, enabled)
    const element = document.createElement("div")
    element.setAttribute("role", role)
    const child = document.createElement("span")
    element.append(child)
    document.body.append(element)
    expect(press(child).defaultPrevented).toBe(false)
  })
}

for (const value of ["", "true", "plaintext-only"]) {
  test(`contenteditable ${JSON.stringify(value)} passes through`, () => {
    const { keys, first } = fixture()
    keys.register(first, { target: { kind: "picker" }, run() { throw Error("Editing must pass through") } }, enabled)
    const element = document.createElement("div")
    element.setAttribute("contenteditable", value)
    document.body.append(element)
    expect(press(element).defaultPrevented).toBe(false)
  })
}

test("checkboxes remain matchable according to the canonical matcher", () => {
  const { keys, first } = fixture()
  keys.register(first, { target: { kind: "picker" }, run() {} }, enabled)
  const input = document.createElement("input")
  input.type = "checkbox"
  document.body.append(input)
  expect(press(input).defaultPrevented).toBe(true)
})

test("current composed shadow paths reveal typing hidden behind a host", () => {
  const { keys, first } = fixture()
  keys.register(first, { target: { kind: "picker" }, run() { throw Error("Shadow typing must pass through") } }, enabled)
  const host = document.createElement("section")
  const root = host.attachShadow({ mode: "open" })
  const input = document.createElement("input")
  root.append(input)
  document.body.append(host)
  expect(press(input).defaultPrevented).toBe(false)
})

test("open DOM menus and dialogs are read at invocation and hidden blockers do not block", () => {
  const { keys, first } = fixture()
  let calls = 0
  keys.register(first, { target: { kind: "picker" }, run() { calls++ } }, enabled)
  const menu = document.createElement("div")
  menu.setAttribute("role", "menu")
  document.body.append(menu)
  expect(press().defaultPrevented).toBe(false)
  menu.hidden = true
  expect(press().defaultPrevented).toBe(true)
  const dialog = document.createElement("dialog")
  document.body.append(dialog)
  dialog.setAttribute("open", "")
  expect(press().defaultPrevented).toBe(false)
  dialog.removeAttribute("open")
  expect(press().defaultPrevented).toBe(true)
  menu.hidden = false
  menu.style.display = "none"
  expect(press().defaultPrevented).toBe(true)
  expect(calls).toBe(3)
})

test("required menu, dialog and extension popover collaborators are live", () => {
  const { keys, first, open } = fixture()
  let calls = 0
  keys.register(first, { target: { kind: "picker" }, run() { calls++ } }, enabled)
  for (const kind of ["menu", "dialog", "popover"] satisfies (keyof typeof open)[]) {
    open[kind] = true
    expect(press().defaultPrevented).toBe(false)
    open[kind] = false
  }
  expect(press().defaultPrevented).toBe(true)
  expect(calls).toBe(1)
})

test("IME, legacy composition code, AltGraph and repeat pass through", () => {
  const { keys, first } = fixture()
  let calls = 0
  keys.register(first, { target: { kind: "picker" }, run() { calls++ } }, enabled)
  expect(press(document.body, { isComposing: true }).defaultPrevented).toBe(false)
  expect(press(document.body, { repeat: true }).defaultPrevented).toBe(false)
  const legacy = new KeyboardEvent("keydown", { key: "u", code: "KeyU", altKey: true, bubbles: true, cancelable: true })
  Object.defineProperty(legacy, "keyCode", { value: 229 })
  document.body.dispatchEvent(legacy)
  expect(legacy.defaultPrevented).toBe(false)
  const altGraph = new KeyboardEvent("keydown", { key: "u", code: "KeyU", altKey: true, bubbles: true, cancelable: true })
  Object.defineProperty(altGraph, "getModifierState", { value: (name: string) => name === "AltGraph" })
  document.body.dispatchEvent(altGraph)
  expect(altGraph.defaultPrevented).toBe(false)
  expect(calls).toBe(0)
})

test("rejected actions settle pending state and reach the required error collaborator", async () => {
  const { keys, first, failures } = fixture()
  const action = deferred()
  let calls = 0
  keys.register(first, { target: { kind: "picker" }, run() { calls++; return calls === 1 ? action.promise : undefined } }, enabled)
  press()
  const error = Error("synthetic action failure")
  action.reject(error)
  await settled()
  expect(failures).toEqual([{ phase: "action", target: { kind: "picker" }, error }])
  expect(press().defaultPrevented).toBe(true)
  expect(calls).toBe(2)
})

test("synchronous failure also releases pending ownership", () => {
  const { keys, first, failures } = fixture()
  let calls = 0
  keys.register(first, { target: { kind: "undo" }, run() { calls++; throw Error("synthetic synchronous failure") } }, enabled)
  press(); press()
  expect(calls).toBe(2)
  expect(failures).toHaveLength(2)
})

test("callback reentry observes pending state before the action starts", () => {
  const { keys, first } = fixture()
  let calls = 0
  let nested: KeyboardEvent | undefined
  keys.register(first, { target: { kind: "picker" }, run() { calls++; nested = press() } }, enabled)
  expect(press().defaultPrevented).toBe(true)
  expect(nested?.defaultPrevented).toBe(false)
  expect(calls).toBe(1)
})

test("late settlement cannot clear pending state on a replacement semantic group", async () => {
  const { keys, first, second } = fixture()
  const old = deferred()
  const current = deferred()
  const one = keys.register(first, { target: { kind: "picker" }, run: () => old.promise }, enabled)
  press()
  one.release()
  let calls = 0
  keys.register(second, { target: { kind: "picker" }, run() { calls++; return current.promise } }, enabled)
  press()
  old.resolve()
  await settled()
  expect(press().defaultPrevented).toBe(false)
  expect(calls).toBe(1)
  current.resolve()
  await settled()
})

test("service disposal during callback prevents late resources and reacquisition", async () => {
  const { keys, first, second } = fixture()
  const action = deferred()
  keys.register(first, { target: { kind: "picker" }, run() { keys.dispose(); return action.promise } }, enabled)
  press()
  action.resolve()
  await settled()
  keys.register(second, { target: { kind: "picker" }, run() { throw Error("Disposed service") } }, enabled)
  expect(press().defaultPrevented).toBe(false)
  expect(first.resourceCount).toBe(0)
  expect(second.resourceCount).toBe(0)
})

test("native acquisition that disposes its feature leaves no active registration", () => {
  const { keys, first } = fixture()
  const original = window.addEventListener.bind(window)
  const add = spyOn(window, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    original(type, listener, options)
    if (type === "keydown") first.dispose()
  })
  try { keys.register(first, { target: { kind: "picker" }, run() { throw Error("Obsolete registration") } }, enabled) }
  finally { add.mockRestore() }
  expect(press().defaultPrevented).toBe(false)
  expect(first.resourceCount).toBe(0)
})

test("Core Undo is live for a toast or shortcut, uses the current nullable TabView key, and calls empty undo", () => {
  const { keys, first } = fixture()
  let undos = 0
  const undo = registerCoreUndo(keys, first, { undoCurrent() { undos++ } }, { undoKey, toastVisible: false, shortcutEnabled: false })
  expect(press().defaultPrevented).toBe(false)
  undo.update({ undoKey, toastVisible: false, shortcutEnabled: true })
  expect(press().defaultPrevented).toBe(true)
  expect(undos).toBe(1)
  undo.update({ undoKey: otherKey, toastVisible: true, shortcutEnabled: false })
  expect(press().defaultPrevented).toBe(false)
  expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(true)
  expect(undos).toBe(2)
  undo.update({ undoKey: null, toastVisible: true, shortcutEnabled: true })
  expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(false)
  undo.release(); undo.release()
})

test("cleanup reentry retains the replacement listener and registration", () => {
  const { keys, first, second } = fixture()
  const seen: string[] = []
  const one = keys.register(first, { target: { kind: "picker" }, run() { seen.push("old") } }, enabled)
  const original = window.removeEventListener.bind(window)
  let entered = false
  const remove = spyOn(window, "removeEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
    original(type, listener, options)
    if (type === "keydown" && !entered) {
      entered = true
      keys.register(second, { target: { kind: "picker" }, run() { seen.push("new") } }, enabled)
    }
  })
  try { one.release() } finally { remove.mockRestore() }
  expect(press().defaultPrevented).toBe(true)
  expect(seen).toEqual(["new"])
})

test("a failing context collaborator reports and leaves propagation untouched", () => {
  const scope = owner()
  const failures: unknown[] = []
  const error = new Error("synthetic blocker failure")
  const keys = new Keys({
    document,
    blockers: { menuOpen() { throw error }, dialogOpen: () => false, extensionPopoverOpen: () => false },
    onError(failure) { failures.push(failure); throw new Error("synthetic sink failure") }
  })
  cleanups.push(() => { keys.dispose(); scope.dispose() })
  keys.register(scope, { target: { kind: "picker" }, run() { throw Error("No match after context failure") } }, enabled)
  let later = 0
  const observe = () => { later++ }
  window.addEventListener("keydown", observe)
  cleanups.push(() => window.removeEventListener("keydown", observe))
  expect(press().defaultPrevented).toBe(false)
  expect(later).toBe(1)
  expect(failures).toEqual([{ phase: "context", error }])
})

test("a blocker that updates a key cannot dispatch an obsolete matched key", () => {
  const scope = owner()
  let change = () => {}
  const keys = new Keys({
    document,
    blockers: { menuOpen() { change(); return false }, dialogOpen: () => false, extensionPopoverOpen: () => false },
    onError() {}
  })
  cleanups.push(() => { keys.dispose(); scope.dispose() })
  let calls = 0
  const registration = keys.register(scope, { target: { kind: "picker" }, run() { calls++ } }, enabled)
  change = () => { registration.update({ kind: "enabled", key: otherKey }) }
  expect(press().defaultPrevented).toBe(false)
  expect(calls).toBe(0)
  change = () => {}
  expect(press(document.body, { key: "p", code: "KeyP" }).defaultPrevented).toBe(true)
  expect(calls).toBe(1)
})

test("disabling and reenabling an in-flight action preserves its semantic pending state", async () => {
  const { keys, first } = fixture()
  const action = deferred()
  let calls = 0
  const registration = keys.register(first, { target: { kind: "picker" }, run() { calls++; return action.promise } }, enabled)
  press()
  registration.update({ kind: "disabled" })
  expect(press().defaultPrevented).toBe(false)
  registration.update(enabled)
  expect(press().defaultPrevented).toBe(false)
  expect(calls).toBe(1)
  action.resolve()
  await settled()
  expect(press().defaultPrevented).toBe(true)
})

test("a late rejection reports its error without reviving disposed resources", async () => {
  const { keys, first, failures } = fixture()
  const action = deferred()
  const add = spyOn(window, "addEventListener")
  try {
    keys.register(first, { target: { kind: "picker" }, run: () => action.promise }, enabled)
    press()
    keys.dispose()
    const registrations = add.mock.calls.length
    const error = new Error("synthetic late rejection")
    action.reject(error)
    await settled()
    expect(failures).toEqual([{ phase: "action", target: { kind: "picker" }, error }])
    expect(add.mock.calls.length).toBe(registrations)
    expect(press().defaultPrevented).toBe(false)
    expect(first.resourceCount).toBe(0)
  } finally { add.mockRestore() }
})

test("service disposal during native acquisition cannot restore its listener", () => {
  const { keys, first, second } = fixture()
  const original = window.addEventListener.bind(window)
  const add = spyOn(window, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    original(type, listener, options)
    if (type === "keydown") keys.dispose()
  })
  try { keys.register(first, { target: { kind: "picker" }, run() {} }, enabled) }
  finally { add.mockRestore() }
  keys.register(second, { target: { kind: "picker" }, run() {} }, enabled)
  expect(press().defaultPrevented).toBe(false)
  expect(first.resourceCount).toBe(0)
  expect(second.resourceCount).toBe(0)
})
