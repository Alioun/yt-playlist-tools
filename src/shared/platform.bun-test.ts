import { expect, test } from "bun:test"
import { isBuildId } from "./contracts/vocabulary"
import { platform } from "./platform"

test("the test build reads Chrome, the test mode and a valid build ID from the bunfig defines", () => {
  expect({ ...platform }).toEqual({ browser: "chrome", mode: "test", build: platform.build })
  expect(String(platform.build)).toBe("test")
  expect(isBuildId(platform.build)).toBe(true)
  expect(Object.isFrozen(platform)).toBe(true)
})
