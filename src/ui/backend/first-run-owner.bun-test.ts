import { expect, test } from "bun:test"
import { englishFirstRunText } from "../../../tools/fixtures/localization/scripted"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { createFirstRunOwner, type FirstRunServices } from "./first-run-owner"
import { createScriptedBackend } from "./scripted"

const build = (() => { const value = "first-run-owner"; if (!isBuildId(value)) throw Error("build"); return value })()
const acct = "AAAAAAAAAAAAAAAA" as never
const stamped = (data: object) => ({ v: 1, gen: "g", at: 1, by: "device", data }) as never

async function agreed(services: Partial<FirstRunServices["chooser"]>, selected: ("quick-save" | "auto-add")[]) {
  const scripted = createScriptedBackend({ build, deadline: () => () => {}, answers: [], records: {
    schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:settings": stamped({ quickSave: { on: true, feedback: true }, autoAdd: { on: true, feedback: true } }),
    [`doc:setup:${acct}`]: stamped({ quickSave: "PLa", autoAdd: [{ pl: "PLb", takes: "videos" }] })
  }, respond: { "ui.change": payload => ({ kind: "agreement", outcome: { kind: "agreed", attempt: (payload.change as { attempt: number }).attempt,
    applications: selected.map(feature => ({ feature, state: "enabled" })) } }) } })
  const titles: Record<string, string> = { PLa: "Later", PLb: "Songs" }
  const text = englishFirstRunText()
  const owner = createFirstRunOwner(scripted.backend, {
    account: { read: async () => ({ kind: "account", key: acct, account: { name: "Ann" } }) },
    playlists: { title: async (_acct, id) => titles[id] },
    chooser: { choose: async () => ({ kind: "unavailable" }), ...services },
    open: () => {}
  }, { browser: "chrome", os: "linux" }, text)
  const answer = await owner.agree({ displayed: text.disclosure, attempt: 1, selected, syncOn: false, permissions: Promise.resolve({ music: false, browserMenu: false }) })
  expect(answer.kind).toBe("agreed")
  return owner
}

test("a destination the picker saved itself is read back with its title, and nothing is written twice", async () => {
  const owner = await agreed({ choose: async () => ({ kind: "saved", destination: { kind: "quick-save" } }) }, ["quick-save"])
  expect(await owner.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })).toEqual({ kind: "confirmed", selection: { kind: "chosen", titles: ["Later"] } })
})

test("auto-add's list opens through manage and step 3 reads its playlists back", async () => {
  let opened = 0
  const owner = await agreed({ manage: async () => { opened++ } }, ["auto-add"])
  expect(await owner.choosePlaylist({ feature: "auto-add", purpose: "auto-add" })).toEqual({ kind: "confirmed", selection: { kind: "chosen", titles: ["Songs"] } })
  expect(opened).toBe(1)
})

test("without a list, auto-add still says the picker is unavailable", async () => {
  const owner = await agreed({}, ["auto-add"])
  expect(await owner.choosePlaylist({ feature: "auto-add", purpose: "auto-add" })).toEqual({ kind: "failed", reason: "picker-unavailable" })
})
