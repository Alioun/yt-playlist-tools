import { afterEach, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { createRawSnippet, flushSync } from "svelte"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { chooserSource, NOW, playlist, settle } from "../../../tools/fixtures/picker-model/fake-source"
import { PickerModel } from "../../shared/picker/model.svelte"
import { createPickerText } from "../picker/text"
import AutoAddList from "./AutoAddList.svelte"
import ChannelFilterEditor from "./ChannelFilterEditor.svelte"
import PercentField from "./PercentField.svelte"
import SiteTabs from "./SiteTabs.svelte"
import Switch from "./Switch.svelte"

afterEach(() => cleanup())
const i18n = englishI18n()

test("a held switch stays on, reads as checked and names its reason", () => {
  render(Switch, { checked: true, held: true, label: "Auto-add", describedby: "why", onchange: () => {} })
  const control = screen.getByRole("switch", { name: "Auto-add" })
  expect(control).toHaveAttribute("aria-checked", "true")
  expect(control).toHaveAttribute("data-held")
  expect(control).toHaveAttribute("aria-describedby", "why")
})

test("site tabs move with the arrow keys and mark the site the popup opened on", async () => {
  const onselect = mock((_: string) => {})
  render(SiteTabs, { selected: "www", opened: "music", labels: { www: "YouTube", music: "YouTube Music" }, panel: "panel", onselect })
  const youtube = screen.getByRole("tab", { name: "YouTube" })
  expect(youtube).toHaveAttribute("aria-selected", "true")
  expect(screen.getByRole("tab", { name: "YouTube Music" }).querySelector("[data-opened]")).not.toBeNull()
  youtube.focus()
  await userEvent.keyboard("{ArrowRight}")
  expect(onselect).toHaveBeenCalledWith("music")
})

test("the percent field saves on Enter, puts back out-of-range input, and the slider saves on release", async () => {
  const onsave = mock((_: number) => {})
  render(PercentField, { value: 50, label: "Required", start: "As soon as it starts playing", full: "Only when watched in full", onsave })
  const field = screen.getByRole("textbox", { name: "Required" }) as HTMLInputElement
  await userEvent.clear(field)
  await userEvent.type(field, "140{Enter}")
  expect(onsave).not.toHaveBeenCalled()
  expect(field.value).toBe("50")
  await userEvent.clear(field)
  await userEvent.type(field, "75{Enter}")
  expect(onsave).toHaveBeenCalledWith(75)
  const slider = screen.getByRole("slider", { name: "Required" })
  await fireEvent.input(slider, { target: { value: "20" } })
  expect(onsave).toHaveBeenCalledTimes(1)
  await fireEvent.change(slider, { target: { value: "20" } })
  expect(onsave).toHaveBeenLastCalledWith(20)
})

test("switching a filter's mode with channels listed asks first, then clears them", async () => {
  const onsetting = mock(async (_desired: unknown, _clear: boolean) => true)
  render(ChannelFilterEditor, {
    i18n,
    playlist: "Later",
    onsetting,
    filter: {
      mode: "allow",
      on: true,
      channels: [
        ["UCaaaaaaaaaaaaaaaaaaaaaa", "Tiny Science", "@tinyscience"],
        ["UCbbbbbbbbbbbbbbbbbbbbbb", "Two"]
      ]
    }
  })
  expect(screen.getByText("Tiny Science · @tinyscience")).toBeTruthy()
  await userEvent.click(screen.getByRole("radio", { name: "Deny" }))
  expect(screen.getByText("Switch to Deny? This clears its 2 allowed channels.")).toBeTruthy()
  expect(onsetting).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "Switch" }))
  expect(onsetting).toHaveBeenCalledWith({ mode: "deny", on: true }, true)
})

