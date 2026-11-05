import type { JsonValue } from "../../../src/shared/contracts/json"
import { isJsonValue } from "../../../src/shared/contracts/json"
import { cases } from "./specimens"
import { world, type Route } from "./harness"

export function canonical(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonical)
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key] ?? null)])
  )
}

export async function* consume(route: Route): AsyncGenerator<string> {
  for (const privateWindow of [false, true])
    for (const specimen of cases) {
      const w = world(route, undefined, privateWindow)
      try {
        await w.owner.ready()
        const answers = [await w.change(specimen.change), await w.change({ ...specimen.change, value: false })]
        const row = { name: specimen.name, private: privateWindow, answers, records: w.h.records(), session: w.h.session(), events: w.events }
        if (!isJsonValue(row)) throw Error("Consumer produced non-JSON output")
        yield JSON.stringify(canonical(row)) + "\n"
      } finally {
        await w.dispose()
      }
    }
}
