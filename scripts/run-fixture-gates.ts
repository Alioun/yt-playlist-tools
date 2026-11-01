// Runs every gate in tools/fixtures/gates.ts and prints a pass, fail or timeout line per gate plus a summary.
//   bun run scripts/run-fixture-gates.ts [--shard index/count] [--only text] [--logs dir]
// Gates run serially because negatives edit files in place and restore them afterwards.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseShard } from "./run-bun-tests"
import { fixtureGates, gateId, type Checker, type FixtureGate, type NegativeSource } from "../tools/fixtures/gates"

type Status = "pass" | "fail" | "timeout"
type Outcome = { status: Status; counts: string; detail: string[] }
type Ran = { code: number | null; stdout: Buffer; stderr: string; timedOut: boolean }

const defaultTimeoutMs: Record<FixtureGate["kind"], number> = { suite: 300_000, consumer: 300_000, library: 0, types: 180_000, negatives: 900_000, script: 180_000 }
const agentVariables = ["CLAUDECODE", "AI_AGENT", "CLAUDE_CODE_ENTRYPOINT"]
const fixturePath = (gate: { fixture: string }, path: string) => join("tools/fixtures", gate.fixture, path)

class GateTimeout extends Error {}

function childEnvironment() {
  const env = { ...process.env }
  for (const name of agentVariables) delete env[name]
  return env
}

async function run(argv: readonly string[], deadline: number): Promise<Ran> {
  const seconds = Math.ceil((deadline - Date.now()) / 1000)
  if (seconds <= 0) throw new GateTimeout()
  const child = Bun.spawn(["timeout", "-k", "5", String(seconds), ...argv], { env: childEnvironment(), stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text(), child.exited])
  return { code, stdout: Buffer.from(stdout), stderr, timedOut: code === 124 || code === 137 }
}

function bunConfig(gate: { fixture: string }) {
  const config = fixturePath(gate, "bunfig.toml")
  return existsSync(config) ? [`--config=${config}`] : []
}

async function suite(gate: Extract<FixtureGate, { kind: "suite" }>, deadline: number, log: string[]): Promise<Outcome> {
  const result = await run([process.execPath, ...bunConfig(gate), "test", "--no-env-file", "--isolate", "--conditions=browser",
    ...gate.testTimeoutMs ? ["--timeout", String(gate.testTimeoutMs)] : [], ...gate.files.map(file => `./${fixturePath(gate, file)}`)], deadline)
  const text = result.stdout.toString() + result.stderr
  log.push(text)
  const passed = Number(/^\s*(\d+) pass$/m.exec(text)?.[1] ?? 0)
  const failed = Number(/^\s*(\d+) fail$/m.exec(text)?.[1] ?? 0)
  const failures = [...new Set(text.split("\n").filter(line => line.startsWith("(fail) ")).map(line => line.replace(/ \[[\d.]+m?s\]$/, "")))]
  const counts = `${passed} pass, ${failed} fail`
  if (result.timedOut) return { status: "timeout", counts, detail: failures }
  const errors = text.split("\n").filter(line => /^error:|Unhandled error/.test(line)).slice(0, 5)
  return { status: result.code === 0 && failed === 0 && passed > 0 ? "pass" : "fail", counts, detail: failures.length ? failures : errors.length ? errors : text.trim().split("\n").slice(-10) }
}

function firstDifference(actual: Buffer, expected: Buffer) {
  let at = 0
  while (at < actual.length && at < expected.length && actual[at] === expected[at]) at++
  return at
}

