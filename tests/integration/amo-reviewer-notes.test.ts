import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash, createHmac } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Certificate, type FakeAmo, type Mode, startFakeAmo, untrustedCertificate } from "./fixtures/fake-amo"

// Credential-free (G28): every value below is a fake, and each child process
// gets an environment built from scratch, so no real secret can reach it.

const root = resolve(import.meta.dir, "../..")
const script = join(root, "scripts/amo-reviewer-notes.ts")
const scriptSource = readFileSync(script, "utf8")
const bash = Bun.which("bash")!

type Step = { name?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string>; run?: string }
type Job = { needs?: string[]; if?: unknown; environment?: string | { name: string }; uses?: string; env?: Record<string, string>; steps?: Step[] }
type Workflow = { env?: Record<string, string>; jobs: Record<string, Job> }

const workflowDir = join(root, ".github/workflows")
const workflowTexts = Object.fromEntries(
  readdirSync(workflowDir).filter(file => /\.ya?ml$/.test(file)).sort().map(file => [file, readFileSync(join(workflowDir, file), "utf8")])
)
const workflows = Object.fromEntries(Object.entries(workflowTexts).map(([file, text]) => [file, Bun.YAML.parse(text) as Workflow]))
const release = workflows["release.yml"]!
const reviewerJobs = ["check-reviewer-login", "fill-reviewer-notes"]
const loginStep = (job: string) => release.jobs[job]!.steps!.find(step => step.env && "AMO_REVIEWER_LOGIN" in step.env)!
const checkStep = loginStep("check-reviewer-login")
const fillStep = loginStep("fill-reviewer-notes")

// The password carries JSON escapes, a `$&` replacement pattern and a placeholder.
const login = {
  email: "dummy-reviewer@example.invalid",
  password: 'dummy-reviewer-password-0000"\\$&{code1}',
  code1: "0000 1111",
  code2: "2222 3333"
}
const rawLogin = `${login.email}\n${login.password}\n${login.code1}\n${login.code2}\n`
const jwtIssuer = "dummy-jwt-issuer-0000"
const jwtSecret = "dummy-jwt-secret-0000"
const sensitive = { ...login, rawLogin: rawLogin.trim(), jwtSecret }

/** A value as a log could carry it: raw, JSON-escaped once or twice, URL-encoded, or inside base64 at any byte offset, each also without its spaces. */
function forms(value: string): string[] {
  return [value, value.replaceAll(" ", "")].flatMap(plain => {
    const json = JSON.stringify(plain).slice(1, -1)
    const url = encodeURIComponent(plain)
    const bytes = Buffer.from(plain)
    const base64 = [0, 1, 2].flatMap(offset => {
      const whole = bytes.subarray(offset, offset + Math.floor((bytes.length - offset) / 3) * 3)
      return [whole.toString("base64"), whole.toString("base64url")]
    })
    return [plain, json, JSON.stringify(json).slice(1, -1), url, url.replaceAll("%20", "+"), ...base64]
  }).filter(form => form.length >= 8)
}

/** The names of the sensitive values in `text`, in any of their forms. Never the values. */
function leaks(text: string): string[] {
  return Object.entries(sensitive)
    .filter(([, value]) => forms(value).some(form => text.includes(form)))
    .map(([name]) => name)
}

const fullNotes = [
  "**Test account:**",
  "- {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check.",
  "- Any Google account with a YouTube channel also works."
].join("\n")
const filledNotes = [
  "**Test account:**",
  `- ${login.email} / ${login.password}, with backup codes ${login.code1}, ${login.code2} for Google's sign-in check.`,
  "- Any Google account with a YouTube channel also works."
].join("\n")
const betaNotes = "Pre-release 1.99.2 of 2.0.0, self-distributed to testers. Same build instructions."

const API = "https://addons.mozilla.org/api/v5"
const TIMEOUT = "AbortSignal.timeout(30_000)"