test("a switched-off filter says its channels are kept, and an empty allow list warns", async () => {
  const off = render(ChannelFilterEditor, { i18n, playlist: "Later", onsetting: async () => true, filter: { mode: "deny", on: false, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Tiny Science"]] } })
  expect(screen.getByText("Off, so every channel gets in. It keeps its 1 denied channel for when you turn it back on.")).toBeTruthy()
  off.unmount()
  render(ChannelFilterEditor, { i18n, playlist: "Later", onsetting: async () => true, filter: { mode: "allow", on: true, channels: [] } })
  expect(screen.getByText("With no channels listed, nothing goes into Later.")).toBeTruthy()
})

test("a channel add shows the lookup's error in place and keeps the typed text", async () => {
  render(ChannelFilterEditor, { i18n, playlist: "Later", onsetting: async () => true, filter: null, onadd: async () => ({ kind: "error", message: "Couldn't find that channel on YouTube." }) })
  await userEvent.type(screen.getByRole("textbox", { name: "@handle or channel link" }), "@nobody")
  await userEvent.click(screen.getByRole("button", { name: "Add" }))
  expect(await screen.findByText("Couldn't find that channel on YouTube.")).toBeTruthy()
  expect((screen.getByRole("textbox", { name: "@handle or channel link" }) as HTMLInputElement).value).toBe("@nobody")
})

test("the auto-add list ticks through the model and opens a ticked playlist's options with its summary", async () => {
  const alpha = playlist("PLalpha"),
    beta = playlist("PLbeta")
  const { source, ledger } = chooserSource({ chosen: [alpha] })
  const picker = new PickerModel({ source, site: "www", mode: "many" })
  const ontakes = mock(async () => true)
  const filter = createRawSnippet(() => ({ render: () => "<p>filter editor</p>" }))
  render(AutoAddList, {
    picker,
    text: createPickerText(i18n),
    i18n,
    variant: "popup",
    defaultPct: 50,
    ontakes,
    onpct: async () => true,
    filter,
    options: new Map([[alpha, { takes: "both", pct: 30 }]]),
    filters: new Map([[alpha, { mode: "allow", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "A"]] }]])
  })
  ledger.answer("cachedList", {
    rows: [
      { id: alpha, title: "Alpha", privacy: "PRIVATE", count: 1 },
      { id: beta, title: "Beta", privacy: "PRIVATE", count: 2 }
    ],
    at: NOW
  })
  await settle()
  flushSync()
  expect(screen.getByRole("checkbox", { name: /Alpha/ })).toHaveAttribute("aria-checked", "true")
  expect(screen.getByText("Shorts too · Allow only · 1 · 30 %")).toBeTruthy()
  await userEvent.click(screen.getByRole("checkbox", { name: /Beta/ }))
  expect(ledger.calls("choose")).toEqual([[beta, true]])
  await userEvent.click(screen.getByRole("button", { name: "Options for Alpha" }))
  expect(screen.getByText("filter editor")).toBeTruthy()
  await userEvent.click(screen.getByRole("radio", { name: "Videos" }))
  expect(ontakes).toHaveBeenCalledWith(alpha, "videos")
})

test("auto-add search keeps focus and can clear a query that leaves one or no matches", async () => {
  const { source, ledger } = chooserSource()
  const picker = new PickerModel({ source, site: "www", mode: "many" })
  render(AutoAddList, {
    picker,
    text: createPickerText(i18n),
    i18n,
    variant: "popup",
    defaultPct: 50,
    ontakes: async () => true,
    onpct: async () => true,
    filter: createRawSnippet(() => ({ render: () => "<p>filter editor</p>" })),
    options: new Map(),
    filters: new Map()
  })
  ledger.answer("cachedList", { rows: Array.from({ length: 12 }, (_, index) => ({ id: playlist(`PL${index}`), title: `Playlist ${index}` })), at: NOW })
  await settle()
  const user = userEvent.setup()
  const search = screen.getByRole("searchbox", { name: "Search playlists" })
  await user.type(search, "11")
  expect(screen.getByRole("searchbox", { name: "Search playlists" })).toBe(search)
  expect(search).toHaveFocus()
  expect(screen.getAllByRole("checkbox")).toHaveLength(1)
  await user.type(search, "missing")
  expect(search).toHaveFocus()
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
  expect(screen.getByRole("status")).toHaveTextContent(createPickerText(i18n).label("emptySearch"))
  await user.clear(search)
  expect(screen.getAllByRole("checkbox")).toHaveLength(12)
  picker.close()
})

test("a refused auto-add choice explains the failure beside its row and can be retried", async () => {
  const alpha = playlist("PLalpha")
  const { source, ledger } = chooserSource()
  const picker = new PickerModel({ source, site: "www", mode: "many" })
  const text = createPickerText(i18n)
  render(AutoAddList, {
    picker,
    text,
    i18n,
    variant: "popup",
    defaultPct: 50,
    ontakes: async () => true,
    onpct: async () => true,
    filter: createRawSnippet(() => ({ render: () => "<p>filter editor</p>" })),
    options: new Map(),
    filters: new Map()
  })
  ledger.answer("cachedList", { rows: [{ id: alpha, title: "Alpha" }], at: NOW })
  await settle()
  const row = screen.getByRole("checkbox", { name: /Alpha/ })
  await userEvent.click(row)
  ledger.answer("choose", { refused: "sync-full" })
  await settle()
  expect(row).toHaveAttribute("aria-checked", "false")
  expect(screen.getByRole("status")).toHaveTextContent(text.refusal["sync-full"])
  expect(row).toHaveAccessibleDescription(text.refusal["sync-full"])
  await userEvent.click(row)
  ledger.answer("choose", { ok: true })
  await settle()
  expect(row).toHaveAttribute("aria-checked", "true")
  expect(screen.queryByText(text.refusal["sync-full"])).toBeNull()
  picker.close()
})
