import { expect, test } from "bun:test"
import { parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { newInstallationStage } from "../../../tools/fixtures/interim-conversion/run"
import { origin, newInstallationOwner, newInstallationInput } from "../../../tools/fixtures/consent-recovery/cases"

for (const rejected of [true])
  for (let mask = 0; mask < 64; mask++)
    test(`new installation fixed documents subset ${mask}, rejection ${rejected}`, async () => {
      const { h, writer } = await newInstallationOwner(),
        { input } = await newInstallationInput(writer)
      h.write(async (items, apply) => {
        if (newInstallationStage(items) !== "documents") {
          apply(items)
          return
        }
        const entries = Object.entries(items)
        expect(entries.length).toBe(6)
        apply(Object.fromEntries(entries.filter((_, index) => mask & (2 ** index))))
        if (rejected) throw h.error
      })
      expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe(mask === 63 ? "recovered" : "authorized-pending")
      if (mask !== 63) expect(h.writes.map(newInstallationStage)).toEqual(["prepare", "authorize", "accept", "documents"])
      const partial = h.records()
      await writer.dispose()
      if (mask !== 63) {
        const restart = await newInstallationOwner(partial),
          fresh = await newInstallationInput(restart.writer)
        expect((await restart.writer.recoverWithdrawnWork(origin, fresh.input)).kind).toBe("recovered")
        expect(restart.h.writes.filter(items => newInstallationStage(items) === "documents").length).toBe(1)
        expect(parseConsentJobs(restart.h.records()[consentJobsKey])?.next).toBe(1)
        await restart.writer.dispose()
      }
    })
