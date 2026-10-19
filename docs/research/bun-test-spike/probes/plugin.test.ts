import { expect, test } from "bun:test"

import { calls } from "./plugin"

test("runtime onResolve is not called for a bare specifier", async () => {
  // @ts-expect-error -- virtual module, no types
  await expect(import("virtual-probe")).rejects.toThrow("Cannot find package 'virtual-probe'")
  expect(calls).toEqual([])
})

test("build.module() serves a bare specifier", async () => {
  // @ts-expect-error -- virtual module, no types
  const m = await import("virtual-module-probe")
  expect(m.default).toBe("from build.module")
})
