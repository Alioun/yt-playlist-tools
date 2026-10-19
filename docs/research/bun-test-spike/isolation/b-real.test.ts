// Runs after a-mocks.test.ts. Passes with --isolate; fails without it,
// because a-mocks' mock.module() calls outlive their file.
import { expect, test } from "bun:test"

import { greet } from "../fixtures/greeting"
import * as store from "@/lib/storage"

test("sees the real greeting", () => {
  expect(greet()).toBe("hello")
})

test("sees the real storage item", async () => {
  expect(await store.authServerURL.getValue()).toBe("")
})
