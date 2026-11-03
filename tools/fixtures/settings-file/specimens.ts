import { readFileSync } from "node:fs"
import { decodeDocument, decodeFilter, decodeSettings, decodeSetup, isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../../src/shared/model"
import { parseJsonText } from "../../../src/shared/contracts/json"
import { isRecord } from "../../../src/shared/model/codec"
import type { SettingsFileSource } from "../../../src/shared/settings-file"

export const expectedText = readFileSync(new URL("./expected-file.json", import.meta.url), "utf8")
export const expectedPlanText = readFileSync(new URL("./expected-plan.json", import.meta.url), "utf8")
export function record(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error("fixture-record")
  return raw
}
export function fixture(text = expectedText): Record<string, unknown> {
  const parsed = parseJsonText(text)
  if (!parsed.ok) throw new Error("fixture-json")
  return record(parsed.value)
}
export function account(value: string): AccountKey {
  if (!isAccountKey(value)) throw new Error("fixture-account")
  return value
}
export function playlist(value: string): PlaylistId {
  if (!isPlaylistId(value)) throw new Error("fixture-playlist")
  return value
}
export const accountA = account("AAAAAAAAAAAAAAAA")
export const accountB = account("BBBBBBBBBBBBBBBB")
export const unrelatedAccount = account("CCCCCCCCCCCCCCCC")
const stamp = { v: 1, gen: "source-generation-not-authority", at: 1234, by: "source-device-not-authority" }

export function canonicalSource(): SettingsFileSource {
  const raw = fixture()
  return {
    kind: "settings-file-source",
    settings: decodeDocument({ ...stamp, data: raw.settings }, decodeSettings),
    accounts: Object.entries(record(raw.accounts))
      .reverse()
      .map(([id, value]) => {
        const data = record(value)
        return {
          account: account(id),
          setup: decodeDocument({ ...stamp, data: data.setup }, decodeSetup),
          filters: Object.entries(record(data.filters))
            .reverse()
            .map(([pl, filter]) => ({
              playlist: playlist(pl),
              document: decodeDocument({ ...stamp, data: filter }, decodeFilter)
            }))
        }
      })
  }
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
