import { expect, mock, test } from "bun:test"
import { render, screen, waitFor } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { isAccountKey } from "../../shared/model"
import { chooserSource } from "../../../tools/fixtures/picker-model/fake-source"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { createPickerText } from "./text"
import type { ChooserRequest, PlaylistChooserProps } from "./types"
import PlaylistChooser from "./PlaylistChooser.svelte"

// The popover chunk is stood in for, so the test sees when PlaylistChooser first imports it (G43).
const mounted: { readonly open: boolean }[] = []
void mock.module(require.resolve("./ChooserPopover.svelte"), () => ({ default: (_anchor: unknown, props: { readonly open: boolean }) => { mounted.push(props) } }))

const account = (key => { if (!isAccountKey(key)) throw new Error("Invalid synthetic account"); return key })("synthetic_acct_1")
const text = createPickerText(englishI18n())
const loaded = () => new Promise(resolve => setTimeout(resolve, 0)).then(() => mounted.length)

function props(overrides: Partial<PlaylistChooserProps> = {}): PlaylistChooserProps {
  return {
    open: false, context: { account, site: "www", private: false, purpose: { kind: "quickSave" } }, current: { kind: "none" },
    label: "Synthetic destination", availability: { kind: "available" }, createSource: () => chooserSource().source, text,
    platform: "linux", onrequest: () => {}, onoutcome: () => {}, onrelease: event => event.picker.close(), ...overrides
  }
}

test("the picker loads when the chooser first opens, not when its button renders or is pressed", async () => {
  const onrequest = mock((_: ChooserRequest) => {})
  const view = render(PlaylistChooser, { props: props({ onrequest }) })
  await userEvent.setup().click(screen.getByRole("button", { name: "Synthetic destination: No playlist chosen" }))
  expect(onrequest).toHaveBeenCalledWith({ kind: "open" })
  expect(await loaded()).toBe(0)
  await view.rerender(props({ onrequest, open: true }))
  await waitFor(() => expect(mounted.map(part => part.open)).toEqual([true]))
  await view.rerender(props({ onrequest, open: false }))
  await view.rerender(props({ onrequest, open: true }))
  expect(await loaded()).toBe(1)
  view.unmount()
})

test("a disabled chooser asked to open never loads the picker", async () => {
  mounted.length = 0
  render(PlaylistChooser, { props: props({ open: true, availability: { kind: "disabled", explanation: "Sign in first." } }) })
  expect(screen.getByRole("button", { name: "Synthetic destination: No playlist chosen" })).toBeDisabled()
  expect(await loaded()).toBe(0)
})
