import { describe, expect, test } from "bun:test"
import { decodeFilter, isChannelId, type Filter } from "../model"
import { decide, type FilterDecision } from "./channel-filter"

function channel(value: string) {
  if (!isChannelId(value)) throw new Error("Invalid synthetic channel ID")
  return value
}

const listed = channel("UCaaaaaaaaaaaaaaaaaaaaaa")
const unlisted = channel("UCbbbbbbbbbbbbbbbbbbbbbb")

describe("channel-filter decision table", () => {
  const cases: {
    mode: Filter["mode"]; on: boolean; empty: boolean
    decisions: [listed: FilterDecision, unlisted: FilterDecision, unknown: FilterDecision]
  }[] = [
    { mode: "allow", on: false, empty: false, decisions: ["pass", "pass", "pass"] },
    { mode: "allow", on: false, empty: true, decisions: ["pass", "pass", "pass"] },
    { mode: "allow", on: true, empty: false, decisions: ["pass", "filtered", "filtered-unknown-channel"] },
    { mode: "allow", on: true, empty: true, decisions: ["filtered", "filtered", "filtered-unknown-channel"] },
    { mode: "deny", on: false, empty: false, decisions: ["pass", "pass", "pass"] },
    { mode: "deny", on: false, empty: true, decisions: ["pass", "pass", "pass"] },
    { mode: "deny", on: true, empty: false, decisions: ["filtered", "pass", "pass"] },
    { mode: "deny", on: true, empty: true, decisions: ["pass", "pass", "pass"] },
  ]
  for (const { mode, on, empty, decisions } of cases) {
    test(`${mode}, ${on ? "on" : "off"}, ${empty ? "empty" : "listed"}`, () => {
      const filter: Filter = { mode, on, channels: empty ? [] : [[listed, "Synthetic channel", "@synthetic"]] }
      expect([decide(filter, listed), decide(filter, unlisted), decide(filter, null)]).toEqual(decisions)
    })
  }

  test("an absent filter passes known and unknown channels", () => {
    for (const id of [listed, unlisted, null]) expect(decide(undefined, id)).toBe("pass")
  })

  test("matches only IDs, leaves labels and future state untouched", () => {
    const filter = decodeFilter({
      mode: "allow", on: true, future: { behavior: "preserve" },
      channels: [[listed, unlisted, "@other", { future: true }]],
    })
    const before = JSON.stringify(filter)
    Object.freeze(filter.channels[0])
    Object.freeze(filter.channels)
    Object.freeze(filter)
    expect(decide(filter, listed)).toBe("pass")
    expect(decide(filter, unlisted)).toBe("filtered")
    expect(JSON.stringify(filter)).toBe(before)
  })

  test("switching off and back on preserves an empty or populated filter's behavior", () => {
    const filter: Filter = { mode: "deny", on: true, channels: [[listed, "Synthetic"]] }
    expect(decide(filter, listed)).toBe("filtered")
    expect(decide({ ...filter, on: false }, listed)).toBe("pass")
    expect(decide(filter, listed)).toBe("filtered")
    expect(decide({ ...filter, mode: "allow", channels: [] }, unlisted)).toBe("filtered")
  })
})
