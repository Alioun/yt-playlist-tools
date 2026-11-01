import { expect, test } from "bun:test"
import { runLocalizationFixture } from "./run"

test("the native-shaped localization fixture has a deterministic complete transcript", () => {
  const first = runLocalizationFixture(), second = runLocalizationFixture()
  expect(first).toEqual(second)
  expect(first).toHaveLength(5)
  expect(first[0]).toBe('{"case":"construction","nativeMessages":0,"authorityOperations":0}')
  expect(first[1]).toBe('{"case":"named","output":"A, B and C","native":{"name":"copy_list_three","substitutions":["A","B","C"]}}')
  expect(first[2]).toBe('{"case":"counts","zero":"Continue without features","one":"Continue with 1 feature","many":"Continue with 11 features","agree":"Agree and turn on 2 features"}')
  expect(first[3]).toBe('{"case":"disclosure","chrome":true,"firefox":true,"pseudo":false,"provisional":"ticket-25-cookie"}')
  expect(first[4]).toContain('"preservedValue":')
  expect(first[4]).toContain('TITLE_A')
  expect(first[4]).toContain('"englishHeading":"What should Perchling do?"}')
})
