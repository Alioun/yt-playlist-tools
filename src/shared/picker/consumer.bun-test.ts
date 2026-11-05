import { expect, test } from "bun:test"
import { render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { flushSync } from "svelte"
import Consumer from "../../../tools/fixtures/picker-model/Consumer.svelte"
import { entry, itemSource, NOW, playlist, settle, undoing } from "../../../tools/fixtures/picker-model/fake-source"
import { PickerModel } from "./model.svelte"

const WL = playlist("WL")
const ROAD = playlist("PLroad")
const items = () => screen.getAllByRole("listitem").map(item => item.textContent?.trim())

test("a compiled Svelte container renders cached rows, then membership checks, then a tick's result and a search", async () => {
  const { source, ledger } = itemSource()
  const picker = new PickerModel({ source, site: "www", mode: "save" })
  render(Consumer, { props: { picker } })
  ledger.answer("cachedList", {
    at: NOW,
    rows: [
      { id: ROAD, title: "Road trip" },
      { id: WL, title: "Watch later" }
    ]
  })
  await settle()
  flushSync()
  expect(items()).toEqual(["Watch later", "Road trip"])
  const road = screen.getByRole("button", { name: "Road trip" })
  expect(road.closest("li")).toHaveAttribute("data-check", "loading")
  ledger.answer("membership", {
    kind: "read",
    rows: [
      { id: WL, title: "Watch later", contains: true },
      { id: ROAD, title: "Road trip", contains: false }
    ]
  })
  await settle()
  flushSync()
  expect(screen.getByTestId("membership")).toHaveTextContent("in 1")
  const user = userEvent.setup()
  await user.click(road)
  flushSync()
  expect(road).toHaveAttribute("aria-busy", "true")
  ledger.answer("add", { kind: "added", entry: entry("sv-road"), undo: undoing() })
  await settle()
  flushSync()
  expect(road).toHaveAttribute("aria-pressed", "true")
  expect(road.closest("li")).toHaveAttribute("data-status", "added")
  expect(screen.getByTestId("membership")).toHaveTextContent("in 2")
  await user.type(screen.getByLabelText("Search playlists"), "watch")
  flushSync()
  expect(items()).toEqual(["Watch later"])
  expect(ledger.calls("add")).toEqual([[ROAD]])
  picker.close()
})

test("a choose consumer renders fresh membership independently of selected checks", async () => {
  const { source, ledger } = itemSource({ chosen: [ROAD] })
  const picker = new PickerModel({ source, site: "www", mode: "choose" })
  render(Consumer, { props: { picker } })
  ledger.answer("cachedList", {
    at: NOW,
    rows: [
      { id: ROAD, title: "Road trip" },
      { id: WL, title: "Watch later" }
    ]
  })
  await settle()
  flushSync()
  expect(screen.getByTestId("membership")).toHaveTextContent("checking")
  expect(screen.getByRole("button", { name: "Road trip" })).toHaveAttribute("aria-pressed", "true")
  ledger.answer("membership", {
    kind: "read",
    rows: [
      { id: WL, title: "Watch later", contains: true },
      { id: ROAD, title: "Road trip", contains: false }
    ]
  })
  await settle()
  flushSync()
  expect(screen.getByTestId("membership")).toHaveTextContent("in 1")
  expect(screen.getByRole("button", { name: "Watch later" })).toHaveAttribute("aria-pressed", "false")
  expect(screen.getByRole("button", { name: "Road trip" })).toHaveAttribute("aria-pressed", "true")
  picker.close()
})
