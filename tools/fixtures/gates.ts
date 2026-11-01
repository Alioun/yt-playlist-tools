// Every executable gate under tools/fixtures. scripts/run-fixture-gates.ts runs them, and
// tests/guards/fixture-gates.test.ts fails when a fixture test, consumer or type project has no entry here.
// Paths are relative to the fixture folder. Suites run with --config=<fixture>/bunfig.toml, which holds
// their preloads; a consumer uses the same file when it exists.

export type Checker = "tsc" | "svelte-check"

export type NegativeSource =
  | { readonly cases: string }
  | { readonly directivesIn: string; readonly codes: readonly number[] }
  | { readonly svelteFiles: Readonly<Record<string, number>> }

export type FixtureGate =
  | { readonly kind: "suite"; readonly fixture: string; readonly files: readonly string[]; readonly testTimeoutMs?: number; readonly timeoutMs?: number }
  | { readonly kind: "consumer"; readonly fixture: string; readonly variants?: readonly (readonly string[])[]; readonly expected?: string; readonly timeoutMs?: number }
  | { readonly kind: "library"; readonly fixture: string; readonly file: string; readonly importedBy: string }
  | { readonly kind: "types"; readonly fixture: string; readonly project: string; readonly checker: Checker; readonly timeoutMs?: number }
  | { readonly kind: "negatives"; readonly fixture: string; readonly project: string; readonly source: NegativeSource; readonly timeoutMs?: number }
  | { readonly kind: "script"; readonly fixture: string; readonly file: string; readonly args?: readonly string[]; readonly timeoutMs?: number }

const routes = [["--route=owner"], ["--route=native"], ["--route=wire"]] as const
const adapters = [["direct"], ["dom"]] as const
const tsc = (fixture: string, project = "tsconfig.json"): FixtureGate => ({ kind: "types", fixture, project, checker: "tsc" })
const svelte = (fixture: string, project = "tsconfig.json"): FixtureGate => ({ kind: "types", fixture, project, checker: "svelte-check" })
const consumer = (fixture: string, rest: Omit<Extract<FixtureGate, { kind: "consumer" }>, "kind" | "fixture"> = {}): FixtureGate => ({ kind: "consumer", fixture, ...rest })
const suite = (fixture: string, files: readonly string[], rest: Omit<Extract<FixtureGate, { kind: "suite" }>, "kind" | "fixture" | "files"> = {}): FixtureGate => ({ kind: "suite", fixture, files, ...rest })
const heavy = 540_000