/** The script with AMO at `origin` and, for the hang test, a shorter timeout. Nothing else differs. */
function scriptFor(origin: string, timeout?: string): string {
  expect(scriptSource.split(API)).toHaveLength(2)
  const source = scriptSource.replace(API, `${origin}/api/v5`)
  if (timeout === undefined) return source
  expect(source.split(TIMEOUT)).toHaveLength(2)
  return source.replace(TIMEOUT, `AbortSignal.timeout(${timeout})`)
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex")

const directories: string[] = []
const servers: FakeAmo[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function fakeAmo(mode: Mode = "store", tls?: Certificate): Promise<FakeAmo> {
  const server = await startFakeAmo(mode, tls)
  servers.push(server)
  return server
}

function writeMetadata(dir: string, notes: string) {
  const metadata = { version: { release_notes: { "en-US": "Release notes." }, approval_notes: notes } }
  writeFileSync(join(dir, "dist/amo-metadata.json"), JSON.stringify(metadata, null, 2) + "\n")
}

/** A reviewer job's runner: the sparse checkout, the artifact, RUNNER_TEMP, HOME, and Bun on PATH. */
function workspace(source: string, notes?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-"))
  directories.push(dir)
  for (const sub of ["scripts", "dist", "_temp", "_home", "_bin"]) mkdirSync(join(dir, sub))
  writeFileSync(join(dir, "scripts/amo-reviewer-notes.ts"), source)
  symlinkSync(process.execPath, join(dir, "_bin/bun"))
  if (notes !== undefined) writeMetadata(dir, notes)
  return dir
}

type Options = { login?: string; digest?: string; bunDigest?: string; amoKeys?: boolean; env?: Record<string, string> }

/**
 * Runs a step's real `run:` block as GitHub does, plus `-x`, so stderr traces
 * every command line it spawns. The step's own `env:` decides which dummy
 * reaches which name; a missing secret is empty, as on GitHub.
 */
async function runStep(step: Step, dir: string, { login = rawLogin, digest, bunDigest = "", amoKeys = true, env: extra = {} }: Options = {}) {
  const dummies: Record<string, string> = {
    "${{ secrets.AMO_REVIEWER_LOGIN }}": login,
    "${{ vars.REVIEWER_NOTES_SHA256 }}": digest ?? sha256(readFileSync(join(dir, "scripts/amo-reviewer-notes.ts"))),
    "${{ vars.BUN_SHA256 }}": bunDigest,
    "${{ env.AMO_GUID }}": release.env!.AMO_GUID!,
    "${{ secrets.FIREFOX_JWT_ISSUER }}": amoKeys ? jwtIssuer : "",
    "${{ secrets.FIREFOX_JWT_SECRET }}": amoKeys ? jwtSecret : "",
    "${{ needs.meta.outputs.version }}": "2.0.0"
  }
  const env: Record<string, string> = {
    PATH: `${join(dir, "_bin")}:/usr/bin:/bin`,
    HOME: join(dir, "_home"),
    GITHUB_WORKSPACE: dir,
    RUNNER_TEMP: join(dir, "_temp"),
    ...extra
  }
  for (const [name, expression] of Object.entries(step.env!)) {
    if (!(expression in dummies)) throw new Error(`the test has no dummy for ${name}: ${expression}`)
    env[name] = dummies[expression]!
  }
  const child = Bun.spawn([bash, "--noprofile", "--norc", "-eo", "pipefail", "-x", "-c", step.run!], {
    cwd: dir, env, stdout: "pipe", stderr: "pipe"
  })
  const timer = setTimeout(() => child.kill(), 20_000)
  const [stdout, trace, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  clearTimeout(timer)
  return { exit, stdout, trace }
}

/** Runs the script by itself, as `bun` would without the step around it. */
async function runScript(dir: string, args: string[], env: Record<string, string>) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "scripts/amo-reviewer-notes.ts", ...args], {
    cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: join(dir, "_home"), ...env }, stdout: "pipe", stderr: "pipe"
  })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { exit, stdout, stderr }
}

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort()
}

type Reference = { at: string; expression: string }

/**
 * Every use of the secrets context and of the job token in every workflow, and
 * where it sits: `github.token`, or `github` whole, as `toJSON(github)` carries
 * the token too. Steps are named by their name or action.
 */
function credentialReferences(): Reference[] {
  const found: Reference[] = []
  const visit = (value: unknown, at: string[], isExpression: boolean) => {
    if (typeof value === "string") {
      const expressions = isExpression ? [value] : [...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map(match => match[1]!)
      for (const expression of expressions) {
        for (const match of expression.matchAll(/\bsecrets\b(?:\.[A-Za-z_][\w-]*)?|(?<![\w.-])github(?:\.token\b|(?![\w.-]))/g)) {
          found.push({ at: at.join(" > "), expression: match[0] })
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        const step = typeof item === "object" && item !== null ? (item as Step) : {}
        visit(item, [...at, step.name ?? step.uses ?? String(index)], false)
      })
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (key === "secrets") found.push({ at: [...at, key].join(" > "), expression: "secrets:" })
        visit(item, [...at, key], key === "if")
      }
    }
  }
  for (const [file, workflow] of Object.entries(workflows)) visit(workflow, [file], false)
  return found
}

