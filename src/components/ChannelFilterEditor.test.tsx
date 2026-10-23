import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { ChannelFilterEditor } from "@/components/ChannelFilterEditor"
import type { ChannelLookup } from "@/lib/youtube"

it("does not add a lookup result after the editor unmounts for an account change", async () => {
  let finish: ((value: ChannelLookup) => void) | undefined
  const waiting = new Promise<ChannelLookup>(resolve => { finish = resolve })
  const add = vi.fn()
  const editor = render(<ChannelFilterEditor filter={{ mode: "allow", enabled: true, channels: [] }} labels={{}}
    current={{ status: "none" }} onSettingChange={vi.fn()} onAdd={add} onRemove={vi.fn()} onLookUp={() => waiting} />)
  await userEvent.type(screen.getByRole("textbox", { name: "Channel to add" }), "@channel")
  await userEvent.click(screen.getByRole("button", { name: /^Add$/ }))
  editor.unmount()
  await act(async () => {
    finish?.({ status: "found", channel: { channelId: "UCabcdefghijklmnopqrstuv", title: "Previous account channel" } })
    await waiting
  })
  expect(add).not.toHaveBeenCalled()
})
