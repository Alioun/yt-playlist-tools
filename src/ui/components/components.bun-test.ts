import { englishFirstRunText } from "../../../tools/fixtures/localization/scripted"
import { describe, expect, mock, test } from "bun:test"
import { render, screen } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { createRawSnippet, flushSync } from "svelte"
import Button from "./Button.svelte"
import Disclosure from "./Disclosure.svelte"
import FeatureChoice from "./FeatureChoice.svelte"
import FootprintTag from "./FootprintTag.svelte"
import StepIndicator from "./StepIndicator.svelte"
import Switch from "./Switch.svelte"
import RichText from "./RichText.svelte"
import { richParts } from "../../shared/i18n"

const localized = englishFirstRunText()

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }))

test("structured emphasis escapes markup and preserves text spacing", () => {
  const view = render(RichText, { parts: richParts("[[strong]]<img src=x onerror=bad>[[/strong]] rest") })
  expect(view.container.querySelector("img")).toBeNull()
  expect(view.container.querySelector("strong")?.textContent).toBe("<img src=x onerror=bad>")
  expect(view.container.textContent).toBe("<img src=x onerror=bad> rest")
})

describe("Switch", () => {
  test("asks for the change and keeps showing the held state until the caller changes it", async () => {
    const onchange = mock((_: boolean) => {})
    const view = render(Switch, { checked: false, label: "Settings sync", onchange })
    const control = screen.getByRole("switch", { name: "Settings sync" })
    await userEvent.setup().click(control)
    flushSync()
    expect(onchange).toHaveBeenCalledWith(true)
    expect(control).toHaveAttribute("aria-checked", "false")
    await view.rerender({ checked: true, label: "Settings sync", onchange })
    expect(control).toHaveAttribute("aria-checked", "true")
  })
})

describe("FeatureChoice", () => {
  test("is a named checkbox that stays controlled by its caller", async () => {
    const onchange = mock((_: boolean) => {})
    render(FeatureChoice, { name: "Auto-add", description: "Synthetic line.", footprint: "none", footprintLabel: localized.features.footprintText.none, checked: false, onchange })
    const box = screen.getByRole("checkbox", { name: "Auto-add" })
    expect(box).toHaveAccessibleDescription("Synthetic line. Doesn't change the page")
    await userEvent.setup().click(box)
    flushSync()
    expect(onchange).toHaveBeenCalledWith(true)
    expect(box).toHaveAttribute("aria-checked", "false")
  })

  test("a disabled card cannot change", async () => {
    const onchange = mock((_: boolean) => {})
    render(FeatureChoice, { name: "Gather tabs", description: "Synthetic.", footprint: "none", footprintLabel: localized.features.footprintText.none, checked: false, onchange, disabled: true })
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Gather tabs" }))
    expect(onchange).not.toHaveBeenCalled()
  })
})

describe("Button", () => {
  test("a pending button ignores clicks, stays focusable and says it's busy", async () => {
    const onclick = mock(() => {})
    render(Button, { pending: true, onclick, children: text("Agree") })
    const control = screen.getByRole("button", { name: "Agree" })
    await userEvent.setup().click(control)
    expect(onclick).not.toHaveBeenCalled()
    expect(control).not.toBeDisabled()
    expect(control).toHaveAttribute("aria-busy", "true")
  })

  test("the brand variant is the gradient button", () => {
    render(Button, { variant: "brand", children: text("Agree") })
    expect(screen.getByRole("button", { name: "Agree" }).className).toContain("bg-brand-gradient")
  })
})

describe("Disclosure", () => {
  test.each([
    ["first-run", "Before you start"],
    ["upgrade-note", "Before you continue"],
    ["feature", "Before this feature can run"]
  ] as const)("%s uses its own heading over the same text", (context, heading) => {
    render(Disclosure, { props: { context, text: localized.disclosure, browser: "chrome", size: context === "feature" ? "sm" : "md", level: context === "first-run" ? 1 : 2 } })
    expect(screen.getByRole("heading", { name: heading })).toBeVisible()
    expect(screen.getByText(/your settings also travel through Chrome's own sync\.$/)).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(6)
  })
})

test("footprint tags read exactly", () => {
  render(FootprintTag, { footprint: "right-click", label: localized.features.footprintText["right-click"] })
  expect(screen.getByText("Changes right-click on the page")).toBeVisible()
})

test("the step indicator marks the current step", () => {
  render(StepIndicator, { steps: ["One", "Two", "Three"], current: 2, label: "Setup steps", formatNumber: localized.number })
  expect(screen.getByText("Two").closest("li")).toHaveAttribute("aria-current", "step")
  expect(screen.getByText("One").closest("li")).not.toHaveAttribute("aria-current")
})
