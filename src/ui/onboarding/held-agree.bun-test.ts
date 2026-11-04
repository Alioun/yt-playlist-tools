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
function heldPage(paused: number, sent: HeldPayload[], opened: string[], features: "on" | "held" = "on") {
  const scripted = createScriptedBackend({
    build,
    deadline: () => () => {},
    answers: [],
    records: { schema: 1, device: { id: "d", consent: null, syncOn: false } } as never,
    respond: {
      "ui.heldAgree": payload => {
        sent.push(payload)
        return payload.action === "read" ? { kind: "held", paused } : { kind: "agreed", paused, features }
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

test("with work withdrawal paused, the page says Agree leaves it paused, and afterwards says Perchling is on again and points to Settings", async () => {
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
  expect(screen.getByText("Perchling is on again.")).toBeTruthy()
  expect(screen.getByText(paused)).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Open Settings" }))
  expect(opened).toEqual(["privacy"])
})

test("with nothing paused, agreeing again says Perchling is on again", async () => {
  heldPage(0, [], [])
  await userEvent.click(await screen.findByRole("button", { name: "Agree" }, { timeout: 5000 }))
  expect(await screen.findByText("Perchling is on again.", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.queryByText(/stay paused|stays paused/)).toBeNull()
  expect(screen.queryByRole("button", { name: "Open Settings" })).toBeNull()
})

test("when paused work still holds the features, agreeing again says they stay off until it continues in Settings", async () => {
  const opened: string[] = []
  heldPage(1, [], opened, "held")
  await userEvent.click(await screen.findByRole("button", { name: "Agree" }, { timeout: 5000 }))
  expect(await screen.findByText("Your features stay off until you continue the paused changes in Settings.", {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.queryByText("Perchling is on again.")).toBeNull()
  await userEvent.click(screen.getByRole("button", { name: "Open Settings" }))
  expect(opened).toEqual(["privacy"])
})