async function consumer(gate: Extract<FixtureGate, { kind: "consumer" }>, deadline: number, log: string[]): Promise<Outcome> {
  const variants = gate.variants ?? [[]]
  const expected = gate.expected ? readFileSync(fixturePath(gate, gate.expected)) : undefined
  let reference: Buffer | undefined
  let runs = 0
  for (const variant of variants) {
    for (let repetition = 1; repetition <= 2; repetition++) {
      const label = `run ${repetition}${variant.length ? ` ${variant.join(" ")}` : ""}`
      const result = await run([process.execPath, "--no-env-file", ...bunConfig(gate), "--conditions=browser", "run", `./${fixturePath(gate, "run.ts")}`, ...variant], deadline)
      runs++
      log.push(`${label}: exit ${result.code}, ${result.stdout.length} stdout bytes\n${result.stderr}`)
      const counts = `${runs} runs, ${result.stdout.length} bytes`
      if (result.timedOut) return { status: "timeout", counts, detail: [`${label} hit the deadline`] }
      if (result.code !== 0) return { status: "fail", counts, detail: [`${label} exited ${result.code}`, ...result.stderr.trim().split("\n").slice(-8)] }
      if (result.stderr) return { status: "fail", counts, detail: [`${label} wrote to stderr`, ...result.stderr.trim().split("\n").slice(0, 8)] }
      if (expected && !result.stdout.equals(expected)) return { status: "fail", counts, detail: [`${label} stdout differs from ${gate.expected} at byte ${firstDifference(result.stdout, expected)} (${result.stdout.length} bytes, expected ${expected.length})`] }
      if (reference && !result.stdout.equals(reference)) return { status: "fail", counts, detail: [`${label} stdout differs from the first run at byte ${firstDifference(result.stdout, reference)}`] }
      reference = result.stdout
    }
  }
  return { status: "pass", counts: `${runs} runs, ${reference?.length ?? 0} bytes${expected ? ` = ${gate.expected}` : ", identical"}`, detail: [] }
}

type Diagnostic = { file: string; line: number; code?: number; severity: string; text: string }

async function check(checker: Checker, project: string, deadline: number): Promise<{ result: Ran; diagnostics: Diagnostic[] }> {
  const argv = checker === "tsc"
    ? ["node", "node_modules/@typescript/native/bin/tsc", "--noEmit", "--pretty", "false", "-p", project]
    : ["node", "node_modules/svelte-check/bin/svelte-check", "--workspace", ".", "--tsconfig", `./${project}`, "--fail-on-warnings", "--output", "machine"]
  const result = await run(argv, deadline)
  const lines = (result.stdout.toString() + result.stderr).split("\n")
  const diagnostics = checker === "tsc"
    ? lines.flatMap(line => {
        const match = /^(.+?)\((\d+),\d+\): (error|warning) TS(\d+): /.exec(line)
        return match ? [{ file: match[1]!, line: Number(match[2]), code: Number(match[4]), severity: match[3]!, text: line }] : []
      })
    : lines.flatMap(line => {
        const match = /^\d+ (ERROR|WARNING) "(.+?)" (\d+):\d+ /.exec(line)
        return match ? [{ file: match[2]!, line: Number(match[3]), severity: match[1]!, text: line }] : []
      })
  return { result, diagnostics }
}

async function types(gate: Extract<FixtureGate, { kind: "types" }>, deadline: number, log: string[]): Promise<Outcome> {
  const { result, diagnostics } = await check(gate.checker, fixturePath(gate, gate.project), deadline)
  log.push(result.stdout.toString() + result.stderr)
  const counts = `${gate.checker}, ${diagnostics.length} diagnostics`
  if (result.timedOut) return { status: "timeout", counts, detail: [] }
  return { status: result.code === 0 ? "pass" : "fail", counts, detail: diagnostics.length ? diagnostics.slice(0, 10).map(item => item.text) : (result.stdout.toString() + result.stderr).trim().split("\n").slice(-8) }
}

type NegativeCase = { id: string; checker: Checker; file: string; line: number; codes: readonly number[]; content?: Buffer }

const read = (path: string) => readFileSync(path)
const codeOf = (value: unknown) => typeof value === "string" ? Number(value.replace(/^TS/, "")) : Number(value)

