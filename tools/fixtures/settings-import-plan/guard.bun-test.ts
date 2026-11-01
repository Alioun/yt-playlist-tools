import { expect, test } from "bun:test"
import { scenario } from "./specimens"
import type { ImportSyncFacts } from "../../../src/background/store/settings-import-plan"

test("pure planning has no ambient clock random browser network or timer effects", async () => {
  const input = scenario(), restore: (() => void)[] = []
  function deny(target: object, name: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target, name)
    Object.defineProperty(target, name, { configurable: true, get() { throw new Error(`ambient effect ${name}`) } })
    restore.push(() => { if (descriptor) Object.defineProperty(target, name, descriptor); else Reflect.deleteProperty(target, name) })
  }
  const off: ImportSyncFacts = { kind: "off" }
  Object.defineProperty(off, "records", { get() { throw new Error("sync-off remote facts read") } })
  try {
    for (const name of ["browser", "chrome", "fetch", "setTimeout", "setInterval"]) deny(globalThis, name)
    deny(Date, "now")
    deny(globalThis.crypto, "randomUUID")
    const module = await import("../../../src/background/store/settings-import-plan")
    const result = module.planSettingsImport({ ...input, sync: off })
    expect(result.kind).toBe("planned")
  } finally { for (const run of restore.reverse()) run() }
})
