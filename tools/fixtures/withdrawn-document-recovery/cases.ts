// Shared setup for src/background/store/withdrawn-document-recovery.*.bun-test.ts.
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { consentObject } from "../../../src/background/store/consent-withdrawal"
import { recoveryUi } from "../interim-recovery-review/run"
import {
  createWithdrawnFilterInput,
  createWithdrawnFilterHarness,
  heldReady,
  selectFilter,
  type FilterStores,
  createWithdrawnPlaylistInput,
  createWithdrawnPlaylistHarness,
  selectPlaylist
} from "./run"
import type { JsonObject } from "../../../src/shared/contracts/json"
import type { RetainedPlaylistExecution, AcceptedPlaylistRecord } from "../../../src/background/store/withdrawn-document-recovery"
import { createInstalledPlaylistInput } from "./v3-playlist"

export const stages = ["register", "prepare", "authorize", "documents", "retire", "record", "done"] as const
let playlistInput: ReturnType<typeof createWithdrawnPlaylistInput> | undefined
export function playlistFixture() {
  return (playlistInput ??= createWithdrawnPlaylistInput())
}
export async function openPlaylist(stores?: FilterStores) {
  const f = createWithdrawnPlaylistHarness(stores ?? (await playlistFixture()).stores),
    owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  return { ...f, owner, ...(await selectPlaylist(owner)) }
}
export async function recoverPlaylist(f: Awaited<ReturnType<typeof openPlaylist>>) {
  return f.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection })
}
export function playlistExecution(result: Awaited<ReturnType<typeof recoverPlaylist>>): RetainedPlaylistExecution {
  if (result.kind === "recovered" && result.completion.operation === "retained-playlist-restore") return result.completion.result
  if (result.kind === "authorized-pending" && "identity" in result.observation && result.observation.identity.operation.kind === "retained-playlist-restore") {
    const identity = { ...result.observation.identity, operation: result.observation.identity.operation }
    const execution = result.observation
    if (execution.kind === "confirmed") return { ...execution, identity }
    if (execution.kind === "failed") return { ...execution, identity }
    if (execution.kind === "unconfirmed") return { ...execution, identity }
    if (execution.kind === "unavailable") return { ...execution, identity }
    if (execution.kind === "preflight-failed") return { ...execution, identity }
  }
  throw new Error("Missing operation-correlated playlist execution")
}
let input: ReturnType<typeof createWithdrawnFilterInput> | undefined
export function fixture() {
  return (input ??= createWithdrawnFilterInput())
}
export async function open(stores?: FilterStores) {
  const f = createWithdrawnFilterHarness(stores ?? (await fixture()).stores),
    owner = createStartingLocalFilterWriter(f.h.deps)
  const readiness = await heldReady(owner),
    selected = await selectFilter(owner)
  return { ...f, owner, readiness, ...selected }
}
export function execution(result: Awaited<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["recoverWithdrawnWork"]>>) {
  if (result.kind === "recovered" && result.completion.operation === "retained-filter-replacement") return result.completion.result
  if (result.kind === "authorized-pending" && result.job.operation.kind === "retained-filter-replacement" && "mutations" in result.observation) return result.observation
  throw new Error("Missing operation-correlated filter execution")
}
export async function recover(f: Awaited<ReturnType<typeof open>>) {
  return f.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection })
}

let installedInput: ReturnType<typeof createInstalledPlaylistInput> | undefined
export function installedFixture() {
  return (installedInput ??= createInstalledPlaylistInput())
}
export function installedBasis(record: AcceptedPlaylistRecord) {
  const basis = record.basis.checkpoint
  if (basis.v !== 3) throw new Error("Installed-V3 basis required")
  return basis
}
export function contractCompleted(accepted: AcceptedPlaylistRecord): JsonObject {
  const value: unknown = { ...accepted, resolutions: [...accepted.resolutions, { kind: "playlist-restored", effect: accepted.pending.effect }], pending: { kind: "none" } }
  if (!consentObject(value)) throw new Error("Completed playlist must be JSON")
  return value
}
export function fixedDocuments(accepted: AcceptedPlaylistRecord): JsonObject {
  const effect = accepted.pending.effect
  return { [`doc:setup:${effect.key.acct}`]: effect.after, ...(effect.history.after.kind === "present" ? { sync: effect.history.after.raw } : {}) }
}
export function offersPlaylist(review: Awaited<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["readWithdrawnWork"]>>) {
  return review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")
}
export const outbound = ["stamp", "generation", "sync-get", "sync-set", "sync-subscribe", "timer"]
