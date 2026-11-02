import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash, createHmac } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Certificate, type FakeAmo, type Mode, startFakeAmo, untrustedCertificate } from "./fixtures/fake-amo.ts"

// Credential-free (G28): every value below is a fake, and each child process
// gets an environment built from scratch, so no real secret can reach it.

const root = resolve(import.meta.dir, "../..")
/** True for a directory, false for a file, undefined for nothing. The one path helper the file test allows besides literal joins, and it reads no file. */
const isDirectory = (path: string) => statSync(join(root, path), { throwIfNoEntry: false })?.isDirectory()
/** A path inside the repository with no `.` or `..` part and no wildcard. */
const repositoryPath = String.raw`\.?[\w-][\w.-]*(?:/\.?[\w-][\w.-]*)*`
const script = join(root, "scripts/amo-reviewer-notes.ts")
const scriptSource = readFileSync(script, "utf8")
const bash = Bun.which("bash")!

type Step = { name?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string>; run?: string }
type Permissions = string | Record<string, string>
type Job = { needs?: string[]; if?: unknown; environment?: string | { name: string }; uses?: string; permissions?: Permissions; env?: Record<string, string>; steps?: Step[] }
type Workflow = { env?: Record<string, string>; defaults?: unknown; permissions?: Permissions; jobs: Record<string, Job> }

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

const owner = "@Alioun"

/**
 * A CODEOWNERS line in the only forms this repository uses: a path from the
 * repository's top with no wildcard, which owns that file or everything in
 * that directory, or such a path ending in `/**`, which owns everything in
 * it, then any number of @logins. GitHub's CODEOWNERS ignores some gitignore
 * syntax, such as `!`, `[ ]` and `{a,b}`, so any other form is unread here,
 * and a test fails it rather than guess how GitHub reads it.
 */
type CodeOwnersRule = { path: string; inside: boolean; owners: string[] }
function codeOwnersRule(line: string): CodeOwnersRule | undefined {
  const match = new RegExp(String.raw`^/(${repositoryPath})(/\*\*)?((?: +@[\w-]+)*)$`).exec(line)
  return match ? { path: match[1]!, inside: match[2] !== undefined, owners: match[3]!.split(" ").filter(Boolean) } : undefined
}

/** Whether `rule` covers `path`: the path itself or anything inside it, or for a `/**` rule only what is inside it. */
function codeOwnersMatch(rule: CodeOwnersRule, path: string): boolean {
  return path.startsWith(`${rule.path}/`) || (!rule.inside && path === rule.path)
}

const codeOwnersLines = readFileSync(join(root, ".github/CODEOWNERS"), "utf8").split("\n").filter(line => line !== "" && !line.startsWith("#"))
const codeOwnerRules = codeOwnersLines.flatMap(line => codeOwnersRule(line) ?? [])

/** The owners GitHub requests for the file `path`. The last matching line wins, and a line with no owner leaves the file unowned. */
const codeOwners = (path: string) => codeOwnerRules.findLast(rule => codeOwnersMatch(rule, path))?.owners ?? []

/**
 * Whether the owner owns every file a directory holds now or later: the last
 * line that covers the whole directory names only the owner, and so does
 * every line for something inside it.
 */
function ownsDirectory(directory: string): boolean {
  const covering = codeOwnerRules.findLast(rule => directory === rule.path || directory.startsWith(`${rule.path}/`))
  const inner = codeOwnerRules.filter(rule => rule.path.startsWith(`${directory}/`))
  return [covering, ...inner].every(rule => rule?.owners.join() === owner)
}

type Reference = { at: string; expression: string }

/**
 * Every use of the secrets context and of the job token in every workflow, and
 * where it sits: `github.token`, or `github` whole, as `toJSON(github)` carries
 * the token too. GitHub reads context and secret names in any case, so this
 * does too. Steps are named by their name or action.
 */
