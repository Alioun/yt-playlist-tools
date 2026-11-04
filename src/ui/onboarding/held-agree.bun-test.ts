import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { englishFirstRunText, englishI18n } from "../../../tools/fixtures/localization/scripted"
import type { UiMessages } from "../../shared/contracts/ui"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend } from "../backend/scripted"
import { PageState } from "../lib/page-state.svelte"
import OnboardingPage from "./OnboardingPage.svelte"

const build = (() => {
  const value = "held-test"
  if (!isBuildId(value)) throw Error("build")
  return value
})()
afterEach(() => cleanup())

type HeldPayload = UiMessages["ui.heldAgree"]["payload"]
function heldPage(paused: number, sent: HeldPayload[], opened: string[]) {
  const scripted = createScriptedBackend({
    build,
    deadline: () => () => {},
    answers: [],
    records: { schema: 1, device: { id: "d", consent: null, syncOn: false } } as never,
    respond: {
      "ui.heldAgree": payload => {
        sent.push(payload)
        return payload.action === "read" ? { kind: "held", paused } : { kind: "agreed", paused }
      }
    }
  })
  const page = {
    backend: scripted.backend,
    i18n: englishI18n(),
    platform: { browser: "chrome", os: "linux" },
    private: false,
    version: "2.0.0",
    beta: false,
    open() {},
    openSettings(hash?: string) {
      opened.push(hash ?? "")
    },
    openFirstRun() {},
    applyTheme() {},
    commands: { read: async () => ({ kind: "unavailable" }), named: async () => null }
  }
  render(OnboardingPage, { pageState: new PageState(page as never), owner: {} as never, text: englishFirstRunText(), markSrc: "m" })
}

test("with work withdrawal paused, the page says Agree leaves it paused, and afterwards points to Settings instead of a restart", async () => {
  const sent: HeldPayload[] = [],
    opened: string[] = []
  heldPage(2, sent, opened)
  expect(await screen.findByRole("heading", { name: "Before you continue" }, { timeout: 5000 })).toBeTruthy()
  const paused = "2 changes that stopped when you withdrew stay paused until you continue them in Settings, under Waiting for your review."
  expect(screen.getByText(paused)).toBeTruthy()
  expect(screen.queryByRole("checkbox")).toBeNull()

  await userEvent.click(screen.getByRole("button", { name: "Agree" }))
  expect(await screen.findByText("You agreed again.", {}, { timeout: 5000 })).toBeTruthy()
  expect(sent).toEqual([{ action: "read" }, { action: "agree", displayedVersion: 1 }])
  expect(screen.getByText(paused)).toBeTruthy()
  expect(screen.queryByText(/next time it starts/)).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Open Settings" }))
  expect(opened).toEqual(["privacy"])
})

test("with nothing paused, agreeing again says when the features come back", async () => {
  heldPage(0, [], [])
  await userEvent.click(await screen.findByRole("button", { name: "Agree" }, { timeout: 5000 }))
  expect(await screen.findByText("Perchling turns your features back on the next time it starts, such as when you restart the browser.", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.queryByText(/stay paused|stays paused/)).toBeNull()
})