function patched(target: string, patch: string): Buffer {
  const output = join(tmpdir(), `fixture-gate-${process.pid}-patched`)
  const result = Bun.spawnSync(["patch", "--batch", "--fuzz=0", "--silent", "-o", output, target, "-i", patch], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw Error(`patch ${patch} does not apply to ${target}: ${result.stdout.toString()}${result.stderr.toString()}`)
  const bytes = readFileSync(output)
  rmSync(output, { force: true })
  return bytes
}

function withoutDirective(file: string, directiveLine: number): Buffer {
  const lines = readFileSync(file, "utf8").split("\n")
  const line = lines[directiveLine - 1] ?? ""
  if (!line.includes("@ts-expect-error")) throw Error(`${file}:${directiveLine} no longer holds its @ts-expect-error directive`)
  lines[directiveLine - 1] = line.replace("@ts-expect-error", "negative probe:")
  return Buffer.from(lines.join("\n"))
}

function negativeCases(gate: Extract<FixtureGate, { kind: "negatives" }>): NegativeCase[] {
  const source: NegativeSource = gate.source
  if ("svelteFiles" in source) return Object.entries(source.svelteFiles).map(([file, line]) => ({ id: file, checker: "svelte-check", file: fixturePath(gate, file), line, codes: [] }))
  if ("directivesIn" in source) {
    const file = fixturePath(gate, source.directivesIn)
    return readFileSync(file, "utf8").split("\n").flatMap((text, index) => text.includes("@ts-expect-error")
      ? [{ id: `${file}:${index + 1}`, checker: "tsc" as const, file, line: index + 2, codes: source.codes, content: withoutDirective(file, index + 1) }]
      : [])
  }
  const data = JSON.parse(readFileSync(fixturePath(gate, source.cases), "utf8"))
  const records: Record<string, unknown>[] = Array.isArray(data) ? data : data.gates ?? data.negatives ?? data.probes
  return records.map(record => {
    const id = String(record.id ?? `${record.file}:${record.directiveLine}`)
    if (typeof record.directiveLine === "number") {
      const file = String(record.file)
      return { id, checker: "tsc", file, line: Number(record.intendedLine ?? record.intendedDiagnosticLine), codes: [], content: withoutDirective(file, record.directiveLine) }
    }
    if (typeof record.patch === "string" && typeof record.template !== "string") {
      const file = String(record.target)
      return { id, checker: record.kind === "native" ? "tsc" : "svelte-check", file, line: Number(record.line), codes: record.code ? [codeOf(record.code)] : [], content: patched(file, record.patch) }
    }
    const template = String(record.template)
    const file = String(record.materializeAs ?? record.target ?? record.materialize)
    const codes = (record.expectedCodes ?? record.diagnosticCodes ?? (record.expectedDiagnostic ? [record.expectedDiagnostic] : [])) as unknown[]
    return { id, checker: "tsc", file, line: Number(record.intendedLine ?? record.line), codes: codes.map(codeOf), content: read(template.startsWith("tools/") ? template : fixturePath(gate, template)) }
  })
}

const restorers = new Set<() => void>()
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { for (const restore of restorers) restore(); process.exit(130) })

function materialize(file: string, content: Buffer): () => void {
  const original = existsSync(file) ? { bytes: readFileSync(file), mode: statSync(file).mode } : undefined
  writeFileSync(file, content)
  const restore = () => {
    if (original) { writeFileSync(file, original.bytes); chmodSync(file, original.mode) } else rmSync(file, { force: true })
    restorers.delete(restore)
  }
  restorers.add(restore)
  return restore
}

function withIncludedFile(project: string, file: string): { project: string; restore: () => void } {
  const base = JSON.parse(readFileSync(project, "utf8"))
  const generated = join(project, "..", `.fixture-gate-${process.pid}.tsconfig.json`)
  const relativeFile = file.slice(join(project, "..").length + 1)
  const restore = materialize(generated, Buffer.from(JSON.stringify({ extends: `./${project.split("/").pop()}`, include: [...base.include ?? [], relativeFile], files: [...base.files ?? [], relativeFile] })))
  return { project: generated, restore }
}

async function negatives(gate: Extract<FixtureGate, { kind: "negatives" }>, deadline: number, log: string[]): Promise<Outcome> {
  const project = fixturePath(gate, gate.project)
  const cases = negativeCases(gate)
  const failures: string[] = []
  for (const negative of cases) {
    const target = negative.content ? { project, restore: materialize(negative.file, negative.content) } : withIncludedFile(project, negative.file)
    let observed: Awaited<ReturnType<typeof check>>
    try { observed = await check(negative.checker, target.project, deadline) } finally { target.restore() }
    log.push(`${negative.id}\n${observed.result.stdout.toString()}${observed.result.stderr}`)
    if (observed.result.timedOut) return { status: "timeout", counts: `${cases.length - failures.length} of ${cases.length} negatives`, detail: failures }
    const matches = (item: Diagnostic) => item.file === negative.file && item.line === negative.line && (!negative.codes.length || negative.codes.includes(item.code ?? -1))
    const expected = `${negative.codes.length ? negative.codes.map(code => `TS${code}`).join(" or ") : "a diagnostic"} at ${negative.file}:${negative.line}`
    const seen = observed.diagnostics.map(item => `${item.code ? `TS${item.code}` : item.severity} at ${item.file}:${item.line}`)
    if (!observed.diagnostics.some(matches) || !observed.diagnostics.every(matches)) failures.push(`${negative.id}: expected only ${expected}; saw ${seen.length ? seen.slice(0, 3).join(", ") + (seen.length > 3 ? ` and ${seen.length - 3} more` : "") : "no diagnostic"}`)
  }
  return { status: failures.length ? "fail" : "pass", counts: `${cases.length - failures.length} of ${cases.length} negatives`, detail: failures }
}

