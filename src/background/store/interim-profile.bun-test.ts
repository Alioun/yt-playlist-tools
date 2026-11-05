import { expect, test } from "bun:test"
import { inspectInterimProfile } from "./interim-profile"
import type { InterimProfileInput } from "./interim-profile"
import { planLegacyStartup } from "./legacy-startup"
import { defaultSetup } from "../../shared/model/defaults"

const account = "account000000001"
const other = "account000000002"
const missing = "account000000003"
const playlist = "PLsynthetic-first"
const kept = "PLsynthetic-kept"
const channel = `UC${"c".repeat(22)}`
const extraChannel = `UC${"d".repeat(22)}`
function emptyBody() {
  return { playlists: [], shortcutPlaylistId: "", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
}
function choices() {
  return {
    playlists: [playlist, "WL"],
    shortcutPlaylistId: "WL",
    filters: {
      [playlist]: { mode: "allow", enabled: true, channels: [channel] },
      [kept]: { mode: "deny", enabled: false, channels: [channel] }
    },
    labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" }, [extraChannel]: { title: "Unreferenced label" } },
    cachedPlaylists: [{ id: playlist, title: "Synthetic playlist" }],
    cachedAt: 9000
  }
}
function input(body: unknown = choices()): InterimProfileInput {
  return { accountBodies: { [`account:${account}`]: body }, canonicalDocuments: {} }
}
function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
}

