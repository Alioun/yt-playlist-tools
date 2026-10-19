import { describe, expect, test } from "bun:test"

// Guards the harness: if a define is missing, the Firefox-only branches below
// would quietly run the Chrome path and prove nothing.
describe("WXT build globals", () => {
  test("are real booleans and numbers, not process.env strings", () => {
    expect(typeof import.meta.env.FIREFOX).toBe("boolean")
    expect(typeof import.meta.env.CHROME).toBe("boolean")
    expect(import.meta.env.MANIFEST_VERSION).toBe(3)
    expect(import.meta.env.CHROME).toBe(!import.meta.env.FIREFOX)
    expect(import.meta.env.BROWSER).toBe(import.meta.env.FIREFOX ? "firefox" : "chrome")
  })

  test("other import.meta.env keys still read process.env", () => {
    // Bun aliases import.meta.env to process.env; `bun test` sets NODE_ENV.
    expect(import.meta.env.NODE_ENV).toBe("test")
  })
})
