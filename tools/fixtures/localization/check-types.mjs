import { readFileSync, writeFileSync, statSync, chmodSync, mkdirSync, openSync, closeSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const source = new URL("../../../src/shared/i18n/i18n.type-test.ts", import.meta.url)
const temporary = source
const original = readFileSync(source)
const mode = statSync(source).mode
const labels = ["missing-second", "extra-value", "extra-variable", "missing-object", "simple-extra", "unknown-key", "rich-values", "numeric-value"]
const requested = process.argv[2]
if (requested !== "positive" && !labels.includes(requested)) throw Error("Choose positive or one exact negative label")
const outputRoot = resolve(root, process.argv[3] ?? `.audit/localization-type-${requested}`)
mkdirSync(outputRoot, { recursive: true })
const compile = stage => {
  const argv = ["-k", "10", "120", process.execPath, "node_modules/@typescript/native/bin/tsc", "--project", "tools/fixtures/first-run-backend/qualification.tsconfig.json", "--noEmit", "--pretty", "false", "--resolveJsonModule"]
  const prefix = resolve(outputRoot, stage)
  const out = openSync(prefix + ".stdout", "w"), err = openSync(prefix + ".stderr", "w")
  const startedAt = new Date().toISOString()
  let result
  try { result = spawnSync("timeout", argv, { cwd: root, stdio: ["ignore", out, err], timeout: 135000 }) }
  finally { closeSync(out); closeSync(err) }
  const stdout = readFileSync(prefix + ".stdout"), stderr = readFileSync(prefix + ".stderr")
  const record = { stage, argv: ["timeout", ...argv], startedAt, endedAt: new Date().toISOString(),
    pid: result.pid, exit: result.status, signal: result.signal, errorCode: result.error?.code ?? null, waited: true,
    stdout: { path: prefix + ".stdout", bytes: stdout.length, sha256: createHash("sha256").update(stdout).digest("hex") },
    stderr: { path: prefix + ".stderr", bytes: stderr.length, sha256: createHash("sha256").update(stderr).digest("hex") } }
  writeFileSync(prefix + ".json", JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
  if (result.error || result.signal || result.status === null || result.status === 124) throw Error("E_COMPILER_DEADLINE_OR_LAUNCH")
  return { status: result.status, text: stdout.toString() + stderr.toString() }
}
if (requested === "positive") {
  const result = compile("positive")
  if (result.status !== 0) { process.stdout.write(result.text); throw Error("E_POSITIVE_COMPILER") }
  console.log(JSON.stringify({ control: requested, passed: true }))
} else {
  const baseline = compile("baseline")
  if (baseline.status !== 0) { process.stdout.write(baseline.text); throw Error("E_POSITIVE_COMPILER") }
  const lines = readFileSync(source, "utf8").split("\n")
  const index = lines.findIndex(line => line.includes(`@ts-expect-error ${requested}.`))
  if (index < 0) throw Error("E_CONTROL_LINE")
  lines[index] = `  // Intended diagnostic for ${requested}.`
  let created = false
  try {
    writeFileSync(temporary, lines.join("\n"))
    created = true
    const result = compile("intended-negative")
    const diagnostics = result.text.split(/\r?\n/).filter(line => /error TS\d+:/.test(line))
    const intended = new RegExp(`src/shared/i18n/i18n\\.type-test\\.ts\\(${index + 2},\\d+\\): error TS(?:2345|2353|2554|2322):`)
    if (result.status === 0 || diagnostics.length !== 1 || !intended.test(diagnostics[0] ?? "")) {
      process.stdout.write(result.text)
      throw Error("E_INTENDED_TYPE_DIAGNOSTIC")
    }
    console.log(JSON.stringify({ control: requested, passed: true, line: index + 2, diagnostic: diagnostics[0] }))
  } finally { if (created) { writeFileSync(source, original); chmodSync(source, mode) } }
  if (!readFileSync(source).equals(original) || statSync(source).mode !== mode) throw Error("E_TYPE_SOURCE_RESTORATION")
  const restored = compile("restored")
  if (restored.status !== 0) { process.stdout.write(restored.text); throw Error("E_RESTORED_COMPILER") }
}
