import assert from "node:assert/strict"
import expected from "./expected.json"
import { registryRecord } from "./consumer"

const actual = registryRecord()
assert.deepEqual(actual, expected)
process.stdout.write(`${JSON.stringify(actual)}\n`)
