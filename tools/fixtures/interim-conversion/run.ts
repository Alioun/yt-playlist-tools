import { decodeDocument, decodeFilter, decodeSettings, decodeSetup } from "../../../src/shared/model"
import { isJsonValue } from "../../../src/shared/contracts/json"
import { planInterimConversion } from "../../../src/background/store/interim-conversion"
import type { InterimConversionContext, InterimConversionInput } from "../../../src/background/store/interim-conversion"

if (process.argv.includes("--restart")) {
  const receipt: unknown = JSON.parse(await Bun.stdin.text())
  if (!isJsonValue(receipt)) throw new Error("Restart received non-JSON proposal data")
  process.stdout.write(JSON.stringify(receipt))
} else {
  const A = "AAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBB", C = "CCCCCCCCCCCCCCCC"
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
  const source = {
    accountBodies: {
      [`account:${A}`]: {
        playlists: ["PL_SECOND", "PL_FIRST"], shortcutPlaylistId: "WL",
        filters: { PL_KEPT: { mode: "deny", enabled: false, channels: [channel] } },
        labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" } },
        cachedPlaylists: [{ id: "PL_FIRST", title: "Synthetic playlist" }], cachedAt: 10
      },
      [`account:${B}`]: { playlists: ["PL_OTHER"], shortcutPlaylistId: "PL_OTHER_TARGET", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
    },
    savedAccountKeys: [A, C], sessionConsent: 1, sessionGeneration: "synthetic-session", legacyClaimed: false,
    globals: { playlists: ["PL_RETAINED_GLOBAL"], addToPlaylistID: "PL_RETAINED_TARGET", watchLaterShortcut: "Control+Shift+S", requiredWatchPercentage: 82, toastEnabled: false, queueButtonEnabled: true }
  }
  const input: InterimConversionInput = {
    schema: 1, source, canonical: { documents: {}, caches: {}, device: undefined, unclaimed: null },
    historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" }
  }
  const context: InterimConversionContext = {
    deviceId: "synthetic-device", at: 123, interimShortcutId: "conv01", platform: { browser: "firefox", os: "linux" }, commands: [],
    documentGenerations: { "doc:settings": "synthetic-settings", [`doc:setup:${A}`]: "synthetic-A", [`doc:filter:${A}:PL_KEPT`]: "synthetic-filter", [`doc:setup:${B}`]: "synthetic-B" }
  }
  const fixtures = [
    { name: "disjoint-account-proposal", input },
    { name: "explicit-global-recovery", input: { ...input, source: { ...source, legacyClaimed: true } } },
    { name: "canonical-deletion-refusal", input: { ...input, canonical: { ...input.canonical, documents: { [`doc:setup:${A}`]: { v: 1, gen: "existing-deletion", at: 1, by: "synthetic-other-device", deleted: true } } } } }
  ]
  const outcomes = []
  for (const fixture of fixtures) {
    const proposal = planInterimConversion(fixture.input, context)
    if (proposal.kind !== "inactive-proposal") {
      outcomes.push({ name: fixture.name, outcome: proposal })
      continue
    }
    const canonicalDecoders = proposal.documents.map(candidate => ({
      path: candidate.path,
      decoded: candidate.kind === "settings" ? decodeDocument(candidate.document, decodeSettings) : candidate.kind === "setup" ? decodeDocument(candidate.document, decodeSetup) : decodeDocument(candidate.document, decodeFilter)
    }))
    if (canonicalDecoders.some(value => value.decoded.kind !== "value")) throw new Error("Proposed canonical document failed its decoder")
    const receipt = { source: proposal.retention.source, note: proposal.note }
    if (!isJsonValue(receipt)) throw new Error("Receipt requires valid JSON source and local note")
    const serialized = JSON.stringify(receipt)
    const restarted = Bun.spawn([process.execPath, "--no-env-file", "--no-install", import.meta.filename, "--restart"], { stdin: new TextEncoder().encode(serialized), stdout: "pipe", stderr: "pipe" })
    const [readback, diagnostics, exit] = await Promise.all([new Response(restarted.stdout).text(), new Response(restarted.stderr).text(), restarted.exited])
    if (exit !== 0) throw new Error(`Synthetic restart failed: ${diagnostics}`)
    const restored: unknown = JSON.parse(readback)
    if (JSON.stringify(restored) !== serialized) throw new Error("Fresh process changed retained source or local note")
    outcomes.push({ name: fixture.name, outcome: proposal, canonicalDecoders, restart: { kind: "fresh-process-json-comparison", equal: true, restored, limitation: "JSON preservation only. No native storage or crash durability is proven." } })
  }
  process.stdout.write(JSON.stringify({ mode: "synthetic-inactive-only", outcomes, production: "not-connected", native: "waived-and-unproven" }, null, 2) + "\n")
}
