import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { worktreePath } from "../../scripts/relativize-fixture-paths"
import { fixtureGates, gateId, type FixtureGate } from "../../tools/fixtures/gates"

const root = "tools/fixtures"
const at = (gate: { fixture: string }, path: string) => join(root, gate.fixture, path)
const fixtureFiles = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.parentPath !== root)
  .map(entry => join(entry.parentPath, entry.name))
  .sort()

const runnable: { pattern: RegExp; what: string }[] = [
  { pattern: /\.(bun-)?test\.tsx?$/, what: "test" },
  { pattern: /\/run\.ts$/, what: "consumer" },
  { pattern: /tsconfig[^/]*\.json$/, what: "type project" },
  { pattern: /negatives\.json$/, what: "negative cases" }
]

function covered(gate: FixtureGate): string[] {
  switch (gate.kind) {
    case "suite": return gate.files.map(file => at(gate, file))
    case "consumer": return [at(gate, "run.ts")]
    case "library": return [at(gate, gate.file)]
    case "types": return [at(gate, gate.project)]
    case "negatives": return [at(gate, gate.project), ..."cases" in gate.source ? [at(gate, gate.source.cases)] : []]
    case "script": return [at(gate, gate.file)]
  }
}

function referenced(gate: FixtureGate): string[] {
  switch (gate.kind) {
    case "suite": return [...covered(gate), at(gate, "bunfig.toml")]
    case "consumer": return [...covered(gate), ...gate.expected ? [at(gate, gate.expected)] : []]
    case "library": return [...covered(gate), gate.importedBy]
    case "negatives": return [...covered(gate), ..."directivesIn" in gate.source ? [at(gate, gate.source.directivesIn)] : [], ..."svelteFiles" in gate.source ? Object.keys(gate.source.svelteFiles).map(file => at(gate, file)) : []]
    case "types": case "script": return covered(gate)
  }
}

describe("fixture gate registry", () => {
  test("every fixture test, consumer and type project has a gate in tools/fixtures/gates.ts", () => {
    const gated = new Set(fixtureGates.flatMap(covered))
    const missing = fixtureFiles.flatMap(file => runnable.filter(kind => kind.pattern.test(file) && !gated.has(file)).map(kind => `${kind.what} ${file}`))
    expect(missing).toEqual([])
  })

  test("every gate points at files that exist", () => {
    expect(fixtureGates.flatMap(referenced).filter(path => !existsSync(path))).toEqual([])
  })

  test("a library consumer is imported by the suite named for it", () => {
    const unimported = fixtureGates.flatMap(gate => gate.kind === "library" && !readFileSync(gate.importedBy, "utf8").includes(`tools/fixtures/${gate.fixture}/${gate.file.replace(/\.ts$/, "")}`) ? [gateId(gate)] : [])
    expect(unimported).toEqual([])
  })

  test("every fixture bunfig preload exists", () => {
    const missing = fixtureFiles.filter(file => file.endsWith("/bunfig.toml")).flatMap(file => {
      const config = Bun.TOML.parse(readFileSync(file, "utf8")) as { preload?: string[]; test?: { preload?: string[] } }
      return [...config.preload ?? [], ...config.test?.preload ?? []].filter(path => !existsSync(path)).map(path => `${file}: ${path}`)
    })
    expect(missing).toEqual([])
  })

  test("gate ids are unique", () => {
    const ids = fixtureGates.map(gateId)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  test("fixtures hold no absolute paths into other worktrees; run scripts/relativize-fixture-paths.ts", () => {
    expect(fixtureFiles.filter(file => readFileSync(file, "utf8").search(worktreePath) >= 0)).toEqual([])
  })
})
