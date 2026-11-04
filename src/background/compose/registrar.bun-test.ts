import { expect, test } from "bun:test"
import { registrarOwner } from "./registrar"
import { createStoreLifecycle } from "../store/store-lifecycle"
import { readConsentDevice } from "../store/consent-withdrawal"
import { createLifecycleHarness, lifecycleSeeds, settingsOrigin } from "../../../tools/fixtures/device-lifecycle/run"

test("a Registrar in a worker that started held becomes ready after Agree activates the current owner", async () => {
  const before = createLifecycleHarness(lifecycleSeeds.current())
  const first = createStoreLifecycle(before.deps())
  await first.ready()
  const consent = readConsentDevice(before.stores().local)
  if (consent.kind !== "supported" || !consent.device.consent) throw Error("Missing agreement")
  expect((await first.withdrawConsent(settingsOrigin, consent.device.consent)).kind).toBe("withdrawn")
  const saved = before.stores()
  await first.dispose()

  const h = createLifecycleHarness(saved)
  const lifecycle = createStoreLifecycle(h.deps())
  try {
    expect((await lifecycle.ready()).kind).toBe("held")
    const view = registrarOwner(lifecycle)
    expect(await view.port.ready()).toBe("held")
    const owner = lifecycle.owner()
    if (!owner) throw Error("Missing held owner")
    const origin = { kind: "ui", windowId: 1, incognito: false } as const
    const read = await owner.readAgreement(origin)
    if (read.kind !== "review" || read.presentation.kind !== "held") throw Error("Missing held disclosure")
    expect((await owner.agree(origin, { review: read.review, displayedVersion: 1, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe("committed")
    expect((await lifecycle.activate()).kind).toBe("active")
    expect(await view.port.ready()).toBe("ok")
    expect(view.port.current()).toMatchObject({ kind: "ok", consent: true, schemaOk: true })
    const started = h.ledger.ownersStarted
    expect(await view.port.ready()).toBe("ok")
    expect(h.ledger.ownersStarted, "repeated readiness checks compose no owner").toBe(started)
  } finally {
    await lifecycle.dispose()
  }
})