async function script(gate: Extract<FixtureGate, { kind: "script" }>, deadline: number, log: string[]): Promise<Outcome> {
  const file = fixturePath(gate, gate.file)
  const interpreter = file.endsWith(".py") ? ["python3", "-I"] : file.endsWith(".ts") ? [process.execPath, "--no-env-file"] : ["node"]
  const result = await run([...interpreter, file, ...gate.args ?? []], deadline)
  const text = result.stdout.toString() + result.stderr
  log.push(text)
  if (result.timedOut) return { status: "timeout", counts: "", detail: [] }
  return { status: result.code === 0 ? "pass" : "fail", counts: `exit ${result.code}`, detail: result.code === 0 ? [] : text.trim().split("\n").slice(-8) }
}

async function runGate(gate: FixtureGate, log: string[]): Promise<Outcome> {
  const deadline = Date.now() + (("timeoutMs" in gate ? gate.timeoutMs : undefined) ?? defaultTimeoutMs[gate.kind])
  try {
    switch (gate.kind) {
      case "suite": return await suite(gate, deadline, log)
      case "consumer": return await consumer(gate, deadline, log)
      case "library": return { status: "pass", counts: `runs inside ${gate.importedBy}`, detail: [] }
      case "types": return await types(gate, deadline, log)
      case "negatives": return await negatives(gate, deadline, log)
      case "script": return await script(gate, deadline, log)
    }
  } catch (error) {
    if (error instanceof GateTimeout) return { status: "timeout", counts: "", detail: [] }
    return { status: "fail", counts: "", detail: [error instanceof Error ? error.message : String(error)] }
  }
}

function parseArguments(args: readonly string[]) {
  let shardArgs: string[] = []
  let only: string | undefined
  let logs: string | undefined
  for (let at = 0; at < args.length; at += 2) {
    const [flag, value] = [args[at], args[at + 1]]
    if (value === undefined) throw Error(`Missing value for ${flag}`)
    if (flag === "--shard") shardArgs = ["--shard", value]
    else if (flag === "--only") only = value
    else if (flag === "--logs") logs = value
    else throw Error("Usage: bun run scripts/run-fixture-gates.ts [--shard index/count] [--only text] [--logs dir]")
  }
  return { shard: parseShard(shardArgs), only, logs }
}

export async function runFixtureGates(args: readonly string[]): Promise<number> {
  const { shard, only, logs } = parseArguments(args)
  const selected = fixtureGates
    .filter((_, position) => !shard || position % shard.count === shard.index - 1)
    .filter(gate => !only || gateId(gate).includes(only))
  const logRoot = logs ?? join(tmpdir(), `fixture-gates-${new Date().toISOString().replace(/[:.]/g, "-")}${shard ? `-shard-${shard.index}-of-${shard.count}` : ""}`)
  mkdirSync(logRoot, { recursive: true })
  console.log(`${selected.length} fixture gates${shard ? ` in shard ${shard.index}/${shard.count}` : ""}; logs in ${logRoot}`)
  const results: { id: string; outcome: Outcome; seconds: number }[] = []
  for (const gate of selected) {
    const id = gateId(gate)
    const started = Date.now()
    const log: string[] = []
    const outcome = await runGate(gate, log)
    const seconds = (Date.now() - started) / 1000
    writeFileSync(join(logRoot, `${id.replace(/[^\w.-]+/g, "_")}.log`), log.join("\n"))
    results.push({ id, outcome, seconds })
    console.log(`${outcome.status.toUpperCase().padEnd(7)} ${seconds.toFixed(1).padStart(6)}s  ${id}${outcome.counts ? `  (${outcome.counts})` : ""}`)
    for (const line of outcome.status === "pass" ? [] : outcome.detail.slice(0, 20)) console.log(`        ${line}`)
  }
  const tally = (status: Status) => results.filter(result => result.outcome.status === status).length
  console.log(`\nSummary: ${results.length} gates, ${tally("pass")} pass, ${tally("fail")} fail, ${tally("timeout")} timeout`)
  for (const result of results.filter(result => result.outcome.status !== "pass")) console.log(`  ${result.outcome.status.toUpperCase().padEnd(7)} ${result.id}`)
  return tally("pass") === results.length ? 0 : 1
}

if (import.meta.main) {
  try {
    process.exit(await runFixtureGates(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
