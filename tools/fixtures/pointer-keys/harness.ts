import type { TabView } from "../../../src/shared/contracts/tab-view"
import { Scope } from "../../../src/site/core/scope"
import { Keys, type KeyBlockers, type KeyFailure } from "../../../src/site/core/keys"

export const undoKey: NonNullable<TabView["undoKey"]> = { code: "KeyU", char: "u", ctrl: false, alt: true, shift: false, meta: false }
export const otherKey: NonNullable<TabView["undoKey"]> = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: false, meta: false }
export const enabled = { kind: "enabled", key: undoKey } satisfies import("../../../src/site/core/keys").BindingState

export function owner(errors: unknown[] = []): Scope {
  return new Scope({
    document,
    onError: error => {
      errors.push(error)
    }
  })
}

export function keysFixture() {
  const failures: KeyFailure[] = []
  const open = { menu: false, dialog: false, popover: false }
  const blockers: KeyBlockers = {
    menuOpen: () => open.menu,
    dialogOpen: () => open.dialog,
    extensionPopoverOpen: () => open.popover
  }
  const keys = new Keys({
    document,
    blockers,
    onError: failure => {
      failures.push(failure)
    }
  })
  return { keys, failures, open }
}

export function press(target: EventTarget = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "u",
    code: "KeyU",
    altKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init
  })
  const modifier = event.getModifierState.bind(event)
  // happy-dom reports AltGraph whenever Alt is held; a browser's Alt+U does not.
  Object.defineProperty(event, "getModifierState", { value: (name: string) => name !== "AltGraph" && modifier(name) })
  target.dispatchEvent(event)
  return event
}

export function move(target: EventTarget, x = 12, y = 18): void {
  target.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, composed: true }))
}

export function hitStack(initial: readonly Element[] = []) {
  let elements = initial
  let reads = 0
  const descriptor = Object.getOwnPropertyDescriptor(document, "elementsFromPoint")
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: (_x: number, _y: number) => {
      reads++
      return [...elements]
    }
  })
  return {
    set(next: readonly Element[]) {
      elements = next
    },
    get reads() {
      return reads
    },
    restore() {
      if (descriptor) Object.defineProperty(document, "elementsFromPoint", descriptor)
      else Reflect.deleteProperty(document, "elementsFromPoint")
    }
  }
}

export function focusVisibility(element: HTMLElement, initial = true) {
  let visible = initial
  const descriptor = Object.getOwnPropertyDescriptor(element, "matches")
  const matches = element.matches.bind(element)
  Object.defineProperty(element, "matches", { configurable: true, value: (selector: string) => (selector === ":focus-visible" ? visible : matches(selector)) })
  return {
    set(next: boolean) {
      visible = next
    },
    restore() {
      if (descriptor) Object.defineProperty(element, "matches", descriptor)
      else Reflect.deleteProperty(element, "matches")
    }
  }
}

export function deferred() {
  let resolve = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<void>((yes, no) => {
    resolve = () => yes()
    reject = no
  })
  return { promise, resolve, reject }
}

export async function settled(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