describe("the leak check", () => {
  test("finds each value in every form a log could carry it", () => {
    for (const [name, value] of Object.entries(sensitive)) {
      const carried = [
        value,
        JSON.stringify({ notes: value }),
        JSON.stringify(JSON.stringify({ notes: value })),
        `curl --data-raw '${JSON.stringify(JSON.stringify(value))}'`,
        new URLSearchParams({ notes: value }).toString(),
        `https://example.invalid/?notes=${encodeURIComponent(value)}`,
        ...["", "a", "ab"].map(prefix => Buffer.from(`${prefix}${value} and more`).toString("base64")),
        ...["", "a", "ab"].map(prefix => Buffer.from(`${prefix}${value} and more`).toString("base64url")),
        `logged as ${value.replaceAll(" ", "")}`
      ]
      for (const text of carried) expect({ name, found: leaks(text).includes(name) }).toEqual({ name, found: true })
    }
  })
})

describe("the workflows", () => {
  test("read secrets and the job token only by name, never in bulk or by a computed name", () => {
    const bulk = credentialReferences().filter(({ expression }) => expression !== "github.token" && !/^secrets\.[A-Za-z_][\w-]*$/.test(expression))
    expect(bulk).toEqual([])
  })

  test("hold no secret or job token in a workflow- or job-level env, where every step would see it", () => {
    const wide = credentialReferences().filter(({ at }) => at.includes(" > env > ") && !at.includes(" > steps > "))
    expect(wide).toEqual([])
  })

  test("give AMO_REVIEWER_LOGIN only to the two reviewer steps, each through its own env", () => {
    expect(credentialReferences().filter(reference => reference.expression === "secrets.AMO_REVIEWER_LOGIN").map(reference => reference.at)).toEqual([
      "release.yml > jobs > check-reviewer-login > steps > Check the reviewer test account > env > AMO_REVIEWER_LOGIN",
      "release.yml > jobs > fill-reviewer-notes > steps > Put the reviewer test account into the reviewer notes > env > AMO_REVIEWER_LOGIN"
    ])
  })

  // The test below reads environment names as written, and only this repository's workflows.
  test("name each environment literally, and call reusable workflows only from this repository", () => {
    const hidden = Object.entries(workflows).flatMap(([file, workflow]) =>
      Object.entries(workflow.jobs).flatMap(([id, job]) => {
        const environment = typeof job.environment === "string" ? job.environment : job.environment?.name
        return [
          ...(environment?.includes("${{") ? [`${file} > ${id} > environment`] : []),
          ...(job.uses !== undefined && !job.uses.startsWith("./.github/workflows/") ? [`${file} > ${id} > uses`] : [])
        ]
      })
    )
    expect(hidden).toEqual([])
  })

  test("let only the two reviewer jobs into the amo-reviewer environment", () => {
    const users = Object.entries(workflows).flatMap(([file, workflow]) =>
      Object.entries(workflow.jobs)
        .filter(([, job]) => (typeof job.environment === "string" ? job.environment : job.environment?.name)?.toLowerCase() === "amo-reviewer")
        .map(([id]) => `${file} > ${id}`)
    )
    expect(users).toEqual(reviewerJobs.map(id => `release.yml > ${id}`))
  })

  test("hold no digest of the script; the owner sets it in vars.REVIEWER_NOTES_SHA256", () => {
    for (const text of Object.values(workflowTexts)) expect(text).not.toMatch(/\b[0-9a-f]{64}\b/)
    for (const step of [checkStep, fillStep]) expect(step.env!.REVIEWER_NOTES_SHA256).toBe("${{ vars.REVIEWER_NOTES_SHA256 }}")
  })
})

