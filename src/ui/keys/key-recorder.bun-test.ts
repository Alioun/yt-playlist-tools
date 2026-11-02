import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { defaultSettings } from "../../shared/model"
import type { KeySettingAnswer, KeySettingChange } from "../../shared/contracts/key-settings"
import { createKeyRecorderController } from "./controller"
import KeyRecorder from "./KeyRecorder.svelte"
import { keyRecorderText } from "./text"

afterEach(() => cleanup())
const text = keyRecorderText(englishI18n())

function recorder(answer: (change: KeySettingChange) => KeySettingAnswer) {
  const sent: KeySettingChange[] = []
  let settings = defaultSettings()
  const controller = createKeyRecorderController({
    target: { kind: "undo" }, platform: { browser: "chrome", os: "windows" }, text,
    commands: { read: async () => ({ kind: "available", keys: [] }) },
    settings: () => settings,
    async send(change) {
      sent.push(change)
      const result = answer(change)
      if (result.kind === "confirmed" && change.kind === "key") settings = { ...settings, undoKey: change.key && { ...change.key } }
      return result
    }
  })
  render(KeyRecorder, { controller, text, title: "Undo key", targetName: () => "Playlist shortcut", os: "windows", browser: "Chrome" })
  return sent
}
// happy-dom reports AltGraph whenever Alt is held; a browser's Alt+Y doesn't.
function key(type: "keydown" | "keyup", key: string, code: string, modifiers: { altKey?: boolean } = {}) {
  const event = new KeyboardEvent(type, { key, code, bubbles: true, ...modifiers })
  Object.defineProperty(event, "getModifierState", { value: (state: string) => state === "Alt" && modifiers.altKey === true })
  return fireEvent(window, event)
}
const press = (name: string, code: string, modifiers: { altKey?: boolean } = {}) => key("keydown", name, code, modifiers)

test("recording shows Press keys, saves the pressed key at once and shows it as keycaps", async () => {
  const sent = recorder(change => ({ kind: "confirmed", change, status: "changed" }))
  expect(screen.getByRole("button", { name: "Record Undo key" }).textContent).toBe("Alt+U")
  await userEvent.click(screen.getByRole("button", { name: "Record Undo key" }))
  expect(await screen.findByText("Press keys…")).toBeTruthy()
  expect(screen.getByText("Esc to cancel")).toBeTruthy()
  await press("y", "KeyY", { altKey: true })
  await key("keyup", "y", "KeyY", { altKey: true })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ kind: "key", target: { kind: "undo" }, key: { code: "KeyY", alt: true } })
  expect(await screen.findByText("Alt+Y")).toBeTruthy()
})

test("a refused press keeps it recording with the reason, and Esc keeps the old key", async () => {
  const sent = recorder(change => ({ kind: "confirmed", change, status: "changed" }))
  await userEvent.click(screen.getByRole("button", { name: "Record Undo key" }))
  await press("Enter", "Enter")
  expect(await screen.findByText("Enter and Space can't be used alone, because they press buttons.")).toBeTruthy()
  await press("Escape", "Escape")
  expect(await screen.findByText("Alt+U")).toBeTruthy()
  expect(sent).toEqual([])
})

test("Clear asks for no key, and a refused save says why", async () => {
  recorder(() => ({ kind: "refused", reason: "sync-full" }))
  await userEvent.click(screen.getByRole("button", { name: "Clear Undo key" }))
  expect(await screen.findByText("Settings sync is full. Free some space, then try again.")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Record Undo key" }).textContent).toBe("Alt+U")
})
