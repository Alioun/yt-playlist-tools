import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { consume } from "./consumer"
for (const route of ["owner", "native", "wire"] as const)
  test(`${route} complete consumer matches independent records through EOF twice`, async () => {
    const expected = await readFile(new URL("./expected.jsonl", import.meta.url), "utf8")
    for (let repetition = 0; repetition < 2; repetition++) {
      let complete = ""
      for await (const row of consume(route)) complete += row
      expect(complete).toBe(expected)
    }
  })
