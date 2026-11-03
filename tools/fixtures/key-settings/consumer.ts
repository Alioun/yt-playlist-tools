import { isJsonValue, type JsonValue } from "../../../src/shared/contracts/json"
import { world, chord, shortcut, type Route } from "./harness"

function canonical(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonical)
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key] ?? null)])
  )
}
export async function* consume(route: Route): AsyncGenerator<string> {
  for (const privateWindow of [false, true]) {
    const w = world(route, undefined, privateWindow)
    try {
      await w.owner.ready()
      const answers = [
        await w.assign({ kind: "undo" }, chord("z")),
        await w.assign({ kind: "undo" }, null),
        await w.change({ kind: "shortcut-label", id: shortcut("save01"), expected: "Kept shortcut", value: "  Named  " }),
        await w.change({ kind: "shortcut-watch-later", id: shortcut("save01"), expected: false, value: true }),
        await w.change({ kind: "shortcut-add" }),
        await w.assign({ kind: "undo" }, null)
      ]
      const row = { name: "canonical-fields", private: privateWindow, answers, records: w.h.records(), session: w.h.session(), events: w.events }
      if (!isJsonValue(row)) throw Error("Expected complete finite consumer output")
      yield JSON.stringify(canonical(row)) + "\n"
    } finally {
      await w.dispose()
    }
  }
}
