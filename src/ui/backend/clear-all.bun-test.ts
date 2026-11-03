import { expect, test } from "bun:test"
import { clearFixture } from "../../../tools/fixtures/clear-all/harness"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { clearAllAvailability, clearAllNotice, createClearAllConfirmation } from "./clear-all"

const keptText = "Cleared on this browser. Your synced settings stay as the newer version of Perchling saved them. Update Perchling here to clear them too."

test("a newer layout that has synced offers the checkbox, and a ticked clear says synced settings were left", async () => {
  const records = { schema: 2, device: { syncOn: true }, future: { keep: true } }
  const availability = clearAllAvailability(records)
  expect(availability).toEqual({ kind: "newer-layout", localClear: true, checkbox: true, tickedPolicy: "local-only" })
  const h = clearFixture(records)
  const wire = await h.wire()
  try {
    const synced = h.shared.records()
    const model = createClearAllConfirmation(wire.backend, availability)
    model.open()
    await model.select(true)
    expect(model.state()).toEqual({ kind: "editing", alsoSynced: true })
    await model.review()
    const answer = await model.confirm()
    expect(answer).toMatchObject({ kind: "clear-result", scope: "local", erasure: "confirmed", outcome: "cleared", synced: "kept-newer-layout" })
    expect(answer && clearAllNotice(answer, englishI18n())).toBe(keptText)
    expect(h.records()).toEqual({ schema: 1 })
    expect(h.shared.records()).toEqual(synced)
  } finally {
    wire.dispose()
    await h.dispose()
  }
})

test("an unticked clear under a newer layout shows no synced-settings notice", async () => {
  const h = clearFixture({ schema: 2, future: { keep: true } })
  const wire = await h.wire()
  try {
    const answer = await h.confirm(wire.backend, false)
    expect(answer).toMatchObject({ kind: "clear-result", scope: "local", outcome: "cleared" })
    expect(clearAllNotice(answer, englishI18n())).toBeNull()
  } finally {
    wire.dispose()
    await h.dispose()
  }
})

test("a newer layout with no sign of sync hides the checkbox", () => {
  expect(clearAllAvailability({ schema: 2 })).toEqual({ kind: "newer-layout", localClear: true, checkbox: false, tickedPolicy: "local-only" })
})
