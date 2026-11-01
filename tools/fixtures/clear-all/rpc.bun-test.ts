import { expect, test } from "bun:test"
import { clearFixture, agreedSeed, check } from "./harness"
import { createClearAllConfirmation, clearAllAvailability } from "../../../src/ui/backend/clear-all"
import { clearAllText, clearAllCheckboxText } from "../../../src/shared/contracts/clear-all"

for (const privacy of [false, true, undefined]) for (const agreed of [false, true]) {
  test(`authenticated Settings Backend privacy ${String(privacy)} consent ${agreed}`, async () => {
    const h = clearFixture(agreed ? agreedSeed() : { schema: 1 })
    h.private(privacy)
    const wire = await h.wire()
    try {
      const answer = await h.confirm(wire.backend, false)
      check(answer.kind === "clear-result", "real composed Backend result")
      expect(answer.erasure).toBe("confirmed")
      expect(answer.firstRun).toBe("opened")
      expect(h.calls.filter(call => call.operation.startsWith("sync."))).toEqual([])
      expect(wire.network.trace().filter(row => row.event === "sent").length).toBe(2)
    } finally { wire.dispose(); await h.dispose() }
  })
}

for (const page of ["popup", "content"] as const) test(`${page} cannot claim Settings clear authority`, async () => {
  const h = clearFixture(), wire = await h.wire(page)
  try {
    expect((await wire.backend.clearAll({ action: "review", alsoSynced: false })).kind).toBe("failed")
    expect(h.calls.filter(call => call.operation === "teardown")).toEqual([])
  } finally { wire.dispose(); await h.dispose() }
})

test("missing confirmation cannot invoke the real supervisor", async () => {
  const h = clearFixture(), wire = await h.wire()
  try {
    expect(await wire.backend.clearAll({ action: "confirm", review: "forged", alsoSynced: false }), "missing confirmation refuses clear")
      .toEqual({ kind: "answered", result: { kind: "unavailable", reason: "confirmation" } })
    expect(h.counts().databases).toBe(0)
  } finally { wire.dispose(); await h.dispose() }
})

test("review confirmation binds checkbox scope and cannot be reused", async () => {
  const h = clearFixture(), wire = await h.wire()
  try {
    const review = await wire.backend.clearAll({ action: "review", alsoSynced: false })
    check(review.kind === "answered" && review.result.kind === "reviewed", "review")
    const token = review.result.review
    expect(await wire.backend.clearAll({ action: "confirm", review: token, alsoSynced: true })).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "scope" } })
    expect(await wire.backend.clearAll({ action: "confirm", review: token, alsoSynced: false })).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "confirmation" } })
    expect(h.counts().databases).toBe(0)
  } finally { wire.dispose(); await h.dispose() }
})

test("confirmation copy, local visibility, default scope and duplicate submit", async () => {
  const h = clearFixture(), wire = await h.wire()
  try {
    const availability = clearAllAvailability({ schema: 1, device: { id: "device", consent: null, syncOn: false }, sync: { joined: "old", pushed: {}, status: "off", editedSinceOff: false } })
    expect(availability).toEqual({ kind: "supported", checkbox: true })
    const model = createClearAllConfirmation(wire.backend, availability)
    model.open()
    expect(model.state()).toEqual({ kind: "editing", alsoSynced: false })
    expect(model.text).toBe(clearAllText)
    expect(model.checkboxText).toBe(clearAllCheckboxText)
    expect(model.button()).toBe("Clear")
    await model.select(true)
    expect(model.button()).toBe("Clear here and everywhere")
    await model.select(false)
    await model.review()
    const first = model.confirm(), duplicate = model.confirm()
    expect(duplicate, "duplicate submit shares one operation").toBe(first)
    expect((await first)?.kind).toBe("clear-result")
    expect(h.counts().databases).toBe(1)
  } finally { wire.dispose(); await h.dispose() }
})

test("newer-layout confirmation retains the open ticked policy", async () => {
  expect(clearAllAvailability({ schema: 9 })).toEqual({ kind: "newer-layout", localClear: true, checkbox: false, tickedPolicy: "local-only" })
  expect(clearAllAvailability({ schema: 1 })).toEqual({ kind: "supported", checkbox: false })
})