describe("the reviewer jobs", () => {
  // Each job's whole condition once G28 is on. A prefix check would pass `false && … || anything`.
  const gates: Record<string, string> = {
    "check-reviewer-login":
      "github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.meta.outputs.release == 'true' && needs.meta.outputs.channel == 'stable' && vars.PUBLISH_AMO == 'true'",
    "fill-reviewer-notes": "needs.check-reviewer-login.result == 'success' && needs.submit-amo.result == 'success'"
  }

  test("stay off until the owner approves G28", () => {
    for (const id of reviewerJobs) expect({ id, if: release.jobs[id]!.if }).toEqual({ id, if: `false && ${gates[id]}` })
  })

  test("can't be turned on while an action in them is unpinned", () => {
    for (const id of reviewerJobs) {
      const job = release.jobs[id]!
      const unpinned = job.steps!.some(step => step.uses && !/@[0-9a-f]{40}$/.test(step.uses))
      const allowed = unpinned ? [`false && ${gates[id]}`] : [`false && ${gates[id]}`, gates[id]]
      expect({ id, allowed: allowed.includes(String(job.if)) }).toEqual({ id, allowed: true })
    }
  })

  test("check out only the script, keep no credentials, and run nothing else", () => {
    for (const id of reviewerJobs) {
      const steps = release.jobs[id]!.steps!
      expect(steps.map(step => step.uses?.replace(/@.*/, "") ?? step.name)).toEqual([
        "actions/checkout",
        "oven-sh/setup-bun",
        "actions/download-artifact",
        loginStep(id).name
      ])
      expect(steps[0]!.with).toEqual({ "sparse-checkout": "/scripts/amo-reviewer-notes.ts", "sparse-checkout-cone-mode": false, "persist-credentials": false })
    }
  })

  test("install the Bun that package.json declares, without a cache", () => {
    const declared = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager: string }).packageManager
    for (const id of reviewerJobs) {
      expect(release.jobs[id]!.steps![1]!.with).toEqual({ "bun-version": declared.replace(/^bun@/, ""), "no-cache": true })
    }
  })

  test("check before submit-amo, which a failed check stops, and fill once AMO has the version", () => {
    const submit = release.jobs["submit-amo"]!
    expect(submit.needs).toContain("check-reviewer-login")
    expect(String(submit.if)).toContain("(needs.check-reviewer-login.result == 'success' || needs.check-reviewer-login.result == 'skipped')")
    expect(release.jobs["fill-reviewer-notes"]!.needs).toEqual(expect.arrayContaining(["check-reviewer-login", "submit-amo"]))
  })

  test("never expand the login on a command line", () => {
    for (const step of [checkStep, fillStep]) {
      expect(step.run).not.toMatch(/\$\{?AMO_REVIEWER_LOGIN/)
      expect(step.run).not.toContain("secrets.")
    }
  })
})

describe("CODEOWNERS", () => {
  // Every file the owner's approval covers (the design's "What the owner approves").
  const approved = [
    ".github/CODEOWNERS",
    ".github/workflows/release.yml",
    ".github/workflows/ci.yml",
    "scripts/amo-reviewer-notes.ts",
    "tests/integration/amo-reviewer-notes.test.ts",
    "tests/integration/fixtures/fake-amo.ts",
    ".audit/2.0-build/ci-reviewer-credentials-mutations.sh",
    ".audit/2.0-build/ci-reviewer-credentials-design.md",
    "docs/development/releasing.md",
    "package.json"
  ]

  test("sends every file the approval covers to the owner, as GitHub reads it", () => {
    const rules = readFileSync(join(root, ".github/CODEOWNERS"), "utf8")
      .split("\n")
      .map(line => line.replace(/#.*/, "").trim())
      .filter(Boolean)
      .map(line => {
        const [pattern = "", ...owners] = line.split(/\s+/)
        return { glob: new Bun.Glob(pattern.replace(/^\//, "")), owners }
      })
    // The last matching line wins, and a line with no owner leaves the file unowned.
    const owners = (path: string) => rules.findLast(rule => rule.glob.match(path))?.owners ?? []
    expect(approved.filter(path => !existsSync(join(root, path)))).toEqual([])
    expect(approved.map(path => ({ path, owners: owners(path) }))).toEqual(approved.map(path => ({ path, owners: ["@Alioun"] })))
  })
})

describe("the CI step that runs these tests", () => {
  const steps = workflows["ci.yml"]!.jobs.build!.steps!
  const proof = steps.find(step => step.run?.includes("./tests/integration/amo-reviewer-notes.test.ts"))!

  test("runs before bun install, so nothing installed can reach it", () => {
    const install = steps.findIndex(step => /\bbun install\b/.test(step.run ?? ""))
    expect(steps.indexOf(proof)).toBeGreaterThan(-1)
    expect(steps.indexOf(proof)).toBeLessThan(install)
  })

  // A stand-in for this file, beside a bunfig.toml that preloads and a tsconfig.json that redirects node:fs.
  test("loads no bunfig.toml preload and no tsconfig.json from the checkout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-ci-"))
    directories.push(dir)
    for (const sub of ["tests/integration", "_temp", "_bin"]) mkdirSync(join(dir, sub), { recursive: true })
    symlinkSync(process.execPath, join(dir, "_bin/bun"))
    const preloaded = join(dir, "_preloaded")
    const redirected = join(dir, "_redirected")
    writeFileSync(join(dir, "tests/integration/amo-reviewer-notes.test.ts"), [
      'import { expect, test } from "bun:test"',
      'import { existsSync } from "node:fs"',
      'test("stand-in", () => expect(existsSync).toBeFunction())'
    ].join("\n") + "\n")
    writeFileSync(join(dir, "_preload.ts"), `require("node:fs").writeFileSync(${JSON.stringify(preloaded)}, "")\n`)
    writeFileSync(join(dir, "_planted.ts"), [
      'const fs = process.getBuiltinModule("node:fs")',
      `fs.writeFileSync(${JSON.stringify(redirected)}, "")`,
      "export const { existsSync } = fs"
    ].join("\n") + "\n")
    writeFileSync(join(dir, "bunfig.toml"), '[test]\npreload = ["./_preload.ts"]\n')
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "*": ["./_planted.ts"] } } }))

    const child = Bun.spawn([bash, "--noprofile", "--norc", "-eo", "pipefail", "-c", proof.run!], {
      cwd: dir,
      env: { PATH: `${join(dir, "_bin")}:/usr/bin:/bin`, HOME: join(dir, "_temp"), RUNNER_TEMP: join(dir, "_temp") },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ exit, ran: /\b1 pass\b/.test(stdout + stderr), preloaded: existsSync(preloaded), redirected: existsSync(redirected) }).toEqual({
      exit: 0,
      ran: true,
      preloaded: false,
      redirected: false
    })
  })
})

