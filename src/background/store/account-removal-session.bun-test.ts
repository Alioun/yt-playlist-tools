import { expect, test } from "bun:test"
import type { JsonObject } from "../../shared/contracts/json"
import { planAccountSessionRemoval } from "./account-removal-session"
import { isAccountKey } from "../../shared/model"
import { removalFixture } from "../../../tools/fixtures/account-removal-execution/run"

const acct = "AAAAAAAAAAAAAAAA"
if (!isAccountKey(acct)) throw Error("Invalid synthetic account")

test("session removal preserves exact other-account order, raw extensions, global partitions and routing", () => {
  const session: JsonObject = { ...removalFixture().session, tabs: { "1": { site: "www", acct, signedIn: true } } }, original = JSON.stringify(session)
  const result = planAccountSessionRemoval(acct, session)
  expect(result.kind).toBe("supported")
  if (result.kind !== "supported") throw Error("Unsupported fixture")
  expect(result.effects.map(effect => effect.kind === "set" ? effect.key : effect.key.kind)).toEqual(["skips", "cooldown", "recent", "recentAdds", "shown", "breakage", "gather", "tabs"])
  const expected: JsonObject = { ...session, tabs: {}, recent: Array.isArray(session.recent) ? session.recent.filter((_, index) => index !== 1) : [],
    recentAdds: Array.isArray(session.recentAdds) ? session.recentAdds.filter((_, index) => index === 1 || index === 3) : [],
    shown: { v: 1, global: { keep: true, accountLookingExtension: { acct, keep: true }, paced: { "1": 10 } }, accounts: { BBBBBBBBBBBBBBBB: { extension: { keep: true } } }, extension: [null, 1] },
    breakage: { v: 1, global: { keep: true, accountLookingExtension: { acct, keep: true }, paced: { "1": 10 } }, accounts: { BBBBBBBBBBBBBBBB: { extension: { keep: true } } }, extension: [null, 1] },
    gather: { v: 1, global: { keep: true, accountLookingExtension: { acct, keep: true }, paced: { "1": 10 } }, accounts: { BBBBBBBBBBBBBBBB: { extension: { keep: true } } }, extension: [null, 1] },
  }
  delete expected[`skips:${acct}`]; delete expected[`cooldown:${acct}`]
  expect(result.expected).toEqual(expected)
  expect(Object.hasOwn(result.expected, `skips:${acct}`)).toBe(false)
  expect(Object.hasOwn(result.expected, `cooldown:${acct}`)).toBe(false)
  expect(JSON.stringify(session)).toBe(original)
  expect(planAccountSessionRemoval(acct, result.expected)).toEqual({ kind: "supported", effects: [], expected: result.expected })
  expect(planAccountSessionRemoval(acct, {})).toEqual({ kind: "supported", effects: [], expected: {} })
})

test("only matching tab rows are removed, including signed-out and other-account controls", () => {
  const other = "BBBBBBBBBBBBBBBB"
  const tabs = { "1": { site: "www", signedIn: true, acct }, "2": { site: "music", signedIn: true, acct: other }, "3": { site: "www", signedIn: false, acct: null } }
  expect(planAccountSessionRemoval(acct, { tabs, unknown: { acct, keep: true } })).toEqual({ kind: "supported",
    effects: [{ kind: "set", key: "tabs", value: { "2": tabs["2"], "3": tabs["3"] } }],
    expected: { tabs: { "2": tabs["2"], "3": tabs["3"] }, unknown: { acct, keep: true } } })
})

test("known ambiguous session encodings refuse without invoking accessors or inferring ownership", () => {
  for (const raw of [null, [], { recent: null }, { recent: [{ acct, playlist: "PL_one", video: "short", at: 1 }] },
    { recent: [{ acct: "invalid", playlist: "PL_one", video: "aaaaaaaaaaa", at: 1 }] }, { recentAdds: [{}] },
    { recentAdds: [{ acct, kind: "gather", videos: [], playlists: [], at: 1 }] },
    ...["shown", "breakage", "gather"].flatMap(key => [{ [key]: { accounts: {}, global: {} } }, { [key]: { v: 2, accounts: {}, global: {} } },
      { [key]: { v: 1, accounts: { invalid: {} }, global: {} } }, { [key]: { v: 1, accounts: { [acct]: [] }, global: {} } }]),
    { [`skips:${acct}`]: { badVideo: "all" } }, { [`cooldown:${acct}`]: -1 }, { recent: Array(1) }]) {
    expect(planAccountSessionRemoval(acct, raw)).toEqual({ kind: "unsupported" })
  }
  let invoked = 0
  expect(planAccountSessionRemoval(acct, Object.defineProperty({}, "recent", { enumerable: true, get() { invoked++; throw Error("getter") } }))).toEqual({ kind: "unsupported" })
  expect(invoked).toBe(0)
  expect(planAccountSessionRemoval(acct, { [Symbol("unknown")]: true })).toEqual({ kind: "unsupported" })
  expect(planAccountSessionRemoval(acct, { unknown: { acct, payload: "preserve" }, paused: true, tabs: { [acct]: {} } })).toEqual({ kind: "unsupported" })
})