function credentialReferences(): Reference[] {
  const found: Reference[] = []
  const visit = (value: unknown, at: string[], isExpression: boolean) => {
    if (typeof value === "string") {
      const expressions = isExpression ? [value] : [...value.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map(match => match[1]!)
      for (const expression of expressions) {
        for (const match of expression.matchAll(/\bsecrets\b(?:\.[a-z_][\w-]*)?|(?<![\w.-])github(?:\.token\b|(?![\w.-]))/gi)) {
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
        if (key.toLowerCase() === "secrets") found.push({ at: [...at, key].join(" > "), expression: "secrets:" })
        visit(item, [...at, key], key === "if")
      }
    }
  }
  for (const [file, workflow] of Object.entries(workflows)) visit(workflow, [file], false)
  return found
}

// Code no one code-owns could fake the proof from inside this process, so the
// proof loads and runs only what the approval covers. Bun tries .tsx before
// .ts for a name without an extension. Every repository path is a join of
// the repository's top and one literal path, so the test can read each one.
// Any other use of the top, such as a join of two parts, resolve() or a
// template string, fails.
describe("this file", () => {
  const source = readFileSync(import.meta.path, "utf8")

  test("imports the fake AMO by its full name, and reads or runs only files the approval covers", () => {
    const relative = new Bun.Transpiler({ loader: "ts" }).scanImports(source).map(found => found.path).filter(path => path.startsWith("."))
    expect(relative).toEqual(["./fixtures/fake-amo.ts"])
    // The [o] keeps each pattern from matching its own text.
    const literal = new RegExp(String.raw`join\(r[o]ot, "(${repositoryPath})"\)`, "g")
    const allowed = [
      /^const r[o]ot = resolve\(import\.meta\.dir, "\.\.\/\.\."\)$/,
      /^const isDirectory = \(path: string\) => statSync\(join\(r[o]ot, path\), \{ throwIfNoEntry: false \}\)\?\.isDirectory\(\)$/,
      literal
    ]
    expect(source.split("\n").filter(line => /\broot\b/.test(allowed.reduce((text, pattern) => text.replace(pattern, ""), line)))).toEqual([])
    const used = [...source.matchAll(literal)].map(match => match[1]!)
    const owned = (path: string) => (isDirectory(path) ? ownsDirectory(path) : isDirectory(path) === false && codeOwners(path).join() === owner)
    expect(used.length).toBeGreaterThan(0)
    expect(used.filter(path => !owned(path))).toEqual([])
  })
})

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
    const bulk = credentialReferences().filter(({ expression }) => expression.toLowerCase() !== "github.token" && !/^secrets\.[a-z_][\w-]*$/i.test(expression))
    expect(bulk).toEqual([])
  })

  test("hold no secret or job token in a workflow- or job-level env, where every step would see it", () => {
    const wide = credentialReferences().filter(({ at }) => at.includes(" > env > ") && !at.includes(" > steps > "))
    expect(wide).toEqual([])
  })

  test("give AMO_REVIEWER_LOGIN only to the two reviewer steps, each through its own env", () => {
    expect(credentialReferences().filter(reference => reference.expression.toLowerCase() === "secrets.amo_reviewer_login").map(reference => reference.at)).toEqual([
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

  // Checkout writes its token into .git/config unless told not to, where every later step can read it.
  test("check out without keeping the token in every job that can write", () => {
    const writes = (permissions: Permissions | undefined) =>
      typeof permissions === "string" ? permissions === "write-all" : Object.values(permissions ?? {}).includes("write")
    const kept = Object.entries(workflows).flatMap(([file, workflow]) =>
      Object.entries(workflow.jobs)
        .filter(([, job]) => writes(job.permissions ?? workflow.permissions))
        .flatMap(([id, job]) =>
          (job.steps ?? []).filter(step => step.uses?.startsWith("actions/checkout@") && step.with?.["persist-credentials"] !== false).map(() => `${file} > ${id}`)
        )
    )
    expect(kept).toEqual([])
  })

  test("set no workflow-level defaults, which would change every run step's shell or directory", () => {
    expect(Object.entries(workflows).filter(([, workflow]) => "defaults" in workflow).map(([file]) => file)).toEqual([])
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

  // A moved tag in g28-proof could fake the proof the approval rests on.
  test("can't be turned on while an action in them or in g28-proof is unpinned", () => {
    const proofSteps = workflows["ci.yml"]!.jobs["g28-proof"]!.steps!
    for (const id of reviewerJobs) {
      const job = release.jobs[id]!
      const unpinned = [...job.steps!, ...proofSteps].some(step => step.uses && !/@[0-9a-f]{40}$/.test(step.uses))
      const allowed = unpinned ? [`false && ${gates[id]}`] : [`false && ${gates[id]}`, gates[id]]
      expect({ id, allowed: allowed.includes(String(job.if)) }).toEqual({ id, allowed: true })
    }
  })

  // Whole, so no container, services, defaults, permissions, shell, working
  // directory or continue-on-error can slip in. The gate tests compare each if.
  test("hold exactly the keys and values the approval covers, on a named runner image", () => {
    const needs: Record<string, string[]> = { "check-reviewer-login": ["meta", "build"], "fill-reviewer-notes": ["meta", "check-reviewer-login", "submit-amo"] }
    const env: Record<string, Record<string, string>> = {
      "check-reviewer-login": {
        AMO_REVIEWER_LOGIN: "${{ secrets.AMO_REVIEWER_LOGIN }}",
        REVIEWER_NOTES_SHA256: "${{ vars.REVIEWER_NOTES_SHA256 }}",
        BUN_SHA256: "${{ vars.BUN_SHA256 }}"
      },
      "fill-reviewer-notes": {
        AMO_REVIEWER_LOGIN: "${{ secrets.AMO_REVIEWER_LOGIN }}",
        FIREFOX_EXTENSION_ID: "${{ env.AMO_GUID }}",
        FIREFOX_JWT_ISSUER: "${{ secrets.FIREFOX_JWT_ISSUER }}",
        FIREFOX_JWT_SECRET: "${{ secrets.FIREFOX_JWT_SECRET }}",
        VERSION: "${{ needs.meta.outputs.version }}",
        REVIEWER_NOTES_SHA256: "${{ vars.REVIEWER_NOTES_SHA256 }}",
        BUN_SHA256: "${{ vars.BUN_SHA256 }}"
      }
    }
    for (const id of reviewerJobs) {
      const { steps = [], if: _, ...job } = release.jobs[id]! as Job & Record<string, unknown>
      expect({ id, keys: Object.keys(release.jobs[id]!).sort() }).toEqual({ id, keys: ["environment", "if", "needs", "runs-on", "steps", "timeout-minutes"] })
      expect({ id, job }).toEqual({ id, job: { needs: needs[id], "runs-on": "ubuntu-24.04", "timeout-minutes": 10, environment: "amo-reviewer" } })
      expect({ id, steps: steps.map(step => Object.keys(step).sort()) }).toEqual({ id, steps: [["uses", "with"], ["uses", "with"], ["uses", "with"], ["env", "name", "run"]] })
      expect({ id, download: steps[2]!.with }).toEqual({ id, download: { name: "release-${{ needs.meta.outputs.version }}", path: "dist" } })
      expect({ id, env: steps[3]!.env }).toEqual({ id, env: env[id] })
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
      expect(step.run).not.toMatch(/secrets\./i)
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
  // A file planted later in a directory the approval covers must reach the owner too.
  const approvedDirectories = [".github/workflows", "tests/integration/fixtures"]

  test("holds only lines in the forms both GitHub and this test read alike", () => {
    expect(codeOwnersLines.filter(line => codeOwnersRule(line) === undefined)).toEqual([])
  })

  const unread = [
    "!/docs/development/releasing.md",
    "/scripts/{amo-reviewer-notes,amo-metadata}.ts @dummy-other",
    "/scripts/amo-reviewer-notes.[t]s @dummy-other",
    "/tests/*/fixtures/** @dummy-other",
    "/docs/* @dummy-other",
    "releasing.md @dummy-other",
    "/docs/ @dummy-other",
    "/docs/../scripts @dummy-other",
    "/docs @org/team",
    "/docs @dummy-other # trailing comment"
  ]
  test.each(unread)("leaves %s unread", line => {
    expect(codeOwnersRule(line)).toBeUndefined()
  })

  const examples: [string, string, boolean][] = [
    ["/scripts/amo-reviewer-notes.ts", "scripts/amo-reviewer-notes.ts", true],
    ["/scripts/amo-reviewer-notes.ts", "x/scripts/amo-reviewer-notes.ts", false],
    ["/scripts/amo-reviewer-notes.ts", "scripts/amo-reviewer-notes.tsx", false],
    ["/apps/github", "apps/github/x.ts", true],
    ["/apps/github", "apps/githubx/x.ts", false],
    ["/.github/workflows/**", ".github/workflows/ci.yml", true],
    ["/.github/workflows/**", ".github/workflows/a/b.yml", true],
    ["/.github/workflows/**", ".github/workflows", false],
    ["/tests/integration/fixtures/**", "tests/integration/fixtures/a/b.tsx", true]
  ]
  test.each(examples)("reads %s against %s as GitHub does", (pattern, path, matches) => {
    expect(codeOwnersMatch(codeOwnersRule(`${pattern} ${owner}`)!, path)).toBe(matches)
  })

  test("sends every file the approval covers to the owner, as GitHub reads it", () => {
    expect(approved.filter(path => isDirectory(path) !== false)).toEqual([])
    expect(approvedDirectories.filter(directory => isDirectory(directory) !== true)).toEqual([])
    expect(approved.map(path => ({ path, owners: codeOwners(path) }))).toEqual(approved.map(path => ({ path, owners: [owner] })))
    expect(approvedDirectories.filter(directory => !ownsDirectory(directory))).toEqual([])
  })
})

// The owner runs these by hand before storing anything, so each must print
// true only for the settings releasing.md asks for, and fail closed otherwise.
describe("the owner's setup commands in releasing.md", () => {
  const releasing = readFileSync(join(root, "docs/development/releasing.md"), "utf8")
  const checks = [...releasing.matchAll(/gh api "?repos\/Alioun\/yt-playlist-tools\/([^\s"]+)"? --jq '([^']+)'/g)].map(([, endpoint, filter]) => ({
    endpoint: endpoint!,
    filter: filter!
  }))
  const filter = (endpoint: string, includes = "") => checks.find(check => check.endpoint === endpoint && check.filter.includes(includes))!.filter
  const jq = (program: string, input: unknown) => {
    const run = spawnSync(Bun.which("jq")!, [program], { input: JSON.stringify(input), encoding: "utf8" })
    return run.status === 0 ? run.stdout.trim() : `jq exited ${run.status}`
  }
  const without = <T extends object>(value: T, key: keyof T) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

  test("the environment checks print true only for amo-reviewer as set up", () => {
    const check = filter("environments/amo-reviewer")
    const environment = {
      can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "Alioun" } }] }, { type: "branch_policy" }]
    }
    expect(jq(check, environment)).toBe("true")
    const broken: [string, unknown][] = [
      ["administrators may bypass", { ...environment, can_admins_bypass: true }],
      ["the bypass setting is missing", without(environment, "can_admins_bypass")],
      ["protected branches may deploy", { ...environment, deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }],
      ["someone else reviews", { ...environment, protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "dummy-reviewer" } }] }] }]
    ]
    for (const [name, value] of broken) expect({ name, prints: jq(check, value) }).toEqual({ name, prints: "false" })

    const branches = filter("environments/amo-reviewer/deployment-branch-policies")
    expect(jq(branches, { branch_policies: [{ name: "main", type: "branch" }] })).toBe("true")
    expect(jq(branches, { branch_policies: [{ name: "main", type: "branch" }, { name: "dev", type: "branch" }] })).toBe("false")
    expect(jq(branches, { branch_policies: [{ name: "main", type: "tag" }] })).toBe("false")
  })

  test("the repository-variable check prints true only when no repository variable can stand in for a digest", () => {
    const check = filter("actions/variables")
    const variable = (name: string) => ({ name, value: "true" })
    expect(jq(check, { total_count: 2, variables: [variable("PUBLISH_AMO"), variable("PUBLISH_CWS")] })).toBe("true")
    expect(jq(check, { total_count: 2, variables: [variable("PUBLISH_AMO"), variable("REVIEWER_NOTES_SHA256")] })).toBe("false")
    expect(jq(check, { total_count: 1, variables: [variable("BUN_SHA256")] })).toBe("false")
    expect(jq(check, { total_count: 1, variables: [variable("reviewer_notes_sha256")] })).toBe("false")
    expect(jq(check, { total_count: 1, variables: [variable("Bun_Sha256")] })).toBe("false")
    expect(jq(check, { message: "Not Found" })).not.toBe("true")
  })

  test("the ruleset check prints true only when main needs the owner's review of its last push and the g28-proof check", () => {
    const check = filter("rules/branches/main", "pull_request")
    const parameters = {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: true,
      require_last_push_approval: true,
      required_review_thread_resolution: false
    }
    const status = (context: string) => ({
      type: "required_status_checks",
      ruleset_id: 42,
      parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: "lint" }, { context }] }
    })
    const rules = [{ type: "pull_request", ruleset_id: 42, parameters }, status("g28-proof"), { type: "non_fast_forward", ruleset_id: 42 }, { type: "deletion", ruleset_id: 7 }]
    expect(jq(check, rules)).toBe("true")
    expect(jq(check, [])).toBe("false")
    expect(jq(check, [rules[0]])).toBe("false")
    expect(jq(check, [rules[0], status("build")])).toBe("false")
    const weakened: [keyof typeof parameters, number | boolean][] = [
      ["required_approving_review_count", 0],
      ["dismiss_stale_reviews_on_push", false],
      ["require_code_owner_review", false],
      ["require_last_push_approval", false]
    ]
    for (const [name, value] of weakened) {
      expect({ name, prints: jq(check, [{ type: "pull_request", parameters: { ...parameters, [name]: value } }, status("g28-proof")]) }).toEqual({ name, prints: "false" })
      expect({ name, missing: jq(check, [{ type: "pull_request", parameters: without(parameters, name) }, status("g28-proof")]) }).toEqual({ name, missing: "false" })
    }
    expect(jq(filter("rules/branches/main", "ruleset_id"), rules).split("\n")).toEqual(["7", "42"])
  })

  // The block as written, with a stub gh that answers from fixtures through
  // jq, in bash, in bash without word splitting as zsh runs a script, and in
  // zsh where it is installed.
  test("the ruleset commands print a line per ruleset in zsh and bash, and false when none applies to main or gh fails", () => {
    const block = [...releasing.matchAll(/```sh\n([\s\S]*?)```/g)].map(match => match[1]!).find(block => block.includes("rulesets/$id"))!
    const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-ruleset-"))
    directories.push(dir)
    mkdirSync(join(dir, "bin"))
    writeFileSync(join(dir, "bin/gh"), [
      "#!/bin/sh",
      'case $2 in */rules/branches/main) file=rules.json ;; */rulesets/*) file="ruleset-${2##*/}.json" ;; *) exit 1 ;; esac',
      `[ -f "${dir}/$file" ] || exit 1`,
      `exec ${Bun.which("jq")!} -r "$4" "${dir}/$file"`
    ].join("\n") + "\n", { mode: 0o755 })
    const zsh = Bun.which("zsh")
    const shells: [string, string[]][] = [
      ["bash", [bash, "--noprofile", "--norc", "-c", block]],
      ["bash without word splitting", [bash, "--noprofile", "--norc", "-c", `IFS=\n${block}`]],
      ...(zsh ? [["zsh", [zsh, "-f", "-c", block]] as [string, string[]]] : [])
    ]
    const run = (rules: unknown, rulesets: Record<number, unknown>) => {
      for (const file of readdirSync(dir).filter(file => file.endsWith(".json"))) rmSync(join(dir, file))
      if (rules !== undefined) writeFileSync(join(dir, "rules.json"), JSON.stringify(rules))
      for (const [id, ruleset] of Object.entries(rulesets)) writeFileSync(join(dir, `ruleset-${id}.json`), JSON.stringify(ruleset))
      return shells.map(([shell, [command, ...args]]) => ({
        shell,
        lines: spawnSync(command!, args, { cwd: dir, env: { PATH: join(dir, "bin") }, encoding: "utf8" }).stdout.split("\n").filter(Boolean)
      }))
    }
    const each = (lines: string[]) => shells.map(([shell]) => ({ shell, lines }))
    const parameters = { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: true, require_last_push_approval: true }
    const rules = [
      { type: "pull_request", ruleset_id: 42, parameters },
      { type: "required_status_checks", ruleset_id: 42, parameters: { required_status_checks: [{ context: "g28-proof" }] } },
      { type: "deletion", ruleset_id: 7 }
    ]
    const ruleset = (id: number) => ({ id, enforcement: "active", bypass_actors: [] })
    expect(run(rules, { 7: ruleset(7), 42: ruleset(42) })).toEqual(each(["true", "true", "true"]))
    expect(run(rules, { 42: ruleset(42) })).toEqual(each(["true", "false", "true"]))
    expect(run([], {})).toEqual(each(["false", "false"]))
    expect(run(undefined, {})).toEqual(each(["false"]))
  })

  test("the bypass check prints true only for a ruleset no one but the owner can bypass", () => {
    const check = filter("rulesets/$id")
    const admin = { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }
    const ruleset = { id: 42, enforcement: "active", bypass_actors: [admin] }
    expect(jq(check, ruleset)).toBe("true")
    expect(jq(check, { ...ruleset, bypass_actors: [] })).toBe("true")
    const broken: [string, unknown][] = [
      ["a GitHub App may bypass", { ...ruleset, bypass_actors: [admin, { actor_id: 1234, actor_type: "Integration", bypass_mode: "always" }] }],
      ["a deploy key may bypass", { ...ruleset, bypass_actors: [admin, { actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }] }],
      ["the write role may bypass", { ...ruleset, bypass_actors: [{ ...admin, actor_id: 4 }] }],
      ["the bypass list is hidden", without(ruleset, "bypass_actors")],
      ["the ruleset only evaluates", { ...ruleset, enforcement: "evaluate" }]
    ]
    for (const [name, value] of broken) expect({ name, prints: jq(check, value) }).toEqual({ name, prints: "false" })
  })

  test("the digest command stores the approved script's digest, and nothing when git show fails", () => {
    const command = [...releasing.matchAll(/```sh\n([\s\S]*?)```/g)].map(match => match[1]!).find(block => block.includes("gh variable set REVIEWER_NOTES_SHA256"))!
    const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-digest-"))
    directories.push(dir)
    const repo = join(dir, "repo")
    const bin = join(dir, "bin")
    const recorded = join(dir, "gh-arguments")
    mkdirSync(join(repo, "scripts"), { recursive: true })
    mkdirSync(bin)
    writeFileSync(join(repo, "scripts/amo-reviewer-notes.ts"), scriptSource)
    const git = Bun.which("git")!
    const gitEnv = { PATH: "/usr/bin:/bin", HOME: dir, GIT_CONFIG_NOSYSTEM: "1" }
    for (const args of [["init", "-q"], ["add", "."], ["-c", "user.name=G28", "-c", "user.email=g28@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "approved"]]) {
      expect(spawnSync(git, args, { cwd: repo, env: gitEnv }).status).toBe(0)
    }
    // Only the stub gh and the tools the command names are on PATH, so no real gh can run.
    writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${recorded}"\n`, { mode: 0o755 })
    for (const tool of ["shasum", "cut"]) symlinkSync(Bun.which(tool, { PATH: "/usr/bin:/bin" })!, join(bin, tool))
    symlinkSync(git, join(bin, "git"))
    const run = (commit: string) =>
      spawnSync(bash, ["--noprofile", "--norc", "-c", command.replaceAll("<approved commit>", commit)], { cwd: repo, env: { ...gitEnv, PATH: bin }, encoding: "utf8" })

    expect(run("HEAD").status).toBe(0)
    expect(readFileSync(recorded, "utf8").split("\n").filter(Boolean)).toEqual([
      "variable", "set", "REVIEWER_NOTES_SHA256", "--env", "amo-reviewer", "--repo", "Alioun/yt-playlist-tools", "--body", sha256(scriptSource)
    ])
    rmSync(recorded)
    expect(run("0000000000000000000000000000000000000000").status).not.toBe(0)
    expect(existsSync(recorded)).toBe(false)
  })
})