export function exerciseInterimProfile(inspect: typeof inspectInterimProfile = inspectInterimProfile, startup: typeof planLegacyStartup = planLegacyStartup) {
  const observations: Record<string, unknown> = {}
  let checks = 0
  function equal(actual: unknown, expected: unknown) {
    expect(actual).toEqual(expected)
    checks++
  }
  function observe(name: string, supplied: InterimProfileInput) {
    const before = JSON.stringify(supplied)
    freeze(supplied)
    const result = inspect(supplied)
    equal(JSON.stringify(supplied), before)
    observations[name] = result
    equal(Object.keys(result).sort(), ["accounts", "historicalAuthorization", "index", "issues", "kind", "markers"])
    return result
  }

  const complete = observe("body-before-index-failure", input())
  equal(complete.kind, "inspection")
  equal(complete.accounts.length, 1)
  equal(complete.accounts[0]?.indexPositions, [])
  equal(complete.historicalAuthorization, "unknown")
  const facts = complete.accounts[0]?.body
  if (facts?.kind !== "inspection") throw new Error("Expected inspected choices")
  equal(facts.facts.playlists, [playlist, "WL"])
  equal(facts.facts.shortcut, { playlist: "WL", provenance: "not-supplied" })
  equal(facts.facts.filters, [
    { playlist, mode: "allow", on: true, channels: [channel], kept: false },
    { playlist: kept, mode: "deny", on: false, channels: [channel], kept: true }
  ])
  equal(facts.facts.labels, [
    { channel, title: "Synthetic channel", handle: "@synthetic", referenced: true },
    { channel: extraChannel, title: "Unreferenced label", referenced: false }
  ])
  equal(facts.facts.cache, { playlists: [{ id: playlist, title: "Synthetic playlist" }], at: 9000 })
  equal(facts.facts.choices, "present")

  const inventory = observe("complete-independent-inventory", {
    accountBodies: { [`account:${account}`]: choices(), [`account:${other}`]: emptyBody() },
    savedAccountKeys: [account, missing, account],
    canonicalDocuments: {}
  })
  equal(
    inventory.accounts.map(entry => [entry.identity, entry.bodyPosition, entry.indexPositions, entry.body.kind]),
    [
      [{ kind: "representable", key: account }, 0, [0, 2], "inspection"],
      [{ kind: "representable", key: other }, 1, [], "inspection"],
      [{ kind: "representable", key: missing }, null, [1], "index-only"]
    ]
  )
  equal(
    inventory.index.map(entry => entry.duplicateOf),
    [null, null, 0]
  )

  const stamp = { v: 1, gen: "synthetic-gen", at: 1, by: "synthetic-device" }
  const canonical = {
    [`doc:setup:${account}`]: { ...stamp, data: { ...defaultSetup(), autoAdd: [{ pl: "PLcanonical", takes: "videos" }] } },
    [`doc:filter:${account}:${playlist}`]: { ...stamp, deleted: true },
    [`doc:setup:${other}`]: { ...stamp, deleted: true }
  }
  const overlap = observe("live-and-tombstone-overlap", { ...input(), canonicalDocuments: canonical })
  equal(overlap.accounts[0]?.overlaps, [
    { position: 0, kind: "live", document: "setup" },
    { position: 1, kind: "tombstone", document: "filter" }
  ])
  equal(overlap.accounts[0]?.body, complete.accounts[0]?.body)
  const deleted = observe("setup-tombstone", { ...input(), canonicalDocuments: { [`doc:setup:${account}`]: { ...stamp, deleted: true } } })
  equal(deleted.accounts[0]?.overlaps, [{ position: 0, kind: "tombstone", document: "setup" }])
  const indexedOverlap = observe("index-only-overlap", { accountBodies: {}, savedAccountKeys: [other], canonicalDocuments: canonical })
  equal(indexedOverlap.accounts[0]?.body, { kind: "index-only" })
  equal(indexedOverlap.accounts[0]?.overlaps, [{ position: 2, kind: "tombstone", document: "setup" }])

  for (const [name, supplied] of [
    ["empty", emptyBody()],
    ["cache-only", { ...emptyBody(), cachedPlaylists: [{ id: "WL", title: "Cached only" }], cachedAt: 123 }],
    ["labels-only", { ...emptyBody(), labels: { [channel]: { title: "Label only" } } }]
  ] as const) {
    const result = observe(name, input(supplied))
    const body = result.accounts[0]?.body
    equal(body?.kind === "inspection" && body.facts.choices, "empty")
  }
  const offOnly = observe("kept-off-only", input({ ...emptyBody(), filters: { [kept]: { mode: "deny", enabled: false, channels: [] } } }))
  const off = offOnly.accounts[0]?.body
  equal(off?.kind === "inspection" && off.facts.choices, "present")

  const longKey = `${account}x`
  const syntax = observe("accepted-interim-key-never-rekeyed", {
    accountBodies: { [`account:${longKey}`]: choices(), "account:bad!": emptyBody() },
    savedAccountKeys: [longKey, "bad!", 3],
    canonicalDocuments: canonical
  })
  equal(
    syntax.accounts.map(entry => entry.identity),
    [{ kind: "unsupported" }, { kind: "invalid" }]
  )
  equal(
    syntax.accounts.map(entry => entry.overlaps),
    [[], []]
  )
  equal(syntax.index[2]?.identity, { kind: "invalid" })
  equal(syntax.issues[0], { kind: "unsupported", field: "accountBodies[0].key", reason: "account-key-not-representable" })

  for (const [name, body] of [
    ["unknown-body", { ...choices(), futureField: "rejected-title-sentinel" }],
    ["unknown-filter", { ...choices(), filters: { [kept]: { mode: "deny", enabled: false, channels: [], future: true } } }],
    ["unknown-label", { ...choices(), labels: { [channel]: { title: "Synthetic", future: true } } }],
    ["unknown-cache", { ...choices(), cachedPlaylists: [{ id: "WL", title: "Synthetic", future: true }] }]
  ]) {
    const result = observe(String(name), input(body))
    equal(result.kind, "unsupported")
    equal(result.accounts[0]?.body, { kind: "unsupported" })
    equal(result.issues[0]?.reason, "unknown-field")
  }
  for (const [name, body, field] of [
    ["null-body", null, "accountBodies[0]"],
    ["missing-fields", {}, "accountBodies[0].playlists"],
    ["bad-playlist", { ...choices(), playlists: ["rejected-playlist-sentinel!"] }, "accountBodies[0].playlists[0]"],
    ["long-playlist", { ...choices(), playlists: ["P".repeat(101)] }, "accountBodies[0].playlists[0]"],
    ["bad-shortcut", { ...choices(), shortcutPlaylistId: 9 }, "accountBodies[0].shortcutPlaylistId"],
    ["bad-filter-key", { ...choices(), filters: { "rejected-playlist!": {} } }, "accountBodies[0].filters[0].playlist"],
    ["bad-mode", { ...choices(), filters: { [kept]: { mode: "off", enabled: false, channels: [] } } }, "accountBodies[0].filters[0].mode"],
    ["bad-channel", { ...choices(), filters: { [kept]: { mode: "deny", enabled: false, channels: ["rejected-channel!"] } } }, "accountBodies[0].filters[0].channels[0]"],
    ["bad-label-title", { ...choices(), labels: { [channel]: { title: { value: "rejected-title!" } } } }, "accountBodies[0].labels[0].title"],
    ["bad-label-key", { ...choices(), labels: { "rejected-channel!": { title: "rejected-title!" } } }, "accountBodies[0].labels[0].channel"],
    ["bad-cache", { ...choices(), cachedPlaylists: [{ id: "WL", title: 2 }] }, "accountBodies[0].cachedPlaylists[0].title"],
    ["bad-time", { ...choices(), cachedAt: -1 }, "accountBodies[0].cachedAt"]
  ] as const) {
    const result = observe(name, input(body))
    equal(result.kind, "invalid")
    equal(result.accounts[0]?.body, { kind: "invalid" })
    equal(result.issues[0]?.field, field)
    equal(JSON.stringify(result.issues).includes("rejected-"), false)
  }
  const mixed = observe("invalid-body-does-not-hide-later-body", {
    accountBodies: { "account:invalid!": null, [`account:${other}`]: choices() },
    savedAccountKeys: [],
    canonicalDocuments: {}
  })
  equal(mixed.accounts.length, 2)
  equal(mixed.accounts[1]?.body.kind, "inspection")
  const duplicates = observe("choices-never-deduplicated", input({ ...choices(), playlists: ["WL", "WL"] }))
  const duplicateBody = duplicates.accounts[0]?.body
  equal(duplicateBody?.kind === "inspection" && duplicateBody.facts.playlists, ["WL", "WL"])

  for (const consent of [-1, 0, 1]) {
    const result = observe(`consent-is-not-history-${consent}`, { ...input(), sessionConsent: consent, sessionGeneration: "synthetic-generation", legacyClaimed: true })
    equal(result.historicalAuthorization, "unknown")
    equal(result.markers, { consent, generation: "present", legacyClaimed: true })
    equal(result.accounts[0]?.body, complete.accounts[0]?.body)
  }
  for (const authorized of [false, true]) {
    equal(observe(`captured-history-${authorized}`, { ...input(), historicalAuthorization: authorized }).historicalAuthorization, authorized ? "known-authorized" : "known-unauthorized")
  }
  for (const [name, supplied, field] of [
    ["bad-bodies", { ...input(), accountBodies: [] }, "accountBodies"],
    ["bad-index", { ...input(), savedAccountKeys: {} }, "savedAccountKeys"],
    ["bad-canonical", { ...input(), canonicalDocuments: [] }, "canonicalDocuments"],
    [
      "bad-canonical-record",
      { ...input(), canonicalDocuments: { [`doc:filter:${account}:${kept}`]: { ...stamp, data: { channels: [["rejected-channel!", "rejected-title!"]] } } } },
      "canonicalDocuments[0]"
    ],
    ["bad-consent", { ...input(), sessionConsent: 2 }, "sessionConsent"],
    ["bad-generation", { ...input(), sessionGeneration: 3 }, "sessionGeneration"],
    ["bad-claimed", { ...input(), legacyClaimed: "true" }, "legacyClaimed"],
    ["bad-history", { ...input(), historicalAuthorization: "unknown" }, "historicalAuthorization"]
  ] as const) {
    const result = observe(name, supplied)
    equal(result.kind, "invalid")
    equal(result.issues[0]?.field, field)
    equal(JSON.stringify(result.issues).includes("rejected-"), false)
  }
  equal(observe("newer-canonical", { ...input(), canonicalDocuments: { [`doc:setup:${account}`]: { ...stamp, v: 2 } } }).kind, "unsupported")

  const context = { deviceId: "synthetic-device", settingsGen: "synthetic-gen", at: 1, shortcutId: "save01", platform: { browser: "firefox", os: "linux" }, commands: [] } as const
  for (const marker of [`account:${account}`, "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]) {
    const result = startup(
      { schema: 1, device: undefined, settingsDocument: undefined, unclaimed: undefined, legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [marker] },
      context
    )
    equal(result, { kind: "unsupported-state", reason: "interim-profile" })
    observations[`startup-${marker}`] = result
  }
  return { checks, observations }
}

test("interim inventory retains every body and reports feasibility without migration authority", () => {
  exerciseInterimProfile()
})
