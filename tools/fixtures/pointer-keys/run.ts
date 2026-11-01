import { Pointer } from "../../../src/site/core/pointer"
import { registerCoreUndo } from "../../../src/site/core/keys"
import { deferred, enabled, focusVisibility, hitStack, keysFixture, move, otherKey, owner, press, settled, undoKey } from "./harness"

const first = owner()
const second = owner()
const pointer = new Pointer({ document, onError: error => { throw error } })
const { keys, failures, open } = keysFixture()
const card = document.createElement("article")
const nested = document.createElement("section")
const preview = document.createElement("div")
const keyboard = document.createElement("button")
card.id = "card"
nested.id = "nested"
preview.id = "preview"
keyboard.id = "keyboard"
card.append(nested)
nested.append(preview)
document.body.append(card, keyboard)
const hits = hitStack([preview, nested, card])
const visibility = focusVisibility(keyboard)
// happy-dom matches :focus-visible on the activeElement fallback, so an unfocused body would read as keyboard focus.
const idle = focusVisibility(document.body, false)
const write = (value: unknown) => { console.log(JSON.stringify(value)) }
const stack = () => {
  const facts = pointer.read()
  return facts.kind === "pointer" ? facts.stack.map(element => element.id) : []
}
let later = 0
const observe = () => { later++ }

try {
  write({ case: "idle", pointer: pointer.read(), consumed: press().defaultPrevented })
  const releaseFirst = pointer.track(first)
  const releaseSecond = pointer.track(second)
  move(preview)
  write({ case: "shared", kind: pointer.read().kind, stack: stack() })

  let calls = 0
  let inFlight: Promise<void> | undefined
  let invocationKind = "none"
  const run = () => { invocationKind = pointer.read().kind; calls++; return inFlight }
  const firstBinding = keys.register(first, { target: { kind: "picker" }, run }, enabled)
  const secondBinding = keys.register(second, { target: { kind: "picker" }, run }, enabled)
  window.addEventListener("keydown", observe)
  releaseFirst()
  const sharedEvent = press()
  write({ case: "one-release", kind: invocationKind, calls, later, consumed: sharedEvent.defaultPrevented })

  const replacement = document.createElement("article")
  replacement.id = "replacement"
  document.body.append(replacement)
  hits.set([replacement])
  document.dispatchEvent(new Event("scroll"))
  write({ case: "stationary-scroll", stack: stack() })
  replacement.id = "recycled"
  write({ case: "recycled-node", stack: stack() })

  keyboard.focus()
  const focus = pointer.read()
  write({ case: "focus-last", kind: focus.kind, element: focus.kind === "focus" ? focus.element.id : null })
  move(replacement, 13, 19)
  write({ case: "pointer-last", kind: pointer.read().kind })
  replacement.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null }))
  write({ case: "leave", pointer: pointer.read() })

  const pending = deferred()
  inFlight = pending.promise
  press()
  firstBinding.release()
  const suppressed = press()
  write({ case: "pending-duplicate-release", calls, consumed: suppressed.defaultPrevented, later })
  pending.resolve()
  await settled()
  inFlight = undefined
  const afterSettlement = press()
  write({ case: "settled", calls, consumed: afterSettlement.defaultPrevented, later })

  const consumed: boolean[] = []
  for (const kind of ["menu", "dialog", "popover"] satisfies (keyof typeof open)[]) {
    open[kind] = true
    consumed.push(press().defaultPrevented)
    open[kind] = false
  }
  write({ case: "blocked", consumed, calls })
  secondBinding.release()

  let undos = 0
  const undo = registerCoreUndo(keys, second, { undoCurrent() { undos++ } }, {
    undoKey, toastVisible: false, shortcutEnabled: false
  })
  write({ case: "undo-inactive", consumed: press().defaultPrevented, undos })
  undo.update({ undoKey, toastVisible: false, shortcutEnabled: true })
  const emptyUndo = press()
  write({ case: "undo-empty-enabled", consumed: emptyUndo.defaultPrevented, undos })
  undo.update({ undoKey: otherKey, toastVisible: true, shortcutEnabled: false })
  const old = press().defaultPrevented
  const current = press(document.body, { key: "p", code: "KeyP" }).defaultPrevented
  write({ case: "undo-current-key", old, current, undos })
  undo.release()
  releaseSecond()
  write({ case: "released", pointer: pointer.read(), consumed: press().defaultPrevented })

  keyboard.blur()
  pointer.track(first)
  const before = pointer.read()
  move(replacement)
  write({ case: "reacquired", before, after: pointer.read().kind })
  if (failures.length) throw new Error(`Unexpected key failures: ${failures.length}`)
} finally {
  window.removeEventListener("keydown", observe)
  first.dispose()
  second.dispose()
  keys.dispose()
  pointer.dispose()
  visibility.restore()
  idle.restore()
  hits.restore()
  document.body.replaceChildren()
}