describe("the CI job that runs these tests", () => {
  const ci = workflows["ci.yml"]!
  const job = ci.jobs["g28-proof"]!
  const proof = job.steps![2]!
  const expected = Number(/ tests="(\d+)" /.exec(proof.run!)?.[1])

  // A workflow-level env such as BUN_OPTIONS reaches every step, and a
  // trigger or permission the approval doesn't cover could change the run.
  test("ci.yml holds only the top-level keys the approval covers, with no env", () => {
    const { jobs: _, ...top } = ci as Workflow & Record<string, unknown>
    expect(top).toEqual({
      name: "CI",
      on: { push: { branches: ["dev", "main"] }, pull_request: null },
      permissions: { contents: "read" },
      concurrency: { group: "ci-${{ github.ref }}", "cancel-in-progress": true }
    })
  })

  // Whole, so no env, defaults, container, if or continue-on-error reaches
  // the job, and no step before the proof can write $GITHUB_ENV or install
  // anything. GitHub would still pass the check with continue-on-error or an
  // if that skips the step, and a shell entry could drop -e.
  test("runs checkout, setup-bun with the declared Bun and no cache, then the proof as a plain step, and nothing else", () => {
    expect(Object.keys(job).sort()).toEqual(["runs-on", "steps"])
    expect(job["runs-on" as keyof Job]).toBe("ubuntu-latest")
    expect(job.steps!.map(({ run, ...step }) => ({ ...step, run: typeof run }))).toEqual([
      { uses: "actions/checkout@v7", run: "undefined" },
      { uses: "oven-sh/setup-bun@v2", with: { "bun-version-file": "package.json", "no-cache": true }, run: "undefined" },
      { name: "Test the reviewer-login secret flow (G28)", run: "string" }
    ])
    expect(proof.run).toContain("./tests/integration/amo-reviewer-notes.test.ts")
  })

  // The main ruleset requires the check by its name, and release.yml and
  // pages.yml each have a build job, so a check named build could come from
  // either. A computed job name could take this one.
  test("is the only job in any workflow whose check is named g28-proof", () => {
    const named = Object.entries(workflows).flatMap(([file, workflow]) =>
      Object.entries(workflow.jobs).flatMap(([id, other]) => {
        const name = (other as Job & { name?: unknown }).name
        return [id, ...(name === undefined ? [] : [String(name)])]
          .filter(check => check.toLowerCase().includes("g28-proof") || check.includes("${{"))
          .map(check => `${file} > ${id} > ${check}`)
      })
    )
    expect(named).toEqual(["ci.yml > g28-proof > g28-proof"])
  })

  /** Runs the step's real run: block in a scratch checkout whose test file is a stand-in with `body`. */
  async function runProof(body: string, plant: (dir: string) => void = () => {}, env: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), "reviewer-notes-ci-"))
    directories.push(dir)
    for (const sub of ["tests/integration", "_temp", "_bin"]) mkdirSync(join(dir, sub), { recursive: true })
    symlinkSync(process.execPath, join(dir, "_bin/bun"))
    writeFileSync(join(dir, "tests/integration/amo-reviewer-notes.test.ts"), ['import { expect, test } from "bun:test"', 'import { existsSync } from "node:fs"', body].join("\n") + "\n")
    plant(dir)
    const child = Bun.spawn([bash, "--noprofile", "--norc", "-eo", "pipefail", "-c", proof.run!], {
      cwd: dir,
      env: { PATH: `${join(dir, "_bin")}:/usr/bin:/bin`, HOME: join(dir, "_temp"), RUNNER_TEMP: join(dir, "_temp"), ...env },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    return { dir, exit, output: stdout + stderr }
  }
  const tests = (count: number) => `for (let i = 0; i < ${count}; i++) test(\`stand-in \${i}\`, () => expect(existsSync).toBeFunction())`

  // A bunfig.toml that preloads and a tsconfig.json that redirects node:fs, beside a stand-in that passes.
  test("loads no bunfig.toml preload and no tsconfig.json from the checkout", async () => {
    const run = await runProof(tests(expected), dir => {
      writeFileSync(join(dir, "_preload.ts"), `require("node:fs").writeFileSync(${JSON.stringify(join(dir, "_preloaded"))}, "")\n`)
      writeFileSync(join(dir, "_planted.ts"), [
        'const fs = process.getBuiltinModule("node:fs")',
        `fs.writeFileSync(${JSON.stringify(join(dir, "_redirected"))}, "")`,
        "export const { existsSync } = fs"
      ].join("\n") + "\n")
      writeFileSync(join(dir, "bunfig.toml"), '[test]\npreload = ["./_preload.ts"]\n')
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "*": ["./_planted.ts"] } } }))
    })
    expect({
      exit: run.exit,
      ran: new RegExp(`\\b${expected} pass\\b`).test(run.output),
      preloaded: existsSync(join(run.dir, "_preloaded")),
      redirected: existsSync(join(run.dir, "_redirected"))
    }).toEqual({ exit: 0, ran: true, preloaded: false, redirected: false })
  })

  // As a workflow-level env, or a step that writes $GITHUB_ENV, would set them.
  // Bun reads BUN_OPTIONS even with --config.
  test("loads no preload that BUN_OPTIONS or NODE_OPTIONS names", async () => {
    const planted = await runProof(tests(expected), dir => {
      for (const name of ["_bun-options", "_node-options"]) {
        writeFileSync(join(dir, `${name}.ts`), `require("node:fs").writeFileSync(${JSON.stringify(join(dir, `${name}-ran`))}, "")\n`)
      }
    }, { BUN_OPTIONS: "--preload=./_bun-options.ts", NODE_OPTIONS: "--require=./_node-options.ts" })
    expect({
      exit: planted.exit,
      ran: new RegExp(`\\b${expected} pass\\b`).test(planted.output),
      bunOptions: existsSync(join(planted.dir, "_bun-options-ran")),
      nodeOptions: existsSync(join(planted.dir, "_node-options-ran"))
    }).toEqual({ exit: 0, ran: true, bunOptions: false, nodeOptions: false })
  })

  const short: [string, string, boolean][] = [
    ["one test fails", `test("fails", () => expect(1).toBe(2))\n${tests(expected - 1)}`, false],
    ["one test fewer runs", tests(expected - 1), true],
    ["one test is skipped", `test.skip("skipped", () => {})\n${tests(expected - 1)}`, true],
    ["the file exits 0 before any test", `process.exit(0)\n${tests(expected)}`, true]
  ]
  test.each(short)("fails when %s", async (_, body, counted) => {
    const run = await runProof(body)
    expect({ exit: run.exit, counted: run.output.includes(`::error::the G28 proof did not pass all ${expected} of its tests`) }).toEqual({ exit: 1, counted })
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

  test("filling leaves the login in no file", async () => {
    const amo = await fakeAmo()
    const dir = workspace(scriptFor(amo.origin), fullNotes)
    const archived = readFileSync(join(dir, "dist/amo-metadata.json"), "utf8")
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

  // Longer than runStep's 20-second kill, so a script with no timeout fails here, not by Bun's test timeout.
  test("gives up on an AMO that never answers", async () => {
    const amo = await fakeAmo("hang")
    const run = await runStep(fillStep, workspace(scriptFor(amo.origin, "1_000"), fullNotes))
    expect(run).toMatchObject({ exit: 1, stdout: "::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)\n" })
    expect(amo.requests).toHaveLength(1)
  }, 30_000)

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