describe("the script", () => {
  test("imports only Node built-ins and has no way to spawn a process", () => {
    const imports = new Bun.Transpiler({ loader: "ts" }).scanImports(scriptSource).map(found => found.path)
    expect(imports).toEqual(["node:crypto", "node:fs"])
    // The scanner lists only literal names, so every way to load a module by a computed one is banned.
    expect(scriptSource).not.toMatch(/\bBun\.|child_process|process\.(binding|dlopen)|getBuiltinModule|import\.meta\.require|\bimport\(|\brequire\(/)
  })

  const unsafe: [string, string][] = [
    ["BUN_CONFIG_VERBOSE_FETCH", "curl"],
    ["BUN_OPTIONS", "--smol"],
    ["NODE_TLS_REJECT_UNAUTHORIZED", "0"],
    ["NODE_EXTRA_CA_CERTS", "/dev/null"],
    ["SSL_CERT_FILE", "/dev/null"],
    ["SSLKEYLOGFILE", "/dev/null"],
    ["HTTPS_PROXY", "http://127.0.0.1:9"],
    ["http_proxy", "http://127.0.0.1:9"]
  ]
  test.each(unsafe)("refuses to run with %s set, before AMO hears anything", async (name, value) => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const run = await runScript(dir, ["fill", "2.0.0", "dist/amo-metadata.json"], {
      AMO_REVIEWER_LOGIN: rawLogin,
      FIREFOX_EXTENSION_ID: release.env!.AMO_GUID!,
      FIREFOX_JWT_ISSUER: jwtIssuer,
      FIREFOX_JWT_SECRET: jwtSecret,
      [name]: value
    })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: environment-unsafe (a BUN_, NODE_, SSL_CERT_, SSLKEYLOGFILE or proxy variable is set)\n" })
    expect(amo.requests).toEqual([])
    expect(leaks(run.stdout + run.stderr)).toEqual([])
  })

  test("a version that isn't a release number is a usage error, before anything is read", async () => {
    const run = await runScript(workspace(scriptSource, fullNotes), ["fill", "2.0", "dist/amo-metadata.json"], { AMO_REVIEWER_LOGIN: rawLogin })
    expect(run).toEqual({ exit: 2, stdout: "", stderr: "usage: amo-reviewer-notes.ts check <metadata file> | fill <version> <metadata file>\n" })
  })
})

describe("the check step", () => {
  test("passes a well-formed login without touching AMO, and prints nothing of it", async () => {
    const amo = await fakeAmo()
    const run = await runStep(checkStep, workspace(scriptFor(amo.origin), fullNotes))
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: ready\n" })
    expect(run.trace).toMatch(/\n\+ exec \S+\/_bin\/bun --no-env-file --config=empty\.toml --tsconfig-override=empty\.json amo-reviewer-notes\.ts check /)
    expect(amo.requests).toEqual([])
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("skips the beta template, which asks for no account, even with no login set", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, betaNotes), { login: "" })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: skipped (the notes have no test-account placeholders)\n" })
  })

  test("accepts a login stored with Windows line endings", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { login: rawLogin.replaceAll("\n", "\r\n") })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: ready\n" })
  })

  const malformed: [string, string, string][] = [
    ["a missing login", "", "login-missing (AMO_REVIEWER_LOGIN is not set)"],
    ["three lines", `${login.email}\n${login.password}\n${login.code1}\n`, "login-malformed (expected 4 lines, got 3)"],
    ["five lines", `${rawLogin}${login.code1}\n`, "login-malformed (expected 4 lines, got 5)"],
    ["an e-mail without a domain", `dummy-reviewer\n${login.password}\n${login.code1}\n${login.code2}\n`, "login-malformed (line 1 is not an e-mail address)"],
    ["a padded password", `${login.email}\n ${login.password}\n${login.code1}\n${login.code2}\n`, "login-malformed (line 2 is empty or padded)"],
    ["an empty password", `${login.email}\n\n${login.code1}\n${login.code2}\n`, "login-malformed (line 2 is empty or padded)"],
    ["a short first code", `${login.email}\n${login.password}\n0000 111\n${login.code2}\n`, "login-malformed (line 3 is not an 8-digit backup code)"],
    ["a lettered second code", `${login.email}\n${login.password}\n${login.code1}\ndummy-code\n`, "login-malformed (line 4 is not an 8-digit backup code)"],
    ["one code twice", `${login.email}\n${login.password}\n${login.code1}\n00001111\n`, "login-malformed (lines 3 and 4 are the same code)"]
  ]
  test.each(malformed)("fails %s with a fixed line that quotes none of it", async (_, value, code) => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { login: value })
    expect(run).toMatchObject({ exit: 1, stdout: `::error::reviewer-notes: ${code}\n` })
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("fails a template that asks for only part of the account", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, "- {email} / {password}"))
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: template-incomplete (the notes lack {code1}, {code2})\n" })
  })

  test("fails when the artifact has no readable metadata", async () => {
    const run = await runStep(checkStep, workspace(scriptSource))
    expect(run).toMatchObject({
      exit: 1,
      stdout: "::error::reviewer-notes: notes-unreadable (the metadata file is missing, not JSON, or its approval_notes is not text)\n"
    })
  })

  test("refuses to run a script that isn't at the owner's digest", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { digest: "f".repeat(64) })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::amo-reviewer-notes.ts is not the approved version (G28)\n" })
    expect(run.trace).not.toContain("+ exec ")
  })

  test.each([["unset", ""], ["not a digest", "dummy-digest-0000"]])("refuses to run while vars.REVIEWER_NOTES_SHA256 is %s", async (_, digest) => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { digest })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::vars.REVIEWER_NOTES_SHA256 is not a SHA-256 digest (G28)\n" })
    expect(run.trace).not.toContain("+ exec ")
  })
})

