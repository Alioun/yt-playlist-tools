import { planInterimConversion } from "../../../src/background/store/interim-conversion"
import type { InterimConversionContext, InterimConversionInput } from "../../../src/background/store/interim-conversion"
import { openInterimRecoveryReview } from "../../../src/background/store/interim-recovery-review"
import type { RecoveryObservation } from "../../../src/background/store/interim-recovery-review"

export function observeInterimRecoveryReview() {
  const A = "AAAAAAAAAAAAAAAA", B = "BBBBBBBBBBBBBBBB", C = "CCCCCCCCCCCCCCCC"
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
  const source = {
    accountBodies: {
      [`account:${A}`]: { playlists: ["PL_SAME", "PL_SAME"], shortcutPlaylistId: "WL", filters: { PL_KEPT: { mode: "deny", enabled: false, channels: [channel] } }, labels: { [channel]: { title: "Synthetic channel", handle: "@synthetic" } }, cachedPlaylists: [], cachedAt: null },
      [`account:${C}`]: { playlists: ["PL_SAME"], shortcutPlaylistId: "WL", filters: {}, labels: {}, cachedPlaylists: [], cachedAt: null }
    },
    savedAccountKeys: [B, B], legacyClaimed: true,
    globals: { playlists: ["PL_GLOBAL"], addToPlaylistID: "WL", channelFilters: { PL_ORPHAN: { mode: "allow", enabled: false, channels: [] } } }
  }
  const input: InterimConversionInput = { schema: 1, source, canonical: { documents: {}, caches: {}, device: undefined, unclaimed: null }, historicalAuthorization: { kind: "unknown" }, priorCredentialPresence: { kind: "unknown" } }
  const context: InterimConversionContext = { deviceId: "synthetic-device", at: 123, platform: { browser: "firefox", os: "linux" }, commands: [], interimShortcutId: "conv01", documentGenerations: { "doc:settings": "settings", [`doc:setup:${A}`]: "setup-A", [`doc:setup:${C}`]: "setup-C", [`doc:filter:${A}:PL_KEPT`]: "filter" } }
  const conversion = planInterimConversion(input, context)
  const current: RecoveryObservation = { captureId: "synthetic-retained-capture", schema: input.schema, conversion, canonical: input.canonical }
  const snapshot = () => ({ schema: input.schema, source: structuredClone(source), canonical: { documents: structuredClone(input.canonical.documents), caches: structuredClone(input.canonical.caches), device: { kind: "undefined" }, unclaimed: input.canonical.unclaimed }, historicalAuthorization: input.historicalAuthorization, priorCredentialPresence: input.priorCredentialPresence })
  const before = snapshot(), reader = openInterimRecoveryReview(current), opened = reader.read(current)
  if (opened.kind !== "review") throw new Error("Synthetic command could not open review")
  const restoreItem = opened.view.items.find(item => item.id.sourceKey === `account:${A}` && item.kind === "playlist" && item.id.path[1] === 1)
  const discardItem = opened.view.items.find(item => item.id.sourceKey === `account:${A}` && item.kind === "filter")
  if (!restoreItem || !discardItem) throw new Error("Synthetic command lost individual choices")
  const restoreDraft = reader.select({ current, item: restoreItem.id, intent: "restore" })
  const discardDraft = reader.select({ current, item: discardItem.id, intent: "discard" })
  const clearedDraft = reader.select({ current, item: restoreItem.id, intent: "none" })
  const after = snapshot()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Draft changed retained source or canonical records")
  const changed = { ...current, canonical: { ...current.canonical, unclaimed: { from: "1.5.0", autoAdd: ["PL_PENDING"], shortcutPlaylist: "WL", originalShortcutId: "orig01", filters: {}, at: 0 } } }
  const stale = reader.read(changed)
  const staleSelection = reader.select({ current: changed, item: discardItem.id, intent: "restore" })
  const returnedToOriginal = reader.read(current)
  const reopened = openInterimRecoveryReview(changed).read(changed)
  return { mode: "synthetic-read-only-item-review", before, conversion, opened, restoreDraft, discardDraft, clearedDraft, after, stale, staleSelection, returnedToOriginal, reopened,
    limitation: "In-memory comparison of caller-supplied evidence only. No native freshness, persistence, ownership or execution is proven.", production: "not-connected", native: "waived-and-unproven" }
}

if (import.meta.main) process.stdout.write(JSON.stringify(observeInterimRecoveryReview(), null, 2) + "\n")
