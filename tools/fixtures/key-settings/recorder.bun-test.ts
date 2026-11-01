import { expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createKeySettingsClient } from "../../../src/ui/keys/client"
import { recorderEvents } from "../../../src/ui/keys/dom"
import type { KeyRecorderController } from "../../../src/ui/keys/controller"
import type { KeySettingAnswer } from "../../../src/shared/contracts/key-settings"
import { world, chord } from "./harness"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "chrome-extension://key-fixture/popup.html" })
function key(element: HTMLElement, code: string, name: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code, key: name, ...modifiers })
  const modifier = event.getModifierState.bind(event)
  // happy-dom reports AltGraph whenever Alt is held; a browser's Alt+Z does not.
  Object.defineProperty(event, "getModifierState", { value: (state: string) => state !== "AltGraph" && modifier(state) })
  element.dispatchEvent(event)
  return event
}
function nextAnswer(controller: KeyRecorderController): Promise<KeySettingAnswer> {
  return new Promise(resolve => {
    let unsubscribe = () => {}
    unsubscribe = controller.subscribe(view => {
      if (!view.busy && view.answer) { unsubscribe(); resolve(view.answer) }
    })
  })
}
async function mounted() {
  const w = world("wire"); await w.owner.ready()
  const choices: string[] = []
  const client = createKeySettingsClient({ backend: w.backend, platform: { browser: "chrome", os: "linux" },
    commands: { async read() { return { kind: "available", keys: [{ key: chord("z"), command: "Run Gather" }] } } },
    chooser: { async open({ shortcut }) { choices.push(shortcut) } } })
  await client.ready
  const element = document.createElement("div"), button = document.createElement("button"), outside = document.createElement("button")
  element.append(button); document.body.append(element, outside)
  return { w, client, choices, element, button, outside, async dispose() { element.remove(); outside.remove(); client.dispose(); await w.dispose() } }
}

test("actual DOM recorder and authenticated route preserve old key while modifiers/refusals wait, then commit and warn", async () => {
  const h = await mounted(), controller = h.client.recorder({ kind: "undo" }), bridge = recorderEvents(h.element, controller)
  try {
    await controller.commandRead
    controller.dispatch({ kind: "start" })
    key(h.button, "ControlLeft", "Control", { ctrlKey: true })
    expect(controller.view().label).toContain("Ctrl")
    expect(h.w.settings().undoKey).toBeNull()
    key(h.button, "Enter", "Enter"); expect(controller.view().hint).toContain("press buttons")
    key(h.button, "KeyQ", "q", { ctrlKey: true, altKey: true }); expect(controller.view().hint).toContain("many keyboards")
    key(h.button, "KeyX", "x", { isComposing: true }); expect(h.w.batches).toEqual([])
    const answer = nextAnswer(controller), event = key(h.button, "KeyZ", "z", { altKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(await answer).toMatchObject({ kind: "confirmed" })
    expect(h.w.settings().undoKey).toEqual(chord("z"))
    expect(controller.view().warnings).toContainEqual({ kind: "command", command: "Run Gather" })
  } finally { bridge.destroy(); await h.dispose() }
})

for (const cancel of ["Escape", "Tab", "ShiftTab", "outside", "blur", "close"] as const) test(`DOM ${cancel} cancels without a storage mutation`, async () => {
  const h = await mounted(), controller = h.client.recorder({ kind: "undo" }), bridge = recorderEvents(h.element, controller)
  try {
    controller.dispatch({ kind: "start" })
    if (cancel === "Escape") expect(key(h.button, "Escape", "Escape").defaultPrevented).toBe(true)
    else if (cancel === "Tab" || cancel === "ShiftTab") expect(key(h.button, "Tab", "Tab", { shiftKey: cancel === "ShiftTab" }).defaultPrevented).toBe(false)
    else if (cancel === "outside") h.outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    else if (cancel === "blur") window.dispatchEvent(new Event("blur"))
    else window.dispatchEvent(new Event("pagehide"))
    expect(controller.view().recorder).toEqual({ kind: "idle", key: null }); expect(h.w.batches).toEqual([])
  } finally { bridge.destroy(); await h.dispose() }
})

test("DOM conflict Cancel preserves both keys; Use it here rechecks real owner and clears only the observed binding", async () => {
  const h = await mounted()
  await h.w.assign({ kind: "picker" }, chord("z")); await h.w.backend.keys.load()
  const controller = h.client.recorder({ kind: "undo" }), bridge = recorderEvents(h.element, controller)
  try {
    controller.dispatch({ kind: "start" }); key(h.button, "KeyZ", "z", { altKey: true })
    expect(controller.view().conflict?.observations).toEqual([{ target: { kind: "picker" }, key: chord("z"), sites: ["www"] }])
    controller.dispatch({ kind: "cancel" }); expect(h.w.settings().shortcuts.picker).toEqual(chord("z")); expect(h.w.settings().undoKey).toBeNull()
    controller.dispatch({ kind: "start" }); key(h.button, "KeyZ", "z", { altKey: true })
    await controller.dispatch({ kind: "use-here" }).completed
    expect(h.w.settings().undoKey).toEqual(chord("z")); expect(h.w.settings().shortcuts.picker).toBeNull()
  } finally { bridge.destroy(); await h.dispose() }
})

test("Add immediately records and opens the supplied current-account chooser only after the committed key", async () => {
  const h = await mounted()
  const added = await h.client.add()
  if (added.kind !== "recording") throw Error("Expected added shortcut recording")
  const bridge = recorderEvents(h.element, added.controller)
  try {
    expect(added.controller.view().recorder.kind).toBe("recording"); expect(h.choices).toEqual([])
    const answer = nextAnswer(added.controller); key(h.button, "KeyZ", "z", { altKey: true }); await answer
    await added.controller.commandRead
    expect(h.w.settings().shortcuts.list.at(-1)?.key).toEqual(chord("z"))
    expect(h.choices).toEqual(["new001"])
  } finally { bridge.destroy(); await h.dispose() }
})

test("unavailable native command keys remain visibly incomplete and never masquerade as a successful empty read", async () => {
  const h = await mounted()
  const client = createKeySettingsClient({ backend: h.w.backend, platform: { browser: "chrome", os: "linux" },
    commands: { async read() { return { kind: "unavailable" } } }, chooser: { async open() {} } })
  try { await client.ready; const controller = client.recorder({ kind: "undo" }); await controller.commandRead; expect(controller.view().commands).toBe("unavailable") }
  finally { client.dispose(); await h.dispose() }
})
