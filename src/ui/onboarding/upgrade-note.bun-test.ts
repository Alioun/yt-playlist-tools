import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { englishFirstRunText, englishI18n } from "../../../tools/fixtures/localization/scripted"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend } from "../backend/scripted"
import { PageState } from "../lib/page-state.svelte"
import OnboardingPage from "./OnboardingPage.svelte"

const build = (() => { const value = "note-test"; if (!isBuildId(value)) throw Error("build"); return value })()
afterEach(() => cleanup())
const details = { from: "1.4.5", autoAdd: { kept: 3, dropped: 0 }, pct: { value: 50, wasUnset: true, authorised: true }, feedback: true,
  shortcut: { raw: "Alt+W", key: { code: "KeyW", char: "w", ctrl: false, alt: true, shift: false, meta: false }, playlist: true, note: "ok" }, credentialsDeleted: true }

function note(sent: unknown[]) {
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [],
    records: { schema: 1, device: { id: "d", consent: null, syncOn: false, upgradeNote: { state: "pending", details, opened: true, seen: false, reopened: false } } } as never,
    respond: {
      "ui.noteSeen": () => { sent.push("seen"); return { kind: "noted" } },
      "ui.noteAgree": payload => { sent.push(payload.change); return { kind: "agreed", attempt: payload.change.attempt, applications: [] } }
    } })
  const page = { backend: scripted.backend, i18n: englishI18n(), platform: { browser: "chrome", os: "windows" }, private: false, version: "2.0.0", beta: false,
    open() {}, openSettings() {}, openFirstRun() {}, applyTheme() {}, commands: { read: async () => ({ kind: "unavailable" }), named: async () => null } }
  const pageState = new PageState(page as never)
  render(OnboardingPage, { pageState, owner: {} as never, text: englishFirstRunText(), markSrc: "m" })
}

test("a pending note shows what carried over, paused, and asks the 1.4.5 question with starting-to-play first", async () => {
  const sent: unknown[] = []
  note(sent)
  expect(await screen.findByRole("heading", { name: "YouTube Playlist Tools is now Perchling" }, { timeout: 5000 })).toBeTruthy()
  expect(screen.getByText("Adds to the 3 playlists you chose in 1.x.")).toBeTruthy()
  expect(screen.getByText("Alt+W saves the video you're watching, or pointing at, to the playlist you chose in 1.x.")).toBeTruthy()
  expect((screen.getByRole("radio", { name: "As soon as a video starts playing, like 1.4.5 did" }) as HTMLInputElement).checked).toBe(true)
  expect(sent).toEqual(["seen"])
})

test("Agree turns on the kept features with the question's answer, then shows the outcome in place", async () => {
  const sent: unknown[] = []
  note(sent)
  await userEvent.click(await screen.findByRole("radio", { name: "Once half of it is watched, as 1.4.5 showed" }, { timeout: 5000 }))
  await userEvent.click(screen.getByRole("button", { name: "Agree and turn on 2 features" }))
  expect(await screen.findByText(/You're all set\./, {}, { timeout: 5000 })).toBeTruthy()
  expect(sent[1]).toEqual({ displayedVersion: 1, attempt: 1, selected: ["auto-add", "shortcuts"], syncOn: false, percentage: "half" })
})