export const fixtureGates: readonly FixtureGate[] = [
  consumer("account-removal-admission", { timeoutMs: heavy }),
  consumer("account-removal-execution", { timeoutMs: heavy }),
  consumer("account-removal-execution", { variants: [["--withdrawal-only"]], timeoutMs: heavy }),

  suite("accounts-label", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("accounts-label", { expected: "expected.jsonl" }),
  tsc("accounts-label"),

  consumer("add-feedback"),
  consumer("add-flow"),
  consumer("add-flow-session"),

  suite("auto-add-choice", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("auto-add-choice", { expected: "expected.jsonl" }),
  tsc("auto-add-choice"),

  consumer("claim-transaction"),

  suite("clear-all", ["owner.bun-test.ts", "rpc.bun-test.ts", "teardown.bun-test.ts"]),
  consumer("clear-all", { variants: [["direct"]], expected: "expected-direct.jsonl" }),
  consumer("clear-all", { variants: [["wire"]], expected: "expected-wire.jsonl" }),
  consumer("clear-all", { variants: [["receive"]], expected: "expected-receive.jsonl" }),
  tsc("clear-all"),
  { kind: "negatives", fixture: "clear-all", project: "negative-tsconfig.json", source: { cases: "negatives.json" } },

  consumer("device-lifecycle", { timeoutMs: heavy }),
  consumer("device-lifecycle", { variants: [["--withdrawal-only"]], timeoutMs: heavy }),

  consumer("extlink", { expected: "expected.jsonl" }),
  tsc("extlink"),

  consumer("feature-registry", { expected: "expected.stdout.json" }),
  tsc("feature-registry"),

  suite("feature-switches", ["boundaries.bun-test.ts", "consumer.bun-test.ts", "owner.bun-test.ts"], { testTimeoutMs: 60_000, timeoutMs: heavy }),
  consumer("feature-switches", { variants: routes, expected: "expected.jsonl" }),
  tsc("feature-switches"),

  consumer("first-edit-owner"),
  consumer("first-edit-provenance"),

  consumer("first-run-backend"),
  tsc("first-run-backend", "qualification.tsconfig.json"),

  suite("gateway-playlists", ["consumer.bun-test.ts", "gateway.bun-test.ts", "live.bun-test.ts", "signer.bun-test.ts"], { testTimeoutMs: 15_000 }),
  consumer("gateway-playlists", { variants: adapters, expected: "expected-output.jsonl" }),
  tsc("gateway-playlists"),

  consumer("gateway-reads", { variants: adapters }),
  tsc("gateway-reads"),
  { kind: "script", fixture: "gateway-reads", file: "check-source.py" },

  consumer("gateway-music", { variants: adapters, expected: "expected-output.jsonl" }),
  tsc("gateway-music"),

  suite("gateway-www-queue", ["consumer.bun-test.ts", "gateway.bun-test.ts"], { testTimeoutMs: 15_000 }),
  consumer("gateway-www-queue", { variants: adapters, expected: "expected-output.jsonl" }),
  tsc("gateway-www-queue"),

  suite("gather-controller", ["gather.bun-test.ts", "manual-completion.bun-test.ts"]),

  consumer("interim-conversion", { timeoutMs: heavy }),
  consumer("interim-conversion", { variants: [["--withdrawal-v2-only"]], timeoutMs: heavy }),

  consumer("interim-recovery-review", { timeoutMs: heavy }),

  suite("items-music", ["page-consumer.bun-test.ts"]),
  consumer("items-music", { variants: adapters, expected: "expected.jsonl" }),
  tsc("items-music"),

  suite("items-www", ["current-authority.bun-test.ts", "page-reads.bun-test.ts"]),
  consumer("items-www", { variants: adapters, expected: "expected.jsonl" }),
  tsc("items-www"),

  suite("key-settings", ["account-lifetime.bun-test.ts", "consumer.bun-test.ts", "owner.bun-test.ts", "recorder.bun-test.ts", "recovery.bun-test.ts", "sync.bun-test.ts", "wire.bun-test.ts"], { testTimeoutMs: 60_000, timeoutMs: heavy }),
  consumer("key-settings", { variants: routes, expected: "expected.jsonl" }),
  tsc("key-settings"),
  svelte("key-settings", "svelte.tsconfig.json"),
  { kind: "negatives", fixture: "key-settings", project: "tsconfig.json", source: { cases: "negatives.json" } },
  { kind: "negatives", fixture: "key-settings", project: "../feature-switches/tsconfig.json", source: { cases: "relocated-feature-negatives.json" } },

  suite("localization", ["qualification.bun-test.ts", "run.bun-test.ts"]),
  consumer("localization"),
  { kind: "script", fixture: "localization", file: "check-catalogue.ts" },
  { kind: "negatives", fixture: "localization", project: "../first-run-backend/qualification.tsconfig.json", source: { directivesIn: "../../../src/shared/i18n/i18n.type-test.ts", codes: [2322, 2345, 2353, 2554] } },

  suite("monitor", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("monitor", { expected: "expected.jsonl" }),
  tsc("monitor"),

  suite("music-ad-transport", ["wire.bun-test.ts"]),
  tsc("music-ad-transport"),

  consumer("native-runtime"),

  suite("owner-key-clear-reconciliation", ["owner.bun-test.ts"]),
  { kind: "negatives", fixture: "owner-key-clear-reconciliation", project: "negative-tsconfig.json", source: { cases: "negatives.json" } },

  suite("owner-services-reconciliation", ["consumer.bun-test.ts", "owner.bun-test.ts"], { testTimeoutMs: 60_000 }),
  consumer("owner-services-reconciliation", { expected: "expected.jsonl" }),
  tsc("owner-services-reconciliation"),
  { kind: "negatives", fixture: "owner-services-reconciliation", project: "tsconfig.json", source: { cases: "negatives.json" } },

  consumer("page-channel"),
  consumer("page-link", { variants: adapters }),

  svelte("picker-model"),

  suite("picker-ui", ["dom-diagnostic.bun-test.ts", "integrated.bun-test.ts"]),
  consumer("picker-ui", { expected: "expected-consumer.jsonl" }),
  svelte("picker-ui"),
  { kind: "negatives", fixture: "picker-ui", project: "tsconfig.json", source: { svelteFiles: { "negatives/FakeModel.svelte": 6, "negatives/OutcomeReceipt.svelte": 6, "negatives/SharedModel.svelte": 7, "negatives/RawAccount.svelte": 6, "negatives/ManyWithItem.svelte": 4, "negatives/Uncontrolled.svelte": 6, "negatives/MissingRelease.svelte": 6 } } },

  suite("playlists-cache", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("playlists-cache", { expected: "expected.json" }),
  tsc("playlists-cache"),

  consumer("pointer-keys", { expected: "expected.jsonl" }),
  tsc("pointer-keys"),

  consumer("registrar"),
  tsc("registrar"),

  consumer("runtime-rpc"),

  consumer("settings-file", { expected: "expected-stdout.jsonl" }),
  tsc("settings-file"),

  suite("settings-file-owner", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("settings-file-owner", { expected: "expected-stdout.jsonl" }),
  tsc("settings-file-owner"),

  suite("settings-import-execution", ["canonical.bun-test.ts", "consumer.bun-test.ts", "owner.bun-test.ts", "publication.bun-test.ts"], { testTimeoutMs: 10_000, timeoutMs: 1_200_000 }),
  consumer("settings-import-execution", { expected: "expected.jsonl" }),
  tsc("settings-import-execution"),

  suite("settings-import-plan", ["guard.bun-test.ts"], { testTimeoutMs: 60_000 }),
  consumer("settings-import-plan", { expected: "expected-stdout.jsonl" }),
  tsc("settings-import-plan"),

  { kind: "library", fixture: "setup-destination", file: "run.ts", importedBy: "src/background/store/store-composition.bun-test.ts" },

  suite("shared-options", ["consumer.bun-test.ts", "owner.bun-test.ts"], { testTimeoutMs: 60_000, timeoutMs: heavy }),
  consumer("shared-options", { expected: "expected.jsonl" }),
  tsc("shared-options"),
  { kind: "negatives", fixture: "shared-options", project: "negative-tsconfig.json", source: { cases: "negatives.json" } },

  consumer("site-card-menu", { expected: "expected.jsonl" }),
  tsc("site-card-menu"),

  consumer("site-core-lifecycle", { expected: "expected.jsonl" }),
  tsc("site-core-lifecycle"),
  svelte("site-core-lifecycle", "tsconfig.svelte.json"),

  tsc("site-queue-button"),
  { kind: "negatives", fixture: "site-queue-button", project: "tsconfig.json", source: { cases: "negatives.json" } },

  suite("site-toaster", ["architecture.bun-test.ts", "consumer.bun-test.ts", "dom.bun-test.ts", "model.bun-test.ts"]),
  consumer("site-toaster", { expected: "expected.jsonl" }),
  svelte("site-toaster"),
  { kind: "negatives", fixture: "site-toaster", project: "tsconfig.json", source: { cases: "negatives.json" } },

  consumer("starting-owner"),
  tsc("starting-owner", "qualification.tsconfig.json"),

  svelte("svelte-pilot"),
  svelte("svelte-pilot", "page-link/tsconfig.json"),

  consumer("sync-join-lookup"),

  suite("tab-projection", ["integration.bun-test.ts", "native.bun-test.ts"]),
  consumer("tab-projection"),
  tsc("tab-projection"),

  suite("tab-view", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("tab-view", { expected: "expected.jsonl" }),
  tsc("tab-view"),

  consumer("tabs"),
  tsc("tabs"),

  svelte("ui-foundation"),

  suite("ui-owner-reconciliation", ["consumer.bun-test.ts"]),
  consumer("ui-owner-reconciliation"),
  tsc("ui-owner-reconciliation", "qualification.tsconfig.json"),

  suite("ui-playlist-progressive", ["consumer.bun-test.ts", "progressive.bun-test.ts", "wire.bun-test.ts"]),
  consumer("ui-playlist-progressive"),
  tsc("ui-playlist-progressive", "qualification.tsconfig.json"),

  suite("ui-read-playlist-bridge", ["consumer.bun-test.ts"]),
  consumer("ui-read-playlist-bridge"),
  tsc("ui-read-playlist-bridge", "qualification.tsconfig.json"),

  suite("view-publication", ["consumer.bun-test.ts"], { testTimeoutMs: 10_000 }),
  consumer("view-publication", { expected: "expected.jsonl" }),
  tsc("view-publication"),

  consumer("withdrawn-document-recovery", { timeoutMs: heavy }),
  consumer("withdrawn-document-recovery", { variants: [["--playlist-v2-only"]], timeoutMs: 900_000 })
]

export function gateId(gate: FixtureGate): string {
  switch (gate.kind) {
    case "suite": return `${gate.fixture} suite`
    case "consumer": return `${gate.fixture} consumer${gate.variants ? ` ${gate.variants.map(variant => variant.join(" ")).join("|")}` : ""}`
    case "library": return `${gate.fixture} library ${gate.file}`
    case "types": return `${gate.fixture} types ${gate.project}`
    case "negatives": return `${gate.fixture} negatives ${"cases" in gate.source ? gate.source.cases : "directivesIn" in gate.source ? gate.source.directivesIn : "svelte files"}`
    case "script": return `${gate.fixture} script ${[gate.file, ...gate.args ?? []].join(" ")}`
  }
}
