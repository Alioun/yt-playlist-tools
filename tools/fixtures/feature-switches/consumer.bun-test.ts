import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { consume } from "./consumer"
for (const route of ["owner", "native", "wire"] as const)
  test(`${route} consumer compares every complete row through EOF`, async () => {
    let complete = ""
    for await (const row of consume(route)) complete += row
    expect(complete).toBe(await readFile(new URL("./expected.jsonl", import.meta.url), "utf8"))
  })
