import { expect, test } from "bun:test"
import catalogue from "../../public/_locales/en/messages.json"
import { createI18n, richParts } from "./index"
import { sha256 } from "./identity"
import { scriptedMessages, stretch } from "../../../tools/fixtures/localization/scripted"

test("named values become native positional substitutions in catalogue order", () => {
  const calls: unknown[] = []
  const scripted = scriptedMessages()
  const i18n = createI18n({ getMessage(name, values) { calls.push({ name, values }); return scripted.getMessage(name, values) } }, catalogue)
  expect(i18n.message("copy_list_three", { third: "C", first: "A", second: "B" })).toBe("A, B and C")
  expect(calls).toEqual([{ name: "copy_list_three", values: ["A", "B", "C"] }])
})

test("missing native text refuses instead of inventing fallback English", () => {
  const i18n = createI18n({ getMessage: () => "" }, catalogue)
  expect(() => i18n.message("firstRun_welcome")).toThrow("Missing localization message firstRun_welcome")
  expect(() => i18n.rich("disclosure_bullet_1")).toThrow("Missing localization message disclosure_bullet_1")
})

test("concurrent instances keep their own native port and locale", async () => {
  const first = createI18n(scriptedMessages({ overrides: { firstRun_welcome: "First view" } }), catalogue, "en")
  const second = createI18n(scriptedMessages({ overrides: { firstRun_welcome: "Second view" } }), catalogue, "fr")
  expect(await Promise.all([Promise.resolve().then(() => first.message("firstRun_welcome")), Promise.resolve().then(() => second.message("firstRun_welcome"))])).toEqual(["First view", "Second view"])
  expect(first.plural(0)).toBe("other")
  expect(second.plural(0)).toBe("one")
  expect(first.number(1000)).toBe("1000")
  expect(second.number(1.5)).toBe("1,5")
  expect(first.date(0, { timeZone: "UTC", year: "numeric" })).toBe("1970")
  expect(first.time(0, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("00:00")
})

test("emphasis is structured text and rejects unbalanced or nested markers", () => {
  expect(richParts('[[strong]]<img onerror="bad">[[/strong]] rest')).toEqual([
    { kind: "strong", text: '<img onerror="bad">' }, { kind: "text", text: " rest" }
  ])
  for (const value of ["[[strong]]missing", "[[/strong]]", "[[strong]]outer[[strong]]inner[[/strong]]", "end[[/strong]][[strong]]start[[/strong]]"]) {
    expect(() => richParts(value)).toThrow("Invalid localization emphasis")
  }
})

test("pseudo text derives from actual JSON and leaves placeholders and emphasis intact", () => {
  const entry = catalogue.copy_list_two.message
  expect(stretch(entry).match(/\$[A-Z_]+\$/g)).toEqual(entry.match(/\$[A-Z_]+\$/g))
  const pseudo = createI18n(scriptedMessages({ pseudo: true }), catalogue)
  expect(pseudo.message("copy_list_two", { first: "TITLE_A", second: "TITLE_B" })).toContain("TITLE_A")
  expect(pseudo.rich("disclosure_bullet_1")[0]?.kind).toBe("strong")
})

test("disclosure hashing follows SHA-256 known answers", () => {
  expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  expect(sha256("a".repeat(1000000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
})
