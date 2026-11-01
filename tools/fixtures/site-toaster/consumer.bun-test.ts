import { expect, test } from "bun:test"
import expected from "./expected-records.json"
import { consumerRecords } from "./consumer"
test("actual composed Scope Keys toaster Svelte consumer has independent expected records", async () => {
  expect(await consumerRecords()).toEqual(expected)
})
