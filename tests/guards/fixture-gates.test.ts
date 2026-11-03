import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, sep } from "node:path"
import { worktreePath } from "../../scripts/relativize-fixture-paths"
import { fixtureGates, gateId, type FixtureGate } from "../../tools/fixtures/gates"

const root = "tools/fixtures"
const at = (gate: { fixture: string }, path: string) => join(root, gate.fixture, path)
// Two kinds of generated file aren't fixture files: the .wxt/ folder WXT writes when a fixture is built,
// and the .fixture-gate-<pid>.tsconfig.json a running negatives gate writes beside its project.
function listFixtureFiles(directory: string) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.parentPath !== directory && !entry.name.startsWith(".fixture-gate-") && !relative(directory, entry.parentPath).split(sep).includes(".wxt"))
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
}
const fixtureFiles = listFixtureFiles(root)

const runnable: { pattern: RegExp; what: string }[] = [
  { pattern: /\.(bun-)?test\.tsx?$/, what: "test" },
  { pattern: /\/run\.ts$/, what: "consumer" },
  { pattern: /tsconfig[^/]*\.json$/, what: "type project" },
  { pattern: /negatives\.json$/, what: "negative cases" }
]

function covered(gate: FixtureGate): string[] {
  switch (gate.kind) {
    case "suite":
      return gate.files.map(file => at(gate, file))
    case "consumer":
      return [at(gate, "run.ts")]
    case "library":
      return [at(gate, gate.file)]
    case "types":
      return [at(gate, gate.project)]
    case "negatives":
      return [at(gate, gate.project), ...("cases" in gate.source ? [at(gate, gate.source.cases)] : [])]
    case "script":
      return [at(gate, gate.file)]
  }
}

function referenced(gate: FixtureGate): string[] {
  switch (gate.kind) {
    case "suite":
      return [...covered(gate), at(gate, "bunfig.toml")]
    case "consumer":
      return [...covered(gate), ...(gate.expected ? [at(gate, gate.expected)] : [])]
    case "library":
      return [...covered(gate), gate.importedBy]
    case "negatives":
      return [
        ...covered(gate),
        ...("directivesIn" in gate.source ? [at(gate, gate.source.directivesIn)] : []),
        ...("svelteFiles" in gate.source ? Object.keys(gate.source.svelteFiles).map(file => at(gate, file)) : [])
      ]
    case "types":
    case "script":
      return covered(gate)
  }
}

describe("fixture gate registry", () => {
  test("files WXT generates under .wxt/ and a running gate's temporary tsconfig are not fixture files", () => {
    const directory = mkdtempSync(join(tmpdir(), "fixture-files-"))
    try {
      for (const file of ["pilot/tsconfig.json", "pilot/.wxt/tsconfig.json", "pilot/.wxt/types/paths.d.ts", "pilot/.fixture-gate-123.tsconfig.json", "top.json"]) {
        mkdirSync(join(directory, file, ".."), { recursive: true })
        writeFileSync(join(directory, file), "{}")
      }
      expect(listFixtureFiles(directory)).toEqual([join(directory, "pilot/tsconfig.json")])
    } finally {
      rmSync(directory, { recursive: true })
    }
  })

  test("every fixture test, consumer and type project has a gate in tools/fixtures/gates.ts", () => {
    const gated = new Set(fixtureGates.flatMap(covered))
    const missing = fixtureFiles.flatMap(file => runnable.filter(kind => kind.pattern.test(file) && !gated.has(file)).map(kind => `${kind.what} ${file}`))
    expect(missing).toEqual([])
  })

  test("every gate points at files that exist", () => {
    expect(fixtureGates.flatMap(referenced).filter(path => !existsSync(path))).toEqual([])
  })

  test("a library consumer is imported by the suite named for it", () => {
    const unimported = fixtureGates.flatMap(gate =>
      gate.kind === "library" && !readFileSync(gate.importedBy, "utf8").includes(`tools/fixtures/${gate.fixture}/${gate.file.replace(/\.ts$/, "")}`) ? [gateId(gate)] : []
    )
    expect(unimported).toEqual([])
  })

  test("every fixture bunfig preload exists", () => {
    const missing = fixtureFiles
      .filter(file => file.endsWith("/bunfig.toml"))
      .flatMap(file => {
        const config = Bun.TOML.parse(readFileSync(file, "utf8")) as { preload?: string[]; test?: { preload?: string[] } }
        return [...(config.preload ?? []), ...(config.test?.preload ?? [])].filter(path => !existsSync(path)).map(path => `${file}: ${path}`)
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
