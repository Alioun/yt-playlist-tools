import { expect, test } from "bun:test"
import { render, screen, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { flushSync } from "svelte"
import { browser } from "wxt/browser"
import Pilot from "../../tools/fixtures/svelte-pilot/components/Pilot.svelte"

test("a Svelte component updates visible state from a TypeScript rune module", async () => {
  render(Pilot, { portalTarget: document.body })
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Count 0" }))
  flushSync()
  expect(screen.getByRole("button", { name: "Count 1" })).toBeVisible()
})

test("Bits UI opens and closes a popover within a styled shadow root", async () => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = host.attachShadow({ mode: "open" })
  const target = document.createElement("div")
  root.append(target)
  try {
    render(Pilot, { target, props: { portalTarget: target } })
    const view = within(target)
    const trigger = view.getByRole("button", { name: "Open pilot popover" })
    await userEvent.setup().click(trigger)
    flushSync()
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(view.getByText("Svelte pilot popover")).toBeVisible()
    expect(root.querySelector("style")?.textContent).toContain("rgb(20, 80, 140)")
    expect(document.body.querySelector(".pilot-popover")).toBeNull()
    await userEvent.setup().click(view.getByRole("button", { name: "Close pilot popover" }))
    flushSync()
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(view.queryByText("Svelte pilot popover")).toBeNull()
  } finally {
    host.remove()
  }
})

test("the ordered preloads provide a YouTube DOM and a fake WXT browser", async () => {
  expect(location.origin).toBe("https://www.youtube.com")
  await browser.storage.local.set({ pilot: "synthetic" })
  expect(await browser.storage.local.get("pilot")).toEqual({ pilot: "synthetic" })
})

test("the preload resets fake browser storage before each test", async () => {
  expect(await browser.storage.local.get("pilot")).toEqual({})
  expect(screen.queryByRole("button", { name: /^Count/ })).toBeNull()
})
