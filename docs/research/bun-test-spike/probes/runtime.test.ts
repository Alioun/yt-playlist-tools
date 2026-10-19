// Small behaviours the research doc cites as "observed".
import * as bunTest from "bun:test"
import { expect, test } from "bun:test"
import { vi } from "vitest"

import { seenGlobals } from "./fixtures/globals"

test("`from \"vitest\"` in a test file is bun:test", () => {
  // Typed as Vitest's vi (the import is written against vitest's types).
  expect(vi as unknown).toBe(bunTest.vi)
})

test("bun's vi lacks these Vitest helpers", () => {
  const v = vi as unknown as Record<string, unknown>
  for (const name of ["mocked", "stubGlobal", "hoisted", "waitFor", "advanceTimersByTimeAsync"]) {
    expect(v[name]).toBeUndefined()
  }
})

test("test globals resolve as bare identifiers in any module, but are not globalThis properties", () => {
  expect(seenGlobals()).toEqual({
    globalThisAfterEach: "undefined",
    bareAfterEach: "function",
    bareJest: "object"
  })
})

test("define replaces only literal import.meta.env.X expressions", () => {
  const { FIREFOX } = import.meta.env as Record<string, unknown>
  const env = import.meta.env as Record<string, unknown>
  expect(typeof import.meta.env.FIREFOX).toBe("boolean")
  expect(FIREFOX).toBeUndefined()
  expect(env.FIREFOX).toBeUndefined()
})

test("CSS, assets and Vite import suffixes", async () => {
  const css = await import("../../../../src/assets/tailwind.css")
  expect(css.default).toEqual({})
  const inline = await import("../../../../src/assets/tailwind.css?inline")
  // vite/client types say string; under Bun it is an empty object.
  expect(inline.default as unknown).toEqual({})
  const raw = await import("../../../../src/assets/tailwind.css?raw")
  expect(typeof raw.default).toBe("string")
  const png = await import("../../../../src/assets/icon.png")
  expect(png.default).toEndWith("/src/assets/icon.png")
  expect((import.meta as unknown as Record<string, unknown>).glob).toBeUndefined()
})
