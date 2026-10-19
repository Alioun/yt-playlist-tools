// Mocks two modules, one by a relative path and one by the `@/` alias, then
// "cleans up" the way the Bun docs suggest. b-real.test.ts checks for leaks.
import { afterAll, expect, mock, test } from "bun:test"

mock.module("../fixtures/greeting", () => ({ greet: () => "mocked" }))

// A specifier through the tsconfig `@/` path resolves like an import, so this
// replaces src/lib/storage.ts for src/config.ts too, which imports it as
// "@/lib/storage".
mock.module("@/lib/storage", () => ({
  authServerURL: { getValue: async () => "https://broker.example/" }
}))

// Static imports are hoisted above the mock.module() calls, so both modules
// were already evaluated by the time they were mocked.
import { greet } from "../fixtures/greeting"
import { getAuthServerURL } from "@/config"
import * as store from "@/lib/storage"

test("the mocks apply, even to static imports above them", async () => {
  expect(greet()).toBe("mocked")
  expect(await getAuthServerURL()).toBe("https://broker.example")
})

test("an already-loaded module is patched, not replaced: unmocked exports stay real", () => {
  expect(typeof store.playlists.getValue).toBe("function")
})

afterAll(() => {
  // Per the docs, this does not undo mock.module().
  mock.restore()
})
