// Preload 3 of 3. jest-dom matchers on Bun's expect, and RTL cleanup.
import { afterEach, expect } from "bun:test"
import * as matchers from "@testing-library/jest-dom/matchers"
import { cleanup } from "@testing-library/react"

expect.extend(matchers)

// Bun's guide calls this optional; in practice RTL must at least be imported
// here. RTL registers its own afterEach(cleanup) when it is first imported
// (bun:test globals resolve inside node_modules too), but without --isolate
// it is evaluated once, so that hook belongs to whichever test file imported
// RTL first, and every later file leaks rendered trees into the next test.
// Importing it in a preload makes its hook global; this explicit one says so.
afterEach(() => {
  cleanup()
})
