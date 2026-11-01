import type { KeyRecorderController } from "./controller"

export function recorderEvents(element: HTMLElement, controller: KeyRecorderController) {
  const window = element.ownerDocument.defaultView
  if (!window) throw Error("The recorder needs its extension page window")
  function key(event: KeyboardEvent) {
    const dispatched = controller.dispatch({ kind: event.type === "keyup" ? "keyup" : "keydown", facts: {
      key: event.key, code: event.code, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey,
      altGraph: event.getModifierState("AltGraph"), isComposing: event.isComposing, keyCode: event.keyCode, repeat: event.repeat
    } })
    if (dispatched.consume) { event.preventDefault(); event.stopImmediatePropagation() }
    void dispatched.completed
  }
  function outside(event: Event) { if (!event.composedPath().includes(element)) controller.dispatch({ kind: "blur" }) }
  function blur(event: FocusEvent) {
    const next = event.relatedTarget
    if (!(next instanceof window.Node) || !element.contains(next)) controller.dispatch({ kind: "blur" })
  }
  function close() { controller.dispatch({ kind: "close" }) }
  window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true)
  window.addEventListener("pointerdown", outside, true); window.addEventListener("blur", close)
  window.addEventListener("pagehide", close); element.addEventListener("focusout", blur)
  return { destroy() {
    window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true)
    window.removeEventListener("pointerdown", outside, true); window.removeEventListener("blur", close)
    window.removeEventListener("pagehide", close); element.removeEventListener("focusout", blur)
    close()
  } }
}
