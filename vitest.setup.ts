import "@testing-library/jest-dom/vitest"
import "fake-indexeddb/auto"

import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

beforeEach(() => {
  // fakeBrowser is a single in-memory instance shared across the whole run;
  // without this, storage written by one test leaks into the next.
  fakeBrowser.reset()
})

afterEach(() => {
  cleanup()
})