describe("the Bun check", () => {
  test("runs the script once Bun matches vars.BUN_SHA256", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { bunDigest: sha256(readFileSync(process.execPath)) })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: ready\n" })
  })

  test.each(reviewerJobs)("%s refuses a Bun that isn't at vars.BUN_SHA256", async id => {
    const amo = await fakeAmo()
    const run = await runStep(loginStep(id), workspace(scriptFor(amo.origin), fullNotes), { bunDigest: "f".repeat(64) })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::bun is not the approved build (G28)\n" })
    expect(run.trace).not.toContain("+ exec ")
    expect(amo.requests).toEqual([])
  })

  test("refuses a vars.BUN_SHA256 that isn't a digest", async () => {
    const run = await runStep(checkStep, workspace(scriptSource, fullNotes), { bunDigest: "dummy-digest-0000" })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::vars.BUN_SHA256 is not a SHA-256 digest (G28)\n" })
    expect(run.trace).not.toContain("+ exec ")
  })
})

describe("the fill step", () => {
  test("sends AMO the filled notes once, as a signed PATCH of that version", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes))
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(run.trace).toMatch(/\n\+ exec \S+\/_bin\/bun --no-env-file --config=empty\.toml --tsconfig-override=empty\.json amo-reviewer-notes\.ts fill 2\.0\.0 /)
    expect(leaks(run.stdout + run.trace)).toEqual([])

    expect(amo.requests).toHaveLength(1)
    const [request] = amo.requests as [(typeof amo.requests)[number]]
    expect(request.method).toBe("PATCH")
    expect(request.path).toBe("/api/v5/addons/addon/%7Bcc70cd21-2cc6-444b-bd89-496909346091%7D/versions/v2.0.0/")
    expect(request.contentType).toBe("application/json")
    expect(JSON.parse(request.body)).toEqual({ approval_notes: filledNotes })
    expect(leaks(request.body)).toEqual(["email", "password", "code1", "code2"])

    const [scheme, token = ""] = request.authorization!.split(" ")
    const [header = "", payload = "", signature] = token.split(".")
    expect(scheme).toBe("JWT")
    expect(createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")).toBe(signature!)
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ iss: jwtIssuer })
  })

  test("spawns mktemp, cp and shasum without the login or the AMO keys", async () => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const seen = join(dir, "_seen")
    for (const tool of ["mktemp", "cp", "shasum"]) {
      const stub = [
        "#!/bin/sh",
        `echo ${tool} >> "${seen}"`,
        ...["AMO_REVIEWER_LOGIN", "FIREFOX_EXTENSION_ID", "FIREFOX_JWT_ISSUER", "FIREFOX_JWT_SECRET"].map(
          name => `[ -z "\${${name}+set}" ] || echo "${tool} sees ${name}" >> "${seen}"`
        ),
        `exec ${Bun.which(tool, { PATH: "/usr/bin:/bin" })} "$@"`
      ]
      writeFileSync(join(dir, "_bin", tool), stub.join("\n") + "\n", { mode: 0o755 })
    }
    const run = await runStep(fillStep, dir)
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(readFileSync(seen, "utf8").split("\n").filter(Boolean).sort()).toEqual(["cp", "mktemp", "shasum"])
  })

  test("the build's metadata never holds the login, and filling leaves it in no file", async () => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin))
    mkdirSync(join(dir, "store/notes"), { recursive: true })
    mkdirSync(join(dir, "store/release-notes"))
    writeFileSync(join(dir, "store/notes/reviewer-full.md"), fullNotes + "\n")
    writeFileSync(join(dir, "store/release-notes/2.0.0.md"), "Release notes.\n")
    // Without --strict: a release build fails on the four placeholders until amo-metadata.ts lets them through.
    const build = spawnSync(
      process.execPath,
      ["--no-env-file", join(root, "scripts/amo-metadata.ts"), "--version", "2.0.0", "--kind", "major", "--channel", "stable", "--out", "dist/amo-metadata.json"],
      { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: join(dir, "_home"), AMO_REVIEWER_LOGIN: rawLogin }, encoding: "utf8" }
    )
    expect(build.status).toBe(0)
    const archived = readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")
    expect(JSON.parse(archived).version.approval_notes).toBe(fullNotes)
    expect(leaks(archived + build.stdout + build.stderr)).toEqual([])

    const run = await runStep(fillStep, dir)
    expect(run.exit).toBe(0)
    expect(JSON.parse(amo.requests[0]!.body)).toEqual({ approval_notes: filledNotes })
    expect(readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")).toBe(archived)
    // HOME and the script's working directory are inside the workspace too, so this covers Bun's caches.
    const leaked = files(dir).flatMap(file => leaks(readFileSync(join(dir, file), "latin1")).map(name => `${file}: ${name}`))
    expect(leaked).toEqual([])
  })

  const answers: [string, Mode, 0 | 1, string][] = [
    ["stores the notes without echoing them", "store-silently", 0, "reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)"],
    ["answers 200 with a cut-off body that quotes the notes", "garble", 0, "reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)"],
    ["keeps other notes", "keep-other", 1, "::error::reviewer-notes: upload-unconfirmed (AMO kept different notes)"],
    ["rejects the notes, quoting them", "reject", 1, "::error::reviewer-notes: upload-failed (AMO answered 400)"],
    ["drops the connection once it has the request", "reset", 1, "::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)"]
  ]
  test.each(answers)("when AMO %s, prints only a fixed line", async (_, mode, exit, line) => {
    const amo = await fakeAmo(mode)
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes))
    expect(run).toMatchObject({ exit, stdout: `${line}\n` })
    expect(amo.requests).toHaveLength(1)
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("never follows a redirect, which would carry the notes to another host", async () => {
    const amo = await fakeAmo("redirect")
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes))
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)\n" })
    expect(amo.requests).toHaveLength(1)
    expect(amo.redirected).toEqual([])
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("gives up on an AMO that never answers", async () => {
    const amo = await fakeAmo("hang")
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin, "1_000"), fullNotes))
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)\n" })
    expect(amo.requests).toHaveLength(1)
  })

  test("a missing login fails before any request", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes), { login: "" })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: login-missing (AMO_REVIEWER_LOGIN is not set)\n" })
    expect(amo.requests).toEqual([])
  })

  test("missing AMO keys fail before any request, naming only the variables", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes), { amoKeys: false })
    expect(run).toMatchObject({
      exit: 1,
      stdout: "::error::reviewer-notes: amo-keys-missing (FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set)\n"
    })
    expect(amo.requests).toEqual([])
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("leaves the beta's notes alone", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), betaNotes), { login: "" })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: skipped (the notes have no test-account placeholders)\n" })
    expect(amo.requests).toEqual([])
  })
})

