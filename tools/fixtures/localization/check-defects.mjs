import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const controls = {
  "changed-canonical": {
    path: "src/public/_locales/en/messages.json",
    before: '"message": "Perchling works inside your YouTube and YouTube Music tabs,',
    after: '"message": "Changed canonical disclosure. Perchling works inside your YouTube and YouTube Music tabs,',
    test: "src/ui/backend/browser.bun-test.ts", name: "the disclosure version is pinned to the actual rendered text for both builds"
  },
  "self-pinned-identity": {
    path: "src/ui/backend/rendered-disclosure.ts",
    before: "sha256(JSON.stringify(canonical)) === expected[browser] && sha256(JSON.stringify(shown)) === expected[browser]",
    after: "JSON.stringify(canonical) === JSON.stringify(shown)",
    test: "src/ui/backend/browser.bun-test.ts", name: "changed canonical text refuses agreement without upgrading displayed version"
  },
  "drop-native-substitutions": {
    path: "src/ui/backend/browser.ts",
    before: "Reflect.apply(getMessage, native.i18n, [name, substitutions])", after: "Reflect.apply(getMessage, native.i18n, [name])",
    test: "src/ui/backend/browser.bun-test.ts", name: "the native localization binding preserves substitutions without Backend authority"
  },
  "displayed-snapshot": {
    path: "src/ui/backend/first-run-owner.ts",
    before: "request.displayed !== text.disclosure || ", after: "", all: true,
    test: "src/ui/backend/browser.bun-test.ts", name: "agreement cannot use a different view's displayed snapshot"
  },
  "invent-missing-english": {
    path: "src/shared/i18n/index.ts",
    before: "if (!result) throw new Error(`Missing localization message ${key}`)",
    after: "if (!result) return catalogue[key].message",
    test: "src/shared/i18n/i18n.bun-test.ts", name: "missing native text refuses instead of inventing fallback English", all: true
  },
  "inject-rich-html": {
    path: "src/ui/components/RichText.svelte",
    before: "{part.text}", after: "{@html part.text}", all: true, svelte: true,
    test: "src/ui/components/components.bun-test.ts", name: "structured emphasis escapes markup and preserves text spacing"
  }
}
const selected = process.argv[2]
const control = controls[selected]
if (!control) throw Error("Choose one exact compiling defect control")
const outputRoot = resolve(root, process.argv[3] ?? `.audit/localization-control-${selected}`)
mkdirSync(outputRoot, { recursive: true })
let invocation = 0
const run = (argv, seconds) => {
  const command = ["-k", "10", String(seconds), ...argv]
  const prefix = resolve(outputRoot, String(++invocation))
  const out = openSync(prefix + ".stdout", "w"), err = openSync(prefix + ".stderr", "w")
  let result
  try { result = spawnSync("timeout", command, { cwd: root, stdio: ["ignore", out, err], timeout: (seconds + 15) * 1000 }) }
  finally { closeSync(out); closeSync(err) }
  const stdout = readFileSync(prefix + ".stdout"), stderr = readFileSync(prefix + ".stderr")
  const record = { argv: ["timeout", ...command], exit: result.status, signal: result.signal, pid: result.pid,
    errorCode: result.error?.code ?? null, waited: true,
    stdout: { path: prefix + ".stdout", bytes: stdout.length, sha256: createHash("sha256").update(stdout).digest("hex") },
    stderr: { path: prefix + ".stderr", bytes: stderr.length, sha256: createHash("sha256").update(stderr).digest("hex") } }
  writeFileSync(prefix + ".json", JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
  if (result.error || result.signal || result.status === null || result.status === 124) throw Error("E_CONTROL_DEADLINE_OR_LAUNCH")
  return { code: result.status, output: stdout.toString() + stderr.toString() }
}
const path = new URL("../../../" + control.path, import.meta.url)
const bytes = readFileSync(path)
const source = bytes.toString("utf8")
const occurrences = source.split(control.before).length - 1
if (!occurrences || !control.all && occurrences !== 1) throw Error("E_DEFECT_ANCHOR")
const changed = control.all ? source.split(control.before).join(control.after) : source.replace(control.before, control.after)
const compiler = [process.execPath, "node_modules/@typescript/native/bin/tsc", "--project", "tools/fixtures/first-run-backend/qualification.tsconfig.json", "--noEmit", "--pretty", "false", "--resolveJsonModule"]
const behavior = ["bun", "test", "--no-env-file", "--no-install", "--isolate", "--conditions=browser", "./" + control.test, "--test-name-pattern", control.name]
if (run(compiler, 120).code !== 0 || run(behavior, 90).code !== 0) throw Error("E_CONTROL_BASELINE")
try {
  writeFileSync(path, changed)
  const compilation = run([process.execPath, "node_modules/@typescript/native/bin/tsc", "--project", "tools/fixtures/first-run-backend/qualification.tsconfig.json", "--noEmit", "--pretty", "false", "--resolveJsonModule"], 120)
  if (compilation.code !== 0) { process.stdout.write(compilation.output); throw Error("E_DEFECT_DID_NOT_COMPILE") }
  if (control.svelte) {
    const svelte = run([process.execPath, "tools/fixtures/ui-foundation/typecheck.mjs"], 120)
    if (svelte.code !== 0) { process.stdout.write(svelte.output); throw Error("E_DEFECT_SVELTE_DID_NOT_COMPILE") }
  }
  const observed = run(["bun", "test", "--no-env-file", "--no-install", "--isolate", "--conditions=browser", "./" + control.test, "--test-name-pattern", control.name], 90)
  if (observed.code === 0 || !observed.output.includes(control.name) || !/\(fail\)|\bfail\b/.test(observed.output) || !/expect\(/.test(observed.output)
      || !/\n\s*1 fail\b/.test(observed.output) || /(?:^|\n)(?:SyntaxError|ReferenceError):|Cannot find module|ModuleNotFound|timed out/.test(observed.output)) {
    process.stdout.write(observed.output)
    throw Error("E_DEFECT_NOT_CAUGHT_AT_TARGET")
  }
  console.log(JSON.stringify({ control: selected, compiled: true, targetFailed: true, restored: "finally" }))
} finally { writeFileSync(path, bytes) }
if (run(compiler, 120).code !== 0 || run(behavior, 90).code !== 0) throw Error("E_CONTROL_RESTORED_BASELINE")
if (control.svelte && run([process.execPath, "tools/fixtures/ui-foundation/typecheck.mjs"], 120).code !== 0) throw Error("E_RESTORED_SVELTE")
console.log(JSON.stringify({ control: selected, restoredCompiler: true, restoredBehavior: true }))
