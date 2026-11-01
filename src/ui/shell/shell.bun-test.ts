import { afterEach, expect, test } from "bun:test"
import { cleanup, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import type { JsonObject } from "../../shared/contracts/json"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createScriptedBackend } from "../backend/scripted"
import PageShell from "./PageShell.svelte"

const build = (() => { const value = "shell-test"; if (!isBuildId(value)) throw Error("build"); return value })()
afterEach(() => cleanup())

function page(records: JsonObject) {
  const opened: string[] = []
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [], records })
  return { opened, page: { backend: scripted.backend, i18n: englishI18n(), platform: { browser: "chrome", os: "linux" } as const,
    openSettings: () => { opened.push("settings") }, openFirstRun: () => { opened.push("first-run") } } }
}

test("before consent the popup says it's waiting for the user's OK, and Review opens first run", async () => {
  const shell = page({ schema: 1, device: { id: "device", consent: null, syncOn: false } })
  render(PageShell, { page: shell.page, markSrc: "mark.svg", kind: "popup" })
  expect(await screen.findByText("Waiting for your OK")).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Review" }))
  await userEvent.click(screen.getByRole("button", { name: "Settings" }))
  expect(shell.opened).toEqual(["first-run", "settings"])
})

test("after consent the settings page lists the features that are on, with their footprint", async () => {
  const shell = page({ schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:settings": { v: 1, gen: "settings", at: 1, by: "device", data: { queueButton: { on: true, feedback: true } } } })
  render(PageShell, { page: shell.page, markSrc: "mark.svg", kind: "settings" })
  expect(await screen.findByText("Queue button on thumbnails")).toBeTruthy()
  expect(screen.getByText("Adds buttons to the page")).toBeTruthy()
  expect(screen.queryByText("Waiting for your OK")).toBeNull()
})