// What an earlier step, or a tampered runner, could leave behind for the
// reviewer steps: variables in GITHUB_ENV and files where Bun looks for config.
describe("the fill step on a tampered runner", () => {
  let certificate: Certificate
  beforeAll(() => {
    certificate = untrustedCertificate()
  })
  afterAll(() => certificate.remove())

  /** A preload that leaves a marker if Bun ever runs it beside the login. */
  function plantPreload(dir: string): { planted: string; ran: () => boolean } {
    const planted = join(dir, "_planted.ts")
    const marker = join(dir, "_preloaded")
    writeFileSync(planted, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")\n`)
    return { planted, ran: () => existsSync(marker) }
  }

  test("strips BUN_CONFIG_VERBOSE_FETCH, with which Bun prints each request and its body", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes), { env: { BUN_CONFIG_VERBOSE_FETCH: "curl" } })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  test("strips BUN_OPTIONS, which could preload code beside the login", async () => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const preload = plantPreload(dir)
    const run = await runStep(fillStep, dir, { env: { BUN_OPTIONS: `--preload ${preload.planted}` } })
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(preload.ran()).toBe(false)
  })

  test("loads no bunfig.toml planted in the workspace, RUNNER_TEMP or HOME", async () => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const preload = plantPreload(dir)
    for (const config of ["bunfig.toml", "scripts/bunfig.toml", "_temp/bunfig.toml", "_home/bunfig.toml", "_home/.bunfig.toml"]) {
      writeFileSync(join(dir, config), `preload = [${JSON.stringify(preload.planted)}]\n`)
    }
    const run = await runStep(fillStep, dir)
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(preload.ran()).toBe(false)
  })

  // Bash 3.2 lists such a name in compgen -e, and unset then stops the step.
  // Homebrew's bash 5.3.20 leaves it out, so it reaches the script, which refuses it.
  test("stops before AMO hears anything when a BUN_ name isn't a shell identifier", async () => {
    const amo = await fakeAmo()
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes), { env: { "BUN_CONFIG_VERBOSE-FETCH": "curl" } })
    expect(run.exit).toBe(1)
    expect(amo.requests).toEqual([])
    expect(leaks(run.stdout + run.trace)).toEqual([])
  })

  // Bun reads the nearest tsconfig.json or jsconfig.json above the script. Its
  // paths can send even node:fs to planted code, which then runs beside the login.
  test.each(["_temp/tsconfig.json", "_temp/jsconfig.json", "tsconfig.json", "jsconfig.json"])("loads no %s planted above the script", async config => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const planted = join(dir, "_planted.ts")
    const marker = join(dir, "_redirected")
    writeFileSync(planted, [
      'const fs = process.getBuiltinModule("node:fs")',
      `fs.writeFileSync(${JSON.stringify(marker)}, "")`,
      "export const { readFileSync } = fs",
      'export const { createHmac, randomUUID } = process.getBuiltinModule("node:crypto")'
    ].join("\n") + "\n")
    writeFileSync(join(dir, config), JSON.stringify({ compilerOptions: { paths: { "*": [planted] } } }))
    const run = await runStep(fillStep, dir)
    expect(run).toMatchObject({ exit: 0, stdout: "reviewer-notes: filled (AMO version 2.0.0, confirmed)\n" })
    expect(existsSync(marker)).toBe(false)
  })

  test.each(["NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS"])("strips %s, so a certificate nothing trusts stays untrusted", async name => {
    const amo = await fakeAmo("store", certificate)
    const value = name === "NODE_EXTRA_CA_CERTS" ? certificate.certPath : "0"
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin), fullNotes), { env: { [name]: value } })
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)\n" })
    expect(amo.requests).toEqual([])
  })
})
