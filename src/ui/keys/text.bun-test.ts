import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { expect, test } from "bun:test"
import { keyRecorderText } from "./text"

const text = keyRecorderText(englishI18n())

test("the key recorder explains refused presses without a colon", () => {
  expect(text.refusal("plain-enter-space")).toBe("Enter and Space can't be used alone, because they press buttons.")
  expect(text.refusal("ctrl-alt")).toBe("Ctrl+Alt can't be used, because many keyboards type characters with it.")
  expect(text.refusal("reserved")).toBe("That key belongs to the browser and never reaches the page.")
})

test("the key recorder names who already uses a key and what a clash replaces", () => {
  expect(text.conflict("Alt+W", ["Watch later"])).toBe("Watch later already uses Alt+W.")
  expect(text.conflict("Alt+P", ["Music", "Save to playlist (YouTube Music)"])).toBe("Music and Save to playlist (YouTube Music) already use Alt+P.")
  expect(text.warning({ kind: "site", site: "www", action: "Play/pause" }, "K", "Chrome")).toBe("YouTube uses K for Play/pause. This shortcut replaces it on YouTube.")
  expect(text.warning({ kind: "site", site: "music", action: "Toggle queue" }, "Q", "Chrome"))
    .toBe("YouTube Music uses Q for Toggle queue. This shortcut replaces it on YouTube Music.")
  expect(text.warning({ kind: "browser", action: "go to the address bar" }, "Alt+D", "Chrome"))
    .toBe("Chrome uses Alt+D to go to the address bar. This shortcut replaces it on YouTube pages.")
  expect(text.warning({ kind: "command", command: "Save the playing song" }, "Alt+S", "Firefox"))
    .toBe("Your browser uses Alt+S for Save the playing song (Keys from any tab), so this shortcut never reaches the page.")
})

test("the key recorder's refusals from Settings read as plain sentences", () => {
  expect(text.answer("limit")).toBe("You can have up to 20 playlist shortcuts.")
  expect(text.answer("update-needed")).toBe("Update Perchling before you change this key.")
  expect(text.noKey).toBe("No key")
  expect(text.pressKeys).toBe("Press keys…")
})
