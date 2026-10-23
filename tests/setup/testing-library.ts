import { afterEach, expect } from "bun:test"
import * as matchers from "@testing-library/jest-dom/matchers"
import { cleanup } from "@testing-library/svelte"

expect.extend(matchers)
afterEach(cleanup)
